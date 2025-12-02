import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  const startTime = Date.now();
  const timeout = 90000; // 90 segundos timeout (más tiempo para análisis complejo)
  
  try {
    // Construir texto del documento
    const documentText = translatedClauses
      .map((c) => `${c.clause_number}. ${c.title_es}\n${c.body_es}`)
      .join("\n\n")
      .substring(0, 10000); // Reducir tamaño para evitar timeouts

    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 3000, // Limitar tokens de respuesta
        timeout: timeout,
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
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Distribution analysis timeout after 90s")), timeout)
      )
    ]) as any;
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[DISTRIBUTION ANALYZER] Completed in ${duration}s`);

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

