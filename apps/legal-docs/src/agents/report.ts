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
⚠️⚠️⚠️ REGLAS CRÍTICAS - DEBES APLICAR ESTAS INSTRUCCIONES A TODAS LAS SECCIONES ⚠️⚠️⚠️
═══════════════════════════════════════════════════════════════════════════════

LEE Y APLICA CADA PUNTO DE LAS INSTRUCCIONES DEL USUARIO MOSTRADAS ARRIBA EN TODAS Y CADA UNA DE LAS SECCIONES DEL ANÁLISIS.

🚨 OBLIGATORIO: Las instrucciones del usuario DEBEN reflejarse en:

1. ✅ RESUMEN EJECUTIVO (resumen_ejecutivo):
   - Si el usuario solicita un enfoque diferente (ej: desde el punto de vista del contribuyente), el resumen DEBE reflejar ese enfoque
   - Si menciona beneficios o riesgos específicos, DEBEN aparecer en el resumen
   - El resumen DEBE alinearse con las instrucciones del chat

2. ✅ PUNTOS TRATADOS / CLÁUSULAS ANALIZADAS (clausulas_analizadas):
   - Cada cláusula analizada DEBE reflejar el enfoque solicitado
   - Si el usuario menciona un punto de vista específico, CADA análisis de cláusula DEBE incorporarlo
   - Los riesgos de cada cláusula DEBEN evaluarse según los criterios del chat
   - NO uses análisis genéricos, usa el enfoque específico del chat

3. ✅ RIESGOS (riesgos):
   - 🚨 CRÍTICO: Los riesgos DEBEN ser COHERENTES con el enfoque solicitado en el chat
   - Si el usuario solicita "punto de vista del contribuyente", los riesgos DEBEN ser riesgos PARA EL CONTRIBUYENTE (no para el Estado)
   - Si el usuario solicita "punto de vista del Estado", los riesgos DEBEN ser riesgos PARA EL ESTADO
   - Si el usuario menciona beneficios, los riesgos DEBEN balancearse mostrando también qué podría salir mal desde esa perspectiva
   - El nivel de riesgo DEBE evaluarse según el enfoque: un riesgo "alto" para el Estado puede ser "bajo" para el contribuyente y viceversa
   - Cada riesgo DEBE tener una recomendación específica alineada con las instrucciones y el enfoque solicitado
   - NO uses riesgos genéricos. Cada riesgo DEBE reflejar el punto de vista específico mencionado en el chat
   - Si el chat menciona un enfoque diferente, REESCRIBE los riesgos desde ese enfoque, no solo cambies el resumen

4. ✅ ANÁLISIS JURÍDICO (analisis_juridico):
   - El análisis jurídico COMPLETO DEBE incorporar el enfoque del chat
   - Si se solicita un punto de vista diferente, TODO el análisis jurídico DEBE reflejarlo
   - Las interpretaciones legales DEBEN alinearse con las instrucciones

5. ✅ RECOMENDACIONES (recomendaciones):
   - TODAS las recomendaciones DEBEN alinearse con las instrucciones del chat
   - Si se mencionan beneficios, las recomendaciones DEBEN incluirlos
   - Las recomendaciones DEBEN ser específicas y reflejar el enfoque solicitado

6. ✅ PRÓXIMOS PASOS (proximos_pasos):
   - Los próximos pasos DEBEN reflejar las acciones sugeridas en el chat
   - DEBEN ser coherentes con el enfoque y criterios mencionados

7. ✅ TEXTO FORMATEADO COMPLETO (texto_formateado):
   - TODO el texto formateado DEBE reflejar el enfoque del chat
   - NO uses texto genérico, incorpora las instrucciones en CADA sección del texto
   - El texto completo DEBE ser coherente con las instrucciones del usuario
   - Si se solicita un punto de vista diferente, TODO el texto DEBE reflejarlo

🚨 EJEMPLO: Si el usuario dice "hacer el análisis desde el punto de vista del contribuyente":
   - El resumen DEBE mencionar beneficios para el contribuyente
   - Las cláusulas DEBEN analizarse desde la perspectiva del contribuyente
   - 🚨 RIESGOS: DEBEN ser riesgos PARA EL CONTRIBUYENTE, por ejemplo:
     * "Riesgo de que el contribuyente no pueda aprovechar los beneficios de la ley si no cumple con los requisitos"
     * "Riesgo de que el contribuyente sea sancionado si no entiende correctamente las nuevas disposiciones"
     * "Riesgo de que el contribuyente pierda oportunidades de regularización si no actúa a tiempo"
     * NO uses riesgos como "Riesgo de evasión para el Estado" - ese es un riesgo para el Estado, no para el contribuyente
   - El análisis jurídico DEBE enfocarse en derechos y beneficios del contribuyente
   - Las recomendaciones DEBEN ser para el contribuyente (cómo aprovechar beneficios, cómo evitar sanciones, etc.)
   - TODO el texto formateado DEBE reflejar este enfoque

🚨 EJEMPLO: Si el usuario menciona "beneficios de la ley para los contribuyentes":
   - El resumen DEBE incluir una sección sobre beneficios
   - Las cláusulas DEBEN analizarse destacando beneficios
   - 🚨 RIESGOS: DEBEN balancearse mostrando qué podría salir mal desde la perspectiva del contribuyente:
     * "Riesgo de que el contribuyente no cumpla con los requisitos para acceder a los beneficios"
     * "Riesgo de que el contribuyente no aproveche las oportunidades de regularización a tiempo"
     * "Riesgo de que el contribuyente no entienda correctamente cómo aplicar los beneficios"
     * Los riesgos DEBEN ser coherentes: si hablamos de beneficios para el contribuyente, los riesgos son sobre perder esos beneficios o no poder acceder a ellos
   - El análisis jurídico DEBE incluir normativa favorable al contribuyente
   - Las recomendaciones DEBEN incluir cómo aprovechar beneficios y evitar perderlos
   - TODO el texto formateado DEBE incorporar estos beneficios y riesgos coherentes

NO ignores estas instrucciones. Son OBLIGATORIAS y tienen PRIORIDAD ABSOLUTA sobre cualquier análisis genérico. APLÍCALAS A TODAS LAS SECCIONES SIN EXCEPCIÓN.

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

IMPORTANTE: El análisis debe ser EXTENSO y DETALLADO. Analiza TODAS las cláusulas del documento.

⚠️⚠️⚠️ RECORDATORIO FINAL CRÍTICO ⚠️⚠️⚠️
TODAS las secciones del JSON que generes (resumen_ejecutivo, clausulas_analizadas, analisis_juridico, riesgos, recomendaciones, proximos_pasos, texto_formateado) DEBEN reflejar las instrucciones del usuario mostradas arriba en la sección "INSTRUCCIONES Y CONTEXTO DEL USUARIO".

NO uses contenido genérico. APLICA el enfoque, criterios y conclusiones del chat en CADA sección:
- Si el usuario solicita un punto de vista diferente, CADA cláusula analizada DEBE reflejarlo
- Si el usuario menciona beneficios, los riesgos DEBEN balancearse con esos beneficios
- Si el usuario menciona preocupaciones, DEBEN aparecer en los riesgos identificados
- El texto_formateado COMPLETO DEBE reflejar el enfoque del chat en TODAS sus secciones

NO ignores estas instrucciones. Son OBLIGATORIAS.`,
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

    console.log(`[REPORT] ✅ Reporte generado con ${parsed.clausulas_analizadas.length} cláusulas, ${parsed.riesgos.length} riesgos, ${parsed.recomendaciones.length} recomendaciones`);
    console.log(`[REPORT] Instrucciones aplicadas: ${input.userInstructions ? "SÍ ✅" : "NO ❌"}`);
    if (input.userInstructions) {
      console.log(`[REPORT] Contenido de instrucciones (primeros 200 chars): ${input.userInstructions.substring(0, 200)}...`);
      console.log(`[REPORT] Contiene contexto del chat: ${input.userInstructions.includes("CONTEXTO") || input.userInstructions.includes("CHAT") ? "SÍ ✅" : "NO ❌"}`);
    }

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
