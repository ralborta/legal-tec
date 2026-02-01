import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { writeFileSync, unlinkSync, createReadStream } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractPdfTextViaOpenAIResponses(buffer: Buffer, filename: string): Promise<string> {
  // Nota: el SDK/entorno puede no soportar Responses API. Este método se llama dentro de try/catch.
  const base64 = buffer.toString("base64");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientAny = openai as any;
  if (!clientAny.responses || typeof clientAny.responses.create !== "function") {
    throw new Error("Responses API no disponible en este SDK/runtime");
  }

  const response = await clientAny.responses.create({
    model: "gpt-4o-mini",
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

async function extractPdfTextViaOpenAI(buffer: Buffer, filename: string): Promise<string> {
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
      model: "gpt-4o-mini",
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
    try {
      const parser = new PDFParse({ data: file.buffer });
      try {
        const data = await parser.getText();
        const extracted = (data.text || "").trim();
        if (extracted.length >= 200) {
          return extracted;
        }
        if (!process.env.OPENAI_API_KEY) {
          return extracted;
        }
        const ocrText = (await extractPdfTextViaOpenAI(file.buffer, file.filename)).trim();
        return ocrText || extracted;
      } finally {
        await parser.destroy();
      }
    } catch (error) {
      console.error("Error parsing PDF:", error);
      if (process.env.OPENAI_API_KEY) {
        try {
          const ocrText = (await extractPdfTextViaOpenAI(file.buffer, file.filename)).trim();
          if (ocrText) return ocrText;
        } catch (e) {
          console.error("Error OCR fallback for PDF:", e);
        }
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
      return result.value;
    } catch (error) {
      console.error("Error parsing DOCX:", error);
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
      throw new Error("Could not extract text from .doc file. Please convert to .docx format.");
    } catch (error: any) {
      console.error("Error parsing DOC:", error);
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

  // Si es imagen (JPG, JPEG, PNG), usar OpenAI Vision API
  if (
    file.mimeType === "image/jpeg" ||
    file.mimeType === "image/jpg" ||
    filenameLower.endsWith(".jpg") ||
    filenameLower.endsWith(".jpeg") ||
    file.mimeType === "image/png" ||
    filenameLower.endsWith(".png")
  ) {
    try {
      // Convertir imagen a base64 para OpenAI Vision
      const base64Image = file.buffer.toString("base64");
      const imageUrl = `data:${file.mimeType};base64,${base64Image}`;

      // Usar OpenAI Vision API para extraer texto
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Cambiado a mini para reducir costos // gpt-4o tiene mejor soporte para visión
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

