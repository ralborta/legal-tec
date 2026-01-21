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
        model: "gpt-4o", // gpt-4o tiene mejor soporte para visión
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

