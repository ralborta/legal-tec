import OpenAI from "openai";

export type MemoQueryInput = {
  memoContent: string; // Contenido completo del memo (markdown o texto)
  query: string; // Pregunta o instrucción del usuario
  titulo?: string; // Título del memo para contexto
  citas?: Array<{
    tipo: "normativa" | "jurisprudencia" | "doctrina" | "otra";
    referencia: string;
    descripcion?: string;
    url?: string;
  }>;
};

export type MemoQueryOutput = {
  response: string;
  query: string;
};

/**
 * Consulta un memo generado - permite hacer preguntas o pedir modificaciones
 * Similar a NotebookLM - funciona sin necesidad de guardar en DB
 */
export async function queryMemo(
  openaiKey: string,
  input: MemoQueryInput
): Promise<MemoQueryOutput> {
  const openai = new OpenAI({ apiKey: openaiKey });

  const systemPrompt = `Sos un asistente legal especializado que trabaja para WNS & Asociados.

Tu tarea es responder preguntas o realizar modificaciones sobre un memo jurídico generado.

INSTRUCCIONES:
- Responde BASÁNDOTE SOLO en el contenido del memo proporcionado
- Si te piden modificar algo, devolvé SOLO la parte modificada con el contexto necesario
- Si es una pregunta, responde de forma clara, concisa y profesional
- NO inventes información fuera del memo
- Mantené el tono jurídico profesional del memo original
- Si algo no está en el memo, indicálo claramente
- Podés citar secciones específicas del memo cuando sea relevante`;

  const citasSection = input.citas && input.citas.length > 0
    ? `\n\nCITAS DEL MEMO:\n${JSON.stringify(input.citas, null, 2)}`
    : "";

  const userPrompt = `MEMO JURÍDICO:
Título: ${input.titulo || "Memo de reunión"}

Contenido:
${input.memoContent}
${citasSection}

───────────────────────────────────────────────────────────────────────────────

CONSULTA/INSTRUCCIÓN DEL USUARIO:
${input.query}

Responde o modifica según lo solicitado, usando SOLO la información del memo proporcionado.`;

  const chat = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  const response = chat.choices[0].message?.content || "No se pudo generar una respuesta.";

  return {
    response,
    query: input.query
  };
}




