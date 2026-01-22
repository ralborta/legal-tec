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
- NO digas nunca "no tengo acceso a la comparación". El análisis completo está en el contexto
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
- Citá artículos y normativa cuando corresponda`;

  // Construir el contexto completo
  let contextPrompt = "";

  if (hasComparison) {
    contextPrompt += `ANÁLISIS COMPARATIVO DE LOS DOCUMENTOS:
${input.comparisonText}

───────────────────────────────────────────────────────────────────────────────

`;
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
