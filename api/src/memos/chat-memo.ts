import OpenAI from "openai";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MemoChatInput = {
  transcriptText?: string; // Texto de la transcripción (extraído del PDF)
  messages: ChatMessage[]; // Historial de la conversación
  areaLegal?: string; // Área legal para contexto
  memoText?: string; // Texto completo del memo (texto_formateado)
  citas?: Array<{
    tipo: string;
    referencia: string;
    descripcion?: string;
    url?: string;
  }>;
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
  const hasMemo = input.memoText && input.memoText.trim().length > 0;
  const hasCitas = input.citas && input.citas.length > 0;

Contexto:
- Ya se generó un MEMO detallado a partir de una reunión con el cliente.
- También podés tener acceso al TEXTO de la transcripción original de la reunión.
- Toda tu labor en este chat es ayudar al abogado a TRABAJAR sobre ese memo y esa reunión.

REGLAS FUNDAMENTALES:
- Siempre asumí que el usuario se refiere a ESTE memo y ESTA reunión, salvo que indique lo contrario.
- Podés y debés usar toda la información contenida en:
  - La transcripción (si está disponible)
  - El texto completo del memo
  - Las citas legales extraídas (normativa, jurisprudencia, doctrina)

- NO digas nunca frases del estilo "no tengo acceso a archivos subidos" o "no puedo ver documentos".
  En su lugar, considerá que el texto del memo y la transcripción ya están incluidos en el contexto.

- Si el usuario pregunta por jurisprudencia, normativa o citas:
  - Buscá la respuesta en la sección de ANÁLISIS JURÍDICO y en la lista de CITAS.
  - Respondé indicando claramente las referencias (leyes, artículos, fallos, etc.).
  - Si NO hay información en el memo/citas sobre eso, decí explícitamente: "En el memo no consta jurisprudencia/normativa específica sobre este punto."

ROL PRINCIPAL EN EL CHAT:
- Aclarar dudas sobre lo que se habló en la reunión.
- Resumir puntos clave del memo.
- Identificar y explicar riesgos.
- Proponer planes de acción concretos.

SIEMPRE QUE SEA POSIBLE, terminá tu respuesta con una sección:

"Acciones sugeridas:"
• [Acción concreta 1]
• [Acción concreta 2]
• [Acción concreta 3]

Las acciones deben estar basadas en:
- la sección "Próximos pasos" del memo
- los "Pasos a seguir" dentro de cada punto tratado
- los riesgos identificados

ESTILO:
- Profesional, claro y directo.
- No des clases teóricas: enfocá tus respuestas en "qué hacer" y "cómo proceder".`;

  // Construir el contexto completo: transcripción + memo + citas
  let contextPrompt = "";

  if (hasTranscript) {
    contextPrompt += `TRANSCRIPCIÓN DE LA REUNIÓN:
${input.transcriptText}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  if (hasMemo) {
    contextPrompt += `MEMO GENERADO A PARTIR DE ESTA REUNIÓN:
${input.memoText}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  if (hasCitas) {
    contextPrompt += `CITAS LEGALES DEL MEMO:
${input.citas.map(c => `- [${c.tipo}] ${c.referencia}${c.descripcion ? ` – ${c.descripcion}` : ""}${c.url ? ` (${c.url})` : ""}`).join("\n")}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  if (input.areaLegal) {
    contextPrompt += `ÁREA LEGAL: ${input.areaLegal}

───────────────────────────────────────────────────────────────────────────────

`;
  }

  // Construir el historial de mensajes para OpenAI (acepta "system", "user", "assistant")
  const messages: Array<{role: "system" | "user" | "assistant"; content: string}> = [
    { role: "system", content: systemPrompt }
  ];

  // Construir mensajes con contexto siempre presente
  if (input.messages.length > 0) {
    // Agregar contexto al primer mensaje del usuario
    const firstUserMessage = input.messages[0];
    
    // Si hay contexto (memo o transcripción), incluirlo siempre
    if (contextPrompt.trim()) {
      messages.push({
        role: "user",
        content: `${contextPrompt}${firstUserMessage.content}`
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

