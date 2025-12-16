import "dotenv/config";
import express from "express";
import multer from "multer";
import { runFullAnalysis } from "./pipeline.js";
import { saveOriginalDocument, getFullResult } from "./storage.js";
import { legalDb } from "./db.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

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

// Upload documento
async function handleUpload(req: express.Request, res: express.Response, next: express.NextFunction) {
  console.log(`[UPLOAD] Request recibido en ${req.path}, method: ${req.method}`);
  console.log(`[UPLOAD] Headers:`, { "content-type": req.headers["content-type"], "content-length": req.headers["content-length"] });
  try {
    if (!req.file) {
      console.log("[UPLOAD] Error: no file in request");
      return res.status(400).json({ error: "file is required" });
    }
    console.log(`[UPLOAD] Archivo recibido: ${req.file.originalname}, tamaño: ${req.file.size} bytes`);

    const documentId = await saveOriginalDocument({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
    });

    res.json({ documentId });
  } catch (err) {
    next(err);
  }
}

app.post("/upload", upload.single("file"), handleUpload);
// Alias para compatibilidad si este servicio queda expuesto directo (sin proxy del API)
app.post("/legal/upload", upload.single("file"), handleUpload);

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
    
    // 🔍 LOGGING para diagnóstico
    console.log(`[LEGAL-DOCS-ANALYZE] Request recibido: ${req.method} ${req.originalUrl || req.url}`);
    console.log(`[LEGAL-DOCS-ANALYZE] Params:`, req.params);
    console.log(`[LEGAL-DOCS-ANALYZE] documentId: ${documentId}`);
    
    // Validar que documentId existe y es válido
    if (!documentId || typeof documentId !== 'string' || documentId.trim().length === 0) {
      console.error(`[LEGAL-DOCS-ANALYZE] documentId inválido: ${documentId}`);
      return res.status(400).json({ 
        error: "Invalid documentId",
        message: "documentId is required and must be a valid UUID",
        received: documentId
      });
    }
    
    // Verificar que el documento existe antes de iniciar análisis
    const doc = await legalDb.getDocument(documentId);
    if (!doc) {
      console.error(`[LEGAL-DOCS-ANALYZE] Documento no encontrado: ${documentId}`);
      return res.status(404).json({ 
        error: "Document not found",
        message: `Document with id ${documentId} does not exist. Make sure you uploaded it first.`,
        documentId
      });
    }
    
    console.log(`[LEGAL-DOCS-ANALYZE] Documento encontrado: ${doc.filename}, iniciando análisis...`);
    
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
// ❌ ELIMINADO: app.post("/legal/analyze/:documentId", handleAnalyze);
// El gateway ya maneja el prefijo /legal, el servicio NO debe tenerlo

// Obtener resultado
async function handleResult(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const { documentId } = req.params;
    const result = await getFullResult(documentId);

    if (!result) {
      return res.status(404).json({ error: "not found" });
    }

    // Si el análisis está en progreso, retornar estado parcial
    const analysis = await legalDb.getDocument(documentId);
    if (analysis && !result.analysis) {
      return res.json({
        documentId,
        status: "processing",
        message: "El análisis está en progreso. Por favor, intenta nuevamente en unos momentos.",
      });
    }

    res.json(result);
  } catch (err) {
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

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({ 
    error: "Internal server error",
    message: err.message 
  });
});

const port = process.env.PORT || 3001;
// Asegurar schema antes de levantar el servidor
legalDb.ensureSchema()
  .then(() => {
    console.log("[DB] Schema verificado/creado");
    app.listen(port, () => {
      console.log(`legal-docs service running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("[DB] Error asegurando schema:", err);
    // Igual levantamos el server para poder ver errores via /health
    app.listen(port, () => {
      console.log(`legal-docs service running on port ${port} (sin schema garantizado)`);
    });
  });

