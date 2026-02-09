import { legalDb } from "./db.js";
import { getDocumentBuffer } from "./storage.js";
import { ocrAgent } from "./agents/ocr.js";
import { translatorAgent } from "./agents/translator.js";
import { classifierAgent } from "./agents/classifier.js";
import { runDistributionAnalyzer } from "./agents/analyzerDistribution.js";
import { generateReport } from "./agents/report.js";
import { acquireAnalysisSlot } from "./concurrency-limit.js";

// Función para análisis conjunto de múltiples documentos
export async function runFullAnalysisMany(documentIds: string[], userInstructions?: string | null) {
  const startTime = Date.now();
  const MAX_PIPELINE_TIME = 900000; // 15 minutos para múltiples documentos (análisis ultra profundo y exhaustivo)
  const trimmedInstructions = userInstructions?.trim() || null;
  
  // Adquirir slot de análisis
  let releaseSlot: (() => void) | null = null;
  try {
    releaseSlot = await acquireAnalysisSlot();
    console.log(`[PIPELINE-MANY] Slot adquirido para análisis conjunto de ${documentIds.length} documentos`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido al adquirir slot";
    console.error(`[PIPELINE-MANY] Error adquiriendo slot: ${errorMessage}`);
    await updateAnalysisStatus(documentIds[0], "error", 0);
    await legalDb.setAnalysisError(
      documentIds[0],
      `El sistema está procesando demasiados análisis simultáneamente. ${errorMessage} Por favor, intenta nuevamente en unos momentos.`
    );
    throw error;
  }
  
  const pipelineTimeout = setTimeout(async () => {
    console.error(`[PIPELINE-MANY] TIMEOUT: Analysis exceeded ${MAX_PIPELINE_TIME}ms for ${documentIds.length} documents`);
    if (releaseSlot) releaseSlot();
    await updateAnalysisStatus(documentIds[0], "error", 0);
    await legalDb.setAnalysisError(
      documentIds[0],
      `Timeout: El análisis conjunto de ${documentIds.length} documentos excedió el tiempo máximo de ${MAX_PIPELINE_TIME / 1000} segundos. Intenta con menos documentos o documentos más pequeños.`
    );
    throw new Error(`Pipeline timeout: analysis took more than ${MAX_PIPELINE_TIME / 1000}s`);
  }, MAX_PIPELINE_TIME);
  
  try {
    // El primer documento será el "principal" donde guardaremos el análisis conjunto
    const primaryDocumentId = documentIds[0];
    const otherDocumentIds = documentIds.slice(1);
    
    console.log(`[PIPELINE-MANY] Starting CONJOINT analysis for ${documentIds.length} documents`);
    console.log(`[PIPELINE-MANY] Primary document: ${primaryDocumentId}`);
    console.log(`[PIPELINE-MANY] Other documents: ${otherDocumentIds.join(", ")}`);
    
    await updateAnalysisStatus(primaryDocumentId, "ocr", 10);
    
    // 1. Extraer texto de TODOS los documentos
    const allTexts: Array<{ documentId: string; filename: string; text: string }> = [];
    
    for (const docId of documentIds) {
      const doc = await legalDb.getDocument(docId);
      if (!doc) {
        throw new Error(`Document ${docId} not found`);
      }
      
      const fileBuffer = await getDocumentBuffer(docId);
      if (!fileBuffer) {
        throw new Error(`Could not read file for document ${docId}`);
      }
      
      const text = await ocrAgent({
        buffer: fileBuffer,
        mimeType: doc.mime_type,
        filename: doc.filename,
      });
      
      allTexts.push({
        documentId: docId,
        filename: doc.filename,
        text: text,
      });
      
      console.log(`[PIPELINE-MANY] ✅ Extracted ${text.length} chars from ${doc.filename}`);
    }
    
    // 2. Combinar todos los textos con separadores claros
    const combinedText = allTexts.map((item, index) => {
      return `\n\n═══════════════════════════════════════════════════════════════════════════════
DOCUMENTO ${index + 1} de ${allTexts.length}: ${item.filename}
Document ID: ${item.documentId}
═══════════════════════════════════════════════════════════════════════════════\n${item.text}`;
    }).join("\n\n");
    
    console.log(`[PIPELINE-MANY] Combined text length: ${combinedText.length} characters`);
    const MIN_EXTRACTED_TEXT = 80;
    if (combinedText.trim().length < MIN_EXTRACTED_TEXT) {
      console.warn(`[PIPELINE-MANY] ⚠️ Texto extraído insuficiente (${combinedText.trim().length} caracteres). No se generará análisis hueco.`);
      const errorReport = {
        error: true,
        errorMessage: `No se pudo extraer texto de los ${documentIds.length} archivos. Si tu contrato es un solo documento de varias páginas, subí un único PDF (no cada página por separado). Si son escaneos, asegurate de que tengan buena calidad o que el PDF tenga texto seleccionable.`,
        errorType: "TEXT_EXTRACTION_FAILED",
      };
      await legalDb.upsertAnalysis({
        documentId: primaryDocumentId,
        type: "unreadable",
        original: { text: combinedText.trim(), documents: allTexts.map(t => ({ id: t.documentId, filename: t.filename })) },
        translated: [],
        checklist: null,
        report: errorReport,
        userInstructions: trimmedInstructions || undefined,
      });
      await updateAnalysisStatus(primaryDocumentId, "completed", 100);
      clearTimeout(pipelineTimeout);
      if (releaseSlot) releaseSlot();
      return;
    }
    await updateAnalysisStatus(primaryDocumentId, "translating", 25);
    
    // 3. Traducción y estructuración del texto combinado
    const translated = await translatorAgent(combinedText);
    console.log(`[PIPELINE-MANY] Translation completed, ${translated.length} clauses from all documents`);
    await updateAnalysisStatus(primaryDocumentId, "classifying", 40);
    
    // 4. Clasificación (del conjunto)
    const { type } = await classifierAgent(translated);
    console.log(`[PIPELINE-MANY] Classification: ${type}`);
    await updateAnalysisStatus(primaryDocumentId, "analyzing", 60);
    
    // 5. Análisis específico según tipo
    let checklist: any = null;
    if (type === "distribution_contract") {
      checklist = await runDistributionAnalyzer(translated);
      console.log(`[PIPELINE-MANY] Distribution analysis completed`);
    } else {
      checklist = { type, note: "No specific analyzer implemented yet" };
    }
    await updateAnalysisStatus(primaryDocumentId, "generating_report", 80);
    
    // 6. Generar reporte conjunto con instrucciones especiales
    const documentNames = allTexts.map(t => t.filename).join(", ");
    const manyInstructions = trimmedInstructions 
      ? `${trimmedInstructions}\n\n🚨🚨🚨 ANÁLISIS CONJUNTO DE MÚLTIPLES DOCUMENTOS 🚨🚨🚨\n\nEste análisis incluye ${documentIds.length} documentos relacionados:\n${allTexts.map((t, i) => `${i + 1}. ${t.filename}`).join('\n')}\n\nINSTRUCCIONES CRÍTICAS PARA EL ANÁLISIS:\n1. SIEMPRE usa PLURAL: "los documentos", "estos documentos", "los documentos analizados", NO uses "el documento" en singular\n2. El resumen ejecutivo DEBE mencionar explícitamente que se analizaron ${documentIds.length} documentos: "Este análisis incluye ${documentIds.length} documentos relacionados: ${documentNames}"\n3. Analiza el CONJUNTO de todos los documentos, sus relaciones, consistencias, contradicciones, y cómo se complementan entre sí\n4. Identifica si forman parte de una transacción o proceso legal conjunto\n5. Compara y contrasta las disposiciones entre los diferentes documentos\n6. Identifica si hay información que se complementa entre documentos o si hay contradicciones\n7. En el análisis jurídico, menciona cómo se relacionan los documentos entre sí\n8. En las cláusulas analizadas, indica de qué documento proviene cada cláusula cuando sea relevante\n9. El título del análisis DEBE ser: "Análisis Legal Conjunto de ${documentIds.length} Documentos - [descripción del conjunto]"\n10. TODAS las secciones (resumen, análisis jurídico, riesgos, recomendaciones) DEBEN referirse a "los documentos" en plural, nunca "el documento" en singular`
      : `🚨🚨🚨 ANÁLISIS CONJUNTO DE MÚLTIPLES DOCUMENTOS 🚨🚨🚨\n\nEste análisis incluye ${documentIds.length} documentos relacionados:\n${allTexts.map((t, i) => `${i + 1}. ${t.filename}`).join('\n')}\n\nINSTRUCCIONES CRÍTICAS PARA EL ANÁLISIS:\n1. SIEMPRE usa PLURAL: "los documentos", "estos documentos", "los documentos analizados", NO uses "el documento" en singular\n2. El resumen ejecutivo DEBE mencionar explícitamente que se analizaron ${documentIds.length} documentos: "Este análisis incluye ${documentIds.length} documentos relacionados: ${documentNames}"\n3. Analiza el CONJUNTO de todos los documentos, sus relaciones, consistencias, contradicciones, y cómo se complementan entre sí\n4. Identifica si forman parte de una transacción o proceso legal conjunto\n5. Compara y contrasta las disposiciones entre los diferentes documentos\n6. Identifica si hay información que se complementa entre documentos o si hay contradicciones\n7. En el análisis jurídico, menciona cómo se relacionan los documentos entre sí\n8. En las cláusulas analizadas, indica de qué documento proviene cada cláusula cuando sea relevante\n9. El título del análisis DEBE ser: "Análisis Legal Conjunto de ${documentIds.length} Documentos - [descripción del conjunto]"\n10. TODAS las secciones (resumen, análisis jurídico, riesgos, recomendaciones) DEBEN referirse a "los documentos" en plural, nunca "el documento" en singular`;
    
    const report = await generateReport({
      original: combinedText,
      translated,
      type,
      checklist,
      userInstructions: manyInstructions,
    });
    console.log(`[PIPELINE-MANY] Report generated for ${documentIds.length} documents`);
    await updateAnalysisStatus(primaryDocumentId, "saving", 90);
    
    // 7. Guardar análisis en el documento principal
    await legalDb.upsertAnalysis({
      documentId: primaryDocumentId,
      type,
      original: { text: combinedText, documents: allTexts.map(t => ({ id: t.documentId, filename: t.filename })) },
      translated,
      checklist,
      report,
      userInstructions: trimmedInstructions,
    });
    
    // Guardar referencia en los otros documentos también
    for (const docId of otherDocumentIds) {
      await legalDb.upsertAnalysis({
        documentId: docId,
        type,
        original: { text: "", isPartOfConjointAnalysis: true, primaryDocumentId },
        translated: [],
        checklist: null,
        report: null,
        userInstructions: trimmedInstructions,
      });
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[PIPELINE-MANY] Conjoint analysis completed for ${documentIds.length} documents in ${duration}s`);
    await updateAnalysisStatus(primaryDocumentId, "completed", 100);
    clearTimeout(pipelineTimeout);
    if (releaseSlot) releaseSlot();
  } catch (error) {
    clearTimeout(pipelineTimeout);
    if (releaseSlot) releaseSlot();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[PIPELINE-MANY] ERROR after ${duration}s:`, error);
    await updateAnalysisStatus(documentIds[0], "error", 0);
    await legalDb.setAnalysisError(
      documentIds[0],
      error instanceof Error ? error.message : "Error desconocido"
    );
    throw error;
  }
}

// Función helper para actualizar estado del análisis
async function updateAnalysisStatus(documentId: string, status: string, progress: number) {
  try {
    await legalDb.updateAnalysisStatus(documentId, status, progress);
  } catch (error) {
    console.warn(`[PIPELINE] No se pudo actualizar estado: ${error}`);
  }
}

export async function runFullAnalysis(documentId: string, userInstructions?: string | null) {
  const startTime = Date.now();
  // Aumentar timeout: el reporte puede tardar hasta 5 min, más tiempo para OCR, traducción, etc.
  const MAX_PIPELINE_TIME = 420000; // 7 minutos máximo para todo el pipeline (reporte 5min + otros pasos 2min)
  const trimmedInstructions = userInstructions?.trim() || null;
  
  // Adquirir slot de análisis (limita concurrencia)
  let releaseSlot: (() => void) | null = null;
  try {
    releaseSlot = await acquireAnalysisSlot();
    console.log(`[PIPELINE] Slot adquirido para análisis ${documentId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido al adquirir slot";
    console.error(`[PIPELINE] Error adquiriendo slot: ${errorMessage}`);
    await updateAnalysisStatus(documentId, "error", 0);
    await legalDb.setAnalysisError(
      documentId,
      `El sistema está procesando demasiados análisis simultáneamente. ${errorMessage} Por favor, intenta nuevamente en unos momentos.`
    );
    throw error;
  }
  
  // Timeout global para todo el pipeline
  const pipelineTimeout = setTimeout(() => {
    console.error(`[PIPELINE] TIMEOUT: Analysis exceeded ${MAX_PIPELINE_TIME}ms for document ${documentId}`);
    if (releaseSlot) releaseSlot(); // Liberar slot en caso de timeout
    throw new Error(`Pipeline timeout: analysis took more than ${MAX_PIPELINE_TIME / 1000}s`);
  }, MAX_PIPELINE_TIME);
  
  try {
    const doc = await legalDb.getDocument(documentId);
    if (!doc) {
      throw new Error("Document not found");
    }

    console.log(`[PIPELINE] Starting FULL analysis for document ${documentId}`);
    await updateAnalysisStatus(documentId, "ocr", 10);

    // 1. OCR / Extraer texto
    const fileBuffer = await getDocumentBuffer(documentId);
    if (!fileBuffer) {
      // Si no se puede leer el archivo, intentar regenerar usando datos existentes
      console.warn(`[PIPELINE] ⚠️ No se pudo leer el archivo, intentando regenerar usando datos existentes...`);
      const existingAnalysis = await legalDb.getAnalysis(documentId);
      if (existingAnalysis && existingAnalysis.original && existingAnalysis.translated) {
        console.log(`[PIPELINE] ✅ Análisis previo encontrado, regenerando solo el reporte...`);
        // No borrar el análisis, solo regenerar el reporte
        return await regenerateReportOnly(documentId, trimmedInstructions, existingAnalysis);
      } else {
        throw new Error("Could not read document file and no previous analysis available");
      }
    }

    // Si hay un análisis previo, usar datos existentes para evitar llamadas innecesarias
    // EXCEPCIÓN: si el texto original guardado es muy corto (< 500 chars), re-ejecutar OCR (p. ej. Document AI no estaba configurado la primera vez)
    const existingAnalysis = await legalDb.getAnalysis(documentId);
    const MIN_ORIGINAL_LENGTH_TO_REUSE = 500;
    let existingOriginalLength = 0;
    if (existingAnalysis?.original) {
      const orig = existingAnalysis.original as { text?: string } | string;
      existingOriginalLength = typeof orig === "string" ? orig.length : (orig?.text?.length ?? 0);
    }
    const shouldReuseAnalysis = existingAnalysis && existingAnalysis.original && existingAnalysis.translated && existingOriginalLength >= MIN_ORIGINAL_LENGTH_TO_REUSE;

    if (shouldReuseAnalysis) {
      console.log(`[PIPELINE] ⚠️ Análisis previo encontrado para ${documentId} (${existingOriginalLength} chars), usando datos existentes`);
      if (trimmedInstructions || !existingAnalysis.report) {
        console.log(`[PIPELINE] Regenerando solo el reporte con datos existentes...`);
        return await regenerateReportOnly(documentId, trimmedInstructions, existingAnalysis);
      } else {
        console.log(`[PIPELINE] Análisis completo ya existe, no se regenera`);
        await updateAnalysisStatus(documentId, "completed", 100);
        return;
      }
    }
    if (existingAnalysis && existingAnalysis.original && existingOriginalLength > 0 && existingOriginalLength < MIN_ORIGINAL_LENGTH_TO_REUSE) {
      console.log(`[PIPELINE] Texto original previo muy breve (${existingOriginalLength} chars). Re-ejecutando OCR (p. ej. Document AI).`);
    }

  const originalText = await ocrAgent({
    buffer: fileBuffer,
    mimeType: doc.mime_type,
    filename: doc.filename,
  });

  console.log(`[PIPELINE] OCR completed, extracted ${originalText.length} characters`);
  const trimmed = (originalText || "").trim();
  const MIN_EXTRACTED_TEXT = 80;
  if (trimmed.length < MIN_EXTRACTED_TEXT) {
    console.warn(`[PIPELINE] ⚠️ Texto extraído insuficiente (${trimmed.length} caracteres). No se generará análisis hueco.`);
    const errorReport = {
      error: true,
      errorMessage: "No se pudo extraer texto del documento. Puede ser un PDF escaneado de mala calidad, una imagen sin texto o un formato no soportado. Intentá con otro archivo o asegurate de que el PDF tenga texto seleccionable.",
      errorType: "TEXT_EXTRACTION_FAILED",
    };
    await legalDb.upsertAnalysis({
      documentId,
      type: "unreadable",
      original: { text: trimmed || "" },
      translated: [],
      checklist: null,
      report: errorReport,
      userInstructions: trimmedInstructions || undefined,
    });
    await updateAnalysisStatus(documentId, "completed", 100);
    clearTimeout(pipelineTimeout);
    if (releaseSlot) releaseSlot();
    return;
  }

  await updateAnalysisStatus(documentId, "translating", 25);

  // 2. Traducción y estructuración
  const translated = await translatorAgent(originalText);
  console.log(`[PIPELINE] Translation completed, ${translated.length} clauses`);
  await updateAnalysisStatus(documentId, "classifying", 40);

  // 3. Clasificación genérica
  const { type } = await classifierAgent(translated);
  console.log(`[PIPELINE] Classification: ${type}`);
  await updateAnalysisStatus(documentId, "analyzing", 60);

  // 4. Router según tipo (por ahora, BASEUS / distribución)
  let checklist: any = null;
  if (type === "distribution_contract") {
    checklist = await runDistributionAnalyzer(translated);
    console.log(`[PIPELINE] Distribution analysis completed`);
  } else {
    checklist = { type, note: "No specific analyzer implemented yet" };
  }
  await updateAnalysisStatus(documentId, "generating_report", 80);

  // 5. Generar reporte
  const report = await generateReport({
    original: originalText,
    translated,
    type,
    checklist,
    userInstructions: trimmedInstructions || undefined,
  });
  console.log(`[PIPELINE] Report generated`);
  await updateAnalysisStatus(documentId, "saving", 90);

  // 6. Guardar análisis
  console.log(`[PIPELINE] Guardando análisis en la DB para ${documentId}... (texto original: ${originalText.length} caracteres)`);
  try {
    await legalDb.upsertAnalysis({
      documentId,
      type,
      original: { text: originalText },
      translated,
      checklist,
      report,
      userInstructions: trimmedInstructions,
    });
    console.log(`[PIPELINE] ✅ Análisis guardado exitosamente en la DB`);
  } catch (saveError: any) {
    console.error(`[PIPELINE] ❌ Error guardando análisis:`, saveError);
    throw new Error(`Error al guardar análisis: ${saveError.message || "Error desconocido"}`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[PIPELINE] Analysis completed for document ${documentId} in ${duration}s`);
  await updateAnalysisStatus(documentId, "completed", 100);
    clearTimeout(pipelineTimeout);
    if (releaseSlot) releaseSlot(); // Liberar slot al completar
  } catch (error) {
    clearTimeout(pipelineTimeout);
    if (releaseSlot) releaseSlot(); // Liberar slot en caso de error
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[PIPELINE] ERROR after ${duration}s:`, error);
    await updateAnalysisStatus(documentId, "error", 0);
    await legalDb.setAnalysisError(
      documentId,
      error instanceof Error ? error.message : "Error desconocido"
    );
    throw error;
  }
}

// Función para regenerar solo el reporte usando datos existentes (sin archivo)
export async function regenerateReportOnly(
  documentId: string,
  userInstructions?: string | null,
  existingAnalysis?: any
) {
  try {
    console.log(`[REGENERATE-REPORT] ========================================`);
    console.log(`[REGENERATE-REPORT] Iniciando regeneración para documento ${documentId}`);
    console.log(`[REGENERATE-REPORT] Instrucciones del usuario: ${userInstructions ? `SÍ (${userInstructions.length} chars)` : 'NO'}`);
    
    // Actualizar estado inicial
    await updateAnalysisStatus(documentId, "generating_report", 10);
    console.log(`[REGENERATE-REPORT] ✅ Estado actualizado a 'generating_report' (10%)`);
    
    // Si no se pasó el análisis, obtenerlo de la DB
    let analysis = existingAnalysis;
    if (!analysis) {
      console.log(`[REGENERATE-REPORT] Obteniendo análisis de la DB...`);
      analysis = await legalDb.getAnalysis(documentId);
      if (!analysis) {
        throw new Error("No hay análisis previo disponible para regenerar");
      }
      console.log(`[REGENERATE-REPORT] ✅ Análisis obtenido de la DB`);
    } else {
      console.log(`[REGENERATE-REPORT] ✅ Usando análisis pasado como parámetro`);
    }
    
    // Parsear los datos existentes
    console.log(`[REGENERATE-REPORT] Parseando datos existentes...`);
    const original = typeof analysis.original === 'string' 
      ? JSON.parse(analysis.original) 
      : analysis.original;
    const translated = typeof analysis.translated === 'string'
      ? JSON.parse(analysis.translated)
      : analysis.translated;
    const checklist = typeof analysis.checklist === 'string'
      ? JSON.parse(analysis.checklist)
      : analysis.checklist;
    console.log(`[REGENERATE-REPORT] ✅ Datos parseados: original=${typeof original}, translated=${Array.isArray(translated) ? translated.length + ' cláusulas' : typeof translated}, checklist=${typeof checklist}`);
    
    // Extraer texto original (puede estar en formato objeto o string)
    let originalText: string;
    if (typeof original === 'string') {
      originalText = original;
    } else if (original && typeof original === 'object' && original.text) {
      originalText = original.text;
    } else {
      originalText = JSON.stringify(original);
    }
    console.log(`[REGENERATE-REPORT] ✅ Texto original extraído: ${originalText.length} caracteres`);
    
    // Actualizar estado - asegurar que el documento existe en la DB
    console.log(`[REGENERATE-REPORT] Verificando que el documento existe en la DB...`);
    const doc = await legalDb.getDocument(documentId);
    if (!doc) {
      throw new Error("Document not found in database");
    }
    console.log(`[REGENERATE-REPORT] ✅ Documento verificado: ${doc.filename}`);
    
    await updateAnalysisStatus(documentId, "generating_report", 50);
    console.log(`[REGENERATE-REPORT] ✅ Estado actualizado a 'generating_report' (50%)`);
    
    // Generar nuevo reporte con las instrucciones del usuario
    console.log(`[REGENERATE-REPORT] Generando nuevo reporte con gpt-4o...`);
    await updateAnalysisStatus(documentId, "generating_report", 60);
    const report = await generateReport({
      original: originalText,
      translated,
      type: analysis.type || "unknown",
      checklist,
      userInstructions: userInstructions || undefined,
    });
    console.log(`[REGENERATE-REPORT] ✅ Reporte generado exitosamente`);
    
    // Guardar el nuevo reporte (manteniendo original, translated, checklist)
    console.log(`[REGENERATE-REPORT] Guardando análisis en la DB...`);
    await updateAnalysisStatus(documentId, "saving", 90);
    await legalDb.upsertAnalysis({
      documentId,
      type: analysis.type || "unknown",
      original,
      translated,
      checklist,
      report,
      userInstructions: userInstructions || undefined,
    });
    console.log(`[REGENERATE-REPORT] ✅ Análisis guardado en la DB`);
    
    await updateAnalysisStatus(documentId, "completed", 100);
    console.log(`[REGENERATE-REPORT] ✅ Reporte regenerado exitosamente para documento ${documentId}`);
    console.log(`[REGENERATE-REPORT] ========================================`);
  } catch (error: any) {
    console.error(`[REGENERATE-REPORT] ❌ Error regenerando reporte:`, error);
    await updateAnalysisStatus(documentId, "error", 0);
    throw error;
  }
}
