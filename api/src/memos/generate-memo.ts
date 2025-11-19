import OpenAI from "openai";
import { getSystemPromptForArea, type LegalArea } from "./legal-areas.js";

export type MemoInput = {
  tipoDocumento: string;
  titulo: string;
  instrucciones: string;
  transcriptText: string;
  areaLegal?: LegalArea; // Nueva: área legal especializada
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
    referencia: string; // Ej: "Art. 765 CCyC", "Ley 26.994"
    descripcion?: string; // Descripción breve
    url?: string; // URL si está disponible
  }>;
};

/**
 * Genera un memo jurídico argentino a partir de una transcripción y instrucciones
 */
export async function generarMemoJuridico(
  openaiKey: string,
  input: MemoInput
): Promise<MemoOutput> {
  const openai = new OpenAI({ apiKey: openaiKey });

  // Usar prompt especializado según el área legal
  const areaLegal = input.areaLegal || "civil_comercial";
  const systemPrompt = getSystemPromptForArea(areaLegal, input.tipoDocumento);

  const transcriptSection = input.transcriptText.trim()
    ? `Transcripción de la reunión:\n${input.transcriptText}`
    : "No se proporcionó transcripción, solo instrucciones.";

  const userPrompt = `${transcriptSection}

Instrucciones del abogado:

Título sugerido: ${input.titulo}

Detalles adicionales:
${input.instrucciones}`;

  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Modelo económico, fácil de cambiar a gpt-4o o gpt-4-turbo
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

    // Limpiar el JSON si viene con markdown o texto extra
    let jsonText = content.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Buscar el primer { y último } si hay texto extra
    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(jsonText) as MemoOutput;

    // Validar estructura mínima
    if (!parsed.titulo || !parsed.texto_formateado) {
      throw new Error("Respuesta de OpenAI incompleta: faltan campos requeridos");
    }

    // Asegurar arrays
    parsed.puntos_tratados = parsed.puntos_tratados || [];
    parsed.proximos_pasos = parsed.proximos_pasos || [];
    parsed.riesgos = parsed.riesgos || [];
    parsed.citas = parsed.citas || [];

    // Validar que citas sea un array
    if (!Array.isArray(parsed.citas)) {
      parsed.citas = [];
    }

    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Error al parsear JSON de OpenAI: ${error.message}`);
    }
    throw error;
  }
}

