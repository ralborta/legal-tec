import { readFile } from "fs/promises";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type { MemoOutput } from "../memos/types.js";
import OpenAI from "openai";

/**
 * Extrae información estructurada del memo usando IA para rellenar templates
 */
async function extractTemplateDataFromMemo(
  openaiKey: string,
  memo: MemoOutput,
  templateId: string
): Promise<Record<string, any>> {
  const openai = new OpenAI({ apiKey: openaiKey });

  const prompt = `Eres un asistente jurídico experto. Analiza el siguiente memo jurídico y extrae la información necesaria para rellenar un template de documento legal.

MEMO:
Título: ${memo.titulo}
Tipo: ${memo.tipo_documento}
Resumen: ${memo.resumen}
Análisis Jurídico: ${memo.analisis_juridico}
Puntos Tratados: ${memo.puntos_tratados.join(", ")}
Próximos Pasos: ${memo.proximos_pasos.join(", ")}
Riesgos: ${memo.riesgos.join(", ")}

Template ID: ${templateId}

Extrae y estructura la siguiente información del memo:
- fecha_actual: Fecha actual en formato DD/MM/YYYY
- titulo_documento: Título apropiado para el documento
- partes_involucradas: Nombres de las partes mencionadas (cliente, contraparte, etc.)
- objeto_contrato: Descripción del objeto o propósito principal
- condiciones_principales: Condiciones o términos principales mencionados
- monto_valor: Montos o valores mencionados (si aplica)
- plazo_duracion: Plazos o duraciones mencionados (si aplica)
- lugar: Lugar mencionado (si aplica)
- resumen_ejecutivo: Resumen breve del memo (2-3 líneas)
- analisis_relevante: Análisis jurídico más relevante para el documento
- riesgos_importantes: Riesgos principales a considerar
- proximos_pasos: Próximos pasos a seguir

Responde SOLO con un JSON válido con estas claves. Si alguna información no está disponible, usa valores por defecto apropiados o strings vacíos.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "Eres un asistente jurídico que extrae información estructurada de memos para rellenar templates de documentos legales. Responde SOLO con JSON válido."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI no devolvió contenido");
    }

    // Limpiar JSON si viene con markdown
    let jsonText = content.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }

    const extractedData = JSON.parse(jsonText);
    
    // Agregar fecha actual si no viene
    if (!extractedData.fecha_actual) {
      const now = new Date();
      extractedData.fecha_actual = now.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }

    return extractedData;
  } catch (error) {
    console.error("Error al extraer datos del memo:", error);
    // Retornar datos básicos como fallback
    return {
      fecha_actual: new Date().toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }),
      titulo_documento: memo.titulo,
      partes_involucradas: "Partes mencionadas en el memo",
      objeto_contrato: memo.resumen,
      condiciones_principales: memo.puntos_tratados.join(", "),
      resumen_ejecutivo: memo.resumen,
      analisis_relevante: memo.analisis_juridico.substring(0, 500),
      riesgos_importantes: memo.riesgos.join(", "),
      proximos_pasos: memo.proximos_pasos.join(", ")
    };
  }
}

/**
 * Rellena un template .docx con datos del memo
 */
export async function fillTemplateWithMemoData(
  templatePath: string,
  memo: MemoOutput,
  templateId: string,
  openaiKey: string
): Promise<Buffer> {
  // Leer el template
  const templateBuffer = await readFile(templatePath);

  // Extraer datos del memo usando IA
  const templateData = await extractTemplateDataFromMemo(openaiKey, memo, templateId);

  // Procesar el template con docxtemplater
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Rellenar el template con los datos extraídos
  // Los templates deben usar sintaxis {{variable}} para los placeholders
  doc.setData(templateData);

  try {
    doc.render();
  } catch (error: any) {
    console.error("Error al renderizar template:", error);
    // Si hay errores de renderizado, intentar con datos mínimos
    const minimalData = {
      fecha_actual: templateData.fecha_actual,
      titulo_documento: memo.titulo,
      resumen_ejecutivo: memo.resumen,
    };
    doc.setData(minimalData);
    doc.render();
  }

  // Generar el buffer del documento rellenado
  const buf = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return buf;
}

