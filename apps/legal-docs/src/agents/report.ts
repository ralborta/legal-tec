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
  userInstructions?: string;
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

INSTRUCCIONES CRÍTICAS:
1. Detecta la JURISDICCIÓN del documento (Nacional, CABA, Buenos Aires, Córdoba, Santa Fe, Mendoza, u otra provincia)
2. Identifica el ÁREA LEGAL (Civil, Comercial, Laboral, Tributario, Societario, etc.)
3. Analiza TODAS las cláusulas del documento - NO omitas ninguna
4. Genera un análisis EXTENSO y DETALLADO

REQUISITOS DE EXTENSIÓN:
- "resumen_ejecutivo": MÍNIMO 3-4 párrafos completos describiendo el documento, partes, objeto, y aspectos más relevantes
- "clausulas_analizadas": OBLIGATORIO analizar CADA cláusula del documento. Mínimo 5-10 cláusulas. Para cada una incluir análisis detallado.
- "analisis_juridico": MÍNIMO 4-5 párrafos con análisis legal profundo, normativa aplicable, interpretación jurídica
- "riesgos": MÍNIMO 3-5 riesgos identificados con nivel y recomendación específica
- "recomendaciones": MÍNIMO 5 recomendaciones prácticas y específicas
- "proximos_pasos": MÍNIMO 3-5 acciones concretas a tomar
- "citas": MÍNIMO 3-5 citas de normativa/jurisprudencia relevante CON URLs
- "documentos_sugeridos": MÍNIMO 2-3 documentos que podrían complementar o ser necesarios

Devuelve un JSON con esta estructura EXACTA:

{
  "titulo": "Análisis Legal de [tipo de documento] - [partes involucradas]",
  "tipo_documento": "Tipo específico (ej: Contrato de Locación, Contrato de Distribución, Acuerdo de Confidencialidad)",
  "jurisdiccion": "Jurisdicción identificada",
  "area_legal": "Área legal principal",
  "resumen_ejecutivo": "Resumen EXTENSO de 3-4 párrafos. Incluir: partes del contrato, objeto, plazo, precio/contraprestación, aspectos más relevantes, contexto general.",
  "clausulas_analizadas": [
    {
      "numero": "1",
      "titulo": "Título de la cláusula",
      "analisis": "Análisis DETALLADO de la cláusula: qué establece, implicancias legales, si es favorable/desfavorable, comparación con estándares del mercado",
      "riesgo": "bajo" | "medio" | "alto"
    }
  ],
  "analisis_juridico": "Análisis jurídico EXTENSO de 4-5 párrafos. Incluir: marco normativo aplicable, interpretación de cláusulas clave, validez legal, posibles conflictos, jurisprudencia relevante si aplica.",
  "riesgos": [
    {
      "descripcion": "Descripción ESPECÍFICA del riesgo",
      "nivel": "bajo" | "medio" | "alto",
      "recomendacion": "Recomendación CONCRETA para mitigar este riesgo"
    }
  ],
  "recomendaciones": [
    "Recomendación específica y accionable 1",
    "Recomendación específica y accionable 2"
  ],
  "proximos_pasos": [
    "Acción concreta 1 con responsable si corresponde",
    "Acción concreta 2 con plazo si corresponde"
  ],
  "citas": [
    {
      "tipo": "normativa",
      "referencia": "Art. XXX del Código Civil y Comercial",
      "descripcion": "Descripción de qué regula este artículo",
      "url": "URL de la fuente oficial"
    }
  ],
  "documentos_sugeridos": [
    {
      "tipo": "Tipo de documento",
      "descripcion": "Por qué se sugiere y para qué serviría"
    }
  ],
  "texto_formateado": "Reporte completo formateado profesionalmente (ver formato abajo)"
}

FORMATO PARA "texto_formateado":
═══════════════════════════════════════════════════════════════════════════════
                              WNS & ASOCIADOS
                         ANÁLISIS LEGAL DE DOCUMENTO
═══════════════════════════════════════════════════════════════════════════════

DOCUMENTO: [Tipo de documento]
PARTES: [Partes involucradas]
FECHA DE ANÁLISIS: [Fecha actual]
JURISDICCIÓN: [Jurisdicción]
ÁREA LEGAL: [Área legal]

═══════════════════════════════════════════════════════════════════════════════
                          I. RESUMEN EJECUTIVO
═══════════════════════════════════════════════════════════════════════════════

[Resumen extenso de 3-4 párrafos]

═══════════════════════════════════════════════════════════════════════════════
                       II. ANÁLISIS DE CLÁUSULAS
═══════════════════════════════════════════════════════════════════════════════

[Para cada cláusula analizada, incluir número, título, análisis y nivel de riesgo]

═══════════════════════════════════════════════════════════════════════════════
                        III. ANÁLISIS JURÍDICO
═══════════════════════════════════════════════════════════════════════════════

[Análisis jurídico extenso]

═══════════════════════════════════════════════════════════════════════════════
                      IV. RIESGOS IDENTIFICADOS
═══════════════════════════════════════════════════════════════════════════════

[Lista de riesgos con nivel y recomendación]

═══════════════════════════════════════════════════════════════════════════════
                        V. RECOMENDACIONES
═══════════════════════════════════════════════════════════════════════════════

[Lista de recomendaciones]

═══════════════════════════════════════════════════════════════════════════════
                         VI. PRÓXIMOS PASOS
═══════════════════════════════════════════════════════════════════════════════

[Lista de acciones a tomar]

═══════════════════════════════════════════════════════════════════════════════
                     VII. FUENTES Y REFERENCIAS
═══════════════════════════════════════════════════════════════════════════════

[Lista de citas con URLs]

═══════════════════════════════════════════════════════════════════════════════

WNS & ASOCIADOS
Estudio Jurídico Integral

═══════════════════════════════════════════════════════════════════════════════

Devuelve SOLO el JSON válido, sin texto adicional.`;

export async function generateReport(input: ReportInput): Promise<AnalysisReport> {
  const startTime = Date.now();
  const timeout = 120000; // 120 segundos timeout (más tiempo para análisis extenso)
  
  try {
    // Consultar jurisprudencia relevante usando RAG
    console.log(`[REPORT] Consultando jurisprudencia para tipo: ${input.type}`);
    const instructions = (input.userInstructions || "").trim();
    const instructionsText = instructions
      ? instructions.slice(0, 2000) // Aumentar límite para incluir contexto del chat
      : "Sin indicaciones adicionales del usuario.";
    if (instructions) {
      console.log(`[REPORT] Aplicando instrucciones del usuario (${instructions.length} chars)`);
    }
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

    // Usar más texto del documento para mejor análisis
    const translatedText = input.translated
      .map((c) => `${c.clause_number}. ${c.title_es}\n${c.body_es}`)
      .join("\n\n")
      .substring(0, 10000); // Aumentado para mejor análisis

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
        max_tokens: 6000, // Aumentado para respuestas más extensas
      messages: [
        {
          role: "system",
            content: "Eres un analista legal senior. Genera análisis EXTENSOS y DETALLADOS. Devuelve SOLO JSON válido.",
        },
        {
          role: "user",
          content: `${prompt}

${FUENTES_LEGALES}

═══════════════════════════════════════════════════════════════════════════════
🚨🚨🚨 INSTRUCCIONES Y CONTEXTO DEL USUARIO - PRIORIDAD ABSOLUTA 🚨🚨🚨
═══════════════════════════════════════════════════════════════════════════════

${instructionsText}

═══════════════════════════════════════════════════════════════════════════════
⚠️ REGLAS CRÍTICAS - DEBES SEGUIR ESTAS INSTRUCCIONES OBLIGATORIAMENTE:
═══════════════════════════════════════════════════════════════════════════════

1. Si el usuario solicita un enfoque diferente en el análisis, DEBES APLICARLO en TODO el análisis (resumen, cláusulas, riesgos, recomendaciones).

2. Si el usuario indica criterios específicos o conclusiones del chat, DEBES INCORPORARLOS en:
   - El análisis jurídico
   - La evaluación de riesgos
   - Las recomendaciones
   - Los próximos pasos

3. Si el usuario menciona preocupaciones específicas, DEBES REFLEJARLAS en los riesgos identificados.

4. Las recomendaciones DEBEN ALINEARSE con las instrucciones y conclusiones del chat.

5. El texto completo del análisis DEBE REFLEJAR el enfoque y criterios mencionados en el chat.

6. NO ignores estas instrucciones. Tienen PRIORIDAD sobre cualquier análisis genérico.

═══════════════════════════════════════════════════════════════════════════════

TIPO DE DOCUMENTO: ${input.type}

TEXTO ORIGINAL:
${input.original.substring(0, 5000)}

CLÁUSULAS DEL DOCUMENTO (analizar TODAS):
${translatedText}

CHECKLIST DE ANÁLISIS PREVIO:
${checklistText}

JURISPRUDENCIA Y NORMATIVA RELEVANTE:
${jurisprudenceText}

IMPORTANTE: El análisis debe ser EXTENSO y DETALLADO. Analiza TODAS las cláusulas del documento.`,
          },
        ],
        response_format: { type: "json_object" },
      }, { timeout }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Report generation timeout after 120s")), timeout)
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
