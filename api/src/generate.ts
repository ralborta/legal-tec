import pg from "pg";
const { Client } = pg;
import { VectorStoreIndex } from "llamaindex";
import { PGVectorStore } from "@llamaindex/postgres";
import OpenAI from "openai";
import { TPL } from "./templates.js";

type In = { 
  type: "dictamen"|"contrato"|"memo"|"escrito"; 
  title: string; 
  instructions: string; 
  k?: number;
  knowledgeBases?: string[]; // IDs de bases de conocimiento a incluir (opcional)
  excludeKnowledgeBases?: string[]; // IDs de bases de conocimiento a excluir (opcional)
};

export async function generateDoc(dbUrl: string, openaiKey: string, input: In) {
  // En 0.11.21, el embedding se configura automáticamente en PGVectorStore

  const client = new Client({ connectionString: dbUrl }); await client.connect();
  
  // Si se especifican bases de conocimiento, filtrar los chunks antes de crear el índice
  let filterQuery = "";
  const filterParams: any[] = [];
  
  if (input.knowledgeBases && input.knowledgeBases.length > 0) {
    filterQuery = `WHERE knowledge_base = ANY($1::text[])`;
    filterParams.push(input.knowledgeBases);
  } else if (input.excludeKnowledgeBases && input.excludeKnowledgeBases.length > 0) {
    filterQuery = `WHERE knowledge_base IS NULL OR knowledge_base != ALL($1::text[])`;
    filterParams.push(input.excludeKnowledgeBases);
  }
  
  const store = new PGVectorStore({ 
    clientConfig: { connectionString: dbUrl },
    schemaName: "public", 
    tableName: "chunks",
    // Nota: PGVectorStore no soporta filtros directamente, así que usaremos post-filtering
  });
  
  const index = await VectorStoreIndex.fromVectorStore(store);
  const retriever = index.asRetriever({ similarityTopK: (input.k ?? 6) * 2 }); // Buscar más para luego filtrar

  const q = `Instrucciones: ${input.instructions}
Quiero normativa (artículos exactos + fuente/vigencia) y jurisprudencia (tribunal, año, holding, enlace si existe).
Si no hay evidencia suficiente, marcá [REVISAR].`;
  let results = await retriever.retrieve(q);
  
  // Filtrar resultados por base de conocimiento si se especificó
  if (input.knowledgeBases && input.knowledgeBases.length > 0) {
    results = results.filter(r => {
      const kb = (r.node.metadata as any)?.knowledgeBase;
      return kb && input.knowledgeBases!.includes(kb);
    });
  } else if (input.excludeKnowledgeBases && input.excludeKnowledgeBases.length > 0) {
    results = results.filter(r => {
      const kb = (r.node.metadata as any)?.knowledgeBase;
      return !kb || !input.excludeKnowledgeBases!.includes(kb);
    });
  }
  
  // Limitar a k resultados después del filtrado
  results = results.slice(0, input.k ?? 6);

  const context = results.map(r => {
    const text = (r.node as any).text || '';
    return `### ${r.node.metadata?.title || "Fuente"}
${text}
[${r.node.metadata?.source||"fuente"}](${r.node.metadata?.url||"#"})`;
  }).join("\n\n");

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

  const result = await client.query(
    `INSERT INTO documents (type, title, content_md, citations) VALUES ($1,$2,$3,$4) RETURNING id`,
    [input.type, input.title, md, JSON.stringify(citations)]
  );

  const documentId = result.rows[0].id;

  await client.end();
  return { markdown: md, citations, documentId };
}

