/**
 * Consulta la base de conocimiento (jurisprudencia) usando RAG
 * DESHABILITADO TEMPORALMENTE - problema de compatibilidad PGVectorStore
 */
export async function queryJurisprudence(
  documentText: string,
  documentType: string,
  maxResults: number = 6
): Promise<Array<{ title: string; text: string; source: string; url?: string }>> {
  console.log("[RAG] Deshabilitado temporalmente - retornando array vacío");
  return [];
}
