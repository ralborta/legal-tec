import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { isDocumentAIConfigured, extractTextViaDocumentAI } from "./ocr-document-ai.js";
import {
  writeFileSync,
  unlinkSync,
  createReadStream,
  mkdirSync,
  readdirSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const execFileAsync = promisify(execFile);

async function extractPdfTextViaLocalOcr(buffer: Buffer, filename: string): Promise<string> {
  const safeBase = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const tmpRoot = join(tmpdir(), `ocr-local-${Date.now()}-${safeBase}`);
  const pdfPath = join(tmpRoot, "input.pdf");
  const outPrefix = join(tmpRoot, "page");

  mkdirSync(tmpRoot, { recursive: true });
  try {
    writeFileSync(pdfPath, buffer);

    // Convertir a PNG (1 imagen por página). -r 200 da buen balance calidad/tiempo.
    await execFileAsync("pdftoppm", ["-r", "200", "-png", pdfPath, outPrefix]);

    const images = readdirSync(tmpRoot)
      .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

    if (!images.length) {
      throw new Error("No se generaron imágenes desde el PDF");
    }

    const maxPages = Number(process.env.OCR_MAX_PAGES || 25);
    const selected = images.slice(0, Math.max(1, maxPages));

    const pageTexts: string[] = [];
    for (let i = 0; i < selected.length; i++) {
      const imgPath = join(tmpRoot, selected[i]);
      // OCR en stdout. Español + inglés ayuda a contratos mixtos.
      const { stdout } = await execFileAsync("tesseract", [imgPath, "stdout", "-l", "spa+eng"]);
      const text = (stdout || "").trim();
      if (text) {
        pageTexts.push(`\n\n--- Página ${i + 1} ---\n${text}`);
      }
    }

    return pageTexts.join("\n").trim();
  } finally {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/** Convierte todas las páginas del PDF a imágenes y las envía a gpt-4o Vision (para escaneados de varias páginas cuando tesseract falla). */
async function extractPdfAllPagesViaVision(buffer: Buffer, filename: string): Promise<string> {
  const safeBase = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const tmpRoot = join(tmpdir(), `ocr-vision-${Date.now()}-${safeBase}`);
  const pdfPath = join(tmpRoot, "input.pdf");
  const outPrefix = join(tmpRoot, "page");

  mkdirSync(tmpRoot, { recursive: true });
  try {
    writeFileSync(pdfPath, buffer);
    const dpi = Number(process.env.OCR_VISION_DPI || 300);
    await execFileAsync("pdftoppm", ["-r", String(dpi), "-png", pdfPath, outPrefix]);
    const images = readdirSync(tmpRoot)
      .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    if (!images.length) throw new Error("No se generaron imágenes desde el PDF");

    const maxPages = Math.min(images.length, Math.max(1, Number(process.env.OCR_MAX_PAGES || 25)));
    const selected = images.slice(0, maxPages);
    const pageTexts: string[] = [];
    const readFile = (await import("fs")).promises.readFile;

    for (let i = 0; i < selected.length; i++) {
      const imgPath = join(tmpRoot, selected[i]);
      const imgBuffer = await readFile(imgPath);
      const imageUrl = `data:image/png;base64,${imgBuffer.toString("base64")}`;
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extrae TODO el texto de esta imagen (página ${i + 1} de un documento escaneado). Si es un documento legal, contrato o cualquier texto, extrae todo el contenido de manera completa y precisa. Preserva la estructura y saltos de línea.`,
              },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 8192,
      });
      const text = (response.choices[0]?.message?.content || "").trim();
      if (text) pageTexts.push(`\n\n--- Página ${i + 1} ---\n${text}`);
    }

    const full = pageTexts.join("").trim();
    if (!full) throw new Error("Vision no devolvió texto en ninguna página");
    return full;
  } finally {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function extractPdfTextViaOpenAIResponses(buffer: Buffer, filename: string): Promise<string> {
  // Nota: el SDK/entorno puede no soportar Responses API. Este método se llama dentro de try/catch.
  const base64 = buffer.toString("base64");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientAny = openai as any;
  if (!clientAny.responses || typeof clientAny.responses.create !== "function") {
    throw new Error("Responses API no disponible en este SDK/runtime");
  }

  const response = await clientAny.responses.create({
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Extraé TODO el texto del PDF adjunto (incluyendo OCR si es un PDF escaneado). Devolvé SOLO el texto extraído, preservando saltos de línea."
          },
          {
            type: "input_file",
            filename,
            file_data: base64
          }
        ]
      }
    ]
  });

  // El SDK expone el texto final en output_text.
  // Si no existe (por cambios de SDK), forzamos fallback a Assistants.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyResp = response as any;
  const extracted: string = (anyResp.output_text || "").toString();
  if (!extracted || extracted.trim().length === 0) {
    throw new Error("Responses API returned empty output_text");
  }
  return extracted;
}

async function extractFileTextViaOpenAI(buffer: Buffer, filename: string): Promise<string> {
  try {
    return await extractPdfTextViaOpenAIResponses(buffer, filename);
  } catch {
    // fallback a Assistants + file_search
  }

  const tempPath = join(tmpdir(), `ocr-${Date.now()}-${filename}`);
  let tempFileCreated = false;
  let fileId: string | null = null;

  try {
    writeFileSync(tempPath, buffer);
    tempFileCreated = true;

    const fileStream = createReadStream(tempPath);
    const file = await openai.files.create({
      file: fileStream,
      purpose: "assistants"
    });
    fileId = file.id;

    const assistant = await openai.beta.assistants.create({
      name: "PDF OCR Extractor",
      instructions:
        "Extraé TODO el texto del archivo provisto. No inventes. Preservá saltos de línea y la estructura. Devolvé SOLO el texto extraído.",
      model: "gpt-4o",
      tools: [{ type: "file_search" }]
    });

    const thread = await openai.beta.threads.create({});
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: "Extraé TODO el texto del PDF adjunto. Devolvé SOLO el texto.",
      attachments: [{ file_id: fileId, tools: [{ type: "file_search" }] }]
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id
    });

    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status === "queued" || runStatus.status === "in_progress") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }

    if (runStatus.status !== "completed") {
      throw new Error(`Run falló con status: ${runStatus.status}`);
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data[0];
    const content = lastMessage?.content?.[0];
    if (!content || content.type !== "text") {
      throw new Error("Respuesta no es texto");
    }

    const extracted = content.text.value || "";
    return extracted;
  } finally {
    if (fileId) {
      try {
        await openai.files.del(fileId);
      } catch {
        // ignore
      }
    }
    if (tempFileCreated) {
      try {
        unlinkSync(tempPath);
      } catch {
        // ignore
      }
    }
  }
}

export async function ocrAgent(file: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<string> {
  const filenameLower = file.filename.toLowerCase();
  
  // Si es PDF, extraer texto directamente
  if (file.mimeType === "application/pdf" || filenameLower.endsWith(".pdf")) {
    const docAiOk = isDocumentAIConfigured();
    console.log(`[OCR] PDF: ${file.buffer.length} bytes, Document AI configurado: ${docAiOk ? "SÍ" : "NO"}`);

    if (docAiOk) {
      try {
        console.log("[OCR] Intentando Google Document AI primero (recomendado para escaneos)...");
        const docAiText = await extractTextViaDocumentAI(file.buffer, file.mimeType);
        if (docAiText && docAiText.length >= 100) {
          console.log(`[OCR] Document AI OK: ${docAiText.length} caracteres`);
          return docAiText;
        }
        if (docAiText) console.log(`[OCR] Document AI devolvió poco (${docAiText.length} chars), probando otros...`);
      } catch (e) {
        console.error("[OCR] Error Document AI:", e instanceof Error ? e.message : e);
      }
    }

    try {
      const parser = new PDFParse({ data: file.buffer });
      try {
        const data = await parser.getText();
        const extracted = (data.text || "").trim();
        if (extracted.length >= 200) {
          console.log(`[OCR] pdf-parse OK: ${extracted.length} caracteres`);
          return extracted;
        }
        const preferTesseract = process.env.OCR_PREFER_TESSERACT === "true" || process.env.OCR_PREFER_TESSERACT === "1";
        if (preferTesseract) {
          // Modo económico: tesseract primero (gratis), Vision solo si falla o devuelve poco.
          try {
            const localOcr = (await extractPdfTextViaLocalOcr(file.buffer, file.filename)).trim();
            if (localOcr.length >= 100) {
              console.log(`[OCR] tesseract OK: ${localOcr.length} caracteres`);
              return localOcr;
            }
          } catch (e) {
            console.error("Error local OCR for PDF:", e);
          }
        }
        // Vision (tiene costo por página). Si OCR_PREFER_TESSERACT no está, se usa primero para mejor calidad en escaneados.
        if (process.env.OPENAI_API_KEY) {
          try {
            console.log("[OCR] PDF con poco texto, intentando Vision (todas las páginas)...");
            const visionText = (await extractPdfAllPagesViaVision(file.buffer, file.filename)).trim();
            if (visionText.length >= 50) {
              console.log(`[OCR] Vision OK: ${visionText.length} caracteres`);
              return visionText;
            }
          } catch (e) {
            console.error("Error PDF Vision (todas las páginas):", e);
          }
        }
        if (!preferTesseract) {
          try {
            const localOcr = (await extractPdfTextViaLocalOcr(file.buffer, file.filename)).trim();
            if (localOcr.length >= 50) {
              console.log(`[OCR] tesseract OK: ${localOcr.length} caracteres`);
              return localOcr;
            }
          } catch (e) {
            console.error("Error local OCR for PDF:", e);
          }
        }

        // Último recurso: OpenAI (PDF completo con Responses/Assistants API)
        if (!process.env.OPENAI_API_KEY) {
          console.log(`[OCR] Sin OPENAI_API_KEY; devolviendo texto pdf-parse: ${extracted.length} caracteres`);
          return extracted;
        }
        const ocrText = (await extractFileTextViaOpenAI(file.buffer, file.filename)).trim();
        const final = ocrText || extracted;
        console.log(`[OCR] OpenAI fallback: ${ocrText.length} chars, usando ${final.length} caracteres`);
        return final;
      } finally {
        await parser.destroy();
      }
    } catch (error) {
      console.error("Error parsing PDF:", error);
      if (isDocumentAIConfigured()) {
        try {
          console.log("[OCR] PDF falló parse, intentando Document AI...");
          const docAiText = await extractTextViaDocumentAI(file.buffer, file.mimeType);
          if (docAiText && docAiText.length >= 50) return docAiText;
        } catch (e) {
          console.error("Error Document AI after parse failure:", e);
        }
      }
      // pdf-parse falló (ej. PDF corrupto o solo imágenes). Probar Vision.
      if (process.env.OPENAI_API_KEY) {
        try {
          console.log("[OCR] PDF falló parse, intentando Vision...");
          const visionText = (await extractPdfAllPagesViaVision(file.buffer, file.filename)).trim();
          if (visionText.length >= 50) return visionText;
        } catch (e) {
          console.error("Error PDF Vision after parse failure:", e);
        }
        try {
          const ocrText = (await extractFileTextViaOpenAI(file.buffer, file.filename)).trim();
          if (ocrText) return ocrText;
        } catch (e) {
          console.error("Error OCR fallback for PDF:", e);
        }
      }
      try {
        const localOcr = (await extractPdfTextViaLocalOcr(file.buffer, file.filename)).trim();
        if (localOcr.length >= 50) {
          console.log(`[OCR] tesseract (post-fallo parse) OK: ${localOcr.length} caracteres`);
          return localOcr;
        }
      } catch (e) {
        console.error("Error local OCR for PDF after parse failure:", e);
      }
      throw new Error("Failed to extract text from PDF");
    }
  }

  // Si es Word (.docx), usar mammoth
  if (
    file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filenameLower.endsWith(".docx")
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      const extracted = (result.value || "").trim();
      if (extracted.length > 0) return extracted;
      if (!process.env.OPENAI_API_KEY) return extracted;
      const fallback = (await extractFileTextViaOpenAI(file.buffer, file.filename)).trim();
      return fallback || extracted;
    } catch (error) {
      console.error("Error parsing DOCX:", error);
      if (process.env.OPENAI_API_KEY) {
        try {
          const fallback = (await extractFileTextViaOpenAI(file.buffer, file.filename)).trim();
          if (fallback) return fallback;
        } catch (e) {
          console.error("Error DOCX fallback via OpenAI:", e);
        }
      }
      throw new Error("Failed to extract text from Word document");
    }
  }

  // Si es Word antiguo (.doc), intentar con mammoth (puede no funcionar bien)
  if (
    file.mimeType === "application/msword" ||
    filenameLower.endsWith(".doc")
  ) {
    try {
      // Mammoth puede intentar procesar .doc pero no siempre funciona bien
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      if (result.value && result.value.trim().length > 0) {
        return result.value;
      }
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("Could not extract text from .doc file. Please convert to .docx format.");
      }
      const fallback = (await extractFileTextViaOpenAI(file.buffer, file.filename)).trim();
      if (fallback) return fallback;
      throw new Error("Could not extract text from .doc file. Please convert to .docx format.");
    } catch (error: any) {
      console.error("Error parsing DOC:", error);
      if (process.env.OPENAI_API_KEY) {
        try {
          const fallback = (await extractFileTextViaOpenAI(file.buffer, file.filename)).trim();
          if (fallback) return fallback;
        } catch (e) {
          console.error("Error DOC fallback via OpenAI:", e);
        }
      }
      throw new Error(`Failed to extract text from Word document: ${error.message || "Please convert to .docx format"}`);
    }
  }

  // Si es texto plano (.txt), leer directamente
  if (
    file.mimeType === "text/plain" ||
    filenameLower.endsWith(".txt")
  ) {
    try {
      return file.buffer.toString("utf-8");
    } catch (error) {
      console.error("Error reading TXT:", error);
      throw new Error("Failed to read text file");
    }
  }

  // Si es imagen (JPG, JPEG, PNG)
  if (
    file.mimeType === "image/jpeg" ||
    file.mimeType === "image/jpg" ||
    filenameLower.endsWith(".jpg") ||
    filenameLower.endsWith(".jpeg") ||
    file.mimeType === "image/png" ||
    filenameLower.endsWith(".png")
  ) {
    try {
      if (isDocumentAIConfigured()) {
        const docAiText = await extractTextViaDocumentAI(file.buffer, file.mimeType);
        if (docAiText && docAiText.length >= 50) return docAiText;
      }
      const base64Image = file.buffer.toString("base64");
      const imageUrl = `data:${file.mimeType};base64,${base64Image}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Mejor OCR en imágenes/escaneados
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extrae TODO el texto de esta imagen. Si es un documento legal, contrato, o cualquier texto, extrae todo el contenido textual de manera completa y precisa. Preserva la estructura y formato del texto original."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 4096
      });

      const extractedText = response.choices[0]?.message?.content || "";
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No se pudo extraer texto de la imagen");
      }

      return extractedText;
    } catch (error: any) {
      console.error("Error processing image with OpenAI Vision:", error);
      throw new Error(`Failed to extract text from image: ${error.message || "Error desconocido"}`);
    }
  }

  // Para otros formatos no soportados
  throw new Error(`Unsupported file type: ${file.mimeType}. Supported formats: PDF, DOCX, DOC, TXT, JPG, JPEG, PNG`);
}

