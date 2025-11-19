import OpenAI from "openai";
import { writeFileSync, unlinkSync, createReadStream } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getSystemPromptForArea, type LegalArea } from "./legal-areas.js";
import { formatMemoProfesional } from "./format-memo.js";

export type MemoInputDirect = {
  tipoDocumento: string;
  titulo: string;
  instrucciones: string;
  areaLegal?: LegalArea; // Nueva: área legal especializada
  pdfBuffer?: Buffer;
  pdfFilename?: string;
};

export type MemoOutput = {
  titulo: string;
  tipo_documento: string;
  resumen: string;
  puntos_tratados: string[];
  analisis_juridico: string;
  proximos_pasos: string[];
  riesgos: string[];
  texto_formateado: string;
  citas?: Array<{
    tipo: "normativa" | "jurisprudencia" | "doctrina" | "otra";
    referencia: string;
    descripcion?: string;
    url?: string;
  }>;
};

/**
 * Genera un memo jurídico argentino pasando el PDF directamente a OpenAI
 * Usa la API de Files de OpenAI para manejar el PDF sin extraer texto
 */
export async function generarMemoJuridicoDirect(
  openaiKey: string,
  input: MemoInputDirect
): Promise<MemoOutput> {
  const openai = new OpenAI({ apiKey: openaiKey });

  // Usar prompt especializado según el área legal
  const areaLegal = input.areaLegal || "civil_comercial";
  const systemPrompt = getSystemPromptForArea(areaLegal, input.tipoDocumento);

  try {
    let fileId: string | undefined;
    
    // Si hay PDF, subirlo a OpenAI Files API
    if (input.pdfBuffer && input.pdfFilename) {
      // Crear archivo temporal para subir a OpenAI
      // El SDK de OpenAI en Node.js funciona mejor con ReadStream
      const tempPath = join(tmpdir(), `pdf-${Date.now()}-${input.pdfFilename}`);
      let tempFileCreated = false;
      
      try {
        // Escribir Buffer a archivo temporal
        writeFileSync(tempPath, input.pdfBuffer);
        tempFileCreated = true;
        
        // Crear ReadStream desde el archivo temporal
        const fileStream = createReadStream(tempPath);
        
        // Subir a OpenAI
        const file = await openai.files.create({
          file: fileStream,
          purpose: "assistants"
        });
        fileId = file.id;
      } catch (uploadError) {
        throw new Error(`Error al subir PDF a OpenAI: ${uploadError instanceof Error ? uploadError.message : "Error desconocido"}`);
      } finally {
        // Limpiar archivo temporal
        if (tempFileCreated) {
          try {
            unlinkSync(tempPath);
          } catch (cleanupError) {
            // Ignorar errores de limpieza
            console.warn("No se pudo eliminar archivo temporal:", tempPath);
          }
        }
      }
    }

    const userPrompt = `Instrucciones del abogado:

Título sugerido: ${input.titulo}

Detalles adicionales:
${input.instrucciones}

${input.pdfBuffer ? "Por favor, lee el PDF adjunto que contiene la transcripción de la reunión." : "No se proporcionó transcripción, solo instrucciones."}`;

    // Usar Chat Completions con vision si hay PDF
    // Nota: GPT-4o-mini no soporta vision, necesitamos gpt-4o o gpt-4-turbo
    // Alternativa: usar Assistants API que maneja archivos mejor
    
    if (fileId) {
      // Opción 1: Usar Assistants API (mejor para archivos)
      const assistant = await openai.beta.assistants.create({
        name: "Memo Jurídico Generator",
        instructions: systemPrompt,
        model: "gpt-4o-mini",
        tools: [{ type: "file_search" }]
      });

      const thread = await openai.beta.threads.create({});
      
      // Agregar mensaje con archivo adjunto
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: userPrompt,
        attachments: [
          {
            file_id: fileId!,
            tools: [{ type: "file_search" }]
          }
        ]
      });

      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id
      });

      // Esperar a que termine
      let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      while (runStatus.status === "queued" || runStatus.status === "in_progress") {
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      }

      if (runStatus.status !== "completed") {
        throw new Error(`Run falló con status: ${runStatus.status}`);
      }

      const messages = await openai.beta.threads.messages.list(thread.id);
      const lastMessage = messages.data[0];
      const content = lastMessage.content[0];
      
      if (content.type !== "text") {
        throw new Error("Respuesta no es texto");
      }

      const responseText = content.text.value;
      
      // Limpiar y parsear JSON
      let jsonText = responseText.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const firstBrace = jsonText.indexOf("{");
      const lastBrace = jsonText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(jsonText) as MemoOutput;
      
      // Limpiar archivo
      await openai.files.del(fileId);
      
      // Asegurar arrays
      parsed.puntos_tratados = parsed.puntos_tratados || [];
      parsed.proximos_pasos = parsed.proximos_pasos || [];
      parsed.riesgos = parsed.riesgos || [];
      parsed.citas = parsed.citas || [];

      return parsed;
    } else {
      // Sin PDF, usar Chat Completions normal
      const chat = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      });

      const content = chat.choices[0].message?.content;
      if (!content) {
        throw new Error("OpenAI no devolvió contenido");
      }

      let jsonText = content.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const firstBrace = jsonText.indexOf("{");
      const lastBrace = jsonText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(jsonText) as MemoOutput;
      parsed.puntos_tratados = parsed.puntos_tratados || [];
      parsed.proximos_pasos = parsed.proximos_pasos || [];
      parsed.riesgos = parsed.riesgos || [];
      parsed.citas = parsed.citas || [];

      return parsed;
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Error al parsear JSON de OpenAI: ${error.message}`);
    }
    throw error;
  }
}

