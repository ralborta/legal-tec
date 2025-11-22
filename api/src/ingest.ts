import pg from "pg";
const { Client } = pg;
import { Document, VectorStoreIndex } from "llamaindex";
import { PGVectorStore } from "@llamaindex/postgres";

export async function ingestBatch(dbUrl: string, openaiKey: string, items: Array<{
  text: string; 
  source: "normativa"|"juris"|"interno"|"doctrina"|"jurisprudencia_extranjera"|string; 
  title?: string; 
  url?: string; 
  meta?: any;
  knowledgeBase?: string; // Identificador de la base de conocimiento específica
}>) {
  // En 0.11.21, el embedding se configura automáticamente en PGVectorStore

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const store = new PGVectorStore({ 
    clientConfig: { connectionString: dbUrl },
    schemaName: "public", 
    tableName: "chunks"
  });

  const docs = items.map(x => new Document({ 
    text: x.text, 
    metadata: { 
      source: x.source, 
      title: x.title, 
      url: x.url, 
      knowledgeBase: x.knowledgeBase, // Añadir base de conocimiento al metadata
      ...x.meta 
    }
  }));
  
  // @ts-ignore - LlamaIndex types are inconsistent
  await VectorStoreIndex.fromDocuments(docs, { vectorStore: store });

  // Si se especificó knowledgeBase, actualizar la columna en la BD
  if (items.some(x => x.knowledgeBase)) {
    // Obtener los IDs de los chunks recién insertados (últimos N)
    const result = await client.query(
      `SELECT id FROM chunks ORDER BY created_at DESC LIMIT $1`,
      [items.length]
    );
    
    // Actualizar knowledge_base para los chunks insertados
    for (let i = 0; i < result.rows.length && i < items.length; i++) {
      const item = items[i];
      if (item.knowledgeBase) {
        await client.query(
          `UPDATE chunks SET knowledge_base = $1 WHERE id = $2`,
          [item.knowledgeBase, result.rows[result.rows.length - 1 - i].id]
        );
      }
    }
  }

  await client.end();
}

