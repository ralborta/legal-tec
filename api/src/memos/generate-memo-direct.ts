import OpenAI from "openai";

export type MemoInputDirect = {
  tipoDocumento: string;
  titulo: string;
  instrucciones: string;
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

  const systemPrompt = `Sos un abogado argentino senior, especialista en derecho civil, comercial y societario,
que trabaja para el estudio WNS & Asociados.

Tu tarea es elaborar un ${input.tipoDocumento} a partir de la transcripción de una reunión (en el PDF adjunto)
y las instrucciones del abogado.

Lineamientos:

- Actuás como un abogado argentino real, no como un asistente genérico.
- Usás lenguaje jurídico claro, profesional y conciso.
- Te basás EXCLUSIVAMENTE en la transcripción del PDF y las instrucciones: no inventes hechos ni acuerdos que no estén.
- Si falta información relevante, señalalo explícitamente como "Punto a confirmar".
- Tené en cuenta la prelación normativa argentina y el art. 2 del CCyC:
  considerá el texto legal, su finalidad, normas análogas, tratados de derechos humanos vigentes,
  principios y coherencia del sistema.
- Cuando cites normas, hacelo de forma responsable. Si no estás seguro, indicá
  "sujeto a verificación de normativa vigente".

Devolvé SIEMPRE un JSON válido, sin texto extra, con esta estructura:

{
  "titulo": string,
  "tipo_documento": string,
  "resumen": string,
  "puntos_tratados": string[],
  "analisis_juridico": string,
  "proximos_pasos": string[],
  "riesgos": string[],
  "texto_formateado": string
}

- "texto_formateado" debe ser el memo completo listo para copiar en Word.
- No incluyas explicaciones fuera del JSON.`;

  try {
    let fileId: string | undefined;
    
    // Si hay PDF, subirlo a OpenAI Files API
    if (input.pdfBuffer && input.pdfFilename) {
      // El SDK de OpenAI en Node.js acepta Buffer directamente
      // Pero necesitamos pasarlo con el nombre del archivo
      // Usar el Buffer directamente - el SDK lo manejará
      const file = await openai.files.create({
        file: input.pdfBuffer,
        purpose: "assistants"
      } as any);
      fileId = file.id;
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

      return parsed;
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Error al parsear JSON de OpenAI: ${error.message}`);
    }
    throw error;
  }
}

