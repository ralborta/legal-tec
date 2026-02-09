/**
 * OCR opcional con Google Document AI.
 * Solo se usa si están definidas las variables de entorno.
 * Muy robusto para escaneos, fotos de documentos y PDFs con imágenes.
 */

const PROJECT_ID = process.env.DOCUMENT_AI_PROJECT_ID;
const LOCATION = process.env.DOCUMENT_AI_LOCATION || "us";
const PROCESSOR_ID = process.env.DOCUMENT_AI_PROCESSOR_ID;

export function isDocumentAIConfigured(): boolean {
  return Boolean(PROJECT_ID && PROCESSOR_ID);
}

/**
 * Extrae texto de un PDF o imagen usando Google Document AI (Document OCR).
 * Devuelve null si no está configurado o si falla.
 */
export async function extractTextViaDocumentAI(
  buffer: Buffer,
  mimeType: string
): Promise<string | null> {
  if (!isDocumentAIConfigured()) return null;

  const mime = mimeType?.toLowerCase().includes("pdf")
    ? "application/pdf"
    : mimeType?.toLowerCase().startsWith("image/")
      ? mimeType
      : "application/pdf";

  try {
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const docai = require("@google-cloud/documentai");
    const Client = docai.v1?.DocumentProcessorServiceClient ?? docai.default?.v1?.DocumentProcessorServiceClient;
    if (!Client) {
      console.error("[OCR-DocumentAI] No se pudo cargar DocumentProcessorServiceClient");
      return null;
    }
    const client = new Client();

    const name = `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`;
    const [result] = await client.processDocument({
      name,
      rawDocument: {
        content: buffer.toString("base64"),
        mimeType: mime,
      },
    });
    const doc = result?.document as { text?: string } | undefined;
    const text = (doc?.text ?? "").trim();
    if (text && text.length >= 50) {
      console.log(`[OCR-DocumentAI] OK: ${text.length} caracteres`);
      return text;
    }
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OCR-DocumentAI] Error:", msg);
    return null;
  }
}
