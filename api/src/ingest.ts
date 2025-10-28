import { Client } from "pg";
import { Document, VectorStoreIndex } from "llamaindex";
import { PGVectorStore } from "@llamaindex/postgres";

export async function ingestBatch(dbUrl: string, items: Array<{
  text: string; source: "normativa"|"juris"|"interno"; title?: string; url?: string; meta?: any;
}>) {
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

