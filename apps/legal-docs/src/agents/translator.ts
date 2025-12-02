import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface TranslatedClause {
  clause_number: string;
  title_en: string;
  title_es: string;
  body_en: string;
  body_es: string;
}

const prompt = `You are a legal translator specialized in contract translation.

Input: legal document clauses in English.

Task: translate to Spanish preserving structure, clause numbers and titles.

Return JSON array:

[
  {
    "clause_number": "1.1",
    "title_en": "...",
    "title_es": "...",
    "body_en": "...",
    "body_es": "..."
  }
]

Do NOT summarize. Do NOT omit content. Preserve all legal terminology and structure.`;

export async function translatorAgent(originalText: string): Promise<TranslatedClause[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are a professional legal translator. Return ONLY valid JSON array, no additional text.",
        },
        {
          role: "user",
          content: `${prompt}\n\nDOCUMENT:\n${originalText.substring(0, 8000)}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI no devolvió contenido");
    }

    // Limpiar JSON si viene con markdown
    let jsonText = content.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(jsonText);
    
    // Si viene como objeto con clave "clauses" o similar
    const clauses = parsed.clauses || parsed.items || (Array.isArray(parsed) ? parsed : [parsed]);
    
    return clauses as TranslatedClause[];
  } catch (error) {
    console.error("Error en traducción:", error);
    // Fallback: retornar estructura básica
    return [
      {
        clause_number: "1",
        title_en: "Document",
        title_es: "Documento",
        body_en: originalText.substring(0, 500),
        body_es: originalText.substring(0, 500),
      },
    ];
  }
}

