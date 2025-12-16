import "dotenv/config";
import express from "express";
import multer from "multer";
import { runFullAnalysis } from "./pipeline.js";
import { saveOriginalDocument, getFullResult } from "./storage.js";
import { legalDb } from "./db.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ service: "legal-docs", ok: true });
});

// Upload documento
app.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const documentId = await saveOriginalDocument({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
    });

    res.json({ documentId });
  } catch (err) {
    next(err);
  }
});

// Analizar documento
app.post("/analyze/:documentId", async (req, res, next) => {
  try {
    const { documentId } = req.params;
    
    console.log(`[ANALYZE] Starting analysis for document: ${documentId}`);
    
    // Disparar análisis de forma asíncrona
    runFullAnalysis(documentId).catch((error) => {
      console.error(`[ANALYZE] Error en análisis de documento ${documentId}:`, error);
    });

    res.json({ status: "processing", documentId });
  } catch (err) {
    next(err);
  }
});

// Obtener resultado
app.get("/result/:documentId", async (req, res, next) => {
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
});

// Obtener estado del análisis
app.get("/status/:documentId", async (req, res, next) => {
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

