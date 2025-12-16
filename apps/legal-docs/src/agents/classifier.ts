import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      .substring(0, 6000);

    const startTime = Date.now();
    const timeout = 30000; // 30 segundos timeout (clasificación es rápida)
    
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 500, // Clasificación es corta
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
      }, { timeout }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Classification timeout after 30s")), timeout)
      )
    ]) as any;
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[CLASSIFIER] Completed in ${duration}s`);

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

