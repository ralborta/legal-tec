import { legalDb } from "./db.js";
import { getDocumentBuffer } from "./storage.js";
import { ocrAgent } from "./agents/ocr.js";
import { translatorAgent } from "./agents/translator.js";
import { classifierAgent } from "./agents/classifier.js";
import { runDistributionAnalyzer } from "./agents/analyzerDistribution.js";
import { generateReport } from "./agents/report.js";

export async function runFullAnalysis(documentId: string) {
  const doc = await legalDb.getDocument(documentId);
  if (!doc) {
    throw new Error("Document not found");
  }

  console.log(`[PIPELINE] Starting analysis for document ${documentId}`);

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

  // 2. Traducción y estructuración
  const translated = await translatorAgent(originalText);
  console.log(`[PIPELINE] Translation completed, ${translated.length} clauses`);

  // 3. Clasificación genérica
  const { type } = await classifierAgent(translated);
  console.log(`[PIPELINE] Classification: ${type}`);

  // 4. Router según tipo (por ahora, BASEUS / distribución)
  let checklist: any = null;
  if (type === "distribution_contract") {
    checklist = await runDistributionAnalyzer(translated);
    console.log(`[PIPELINE] Distribution analysis completed`);
  } else {
    checklist = { type, note: "No specific analyzer implemented yet" };
  }

  // 5. Generar reporte
  const report = await generateReport({
    original: originalText,
    translated,
    type,
    checklist,
  });
  console.log(`[PIPELINE] Report generated`);

  // 6. Guardar análisis
  await legalDb.upsertAnalysis({
    documentId,
    type,
    original: { text: originalText },
    translated,
    checklist,
    report,
  });

  console.log(`[PIPELINE] Analysis saved for document ${documentId}`);
}

