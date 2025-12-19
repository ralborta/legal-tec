import OpenAI from "openai";

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

export type DocumentType = 
  | "distribution_contract"
  | "service_contract"
  | "license_agreement"
  | "nda"
  | "purchase_agreement"
  | "other";

const prompt = `You are a legal document classifier.

Analyze the following translated legal document clauses and determine the document type.

DOCUMENT TYPES:
- distribution_contract: Distribution agreements, reseller contracts, dealer agreements
- service_contract: Service provision agreements, consulting contracts
- license_agreement: Software licenses, IP licenses, trademark licenses
- nda: Non-disclosure agreements, confidentiality agreements
- purchase_agreement: Purchase and sale agreements, supply agreements
- other: Any other type of legal document

Return JSON:
{
  "type": "distribution_contract" | "service_contract" | "license_agreement" | "nda" | "purchase_agreement" | "other",
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation"
}`;

export async function classifierAgent(
  translatedClauses: Array<{ clause_number: string; title_es: string; body_es: string }>
): Promise<{ type: DocumentType; confidence: string; reasoning: string }> {
  try {
    // Construir texto del documento desde las cláusulas traducidas
    const documentText = translatedClauses
      .map((c) => `${c.clause_number}. ${c.title_es}\n${c.body_es}`)
      .join("\n\n")
      .substring(0, 4000); // Reducido de 6000 a 4000

    const responsePromise = openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 200, // Respuesta corta (solo type, confidence, reasoning)
      messages: [
        {
          role: "system",
          content: "You are a legal document classifier. Return ONLY valid JSON, no additional text.",
        },
        {
          role: "user",
          content: `${prompt}\n\nDOCUMENT:\n${documentText}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Timeout de 30 segundos
    const response = await withTimeout(responsePromise, 30000);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI no devolvió contenido");
    }

    let jsonText = content.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(jsonText);
    
    return {
      type: parsed.type || "other",
      confidence: parsed.confidence || "medium",
      reasoning: parsed.reasoning || "",
    };
  } catch (error) {
    console.error("Error en clasificación:", error);
    return {
      type: "other",
      confidence: "low",
      reasoning: "Error during classification",
    };
  }
}

