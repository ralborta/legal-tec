import { Client } from "pg";
import { Document, SimpleNodeParser, VectorStoreIndex } from "llamaindex";
import { PGVectorStore } from "@llamaindex/postgres";

export async function ingestBatch(dbUrl: string, items: Array<{
  text: string; source: "normativa"|"juris"|"interno"; title?: string; url?: string; meta?: any;
}>) {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const store = new PGVectorStore({ client, schemaName: "public", tableName: "chunks", embedDim: 1536 });
  const parser = new SimpleNodeParser({ chunkSize: 900, chunkOverlap: 120 });

  const docs = items.map(x => new Document({ text: x.text, metadata: { source: x.source, title: x.title, url: x.url, ...x.meta }}));
  const nodes = parser.getNodesFromDocuments(docs);
  await VectorStoreIndex.fromDocuments(docs, { vectorStore: store, nodes });

  await client.end();
}

