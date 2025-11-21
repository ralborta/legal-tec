import OpenAI from "openai";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MemoChatInput = {
  transcriptText?: string; // Texto de la transcripción (extraído del PDF)
  messages: ChatMessage[]; // Historial de la conversación
  areaLegal?: string; // Área legal para contexto
};

export type MemoChatOutput = {
  message: string;
  summary?: string; // Resumen inicial si es el primer mensaje
};

/**
 * Chat conversacional sobre transcripciones de reuniones
 * La IA actúa como asistente jurídico que guía al usuario sobre cómo proceder
 */
export async function chatMemo(
  openaiKey: string,
  input: MemoChatInput
): Promise<MemoChatOutput> {
  const openai = new OpenAI({ apiKey: openaiKey });

  const isFirstMessage = input.messages.length === 1 && input.messages[0].role === "user";
  const hasTranscript = input.transcriptText && input.transcriptText.trim().length > 0;

  const systemPrompt = `Sos un abogado argentino senior que trabaja para WNS & Asociados, actuando como asistente jurídico conversacional.

Tu rol es:
- Analizar transcripciones de reuniones y generar resúmenes iniciales
- Responder preguntas del usuario sobre cómo proceder legalmente
- Guiar al usuario sobre qué documentos presentar, qué pasos seguir, qué considerar
- Actuar como consultor jurídico que ayuda a estructurar el trabajo legal

INSTRUCCIONES:
- Si es el primer mensaje y hay transcripción, generá un resumen ejecutivo breve (2-3 párrafos)
- Respondé las preguntas del usuario de forma clara, práctica y orientada a la acción
- Basate en la transcripción cuando esté disponible, pero también usá tu conocimiento jurídico
- Sé específico: mencioná documentos concretos, plazos, normativas relevantes cuando corresponda
- Mantené un tono profesional pero accesible
- Si el usuario pregunta sobre procedimientos, explicá paso a paso
- Si pregunta sobre documentos, listá qué necesita y dónde presentarlos`;

  let contextPrompt = "";

  if (hasTranscript) {
    contextPrompt = `TRANSCRIPCIÓN DE LA REUNIÓN:
${input.transcriptText}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  if (input.areaLegal) {
    contextPrompt += `ÁREA LEGAL: ${input.areaLegal}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  // Construir el historial de mensajes
  const messages: Array<{role: "user" | "assistant"; content: string}> = [
    { role: "system", content: systemPrompt }
  ];

  // Si es el primer mensaje y hay transcripción, agregar contexto
  if (isFirstMessage && hasTranscript) {
    messages.push({
      role: "user",
      content: `${contextPrompt}He subido la transcripción de una reunión. Por favor, generá un resumen ejecutivo breve y luego preguntame cómo puedo ayudarte con el proceso legal.`
    });
  } else {
    // Agregar contexto al primer mensaje del usuario
    if (hasTranscript && input.messages.length > 0) {
      const firstUserMessage = input.messages[0];
      messages.push({
        role: "user",
        content: `${contextPrompt}${firstUserMessage.content}`
      });
      // Agregar el resto de los mensajes
      for (let i = 1; i < input.messages.length; i++) {
        messages.push(input.messages[i]);
      }
    } else {
      // Sin transcripción, solo los mensajes
      messages.push(...input.messages);
    }
  }

  const chat = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: messages as any
  });

  const response = chat.choices[0].message?.content || "No se pudo generar una respuesta.";

  // Si es el primer mensaje, extraer el resumen si está presente
  let summary: string | undefined;
  if (isFirstMessage && hasTranscript) {
    // Intentar extraer el resumen (primeros párrafos antes de preguntar)
    const paragraphs = response.split("\n\n");
    if (paragraphs.length > 1) {
      summary = paragraphs[0] + (paragraphs[1] ? "\n\n" + paragraphs[1] : "");
    } else {
      summary = response.substring(0, 500); // Primeros 500 caracteres como resumen
    }
  }

  return {
    message: response,
    summary
  };
}

