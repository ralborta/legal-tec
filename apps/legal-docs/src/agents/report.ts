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

REQUISITOS DE EXTENSIÓN Y PROFUNDIDAD - ANÁLISIS ULTRA PROFUNDO Y COMPLETO:
⚠️ IMPORTANTE: Este análisis debe ser EXHAUSTIVO, COMPLETO y MUY PROFUNDO. NO uses análisis superficiales o genéricos.

- "resumen_ejecutivo": MÍNIMO 8-12 párrafos completos y MUY DETALLADOS. Debe incluir:
  * Identificación completa de TODAS las partes con sus roles, razones sociales, datos de identificación
  * Objeto COMPLETO y DETALLADO del documento con todos sus aspectos
  * Plazos, fechas, condiciones y términos ESPECÍFICOS mencionados
  * Precio/contraprestación DETALLADA con desglose si aplica
  * Contexto comercial/jurídico COMPLETO y profundo
  * Relaciones entre las partes y su naturaleza jurídica
  * TODOS los aspectos relevantes y críticos identificados
  * Comparación con contratos similares del mercado
  * Análisis de la estructura general del documento
  * Cualquier detalle que sea importante para entender el documento completo
  * Si hay múltiples documentos: análisis comparativo, relaciones, consistencias e inconsistencias

- "clausulas_analizadas": ⚠️ OBLIGATORIO analizar CADA cláusula del documento sin excepción. MÍNIMO ABSOLUTO 15 cláusulas (o TODAS si hay menos, pero si hay más de 15, analiza TODAS). Si el documento tiene menos de 15 cláusulas, analiza TODAS con EXTRA profundidad. Para cada cláusula incluir:
  * Análisis ULTRA DETALLADO de qué establece EXACTAMENTE la cláusula (texto completo, no resumen)
  * Implicancias legales MUY PROFUNDAS y consecuencias prácticas detalladas
  * Análisis desde la perspectiva de CADA parte (favorable/desfavorable y por qué en detalle)
  * Comparación EXHAUSTIVA con estándares del mercado y mejores prácticas del sector
  * Posibles interpretaciones alternativas, su validez legal y consecuencias
  * Relación DETALLADA con otras cláusulas del documento y su impacto conjunto
  * Nivel de riesgo específico con justificación MUY DETALLADA
  * Casos prácticos donde esta cláusula podría aplicarse o generar conflictos
  * Recomendaciones específicas para mejorar o modificar la cláusula
  * Análisis de cumplimiento y posibles dificultades de ejecución
  * Comparación con normativa aplicable específica

- "analisis_juridico": ⚠️ MÍNIMO ABSOLUTO 15 párrafos (preferiblemente 20 o más) con análisis legal ULTRA PROFUNDO Y EXHAUSTIVO. DEBE estar estructurado en subsecciones claras:
  * MARCO NORMATIVO (2-3 párrafos): Marco normativo aplicable COMPLETO Y DETALLADO (leyes, decretos, resoluciones, artículos específicos con números, incisos, párrafos). Incluir jerarquía normativa y relaciones entre normas.
  * INTERPRETACIÓN JURÍDICA (3-4 párrafos): Interpretación jurídica MUY DETALLADA de TODAS las cláusulas clave. Análisis de cada cláusula desde perspectiva legal, posibles interpretaciones alternativas, y su validez.
  * VALIDEZ LEGAL Y FUNDAMENTACIÓN (2-3 párrafos): Validez legal de CADA disposición importante con fundamentación exhaustiva. Posibles conflictos con normativa vigente y cómo resolverlos. Análisis de posibles nulidades o invalideces.
  * JURISPRUDENCIA APLICABLE (2-3 párrafos): Jurisprudencia relevante DETALLADA y cómo aplica específicamente al caso. Incluir fallos relevantes con referencias completas (tribunal, fecha, número de causa).
  * DERECHOS Y OBLIGACIONES (2-3 párrafos): Análisis EXHAUSTIVO de derechos y obligaciones de cada parte. Desglose detallado de cada obligación, plazo, modalidad, y consecuencias de incumplimiento.
  * CUMPLIMIENTO Y EJECUCIÓN (2-3 párrafos): Consideraciones sobre cumplimiento y ejecución con escenarios detallados. Dificultades potenciales, requisitos administrativos, y procedimientos necesarios.
  * ESTÁNDARES Y MEJORES PRÁCTICAS (1-2 párrafos): Comparación con estándares legales del sector y mejores prácticas. Análisis de cómo el documento se compara con contratos similares del mercado.
  * VACÍOS LEGALES Y AMBIGÜEDADES (1-2 párrafos): Análisis DETALLADO de posibles vacíos legales o ambigüedades. Identificación de áreas donde el documento no es claro o completo.
  * ESTRUCTURA Y COHERENCIA (1-2 párrafos): Análisis de la estructura contractual y su coherencia jurídica. Evaluación de la lógica interna del documento y posibles inconsistencias.
  * LITIGIOS Y DEFENSAS (1-2 párrafos): Consideraciones sobre posibles litigios y defensas disponibles. Análisis de escenarios de conflicto y estrategias legales.
  * ASPECTOS PROCESALES (1-2 párrafos): Análisis de aspectos procesales y jurisdiccionales. Competencia, foro, y procedimientos aplicables.
  * EFICACIA Y EJECUTABILIDAD (1 párrafo): Evaluación de la eficacia y ejecutabilidad de las disposiciones. Análisis de si las cláusulas son realmente ejecutables en la práctica.
  * NORMATIVA INTERNACIONAL (1 párrafo, si aplica): Análisis comparativo con normativa internacional si aplica.

- "riesgos": ⚠️ MÍNIMO ABSOLUTO 10 riesgos identificados (preferiblemente 15 o más). Si no encuentras 10 riesgos obvios, profundiza MÁS y busca riesgos desde diferentes perspectivas (jurídica, comercial, operativa, financiera, reputacional, contractual, de cumplimiento, etc.). Cada riesgo debe incluir:
  * Descripción ULTRA ESPECÍFICA y MUY DETALLADA del riesgo con ejemplos concretos
  * Probabilidad de ocurrencia (baja/media/alta) con justificación detallada
  * Impacto potencial DETALLADO (económico, legal, operativo, reputacional)
  * Nivel de riesgo (bajo/medio/alto/crítico) con justificación exhaustiva
  * Recomendación MUY CONCRETA y ACCIONABLE para mitigar con pasos específicos
  * Escenarios DETALLADOS donde el riesgo podría materializarse
  * Costos potenciales CUANTIFICADOS cuando sea posible (económicos, legales, reputacionales)
  * Tiempo estimado para que el riesgo se materialice
  * Factores que aumentan o disminuyen el riesgo
  * Medidas preventivas específicas y su efectividad

- "recomendaciones": ⚠️ MÍNIMO ABSOLUTO 15 recomendaciones (preferiblemente 20 o más). Cada recomendación debe ser:
  * Accionable y MUY concreta (no genérica, con pasos específicos)
  * Específica sobre QUÉ hacer exactamente, CÓMO hacerlo, CUÁNDO y QUIÉN
  * Incluir consideraciones prácticas DETALLADAS de implementación
  * Priorizada según importancia (crítica/alta/media/baja) y urgencia (inmediata/corto plazo/mediano plazo/largo plazo)
  * Categorizada por tipo: crítica (debe hacerse sí o sí), importante (debe hacerse pronto), preventiva (conviene hacer)
  * Incluir recursos necesarios DETALLADOS (humanos, económicos, técnicos)
  * Incluir costos estimados CUANTIFICADOS cuando sea posible (en pesos, dólares, o porcentaje del presupuesto)
  * Incluir plazos específicos con fechas límite sugeridas
  * Incluir responsable sugerido (rol, departamento, persona)
  * Incluir dependencias con otras recomendaciones
  * Justificación DETALLADA de por qué esta recomendación es importante y qué problema resuelve
  * Incluir criterios de éxito para considerar la recomendación implementada

- "proximos_pasos": ⚠️ MÍNIMO ABSOLUTO 12 acciones (preferiblemente 18 o más) MUY CONCRETAS a tomar. DEBE estar estructurado por fases temporales:
  * FASE INMEDIATA (0-7 días): Mínimo 3-4 acciones críticas que deben hacerse de inmediato
  * FASE CORTO PLAZO (1-4 semanas): Mínimo 4-5 acciones importantes para las próximas semanas
  * FASE MEDIANO PLAZO (1-3 meses): Mínimo 4-5 acciones para los próximos meses
  * FASE LARGO PLAZO (3+ meses): Mínimo 1-2 acciones estratégicas a largo plazo
  Cada acción debe incluir:
  * Qué hacer ESPECÍFICAMENTE con detalle paso a paso
  * Quién debe hacerlo (rol específico, persona, departamento) con nombre si es posible
  * Plazo ESPECÍFICO con fecha límite sugerida (ej: "antes del 15 de marzo")
  * Prioridad (crítica/alta/media/baja) y urgencia (inmediata/corto plazo/mediano plazo/largo plazo)
  * Recursos necesarios DETALLADOS (humanos: quién, cuántas horas; económicos: costo estimado; técnicos: herramientas/software)
  * Dependencias con otras acciones (qué acciones deben completarse antes)
  * Criterios de éxito ESPECÍFICOS para considerar la acción completada
  * Impacto esperado de completar esta acción

- "citas": MÍNIMO 10-15 citas de normativa/jurisprudencia relevante CON URLs. Debe incluir:
  * Normativa aplicable ESPECÍFICA con artículos, incisos, párrafos (leyes, decretos, resoluciones)
  * Jurisprudencia relevante DETALLADA del caso con referencias completas
  * Doctrina cuando sea pertinente con referencias completas
  * URLs de fuentes oficiales verificables
  * Explicación de cómo cada cita aplica al documento analizado
  * Referencias cruzadas entre normativas cuando sea relevante

- "documentos_sugeridos": ⚠️ MÍNIMO ABSOLUTO 5 documentos (preferiblemente 8 o más). Debes identificar documentos complementarios, relacionados, necesarios para completar el marco contractual, o que podrían ser útiles. Incluye: contratos relacionados, anexos necesarios, documentos de respaldo, acuerdos complementarios, etc. Cada uno con justificación DETALLADA de por qué es relevante, cuándo sería necesario y qué aspectos cubriría

Devuelve un JSON con esta estructura EXACTA:

{
  "titulo": "Análisis Legal de [tipo de documento] - [partes involucradas]" | "Análisis Legal Conjunto de [N] Documentos - [descripción]" si hay múltiples documentos,
  "tipo_documento": "Tipo específico (ej: Contrato de Locación, Contrato de Distribución, Acuerdo de Confidencialidad)",
  "jurisdiccion": "Jurisdicción identificada",
  "area_legal": "Área legal principal",
  "resumen_ejecutivo": "Resumen ULTRA EXTENSO de 8-12 párrafos COMPLETOS. Incluir: identificación completa de TODAS las partes con roles y datos, objeto COMPLETO y DETALLADO, plazos y condiciones ESPECÍFICAS, precio/contraprestación DETALLADA, contexto comercial/jurídico COMPLETO, relaciones entre partes, TODOS los aspectos relevantes, comparación con contratos similares, análisis de estructura general. Si hay múltiples documentos, DEBE mencionar explícitamente que se analizaron múltiples documentos, usar PLURAL ('los documentos', 'estos documentos') en todo el resumen, e incluir análisis comparativo, relaciones, consistencias e inconsistencias.",
  "clausulas_analizadas": [
    {
      "numero": "1",
      "titulo": "Título de la cláusula",
      "analisis": "Análisis ULTRA DETALLADO y ULTRA PROFUNDO de la cláusula: qué establece EXACTAMENTE (texto completo, no resumen), implicancias legales MUY PROFUNDAS y consecuencias prácticas detalladas, análisis desde la perspectiva de CADA parte (favorable/desfavorable y por qué en detalle), comparación EXHAUSTIVA con estándares del mercado y mejores prácticas del sector, posibles interpretaciones alternativas, su validez legal y consecuencias, relación DETALLADA con otras cláusulas del documento y su impacto conjunto, nivel de riesgo específico con justificación MUY DETALLADA, casos prácticos donde esta cláusula podría aplicarse o generar conflictos, recomendaciones específicas para mejorar o modificar la cláusula, análisis de cumplimiento y posibles dificultades de ejecución, comparación con normativa aplicable específica"
    }
  ],
  ⚠️ IMPORTANTE: Debes analizar MÍNIMO 15 cláusulas. Si el documento tiene menos, analiza TODAS con EXTRA profundidad. Si tiene más, analiza TODAS sin excepción.
  "analisis_juridico": "Análisis jurídico ULTRA EXTENSO y ULTRA PROFUNDO de MÍNIMO 15 párrafos (preferiblemente 20 o más), estructurado en subsecciones claras: MARCO NORMATIVO (2-3 párrafos con leyes, decretos, resoluciones, artículos específicos), INTERPRETACIÓN JURÍDICA (3-4 párrafos analizando TODAS las cláusulas clave), VALIDEZ LEGAL Y FUNDAMENTACIÓN (2-3 párrafos con fundamentación exhaustiva), JURISPRUDENCIA APLICABLE (2-3 párrafos con fallos relevantes y referencias), DERECHOS Y OBLIGACIONES (2-3 párrafos con desglose exhaustivo), CUMPLIMIENTO Y EJECUCIÓN (2-3 párrafos con escenarios detallados), ESTÁNDARES Y MEJORES PRÁCTICAS (1-2 párrafos comparando con el mercado), VACÍOS LEGALES Y AMBIGÜEDADES (1-2 párrafos identificando problemas), ESTRUCTURA Y COHERENCIA (1-2 párrafos evaluando lógica interna), LITIGIOS Y DEFENSAS (1-2 párrafos con estrategias legales), ASPECTOS PROCESALES (1-2 párrafos sobre competencia y procedimientos), EFICACIA Y EJECUTABILIDAD (1 párrafo evaluando ejecutabilidad práctica), y NORMATIVA INTERNACIONAL (1 párrafo si aplica).",
  "riesgos": [
    {
      "descripcion": "Descripción ESPECÍFICA del riesgo interpretando y aplicando el enfoque, punto de vista, criterios y preocupaciones mencionados en el chat. El riesgo DEBE ser coherente con el enfoque interpretado: si el chat menciona un punto de vista específico, el riesgo DEBE ser un riesgo PARA ESE PUNTO DE VISTA. Si menciona beneficios, preocupaciones o criterios específicos, el riesgo DEBE reflejarlos desde esa perspectiva. DEBE ser coherente con el enfoque del análisis completo en todas sus secciones.",
      "nivel": "bajo" | "medio" | "alto",
      "recomendacion": "Recomendación CONCRETA para mitigar este riesgo, alineada con el enfoque, criterios y punto de vista interpretados de las instrucciones del chat"
    }
  ],
  "recomendaciones": [
    {
      "descripcion": "Descripción ESPECÍFICA y DETALLADA de la recomendación con pasos concretos y accionables. Incluir: qué hacer, cómo hacerlo, cuándo, quién, recursos necesarios, costos estimados, plazos, responsable sugerido, dependencias, justificación, y criterios de éxito",
      "prioridad": "crítica",
      "urgencia": "inmediata",
      "categoria": "crítica",
      "costo_estimado": "$50,000",
      "tiempo_estimado": "2 semanas",
      "responsable_sugerido": "Departamento Legal",
      "dependencias": "Ninguna"
    }
  ],
  ⚠️ IMPORTANTE: Debes generar MÍNIMO 15 recomendaciones (preferiblemente 20). Categoriza por prioridad y tipo. Incluye costos, tiempos, y responsables cuando sea posible.
  "proximos_pasos": [
    {
      "accion": "Acción MUY CONCRETA a tomar con detalle específico paso a paso",
      "fase": "inmediata",
      "responsable": "Rol específico, persona o departamento responsable",
      "fecha_limite": "15 de marzo de 2024",
      "prioridad": "crítica",
      "recursos": "Recursos necesarios detallados (humanos, económicos, técnicos)",
      "dependencias": "Otras acciones que deben completarse antes (si aplica)",
      "criterios_exito": "Criterios específicos para considerar la acción completada",
      "impacto": "Impacto esperado de completar esta acción"
    }
  ],
  ⚠️ IMPORTANTE: Debes generar MÍNIMO 12 acciones (preferiblemente 18). Estructura por fases temporales: inmediata (0-7 días), corto plazo (1-4 semanas), mediano plazo (1-3 meses), largo plazo (3+ meses).
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
      "descripcion": "Justificación DETALLADA de por qué se sugiere, para qué serviría, cuándo sería necesario y qué aspectos cubriría. Incluye: contratos relacionados, anexos necesarios, documentos de respaldo, acuerdos complementarios, garantías, seguros, etc."
    }
  ],
  ⚠️ IMPORTANTE: Debes sugerir MÍNIMO 5 documentos (preferiblemente 8). Piensa en: contratos relacionados, anexos técnicos, garantías, seguros, documentos de respaldo, acuerdos complementarios, etc.
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
  // Análisis ultra profundo requiere más tiempo - el usuario quiere análisis exhaustivo
  const timeout = isConjointAnalysis ? 600000 : 300000; // 10 min para conjunto (ultra profundo), 5 min para individual (ultra profundo)
  
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

    // Para análisis conjunto, necesitamos MÁS texto (múltiples documentos)
    const isConjointAnalysis = input.userInstructions?.includes("ANÁLISIS CONJUNTO") || 
                                 input.userInstructions?.includes("múltiples documentos") ||
                                 input.original.includes("DOCUMENTO 1 de") ||
                                 input.original.includes("DOCUMENTO 2 de");
    // Análisis conjunto necesita MÁS contexto, no menos
    const maxTextLength = isConjointAnalysis ? 20000 : 15000; // MÁS texto para conjunto (más documentos = más contexto necesario)
    
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

    // Usar gpt-4o para ambos (máxima calidad y profundidad)
    // Análisis conjunto requiere MÁS profundidad, no menos
    const model = "gpt-4o"; // Siempre usar el modelo más potente para análisis profundo
    // Aumentar tokens significativamente para análisis ultra profundo
    const maxTokens = isConjointAnalysis ? 16000 : 12000; // MUCHO MÁS tokens para análisis exhaustivo
    
    console.log(`[REPORT] Using model: ${model}, max_tokens: ${maxTokens}, conjoint: ${isConjointAnalysis}`);
    
    const response = await Promise.race([
      openai.chat.completions.create({
      model: model,
      temperature: 0.3,
        max_tokens: maxTokens,
      messages: [
        {
          role: "system",
            content: `Eres un analista legal senior de WNS & Asociados. Genera análisis ULTRA EXTENSOS, ULTRA DETALLADOS y EXHAUSTIVOS.

⚠️⚠️⚠️ REGLAS CRÍTICAS OBLIGATORIAS ⚠️⚠️⚠️:
1. DEBES cumplir TODOS los mínimos especificados (cláusulas, riesgos, recomendaciones, etc.)
2. NO puedes generar menos elementos que los mínimos requeridos
3. Si el documento es pequeño, profundiza EXTRA en cada sección para cumplir los mínimos
4. Si el documento es grande, analiza TODAS las cláusulas sin excepción
5. Los mínimos son OBLIGATORIOS, no sugerencias
6. Antes de responder, VERIFICA que cumpliste todos los mínimos
7. Devuelve SOLO JSON válido, sin texto adicional`,
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

🚨🚨🚨 VERIFICACIÓN FINAL OBLIGATORIA ANTES DE GENERAR EL JSON 🚨🚨🚨:
1. ¿Tienes MÍNIMO 15 cláusulas en "clausulas_analizadas"? Si no, analiza MÁS o profundiza MÁS en las existentes.
2. ¿Tienes MÍNIMO 10 riesgos en "riesgos"? Si no, identifica MÁS desde diferentes perspectivas.
3. ¿Tienes MÍNIMO 15 recomendaciones en "recomendaciones" (preferiblemente 20)? Si no, genera MÁS recomendaciones específicas. ¿Están categorizadas por prioridad y tipo? ¿Incluyen costos, tiempos y responsables?
4. ¿Tienes MÍNIMO 5 documentos en "documentos_sugeridos"? Si no, identifica MÁS documentos complementarios.
5. ¿Tienes MÍNIMO 10 citas en "citas"? Si no, busca MÁS normativa y jurisprudencia.
6. ¿El "resumen_ejecutivo" tiene MÍNIMO 8 párrafos completos? Si no, expande MÁS.
7. ¿El "analisis_juridico" tiene MÍNIMO 15 párrafos (preferiblemente 20) estructurados en subsecciones? Si no, profundiza MÁS y estructura mejor.
8. ¿Tienes MÍNIMO 12 acciones en "proximos_pasos" (preferiblemente 18) estructuradas por fases temporales? Si no, genera MÁS acciones y estructura por fases.
9. ¿Las recomendaciones corresponden a los riesgos identificados? Verifica coherencia.
10. ¿Los próximos pasos corresponden a las recomendaciones? Verifica coherencia.
11. ¿Las citas se usan en el análisis jurídico? Verifica que las citas mencionadas en "citas" aparezcan referenciadas en "analisis_juridico".

⚠️ NO generes el JSON hasta cumplir TODOS estos mínimos. Si el documento es pequeño, profundiza EXTRA en cada sección para cumplir los mínimos.

═══════════════════════════════════════════════════════════════════════════════

TIPO DE DOCUMENTO: ${input.type}

TEXTO ORIGINAL:
${isConjointAnalysis ? input.original.substring(0, 10000) : input.original.substring(0, 8000)}

CLÁUSULAS DEL DOCUMENTO (analizar TODAS):
${translatedText}

CHECKLIST DE ANÁLISIS PREVIO:
${checklistText}

JURISPRUDENCIA Y NORMATIVA RELEVANTE:
${jurisprudenceText}

IMPORTANTE: El análisis debe ser MUY EXTENSO, DETALLADO y PROFUNDO. Analiza TODAS las cláusulas del documento sin excepción. 

🚨🚨🚨 PROFUNDIDAD ULTRA REQUERIDA - ANÁLISIS EXHAUSTIVO 🚨🚨🚨:
⚠️⚠️⚠️ CUMPLIMIENTO OBLIGATORIO DE MÍNIMOS ⚠️⚠️⚠️:
- Los MÍNIMOS especificados son OBLIGATORIOS. NO puedes generar menos cláusulas, riesgos, recomendaciones, etc.
- Si el documento tiene menos cláusulas que el mínimo, analiza TODAS las que tenga con EXTRA profundidad
- Si el documento tiene más cláusulas que el mínimo, analiza TODAS sin excepción
- PROHIBIDO usar análisis superficiales, genéricos o resúmenes breves
- DEBES profundizar EXHAUSTIVAMENTE en cada aspecto legal, comercial, práctico y estratégico
- Analiza las implicancias desde MÚLTIPLES perspectivas (jurídica, comercial, operativa, financiera, reputacional)
- Incluye contexto COMPLETO, comparaciones DETALLADAS y consideraciones EXHAUSTIVAS
- Sé ULTRA EXHAUSTIVO en el análisis de CADA cláusula - no dejes ningún aspecto sin analizar
- Considera escenarios DETALLADOS y casos de uso reales con ejemplos concretos
- Analiza relaciones DETALLADAS entre cláusulas y su impacto conjunto
- Incluye análisis comparativo con contratos similares y mejores prácticas del sector
- Profundiza en aspectos procesales, jurisdiccionales y de ejecución
- Analiza posibles conflictos futuros y cómo prevenirlos o resolverlos
- Incluye recomendaciones específicas y accionables para cada aspecto identificado
- El análisis debe ser TAN COMPLETO que un abogado senior pueda usarlo directamente sin necesidad de revisar el documento original

🚨 VERIFICACIÓN OBLIGATORIA ANTES DE RESPONDER:
- ¿Tienes MÍNIMO 15-25 cláusulas analizadas? Si no, analiza MÁS cláusulas o profundiza MÁS en las existentes
- ¿Tienes MÍNIMO 10-15 riesgos? Si no, identifica MÁS riesgos desde diferentes perspectivas
- ¿Tienes MÍNIMO 12-18 recomendaciones? Si no, genera MÁS recomendaciones específicas
- ¿Tienes MÍNIMO 5-8 documentos sugeridos? Si no, identifica MÁS documentos complementarios
- ¿Tienes MÍNIMO 10-15 citas? Si no, busca MÁS normativa y jurisprudencia relevante
- NO respondas hasta cumplir TODOS los mínimos

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
    
    // Validar que el contenido cumple con los mínimos requeridos
    if (content) {
      try {
        const jsonText = content.trim();
        const parsed = JSON.parse(jsonText) as any;
        
        // Verificar mínimos
        const clausulasCount = Array.isArray(parsed.clausulas_analizadas) ? parsed.clausulas_analizadas.length : 0;
        const riesgosCount = Array.isArray(parsed.riesgos) ? parsed.riesgos.length : 0;
        const recomendacionesCount = Array.isArray(parsed.recomendaciones) ? parsed.recomendaciones.length : 0;
        const proximosPasosCount = Array.isArray(parsed.proximos_pasos) ? parsed.proximos_pasos.length : 0;
        const documentosSugeridosCount = Array.isArray(parsed.documentos_sugeridos) ? parsed.documentos_sugeridos.length : 0;
        const citasCount = Array.isArray(parsed.citas) ? parsed.citas.length : 0;
        // Validar longitud del análisis jurídico (aproximado: contar párrafos por puntos o longitud)
        const analisisJuridicoText = parsed.analisis_juridico || "";
        const analisisJuridicoParrafos = analisisJuridicoText.split(/\n\n|\.\s+(?=[A-Z])/).filter((p: string) => p.trim().length > 50).length;
        
        const minClausulas = 15;
        const minRiesgos = 10;
        const minRecomendaciones = 15; // Aumentado de 12 a 15
        const minProximosPasos = 12; // Nuevo mínimo
        const minDocumentosSugeridos = 5;
        const minCitas = 10;
        const minAnalisisJuridicoParrafos = 15; // Nuevo mínimo (aproximado por longitud)
        
        const issues: string[] = [];
        if (clausulasCount < minClausulas) {
          issues.push(`Solo ${clausulasCount} cláusulas (mínimo ${minClausulas})`);
        }
        if (riesgosCount < minRiesgos) {
          issues.push(`Solo ${riesgosCount} riesgos (mínimo ${minRiesgos})`);
        }
        if (recomendacionesCount < minRecomendaciones) {
          issues.push(`Solo ${recomendacionesCount} recomendaciones (mínimo ${minRecomendaciones})`);
        }
        if (proximosPasosCount < minProximosPasos) {
          issues.push(`Solo ${proximosPasosCount} próximos pasos (mínimo ${minProximosPasos})`);
        }
        if (analisisJuridicoParrafos < minAnalisisJuridicoParrafos) {
          issues.push(`Análisis jurídico tiene solo ~${analisisJuridicoParrafos} párrafos (mínimo ${minAnalisisJuridicoParrafos})`);
        }
        if (documentosSugeridosCount < minDocumentosSugeridos) {
          issues.push(`Solo ${documentosSugeridosCount} documentos sugeridos (mínimo ${minDocumentosSugeridos})`);
        }
        if (citasCount < minCitas) {
          issues.push(`Solo ${citasCount} citas (mínimo ${minCitas})`);
        }
        
        // Validar coherencia entre secciones (B7)
        const coherenciaIssues: string[] = [];
        if (recomendacionesCount > 0 && riesgosCount > 0) {
          // Verificar que haya recomendaciones que correspondan a riesgos
          // (esto es una validación básica, el modelo debe asegurar la coherencia)
          if (recomendacionesCount < riesgosCount * 0.8) {
            coherenciaIssues.push(`Pocas recomendaciones (${recomendacionesCount}) comparado con riesgos (${riesgosCount}). Debe haber al menos una recomendación por cada riesgo crítico/alto.`);
          }
        }
        if (proximosPasosCount > 0 && recomendacionesCount > 0) {
          // Verificar que haya próximos pasos que correspondan a recomendaciones
          if (proximosPasosCount < recomendacionesCount * 0.5) {
            coherenciaIssues.push(`Pocos próximos pasos (${proximosPasosCount}) comparado con recomendaciones (${recomendacionesCount}). Debe haber próximos pasos para las recomendaciones críticas/altas.`);
          }
        }
        
        if (coherenciaIssues.length > 0) {
          issues.push(...coherenciaIssues.map(i => `Coherencia: ${i}`));
        }
        
        if (issues.length > 0) {
          console.warn(`[REPORT] ⚠️ Análisis no cumple mínimos: ${issues.join(", ")}`);
          console.warn(`[REPORT] Regenerando con instrucciones más estrictas...`);
          
          // Regenerar con instrucciones más estrictas
          const strictPrompt = `${prompt}

🚨🚨🚨 REGENERACIÓN OBLIGATORIA - NO CUMPLIO MÍNIMOS 🚨🚨🚨:
El análisis anterior NO cumplió los mínimos requeridos:
${issues.map(i => `- ${i}`).join("\n")}

DEBES regenerar el análisis cumpliendo TODOS los mínimos:
- MÍNIMO ${minClausulas} cláusulas analizadas (tienes ${clausulasCount})
- MÍNIMO ${minRiesgos} riesgos identificados (tienes ${riesgosCount})
- MÍNIMO ${minRecomendaciones} recomendaciones (tienes ${recomendacionesCount}) - DEBEN estar categorizadas por prioridad y tipo, e incluir costos, tiempos y responsables
- MÍNIMO ${minProximosPasos} próximos pasos (tienes ${proximosPasosCount}) - DEBEN estar estructurados por fases temporales (inmediata, corto plazo, mediano plazo, largo plazo)
- MÍNIMO ${minAnalisisJuridicoParrafos} párrafos en análisis jurídico (tienes ~${analisisJuridicoParrafos}) - DEBE estar estructurado en subsecciones claras
- MÍNIMO ${minDocumentosSugeridos} documentos sugeridos (tienes ${documentosSugeridosCount})
- MÍNIMO ${minCitas} citas (tienes ${citasCount})

⚠️ NO puedes generar menos elementos. Si el documento es pequeño, profundiza EXTRA en cada sección.
⚠️ Si necesitas más riesgos, busca desde diferentes perspectivas: jurídica, comercial, operativa, financiera, reputacional, contractual, de cumplimiento, etc.
⚠️ Si necesitas más recomendaciones, piensa en: recomendaciones críticas (deben hacerse sí o sí), importantes (deben hacerse pronto), preventivas (conviene hacer). Incluye costos, tiempos, responsables, y categoriza por prioridad.
⚠️ Si necesitas más próximos pasos, estructura por fases: inmediata (0-7 días), corto plazo (1-4 semanas), mediano plazo (1-3 meses), largo plazo (3+ meses). Incluye responsables, fechas límite, recursos, dependencias.
⚠️ Si necesitas más análisis jurídico, estructura en subsecciones: marco normativo, interpretación jurídica, validez legal, jurisprudencia, derechos/obligaciones, cumplimiento, estándares, vacíos legales, estructura, litigios, aspectos procesales, eficacia.
⚠️ Si necesitas más documentos sugeridos, piensa en: contratos relacionados, anexos, garantías, seguros, documentos de respaldo, acuerdos complementarios, etc.
⚠️ Si necesitas más citas, busca más normativa aplicable, jurisprudencia relevante, doctrina, etc.
⚠️ COHERENCIA: Asegúrate de que las recomendaciones correspondan a los riesgos identificados, y que los próximos pasos correspondan a las recomendaciones. Las citas deben usarse en el análisis jurídico.

NO respondas hasta cumplir TODOS los mínimos.`;

          // Regenerar con prompt más estricto
          const retryResponse = await Promise.race([
            openai.chat.completions.create({
              model: model,
              temperature: 0.3,
              max_tokens: maxTokens,
              messages: [
                {
                  role: "system",
                  content: `Eres un analista legal senior. Genera análisis ULTRA EXTENSOS y ULTRA DETALLADOS. Los mínimos son OBLIGATORIOS. Devuelve SOLO JSON válido.`,
                },
                {
                  role: "user",
                  content: `${strictPrompt}

${FUENTES_LEGALES}

═══════════════════════════════════════════════════════════════════════════════
🚨🚨🚨 INSTRUCCIONES Y CONTEXTO DEL USUARIO - PRIORIDAD ABSOLUTA 🚨🚨🚨
═══════════════════════════════════════════════════════════════════════════════

${instructionsText}

${instructionsText.includes("ANÁLISIS CONJUNTO") || instructionsText.includes("múltiples documentos") ? `
⚠️⚠️⚠️ RECORDATORIO CRÍTICO PARA ANÁLISIS CONJUNTO ⚠️⚠️⚠️:
- Estás analizando MÚLTIPLES DOCUMENTOS como un conjunto
- SIEMPRE usa PLURAL ("los documentos", "estos documentos", "los documentos analizados") en TODAS las secciones
- NUNCA uses "el documento" en singular
- El título DEBE ser "Análisis Legal Conjunto de [N] Documentos - [descripción]"
- El resumen_ejecutivo DEBE mencionar explícitamente que se analizaron múltiples documentos
- Analiza relaciones, consistencias e inconsistencias entre los documentos
- Compara cláusulas similares entre documentos
- Identifica riesgos que surgen de la interacción entre documentos
` : ""}

═══════════════════════════════════════════════════════════════════════════════

TIPO DE DOCUMENTO: ${input.type}

TEXTO ORIGINAL:
${isConjointAnalysis ? input.original.substring(0, 10000) : input.original.substring(0, 8000)}

CLÁUSULAS DEL DOCUMENTO (analizar TODAS):
${translatedText}

CHECKLIST DE ANÁLISIS PREVIO:
${checklistText}

JURISPRUDENCIA Y NORMATIVA RELEVANTE:
${jurisprudenceText}`,
                },
              ],
              response_format: { type: "json_object" },
            }, { timeout }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`Report generation timeout after ${timeout / 1000}s`)), timeout)
            )
          ]) as any;
          
          const retryContent = retryResponse.choices[0]?.message?.content;
          if (retryContent) {
            console.log(`[REPORT] ✅ Análisis regenerado cumpliendo mínimos`);
            return JSON.parse(retryContent.trim()) as AnalysisReport;
          }
        } else {
          console.log(`[REPORT] ✅ Análisis cumple mínimos: ${clausulasCount} cláusulas, ${riesgosCount} riesgos, ${recomendacionesCount} recomendaciones, ${documentosSugeridosCount} documentos sugeridos, ${citasCount} citas`);
        }
      } catch (validationError) {
        console.warn(`[REPORT] Error validando mínimos:`, validationError);
        // Continuar con el análisis original si falla la validación
      }
    }
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
