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

// Fuentes legales organizadas por jurisdicción y área
const FUENTES_LEGALES = `
## FUENTES DE CONSULTA OBLIGATORIAS

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

**CABA:**
- Boletín Oficial CABA: https://boletinoficial.buenosaires.gob.ar/
- Código Procesal CABA: https://www.argentina.gob.ar/normativa/provincial/ley-189-123456789-0abc-defg-981-0000xvorpyel/actualizacion

**Buenos Aires:**
- Boletín Oficial PBA: https://normas.gba.gob.ar/
- SIND PBA: https://www.gob.gba.gov.ar/legislacion/

**Córdoba:**
- Boletín Oficial: https://boletinoficial.cba.gov.ar/
- Legislatura: https://www.legislaturacba.gov.ar/

**Santa Fe:**
- Boletín Oficial: https://boletinoficial.santafe.gob.ar/
- Normativa: https://www.santafe.gov.ar/index.php/web/content/view/full/208678

**Mendoza:**
- Boletín Oficial: https://www.boletinoficial.mendoza.gov.ar/
- Poder Judicial: https://www.jus.mendoza.gov.ar

**Otras provincias:** Consultar en SAIJ la normativa provincial correspondiente.
`;

const prompt = `Eres un generador de reportes legales para WNS & Asociados.

INSTRUCCIONES IMPORTANTES:
1. PRIMERO: Detecta la JURISDICCIÓN del documento (Nacional, CABA, Buenos Aires, Córdoba, Santa Fe, Mendoza, u otra provincia)
2. SEGUNDO: Identifica el ÁREA LEGAL (Civil, Comercial, Laboral, Tributario, Penal, Administrativo, etc.)
3. TERCERO: Genera el análisis completo
4. CUARTO: OBLIGATORIO incluir sección "FUENTES Y REFERENCIAS" al final con las URLs relevantes

Genera un reporte de análisis legal completo en español basado en:

1. Texto original del documento
2. Cláusulas traducidas (español)
3. Clasificación del tipo de documento
4. Checklist de análisis (si disponible)
5. Jurisprudencia y precedentes legales (si disponible)

El reporte DEBE incluir:

- **Resumen Ejecutivo**
- **Jurisdicción y Área Legal Identificada**
- **Tipo de documento y características clave**
- **Análisis de cláusulas críticas**
- **Evaluación de riesgos** (considerando jurisprudencia relevante)
- **Precedentes legales y análisis jurisprudencial** (si disponible)
- **Recomendaciones para el cliente** (perspectiva del DISTRIBUIDOR)
- **Acciones a tomar**
- **FUENTES Y REFERENCIAS** (OBLIGATORIO - incluir URLs de las fuentes consultadas según jurisdicción y área legal)

Formato: Reporte legal profesional en español, estructurado con secciones claras.
Al citar jurisprudencia o normativa, incluir la fuente y URL.

Devuelve SOLO el texto del reporte, sin JSON, sin headers markdown.`;

export async function generateReport(input: ReportInput): Promise<string> {
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
        max_tokens: 3000, // Aumentado para incluir fuentes
        messages: [
          {
            role: "system",
            content: "Eres un generador de reportes legales. Devuelve SOLO el texto del reporte en español, formato profesional. SIEMPRE incluye una sección de FUENTES Y REFERENCIAS al final con URLs relevantes.",
          },
          {
            role: "user",
            content: `${prompt}

${FUENTES_LEGALES}

TIPO DE DOCUMENTO: ${input.type}

TEXTO ORIGINAL (primeros caracteres):
${input.original.substring(0, 2000)}

CLÁUSULAS TRADUCIDAS:
${translatedText}

CHECKLIST DE ANÁLISIS:
${checklistText}

JURISPRUDENCIA Y NORMATIVA RELEVANTE:
${jurisprudenceText}`,
          },
        ],
      }, { timeout }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Report generation timeout after 90s")), timeout)
      )
    ]) as any;
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[REPORT] Completed in ${duration}s`);

    const report = response.choices[0]?.message?.content || "No se pudo generar el reporte.";
    return report;
  } catch (error) {
    console.error("Error generando reporte:", error);
    return `Error al generar reporte: ${error instanceof Error ? error.message : "Error desconocido"}`;
  }
}
