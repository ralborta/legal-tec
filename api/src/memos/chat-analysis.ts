import OpenAI from "openai";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AnalysisChatInput = {
  analysisText?: string; // Texto completo del análisis
  messages: ChatMessage[]; // Historial de la conversación
  areaLegal?: string; // Área legal para contexto
  jurisdiccion?: string; // Jurisdicción del documento
  tipoDocumento?: string; // Tipo de documento analizado
  citas?: Array<{
    tipo: string;
    referencia: string;
    descripcion?: string;
    url?: string;
  }>;
  riesgos?: Array<{
    descripcion: string;
    nivel: string;
    recomendacion?: string;
  }>;
};

export type AnalysisChatOutput = {
  message: string;
};

/**
 * Chat conversacional sobre análisis de documentos legales
 * La IA actúa como asistente jurídico que ayuda a entender y trabajar sobre el documento analizado
 */
export async function chatAnalysis(
  openaiKey: string,
  input: AnalysisChatInput
): Promise<AnalysisChatOutput> {
  const openai = new OpenAI({ apiKey: openaiKey });

  const hasAnalysis = input.analysisText && input.analysisText.trim().length > 0;
  const hasCitas = input.citas && input.citas.length > 0;
  const hasRiesgos = input.riesgos && input.riesgos.length > 0;

  const systemPrompt = `Sos un abogado argentino senior de WNS & Asociados, actuando como asistente jurídico conversacional especializado en ANÁLISIS DE DOCUMENTOS LEGALES.

CONTEXTO:
- Se ha realizado un ANÁLISIS LEGAL de un documento (contrato, acuerdo, escritura, etc.)
- Tenés acceso al análisis completo, incluyendo: resumen ejecutivo, cláusulas analizadas, análisis jurídico, riesgos identificados, recomendaciones y citas legales.
- Tu rol es ayudar al abogado a ENTENDER y TRABAJAR sobre este documento analizado.

INFORMACIÓN DEL DOCUMENTO:
- Tipo de documento: ${input.tipoDocumento || "No especificado"}
- Jurisdicción: ${input.jurisdiccion || "No especificada"}
- Área legal: ${input.areaLegal || "No especificada"}

REGLAS FUNDAMENTALES:
- Siempre asumí que el usuario se refiere a ESTE documento y ESTE análisis, salvo que indique lo contrario.
- Usá toda la información contenida en el análisis: cláusulas, riesgos, recomendaciones, citas.
- NO digas nunca "no tengo acceso al documento". El análisis completo está en el contexto.

CAPACIDADES:
- Explicar cláusulas específicas del documento
- Aclarar dudas sobre el análisis jurídico
- Profundizar en los riesgos identificados
- Sugerir acciones concretas basadas en las recomendaciones
- Explicar la normativa citada y su aplicación
- Comparar cláusulas con estándares del mercado
- Identificar puntos de negociación

SI EL USUARIO PREGUNTA SOBRE:
- Cláusulas: Explicá qué establece, sus implicancias y si es favorable/desfavorable
- Riesgos: Detallá el riesgo, su nivel de gravedad y cómo mitigarlo
- Normativa: Explicá qué dice la ley citada y cómo aplica al caso
- Recomendaciones: Desarrollá la recomendación con pasos concretos

SIEMPRE QUE SEA POSIBLE, terminá tu respuesta con:

"Acciones sugeridas:"
• [Acción concreta 1]
• [Acción concreta 2]

ESTILO:
- Profesional, claro y directo
- Enfocado en "qué hacer" y "cómo proceder"
- Citá artículos y normativa cuando corresponda`;

  // Construir el contexto completo
  let contextPrompt = "";

  if (hasAnalysis) {
    contextPrompt += `ANÁLISIS DEL DOCUMENTO:
${input.analysisText}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  if (hasRiesgos && input.riesgos) {
    contextPrompt += `RIESGOS IDENTIFICADOS:
${input.riesgos.map(r => `- [${r.nivel?.toUpperCase()}] ${r.descripcion}${r.recomendacion ? ` → ${r.recomendacion}` : ""}`).join("\n")}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  if (hasCitas && input.citas) {
    contextPrompt += `CITAS LEGALES DEL ANÁLISIS:
${input.citas.map(c => `- [${c.tipo}] ${c.referencia}${c.descripcion ? ` – ${c.descripcion}` : ""}${c.url ? ` (${c.url})` : ""}`).join("\n")}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  // Construir el historial de mensajes para OpenAI
  const messages: Array<{role: "system" | "user" | "assistant"; content: string}> = [
    { role: "system", content: systemPrompt }
  ];

  // Agregar contexto al primer mensaje del usuario
  if (input.messages.length > 0) {
    const firstUserMessage = input.messages[0];
    
    if (contextPrompt.trim()) {
      messages.push({
        role: "user",
        content: `${contextPrompt}PREGUNTA DEL USUARIO:
${firstUserMessage.content}`
      });
    } else {
      messages.push(firstUserMessage);
    }
    
    // Agregar el resto de los mensajes
    for (let i = 1; i < input.messages.length; i++) {
      messages.push(input.messages[i]);
    }
  }

  const chat = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: messages
  });

  const response = chat.choices[0].message?.content || "No se pudo generar una respuesta.";

  return {
    message: response
  };
}

