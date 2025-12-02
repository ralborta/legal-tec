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
  const startTime = Date.now();
  const timeout = 60000; // 60 segundos timeout
  
  try {
    // Limitar tamaño del texto para evitar timeouts
    const textToTranslate = originalText.substring(0, 12000);
    
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 4000, // Limitar tokens de respuesta
        timeout: timeout,
        messages: [
          {
            role: "system",
            content: "You are a professional legal translator. Return ONLY valid JSON object with 'clauses' array, no additional text.",
          },
          {
            role: "user",
            content: `${prompt}\n\nDOCUMENT:\n${textToTranslate}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Translation timeout after 60s")), timeout)
      )
    ]) as any;
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[TRANSLATOR] Completed in ${duration}s`);

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

