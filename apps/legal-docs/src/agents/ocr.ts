import OpenAI from "openai";
import { PDFParse } from "pdf-parse";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function ocrAgent(file: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<string> {
  // Si es PDF, extraer texto directamente
  if (file.mimeType === "application/pdf" || file.filename.toLowerCase().endsWith(".pdf")) {
    try {
      const parser = new PDFParse({ data: file.buffer });
      try {
        const data = await parser.getText();
        return data.text;
      } finally {
        await parser.destroy();
      }
    } catch (error) {
      console.error("Error parsing PDF:", error);
      throw new Error("Failed to extract text from PDF");
    }
  }

  // Para otros formatos, usar visión de OpenAI
  // Por ahora solo soportamos PDF
  throw new Error(`Unsupported file type: ${file.mimeType}`);
}

