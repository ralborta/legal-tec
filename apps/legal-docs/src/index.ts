import "dotenv/config";
import express from "express";
import multer from "multer";
import { runFullAnalysis } from "./pipeline.js";
import { saveOriginalDocument, getFullResult } from "./storage.js";

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

    res.json(result);
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
app.listen(port, () => {
  console.log(`legal-docs service running on port ${port}`);
});

