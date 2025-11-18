/**
 * Extrae texto de un buffer de PDF
 * @param buffer Buffer del archivo PDF
 * @returns Texto extraído del PDF
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Importación dinámica para compatibilidad con ESM
    // pdf-parse es CommonJS pero se importa como ESM
    const pdfParseModule = await import("pdf-parse");
    // @ts-ignore - pdf-parse no tiene tipos correctos para ESM
    const pdfParseFn = pdfParseModule.default || pdfParseModule;
    
    // @ts-ignore - pdf-parse types are incorrect
    const data = await pdfParseFn(buffer);
    return data.text || "";
  } catch (error) {
    throw new Error(`Error al extraer texto del PDF: ${error instanceof Error ? error.message : "Error desconocido"}`);
  }
}

