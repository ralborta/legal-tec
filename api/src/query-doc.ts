import { Client } from "pg";
import OpenAI from "openai";

/**
 * Query/Modify documento generado
 * Similar a NotebookLM - le pasas una pregunta/instrucción sobre el documento
 * y responde o modifica basándose en el contenido del documento
 */

export async function queryDocument(
  dbUrl: string,
  openaiKey: string,
  documentId: string,
  query: string
) {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  // Obtener documento desde DB
  const docResult = await client.query(
    `SELECT type, title, content_md, citations FROM documents WHERE id = $1`,
    [documentId]
  );

  if (docResult.rows.length === 0) {
    await client.end();
    throw new Error("Documento no encontrado");
  }

  const doc = docResult.rows[0];

  const openai = new OpenAI({ apiKey: openaiKey });

  // Prompt: responder/modificar basándose SOLO en el documento
  const systemPrompt = `Sos un asistente legal especializado. Te voy a dar un documento legal generado y una pregunta o instrucción.

INSTRUCCIONES:
- Responde BASÁNDOTE SOLO en el contenido del documento
- Si te piden modificar algo, devolvé SOLO la parte modificada
- Si es una pregunta, responde de forma clara y concisa
- NO inventes información fuera del documento
- Mantené el tono y formato legal del documento original`;

  const userPrompt = `
DOCUMENTO:
${doc.content_md}

CITAS:
${JSON.stringify(doc.citations, null, 2)}

CONSULTA/INSTRUCCIÓN:
${query}

Responde o modifica según lo solicitado, usando SOLO la información del documento.`;

  const chat = await openai.chat.completions.create({
    model: "gpt-4",
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  const response = chat.choices[0].message!.content!;

  await client.end();

  return {
    response,
    documentId,
    query
  };
}

