import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

/**
 * Convierte texto markdown o plano a un documento Word (.docx)
 */
export async function convertToWord(
  content: string,
  title: string = "Documento"
): Promise<Buffer> {
  // Convertir markdown básico a párrafos de Word
  const lines = content.split("\n");
  const paragraphs: Paragraph[] = [];

  // Título del documento
  paragraphs.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    })
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Saltar líneas vacías
    if (!line) {
      paragraphs.push(
        new Paragraph({
          text: "",
          spacing: { after: 200 }
        })
      );
      continue;
    }

    // Detectar encabezados markdown
    if (line.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          text: line.substring(2),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 300 }
        })
      );
    } else if (line.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          text: line.substring(3),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 }
        })
      );
    } else if (line.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          text: line.substring(4),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 200 }
        })
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      // Lista con viñetas
      paragraphs.push(
        new Paragraph({
          text: line.substring(2),
          bullet: { level: 0 },
          spacing: { after: 100 }
        })
      );
    } else if (/^\d+\.\s/.test(line)) {
      // Lista numerada
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^\d+\.\s/, ""),
          numbering: { reference: "default-numbering", level: 0 },
          spacing: { after: 100 }
        })
      );
    } else {
      // Párrafo normal
      // Detectar texto en negrita **texto** o __texto__
      const textRuns: TextRun[] = [];
      let currentText = line;
      let boldRegex = /\*\*(.*?)\*\*|__(.*?)__/g;
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(line)) !== null) {
        // Agregar texto antes del match
        if (match.index > lastIndex) {
          textRuns.push(
            new TextRun(line.substring(lastIndex, match.index))
          );
        }
        // Agregar texto en negrita
        const boldText = match[1] || match[2];
        textRuns.push(
          new TextRun({
            text: boldText,
            bold: true
          })
        );
        lastIndex = match.index + match[0].length;
      }

      // Agregar texto restante
      if (lastIndex < line.length) {
        textRuns.push(
          new TextRun(line.substring(lastIndex))
        );
      }

      // Si no hay texto en negrita, usar el texto completo
      if (textRuns.length === 0) {
        textRuns.push(new TextRun(line));
      }

      paragraphs.push(
        new Paragraph({
          children: textRuns,
          spacing: { after: 200 }
        })
      );
    }
  }

  // Crear el documento Word
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  });

  // Generar el buffer del documento
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
