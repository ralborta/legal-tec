import OpenAI from "openai";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function ocrAgent(file: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<string> {
  const filenameLower = file.filename.toLowerCase();
  
  // Si es PDF, extraer texto directamente
  if (file.mimeType === "application/pdf" || filenameLower.endsWith(".pdf")) {
    try {
      const data = await pdfParse(file.buffer);
      return data.text;
    } catch (error) {
      console.error("Error parsing PDF:", error);
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

  // Para otros formatos, usar visión de OpenAI (futuro)
  throw new Error(`Unsupported file type: ${file.mimeType}. Supported formats: PDF, DOCX`);
}

