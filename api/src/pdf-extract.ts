import pdfParse from "pdf-parse";

/**
 * Extrae texto de un buffer de PDF
 * @param buffer Buffer del archivo PDF
 * @returns Texto extraído del PDF
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (error) {
    throw new Error(`Error al extraer texto del PDF: ${error instanceof Error ? error.message : "Error desconocido"}`);
  }
}

