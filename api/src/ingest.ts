import { Client } from "pg";
import { Document, VectorStoreIndex, OpenAIEmbedding, Settings } from "llamaindex";
import { PGVectorStore } from "llamaindex/vector-stores/pgvector";

export async function ingestBatch(dbUrl: string, openaiKey: string, items: Array<{
  text: string; source: "normativa"|"juris"|"interno"; title?: string; url?: string; meta?: any;
}>) {
  // Configurar embedding model
  Settings.embedModel = new OpenAIEmbedding({
    apiKey: openaiKey,
    model: "text-embedding-3-small" // 1536 dimensiones
  });

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
      ...x.meta 
    }
  }));
  
  // @ts-ignore - LlamaIndex types are inconsistent
  await VectorStoreIndex.fromDocuments(docs, { vectorStore: store });

  await client.end();
}

