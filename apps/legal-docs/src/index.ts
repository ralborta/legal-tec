import "dotenv/config";
import express from "express";
import multer from "multer";
import { runFullAnalysis } from "./pipeline.js";
import { saveOriginalDocument, getFullResult } from "./storage.js";
import { legalDb } from "./db.js";

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
  if (allowedOriginsFromEnv.includes(origin)) return true;
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && typeof origin === "string" && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
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
  console.log(`[UPLOAD] Request recibido en ${req.path}, method: ${req.method}`);
  console.log(`[UPLOAD] Headers:`, { "content-type": req.headers["content-type"], "content-length": req.headers["content-length"] });
  
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
    res.json({ documentId });
  } catch (err: any) {
    console.error(`[UPLOAD] Error: ${err?.message || err}`);
    
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

// ✅ Upload múltiple (máximo 3 archivos)
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

app.post("/upload-many", upload.array("files", 3), handleUploadMany);
app.post("/legal/upload-many", upload.array("files", 3), handleUploadMany);

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
    
    // 🔍 LOGGING para diagnóstico (más detallado)
    console.log(`[LEGAL-DOCS-ANALYZE] ========================================`);
    console.log(`[LEGAL-DOCS-ANALYZE] Request recibido: ${req.method} ${req.originalUrl || req.url}`);
    console.log(`[LEGAL-DOCS-ANALYZE] Params completos:`, JSON.stringify(req.params, null, 2));
    console.log(`[LEGAL-DOCS-ANALYZE] documentId extraído: "${documentId}"`);
    console.log(`[LEGAL-DOCS-ANALYZE] Tipo de documentId: ${typeof documentId}`);
    console.log(`[LEGAL-DOCS-ANALYZE] documentId length: ${documentId?.length || 0}`);
    
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
    if (!existsSync(doc.raw_path)) {
      console.error(`[LEGAL-DOCS-ANALYZE] ❌ Archivo NO existe en disco: ${doc.raw_path}`);
      console.error(`[LEGAL-DOCS-ANALYZE] ❌ documentId: ${documentId}`);
      console.error(`[LEGAL-DOCS-ANALYZE] ❌ Esto significa que el upload falló (se creó el registro pero no el archivo)`);
      return res.status(409).json({ 
        error: "File not found",
        message: `El archivo asociado al documento ${documentId} no existe en disco. El upload puede haber fallado. Por favor, sube el archivo nuevamente.`,
        documentId,
        expectedPath: doc.raw_path,
        hint: "El registro existe en DB pero el archivo no. Esto indica que el upload falló parcialmente."
      });
    }
    
    console.log(`[LEGAL-DOCS-ANALYZE] ✅ Archivo existe en disco: ${doc.raw_path}`);
    console.log(`[LEGAL-DOCS-ANALYZE] ✅ Documento y archivo validados: ${doc.filename}, iniciando análisis...`);
    
    // Disparar análisis de forma asíncrona
    runFullAnalysis(documentId).catch((error) => {
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
app.get("/history", async (_req, res) => {
  try {
    const documents = await legalDb.getAllDocumentsWithAnalysis(100);
    
    // Transformar al formato esperado por el frontend
    const items = documents.map((doc: any) => {
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
          console.warn(`[HISTORY] Error parseando report para ${doc.id}:`, e.message);
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

