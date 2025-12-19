import OpenAI from "openai";
import type { DistributionChecklistItem } from "./analyzerDistribution.js";
import type { TranslatedClause } from "./translator.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper para timeout
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

interface ReportInput {
  original: string;
  translated: TranslatedClause[];
  type: string;
  checklist: { items?: DistributionChecklistItem[] } | null;
}

const prompt = `You are a legal report generator for WNS & Asociados.

Generate a comprehensive legal analysis report in Spanish based on:

1. Original document text (English)
2. Translated clauses (Spanish)
3. Document type classification
4. Analysis checklist (if available)

The report should include:

- Executive summary
- Document type and key characteristics
- Critical clauses analysis
- Risk assessment
- Recommendations for the client (DISTRIBUTOR perspective)
- Action items

Format: Professional legal report in Spanish, structured with clear sections.

Return ONLY the report text, no JSON, no markdown headers.`;

export async function generateReport(input: ReportInput): Promise<string> {
  try {
    const checklistText = input.checklist?.items
      ? input.checklist.items
          .map(
            (item) =>
              `- ${item.key}: ${item.found} (Riesgo: ${item.risk})\n  ${item.comment}`
          )
          .join("\n\n")
      : "No checklist disponible";

    const translatedText = input.translated
      .map((c) => `${c.clause_number}. ${c.title_es}\n${c.body_es}`)
      .join("\n\n")
      .substring(0, 5000); // Reducido de 8000 a 5000

    const responsePromise = openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 2000, // Limitar tamaño del reporte para acelerar
      messages: [
        {
          role: "system",
          content: "You are a legal report generator. Return ONLY the report text in Spanish, professional format. Be concise but comprehensive.",
        },
        {
          role: "user",
          content: `${prompt}

TIPO DE DOCUMENTO: ${input.type}

TEXTO ORIGINAL (primeros caracteres):
${input.original.substring(0, 2000)} // Reducido de 3000 a 2000

CLÁUSULAS TRADUCIDAS:
${translatedText}

CHECKLIST DE ANÁLISIS:
${checklistText}`,
        },
      ],
    });

    // Timeout de 50 segundos (generación de reporte puede ser más lenta)
    const response = await withTimeout(responsePromise, 50000);

    const report = response.choices[0]?.message?.content || "No se pudo generar el reporte.";
    return report;
  } catch (error) {
    console.error("Error generando reporte:", error);
    return `Error al generar reporte: ${error instanceof Error ? error.message : "Error desconocido"}`;
  }
}

