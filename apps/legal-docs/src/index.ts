import "dotenv/config";
import { writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Railway / entornos sin disco: si las credenciales GCP vienen en una variable (JSON como string), escribir a archivo temporal
const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
if (credsJson && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    const dir = mkdtempSync(join(tmpdir(), "gcp-creds-"));
    const path = join(dir, "credentials.json");
    writeFileSync(path, credsJson, "utf8");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
    console.log("[LEGAL-DOCS] Credenciales GCP cargadas desde GOOGLE_APPLICATION_CREDENTIALS_JSON");
  } catch (e) {
    console.error("[LEGAL-DOCS] Error escribiendo credenciales GCP:", e);
  }
}

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

    // Validar tamaño total
    const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      const totalSizeMB = (totalSize / 1024 / 1024).toFixed(1);
      return res.status(413).json({ 
        error: "total size too large",
        message: `El tamaño total de los archivos (${totalSizeMB}MB) excede el límite de 200MB. Por favor, reduce el tamaño de los archivos o sube menos archivos.`,
        totalSize,
        maxSize: MAX_TOTAL_SIZE
      });
    }

    const results = [];
    for (const f of files) {
      if (!f.buffer || f.buffer.length === 0) {
        console.log(`[UPLOAD-MANY] Saltando archivo vacío: ${f.originalname}`);
        continue;
      }

      // Validar tamaño individual
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB por archivo
      if (f.size > MAX_FILE_SIZE) {
        const fileSizeMB = (f.size / 1024 / 1024).toFixed(1);
        return res.status(413).json({ 
          error: "file too large",
          message: `El archivo "${f.originalname}" es demasiado grande (${fileSizeMB}MB). El máximo permitido es 50MB por archivo.`,
          filename: f.originalname,
          fileSize: f.size,
          maxSize: MAX_FILE_SIZE
        });
      }

      const documentId = await saveOriginalDocument({
        buffer: f.buffer,
        filename: f.originalname,
        mimetype: f.mimetype,
      });

      results.push({ documentId, filename: f.originalname, size: f.size });
      console.log(`[UPLOAD-MANY] ✅ ${f.originalname} -> ${documentId} (${(f.size / 1024 / 1024).toFixed(2)}MB)`);
    }

    console.log(`[UPLOAD-MANY] ✅ Total: ${results.length} archivos subidos (${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
    return res.json({ count: results.length, documents: results });
  } catch (err: any) {
    console.error(`[UPLOAD-MANY] Error: ${err?.message || err}`);
    
    // Manejar errores específicos de tamaño
    if (err?.message?.includes("too large") || err?.message?.includes("demasiado grande")) {
      return res.status(413).json({ 
        error: "file too large",
        message: err.message || "Uno o más archivos exceden el tamaño máximo permitido (50MB por archivo, 200MB total)."
      });
    }
    
    return res.status(500).json({ error: "upload failed", message: err?.message || "Error desconocido al subir archivos" });
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

// Almacenamiento temporal de comparaciones (en memoria)
const comparisonResults = new Map<string, {
  status: "processing" | "completed" | "error";
  result?: any;
  error?: string;
  progress?: number;
  statusLabel?: string;
}>();

// Análisis comparativo de documentos
app.post("/compare-documents", async (req, res, next) => {
  try {
    const { documentIdA, documentIdB, instructions, additionalInstructions, areaLegal } = req.body;
    
    if (!documentIdA || !documentIdB) {
      return res.status(400).json({ error: "Se requieren documentIdA y documentIdB" });
    }

    const comparisonId = `${documentIdA}_${documentIdB}_${Date.now()}`;
    
    // Iniciar comparación en background
    runComparison(documentIdA, documentIdB, instructions, additionalInstructions, areaLegal || "civil_comercial", comparisonId)
      .catch((error) => {
        console.error(`[COMPARE] Error en comparación ${comparisonId}:`, error);
        comparisonResults.set(comparisonId, {
          status: "error",
          error: error instanceof Error ? error.message : "Error desconocido",
        });
      });

    // Inicializar estado
    comparisonResults.set(comparisonId, {
      status: "processing",
      progress: 0,
      statusLabel: "Iniciando comparación...",
    });

    res.json({ 
      comparisonId,
      status: "processing",
      message: "Comparación iniciada"
    });
  } catch (err) {
    next(err);
  }
});

// Obtener resultado de comparación
app.get("/compare-documents/:comparisonId", async (req, res, next) => {
  try {
    const { comparisonId } = req.params;
    const result = comparisonResults.get(comparisonId);
    
    if (!result) {
      return res.status(404).json({ error: "Comparación no encontrada" });
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// Función para ejecutar la comparación
async function runComparison(
  documentIdA: string,
  documentIdB: string,
  instructions: string | undefined,
  additionalInstructions: string | undefined,
  areaLegal: string,
  comparisonId: string
) {
  try {
    comparisonResults.set(comparisonId, { status: "processing", progress: 10, statusLabel: "Obteniendo documentos..." });

    const coerceOriginalText = (original: unknown): string => {
      if (typeof original === "string") {
        const s = original.trim();
        // Si es un string JSON, intentar parsear (caso común cuando viene serializado)
        if (s.startsWith("{") || s.startsWith("[")) {
          try {
            const parsed = JSON.parse(s);
            return coerceOriginalText(parsed);
          } catch {
            return s;
          }
        }
        return s;
      }
      if (original && typeof original === "object") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyObj = original as any;
        if (typeof anyObj.text === "string") return anyObj.text.trim();
        return "";
      }
      return "";
    };

    // Función helper para obtener texto de un documento (con o sin análisis previo)
    const getDocumentText = async (documentId: string, docLabel: string): Promise<string> => {
      // Primero intentar obtener del análisis si existe
      const result = await getFullResult(documentId);
      if (result?.analysis?.original) {
        const text = coerceOriginalText(result.analysis.original);
        if (text.length > 0) {
          console.log(`[COMPARE] ✅ Texto obtenido de análisis previo para ${docLabel} (${text.length} chars)`);
          return text;
        }
        console.log(`[COMPARE] ⚠️ Análisis previo encontrado pero sin texto usable para ${docLabel} (original vacío)`);
      }

      // Si no hay análisis, extraer texto directamente del archivo
      console.log(`[COMPARE] ⚠️ ${docLabel} no tiene análisis previo, extrayendo texto directamente...`);
      const doc = await legalDb.getDocument(documentId);
      if (!doc) {
        throw new Error(`${docLabel} (${documentId}) no encontrado`);
      }

      const { getDocumentBuffer } = await import("./storage.js");
      const fileBuffer = await getDocumentBuffer(documentId);
      if (!fileBuffer) {
        throw new Error(`No se pudo leer el archivo de ${docLabel} (${documentId})`);
      }

      const { ocrAgent } = await import("./agents/ocr.js");
      const text = await ocrAgent({
        buffer: fileBuffer,
        mimeType: doc.mime_type,
        filename: doc.filename,
      });

      const trimmed = (text || "").trim();
      if (!trimmed || trimmed.length === 0) {
        throw new Error(`${docLabel} no tiene texto extraíble (PDF posiblemente escaneado). Intentá nuevamente o subí un PDF con mejor calidad.`);
      }

      console.log(`[COMPARE] ✅ Texto extraído por OCR/directo para ${docLabel} (${trimmed.length} caracteres)`);
      return trimmed;
    };

    // Obtener textos de ambos documentos (con o sin análisis previo)
    comparisonResults.set(comparisonId, { status: "processing", progress: 15, statusLabel: "Extrayendo texto del Documento A..." });
    const textA = await getDocumentText(documentIdA, "Documento A");

    comparisonResults.set(comparisonId, { status: "processing", progress: 25, statusLabel: "Extrayendo texto del Documento B..." });
    const textB = await getDocumentText(documentIdB, "Documento B");

    comparisonResults.set(comparisonId, { status: "processing", progress: 30, statusLabel: "Analizando documentos..." });

    // Generar análisis comparativo con OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY no configurada");
    }

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: openaiKey });

    const systemPrompt = `Sos un abogado argentino senior de WNS & Asociados, especializado en análisis jurídico comparativo de documentos legales.

Tu tarea es realizar un ANÁLISIS COMPARATIVO JURÍDICO EXHAUSTIVO de dos documentos legales, identificando diferencias, ventajas, desventajas, riesgos y proporcionando recomendaciones profesionales.

IMPORTANTE:
- NO asumas que hay "cambios" o "versiones" - estos pueden ser documentos completamente diferentes
- Analiza ambos documentos como entidades independientes
- Compara aspectos jurídicos relevantes
- Identifica ventajas y desventajas de cada documento
- Evalúa riesgos legales
- Proporciona recomendaciones prácticas

ESTRUCTURA DEL ANÁLISIS COMPARATIVO (OBLIGATORIA):
1. RESUMEN EJECUTIVO COMPARATIVO (mínimo 8-12 párrafos)
2. ANÁLISIS POR ASPECTOS:
   - Objeto y alcance
   - Obligaciones y derechos
   - Precios y términos de pago
   - Plazos y duración
   - Penalidades y garantías
   - Resolución de conflictos
   - Otras cláusulas relevantes
3. EVALUACIÓN COMPARATIVA:
   - Ventajas del Documento A
   - Ventajas del Documento B
   - Desventajas del Documento A
   - Desventajas del Documento B
4. ANÁLISIS DE RIESGOS:
   - Riesgos del Documento A
   - Riesgos del Documento B
   - Comparativa de nivel de riesgo
5. LEGALIDAD Y VALIDEZ
6. RECOMENDACIONES Y SUGERENCIAS (mínimo 15 recomendaciones)
7. CONCLUSIÓN COMPARATIVA

El análisis debe ser PROFUNDO, EXHAUSTIVO y PROFESIONAL.`;

    // Calcular límite de caracteres por documento para mantenernos bajo 30,000 tokens TPM
    // Aproximación: 1 token ≈ 4 caracteres
    // Objetivo: ~25,000 tokens para documentos (dejando margen para system prompt e instrucciones)
    // 25,000 tokens × 4 = 100,000 caracteres totales para ambos documentos
    // Dividido entre 2 = 50,000 caracteres por documento máximo
    // Pero para estar seguros, usamos 40,000 por documento (80,000 totales ≈ 20,000 tokens)
    const MAX_CHARS_PER_DOC = 40000;
    
    // Función helper para truncar texto de forma inteligente (preservando párrafos completos)
    const truncateText = (text: string, maxChars: number): string => {
      if (text.length <= maxChars) return text;
      
      // Intentar cortar en un punto final o salto de línea cercano
      const truncated = text.substring(0, maxChars);
      const lastPeriod = truncated.lastIndexOf('.');
      const lastNewline = truncated.lastIndexOf('\n');
      const cutPoint = Math.max(lastPeriod, lastNewline);
      
      if (cutPoint > maxChars * 0.8) {
        // Si encontramos un buen punto de corte (al menos 80% del límite), usarlo
        return text.substring(0, cutPoint + 1) + "\n\n[... texto truncado para cumplir límites de tokens ...]";
      }
      
      // Si no, cortar en el límite exacto
      return truncated + "\n\n[... texto truncado para cumplir límites de tokens ...]";
    };

    const truncatedTextA = truncateText(textA, MAX_CHARS_PER_DOC);
    const truncatedTextB = truncateText(textB, MAX_CHARS_PER_DOC);

    console.log(`[COMPARE] 📊 Tamaños de documentos: A=${textA.length}→${truncatedTextA.length} chars, B=${textB.length}→${truncatedTextB.length} chars`);

    const userPrompt = `Compara los siguientes dos documentos legales:

═══════════════════════════════════════════════════════════════════════════════
DOCUMENTO A (ID: ${documentIdA})
═══════════════════════════════════════════════════════════════════════════════
${truncatedTextA}

═══════════════════════════════════════════════════════════════════════════════
DOCUMENTO B (ID: ${documentIdB})
═══════════════════════════════════════════════════════════════════════════════
${truncatedTextB}

${instructions ? `\n\nINSTRUCCIONES DEL USUARIO:\n${instructions}` : ""}
${additionalInstructions ? `\n\nINDICACIONES ADICIONALES:\n${additionalInstructions}` : ""}

Área Legal: ${areaLegal}

Realiza un análisis comparativo jurídico exhaustivo siguiendo la estructura indicada.`;

    comparisonResults.set(comparisonId, { 
      status: "processing", 
      progress: 50, 
      statusLabel: textA.length > MAX_CHARS_PER_DOC || textB.length > MAX_CHARS_PER_DOC
        ? "Generando análisis comparativo con IA (documentos truncados por tamaño)..."
        : "Generando análisis comparativo con IA..."
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 8000,
    });

    const comparisonText = response.choices[0]?.message?.content || "Error al generar análisis comparativo";

    comparisonResults.set(comparisonId, {
      status: "completed",
      result: comparisonText,
      progress: 100,
      statusLabel: "Comparación completada",
    });

    console.log(`[COMPARE] ✅ Comparación ${comparisonId} completada`);
  } catch (error) {
    console.error(`[COMPARE] ❌ Error en comparación ${comparisonId}:`, error);
    comparisonResults.set(comparisonId, {
      status: "error",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}

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
      // Log longitud del texto original (diagnóstico: si es 0 o muy bajo, el chat "no ve" el documento)
      const origRaw = result.analysis.original;
      let originalLength = 0;
      if (typeof origRaw === 'string') {
        try {
          const parsed = origRaw.trim().startsWith('{') ? JSON.parse(origRaw) : null;
          originalLength = parsed?.text?.length ?? origRaw.length;
        } catch {
          originalLength = origRaw.length;
        }
      } else if (origRaw && typeof origRaw === 'object' && typeof (origRaw as { text?: string }).text === 'string') {
        originalLength = (origRaw as { text: string }).text.length;
      }
      console.log(`[RESULT] Texto original (documento) longitud: ${originalLength} caracteres`);
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
// Endpoint para eliminar un documento (soft delete - solo admin)
app.delete("/document/:documentId", async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { borradoPor } = req.body; // Email del usuario que borra (debe ser admin)
    
    console.log(`[DELETE] Intentando borrar documento ${documentId} por ${borradoPor}...`);
    
    // Verificar que el usuario que borra es admin
    if (!borradoPor) {
      return res.status(400).json({ 
        error: "Bad request",
        message: "Se requiere información del usuario que realiza el borrado"
      });
    }
    
    // Verificar que el usuario es admin
    const userCheck = await db.query(`
      SELECT rol FROM usuarios WHERE email = $1 AND activo = true
    `, [borradoPor]);
    
    if (userCheck.rows.length === 0 || userCheck.rows[0].rol !== 'admin') {
      return res.status(403).json({ 
        error: "Forbidden",
        message: "Solo los administradores pueden borrar documentos"
      });
    }
    
    // Verificar que el documento existe
    const doc = await legalDb.getDocument(documentId);
    if (!doc) {
      return res.status(404).json({ 
        error: "Document not found",
        message: `Document with id ${documentId} does not exist.`,
        documentId
      });
    }
    
    // Verificar que no esté ya borrado
    if (doc.activo === false) {
      return res.status(400).json({ 
        error: "Already deleted",
        message: "El documento ya fue borrado anteriormente"
      });
    }
    
    // Soft delete: marcar como borrado (mantener en DB para trazabilidad)
    const deleted = await legalDb.deleteDocumentsByIds([documentId], borradoPor);
    
    if (deleted > 0) {
      console.log(`[DELETE] ✅ Documento ${documentId} marcado como borrado por ${borradoPor}`);
      return res.json({ 
        success: true, 
        message: "Documento marcado como borrado exitosamente",
        documentId,
        borradoPor,
        borradoAt: new Date().toISOString()
      });
    } else {
      return res.status(500).json({ 
        error: "Failed to delete",
        message: "No se pudo marcar el documento como borrado."
      });
    }
  } catch (err: any) {
    console.error(`[DELETE] ❌ Error borrando documento:`, err);
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
    // Usar created_at en lugar de analyzed_at
    const accuracy = "N/A"; // Por ahora no tenemos métrica de exactitud
    
    // 5. Latencia media (tiempo promedio de análisis completado)
    // Usar created_at de legal_analysis en lugar de analyzed_at (que no existe)
    let avgLatency = "N/A";
    let p95Latency = "N/A";
    try {
      const latencyResult = await db.query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (la.created_at - ld.created_at))) as avg_seconds,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (la.created_at - ld.created_at))) as p95_seconds
        FROM legal_analysis la
        JOIN legal_documents ld ON la.document_id = ld.id
        WHERE la.created_at IS NOT NULL 
          AND ld.created_at IS NOT NULL
          AND la.created_at >= NOW() - INTERVAL '7 days'
          AND la.report IS NOT NULL
      `);
      const avgSeconds = parseFloat(latencyResult.rows[0]?.avg_seconds || "0");
      const p95Seconds = parseFloat(latencyResult.rows[0]?.p95_seconds || "0");
      avgLatency = avgSeconds > 0 ? `${(avgSeconds / 60).toFixed(1)}m` : "N/A";
      p95Latency = p95Seconds > 0 ? `${(p95Seconds / 60).toFixed(1)}m` : "N/A";
    } catch (err: any) {
      console.warn(`[STATS] ⚠️ No se pudo calcular latencia:`, err.message);
      // Usar valores por defecto si falla
    }
    
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
    
    // 7. Usuarios activos = logins en los últimos 30 minutos
    let activeUsers = 0;
    try {
      const activeResult = await db.query(`
        SELECT COUNT(*) as count
        FROM usuarios
        WHERE activo = true
          AND last_login_at >= NOW() - INTERVAL '30 minutes'
      `);
      activeUsers = parseInt(activeResult.rows[0]?.count || "0", 10);
    } catch (err: any) {
      console.warn(`[STATS] ⚠️ No se pudo contar usuarios activos (¿columna last_login_at?):`, err.message);
    }
    
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
// Si se pasa ?all=true, devuelve todos (activos e inactivos) - para admin
app.get("/abogados", async (req, res, next) => {
  try {
    const all = req.query.all === 'true';
    console.log(`[ABOGADOS] Obteniendo lista de abogados senior (all=${all})...`);
    
    const query = all 
      ? `SELECT id, nombre, telefono, email, activo, orden, created_at, updated_at
         FROM abogados_senior
         ORDER BY orden ASC, nombre ASC`
      : `SELECT id, nombre, telefono, email, activo, orden
         FROM abogados_senior
         WHERE activo = true
         ORDER BY orden ASC, nombre ASC`;
    
    const result = await db.query(query);
    
    const abogados = result.rows.map((row: any) => ({
      id: row.id,
      nombre: row.nombre,
      telefono: row.telefono || null,
      email: row.email,
      activo: row.activo,
      orden: row.orden || 0,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null
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

// Endpoint para asignar un documento a un abogado
app.post("/assign-document", async (req, res, next) => {
  try {
    const { documentoId, documentoTipo, documentoTitulo, abogadoId, asignadoPor, notas } = req.body;
    
    if (!documentoId || !documentoTipo || !abogadoId) {
      return res.status(400).json({ 
        error: "Bad request",
        message: "documentoId, documentoTipo y abogadoId son requeridos"
      });
    }
    
    // Verificar que el abogado existe y está activo
    const abogadoCheck = await db.query(`
      SELECT id, nombre, email, telefono
      FROM abogados_senior
      WHERE id = $1 AND activo = true
    `, [abogadoId]);
    
    if (abogadoCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: "Not found",
        message: "Abogado no encontrado o inactivo"
      });
    }
    
    const abogado = abogadoCheck.rows[0];
    
    // Crear la asignación
    const result = await db.query(`
      INSERT INTO documento_asignaciones (
        documento_id, 
        documento_tipo, 
        documento_titulo,
        abogado_id, 
        abogado_nombre, 
        abogado_email, 
        abogado_telefono,
        asignado_por,
        estado,
        notas
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, documento_id, documento_tipo, abogado_id, abogado_nombre, abogado_email, estado, created_at
    `, [
      documentoId,
      documentoTipo,
      documentoTitulo || null,
      abogadoId,
      abogado.nombre,
      abogado.email,
      abogado.telefono || null,
      asignadoPor || null,
      'asignado',
      notas || null
    ]);
    
    console.log(`[ASIGNACION] ✅ Documento ${documentoId} asignado a ${abogado.nombre} (${abogado.email})`);
    res.json({ 
      asignacion: result.rows[0],
      abogado: {
        id: abogado.id,
        nombre: abogado.nombre,
        email: abogado.email,
        telefono: abogado.telefono
      }
    });
  } catch (err: any) {
    console.error(`[ASIGNACION] ❌ Error asignando documento:`, err);
    next(err);
  }
});

// Endpoint para obtener asignaciones de un documento
app.get("/assign-document/:documentoId", async (req, res, next) => {
  try {
    const { documentoId } = req.params;
    
    const result = await db.query(`
      SELECT 
        id,
        documento_id,
        documento_tipo,
        documento_titulo,
        abogado_id,
        abogado_nombre,
        abogado_email,
        abogado_telefono,
        asignado_por,
        estado,
        notas,
        created_at,
        updated_at
      FROM documento_asignaciones
      WHERE documento_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [documentoId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: "Not found",
        message: "No hay asignación para este documento"
      });
    }
    
    res.json({ asignacion: result.rows[0] });
  } catch (err: any) {
    console.error(`[ASIGNACION] ❌ Error obteniendo asignación:`, err);
    next(err);
  }
});

// Obtener todas las asignaciones (para admin - historial)
app.get("/assignments", async (req, res, next) => {
  try {
    const { abogadoId, estado, desde, hasta, limit = 100 } = req.query;
    
    let query = `
      SELECT id, documento_id, documento_tipo, documento_titulo, abogado_id, abogado_nombre, abogado_email, abogado_telefono, asignado_por, estado, notas, created_at, updated_at
      FROM documento_asignaciones
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;
    
    if (abogadoId) {
      query += ` AND abogado_id = $${paramIndex}`;
      params.push(abogadoId);
      paramIndex++;
    }
    
    if (estado) {
      query += ` AND estado = $${paramIndex}`;
      params.push(estado);
      paramIndex++;
    }
    
    if (desde) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(desde);
      paramIndex++;
    }
    
    if (hasta) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(hasta);
      paramIndex++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit as string));
    
    const result = await db.query(query, params);
    
    console.log(`[ASSIGNMENTS] ✅ ${result.rows.length} asignaciones encontradas`);
    res.json({ asignaciones: result.rows });
  } catch (err: any) {
    console.error(`[ASSIGNMENTS] ❌ Error obteniendo asignaciones:`, err);
    next(err);
  }
});

// Actualizar estado de una asignación
app.put("/assignments/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { estado, notas } = req.body;
    
    if (!estado) {
      return res.status(400).json({ 
        error: "Bad request",
        message: "estado es requerido"
      });
    }
    
    const result = await db.query(`
      UPDATE documento_asignaciones
      SET estado = $1,
          notas = COALESCE($2, notas),
          updated_at = NOW()
      WHERE id = $3
      RETURNING id, documento_id, documento_tipo, abogado_nombre, estado, notas, updated_at
    `, [estado, notas || null, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: "Not found",
        message: "Asignación no encontrada"
      });
    }
    
    console.log(`[ASSIGNMENTS] ✅ Asignación ${id} actualizada a estado: ${estado}`);
    res.json({ asignacion: result.rows[0] });
  } catch (err: any) {
    console.error(`[ASSIGNMENTS] ❌ Error actualizando asignación:`, err);
    next(err);
  }
});

// ==================== GESTIÓN DE USUARIOS ====================

// Endpoint para login (autenticación)
app.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: "Bad request",
        message: "email y password son requeridos"
      });
    }
    
    // Buscar usuario por email
    const result = await db.query(`
      SELECT id, email, nombre, password_hash, rol, activo
      FROM usuarios
      WHERE email = $1
    `, [email.toLowerCase().trim()]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Email o contraseña incorrectos"
      });
    }
    
    const usuario = result.rows[0];
    
    if (!usuario.activo) {
      return res.status(403).json({ 
        error: "Forbidden",
        message: "Usuario inactivo"
      });
    }
    
    // Verificar contraseña
    const bcrypt = await import("bcrypt");
    const passwordMatch = await bcrypt.compare(password, usuario.password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Email o contraseña incorrectos"
      });
    }

    // Límite de usuarios simultáneos (activos = login en últimos 15 min)
    const MAX_CONCURRENT_USERS = Math.max(1, parseInt(process.env.LEGAL_DOCS_MAX_CONCURRENT_USERS || "10", 10));
    const SESSION_WINDOW_MINUTES = Math.max(5, parseInt(process.env.LEGAL_DOCS_SESSION_WINDOW_MINUTES || "15", 10));
    try {
      const countResult = await db.query(`
        SELECT COUNT(DISTINCT id) AS total
        FROM usuarios
        WHERE activo = true
          AND last_login_at >= NOW() - INTERVAL '1 minute' * $1
      `, [SESSION_WINDOW_MINUTES]);
      const activeCount = parseInt(countResult.rows[0]?.total || "0", 10);

      const isCurrentUserAlreadyActive = await db.query(`
        SELECT 1 FROM usuarios
        WHERE id = $1 AND last_login_at >= NOW() - INTERVAL '1 minute' * $2
      `, [usuario.id, SESSION_WINDOW_MINUTES]);
      const alreadyCounted = (isCurrentUserAlreadyActive.rows?.length || 0) > 0;

      if (activeCount >= MAX_CONCURRENT_USERS && !alreadyCounted) {
        return res.status(503).json({
          error: "Service Unavailable",
          code: "MAX_USERS_REACHED",
          message: "Se ha alcanzado el número máximo de usuarios conectados. Por favor, intente más tarde."
        });
      }
    } catch (err: any) {
      console.warn(`[AUTH] No se pudo verificar límite de usuarios:`, err.message);
      // Si falla la verificación (ej. columna inexistente), permitir login
    }
    
    // Actualizar last_login_at para estadísticas de usuarios activos
    await db.query(
      `UPDATE usuarios SET last_login_at = NOW() WHERE id = $1`,
      [usuario.id]
    ).catch((err: any) => console.warn(`[AUTH] No se pudo actualizar last_login_at:`, err.message));

    // Retornar información del usuario (sin password_hash)
    console.log(`[AUTH] ✅ Login exitoso: ${usuario.email} (${usuario.rol})`);
    res.json({
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol
      }
    });
  } catch (err: any) {
    console.error(`[AUTH] ❌ Error en login:`, err);
    next(err);
  }
});

// Refrescar datos del usuario actual (rol, etc.) sin exponer la lista completa
app.get("/auth/me", async (req, res, next) => {
  try {
    const email = (req.query.email as string)?.trim();
    if (!email) {
      return res.status(400).json({ error: "Bad request", message: "email es requerido" });
    }
    const result = await db.query(
      `SELECT id, email, nombre, rol FROM usuarios WHERE email = $1 AND activo = true`,
      [email.toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Not found", message: "Usuario no encontrado" });
    }
    const row = result.rows[0];
    res.json({ usuario: { id: row.id, email: row.email, nombre: row.nombre, rol: row.rol } });
  } catch (err: any) {
    console.error(`[AUTH] ❌ Error en /auth/me:`, err);
    next(err);
  }
});

// Endpoint para obtener lista de usuarios (solo admin)
app.get("/usuarios", async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT id, email, nombre, rol, activo, created_at, updated_at
      FROM usuarios
      ORDER BY created_at DESC
    `);
    
    const usuarios = result.rows.map((row: any) => ({
      id: row.id,
      email: row.email,
      nombre: row.nombre,
      rol: row.rol,
      activo: row.activo,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    
    console.log(`[USUARIOS] ✅ ${usuarios.length} usuarios encontrados`);
    res.json({ usuarios });
  } catch (err: any) {
    console.error(`[USUARIOS] ❌ Error obteniendo usuarios:`, err);
    next(err);
  }
});

// Endpoint para crear usuario (solo admin)
app.post("/usuarios", async (req, res, next) => {
  try {
    const { email, nombre, password, rol } = req.body;
    
    if (!email || !nombre || !password) {
      return res.status(400).json({ 
        error: "Bad request",
        message: "email, nombre y password son requeridos"
      });
    }

    // Límite: solo 10 usuarios (excl. admin); el 11.º no puede registrarse
    const MAX_REGISTERED_USERS = Math.max(1, parseInt(process.env.LEGAL_DOCS_MAX_REGISTERED_USERS || "10", 10));
    const countResult = await db.query(`
      SELECT COUNT(*) AS total FROM usuarios WHERE rol != 'admin'
    `);
    const totalNoAdmin = parseInt(countResult.rows[0]?.total || "0", 10);
    if (totalNoAdmin >= MAX_REGISTERED_USERS) {
      return res.status(403).json({
        error: "Forbidden",
        code: "MAX_USERS_LIMIT",
        message: "Se alcanzó el límite de usuarios de su plan. Suba al siguiente plan para agregar más usuarios."
      });
    }
    
    const rolValido = rol === 'admin' ? 'admin' : 'usuario';
    
    // Hash de la contraseña
    const bcrypt = await import("bcrypt");
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await db.query(`
      INSERT INTO usuarios (email, nombre, password_hash, rol, activo)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, email, nombre, rol, activo, created_at
    `, [email.toLowerCase().trim(), nombre, passwordHash, rolValido]);
    
    console.log(`[USUARIOS] ✅ Usuario creado: ${email}`);
    res.json({ usuario: result.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: "Conflict",
        message: "Ya existe un usuario con ese email"
      });
    }
    console.error(`[USUARIOS] ❌ Error creando usuario:`, err);
    next(err);
  }
});

// Endpoint para actualizar usuario (solo admin)
app.put("/usuarios/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, nombre, password, rol, activo } = req.body;
    
    // Construir query dinámico
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email.toLowerCase().trim());
    }
    if (nombre !== undefined) {
      updates.push(`nombre = $${paramIndex++}`);
      values.push(nombre);
    }
    if (password !== undefined) {
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(passwordHash);
    }
    if (rol !== undefined) {
      const rolValido = rol === 'admin' ? 'admin' : 'usuario';
      updates.push(`rol = $${paramIndex++}`);
      values.push(rolValido);
    }
    if (activo !== undefined) {
      updates.push(`activo = $${paramIndex++}`);
      values.push(activo);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ 
        error: "Bad request",
        message: "No hay campos para actualizar"
      });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const result = await db.query(`
      UPDATE usuarios
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, email, nombre, rol, activo, updated_at
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: "Not found",
        message: "Usuario no encontrado"
      });
    }
    
    console.log(`[USUARIOS] ✅ Usuario actualizado: ${id}`);
    res.json({ usuario: result.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: "Conflict",
        message: "Ya existe un usuario con ese email"
      });
    }
    console.error(`[USUARIOS] ❌ Error actualizando usuario:`, err);
    next(err);
  }
});

// Endpoint para eliminar usuario (soft delete - solo admin)
app.delete("/usuarios/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      UPDATE usuarios
      SET activo = false, updated_at = NOW()
      WHERE id = $1
      RETURNING id, email, nombre
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: "Not found",
        message: "Usuario no encontrado"
      });
    }
    
    console.log(`[USUARIOS] ✅ Usuario desactivado: ${id}`);
    res.json({ message: "Usuario desactivado exitosamente", usuario: result.rows[0] });
  } catch (err: any) {
    console.error(`[USUARIOS] ❌ Error desactivando usuario:`, err);
    next(err);
  }
});

app.get("/history", async (_req, res) => {
  try {
    const documents = await legalDb.getAllDocumentsWithAnalysis(100);
    
    // Primero identificar todos los análisis conjuntos
    const conjointAnalyses = documents.filter((doc: any) => {
      if (!doc.report) return false;
      let report = doc.report;
      if (typeof report === 'string') {
        try {
          report = JSON.parse(report);
        } catch {
          return false;
        }
      }
      if (report && typeof report === 'object') {
        const reportText = JSON.stringify(report).toLowerCase();
        const title = (report.titulo || '').toLowerCase();
        return reportText.includes('conjunto') || 
               reportText.includes('múltiples documentos') ||
               title.includes('conjunto') ||
               title.includes('múltiples');
      }
      return false;
    });
    
    // Obtener IDs de documentos que son parte de análisis conjuntos (desde original.documents)
    const documentsInConjoint = new Set<string>();
    conjointAnalyses.forEach((conjointDoc: any) => {
      if (conjointDoc.original) {
        let original = conjointDoc.original;
        if (typeof original === 'string') {
          try {
            original = JSON.parse(original);
          } catch {
            return;
          }
        }
        if (original && original.documents && Array.isArray(original.documents)) {
          original.documents.forEach((d: any) => {
            if (d.id) documentsInConjoint.add(d.id);
          });
        }
      }
    });
    
    // También identificar documentos con isPartOfConjointAnalysis
    documents.forEach((doc: any) => {
      if (doc.original) {
        let original = doc.original;
        if (typeof original === 'string') {
          try {
            original = JSON.parse(original);
          } catch {
            return;
          }
        }
        if (original && original.isPartOfConjointAnalysis === true && original.primaryDocumentId) {
          documentsInConjoint.add(doc.id);
        }
      }
    });
    
    // Transformar al formato esperado por el frontend
    const items = documents
      .filter((doc: any) => {
        // 1. Filtrar documentos que son parte de un análisis conjunto (tienen isPartOfConjointAnalysis)
        if (doc.original) {
          let original = doc.original;
          if (typeof original === 'string') {
            try {
              original = JSON.parse(original);
            } catch {
              // Si no es JSON válido, mantener como está
            }
          }
          
          if (original && original.isPartOfConjointAnalysis === true && !doc.report) {
            console.log(`[HISTORY] Filtrando documento ${doc.id} (parte de análisis conjunto - isPartOfConjointAnalysis)`);
            return false;
          }
        }
        
        // 2. Filtrar documentos que están en la lista de documentos de un análisis conjunto
        // IMPORTANTE: Filtrar incluso si el análisis conjunto aún no está completo (no tiene report todavía)
        if (documentsInConjoint.has(doc.id)) {
          // Solo mostrar si ES el documento principal Y tiene report (es el análisis conjunto completo)
          const isPrimaryWithReport = conjointAnalyses.some((conjointDoc: any) => {
            if (conjointDoc.id === doc.id && conjointDoc.report) return true;
            return false;
          });
          
          if (!isPrimaryWithReport) {
            console.log(`[HISTORY] Filtrando documento ${doc.id} (está en lista de documentos de análisis conjunto)`);
            return false;
          }
        }
        
        // 3. Filtrar documentos con estado "uploaded" sin análisis si hay un análisis conjunto reciente
        // O si hay documentos con la misma fecha que forman parte de un análisis conjunto
        if (doc.status === 'uploaded' && !doc.analysis_type && !doc.report) {
          // Verificar si hay un análisis conjunto que incluya este documento
          const isInConjointList = documentsInConjoint.has(doc.id);
          
          // También verificar por fecha: si hay análisis conjunto creado en la misma fecha/hora
          const hasRecentConjoint = conjointAnalyses.some((conjointDoc: any) => {
            const docDate = new Date(doc.created_at).getTime();
            const conjointDate = new Date(conjointDoc.created_at || conjointDoc.analyzed_at).getTime();
            // Si el análisis conjunto fue creado en la misma fecha o después (dentro de 2 horas), probablemente es del mismo batch
            return Math.abs(conjointDate - docDate) < 7200000; // 2 horas de diferencia
          });
          
          // También verificar si hay otros documentos uploaded de la misma fecha que tienen análisis conjunto
          const hasOtherUploadedWithConjoint = documents.some((otherDoc: any) => {
            if (otherDoc.id === doc.id) return false;
            const sameDate = Math.abs(new Date(otherDoc.created_at).getTime() - new Date(doc.created_at).getTime()) < 3600000; // 1 hora
            return sameDate && otherDoc.report && documentsInConjoint.has(otherDoc.id);
          });
          
          if (isInConjointList || hasRecentConjoint || hasOtherUploadedWithConjoint) {
            console.log(`[HISTORY] Filtrando documento ${doc.id} (uploaded sin análisis, parte de análisis conjunto)`);
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
          estado: doc.activo === false ? 'Borrado' : (doc.status === 'completed' ? 'Listo para revisión' : (doc.status || 'uploaded')),
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
          filename: doc.filename,
          activo: doc.activo !== false, // true si no está borrado
          borrado: doc.activo === false,
          borradoPor: doc.borrado_por || null,
          borradoAt: doc.borrado_at || null
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

