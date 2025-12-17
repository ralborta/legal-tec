import pg from "pg";
const { Client } = pg;
import { VectorStoreIndex } from "llamaindex";
import { PGVectorStore } from "@llamaindex/postgres";

/**
 * Consulta la base de conocimiento (jurisprudencia) usando RAG
 * para encontrar información relevante al documento analizado
 */
export async function queryJurisprudence(
  documentText: string,
  documentType: string,
  maxResults: number = 6
): Promise<Array<{ title: string; text: string; source: string; url?: string }>> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[RAG] DATABASE_URL no configurado, omitiendo consulta de jurisprudencia");
    return [];
  }

  // Timeout de 15 segundos para RAG (no debe bloquear el análisis)
  const RAG_TIMEOUT = 15000;
  
  try {
    const ragPromise = (async () => {
      const client = new Client({ connectionString: dbUrl });
      await client.connect();

      const store = new PGVectorStore({
        clientConfig: { connectionString: dbUrl },
        schemaName: "public",
        tableName: "chunks",
      });

      // POC: cast para compatibilidad de tipos (PGVectorStore no tiene embedModel)
      const index = await VectorStoreIndex.fromVectorStore(store as any);
      const retriever = index.asRetriever({ similarityTopK: maxResults * 2 }); // Buscar más para filtrar

      // Query: buscar jurisprudencia relevante al tipo de documento y contenido
      const query = `Documento tipo: ${documentType}
    
Contenido del documento:
${documentText.substring(0, 2000)}

Buscar jurisprudencia, normativa y doctrina relevante que pueda ayudar a:
- Identificar riesgos legales
- Comparar cláusulas similares
- Sugerir mejoras basadas en fallos o normativa
- Evaluar cumplimiento legal`;

      const results = await retriever.retrieve(query);

      // Filtrar solo jurisprudencia y normativa relevante
      const filtered = results
        .filter((r) => {
          const source = (r.node.metadata as any)?.source;
          return (
            source === "juris" ||
            source === "jurisprudencia_extranjera" ||
            source === "normativa" ||
            source === "doctrina"
          );
        })
        .slice(0, maxResults);

      const citations = filtered.map((r) => ({
        title: (r.node.metadata as any)?.title || "Fuente legal",
        text: ((r.node as any).text || "").substring(0, 800), // Limitar tamaño
        source: (r.node.metadata as any)?.source || "desconocido",
        url: (r.node.metadata as any)?.url,
      }));

      await client.end();
      return citations;
    })();

    // Aplicar timeout: si tarda más de 15s, devolver array vacío
    const timeoutPromise = new Promise<Array<{ title: string; text: string; source: string; url?: string }>>((resolve) => {
      setTimeout(() => {
        console.warn("[RAG] Timeout después de 15s, continuando sin jurisprudencia");
        resolve([]);
      }, RAG_TIMEOUT);
    });

    const citations = await Promise.race([ragPromise, timeoutPromise]);
    return citations;
  } catch (error) {
    console.error("[RAG] Error consultando jurisprudencia:", error);
    return []; // Si falla, continuar sin jurisprudencia
  }
}

