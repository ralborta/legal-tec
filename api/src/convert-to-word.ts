import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

/**
 * Convierte texto markdown o plano a un documento Word (.docx)
 */
export async function convertToWord(
  content: string,
  title: string = "Documento"
): Promise<Buffer> {
  // Validar entrada
  if (!content || typeof content !== 'string') {
    throw new Error("El contenido debe ser una cadena de texto válida");
  }

  // Limpiar y normalizar el contenido
  const cleanContent = content.trim();
  if (!cleanContent) {
    throw new Error("El contenido no puede estar vacío");
  }

  // Convertir markdown básico a párrafos de Word
  const lines = cleanContent.split("\n");
  const paragraphs: Paragraph[] = [];

  // Título del documento
  paragraphs.push(
    new Paragraph({
      children: [new TextRun(title)],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    })
  );

  // Agregar un párrafo vacío después del título
  paragraphs.push(
    new Paragraph({
      text: ""
    })
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Saltar líneas vacías (pero agregar un párrafo vacío ocasionalmente)
    if (!line) {
      if (i > 0 && lines[i - 1]?.trim()) {
        paragraphs.push(
          new Paragraph({
            text: ""
          })
        );
      }
      continue;
    }

    // Detectar encabezados markdown
    if (line.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line.substring(2))],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 300 }
        })
      );
    } else if (line.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line.substring(3))],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 200 }
        })
      );
    } else if (line.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line.substring(4))],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 200 }
        })
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      // Lista con viñetas - simplificado sin bullet config
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(`• ${line.substring(2)}`)],
          spacing: { after: 100 }
        })
      );
    } else if (/^\d+\.\s/.test(line)) {
      // Lista numerada - mantener el número original
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 100 }
        })
      );
    } else {
      // Párrafo normal
      // Detectar texto en negrita **texto** o __texto__
      const textRuns: TextRun[] = [];
      let boldRegex = /\*\*(.*?)\*\*|__(.*?)__/g;
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(line)) !== null) {
        // Agregar texto antes del match
        if (match.index > lastIndex) {
          const textBefore = line.substring(lastIndex, match.index);
          if (textBefore) {
            textRuns.push(new TextRun(textBefore));
          }
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
        const textAfter = line.substring(lastIndex);
        if (textAfter) {
          textRuns.push(new TextRun(textAfter));
        }
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

  // Crear el documento Word con estructura mínima válida
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs.length > 0 ? paragraphs : [
          new Paragraph({
            children: [new TextRun("Documento vacío")]
          })
        ]
      }
    ]
  });

  // Generar el buffer del documento
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}
