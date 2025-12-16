import { legalDb } from "./db.js";
import { getDocumentBuffer } from "./storage.js";
import { ocrAgent } from "./agents/ocr.js";
import { translatorAgent } from "./agents/translator.js";
import { classifierAgent } from "./agents/classifier.js";
import { runDistributionAnalyzer } from "./agents/analyzerDistribution.js";
import { generateReport } from "./agents/report.js";

// Función helper para actualizar estado del análisis
async function updateAnalysisStatus(documentId: string, status: string, progress: number) {
  try {
    await legalDb.updateAnalysisStatus(documentId, status, progress);
  } catch (error) {
    console.warn(`[PIPELINE] No se pudo actualizar estado: ${error}`);
  }
}

export async function runFullAnalysis(documentId: string) {
  const startTime = Date.now();
  const MAX_PIPELINE_TIME = 180000; // 3 minutos máximo para todo el pipeline
  
  // Timeout global para todo el pipeline
  const pipelineTimeout = setTimeout(() => {
    console.error(`[PIPELINE] TIMEOUT: Analysis exceeded ${MAX_PIPELINE_TIME}ms for document ${documentId}`);
    throw new Error(`Pipeline timeout: analysis took more than ${MAX_PIPELINE_TIME / 1000}s`);
  }, MAX_PIPELINE_TIME);
  
  try {
    const doc = await legalDb.getDocument(documentId);
    if (!doc) {
      throw new Error("Document not found");
    }

    console.log(`[PIPELINE] Starting analysis for document ${documentId}`);
    await updateAnalysisStatus(documentId, "ocr", 10);

  // 1. OCR / Extraer texto
  const fileBuffer = await getDocumentBuffer(documentId);
  if (!fileBuffer) {
    throw new Error("Could not read document file");
  }

  const originalText = await ocrAgent({
    buffer: fileBuffer,
    mimeType: doc.mime_type,
    filename: doc.filename,
  });

  console.log(`[PIPELINE] OCR completed, extracted ${originalText.length} characters`);
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
  });
  console.log(`[PIPELINE] Report generated`);
  await updateAnalysisStatus(documentId, "saving", 90);

  // 6. Guardar análisis
  await legalDb.upsertAnalysis({
    documentId,
    type,
    original: { text: originalText },
    translated,
    checklist,
    report,
  });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[PIPELINE] Analysis completed for document ${documentId} in ${duration}s`);
    await updateAnalysisStatus(documentId, "completed", 100);
    clearTimeout(pipelineTimeout);
  } catch (error) {
    clearTimeout(pipelineTimeout);
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

