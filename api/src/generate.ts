import { Client } from "pg";
import { VectorStoreIndex } from "llamaindex";
import { PGVectorStore } from "@llamaindex/postgres";
import OpenAI from "openai";
import { TPL } from "./templates";

type In = { type: "dictamen"|"contrato"|"memo"|"escrito"; title: string; instructions: string; k?: number };

export async function generateDoc(dbUrl: string, openaiKey: string, input: In) {
  const client = new Client({ connectionString: dbUrl }); await client.connect();
  const store = new PGVectorStore({ 
    clientConfig: { connectionString: dbUrl },
    schemaName: "public", 
    tableName: "chunks"
  });
  const index = await VectorStoreIndex.fromVectorStore(store);
  const retriever = index.asRetriever({ similarityTopK: input.k ?? 6 });

  const q = `Instrucciones: ${input.instructions}
Quiero normativa (artículos exactos + fuente/vigencia) y jurisprudencia (tribunal, año, holding, enlace si existe).
Si no hay evidencia suficiente, marcá [REVISAR].`;
  const results = await retriever.retrieve(q);

  const context = results.map(r => `### ${r.node.metadata?.title || "Fuente"}
${r.node.getContent()}
[${r.node.metadata?.source||"fuente"}](${r.node.metadata?.url||"#"})`).join("\n\n");

  const citations = results.map(r => ({
    source: r.node.metadata?.source, title: r.node.metadata?.title, url: r.node.metadata?.url
  }));

  const tpl = TPL[input.type] ?? TPL.dictamen;

  const sys = `Sos un asistente legal. Usá SOLO el contexto. No inventes. Respetá la plantilla. Devuelve un JSON con los campos {{...}}.`;
  const user = `
PLANTILLA:
${tpl}

CONTEXTO:
${context}

TAREA:
Rellená la plantilla para el título "${input.title}".
Devolvé JSON con las claves que aparecen en {{...}} (según la plantilla).
Si falta evidencia, marcá [REVISAR] en la sección correspondiente.`;

  const openai = new OpenAI({ apiKey: openaiKey });
  const chat = await openai.chat.completions.create({
    model: "gpt-4",
    temperature: 0.2,
    messages: [{ role: "system", content: sys }, { role: "user", content: user }]
  });

  const data = JSON.parse(chat.choices[0].message!.content!);

  // Compose markdown
  let md = tpl;
  Object.entries(data).forEach(([k, v]) => { md = md.replaceAll(`{{${k}}}`, String(v ?? "")) });
  if (md.includes("{{citas}}")) {
    const list = citations.map(c => `- ${c.title||""} (${c.source||""}) ${c.url||""}`).join("\n");
    md = md.replaceAll("{{citas}}", list);
  }

  await client.query(
    `INSERT INTO documents (type, title, content_md, citations) VALUES ($1,$2,$3,$4)`,
    [input.type, input.title, md, JSON.stringify(citations)]
  );

  await client.end();
  return { markdown: md, citations };
}

