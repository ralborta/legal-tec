import { readFile } from "fs/promises";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import mammoth from "mammoth";
import type { MemoOutput } from "../memos/types.js";
import OpenAI from "openai";

/**
 * Analiza un template .docx y extrae las variables que necesita
 */
async function extractTemplateVariables(
  templateBuffer: Buffer
): Promise<string[]> {
  try {
    // Convertir el docx a texto para analizar los placeholders
    const { value: text } = await mammoth.extractRawText({ buffer: templateBuffer });
    
    // Buscar todas las variables en formato {{variable}} o {{#variable}}
    const variableRegex = /\{\{([#\/]?)([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
    const variables = new Set<string>();
    let match;
    
    while ((match = variableRegex.exec(text)) !== null) {
      const varName = match[2];
      // Ignorar comandos especiales de docxtemplater
      if (!varName.startsWith('if') && !varName.startsWith('each') && varName !== 'end') {
        variables.add(varName);
      }
    }
    
    return Array.from(variables);
  } catch (error) {
    console.error("Error al extraer variables del template:", error);
    // Retornar variables comunes como fallback
    return [
      "fecha_actual",
      "titulo_documento",
      "partes_involucradas",
      "objeto_contrato",
      "condiciones_principales",
      "monto_valor",
      "plazo_duracion",
      "lugar",
      "resumen_ejecutivo",
      "analisis_relevante",
      "riesgos_importantes",
      "proximos_pasos"
    ];
  }
}

/**
 * Extrae información estructurada del memo usando IA para rellenar templates
 * Ahora analiza el template primero para saber qué variables necesita
 */
async function extractTemplateDataFromMemo(
  openaiKey: string,
  memo: MemoOutput,
  templateId: string,
  templateBuffer: Buffer
): Promise<Record<string, any>> {
  const openai = new OpenAI({ apiKey: openaiKey });

  // Primero, analizar el template para ver qué variables necesita
  const templateVariables = await extractTemplateVariables(templateBuffer);
  console.log(`[TEMPLATE FILL] Variables encontradas en template: ${templateVariables.join(", ")}`);

  // Obtener el texto del template para contexto
  let templateText = "";
  try {
    const { value: text } = await mammoth.extractRawText({ buffer: templateBuffer });
    templateText = text.substring(0, 2000); // Primeros 2000 caracteres para contexto
  } catch (error) {
    console.warn("No se pudo extraer texto del template para contexto:", error);
  }

  // Construir el prompt con las variables específicas del template
  const variablesDescription = templateVariables.map(v => {
    // Mapear nombres comunes a descripciones
    const descriptions: Record<string, string> = {
      fecha_actual: "Fecha actual en formato DD/MM/YYYY",
      fecha: "Fecha en formato DD/MM/YYYY",
      fecha_documento: "Fecha del documento en formato DD/MM/YYYY",
      titulo: "Título del documento",
      titulo_documento: "Título apropiado para el documento",
      partes: "Nombres de las partes involucradas (cliente, contraparte, etc.)",
      partes_involucradas: "Nombres de las partes mencionadas (cliente, contraparte, etc.)",
      objeto: "Objeto o propósito principal del documento",
      objeto_contrato: "Descripción del objeto o propósito principal",
      condiciones: "Condiciones o términos principales",
      condiciones_principales: "Condiciones o términos principales mencionados",
      monto: "Monto o valor mencionado",
      monto_valor: "Montos o valores mencionados (si aplica)",
      valor: "Valor monetario mencionado",
      plazo: "Plazo o duración mencionado",
      plazo_duracion: "Plazos o duraciones mencionados (si aplica)",
      duracion: "Duración del contrato o acuerdo",
      lugar: "Lugar mencionado (si aplica)",
      resumen: "Resumen breve del memo",
      resumen_ejecutivo: "Resumen breve del memo (2-3 líneas)",
      analisis: "Análisis jurídico relevante",
      analisis_relevante: "Análisis jurídico más relevante para el documento",
      riesgos: "Riesgos principales",
      riesgos_importantes: "Riesgos principales a considerar",
      proximos_pasos: "Próximos pasos a seguir",
      hechos: "Hechos relevantes del caso",
      base_normativa: "Base normativa aplicable",
      jurisprudencia: "Jurisprudencia relevante",
      conclusion: "Conclusión del análisis",
      recomendaciones: "Recomendaciones",
      obligaciones: "Obligaciones de las partes",
      incumplimiento: "Consecuencias del incumplimiento",
      jurisdiccion: "Jurisdicción competente",
      caratula: "Carátula del expediente",
      derecho: "Fundamento legal",
      petitorio: "Petitorio o solicitud",
    };
    return `- ${v}: ${descriptions[v] || `Valor para ${v}`}`;
  }).join("\n");

  // Formatear citas si existen
  const citasFormateadas = memo.citas && memo.citas.length > 0
    ? memo.citas.map((c: any) => {
        const tipo = c.tipo || "otra";
        const ref = c.referencia || "";
        const desc = c.descripcion ? ` – ${c.descripcion}` : "";
        const url = c.url ? ` (${c.url})` : "";
        return `- [${tipo}] ${ref}${desc}${url}`;
      }).join("\n")
    : "";

  const prompt = `Eres un asistente jurídico experto. Analiza el siguiente memo jurídico y extrae la información necesaria para rellenar un template de documento legal.

MEMO:
Título: ${memo.titulo || "Sin título"}
Tipo: ${memo.tipo_documento || "Sin tipo"}
Resumen: ${memo.resumen || ""}
Análisis Jurídico: ${memo.analisis_juridico || ""}
Puntos Tratados: ${memo.puntos_tratados?.join(", ") || ""}
Próximos Pasos: ${memo.proximos_pasos?.join(", ") || ""}
Riesgos: ${memo.riesgos?.join(", ") || ""}
Texto Formateado: ${memo.texto_formateado?.substring(0, 1000) || ""}

CITAS Y FUENTES LEGALES DEL MEMO:
${citasFormateadas || "No hay citas disponibles"}

Template ID: ${templateId}

CONTEXTO DEL TEMPLATE (primeros caracteres):
${templateText || "No disponible"}

VARIABLES QUE NECESITA EL TEMPLATE:
${variablesDescription}

INSTRUCCIONES:
1. Extrae SOLO las variables que aparecen en la lista de arriba
2. Para fechas, usa formato DD/MM/YYYY (ejemplo: 15/01/2025)
3. Si una variable no está disponible en el memo, usa un valor por defecto apropiado o string vacío
4. Para montos, incluye el símbolo de moneda si está mencionado (ej: "$100.000" o "USD 50.000")
5. Para fechas, si no hay fecha específica en el memo, usa la fecha actual
6. Si el template tiene una variable para citas (citas, fuentes, bibliografia, referencias), incluye las citas formateadas del memo
7. Asegúrate de que los valores sean coherentes y profesionales

Responde SOLO con un JSON válido con las claves de las variables listadas arriba.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "Eres un asistente jurídico que extrae información estructurada de memos para rellenar templates de documentos legales. Responde SOLO con JSON válido. Asegúrate de incluir TODAS las variables solicitadas, incluso si están vacías."
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
    
    // Normalizar fechas - asegurar que todas las variables de fecha tengan formato correcto
    const fechaActual = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    // Normalizar todas las variables de fecha encontradas
    templateVariables.forEach(v => {
      if (v.includes('fecha') || v.includes('date')) {
        if (!extractedData[v] || extractedData[v] === '') {
          extractedData[v] = fechaActual;
        } else {
          // Asegurar formato DD/MM/YYYY
          const fecha = extractedData[v];
          if (typeof fecha === 'string' && !fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            // Intentar parsear y reformatear
            try {
              const dateObj = new Date(fecha);
              if (!isNaN(dateObj.getTime())) {
                extractedData[v] = dateObj.toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                });
              } else {
                extractedData[v] = fechaActual;
              }
            } catch {
              extractedData[v] = fechaActual;
            }
          }
        }
      }
    });

    // Asegurar que todas las variables del template estén presentes
    templateVariables.forEach(v => {
      if (!(v in extractedData)) {
        // Si es una variable de citas y hay citas en el memo, incluirlas
        if ((v.includes('cita') || v.includes('fuente') || v.includes('bibliografia') || v.includes('referencia')) && citasFormateadas) {
          extractedData[v] = citasFormateadas;
        } else {
          extractedData[v] = "";
        }
      }
    });

    // Si hay citas y el template tiene alguna variable relacionada, asegurar que estén incluidas
    if (citasFormateadas) {
      const citasVars = templateVariables.filter(v => 
        v.includes('cita') || v.includes('fuente') || v.includes('bibliografia') || v.includes('referencia')
      );
      citasVars.forEach(v => {
        if (!extractedData[v] || extractedData[v] === "") {
          extractedData[v] = citasFormateadas;
        }
      });
    }

    console.log(`[TEMPLATE FILL] Datos extraídos para ${templateVariables.length} variables`);
    return extractedData;
  } catch (error) {
    console.error("Error al extraer datos del memo:", error);
    // Retornar datos básicos como fallback con todas las variables necesarias
    const fechaActual = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    const fallbackData: Record<string, any> = {};
    templateVariables.forEach(v => {
      if (v.includes('fecha') || v.includes('date')) {
        fallbackData[v] = fechaActual;
      } else if (v.includes('titulo')) {
        fallbackData[v] = memo.titulo || "";
      } else if (v.includes('partes')) {
        fallbackData[v] = "Partes mencionadas en el memo";
      } else if (v.includes('objeto')) {
        fallbackData[v] = memo.resumen || "";
      } else if (v.includes('resumen')) {
        fallbackData[v] = memo.resumen || "";
      } else if (v.includes('analisis')) {
        fallbackData[v] = memo.analisis_juridico?.substring(0, 500) || "";
      } else if (v.includes('riesgo')) {
        fallbackData[v] = memo.riesgos?.join(", ") || "";
      } else if (v.includes('paso')) {
        fallbackData[v] = memo.proximos_pasos?.join(", ") || "";
      } else if ((v.includes('cita') || v.includes('fuente') || v.includes('bibliografia') || v.includes('referencia')) && memo.citas && memo.citas.length > 0) {
        // Incluir citas formateadas en el fallback
        fallbackData[v] = memo.citas.map((c: any) => {
          const tipo = c.tipo || "otra";
          const ref = c.referencia || "";
          const desc = c.descripcion ? ` – ${c.descripcion}` : "";
          const url = c.url ? ` (${c.url})` : "";
          return `- [${tipo}] ${ref}${desc}${url}`;
        }).join("\n");
      } else {
        fallbackData[v] = "";
      }
    });
    
    return fallbackData;
  }
}

/**
 * Rellena un template .docx con datos del memo
 * Ahora analiza el template primero para entender qué variables necesita
 */
export async function fillTemplateWithMemoData(
  templatePath: string,
  memo: MemoOutput,
  templateId: string,
  openaiKey: string
): Promise<Buffer> {
  // Leer el template
  const templateBuffer = await readFile(templatePath);

  // Extraer datos del memo usando IA (ahora analiza el template primero)
  const templateData = await extractTemplateDataFromMemo(openaiKey, memo, templateId, templateBuffer);

  // Procesar el template con docxtemplater
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: (part) => {
      // Manejar variables faltantes de forma más elegante
      console.warn(`[TEMPLATE FILL] Variable faltante: ${part.module}`);
      return "";
    },
  });

  // Rellenar el template con los datos extraídos
  // Los templates deben usar sintaxis {{variable}} para los placeholders
  doc.setData(templateData);

  try {
    doc.render();
    console.log(`[TEMPLATE FILL] Template rellenado exitosamente con ${Object.keys(templateData).length} variables`);
  } catch (error: any) {
    console.error("Error al renderizar template:", error);
    console.error("Variables disponibles:", Object.keys(templateData));
    console.error("Detalles del error:", error.properties);
    
    // Si hay errores de renderizado, intentar identificar qué variables faltan
    if (error.properties && error.properties.errors) {
      const missingVars = error.properties.errors
        .filter((e: any) => e.name === 'UnclosedTagError' || e.name === 'UnopenedTagError')
        .map((e: any) => e.explanation);
      console.error("Variables con problemas:", missingVars);
    }
    
    // Intentar con datos mínimos como último recurso
    const minimalData: Record<string, any> = {};
    const fechaActual = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    // Extraer variables del template para el fallback
    const templateVars = await extractTemplateVariables(templateBuffer);
    templateVars.forEach(v => {
      if (v.includes('fecha')) {
        minimalData[v] = fechaActual;
      } else if (v.includes('titulo')) {
        minimalData[v] = memo.titulo || "";
      } else {
        minimalData[v] = "";
      }
    });
    
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

