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

// Fuentes legales - amplias pero sin repeticiones
const FUENTES_LEGALES = `FUENTES DE CONSULTA:
Nacional: InfoLEG (https://www.argentina.gob.ar/normativa), SAIJ (https://www.argentina.gob.ar/justicia/saij), Boletín Oficial (https://www.boletinoficial.gob.ar/), SIPROJUD (http://www.csjn.gov.ar/siprojur/), Código Civil y Comercial (http://www.bibliotecadigital.gob.ar/items/show/2690), Constitución Nacional (https://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/804/norma.htm)
Organismos: ANSES (https://www.anses.gob.ar/institucional/normativa), BCRA (http://www.bcra.gov.ar/BCRAyVos/Normativa.asp), AFIP (https://www.afip.gob.ar/normativa/), Trabajo (https://www.argentina.gob.ar/trabajo/normativa), Salud (https://www.argentina.gob.ar/salud/normativas)
Provincias: CABA (https://boletinoficial.buenosaires.gob.ar/), Buenos Aires (https://normas.gba.gob.ar/), Córdoba (https://boletinoficial.cba.gov.ar/), Santa Fe (https://boletinoficial.santafe.gob.ar/), Mendoza (https://www.boletinoficial.mendoza.gov.ar/)
Doctrina: SAIJ (https://www.saij.gob.ar/), UBA Derecho (https://www.derecho.uba.ar/investigacion/publicaciones.php)`;

// Prompt optimizado siguiendo mejores prácticas de OpenAI: claro, específico, sin repeticiones
const prompt = `Eres un analista legal senior. Analiza el documento y genera un JSON con esta estructura:

{
  "titulo": "Análisis Legal de [tipo] - [partes]" o "Análisis Legal Conjunto de [N] Documentos" si hay múltiples,
  "tipo_documento": "Tipo específico identificado",
  "jurisdiccion": "Jurisdicción detectada",
  "area_legal": "Área legal principal",
  "resumen_ejecutivo": "8-12 párrafos detallados con: partes, objeto, plazos, precios, contexto, relaciones. Si hay múltiples documentos, menciona explícitamente y usa PLURAL.",
  "clausulas_analizadas": [{"numero": "1", "titulo": "...", "analisis": "Análisis detallado de qué establece, implicancias, perspectivas, riesgos", "riesgo": "bajo|medio|alto"}],
  "analisis_juridico": "Mínimo 15 párrafos estructurados: marco normativo, interpretación, validez, jurisprudencia, derechos/obligaciones, cumplimiento, estándares, vacíos legales, estructura, litigios, aspectos procesales",
  "riesgos": [{"descripcion": "Riesgo específico coherente con instrucciones del usuario", "nivel": "bajo|medio|alto", "recomendacion": "Recomendación concreta"}],
  "recomendaciones": [{"descripcion": "Recomendación específica con pasos", "prioridad": "crítica|alta|media|baja", "urgencia": "inmediata|corto|mediano|largo", "costo_estimado": "...", "tiempo_estimado": "...", "responsable_sugerido": "..."}],
  "proximos_pasos": [{"accion": "Acción concreta", "fase": "inmediata|corto|mediano|largo", "responsable": "...", "fecha_limite": "...", "prioridad": "...", "recursos": "...", "dependencias": "...", "criterios_exito": "...", "impacto": "..."}],
  "citas": [{"tipo": "normativa|jurisprudencia|doctrina", "referencia": "Art. XXX...", "descripcion": "...", "url": "URL oficial"}],
  "documentos_sugeridos": [{"tipo": "...", "descripcion": "Justificación de por qué es relevante"}],
  "texto_formateado": "Reporte completo formateado profesionalmente"
}

Mínimos obligatorios: 15+ cláusulas, 10+ riesgos, 15+ recomendaciones, 12+ próximos pasos, 10+ citas, 5+ documentos sugeridos.
Aplica las instrucciones del usuario en TODAS las secciones. Si hay múltiples documentos, usa PLURAL siempre.`;

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
    // Consultar jurisprudencia (está deshabilitada pero no hace llamadas a OpenAI)
    const instructions = (input.userInstructions || "").trim();
    const instructionsText = instructions
      ? instructions.slice(0, 400) // Límite razonable: 400 caracteres
      : "Sin indicaciones adicionales del usuario.";
    if (instructions) {
      console.log(`[REPORT] Aplicando instrucciones del usuario (${instructions.length} chars)`);
    }
    
    const jurisprudence = await queryJurisprudence(
      input.original,
      input.type,
      4 // Reducido de 6 a 4 para optimizar
    );
    console.log(`[REPORT] Jurisprudencia: ${jurisprudence.length} fuentes encontradas`);

    const checklistText = input.checklist?.items
      ? input.checklist.items
          .map((item) => `${item.key}: ${item.found} (Riesgo: ${item.risk}) - ${item.comment}`)
          .join("\n")
      : "Sin checklist disponible";

    // Para análisis conjunto, necesitamos MÁS texto (múltiples documentos)
    const isConjointAnalysis = input.userInstructions?.includes("ANÁLISIS CONJUNTO") || 
                                 input.userInstructions?.includes("múltiples documentos") ||
                                 input.original.includes("DOCUMENTO 1 de") ||
                                 input.original.includes("DOCUMENTO 2 de");
    // Tamaño optimizado del texto del documento (balance entre contexto y tokens)
    const maxTextLength = isConjointAnalysis ? 8000 : 6000; // Aumentado ligeramente para mejor contexto
    
    const translatedText = input.translated
      .map((c) => `${c.clause_number}. ${c.title_es}\n${c.body_es}`)
      .join("\n\n")
      .substring(0, maxTextLength);

    // Formatear jurisprudencia - amplia pero optimizada
    const jurisprudenceText = jurisprudence.length > 0
      ? jurisprudence
          .map((j) => `${j.title} (${j.source}): ${j.text.substring(0, 500)}${j.url ? `\nFuente: ${j.url}` : ""}`)
          .join("\n\n")
      : "Usar las fuentes de referencia proporcionadas en FUENTES_LEGALES.";

    // Usar gpt-4o para ambos (máxima calidad y profundidad)
    // Análisis conjunto requiere MÁS profundidad, no menos
    const model = "gpt-4o"; // Siempre usar el modelo más potente para análisis profundo
    // Reducir tokens para controlar costos - 8000 es suficiente para análisis detallado
    // El problema de truncado se soluciona reduciendo el prompt, no aumentando tokens
    const maxTokens = isConjointAnalysis ? 8000 : 8000; // Reducido de 16384 a 8000 para controlar costos
    
    console.log(`[REPORT] Using model: ${model}, max_tokens: ${maxTokens}, conjoint: ${isConjointAnalysis}`);
    
    const response = await Promise.race([
      openai.chat.completions.create({
      model: model,
      temperature: 0.3,
        max_tokens: maxTokens,
      messages: [
        {
          role: "system",
            content: `Eres un analista legal senior de WNS & Asociados. Genera análisis profundos y exhaustivos cumpliendo los mínimos requeridos. Aplica las instrucciones del usuario coherentemente en todas las secciones. Devuelve SOLO JSON válido sin texto adicional.`,
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

REGLAS:
- Aplica las instrucciones del usuario en TODAS las secciones (resumen, cláusulas, riesgos, recomendaciones, etc.)
- Mínimos obligatorios: 15+ cláusulas, 10+ riesgos, 15+ recomendaciones, 12+ próximos pasos, 5+ documentos sugeridos, 10+ citas
- Si el documento es pequeño, profundiza más en cada sección
- Analiza desde múltiples perspectivas (jurídica, comercial, operativa, financiera)
- Mantén coherencia: riesgos deben corresponder a recomendaciones, próximos pasos a recomendaciones

TIPO DE DOCUMENTO: ${input.type}

TEXTO ORIGINAL:
${isConjointAnalysis ? input.original.substring(0, 2000) : input.original.substring(0, 1500)}

CLÁUSULAS DEL DOCUMENTO:
${translatedText}

CHECKLIST:
${checklistText}

JURISPRUDENCIA:
${jurisprudenceText}`,
          },
        ],
        response_format: { type: "json_object" },
      }, { timeout }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Report generation timeout after ${timeout / 1000}s`)), timeout)
      )
    ]) as any;
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const usage = response.usage;
    const promptTokens = usage?.prompt_tokens || 0;
    const completionTokens = usage?.completion_tokens || 0;
    const totalTokens = usage?.total_tokens || 0;
    console.log(`[REPORT] Completed in ${duration}s | Tokens: ${totalTokens} (prompt: ${promptTokens}, completion: ${completionTokens})`);

    // Verificar finish_reason para detectar truncado
    const finishReason = response.choices[0]?.finish_reason;
    if (finishReason === 'length') {
      console.error(`[REPORT] ❌ ERROR: Respuesta truncada por límite de tokens (finish_reason: length)`);
      console.error(`[REPORT] max_tokens usado: ${maxTokens}, pero la respuesta fue truncada`);
      throw new Error(`El reporte generado excedió el límite de tokens (${maxTokens}). El análisis es demasiado extenso. Intenta con un documento más corto o reduce las instrucciones adicionales.`);
    }

    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error("OpenAI no devolvió contenido");
    }
    
    // Validar que el contenido cumple con los mínimos requeridos
    try {
      const jsonText = content.trim();
      
      // Validar que el JSON no esté truncado
      if (jsonText.startsWith('{') && !jsonText.endsWith('}')) {
        console.error(`[REPORT] ❌ ERROR: JSON truncado - no termina con '}'`);
        console.error(`[REPORT] JSON length: ${jsonText.length}`);
        console.error(`[REPORT] finish_reason: ${finishReason}`);
        console.error(`[REPORT] Últimos 500 chars: ...${jsonText.substring(Math.max(0, jsonText.length - 500))}`);
        throw new Error(`JSON truncado: el reporte generado no está completo (length: ${jsonText.length}, finish_reason: ${finishReason || 'unknown'}). El análisis es demasiado extenso.`);
      }
      if (jsonText.startsWith('[') && !jsonText.endsWith(']')) {
        console.error(`[REPORT] ❌ ERROR: JSON truncado - no termina con ']'`);
        console.error(`[REPORT] finish_reason: ${finishReason}`);
        throw new Error(`JSON truncado: el reporte generado no está completo (finish_reason: ${finishReason || 'unknown'})`);
      }
        
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
          console.warn(`[REPORT] ⚠️ Continuando con análisis actual para evitar gasto adicional de tokens`);
          // No regenerar automáticamente - el usuario puede usar el chat para regenerar si necesita
        } else {
          console.log(`[REPORT] ✅ Análisis cumple mínimos: ${clausulasCount} cláusulas, ${riesgosCount} riesgos, ${recomendacionesCount} recomendaciones, ${documentosSugeridosCount} documentos sugeridos, ${citasCount} citas`);
        }

        // Limpiar JSON si viene con markdown (si no se regeneró)
        let finalJsonText = jsonText;
        if (finalJsonText.startsWith("```json")) {
          finalJsonText = finalJsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (finalJsonText.startsWith("```")) {
          finalJsonText = finalJsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        const finalParsed = JSON.parse(finalJsonText) as AnalysisReport;

        // Validar estructura mínima
        if (!finalParsed.titulo || !finalParsed.resumen_ejecutivo) {
          throw new Error("Respuesta de OpenAI incompleta: faltan campos requeridos");
        }

        // Asegurar arrays
        finalParsed.clausulas_analizadas = finalParsed.clausulas_analizadas || [];
        finalParsed.riesgos = finalParsed.riesgos || [];
        finalParsed.recomendaciones = finalParsed.recomendaciones || [];
        finalParsed.proximos_pasos = finalParsed.proximos_pasos || [];
        finalParsed.citas = finalParsed.citas || [];
        finalParsed.documentos_sugeridos = finalParsed.documentos_sugeridos || [];

        console.log(`[REPORT] ✅ Reporte generado con ${finalParsed.clausulas_analizadas.length} cláusulas, ${finalParsed.riesgos.length} riesgos, ${finalParsed.recomendaciones.length} recomendaciones`);
        console.log(`[REPORT] Instrucciones aplicadas: ${input.userInstructions ? "SÍ ✅" : "NO ❌"}`);
        if (input.userInstructions) {
          console.log(`[REPORT] Contenido de instrucciones (primeros 200 chars): ${input.userInstructions.substring(0, 200)}...`);
          console.log(`[REPORT] Contiene contexto del chat: ${input.userInstructions.includes("CONTEXTO") || input.userInstructions.includes("CHAT") ? "SÍ ✅" : "NO ❌"}`);
        }

        return finalParsed;
      } catch (validationError) {
        console.warn(`[REPORT] Error validando mínimos:`, validationError);
        // Si falla la validación, intentar parsear el JSON de todas formas
        let fallbackJsonText = content.trim();
        if (fallbackJsonText.startsWith("```json")) {
          fallbackJsonText = fallbackJsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (fallbackJsonText.startsWith("```")) {
          fallbackJsonText = fallbackJsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }
        const fallbackParsed = JSON.parse(fallbackJsonText) as AnalysisReport;
        
        // Asegurar arrays
        fallbackParsed.clausulas_analizadas = fallbackParsed.clausulas_analizadas || [];
        fallbackParsed.riesgos = fallbackParsed.riesgos || [];
        fallbackParsed.recomendaciones = fallbackParsed.recomendaciones || [];
        fallbackParsed.proximos_pasos = fallbackParsed.proximos_pasos || [];
        fallbackParsed.citas = fallbackParsed.citas || [];
        fallbackParsed.documentos_sugeridos = fallbackParsed.documentos_sugeridos || [];
        
        return fallbackParsed;
      }
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
