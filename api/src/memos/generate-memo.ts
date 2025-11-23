import OpenAI from "openai";
import { getSystemPromptForArea, detectarAreaLegal, type LegalArea } from "./legal-areas.js";
import type { MemoOutput } from "./types.js";
import { sugerirDocumentosParaMemo } from "./suggestions.js";

export type MemoInput = {
  tipoDocumento: string;
  titulo: string;
  instrucciones: string;
  transcriptText: string;
  areaLegal?: LegalArea; // Nueva: área legal especializada
};

// Re-exportar MemoOutput desde types.ts para compatibilidad
export type { MemoOutput };

/**
 * Genera un memo jurídico argentino a partir de una transcripción y instrucciones
 */
export async function generarMemoJuridico(
  openaiKey: string,
  input: MemoInput
): Promise<MemoOutput> {
  const openai = new OpenAI({ apiKey: openaiKey });

  // Detectar área legal automáticamente si no se proporciona
  let areaLegal: LegalArea = input.areaLegal || "civil_comercial";
  if (!input.areaLegal) {
    try {
      areaLegal = await detectarAreaLegal(
        openaiKey,
        input.titulo,
        input.instrucciones,
        input.transcriptText
      );
      console.log(`[MEMO GENERATE] Área legal detectada automáticamente: ${areaLegal}`);
    } catch (error) {
      console.warn("Error al detectar área legal, usando civil_comercial por defecto:", error);
      areaLegal = "civil_comercial";
    }
  }

  // Usar prompt especializado según el área legal
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

    // Agregar área legal al memo (si no viene en la respuesta de OpenAI)
    if (!parsed.areaLegal) {
      parsed.areaLegal = areaLegal;
    }

    // Agregar documentos sugeridos basados en el contenido del memo
    parsed.documentos_sugeridos = sugerirDocumentosParaMemo(parsed);

    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Error al parsear JSON de OpenAI: ${error.message}`);
    }
    throw error;
  }
}

