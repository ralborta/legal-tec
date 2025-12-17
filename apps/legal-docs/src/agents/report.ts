import OpenAI from "openai";
import type { DistributionChecklistItem } from "./analyzerDistribution.js";
import type { TranslatedClause } from "./translator.js";
import { queryJurisprudence } from "./rag-query.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ReportInput {
  original: string;
  translated: TranslatedClause[];
  type: string;
  checklist: { items?: DistributionChecklistItem[] } | null;
}

// Estructura del reporte (similar al memo)
export interface AnalysisReport {
  titulo: string;
  tipo_documento: string;
  jurisdiccion: string;
  area_legal: string;
  resumen_ejecutivo: string;
  clausulas_analizadas: Array<{
    numero: string;
    titulo: string;
    analisis: string;
    riesgo: "bajo" | "medio" | "alto";
  }>;
  analisis_juridico: string;
  riesgos: Array<{
    descripcion: string;
    nivel: "bajo" | "medio" | "alto";
    recomendacion: string;
  }>;
  recomendaciones: string[];
  proximos_pasos: string[];
  citas: Array<{
    tipo: "normativa" | "jurisprudencia" | "doctrina" | "otra";
    referencia: string;
    descripcion?: string;
    url?: string;
  }>;
  documentos_sugeridos: Array<{
    tipo: string;
    descripcion: string;
  }>;
  texto_formateado: string;
}

// Fuentes legales organizadas por jurisdicción y área
const FUENTES_LEGALES = `
## FUENTES DE CONSULTA OBLIGATORIAS - INCLUIR URLs EN LAS CITAS

### NIVEL NACIONAL
- Boletín Oficial: https://www.boletinoficial.gob.ar/
- InfoLEG (Normativa): https://www.argentina.gob.ar/normativa
- SAIJ (Jurisprudencia): https://www.argentina.gob.ar/justicia/saij
- SIPROJUD (CSJN): http://www.csjn.gov.ar/siprojur/
- Código Civil y Comercial: http://www.bibliotecadigital.gob.ar/items/show/2690
- Constitución Nacional: https://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/804/norma.htm

### ORGANISMOS NACIONALES
- ANSES (Previsional): https://www.anses.gob.ar/institucional/normativa
- BCRA (Financiero): http://www.bcra.gov.ar/BCRAyVos/Normativa.asp
- AFIP/ARCA (Tributario): https://www.afip.gob.ar/normativa/
- Ministerio de Trabajo: https://www.argentina.gob.ar/trabajo/normativa
- Ministerio de Salud: https://www.argentina.gob.ar/salud/normativas

### LEGISLATIVO
- Cámara de Diputados: https://www.hcdn.gob.ar/
- Senado: https://www.senado.gob.ar/

### DOCTRINA Y RECURSOS ACADÉMICOS
- SAIJ (Doctrina): https://www.saij.gob.ar/
- UBA Derecho: https://www.derecho.uba.ar/investigacion/publicaciones.php
- UNLP: https://www.bibliojuridica.laplata.edu.ar/

### PROVINCIAS - Usar según jurisdicción del documento:
- CABA Boletín Oficial: https://boletinoficial.buenosaires.gob.ar/
- Buenos Aires (Normas): https://normas.gba.gob.ar/
- Córdoba Boletín Oficial: https://boletinoficial.cba.gov.ar/
- Santa Fe Boletín Oficial: https://boletinoficial.santafe.gob.ar/
- Mendoza Boletín Oficial: https://www.boletinoficial.mendoza.gov.ar/
`;

const prompt = `Eres un analista legal senior de WNS & Asociados especializado en análisis de documentos legales (contratos, acuerdos, escrituras, etc.).

INSTRUCCIONES:
1. Detecta la JURISDICCIÓN del documento (Nacional, CABA, Buenos Aires, Córdoba, Santa Fe, Mendoza, u otra provincia)
2. Identifica el ÁREA LEGAL (Civil, Comercial, Laboral, Tributario, Societario, etc.)
3. Analiza el documento completo
4. Genera un análisis estructurado en JSON

Devuelve un JSON con esta estructura EXACTA:

{
  "titulo": "Título descriptivo del análisis",
  "tipo_documento": "Tipo de documento analizado",
  "jurisdiccion": "Jurisdicción identificada (ej: Nacional, CABA, Buenos Aires)",
  "area_legal": "Área legal principal (ej: Civil y Comercial, Laboral, Societario)",
  "resumen_ejecutivo": "Resumen ejecutivo completo de 2-3 párrafos",
  "clausulas_analizadas": [
    {
      "numero": "Número de cláusula",
      "titulo": "Título de la cláusula",
      "analisis": "Análisis detallado de la cláusula",
      "riesgo": "bajo" | "medio" | "alto"
    }
  ],
  "analisis_juridico": "Análisis jurídico completo y detallado del documento",
  "riesgos": [
    {
      "descripcion": "Descripción del riesgo identificado",
      "nivel": "bajo" | "medio" | "alto",
      "recomendacion": "Recomendación para mitigar el riesgo"
    }
  ],
  "recomendaciones": ["Recomendación 1", "Recomendación 2", ...],
  "proximos_pasos": ["Acción 1", "Acción 2", ...],
  "citas": [
    {
      "tipo": "normativa" | "jurisprudencia" | "doctrina" | "otra",
      "referencia": "Referencia completa (ej: Art. 765 CCyC)",
      "descripcion": "Breve descripción",
      "url": "URL de la fuente oficial"
    }
  ],
  "documentos_sugeridos": [
    {
      "tipo": "Tipo de documento sugerido",
      "descripcion": "Por qué se sugiere este documento"
    }
  ],
  "texto_formateado": "Texto completo del análisis formateado profesionalmente para copiar"
}

IMPORTANTE:
- Las citas DEBEN incluir URLs de las fuentes oficiales proporcionadas
- Los riesgos deben ser específicos y accionables
- Las recomendaciones deben ser prácticas y aplicables
- Los documentos sugeridos deben ser relevantes para el caso
- El texto_formateado debe ser un reporte profesional completo

Devuelve SOLO el JSON válido, sin texto adicional.`;

export async function generateReport(input: ReportInput): Promise<AnalysisReport> {
  const startTime = Date.now();
  const timeout = 90000; // 90 segundos timeout
  
  try {
    // Consultar jurisprudencia relevante usando RAG
    console.log(`[REPORT] Consultando jurisprudencia para tipo: ${input.type}`);
    const jurisprudence = await queryJurisprudence(
      input.original,
      input.type,
      6 // Máximo 6 resultados
    );
    console.log(`[REPORT] Encontradas ${jurisprudence.length} fuentes de jurisprudencia`);

    const checklistText = input.checklist?.items
      ? input.checklist.items
          .map(
            (item) =>
              `- ${item.key}: ${item.found} (Riesgo: ${item.risk})\n  ${item.comment}`
          )
          .join("\n\n")
      : "No checklist disponible";

    const translatedText = input.translated
      .map((c) => `${c.clause_number}. ${c.title_es}\n${c.body_es}`)
      .join("\n\n")
      .substring(0, 6000); // Reducir tamaño

    // Formatear jurisprudencia para el prompt
    const jurisprudenceText = jurisprudence.length > 0
      ? jurisprudence
          .map(
            (j) =>
              `### ${j.title} (${j.source})\n${j.text}${j.url ? `\nFuente: ${j.url}` : ""}`
          )
          .join("\n\n")
      : "No se encontró jurisprudencia en la base de datos. Usar las fuentes de referencia proporcionadas.";

    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 4000,
        messages: [
          {
            role: "system",
            content: "Eres un analista legal senior. Devuelve SOLO JSON válido con el análisis estructurado del documento.",
          },
          {
            role: "user",
            content: `${prompt}

${FUENTES_LEGALES}

TIPO DE DOCUMENTO: ${input.type}

TEXTO ORIGINAL (primeros caracteres):
${input.original.substring(0, 3000)}

CLÁUSULAS TRADUCIDAS:
${translatedText}

CHECKLIST DE ANÁLISIS:
${checklistText}

JURISPRUDENCIA Y NORMATIVA RELEVANTE:
${jurisprudenceText}`,
          },
        ],
        response_format: { type: "json_object" },
      }, { timeout }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Report generation timeout after 90s")), timeout)
      )
    ]) as any;
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[REPORT] Completed in ${duration}s`);

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

    const parsed = JSON.parse(jsonText) as AnalysisReport;

    // Validar estructura mínima
    if (!parsed.titulo || !parsed.resumen_ejecutivo) {
      throw new Error("Respuesta de OpenAI incompleta: faltan campos requeridos");
    }

    // Asegurar arrays
    parsed.clausulas_analizadas = parsed.clausulas_analizadas || [];
    parsed.riesgos = parsed.riesgos || [];
    parsed.recomendaciones = parsed.recomendaciones || [];
    parsed.proximos_pasos = parsed.proximos_pasos || [];
    parsed.citas = parsed.citas || [];
    parsed.documentos_sugeridos = parsed.documentos_sugeridos || [];

    return parsed;
  } catch (error) {
    console.error("Error generando reporte:", error);
    
    // Devolver estructura mínima en caso de error
    return {
      titulo: "Error en el análisis",
      tipo_documento: input.type,
      jurisdiccion: "No determinada",
      area_legal: "No determinada",
      resumen_ejecutivo: `Error al generar el análisis: ${error instanceof Error ? error.message : "Error desconocido"}`,
      clausulas_analizadas: [],
      analisis_juridico: "No se pudo generar el análisis jurídico.",
      riesgos: [],
      recomendaciones: [],
      proximos_pasos: [],
      citas: [],
      documentos_sugeridos: [],
      texto_formateado: `Error al generar reporte: ${error instanceof Error ? error.message : "Error desconocido"}`
    };
  }
}

// Mantener compatibilidad con código existente que espera string
export async function generateReportText(input: ReportInput): Promise<string> {
  const report = await generateReport(input);
  return report.texto_formateado;
}
