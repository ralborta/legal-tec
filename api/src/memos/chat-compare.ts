import OpenAI from "openai";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CompareChatInput = {
  comparisonText?: string; // Texto completo del análisis comparativo
  messages: ChatMessage[]; // Historial de la conversación
  areaLegal?: string; // Área legal para contexto
  documentIdA?: string; // ID del documento A
  documentIdB?: string; // ID del documento B
  documentTextA?: string; // Texto del Documento A (extracto)
  documentTextB?: string; // Texto del Documento B (extracto)
};

export type CompareChatOutput = {
  message: string;
};

/**
 * Chat conversacional sobre análisis comparativo de documentos legales
 * La IA actúa como asistente jurídico que ayuda a entender y trabajar sobre la comparación
 */
export async function chatCompare(
  openaiKey: string,
  input: CompareChatInput
): Promise<CompareChatOutput> {
  const openai = new OpenAI({ apiKey: openaiKey });

  const hasComparison = input.comparisonText && input.comparisonText.trim().length > 0;
  const hasDocA = input.documentTextA && input.documentTextA.trim().length > 0;
  const hasDocB = input.documentTextB && input.documentTextB.trim().length > 0;

  const truncateText = (text: string, maxChars: number): string => {
    if (!text || text.length <= maxChars) return text || "";
    const sliced = text.slice(0, maxChars);
    const lastBreak = Math.max(sliced.lastIndexOf("\n"), sliced.lastIndexOf(". "));
    if (lastBreak > maxChars * 0.8) {
      return `${sliced.slice(0, lastBreak)}\n\n[... texto truncado ...]`;
    }
    return `${sliced}\n\n[... texto truncado ...]`;
  };

  const systemPrompt = `Sos un abogado argentino senior de WNS & Asociados, actuando como asistente jurídico conversacional especializado en ANÁLISIS COMPARATIVO DE DOCUMENTOS LEGALES.

CONTEXTO:
- Se ha realizado un ANÁLISIS COMPARATIVO JURÍDICO de dos documentos legales
- Tenés acceso al análisis comparativo completo, incluyendo: resumen ejecutivo comparativo, análisis por aspectos, evaluación comparativa, análisis de riesgos, legalidad, recomendaciones y conclusión
- Tu rol es ayudar al abogado a ENTENDER y TRABAJAR sobre esta comparación

INFORMACIÓN DE LA COMPARACIÓN:
- Documento A: ${input.documentIdA || "No especificado"}
- Documento B: ${input.documentIdB || "No especificado"}
- Área legal: ${input.areaLegal || "No especificada"}

REGLAS FUNDAMENTALES:
- Siempre asumí que el usuario se refiere a ESTA comparación y ESTE análisis, salvo que indique lo contrario
- Usá toda la información contenida en el análisis comparativo: ventajas, desventajas, riesgos, recomendaciones
- Si un dato específico NO aparece en el análisis comparativo ni en los extractos de los documentos, decilo explícitamente y pedí el dato faltante
- Compará siempre ambos documentos cuando sea relevante

CAPACIDADES:
- Explicar diferencias específicas entre los documentos
- Aclarar dudas sobre el análisis comparativo
- Profundizar en los riesgos identificados de cada documento
- Sugerir acciones concretas basadas en las recomendaciones
- Identificar cuál documento es más favorable en aspectos específicos
- Explicar las implicancias jurídicas de las diferencias
- Sugerir qué cláusulas combinar o qué evitar de cada documento

SI EL USUARIO PREGUNTA SOBRE:
- Diferencias: Explicá qué establece cada documento, las diferencias y sus implicancias
- Ventajas/Desventajas: Detallá las ventajas y desventajas de cada documento en el aspecto consultado
- Riesgos: Compará los riesgos de cada documento y su nivel de gravedad
- Recomendaciones: Desarrollá la recomendación con pasos concretos
- Cuál es mejor: Proporcioná una evaluación comparativa clara y fundamentada

SIEMPRE QUE SEA POSIBLE, terminá tu respuesta con:

"Acciones sugeridas:"
• [Acción concreta 1]
• [Acción concreta 2]

ESTILO:
- Profesional, claro y directo
- Enfocado en "qué hacer" y "cómo proceder"
- Comparativo: siempre mencioná ambos documentos cuando sea relevante
- Citá artículos y normativa cuando corresponda
- No inventes hechos, nombres o cláusulas que no estén en el texto provisto`;

  // Construir el contexto completo
  let contextPrompt = "";

  if (hasComparison) {
    contextPrompt += `ANÁLISIS COMPARATIVO DE LOS DOCUMENTOS:
${truncateText(input.comparisonText || "", 12000)}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  if (hasDocA) {
    contextPrompt += `DOCUMENTO A (extracto):
${truncateText(input.documentTextA || "", 8000)}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  if (hasDocB) {
    contextPrompt += `DOCUMENTO B (extracto):
${truncateText(input.documentTextB || "", 8000)}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  // Si no hay ningún contexto, no dejar que el modelo afirme que "ve" la comparación o los documentos
  if (!contextPrompt.trim() && input.messages.length > 0) {
    const lastUserMessage = input.messages[input.messages.length - 1];
    const lastContent = lastUserMessage?.role === "user" ? lastUserMessage.content : "";
    contextPrompt = `IMPORTANTE: No se recibió el análisis comparativo ni los textos de los documentos. No inventes contenido. Responde únicamente algo como: "No pude cargar el análisis comparativo ni los documentos en este momento. Por favor, recargá la página o volvé a ejecutar la comparación y probá de nuevo en el chat."\n\nConsulta del usuario: ${lastContent}`;
  }

  // Construir historial de conversación
  const conversationHistory = input.messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));

  // Construir el prompt final
  const userPrompt = `${contextPrompt}El usuario tiene una pregunta o consulta sobre esta comparación de documentos legales.

Historial de la conversación:
${conversationHistory.map((msg, i) => `${msg.role === "user" ? "Usuario" : "Asistente"}: ${msg.content}`).join("\n\n")}

Responde de forma profesional, clara y útil, basándote en el análisis comparativo completo mostrado arriba.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 1500,
  });

  const message = response.choices[0]?.message?.content || "No pude generar una respuesta. Por favor, intenta de nuevo.";

  return { message };
}
