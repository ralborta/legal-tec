import OpenAI from "openai";
import type { DistributionChecklistItem } from "./analyzerDistribution.js";
import type { TranslatedClause } from "./translator.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      .substring(0, 8000);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "You are a legal report generator. Return ONLY the report text in Spanish, professional format.",
        },
        {
          role: "user",
          content: `${prompt}

TIPO DE DOCUMENTO: ${input.type}

TEXTO ORIGINAL (primeros caracteres):
${input.original.substring(0, 3000)}

CLÁUSULAS TRADUCIDAS:
${translatedText}

CHECKLIST DE ANÁLISIS:
${checklistText}`,
        },
      ],
    });

    const report = response.choices[0]?.message?.content || "No se pudo generar el reporte.";
    return report;
  } catch (error) {
    console.error("Error generando reporte:", error);
    return `Error al generar reporte: ${error instanceof Error ? error.message : "Error desconocido"}`;
  }
}

