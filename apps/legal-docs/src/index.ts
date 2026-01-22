import "dotenv/config";
import express from "express";
import multer from "multer";
import { runFullAnalysis, regenerateReportOnly } from "./pipeline.js";
import { saveOriginalDocument, getFullResult } from "./storage.js";
import { startCleanupScheduler } from "./cleanup.js";
import { getConcurrencyStats } from "./concurrency-limit.js";
import { legalDb, db } from "./db.js";

const app = express();

// ✅ Log de inicio para verificar que el código correcto se está ejecutando
console.log("=".repeat(60));
console.log("[LEGAL-DOCS] 🚀 Iniciando servicio legal-docs (Express)");
console.log("[LEGAL-DOCS] Timestamp:", new Date().toISOString());
console.log("=".repeat(60));

// ✅ Health check (primera ruta, siempre disponible)
app.get("/health", (_req, res) => {
  res.json({ 
    status: "ok", 
    service: "legal-docs",
    framework: "express",
    timestamp: new Date().toISOString()
  });
});

// Endpoint de métricas básicas
app.get("/metrics", async (_req, res) => {
  const stats = getConcurrencyStats();
  const { getStorageStats } = await import("./cleanup.js");
  const storageStats = await getStorageStats();
  
  res.json({
    concurrency: stats,
    storage: storageStats,
    timestamp: new Date().toISOString()
  });
});

// ✅ Configurar multer con límite de tamaño (50MB)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  }
});

// Middleware
// CORS para frontend en Vercel y desarrollo local (y para uso vía proxy)
const allowedOriginsFromEnv = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string) {
  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return true;
  if (origin.includes(".vercel.app") || origin.endsWith("vercel.app")) return true;
  if (origin.includes("nivel41.uk")) return true; // Dominio personalizado
  if (allowedOriginsFromEnv.includes(origin)) return true;
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Log para debug (solo en desarrollo o si hay origin)
  if (origin) {
    console.log(`[CORS] Request desde origin: ${origin}, método: ${req.method}, path: ${req.path}`);
  }
  
  if (origin && typeof origin === "string" && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    console.log(`[CORS] ✅ Origin permitido: ${origin}`);
  } else if (origin) {
    console.warn(`[CORS] ❌ Origin denegado: ${origin}`);
  }
  
  if (req.method === "OPTIONS") {
    console.log(`[CORS] Respondiendo a OPTIONS request desde: ${origin || "sin origin"}`);
    return res.status(204).end();
  }
  next();
});

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ service: "legal-docs", ok: true });
});

// Endpoint de diagnóstico para ver qué rutas están registradas
app.get("/debug/routes", (_req, res) => {
  const routes: string[] = [];
  app._router?.stack?.forEach((middleware: any) => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods).join(",").toUpperCase();
      routes.push(`${methods} ${middleware.route.path}`);
    } else if (middleware.name === "router") {
      middleware.handle.stack?.forEach((handler: any) => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods).join(",").toUpperCase();
          routes.push(`${methods} ${handler.route.path}`);
        }
      });
    }
  });
  res.json({ routes, total: routes.length });
});

// Upload documento - ✅ Versión robusta: solo devuelve documentId si el archivo se guardó correctamente
async function handleUpload(req: express.Request, res: express.Response, next: express.NextFunction) {
  // ✅ Asegurar headers CORS antes de procesar (por si multer los borra)
  const origin = req.headers.origin;
  if (origin && typeof origin === "string" && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");
  }
  
  console.log(`[UPLOAD] Request recibido en ${req.path}, method: ${req.method}`);
  console.log(`[UPLOAD] Headers:`, { "content-type": req.headers["content-type"], "content-length": req.headers["content-length"], origin });
  
  try {
    if (!req.file) {
      console.log("[UPLOAD] Error: no file in request");
      return res.status(400).json({ 
        error: "file is required",
        message: "Debes enviar un archivo en el campo 'file'"
      });
    }

    if (!req.file.buffer || req.file.buffer.length === 0) {
      console.log("[UPLOAD] Error: archivo vacío");
      return res.status(400).json({ 
        error: "empty file",
        message: "El archivo está vacío"
      });
    }

    console.log(`[UPLOAD] Archivo recibido: ${req.file.originalname}, tamaño: ${req.file.size} bytes`);

    // ✅ Guardar documento (solo devuelve documentId si TODO salió bien)
    const documentId = await saveOriginalDocument({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
    });

    console.log(`[UPLOAD] ✅ Documento guardado correctamente, documentId: ${documentId}`);
    
    // ✅ SOLO devolver documentId si el archivo se guardó correctamente
    // Asegurar headers CORS en respuesta exitosa
    if (origin && typeof origin === "string" && isAllowedOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.json({ documentId });
  } catch (err: any) {
    console.error(`[UPLOAD] Error: ${err?.message || err}`);
    
    // ✅ Asegurar headers CORS en respuestas de error también
    if (origin && typeof origin === "string" && isAllowedOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    
    // Errores específicos con códigos HTTP apropiados
    if (err?.message?.includes("demasiado grande") || err?.message?.includes("too large")) {
      return res.status(413).json({ 
        error: "file too large",
        message: err.message
      });
    }
    
    if (err?.message?.includes("vacío") || err?.message?.includes("empty")) {
      return res.status(400).json({ 
        error: "empty file",
        message: err.message
      });
    }

    // Error genérico
    return res.status(500).json({ 
      error: "upload failed",
      message: err?.message || "Error desconocido al subir archivo"
    });
  }
}

app.post("/upload", upload.single("file"), handleUpload);
// Alias para compatibilidad si este servicio queda expuesto directo (sin proxy del API)
app.post("/legal/upload", upload.single("file"), handleUpload);

// ✅ Upload múltiple (máximo 5 archivos)
async function handleUploadMany(req: express.Request, res: express.Response, next: express.NextFunction) {
  console.log(`[UPLOAD-MANY] Request recibido`);
  
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    
    if (!files.length) {
      return res.status(400).json({ error: "files is required" });
    }

    console.log(`[UPLOAD-MANY] ${files.length} archivos recibidos`);

    const results = [];
    for (const f of files) {
      if (!f.buffer || f.buffer.length === 0) {
        console.log(`[UPLOAD-MANY] Saltando archivo vacío: ${f.originalname}`);
        continue;
      }

      const documentId = await saveOriginalDocument({
        buffer: f.buffer,
        filename: f.originalname,
        mimetype: f.mimetype,
      });

      results.push({ documentId, filename: f.originalname, size: f.size });
      console.log(`[UPLOAD-MANY] ✅ ${f.originalname} -> ${documentId}`);
    }

    return res.json({ count: results.length, documents: results });
  } catch (err: any) {
    console.error(`[UPLOAD-MANY] Error: ${err?.message || err}`);
    return res.status(500).json({ error: "upload failed", message: err?.message });
  }
}

app.post("/upload-many", upload.array("files", 5), handleUploadMany);
app.post("/legal/upload-many", upload.array("files", 5), handleUploadMany);

console.log("[LEGAL-DOCS] Rutas registradas:");
console.log("  POST /upload");
console.log("  POST /legal/upload");
console.log("  POST /analyze/:documentId");
console.log("  GET  /result/:documentId");
console.log("  GET  /status/:documentId");
// Nota: El gateway maneja el prefijo /legal, este servicio NO debe tenerlo

// Analizar documento
async function handleAnalyze(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const { documentId } = req.params;
    const rawInstructions = typeof req.body?.instructions === "string"
      ? req.body.instructions
      : (req.body?.instructions ? String(req.body.instructions) : "");
    // Aumentar límite a 2000 caracteres para incluir contexto del chat
    const userInstructions = rawInstructions.trim().slice(0, 2000);
    
    // 🔍 LOGGING para diagnóstico (más detallado)
    console.log(`[LEGAL-DOCS-ANALYZE] ========================================`);
    console.log(`[LEGAL-DOCS-ANALYZE] Request recibido: ${req.method} ${req.originalUrl || req.url}`);
    console.log(`[LEGAL-DOCS-ANALYZE] Params completos:`, JSON.stringify(req.params, null, 2));
    console.log(`[LEGAL-DOCS-ANALYZE] documentId extraído: "${documentId}"`);
    console.log(`[LEGAL-DOCS-ANALYZE] Tipo de documentId: ${typeof documentId}`);
    console.log(`[LEGAL-DOCS-ANALYZE] documentId length: ${documentId?.length || 0}`);
    if (userInstructions) {
      console.log(`[LEGAL-DOCS-ANALYZE] ✅ Instrucciones usuario (${userInstructions.length} chars):`);
      console.log(`[LEGAL-DOCS-ANALYZE] "${userInstructions}"`);
      console.log(`[LEGAL-DOCS-ANALYZE] Contiene contexto del chat: ${userInstructions.includes("CONTEXTO") || userInstructions.includes("CHAT") ? "SÍ ✅" : "NO ❌"}`);
    } else {
      console.log(`[LEGAL-DOCS-ANALYZE] ⚠️ Sin instrucciones adicionales del usuario`);
    }
    
    // Validar que documentId existe y es válido
    if (!documentId || typeof documentId !== 'string' || documentId.trim().length === 0) {
      console.error(`[LEGAL-DOCS-ANALYZE] ❌ documentId inválido: "${documentId}"`);
      return res.status(400).json({ 
        error: "Invalid documentId",
        message: "documentId is required and must be a valid UUID",
        received: documentId,
        type: typeof documentId
      });
    }
    
    // ✅ Verificar que el documento existe en DB
    console.log(`[LEGAL-DOCS-ANALYZE] Buscando documento en DB: ${documentId}`);
    const doc = await legalDb.getDocument(documentId);
    if (!doc) {
      console.error(`[LEGAL-DOCS-ANALYZE] ❌ Documento NO encontrado en DB: ${documentId}`);
      console.error(`[LEGAL-DOCS-ANALYZE] ❌ Esto significa que el upload falló o el documentId es incorrecto`);
      return res.status(404).json({ 
        error: "Document not found",
        message: `Document with id ${documentId} does not exist in database. Make sure you uploaded it first.`,
        documentId,
        hint: "El upload puede haber fallado. Por favor, sube el archivo nuevamente."
      });
    }
    
    console.log(`[LEGAL-DOCS-ANALYZE] ✅ Documento encontrado en DB: ${doc.filename}`);
    console.log(`[LEGAL-DOCS-ANALYZE] Path esperado: ${doc.raw_path}`);
    
    // ✅ CRÍTICO: Validar que el archivo existe físicamente (no solo en DB)
    const { existsSync } = await import("fs");
    const fileExists = existsSync(doc.raw_path);
    
    if (!fileExists) {
      console.warn(`[LEGAL-DOCS-ANALYZE] ⚠️ Archivo NO existe en disco: ${doc.raw_path}`);
      console.warn(`[LEGAL-DOCS-ANALYZE] ⚠️ Intentando regenerar usando datos existentes del análisis...`);
      
      // Intentar regenerar solo el reporte usando datos existentes
      const existingAnalysis = await legalDb.getAnalysis(documentId);
      if (existingAnalysis && existingAnalysis.original && existingAnalysis.translated) {
        console.log(`[LEGAL-DOCS-ANALYZE] ✅ Análisis previo encontrado, regenerando solo el reporte...`);
        console.log(`[LEGAL-DOCS-ANALYZE] Iniciando regeneración asíncrona...`);
        // Regenerar solo el reporte usando datos existentes
        regenerateReportOnly(documentId, userInstructions || undefined, existingAnalysis)
          .then(() => {
            console.log(`[LEGAL-DOCS-ANALYZE] ✅ Regeneración completada exitosamente para ${documentId}`);
          })
          .catch((error) => {
            console.error(`[LEGAL-DOCS-ANALYZE] ❌ Error regenerando reporte para documento ${documentId}:`, error);
            console.error(`[LEGAL-DOCS-ANALYZE] Stack trace:`, error.stack);
          });
        console.log(`[LEGAL-DOCS-ANALYZE] Regeneración iniciada, respondiendo 200`);
        return res.json({ status: "processing", documentId, note: "Regenerando reporte usando datos existentes (archivo no disponible)" });
      } else {
        console.error(`[LEGAL-DOCS-ANALYZE] ❌ No hay análisis previo disponible para regenerar`);
        return res.status(409).json({ 
          error: "File not found",
          message: `El archivo asociado al documento ${documentId} no existe en disco y no hay datos de análisis previo para regenerar. Por favor, sube el archivo nuevamente.`,
          documentId,
          expectedPath: doc.raw_path,
          hint: "El registro existe en DB pero el archivo no. Esto indica que el upload falló parcialmente o el archivo fue eliminado."
        });
      }
    }
    
    console.log(`[LEGAL-DOCS-ANALYZE] ✅ Archivo existe en disco: ${doc.raw_path}`);
    console.log(`[LEGAL-DOCS-ANALYZE] ✅ Documento y archivo validados: ${doc.filename}, iniciando análisis...`);
    
    // Disparar análisis de forma asíncrona
    runFullAnalysis(documentId, userInstructions || undefined).catch((error) => {
      console.error(`[ANALYZE] Error en análisis de documento ${documentId}:`, error);
    });

    console.log(`[LEGAL-DOCS-ANALYZE] Análisis iniciado, respondiendo 200`);
    res.json({ status: "processing", documentId });
  } catch (err) {
    console.error(`[LEGAL-DOCS-ANALYZE] Error inesperado:`, err);
    next(err);
  }
}

app.post("/analyze/:documentId", handleAnalyze);

// Analizar múltiples documentos como conjunto
async function handleAnalyzeMany(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const { documentIds } = req.body;
    const rawInstructions = typeof req.body?.instructions === "string"
      ? req.body.instructions
      : (req.body?.instructions ? String(req.body.instructions) : "");
    const userInstructions = rawInstructions.trim().slice(0, 2000);
    
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ 
        error: "Invalid documentIds",
        message: "documentIds must be a non-empty array"
      });
    }
    
    if (documentIds.length > 5) {
      return res.status(400).json({ 
        error: "Too many documents",
        message: `Máximo 5 documentos permitidos para análisis conjunto. Has enviado ${documentIds.length} documentos. Por favor, selecciona máximo 5 archivos.`,
        received: documentIds.length,
        maxAllowed: 5
      });
    }
    
    console.log(`[ANALYZE-MANY] Starting conjoint analysis for ${documentIds.length} documents`);
    console.log(`[ANALYZE-MANY] Document IDs: ${documentIds.join(", ")}`);
    
    // Importar la función de análisis conjunto
    const { runFullAnalysisMany } = await import("./pipeline.js");
    
    // Disparar análisis conjunto de forma asíncrona
    runFullAnalysisMany(documentIds, userInstructions || undefined).catch((error) => {
      console.error(`[ANALYZE-MANY] Error en análisis conjunto:`, error);
    });
    
    console.log(`[ANALYZE-MANY] Análisis conjunto iniciado, respondiendo 200`);
    res.json({ 
      status: "processing", 
      documentIds,
      primaryDocumentId: documentIds[0],
      message: `Análisis conjunto iniciado para ${documentIds.length} documentos`
    });
  } catch (err) {
    console.error(`[ANALYZE-MANY] Error inesperado:`, err);
    next(err);
  }
}

app.post("/analyze-many", handleAnalyzeMany);
app.post("/legal/analyze-many", handleAnalyzeMany);
// ✅ También registrar con prefijo /legal por si el proxy no lo quita
app.post("/legal/analyze/:documentId", handleAnalyze);

console.log("[ROUTES] ✅ POST /analyze/:documentId registrada");
console.log("[ROUTES] ✅ POST /legal/analyze/:documentId registrada");

// Obtener resultado
async function handleResult(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const { documentId } = req.params;
    console.log(`[RESULT] Obteniendo resultado para documento: ${documentId}`);
    
    const result = await getFullResult(documentId);

    if (!result) {
      console.log(`[RESULT] Documento ${documentId} no encontrado`);
      return res.status(404).json({ error: "not found" });
    }

    console.log(`[RESULT] Documento encontrado: ${result.filename}`);
    console.log(`[RESULT] Tiene análisis: ${result.analysis ? 'SÍ' : 'NO'}`);
    
    if (result.analysis) {
      console.log(`[RESULT] Tipo de análisis: ${result.analysis.type}`);
      console.log(`[RESULT] Report existe: ${result.analysis.report ? 'SÍ' : 'NO'}`);
      if (result.analysis.report) {
        console.log(`[RESULT] Tipo de report: ${typeof result.analysis.report}`);
        if (typeof result.analysis.report === 'object') {
          console.log(`[RESULT] Report tiene campos: ${Object.keys(result.analysis.report).join(', ')}`);
        }
      }
    }

    // Si el análisis está en progreso, retornar estado parcial
    const analysis = await legalDb.getDocument(documentId);
    if (analysis && !result.analysis) {
      console.log(`[RESULT] Análisis en progreso para ${documentId}`);
      return res.json({
        documentId,
        status: "processing",
        message: "El análisis está en progreso. Por favor, intenta nuevamente en unos momentos.",
      });
    }

    console.log(`[RESULT] ✅ Devolviendo resultado completo para ${documentId}`);
    res.json(result);
  } catch (err) {
    console.error(`[RESULT] ❌ Error obteniendo resultado para ${req.params.documentId}:`, err);
    next(err);
  }
}

app.get("/result/:documentId", handleResult);
// ❌ ELIMINADO: app.get("/legal/result/:documentId", handleResult);
// El gateway ya maneja el prefijo /legal, el servicio NO debe tenerlo

// Obtener estado del análisis
async function handleStatus(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const { documentId } = req.params;
    // Preferir status persistido en legal_documents (si existe)
    const doc = await legalDb.getDocument(documentId);
    if (doc && (doc.status || doc.progress !== undefined || doc.error_message)) {
      return res.json({
        status: doc.status || "processing",
        progress: typeof doc.progress === "number" ? doc.progress : 0,
        error: doc.error_message || null,
        updatedAt: doc.updated_at || null,
      });
    }

    // Fallback (si no existe la tabla/columnas de status)
    const analysis = await legalDb.getAnalysis(documentId);
    if (!analysis) return res.json({ status: "not_started", progress: 0 });
    if (analysis.report) return res.json({ status: "completed", progress: 100 });
    if (analysis.translated && analysis.translated.length > 0) return res.json({ status: "processing", progress: 70 });
    return res.json({ status: "processing", progress: 30 });
  } catch (err) {
    next(err);
  }
}

app.get("/status/:documentId", handleStatus);
// ❌ ELIMINADO: app.get("/legal/status/:documentId", handleStatus);
// El gateway ya maneja el prefijo /legal, el servicio NO debe tenerlo

// Endpoint para obtener historial de documentos
// Endpoint para eliminar un documento y su análisis
app.delete("/document/:documentId", async (req, res, next) => {
  try {
    const { documentId } = req.params;
    console.log(`[DELETE] Eliminando documento ${documentId}...`);
    
    // Verificar que el documento existe
    const doc = await legalDb.getDocument(documentId);
    if (!doc) {
      return res.status(404).json({ 
        error: "Document not found",
        message: `Document with id ${documentId} does not exist.`,
        documentId
      });
    }
    
    // Eliminar análisis primero (si existe)
    try {
      await legalDb.deleteAnalysis(documentId);
      console.log(`[DELETE] ✅ Análisis eliminado para ${documentId}`);
    } catch (err: any) {
      console.warn(`[DELETE] ⚠️ No se pudo eliminar análisis (puede que no exista):`, err.message);
    }
    
    // Eliminar documento de la DB
    const deleted = await legalDb.deleteDocumentsByIds([documentId]);
    
    if (deleted > 0) {
      console.log(`[DELETE] ✅ Documento ${documentId} eliminado exitosamente`);
      return res.json({ 
        success: true, 
        message: "Documento eliminado exitosamente",
        documentId 
      });
    } else {
      return res.status(500).json({ 
        error: "Failed to delete",
        message: "No se pudo eliminar el documento de la base de datos."
      });
    }
  } catch (err: any) {
    console.error(`[DELETE] ❌ Error eliminando documento:`, err);
    next(err);
  }
});

// Endpoint para obtener estadísticas del dashboard
app.get("/stats", async (_req, res, next) => {
  try {
    console.log(`[STATS] Obteniendo estadísticas del dashboard...`);
    
    // 1. Solicitudes en cola (documentos con status "processing" o sin completar)
    const queueResult = await db.query(`
      SELECT COUNT(*) as count 
      FROM legal_documents 
      WHERE status IN ('processing', 'ocr', 'translating', 'classifying', 'analyzing', 'generating_report', 'regenerating_report')
         OR (status IS NULL AND id IN (SELECT document_id FROM legal_analysis WHERE report IS NULL))
    `);
    const queueCount = parseInt(queueResult.rows[0]?.count || "0", 10);
    
    // 2. Docs generados en últimos 7 días
    const docs7dResult = await db.query(`
      SELECT COUNT(*) as count 
      FROM legal_documents 
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    const docs7d = parseInt(docs7dResult.rows[0]?.count || "0", 10);
    
    // 3. Docs generados en los 7 días anteriores (para comparación)
    const docsPrev7dResult = await db.query(`
      SELECT COUNT(*) as count 
      FROM legal_documents 
      WHERE created_at >= NOW() - INTERVAL '14 days' 
        AND created_at < NOW() - INTERVAL '7 days'
    `);
    const docsPrev7d = parseInt(docsPrev7dResult.rows[0]?.count || "0", 10);
    const docsGrowth = docsPrev7d > 0 
      ? ((docs7d - docsPrev7d) / docsPrev7d * 100).toFixed(0)
      : (docs7d > 0 ? "100" : "0");
    
    // 4. Exactitud de citas (por ahora N/A, pero podemos calcular si hay datos)
    const accuracyResult = await db.query(`
      SELECT COUNT(*) as total, 
             COUNT(CASE WHEN report IS NOT NULL THEN 1 END) as with_report
      FROM legal_analysis 
      WHERE analyzed_at >= NOW() - INTERVAL '30 days'
      LIMIT 100
    `);
    const accuracy = "N/A"; // Por ahora no tenemos métrica de exactitud
    
    // 5. Latencia media (tiempo promedio de análisis completado)
    const latencyResult = await db.query(`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (analyzed_at - created_at))) as avg_seconds,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (analyzed_at - created_at))) as p95_seconds
      FROM legal_analysis la
      JOIN legal_documents ld ON la.document_id = ld.id
      WHERE la.analyzed_at IS NOT NULL 
        AND ld.created_at IS NOT NULL
        AND la.analyzed_at >= NOW() - INTERVAL '7 days'
    `);
    const avgSeconds = parseFloat(latencyResult.rows[0]?.avg_seconds || "0");
    const p95Seconds = parseFloat(latencyResult.rows[0]?.p95_seconds || "0");
    const avgLatency = avgSeconds > 0 ? `${(avgSeconds / 60).toFixed(1)}m` : "N/A";
    const p95Latency = p95Seconds > 0 ? `${(p95Seconds / 60).toFixed(1)}m` : "N/A";
    
    // 6. Fuentes conectadas (knowledge bases)
    let sourcesCount = 0;
    let sourcesNames = "Ninguna";
    try {
      const sourcesResult = await db.query(`
        SELECT COUNT(*) as count, 
               STRING_AGG(name, ', ') as names
        FROM knowledge_bases 
        WHERE enabled = true
      `);
      sourcesCount = parseInt(sourcesResult.rows[0]?.count || "0", 10);
      sourcesNames = sourcesResult.rows[0]?.names || "Ninguna";
    } catch (err: any) {
      console.warn(`[STATS] ⚠️ No se pudo obtener knowledge bases (tabla puede no existir):`, err.message);
      // Si la tabla no existe, usar valores por defecto
      sourcesCount = 0;
      sourcesNames = "Ninguna";
    }
    
    // 7. Usuarios activos (por ahora siempre 1 - el usuario actual)
    const activeUsers = 1;
    
    const stats = {
      queue: queueCount,
      docsGenerated7d: docs7d,
      docsGrowth: docsGrowth,
      accuracy: accuracy,
      avgLatency: avgLatency,
      p95Latency: p95Latency,
      sourcesConnected: sourcesCount,
      sourcesNames: sourcesNames,
      activeUsers: activeUsers
    };
    
    console.log(`[STATS] ✅ Estadísticas obtenidas:`, stats);
    res.json(stats);
  } catch (err: any) {
    console.error(`[STATS] ❌ Error obteniendo estadísticas:`, err);
    next(err);
  }
});

// Endpoint para obtener lista de abogados senior
app.get("/abogados", async (_req, res, next) => {
  try {
    console.log(`[ABOGADOS] Obteniendo lista de abogados senior...`);
    
    const result = await db.query(`
      SELECT id, nombre, telefono, email, activo, orden
      FROM abogados_senior
      WHERE activo = true
      ORDER BY orden ASC, nombre ASC
    `);
    
    const abogados = result.rows.map((row: any) => ({
      id: row.id,
      nombre: row.nombre,
      telefono: row.telefono || null,
      email: row.email,
      activo: row.activo,
      orden: row.orden || 0
    }));
    
    console.log(`[ABOGADOS] ✅ ${abogados.length} abogados encontrados`);
    res.json({ abogados });
  } catch (err: any) {
    console.error(`[ABOGADOS] ❌ Error obteniendo abogados:`, err);
    next(err);
  }
});

// Endpoint para crear/actualizar abogado (admin)
app.post("/abogados", async (req, res, next) => {
  try {
    const { nombre, telefono, email, activo, orden } = req.body;
    
    if (!nombre || !email) {
      return res.status(400).json({ 
        error: "Bad request",
        message: "nombre y email son requeridos"
      });
    }
    
    const result = await db.query(`
      INSERT INTO abogados_senior (nombre, telefono, email, activo, orden)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, nombre, telefono, email, activo, orden, created_at
    `, [nombre, telefono || null, email, activo !== false, orden || 0]);
    
    console.log(`[ABOGADOS] ✅ Abogado creado: ${nombre}`);
    res.json({ abogado: result.rows[0] });
  } catch (err: any) {
    console.error(`[ABOGADOS] ❌ Error creando abogado:`, err);
    next(err);
  }
});

// Endpoint para actualizar abogado
app.put("/abogados/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, telefono, email, activo, orden } = req.body;
    
    const result = await db.query(`
      UPDATE abogados_senior
      SET nombre = COALESCE($1, nombre),
          telefono = COALESCE($2, telefono),
          email = COALESCE($3, email),
          activo = COALESCE($4, activo),
          orden = COALESCE($5, orden),
          updated_at = NOW()
      WHERE id = $6
      RETURNING id, nombre, telefono, email, activo, orden, updated_at
    `, [nombre, telefono, email, activo, orden, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: "Not found",
        message: "Abogado no encontrado"
      });
    }
    
    console.log(`[ABOGADOS] ✅ Abogado actualizado: ${id}`);
    res.json({ abogado: result.rows[0] });
  } catch (err: any) {
    console.error(`[ABOGADOS] ❌ Error actualizando abogado:`, err);
    next(err);
  }
});

// Endpoint para eliminar abogado (soft delete - marcar como inactivo)
app.delete("/abogados/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      UPDATE abogados_senior
      SET activo = false, updated_at = NOW()
      WHERE id = $1
      RETURNING id, nombre
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: "Not found",
        message: "Abogado no encontrado"
      });
    }
    
    console.log(`[ABOGADOS] ✅ Abogado desactivado: ${id}`);
    res.json({ message: "Abogado desactivado exitosamente", abogado: result.rows[0] });
  } catch (err: any) {
    console.error(`[ABOGADOS] ❌ Error desactivando abogado:`, err);
    next(err);
  }
});

app.get("/history", async (_req, res) => {
  try {
    const documents = await legalDb.getAllDocumentsWithAnalysis(100);
    
    // Transformar al formato esperado por el frontend
    const items = documents
      .filter((doc: any) => {
        // Filtrar documentos que son parte de un análisis conjunto
        // Estos documentos tienen isPartOfConjointAnalysis: true en su análisis
        if (doc.original) {
          let original = doc.original;
          if (typeof original === 'string') {
            try {
              original = JSON.parse(original);
            } catch {
              // Si no es JSON válido, mantener como está
            }
          }
          
          // Si es parte de un análisis conjunto y no tiene report, no mostrarlo
          if (original && original.isPartOfConjointAnalysis === true && !doc.report) {
            console.log(`[HISTORY] Filtrando documento ${doc.id} (parte de análisis conjunto)`);
            return false;
          }
        }
        
        // Si tiene estado "uploaded" pero no tiene análisis y no tiene report, puede ser parte de un conjunto
        // Verificar si hay otro documento con el mismo nombre y un análisis conjunto
        if (doc.status === 'uploaded' && !doc.analysis_type && !doc.report) {
          // Verificar si hay un análisis conjunto que incluya este documento
          const hasConjointAnalysis = documents.some((otherDoc: any) => {
            if (otherDoc.id === doc.id || !otherDoc.report) return false;
            
            let otherReport = otherDoc.report;
            if (typeof otherReport === 'string') {
              try {
                otherReport = JSON.parse(otherReport);
              } catch {
                return false;
              }
            }
            
            // Verificar si el report menciona múltiples documentos o es un análisis conjunto
            if (otherReport && typeof otherReport === 'object') {
              const reportText = JSON.stringify(otherReport).toLowerCase();
              return reportText.includes('conjunto') || 
                     reportText.includes('múltiples documentos') ||
                     reportText.includes('análisis legal conjunto');
            }
            
            return false;
          });
          
          if (hasConjointAnalysis) {
            console.log(`[HISTORY] Filtrando documento ${doc.id} (uploaded sin análisis, probablemente parte de conjunto)`);
            return false;
          }
        }
        
        return true;
      })
      .map((doc: any) => {
        let report = null;
        if (doc.report) {
          try {
            // PostgreSQL puede devolver JSONB como objeto o como string
            if (typeof doc.report === 'string') {
              // Si es string, intentar parsear si parece JSON
              if (doc.report.trim().startsWith('{') || doc.report.trim().startsWith('[')) {
                report = JSON.parse(doc.report);
              } else {
                // Si no es JSON, mantener como string (texto plano)
                report = { texto_formateado: doc.report };
              }
            } else {
              // Ya es objeto (JSONB devuelto como objeto)
              report = doc.report;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`[HISTORY] Error parseando report para ${doc.id}:`, msg);
            // Si falla el parseo, intentar usar como texto plano
            report = { texto_formateado: typeof doc.report === 'string' ? doc.report : JSON.stringify(doc.report) };
          }
        }

        // Determinar tipo: si tiene analysis_type y report, es un análisis
        const hasAnalysis = doc.analysis_type && doc.report;
        const itemType = hasAnalysis ? 'analysis' : (doc.analysis_type || 'document');
        const itemTipo = hasAnalysis ? 'ANÁLISIS' : 'DOCUMENTO';

        return {
          id: doc.id,
          type: itemType,
          tipo: itemTipo,
          title: report?.titulo || doc.filename || 'Sin título',
          asunto: report?.titulo || doc.filename,
          estado: doc.status === 'completed' ? 'Listo para revisión' : (doc.status || 'uploaded'),
          prioridad: 'Media',
          createdAt: doc.created_at,
          creado: new Date(doc.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          agente: 'Orquestador',
          markdown: report?.texto_formateado || report?.resumen_ejecutivo || '',
          memoData: report ? {
            resumen: report.resumen_ejecutivo || report.resumen || '',
            puntos_tratados: report.clausulas_analizadas || [],
            riesgos: report.riesgos || [],
            proximos_pasos: report.proximos_pasos || report.recomendaciones || []
          } : null,
          citations: report?.citas || [],
          areaLegal: report?.area_legal || 'civil_comercial',
          filename: doc.filename
        };
      });

    res.json({ items });
  } catch (error: any) {
    console.error("[HISTORY] Error:", error);
    res.status(500).json({ error: "Error al obtener historial", message: error.message });
  }
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({ 
    error: "Internal server error",
    message: err.message 
  });
});

const port = process.env.PORT || 3001;

// ✅ CRÍTICO: Levantar el servidor PRIMERO, luego verificar schema
// Esto evita que Railway mate el proceso por timeout durante ensureSchema()
console.log(`[STARTUP] Iniciando servidor en puerto ${port}...`);

const server = app.listen(port, () => {
  console.log(`[STARTUP] ✅ legal-docs service running on port ${port}`);
  console.log(`[STARTUP] DATABASE_URL configurada: ${process.env.DATABASE_URL ? "sí" : "NO"}`);
  
  // Iniciar cleanup scheduler
  startCleanupScheduler();
  
  // Asegurar schema DESPUÉS de que el servidor esté escuchando
  legalDb.ensureSchema()
    .then(() => {
      console.log("[DB] ✅ Schema verificado/creado");
    })
    .catch((err) => {
      console.error("[DB] ⚠️ Error asegurando schema (el servidor sigue corriendo):", err?.message || err);
    });
});

server.on("error", (err) => {
  console.error("[STARTUP] ❌ Error al iniciar servidor:", err);
  process.exit(1);
});

