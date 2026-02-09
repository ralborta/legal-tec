import OpenAI from "openai";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AnalysisChatInput = {
  analysisText?: string; // Texto completo del análisis
  documentText?: string; // Texto extraído del documento (vista del documento) para contexto
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
  const hasDocumentText = input.documentText && input.documentText.trim().length > 0;
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
- Usá toda la información contenida en el análisis y en el texto del documento cuando estén disponibles.
- NO digas nunca "no tengo acceso al documento". Tenés el análisis y/o el texto del documento en el contexto.

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

  // Construir el contexto completo (análisis + texto del documento para "vista del documento")
  let contextPrompt = "";

  if (hasDocumentText) {
    // Incluir más texto para que el asistente pueda responder sobre firmas, partes (suelen estar al final)
    const maxDocChars = 20000;
    const docExcerpt = input.documentText!.length > maxDocChars ? input.documentText!.substring(0, maxDocChars) + "\n[... texto truncado ...]" : input.documentText;
    const docLen = input.documentText!.trim().length;
    const shortDocNote = docLen < 400 ? "\nNOTA: El texto del documento recibido es muy breve; puede que la extracción no haya capturado todo el contenido (p. ej. PDF escaneado). Si el usuario pregunta por datos concretos (firmas, partes, cláusulas) y no están en el texto, decilo y sugerí regenerar el análisis o subir de nuevo el PDF." : "";
    contextPrompt += `TEXTO DEL DOCUMENTO (extracto para referencia):${shortDocNote}

${docExcerpt}

───────────────────────────────────────────────────────────────────────────────

`;
  }

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

  // Si no hay ningún contexto (ni análisis ni documento), el modelo no debe afirmar que "ve" el documento
  if (!contextPrompt.trim() && input.messages.length > 0) {
    const firstUserMessage = input.messages[0];
    contextPrompt = `IMPORTANTE: No se recibió el texto del análisis ni del documento en esta solicitud. No inventes contenido. Responde únicamente algo como: "No pude cargar el análisis ni el documento en este momento. Por favor, recargá la página o volvé a analizar el documento y probá de nuevo en el chat."\n\nPREGUNTA DEL USUARIO:\n${firstUserMessage.content}`;
  }

  // Agregar contexto al primer mensaje del usuario
  if (input.messages.length > 0) {
    const firstUserMessage = input.messages[0];
    
    if (contextPrompt.trim()) {
      messages.push({
        role: "user",
        content: contextPrompt.includes("PREGUNTA DEL USUARIO:")
          ? contextPrompt
          : `${contextPrompt}PREGUNTA DEL USUARIO:
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

