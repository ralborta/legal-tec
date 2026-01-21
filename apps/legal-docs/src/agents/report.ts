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
1. Detecta la JURISDICCIÓN del documento o documentos (Nacional, CABA, Buenos Aires, Córdoba, Santa Fe, Mendoza, u otra provincia)
2. Identifica el ÁREA LEGAL (Civil, Comercial, Laboral, Tributario, Societario, etc.)
3. Analiza TODAS las cláusulas del documento o documentos - NO omitas ninguna
4. Genera un análisis EXTENSO y DETALLADO
5. ⚠️ IMPORTANTE: Si las instrucciones del usuario indican que hay MÚLTIPLES DOCUMENTOS, SIEMPRE usa PLURAL ("los documentos", "estos documentos", "los documentos analizados") en TODAS las secciones. NUNCA uses "el documento" en singular cuando se analizan múltiples documentos.

REQUISITOS DE EXTENSIÓN Y PROFUNDIDAD:
- "resumen_ejecutivo": MÍNIMO 4-6 párrafos completos y detallados. Debe incluir: partes del contrato con sus roles, objeto completo del documento, plazos y condiciones, precio/contraprestación detallada, contexto comercial/jurídico, relaciones entre las partes, aspectos más relevantes y críticos, y cualquier detalle que sea importante para entender el documento completo.
- "clausulas_analizadas": OBLIGATORIO analizar CADA cláusula del documento sin excepción. Mínimo 8-15 cláusulas (o todas si hay menos). Para cada cláusula incluir:
  * Análisis DETALLADO de qué establece la cláusula (no solo resumen)
  * Implicancias legales profundas y consecuencias prácticas
  * Si es favorable/desfavorable para cada parte y por qué
  * Comparación con estándares del mercado y mejores prácticas
  * Posibles interpretaciones alternativas y su validez
  * Relación con otras cláusulas del documento
  * Nivel de riesgo específico con justificación detallada
- "analisis_juridico": MÍNIMO 6-8 párrafos con análisis legal MUY PROFUNDO. Debe incluir:
  * Marco normativo aplicable completo (leyes, decretos, resoluciones)
  * Interpretación jurídica detallada de cláusulas clave
  * Validez legal de cada disposición importante
  * Posibles conflictos con normativa vigente
  * Jurisprudencia relevante y cómo aplica al caso
  * Análisis de derechos y obligaciones de cada parte
  * Consideraciones sobre cumplimiento y ejecución
  * Comparación con estándares legales del sector
  * Análisis de posibles vacíos legales o ambigüedades
- "riesgos": MÍNIMO 5-8 riesgos identificados con análisis profundo. Cada riesgo debe incluir:
  * Descripción ESPECÍFICA y DETALLADA del riesgo
  * Probabilidad de ocurrencia y impacto potencial
  * Nivel de riesgo (bajo/medio/alto) con justificación
  * Recomendación CONCRETA y ACCIONABLE para mitigar
  * Escenarios donde el riesgo podría materializarse
  * Costos potenciales (económicos, legales, reputacionales)
- "recomendaciones": MÍNIMO 7-10 recomendaciones prácticas, específicas y detalladas. Cada recomendación debe ser:
  * Accionable y concreta (no genérica)
  * Específica sobre qué hacer, cómo y cuándo
  * Incluir consideraciones prácticas de implementación
  * Priorizada según importancia y urgencia
- "proximos_pasos": MÍNIMO 5-8 acciones concretas a tomar. Cada acción debe incluir:
  * Qué hacer específicamente
  * Quién debe hacerlo (si aplica)
  * Plazo o prioridad
  * Recursos necesarios
- "citas": MÍNIMO 5-8 citas de normativa/jurisprudencia relevante CON URLs. Debe incluir:
  * Normativa aplicable específica (artículos, leyes, decretos)
  * Jurisprudencia relevante del caso
  * Doctrina cuando sea pertinente
  * URLs de fuentes oficiales verificables
- "documentos_sugeridos": MÍNIMO 3-5 documentos que podrían complementar o ser necesarios, con justificación de por qué cada uno es relevante

Devuelve un JSON con esta estructura EXACTA:

{
  "titulo": "Análisis Legal de [tipo de documento] - [partes involucradas]" | "Análisis Legal Conjunto de [N] Documentos - [descripción]" si hay múltiples documentos,
  "tipo_documento": "Tipo específico (ej: Contrato de Locación, Contrato de Distribución, Acuerdo de Confidencialidad)",
  "jurisdiccion": "Jurisdicción identificada",
  "area_legal": "Área legal principal",
  "resumen_ejecutivo": "Resumen EXTENSO de 3-4 párrafos. Incluir: partes del contrato, objeto, plazo, precio/contraprestación, aspectos más relevantes, contexto general. Si hay múltiples documentos, DEBE mencionar explícitamente que se analizaron múltiples documentos y usar PLURAL ('los documentos', 'estos documentos') en todo el resumen.",
  "clausulas_analizadas": [
    {
      "numero": "1",
      "titulo": "Título de la cláusula",
      "analisis": "Análisis MUY DETALLADO y PROFUNDO de la cláusula: qué establece exactamente (no solo resumen), implicancias legales profundas y consecuencias prácticas, si es favorable/desfavorable para cada parte y por qué, comparación con estándares del mercado y mejores prácticas, posibles interpretaciones alternativas y su validez, relación con otras cláusulas del documento, nivel de riesgo específico con justificación detallada",
      "riesgo": "bajo" | "medio" | "alto"
    }
  ],
  "analisis_juridico": "Análisis jurídico MUY EXTENSO y PROFUNDO de 6-8 párrafos. Debe incluir: marco normativo aplicable completo (leyes, decretos, resoluciones), interpretación jurídica detallada de cláusulas clave, validez legal de cada disposición importante, posibles conflictos con normativa vigente, jurisprudencia relevante y cómo aplica al caso, análisis de derechos y obligaciones de cada parte, consideraciones sobre cumplimiento y ejecución, comparación con estándares legales del sector, análisis de posibles vacíos legales o ambigüedades.",
  "riesgos": [
    {
      "descripcion": "Descripción ESPECÍFICA del riesgo interpretando y aplicando el enfoque, punto de vista, criterios y preocupaciones mencionados en el chat. El riesgo DEBE ser coherente con el enfoque interpretado: si el chat menciona un punto de vista específico, el riesgo DEBE ser un riesgo PARA ESE PUNTO DE VISTA. Si menciona beneficios, preocupaciones o criterios específicos, el riesgo DEBE reflejarlos desde esa perspectiva. DEBE ser coherente con el enfoque del análisis completo en todas sus secciones.",
      "nivel": "bajo" | "medio" | "alto",
      "recomendacion": "Recomendación CONCRETA para mitigar este riesgo, alineada con el enfoque, criterios y punto de vista interpretados de las instrucciones del chat"
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
  // Detectar si es análisis conjunto (múltiples documentos) por las instrucciones
  const isConjointAnalysis = input.userInstructions?.includes("ANÁLISIS CONJUNTO") || 
                             input.userInstructions?.includes("múltiples documentos") ||
                             input.original.includes("DOCUMENTO 1 de") ||
                             input.original.includes("DOCUMENTO 2 de");
  const timeout = isConjointAnalysis ? 300000 : 180000; // 5 min para conjunto, 3 min para individual
  
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

    // Limitar texto para análisis conjunto (más rápido), más texto para individual
    const isConjointAnalysis = input.userInstructions?.includes("ANÁLISIS CONJUNTO") || 
                                 input.original.includes("DOCUMENTO 1 de");
    const maxTextLength = isConjointAnalysis ? 12000 : 15000; // Menos texto para conjunto = más rápido
    
    const translatedText = input.translated
      .map((c) => `${c.clause_number}. ${c.title_es}\n${c.body_es}`)
      .join("\n\n")
      .substring(0, maxTextLength);

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
      // Usar gpt-4o-mini para análisis conjunto (más rápido) o gpt-4o para individual (más calidad)
      const isConjointAnalysis = input.userInstructions?.includes("ANÁLISIS CONJUNTO") || 
                                 input.original.includes("DOCUMENTO 1 de") ||
                                 input.original.includes("DOCUMENTO 2 de");
      const model = isConjointAnalysis ? "gpt-4o-mini" : "gpt-4o"; // Más rápido para conjunto
      const maxTokens = isConjointAnalysis ? 6000 : 8000; // Menos tokens para conjunto (más rápido)
      
      model: model,
      temperature: 0.3,
        max_tokens: maxTokens,
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

${instructionsText.includes("ANÁLISIS CONJUNTO") || instructionsText.includes("múltiples documentos") ? `
⚠️⚠️⚠️ RECORDATORIO CRÍTICO: ESTE ES UN ANÁLISIS CONJUNTO ⚠️⚠️⚠️
- SIEMPRE usa PLURAL: "los documentos", "estos documentos", "los documentos analizados"
- NUNCA uses "el documento" en singular
- El resumen DEBE mencionar explícitamente que se analizaron múltiples documentos
- Todas las secciones deben reflejar que es un análisis conjunto
` : ""}

═══════════════════════════════════════════════════════════════════════════════
⚠️⚠️⚠️ REGLAS CRÍTICAS - DEBES APLICAR ESTAS INSTRUCCIONES A TODAS LAS SECCIONES ⚠️⚠️⚠️
═══════════════════════════════════════════════════════════════════════════════

LEE Y APLICA CADA PUNTO DE LAS INSTRUCCIONES DEL USUARIO MOSTRADAS ARRIBA EN TODAS Y CADA UNA DE LAS SECCIONES DEL ANÁLISIS.

🚨 PRINCIPIO FUNDAMENTAL: Interpreta las instrucciones del usuario y aplícalas COHERENTEMENTE en TODAS las secciones. No uses análisis genéricos. Cada sección debe reflejar el enfoque, criterios y conclusiones mencionados en el chat.

🚨 OBLIGATORIO: Las instrucciones del usuario DEBEN reflejarse en:

1. ✅ RESUMEN EJECUTIVO (resumen_ejecutivo):
   - Interpreta el enfoque solicitado en el chat y reflejalo en el resumen
   - Si menciona un punto de vista específico, criterios, beneficios, riesgos o preocupaciones, DEBEN aparecer en el resumen
   - El resumen DEBE alinearse completamente con las instrucciones del chat

2. ✅ PUNTOS TRATADOS / CLÁUSULAS ANALIZADAS (clausulas_analizadas):
   - Cada cláusula analizada DEBE reflejar el enfoque, criterios y punto de vista mencionados en el chat
   - Interpreta las instrucciones y aplica ese enfoque a CADA análisis de cláusula
   - Los riesgos de cada cláusula DEBEN evaluarse según los criterios y enfoque del chat
   - NO uses análisis genéricos, usa el enfoque específico interpretado de las instrucciones

3. ✅ RIESGOS (riesgos):
   - 🚨 CRÍTICO: Los riesgos DEBEN ser COHERENTES con el enfoque, punto de vista y criterios mencionados en el chat
   - Interpreta las instrucciones: si el usuario menciona un punto de vista específico (ej: "desde el punto de vista de X"), los riesgos DEBEN ser riesgos PARA ESE PUNTO DE VISTA
   - Si el usuario menciona beneficios, preocupaciones, o criterios específicos, los riesgos DEBEN reflejarlos desde esa perspectiva
   - El nivel de riesgo DEBE evaluarse según el enfoque y criterios mencionados en el chat
   - Cada riesgo DEBE tener una recomendación específica alineada con las instrucciones y el enfoque interpretado
   - NO uses riesgos genéricos. Cada riesgo DEBE reflejar el punto de vista, criterios y enfoque específico mencionado en el chat
   - Si el chat menciona un enfoque diferente, REESCRIBE los riesgos desde ese enfoque interpretado, no solo cambies el resumen
   - COHERENCIA: Si el resumen refleja un enfoque, los riesgos DEBEN ser coherentes con ese mismo enfoque

4. ✅ ANÁLISIS JURÍDICO (analisis_juridico):
   - El análisis jurídico COMPLETO DEBE incorporar el enfoque, criterios y punto de vista interpretados del chat
   - Interpreta las instrucciones y aplica ese enfoque a TODO el análisis jurídico
   - Las interpretaciones legales DEBEN alinearse con las instrucciones del chat

5. ✅ RECOMENDACIONES (recomendaciones):
   - TODAS las recomendaciones DEBEN alinearse con las instrucciones, enfoque y criterios del chat
   - Interpreta las instrucciones y genera recomendaciones que reflejen ese enfoque
   - Las recomendaciones DEBEN ser específicas y reflejar el enfoque interpretado de las instrucciones

6. ✅ PRÓXIMOS PASOS (proximos_pasos):
   - Los próximos pasos DEBEN reflejar las acciones sugeridas en el chat
   - DEBEN ser coherentes con el enfoque, criterios y punto de vista interpretados de las instrucciones

7. ✅ TEXTO FORMATEADO COMPLETO (texto_formateado):
   - TODO el texto formateado DEBE reflejar el enfoque, criterios y punto de vista interpretados del chat
   - NO uses texto genérico, incorpora las instrucciones interpretadas en CADA sección del texto
   - El texto completo DEBE ser coherente con las instrucciones del usuario en todas sus secciones

🚨 PRINCIPIO DE COHERENCIA: 
   - Interpreta las instrucciones del usuario (punto de vista, criterios, enfoque, beneficios, preocupaciones, etc.)
   - Aplica ese enfoque interpretado COHERENTEMENTE en TODAS las secciones
   - Si el resumen refleja un enfoque, los riesgos DEBEN ser coherentes con ese mismo enfoque
   - Si las cláusulas se analizan desde una perspectiva, los riesgos DEBEN ser desde esa misma perspectiva
   - NO mezcles enfoques: si el usuario solicita un punto de vista específico, mantén ese punto de vista en TODAS las secciones
   - Los riesgos DEBEN reflejar las preocupaciones, criterios y punto de vista mencionados en el chat
   - Si el usuario menciona beneficios, los riesgos DEBEN ser coherentes con esos beneficios (riesgos de perderlos, no acceder a ellos, etc.)
   - Si el usuario menciona un punto de vista específico, los riesgos DEBEN ser riesgos PARA ESE PUNTO DE VISTA, no para otro

NO ignores estas instrucciones. Son OBLIGATORIAS y tienen PRIORIDAD ABSOLUTA sobre cualquier análisis genérico. APLÍCALAS A TODAS LAS SECCIONES SIN EXCEPCIÓN.

═══════════════════════════════════════════════════════════════════════════════

TIPO DE DOCUMENTO: ${input.type}

TEXTO ORIGINAL:
${isConjointAnalysis ? input.original.substring(0, 6000) : input.original.substring(0, 8000)}

CLÁUSULAS DEL DOCUMENTO (analizar TODAS):
${translatedText}

CHECKLIST DE ANÁLISIS PREVIO:
${checklistText}

JURISPRUDENCIA Y NORMATIVA RELEVANTE:
${jurisprudenceText}

IMPORTANTE: El análisis debe ser MUY EXTENSO, DETALLADO y PROFUNDO. Analiza TODAS las cláusulas del documento sin excepción. 

🚨 PROFUNDIDAD REQUERIDA:
- No uses análisis superficiales o genéricos
- Profundiza en cada aspecto legal, comercial y práctico
- Analiza las implicancias desde múltiples perspectivas
- Incluye contexto, comparaciones y consideraciones detalladas
- Sé exhaustivo en el análisis de cada cláusula
- Considera escenarios y casos de uso reales
- Analiza relaciones entre cláusulas y su impacto conjunto

⚠️⚠️⚠️ RECORDATORIO FINAL CRÍTICO ⚠️⚠️⚠️
TODAS las secciones del JSON que generes (resumen_ejecutivo, clausulas_analizadas, analisis_juridico, riesgos, recomendaciones, proximos_pasos, texto_formateado) DEBEN reflejar las instrucciones del usuario mostradas arriba en la sección "INSTRUCCIONES Y CONTEXTO DEL USUARIO".

NO uses contenido genérico. INTERPRETA las instrucciones del usuario y APLICA el enfoque, criterios, punto de vista y conclusiones del chat en CADA sección:
- Interpreta el enfoque solicitado (punto de vista, criterios, beneficios, preocupaciones, etc.) y aplícalo a CADA cláusula analizada
- 🚨 RIESGOS - COHERENCIA CRÍTICA: Interpreta las instrucciones del chat. Si el usuario menciona un punto de vista específico, los riesgos DEBEN ser riesgos PARA ESE PUNTO DE VISTA. Si menciona beneficios, preocupaciones o criterios específicos, los riesgos DEBEN reflejarlos desde esa perspectiva interpretada. NO mezcles enfoques. Si el resumen refleja un enfoque, los riesgos DEBEN ser coherentes con ese mismo enfoque interpretado.
- Si el usuario menciona beneficios, los riesgos DEBEN ser coherentes: riesgos de perder esos beneficios o no poder acceder a ellos (desde la perspectiva del beneficiario mencionado)
- Si el usuario menciona preocupaciones, DEBEN aparecer en los riesgos identificados desde el enfoque y punto de vista interpretado
- El texto_formateado COMPLETO DEBE reflejar el enfoque interpretado del chat en TODAS sus secciones, especialmente en la sección de riesgos

🚨 COHERENCIA CRÍTICA: Interpreta las instrucciones del usuario y mantén coherencia. Si el resumen refleja un enfoque interpretado, los riesgos DEBEN ser coherentes con ese mismo enfoque. NO uses riesgos genéricos o desde otra perspectiva. Cada sección debe reflejar el mismo enfoque interpretado de las instrucciones.

NO ignores estas instrucciones. Son OBLIGATORIAS.`,
          },
        ],
        response_format: { type: "json_object" },
      }, { timeout }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Report generation timeout after ${timeout / 1000}s`)), timeout)
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
    
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    const isTimeout = errorMessage.includes("timeout") || errorMessage.includes("TIMEOUT");
    
    // Devolver estructura mínima en caso de error
    return {
      titulo: "Error en el análisis",
      tipo_documento: input.type,
      jurisdiccion: "No determinada",
      area_legal: "No determinada",
      resumen_ejecutivo: isTimeout 
        ? `El análisis excedió el tiempo máximo permitido. Esto puede ocurrir con documentos muy extensos o análisis conjunto de múltiples documentos. Por favor, intenta con documentos más pequeños o menos documentos a la vez. Error: ${errorMessage}`
        : `Error al generar el análisis: ${errorMessage}`,
      clausulas_analizadas: [],
      analisis_juridico: isTimeout
        ? "No se pudo generar el análisis jurídico debido a un timeout. El análisis conjunto de múltiples documentos puede requerir más tiempo. Intenta con menos documentos o documentos más pequeños."
        : "No se pudo generar el análisis jurídico.",
      riesgos: [],
      recomendaciones: isTimeout 
        ? [
            "Intentar con menos documentos a la vez (máximo 2-3 documentos)",
            "Verificar que los documentos no sean excesivamente extensos",
            "Dividir el análisis en grupos más pequeños si es necesario"
          ]
        : [],
      proximos_pasos: [],
      citas: [],
      documentos_sugeridos: [],
      texto_formateado: isTimeout
        ? `Error: Timeout en generación de reporte\n\nEl análisis excedió el tiempo máximo permitido (${timeout / 1000} segundos). Esto puede ocurrir con:\n- Documentos muy extensos\n- Análisis conjunto de múltiples documentos\n- Documentos con mucho contenido para procesar\n\nRecomendaciones:\n- Intentar con menos documentos a la vez\n- Verificar que los documentos no sean excesivamente extensos\n- Dividir el análisis en grupos más pequeños si es necesario`
        : `Error al generar reporte: ${errorMessage}`
    };
  }
}

// Mantener compatibilidad con código existente que espera string
export async function generateReportText(input: ReportInput): Promise<string> {
  const report = await generateReport(input);
  return report.texto_formateado;
}
