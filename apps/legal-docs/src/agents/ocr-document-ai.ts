/**
 * OCR opcional con Google Document AI.
 * Solo se usa si están definidas las variables de entorno.
 * Muy robusto para escaneos, fotos de documentos y PDFs con imágenes.
 * Usa credenciales desde GOOGLE_APPLICATION_CREDENTIALS_JSON directamente (sin archivo temporal) para evitar fallos en Railway.
 */

const PROJECT_ID = process.env.DOCUMENT_AI_PROJECT_ID;
const LOCATION = process.env.DOCUMENT_AI_LOCATION || "us";
const PROCESSOR_ID = process.env.DOCUMENT_AI_PROCESSOR_ID;
const CREDENTIALS_JSON = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();

export function isDocumentAIConfigured(): boolean {
  return Boolean(PROJECT_ID && PROCESSOR_ID && (CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS));
}

function getClientOptions(): { credentials?: { client_email: string; private_key: string } } | Record<string, never> {
  if (!CREDENTIALS_JSON) return {};
  try {
    const creds = JSON.parse(CREDENTIALS_JSON) as { client_email?: string; private_key?: string };
    if (creds.client_email && creds.private_key) {
      return { credentials: { client_email: creds.client_email, private_key: creds.private_key } };
    }
  } catch (e) {
    console.error("[OCR-DocumentAI] Error parseando GOOGLE_APPLICATION_CREDENTIALS_JSON:", e instanceof Error ? e.message : e);
  }
  return {};
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

  const name = `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`;
  console.log(`[OCR-DocumentAI] Llamando API: ${name}, buffer=${buffer.length} bytes, mime=${mime}`);

  try {
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const docai = require("@google-cloud/documentai");
    const Client = docai.v1?.DocumentProcessorServiceClient ?? docai.default?.v1?.DocumentProcessorServiceClient;
    if (!Client) {
      console.error("[OCR-DocumentAI] No se pudo cargar DocumentProcessorServiceClient");
      return null;
    }
    const clientOptions = getClientOptions();
    const client = Object.keys(clientOptions).length > 0 ? new Client(clientOptions as any) : new Client();

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
    if (text) console.log(`[OCR-DocumentAI] Respuesta muy corta (${text.length} chars), se considera fallo`);
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = err && typeof err === "object" && "code" in err ? (err as { code: number }).code : undefined;
    const details = err && typeof err === "object" && "details" in err ? (err as { details: string }).details : undefined;
    console.error("[OCR-DocumentAI] Error:", msg, code !== undefined ? `(code=${code})` : "", details ? String(details) : "");
    if (err instanceof Error && err.stack) console.error("[OCR-DocumentAI] Stack:", err.stack);
    return null;
  }
}
