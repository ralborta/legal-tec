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

export interface DistributionChecklistItem {
  key: string;
  found: "yes" | "no" | "partial";
  clauses: string[];
  text: string;
  risk: "low" | "medium" | "high";
  comment: string;
}

const prompt = `You are LegalAnalyzer for distribution contracts from the perspective of the DISTRIBUTOR.

Given the contract clauses in SPANISH, identify and analyze:

1. Sales targets (obligations, consequences for not meeting them)
2. Termination without cause
3. Inventory / No inventory buy back (obligación o no del proveedor de recomprar stock)
4. Payment terms and penalties for late payment
5. Choice of law and jurisdiction / arbitration
6. After-sales obligations and customer complaints/returns
7. Intellectual property: use of BASEUS trademarks and logos
8. Territorial restrictions and sales outside the assigned territory

For each item return JSON:

{
  "key": "salesTargets" | "terminationWithoutCause" | "inventoryBuyBack" | "paymentTerms" | "jurisdiction" | "afterSales" | "intellectualProperty" | "territorialRestrictions",
  "found": "yes" | "no" | "partial",
  "clauses": ["5.1", "5.2"],
  "text": "texto relevante en español",
  "risk": "low" | "medium" | "high",
  "comment": "breve análisis jurídico desde el punto de vista del DISTRIBUIDOR"
}

Return a JSON object:

{
  "items": [ ...8 items... ]
}`;

export async function runDistributionAnalyzer(
  translatedClauses: Array<{ clause_number: string; title_es: string; body_es: string }>
): Promise<{ items: DistributionChecklistItem[] }> {
  try {
    // Construir texto del documento
    const documentText = translatedClauses
      .map((c) => `${c.clause_number}. ${c.title_es}\n${c.body_es}`)
      .join("\n\n")
      .substring(0, 8000); // Reducido de 12000 a 8000

    const responsePromise = openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 3000, // Limitar respuesta (8 items con análisis)
      messages: [
        {
          role: "system",
          content: "You are a legal analyst specialized in distribution contracts. Return ONLY valid JSON, no additional text.",
        },
        {
          role: "user",
          content: `${prompt}\n\nCONTRACT CLAUSES:\n${documentText}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Timeout de 45 segundos (análisis más complejo)
    const response = await withTimeout(responsePromise, 45000);

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
      items: parsed.items || [],
    };
  } catch (error) {
    console.error("Error en análisis de distribución:", error);
    // Retornar checklist vacío en caso de error
    return {
      items: [],
    };
  }
}

