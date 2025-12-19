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

Return JSON object with "clauses" array:

{
  "clauses": [
    {
      "clause_number": "1.1",
      "title_en": "...",
      "title_es": "...",
      "body_en": "...",
      "body_es": "..."
    }
  ]
}

Do NOT summarize. Do NOT omit content. Preserve all legal terminology and structure.`;

// Helper para timeout
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

export async function translatorAgent(originalText: string): Promise<TranslatedClause[]> {
  try {
    const textToProcess = originalText.substring(0, 5000); // Reducido de 8000 a 5000
    
    const responsePromise = openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 4000, // Limitar respuesta para acelerar
      messages: [
        {
          role: "system",
          content: "You are a professional legal translator. Return ONLY valid JSON object with 'clauses' array, no additional text.",
        },
        {
          role: "user",
          content: `${prompt}\n\nDOCUMENT:\n${textToProcess}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Timeout de 40 segundos
    const response = await withTimeout(responsePromise, 40000);

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
    
    // Extraer clauses del objeto JSON
    const clauses = parsed.clauses || parsed.items || [];
    
    if (!Array.isArray(clauses) || clauses.length === 0) {
      // Fallback: crear una cláusula simple
      return [
        {
          clause_number: "1",
          title_en: "Document",
          title_es: "Documento",
          body_en: textToProcess.substring(0, 500),
          body_es: textToProcess.substring(0, 500),
        },
      ];
    }
    
    return clauses as TranslatedClause[];
  } catch (error) {
    console.error("Error en traducción:", error);
    // Fallback: retornar estructura básica
    const textToProcess = originalText.substring(0, 500);
    return [
      {
        clause_number: "1",
        title_en: "Document",
        title_es: "Documento",
        body_en: textToProcess,
        body_es: textToProcess,
      },
    ];
  }
}

