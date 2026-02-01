import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z } from "zod";
import pg from "pg";
const { Client } = pg;
import { generateDoc } from "./generate.js";
import { ingestBatch } from "./ingest.js";
import { queryDocument } from "./query-doc.js";
import { extractTextFromPdf } from "./pdf-extract.js";
import { generarMemoJuridico } from "./memos/generate-memo.js";
import { generarMemoJuridicoDirect } from "./memos/generate-memo-direct.js";
import { queryMemo } from "./memos/query-memo.js";
import { chatMemo } from "./memos/chat-memo.js";
import { chatAnalysis } from "./memos/chat-analysis.js";
import { chatCompare } from "./memos/chat-compare.js";
import OpenAI from "openai";
import * as knowledgeBases from "./knowledge-bases.js";
import { scrapeAndIngestUrls, scrapeUrl } from "./url-scraper.js";
import { createReadStream, existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { LEGAL_TEMPLATES, findTemplateById, getTemplateAbsolutePath, type LegalTemplate } from "./templates/templates-registry.js";
import mammoth from "mammoth";
import { fillTemplateWithMemoData } from "./templates/fill-template.js";
import type { MemoOutput } from "./memos/types.js";
import { checkRateLimit, getClientIdentifier } from "./rate-limit.js";
import { convertToWord } from "./convert-to-word.js";

// ❌ ELIMINADO: Check de versiones causaba ENOENT en Railway
// El build ESM/dist no expone node_modules así, y no es crítico para el funcionamiento

async function start() {
  const app = Fastify({ 
    logger: true,
    // ⚠️ CRÍTICO: Aumentar timeouts para uploads grandes
    requestTimeout: 180000, // 3 minutos para request completo
    // Aumentar bodyLimit para permitir múltiples archivos (5 archivos x 50MB = 250MB máximo)
    bodyLimit: 250 * 1024 * 1024, // 250MB límite total de body para múltiples archivos
  });

  // ✅ Crear tabla knowledge_bases automáticamente al iniciar (si no existe)
  try {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id          text PRIMARY KEY,
        name        text NOT NULL,
        description text,
        source_type text NOT NULL,
        enabled     boolean DEFAULT true,
        metadata    jsonb DEFAULT '{}'::jsonb,
        created_at  timestamptz DEFAULT now(),
        updated_at  timestamptz DEFAULT now()
      )
    `);
    
    // Insertar bases de conocimiento por defecto (si no existen)
    await client.query(`
      INSERT INTO knowledge_bases (id, name, description, source_type, enabled) VALUES
        ('normativa_principal', 'Normativa Principal', 'Normativa argentina principal', 'normativa', true),
        ('jurisprudencia_principal', 'Jurisprudencia Principal', 'Jurisprudencia argentina principal', 'juris', true),
        ('interno_principal', 'Base Interna Principal', 'Documentos internos del estudio', 'interno', true)
      ON CONFLICT (id) DO NOTHING
    `);
    
    await client.end();
    app.log.info("[STARTUP] Tabla knowledge_bases creada/verificada correctamente");
  } catch (error: any) {
    app.log.warn(`[STARTUP] No se pudo crear/verificar knowledge_bases (continuando igual): ${error?.message || error}`);
    // No crashear si falla, el código es resiliente
  }

  // ✅ Crear tabla templates automáticamente al iniciar (si no existe)
  try {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS templates (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        nombre text NOT NULL,
        descripcion text,
        content_md text NOT NULL,
        created_at timestamptz DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_templates_created_at ON templates(created_at)`);

    await client.end();
    app.log.info("[STARTUP] Tabla templates creada/verificada correctamente");
  } catch (error: any) {
    app.log.warn(`[STARTUP] No se pudo crear/verificar templates (continuando igual): ${error?.message || error}`);
  }

  const allowedOriginsFromEnv = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const isAllowedOrigin = (origin: string) => {
    // Permitir localhost
    if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return true;

    // Permitir todos los dominios de Vercel (preview + prod)
    if (origin.includes(".vercel.app") || origin.endsWith("vercel.app")) return true;

    // Permitir nivel41.uk (dominio personalizado)
    if (origin.includes("nivel41.uk")) return true;

    // Permitir orígenes explícitos vía env
    if (allowedOriginsFromEnv.includes(origin)) return true;

    return false;
  };

  // CORS para frontend en Vercel y desarrollo local
  await app.register(cors, {
    // Importante: setear CORS lo más temprano posible para que aplique también a 404/errores/proxy
    hook: "onRequest",
    origin: (origin, cb) => {
      // Permitir requests sin origin (Postman, curl, etc.)
      if (!origin) {
        app.log.info("CORS: Request sin origin, permitido");
        return cb(null, true);
      }
      
      app.log.info(`CORS: Verificando origin: ${origin}`);
      
      if (isAllowedOrigin(origin)) {
        app.log.info("CORS: Origin permitido");
        return cb(null, true);
      }
      
      // Denegar otros orígenes
      app.log.warn(`CORS: Origin denegado: ${origin}`);
      return cb(new Error("Not allowed by CORS"), false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    exposedHeaders: ["Content-Disposition"],
    maxAge: 86400,
    optionsSuccessStatus: 204
  });

  // Multipart para manejar archivos
  // Aumentar límite para permitir múltiples archivos grandes
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB máximo por archivo (igual que legal-docs)
      files: 5, // Máximo 5 archivos
    }
  });

  app.post("/api/save-template", async (req, rep) => {
    try {
      const body = z.object({
        nombre: z.string().min(1),
        descripcion: z.string().optional(),
        content_md: z.string().min(1)
      }).parse(req.body);

      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) return rep.status(500).send({ error: "DATABASE_URL no configurada" });

      const client = new Client({ connectionString: dbUrl });
      await client.connect();
      const result = await client.query(
        `INSERT INTO templates (nombre, descripcion, content_md) VALUES ($1,$2,$3) RETURNING id, created_at`,
        [body.nombre, body.descripcion || null, body.content_md]
      );
      await client.end();

      return rep.send({
        id: result.rows[0]?.id,
        created_at: result.rows[0]?.created_at
      });
    } catch (error) {
      app.log.error(error, "Error en /api/save-template");
      return rep.status(500).send({
        error: "Error al guardar template",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  app.get("/api/templates", async (_req, rep) => {
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) return rep.status(500).send({ error: "DATABASE_URL no configurada" });

      const client = new Client({ connectionString: dbUrl });
      await client.connect();
      const result = await client.query(
        `SELECT id, nombre, descripcion, created_at FROM templates ORDER BY created_at DESC LIMIT 100`
      );
      await client.end();

      return rep.send({ templates: result.rows });
    } catch (error) {
      app.log.error(error, "Error en /api/templates");
      return rep.status(500).send({
        error: "Error al listar templates",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Subir documentos de ejemplo para Documento Personalizado (solo para la generación actual)
  app.post("/api/custom-document/reference-text", async (req, rep) => {
    try {
      const parts = req.files();
      const filesMeta: Array<{ filename: string; mimeType?: string; chars: number }> = [];
      let combined = "";
      let count = 0;

      for await (const part of parts) {
        count++;
        if (count > 2) {
          return rep.status(400).send({ error: "Máximo 2 archivos de ejemplo" });
        }

        if (!part.file || !part.filename) {
          continue;
        }

        const buf = await part.toBuffer();
        const filename = part.filename;
        const mimeType = (part.mimetype || "").toLowerCase();
        const nameLower = filename.toLowerCase();

        let text = "";
        if (mimeType === "application/pdf" || nameLower.endsWith(".pdf")) {
          text = await extractTextFromPdf(buf);
        } else if (
          mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          nameLower.endsWith(".docx")
        ) {
          const { value } = await mammoth.extractRawText({ buffer: buf });
          text = value || "";
        } else if (mimeType === "text/plain" || nameLower.endsWith(".txt")) {
          text = buf.toString("utf-8");
        } else {
          return rep.status(400).send({
            error: `Formato no soportado para ejemplo: ${filename}. Usá PDF, DOCX o TXT.`
          });
        }

        const clean = (text || "").trim();
        filesMeta.push({ filename, mimeType, chars: clean.length });
        if (clean) {
          combined += `\n\n═══════════════════════════════════════════════════════════════════════════════\nDOCUMENTO EJEMPLO: ${filename}\n═══════════════════════════════════════════════════════════════════════════════\n${clean}`;
        }
      }

      if (!filesMeta.length) {
        return rep.status(400).send({ error: "No se recibieron archivos" });
      }

      const referenceText = combined.trim().slice(0, 12000);

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return rep.send({ referenceText, files: filesMeta, extracted: null });
      }

      const openai = new OpenAI({ apiKey: openaiKey });
      const extractionSystem = `Sos un abogado argentino senior. Te voy a dar texto de documentos de ejemplo (modelos). Tu tarea es DEVOLVER SOLO METADATA NO SENSIBLE para mejorar la UX. No devuelvas nombres propios, domicilios, IDs, emails ni teléfonos. No inventes.`;
      const extractionUser = `Extraé un JSON con esta estructura EXACTA (sin datos sensibles):

{
  "documentType": string | null,
  "hasPartyData": boolean,
  "sections": {
    "definitions": boolean,
    "purpose_object": boolean,
    "confidentiality": boolean,
    "term": boolean,
    "price_payment": boolean,
    "ip": boolean,
    "non_solicitation": boolean,
    "non_compete": boolean,
    "liability_indemnity": boolean,
    "governing_law_jurisdiction": boolean,
    "notices": boolean,
    "assignment": boolean,
    "termination": boolean,
    "dispute_resolution": boolean
  }
}

Reglas:
- NO incluyas texto fuera del JSON.
- hasPartyData = true si en el texto parece haber datos de identificación de partes (sin decir cuáles).

TEXTO:
${referenceText.slice(0, 8000)}
`;

      let extracted: any = null;
      try {
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: extractionSystem },
            { role: "user", content: extractionUser }
          ],
          temperature: 0.1,
          max_tokens: 700,
          response_format: { type: "json_object" }
        });

        const content = resp.choices[0]?.message?.content || "";
        extracted = content ? JSON.parse(content) : null;
      } catch (err) {
        extracted = null;
      }

      return rep.send({ referenceText, files: filesMeta, extracted });
    } catch (error) {
      app.log.error(error, "Error en /api/custom-document/reference-text");
      return rep.status(500).send({
        error: "Error al procesar documentos de ejemplo",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  app.get("/health", async () => ({ ok: true }));
  
  // Endpoint de prueba para verificar que el servidor está corriendo
  app.get("/api/test", async () => ({ 
    ok: true, 
    message: "Servidor funcionando correctamente",
    timestamp: new Date().toISOString()
  }));

  // Endpoint para obtener historial de documentos desde legal-docs
  app.get("/api/history", async (_req, rep) => {
    const LEGAL_DOCS_URL = process.env.LEGAL_DOCS_URL;
    if (!LEGAL_DOCS_URL) {
      return rep.send({ items: [], error: "LEGAL_DOCS_URL no configurada" });
    }

    let baseUrl = LEGAL_DOCS_URL.trim();
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      baseUrl = `https://${baseUrl}`;
    }
    baseUrl = baseUrl.replace(/\/$/, "");

    try {
      const response = await fetch(`${baseUrl}/history`, {
        method: "GET",
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        app.log.error(`Error fetching history: ${response.status}`);
        return rep.send({ items: [], error: `Error ${response.status}` });
      }

      const data = await response.json();
      return rep.send(data);
    } catch (error) {
      app.log.error(error, "Error fetching history");
      return rep.send({ items: [], error: error instanceof Error ? error.message : "Error desconocido" });
    }
  });

  // Endpoint de diagnóstico para verificar configuración de legal-docs
  app.get("/api/legal-docs-status", async (_req, rep) => {
    const LEGAL_DOCS_URL = process.env.LEGAL_DOCS_URL;
    if (!LEGAL_DOCS_URL) {
      return rep.send({
        configured: false,
        error: "LEGAL_DOCS_URL no configurada",
        message: "Agregar variable LEGAL_DOCS_URL en Railway apuntando a la URL del servicio legal-docs"
      });
    }

    // Normalizar URL
    let baseUrl = LEGAL_DOCS_URL.trim();
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      baseUrl = `https://${baseUrl}`;
    }
    baseUrl = baseUrl.replace(/\/$/, "");

    // Verificar health check
    try {
      const healthUrl = `${baseUrl}/health`;
      const healthCheck = await fetch(healthUrl, { 
        method: "GET",
        signal: AbortSignal.timeout(5000)
      });
      if (healthCheck.ok) {
        const healthData = await healthCheck.json();
        return rep.send({
          configured: true,
          url: baseUrl,
          health: "ok",
          healthData
        });
      } else {
        return rep.send({
          configured: true,
          url: baseUrl,
          health: "error",
          status: healthCheck.status,
          statusText: healthCheck.statusText
        });
      }
    } catch (error) {
      return rep.send({
        configured: true,
        url: baseUrl,
        health: "error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/v1/generate", async (req, rep) => {
    const body = z.object({
      type: z.enum(["dictamen","contrato","memo","escrito"]),
      title: z.string().min(3),
      instructions: z.string().min(10),
      k: z.number().optional(),
      knowledgeBases: z.array(z.string()).optional(), // IDs de bases de conocimiento a incluir
      excludeKnowledgeBases: z.array(z.string()).optional() // IDs de bases de conocimiento a excluir
    }).parse(req.body);

    // Default KBs: si no se especifica nada, preferimos usar las KBs "de fábrica" habilitadas
    // (ej. jurisprudencia argentina y normativa), para que el usuario no tenga que seleccionar nada.
    let effectiveBody = body;
    if ((!body.knowledgeBases || body.knowledgeBases.length === 0) && (!body.excludeKnowledgeBases || body.excludeKnowledgeBases.length === 0)) {
      try {
        const kbs = await knowledgeBases.listKnowledgeBases(process.env.DATABASE_URL!);
        const enabled = (kbs || []).filter(kb => kb.enabled).map(kb => kb.id);

        // Preferencias explícitas si existen
        const preferred = ["jurisprudencia_principal", "normativa_nacional_urls"].filter(id => enabled.includes(id));
        const defaults = preferred.length > 0 ? preferred : enabled;

        if (defaults.length > 0) {
          app.log.info({ defaults }, "Usando knowledge bases por defecto");
          effectiveBody = { ...body, knowledgeBases: defaults };
        }
      } catch (e) {
        // Si la tabla no existe o falla, seguimos sin filtro (compatibilidad)
        app.log.warn({ err: e }, "No se pudieron cargar KBs por defecto; se usará búsqueda global");
      }
    }

    const res = await generateDoc(process.env.DATABASE_URL!, process.env.OPENAI_API_KEY!, effectiveBody);
    return rep.send(res);
  });

  // Ingesta simple de texto (para seed o pruebas)
  app.post("/v1/ingest", async (req, rep) => {
    const body = z.object({
      items: z.array(z.object({
        text: z.string().min(20),
        source: z.string(), // Ahora acepta cualquier string, no solo enum
        title: z.string().optional(),
        url: z.string().optional(),
        meta: z.record(z.any()).optional(),
        knowledgeBase: z.string().optional() // ID de la base de conocimiento
      }))
    }).parse(req.body);

    await ingestBatch(process.env.DATABASE_URL!, process.env.OPENAI_API_KEY!, body.items);
    return rep.send({ ok: true, count: body.items.length });
  });

  // Query documento (tipo NotebookLM - input/output basado en documento)
  app.post("/v1/query", async (req, rep) => {
    const body = z.object({
      documentId: z.string().uuid(),
      query: z.string().min(5)
    }).parse(req.body);

    const res = await queryDocument(
      process.env.DATABASE_URL!,
      process.env.OPENAI_API_KEY!,
      body.documentId,
      body.query
    );
    return rep.send(res);
  });

  // Generar memo jurídico desde transcripción (PDF o texto)
  app.post("/api/memos/generate", async (req, rep) => {
    try {
      app.log.info("POST /api/memos/generate recibido");
      
      // Leer todos los campos del multipart
      const fields: Record<string, string> = {};
      let pdfBuffer: Buffer | null = null;
      let pdfFilename: string | null = null;

      // Verificar que el request sea multipart
      if (!req.isMultipart()) {
        app.log.warn("Request no es multipart");
        return rep.status(400).send({ error: "Se requiere multipart/form-data" });
      }

      // Iterar sobre todas las partes del multipart
      try {
        for await (const part of req.parts()) {
          if (part.type === "file") {
            // Es un archivo (PDF)
            if (part.fieldname === "transcripcion" && part.filename) {
              pdfBuffer = await part.toBuffer();
              pdfFilename = part.filename;
              app.log.info(`PDF recibido: ${part.filename}, tamaño: ${pdfBuffer.length} bytes`);
            }
          } else {
            // Es un campo de texto
            const value = await (part.value as any).toString();
            fields[part.fieldname] = value;
            app.log.info(`Campo recibido: ${part.fieldname} = ${value.substring(0, 50)}...`);
          }
        }
      } catch (multipartError) {
        app.log.error(multipartError, "Error al leer multipart");
        return rep.status(400).send({ 
          error: "Error al procesar multipart",
          details: multipartError instanceof Error ? multipartError.message : "Error desconocido"
        });
      }

      // Validar campos requeridos
      const tipoDocumento = fields.tipoDocumento || fields.tipo_documento;
      const titulo = fields.titulo || fields.title;
      const instrucciones = fields.instrucciones || fields.instructions;

      app.log.info({ tipoDocumento, titulo, instrucciones: instrucciones?.substring(0, 50), tienePDF: !!pdfBuffer }, "Campos recibidos");

      if (!tipoDocumento || !titulo || !instrucciones) {
        app.log.warn({ tipoDocumento, titulo, instrucciones: !!instrucciones }, "Faltan campos requeridos");
        return rep.status(400).send({ 
          error: "Faltan campos requeridos: tipoDocumento, titulo, instrucciones",
          recibidos: Object.keys(fields)
        });
      }

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return rep.status(500).send({ error: "OPENAI_API_KEY no configurada" });
      }

      let memoOutput;
      
      // Si hay PDF, usar la versión directa (pasa PDF a OpenAI sin extraer texto)
      if (pdfBuffer) {
        app.log.info("Usando generación directa con PDF (sin extraer texto)");
        // Área legal es opcional - si no se proporciona, se detecta automáticamente
        const areaLegal = fields.areaLegal || fields.area_legal;
        memoOutput = await generarMemoJuridicoDirect(openaiKey, {
          tipoDocumento,
          titulo,
          instrucciones,
          areaLegal: areaLegal as any, // undefined si no se proporciona, se detectará automáticamente
          pdfBuffer,
          pdfFilename: pdfFilename || "transcripcion.pdf"
        });
      } else {
        // Sin PDF, usar la versión con texto extraído (o solo instrucciones)
        app.log.info("Usando generación con texto extraído o solo instrucciones");
        let transcriptText = "";
        
        // Si hay texto en algún campo, usarlo
        if (fields.transcriptText || fields.transcripcion) {
          transcriptText = fields.transcriptText || fields.transcripcion || "";
        }
        
        if (!transcriptText.trim() && !instrucciones.trim()) {
          return rep.status(400).send({ 
            error: "Se requiere al menos transcripción (PDF) o instrucciones" 
          });
        }
        
        // Área legal es opcional - si no se proporciona, se detecta automáticamente
        const areaLegal = fields.areaLegal || fields.area_legal;
        memoOutput = await generarMemoJuridico(openaiKey, {
          tipoDocumento,
          titulo,
          instrucciones,
          transcriptText,
          areaLegal: areaLegal as any // undefined si no se proporciona, se detectará automáticamente
        });
      }

      return rep.send(memoOutput);

    } catch (error) {
      app.log.error(error, "Error en /api/memos/generate");
      return rep.status(500).send({ 
        error: "Error interno al generar memo",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Consultar memo generado (chat sobre el memo)
  app.post("/api/memos/query", async (req, rep) => {
    try {
      const body = z.object({
        memoContent: z.string().min(10),
        query: z.string().min(5),
        titulo: z.string().optional(),
        citas: z.array(z.object({
          tipo: z.enum(["normativa", "jurisprudencia", "doctrina", "otra"]),
          referencia: z.string(),
          descripcion: z.string().optional(),
          url: z.string().optional()
        })).optional()
      }).parse(req.body);

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return rep.status(500).send({ error: "OPENAI_API_KEY no configurada" });
      }

      const result = await queryMemo(openaiKey, body);
      return rep.send(result);

    } catch (error) {
      app.log.error(error, "Error en /api/memos/query");
      return rep.status(500).send({
        error: "Error interno al consultar memo",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Extraer texto de PDF (para chat)
  app.post("/api/memos/extract-text", async (req, rep) => {
    try {
      if (!req.isMultipart()) {
        return rep.status(400).send({ error: "Se requiere multipart/form-data" });
      }

      let pdfBuffer: Buffer | null = null;

      for await (const part of req.parts()) {
        if (part.type === "file" && part.fieldname === "transcripcion" && part.filename) {
          pdfBuffer = await part.toBuffer();
          break;
        }
      }

      if (!pdfBuffer) {
        return rep.status(400).send({ error: "No se proporcionó archivo PDF" });
      }

      const text = await extractTextFromPdf(pdfBuffer);
      return rep.send({ text });

    } catch (error) {
      app.log.error(error, "Error en /api/memos/extract-text");
      return rep.status(500).send({
        error: "Error al extraer texto del PDF",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Chat conversacional sobre transcripciones (asistente jurídico)
  app.post("/api/memos/chat", async (req, rep) => {
    try {
      const body = z.object({
        transcriptText: z.string().optional(),
        messages: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string()
        })),
        areaLegal: z.string().optional(),
        memoText: z.string().optional(),
        citas: z.array(z.object({
          tipo: z.string(),
          referencia: z.string(),
          descripcion: z.string().optional(),
          url: z.string().optional()
        })).optional()
      }).parse(req.body);

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return rep.status(500).send({ error: "OPENAI_API_KEY no configurada" });
      }

      const result = await chatMemo(openaiKey, body);
      return rep.send(result);

    } catch (error) {
      app.log.error(error, "Error en /api/memos/chat");
      return rep.status(500).send({
        error: "Error interno en el chat",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Chat para documentos personalizados (Fase 1: básico, recopila información)
  app.post("/api/chat-custom-document", async (req, rep) => {
    try {
      const body = z.object({
        messages: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string()
        })),
        referenceText: z.string().optional()
      }).parse(req.body);

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return rep.status(500).send({ error: "OPENAI_API_KEY no configurada" });
      }

      const openai = new OpenAI({ apiKey: openaiKey });

      // Construir historial de conversación
      const trimmedMessages = body.messages.slice(-10);
      const conversationHistory = trimmedMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const referenceText = (body.referenceText || "").trim();
      const referenceBlock = referenceText
        ? `\n\nCONTEXTO (DOCUMENTOS DE EJEMPLO SUBIDOS POR EL USUARIO):\n${referenceText.slice(0, 6000)}\n\nREGLAS PARA USAR EL CONTEXTO:\n- Podés basarte en el texto para identificar tipo de documento, estructura y posibles datos.\n- NO inventes datos que no estén explícitos.\n- Si hay datos sensibles, pedí confirmación antes de asumirlos.\n- No copies literalmente secciones largas; usalo como guía.`
        : "";

      // System prompt para chat de documentos personalizados - MEJORADO Y PROFUNDO
      const systemPrompt = `Sos un abogado argentino senior de WNS & Asociados, especializado en redactar documentos legales profesionales y completos. Tu rol es hacer PREGUNTAS PROFUNDAS Y ESPECÍFICAS para recopilar TODA la información necesaria para generar un documento legal profesional de alta calidad.

OBJETIVO: Recopilar información COMPLETA y DETALLADA para generar documentos legales profesionales que estén listos para usar.

METODOLOGÍA:
- Haz UNA pregunta específica a la vez, pero sé EXHAUSTIVO
- NO aceptes respuestas vagas o incompletas
- Profundiza en cada aspecto hasta tener TODOS los detalles
- Sugiere aspectos legales importantes que el usuario podría estar olvidando
- Sé CONVERSACIONAL y AMIGABLE, pero PROFESIONAL y METICULOSO

INFORMACIÓN OBLIGATORIA QUE DEBES RECOPILAR (en este orden):

1. TIPO DE DOCUMENTO Y CONTEXTO:
   - ¿Qué tipo de documento específico? (contrato de locación, contrato de servicios, acuerdo de confidencialidad, etc.)
   - ¿Cuál es el contexto o situación que da origen a este documento?
   - ¿Hay documentos previos o relacionados?

2. PARTES INVOLUCRADAS (CRÍTICO - DEBE SER COMPLETO):
   - PARTE 1:
     * Nombre completo o razón social
     * DNI, CUIT o CUIL (según corresponda)
     * Domicilio completo (calle, número, ciudad, provincia, código postal)
     * Teléfono y email
     * ¿Actúa en nombre propio o como representante? Si es representante: cargo, poder, etc.
   - PARTE 2 (si aplica):
     * Nombre completo o razón social
     * DNI, CUIT o CUIL
     * Domicilio completo
     * Teléfono y email
     * ¿Actúa en nombre propio o como representante?
   - Si hay más partes, recopila la misma información para cada una

3. OBJETO Y ALCANCE DEL DOCUMENTO (MUY IMPORTANTE):
   - ¿Cuál es el objeto específico del contrato/acuerdo?
   - ¿Qué alcance tiene? (qué incluye y qué NO incluye)
   - ¿Hay limitaciones o exclusiones?
   - ¿Cuál es el propósito final?

4. CARACTERÍSTICAS Y ESPECIFICACIONES:
   - Características técnicas o específicas del bien/servicio/objeto
   - Especificaciones detalladas
   - Calidad, estándares, normas aplicables
   - Cualquier detalle técnico relevante

5. OBLIGACIONES Y DERECHOS:
   - ¿Cuáles son las obligaciones de cada parte?
   - ¿Cuáles son los derechos de cada parte?
   - ¿Hay obligaciones específicas o especiales?
   - ¿Hay garantías o seguros?

6. PRECIOS, MONTOS Y FORMA DE PAGO:
   - Monto total o precio unitario
   - Moneda (ARS, USD, etc.)
   - Forma de pago (contado, cuotas, anticipo, etc.)
   - Plazos de pago
   - ¿Hay intereses o recargos?
   - ¿Hay descuentos o bonificaciones?
   - ¿IVA incluido o excluido?

7. TIEMPO, PLAZOS Y FECHAS:
   - Fecha de inicio
   - Fecha de finalización o duración
   - Plazos intermedios (si aplica)
   - Fechas límite para cumplimientos específicos
   - ¿Hay prórrogas o renovaciones automáticas?

8. CONDICIONES Y TÉRMINOS:
   - Condiciones de cumplimiento
   - Condiciones suspensivas o resolutorias
   - Penalidades o multas por incumplimiento
   - Causas de resolución anticipada
   - ¿Hay cláusulas especiales?

9. JURISDICCIÓN Y LEY APLICABLE:
   - Jurisdicción (provincia, ciudad)
   - Ley aplicable (Código Civil, Comercial, etc.)
   - ¿Hay normativas específicas que deban aplicarse?

10. OTRAS CLAUSULAS IMPORTANTES:
    - Confidencialidad (si aplica)
    - Propiedad intelectual (si aplica)
    - No competencia (si aplica)
    - Fuerza mayor
    - Resolución de conflictos (mediación, arbitraje, etc.)
    - Modificaciones al contrato
    - Cesión de derechos

11. DOCUMENTACIÓN ADICIONAL:
    - ¿Se adjuntan anexos?
    - ¿Hay documentos que deben acompañar?
    - ¿Hay planos, especificaciones técnicas, etc.?

REGLAS DE CONVERSACIÓN:
- Si el usuario da información incompleta, pregunta específicamente por lo que falta
- Si menciona "un contrato" sin detalles, pregunta: "¿Qué tipo de contrato específicamente? ¿De servicios, de locación, de compraventa, etc.?"
- Si menciona "las partes" sin datos, pregunta: "Necesito los datos completos de cada parte: nombre completo, DNI/CUIT, domicilio, teléfono, email"
- Si menciona "un precio" sin detalles, pregunta: "¿Cuál es el monto exacto? ¿En qué moneda? ¿Cómo se paga? ¿Hay anticipo o cuotas?"
- Si menciona "un plazo" sin detalles, pregunta: "¿Cuál es la fecha de inicio? ¿Cuál la de finalización? ¿Hay plazos intermedios?"

EJEMPLOS DE PREGUNTAS PROFUNDAS:
❌ MAL: "¿Quiénes son las partes?"
✅ BIEN: "Necesito los datos completos de la primera parte: ¿Cuál es el nombre completo o razón social? ¿Tiene DNI, CUIT o CUIL? ¿Cuál es su domicilio completo (calle, número, ciudad, provincia)? ¿Teléfono y email?"

❌ MAL: "¿Cuál es el precio?"
✅ BIEN: "Sobre el precio: ¿Cuál es el monto total? ¿En qué moneda (ARS, USD)? ¿Se paga de contado o en cuotas? Si es en cuotas, ¿cuántas y cada cuánto tiempo? ¿Hay anticipo? ¿El IVA está incluido o excluido?"

❌ MAL: "¿Cuál es el plazo?"
✅ BIEN: "Sobre los plazos: ¿Cuál es la fecha de inicio del contrato? ¿Cuál es la fecha de finalización o cuánto tiempo dura? ¿Hay plazos intermedios para cumplimientos específicos?"

IMPORTANTE:
- NO generes el documento todavía, solo recopila información
- Haz preguntas UNA A LA VEZ, pero sé exhaustivo
- Confirma la información recibida antes de pasar a la siguiente pregunta
- Al final de cada respuesta, puedes resumir lo que ya tienes y preguntar por lo que falta

Formato de respuesta:
- Sé claro, profesional y directo
- Haz UNA pregunta específica y detallada
- Confirma información recibida antes de continuar
- Al final, resume lo recopilado y pregunta por lo que falta${referenceBlock}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory
        ],
        temperature: 0.4,
        max_tokens: 800  // Aumentado para permitir preguntas más completas y detalladas
      });

      const assistantMessage = response.choices[0]?.message?.content || "No se pudo generar una respuesta.";

      return rep.send({
        message: assistantMessage
      });

    } catch (error) {
      app.log.error(error, "Error en /api/chat-custom-document");
      return rep.status(500).send({
        error: "Error interno en el chat",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Generar documento personalizado desde descripción del chat (Fase 1)
  app.post("/api/generate-custom-document", async (req, rep) => {
    try {
      const body = z.object({
        descripcion: z.string(),
        detalles: z.record(z.any()).optional(),
        titulo: z.string().optional(),
        mode: z.enum(["standard", "deep"]).optional(),
        referenceText: z.string().optional()
      }).parse(req.body);

      const descripcion = body.descripcion.trim();
      const detalles = body.detalles || {};
      const mode = body.mode || "standard";

      const hasMatch = (text: string, patterns: RegExp[]) => patterns.some((p) => p.test(text));
      const getStr = (v: unknown) => (typeof v === "string" ? v : "");

      const partesText = getStr((detalles as any).partes);
      const objetoText = getStr((detalles as any).objeto);
      const jurisdiccionText = getStr((detalles as any).jurisdiccion);
      const plazoText = getStr((detalles as any).plazo);
      const precioText = getStr((detalles as any).precio);
      const mergedText = `${descripcion}\n${partesText}\n${objetoText}\n${jurisdiccionText}\n${plazoText}\n${precioText}`.toLowerCase();

      const missing: string[] = [];
      if (!partesText.trim() && !hasMatch(mergedText, [/\bentre\b/, /\bpartes?\b/, /\blocador\b/, /\blocatario\b/, /\bproveedor\b/, /\bcliente\b/, /\bacreed(or|ora)\b/, /\bdeud(or|ora)\b/])) {
        missing.push("partes (nombres/razones sociales, DNI/CUIT, domicilios)");
      }
      if (!objetoText.trim() && !hasMatch(mergedText, [/\bobjeto\b/, /\bservici(o|os)\b/, /\blocaci(o|ó)n\b/, /\bcompraventa\b/, /\bconfidencialidad\b/, /\bnda\b/, /\bprestaci(o|ó)n\b/])) {
        missing.push("objeto (qué se contrata/acuerda exactamente)");
      }
      if (!plazoText.trim() && !hasMatch(mergedText, [/\bplazo\b/, /\bduraci(o|ó)n\b/, /\bvigencia\b/, /\bmes(es)?\b/, /\ba(ñ|n)os\b/, /\bdesde\b/, /\bhasta\b/])) {
        missing.push("plazo/fechas (inicio, duración, vencimiento)");
      }
      if (!precioText.trim() && !hasMatch(mergedText, [/\bprecio\b/, /\bmonto\b/, /\bcontraprestaci(o|ó)n\b/, /\bcanon\b/, /\balquiler\b/, /\bhonorarios\b/, /\busd\b/, /\bars\b/, /\$|\b€\b/])) {
        missing.push("precio/montos (monto, moneda, forma de pago)");
      }
      if (!jurisdiccionText.trim() && !hasMatch(mergedText, [/\bjurisdic(ci|c)i(o|ó)n\b/, /\bley aplicable\b/, /\btribunal(es)?\b/, /\bcaba\b/, /\bbuenos aires\b/, /\bprovincia\b/])) {
        missing.push("jurisdicción/ley aplicable (provincia/ciudad, fuero)");
      }

      // Si faltan datos críticos:
      // - En modo deep: bloquear para evitar un documento superficial/incompleto.
      // - En modo standard: permitir generar usando placeholders (XXXXXX) para no frenar el flujo.
      if (missing.length >= 2 && mode === "deep") {
        return rep.status(400).send({
          error: "Información insuficiente para generar un documento de calidad",
          missingFields: missing,
          message:
            `Para generar un documento profesional sin inventar datos, necesito que completes:\n\n- ${missing.join("\n- ")}\n\nPodés responder con esos datos (si no los tenés, indicá 'XXXXXX').`
        });
      }

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return rep.status(500).send({ error: "OPENAI_API_KEY no configurada" });
      }

      const openai = new OpenAI({ apiKey: openaiKey });

      // Construir prompt para generar documento
      const detallesText = body.detalles 
        ? Object.entries(body.detalles)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join("\n")
        : "";

      const referenceText = (body.referenceText || "").trim();
      const systemPrompt = mode === "deep"
        ? `Sos un abogado argentino senior de WNS & Asociados. Generá documentos legales ULTRA COMPLETOS, PROFESIONALES, DETALLADOS y LISTOS PARA USAR.

REGLAS OBLIGATORIAS:
1. Documento COMPLETO y listo para firmar/usar - NO básico ni superficial
2. Incluir TODAS las cláusulas legales necesarias según el tipo, INCLUSO las no mencionadas por el usuario
3. FORMAL, PROFESIONAL y EXHAUSTIVO
4. Referencias específicas a normativa aplicable (CCyCN, leyes especiales, decretos) con artículos cuando corresponda
5. Formato con numeración de cláusulas y subcláusulas
6. Datos completos de partes: nombre, DNI/CUIT, domicilio, teléfono, email

ESTRUCTURA OBLIGATORIA:
1. TÍTULO: Claro y específico
2. ENCABEZADO: Datos completos de todas las partes
3. CONSIDERANDOS: Contexto legal y fáctico (mínimo 3-5 párrafos)
4. OBJETO: Descripción detallada y específica
5. CLAUSULAS PRINCIPALES (mínimo 20-30 cláusulas numeradas):
   Obligaciones y derechos de cada parte, precio/montos/forma de pago, plazos/fechas/duración, condiciones de cumplimiento, penalidades/multas, causas de resolución, garantías, seguros, confidencialidad, propiedad intelectual, no competencia, fuerza mayor, resolución de conflictos, modificaciones, cesión de derechos, notificaciones, jurisdicción/ley aplicable, disposiciones generales
6. FIRMA: Lugar, fecha y firmas de todas las partes
7. ANEXOS: Si aplica

CALIDAD REQUERIDA:
- Mínimo 20-30 cláusulas numeradas, cada una específica y detallada (no genérica)
- Incluir aspectos legales estándar que el usuario no mencionó
- Incluir TODAS las protecciones legales necesarias
- Referencias a normativa aplicable (CCyCN, leyes especiales)
- Profesional y formal, como redactado por abogado senior

EJEMPLO:
❌ MAL: "Las partes se comprometen a cumplir con sus obligaciones."
✅ BIEN: "CLÁUSULA 5: OBLIGACIONES DE LA PARTE PRIMERA. La Parte Primera se obliga a: (a) entregar el bien/servicio en el plazo establecido; (b) garantizar la calidad conforme a las especificaciones; (c) mantener la confidencialidad de la información recibida; (d) cumplir con todas las normativas aplicables. El incumplimiento de cualquiera de estas obligaciones dará lugar a las penalidades establecidas en la Cláusula 12."

El documento debe estar listo para usar sin necesidad de agregar más contenido.`
        : `Sos un abogado argentino senior de WNS & Asociados. Generá un documento legal profesional, completo y listo para revisión.

REGLAS OBLIGATORIAS:
1. Documento completo (no un esquema), pero priorizá claridad y utilidad práctica.
2. No inventes datos fácticos. Si falta información específica (nombres, domicilios, montos, fechas, jurisdicción, CUIT/DNI), usá el placeholder "XXXXXX".
3. Incluí cláusulas estándar necesarias según el tipo de documento, sin extenderte de manera innecesaria.
4. Estilo formal, español argentino, con numeración de cláusulas.
5. Si corresponde citar normativa, hacelo de forma prudente ("sujeto a verificación").`;

      const referenceBlock = referenceText
        ? `\n\nDOCUMENTOS DE EJEMPLO (usar como referencia de estilo y redacción; NO copiar datos personales; adaptar al caso):\n${referenceText.slice(0, 8000)}`
        : "";

      const userPrompt = `Generá un documento legal completo basándote en la siguiente descripción:

DESCRIPCIÓN:
${descripcion}

${referenceBlock}

${detallesText ? `\nDETALLES ADICIONALES:\n${detallesText}` : ""}

${body.titulo ? `\nTÍTULO SUGERIDO: ${body.titulo}` : ""}

Generá el documento completo, profesional y listo para usar:`;

      const maxTokens = mode === "deep" ? 6000 : 2500;
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: maxTokens
      });

      const documento = response.choices[0]?.message?.content || "No se pudo generar el documento.";

      return rep.send({ 
        documento,
        titulo: body.titulo || "Documento Personalizado"
      });

    } catch (error) {
      app.log.error(error, "Error en /api/generate-custom-document");
      return rep.status(500).send({
        error: "Error al generar documento personalizado",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Chat sobre análisis de documentos legales (contratos, acuerdos, etc.)
  app.post("/api/analysis/chat", async (req, rep) => {
    try {
      const body = z.object({
        analysisText: z.string().optional(),
        messages: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string()
        })),
        areaLegal: z.string().optional(),
        jurisdiccion: z.string().optional(),
        tipoDocumento: z.string().optional(),
        citas: z.array(z.object({
          tipo: z.string(),
          referencia: z.string(),
          descripcion: z.string().optional(),
          url: z.string().optional()
        })).optional(),
        riesgos: z.array(z.object({
          descripcion: z.string(),
          nivel: z.string(),
          recomendacion: z.string().optional()
        })).optional()
      }).parse(req.body);

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return rep.status(500).send({ error: "OPENAI_API_KEY no configurada" });
      }

      const result = await chatAnalysis(openaiKey, body);
      return rep.send(result);

    } catch (error) {
      app.log.error(error, "Error en /api/analysis/chat");
      return rep.status(500).send({
        error: "Error interno en el chat de análisis",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Chat para análisis comparativo
  app.post("/api/compare-chat", async (req, rep) => {
    try {
      const body = z.object({
        comparisonText: z.string().optional(),
        messages: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string()
        })),
        areaLegal: z.string().optional(),
        documentIdA: z.string().optional(),
        documentIdB: z.string().optional(),
      }).parse(req.body);

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return rep.status(500).send({ error: "OPENAI_API_KEY no configurada" });
      }

      const LEGAL_DOCS_URL = process.env.LEGAL_DOCS_URL || "";
      let baseUrl = LEGAL_DOCS_URL.trim();
      if (baseUrl && !baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
        baseUrl = `https://${baseUrl}`;
      }
      baseUrl = baseUrl.replace(/\/$/, "");

      const coerceOriginalText = (original: unknown): string => {
        if (typeof original === "string") {
          const s = original.trim();
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
          const anyObj = original as { text?: string };
          if (typeof anyObj.text === "string") return anyObj.text.trim();
        }
        return "";
      };

      const fetchDocText = async (documentId?: string): Promise<string> => {
        if (!documentId || !baseUrl) return "";
        try {
          const response = await fetch(`${baseUrl}/result/${documentId}`);
          if (!response.ok) return "";
          const data = await response.json();
          const original = data?.analysis?.original;
          return coerceOriginalText(original);
        } catch {
          return "";
        }
      };

      const [documentTextA, documentTextB] = await Promise.all([
        fetchDocText(body.documentIdA),
        fetchDocText(body.documentIdB),
      ]);

      const result = await chatCompare(openaiKey, {
        ...body,
        documentTextA,
        documentTextB,
      });
      return rep.send(result);

    } catch (error) {
      app.log.error(error, "Error en /api/compare-chat");
      return rep.status(500).send({
        error: "Error interno en el chat de comparación",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Análisis comparativo de documentos
  app.post("/api/compare-documents", async (req, rep) => {
    try {
      const body = z.object({
        documentIdA: z.string().min(1),
        documentIdB: z.string().min(1),
        instructions: z.string().optional(),
        additionalInstructions: z.string().optional(),
        areaLegal: z.string().optional(),
      }).parse(req.body);

      const LEGAL_DOCS_URL = process.env.LEGAL_DOCS_URL;
      if (!LEGAL_DOCS_URL) {
        return rep.status(500).send({ error: "LEGAL_DOCS_URL no configurada" });
      }

      // Normalizar URL (agregar protocolo si no tiene)
      let baseUrl = LEGAL_DOCS_URL.trim();
      if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
        baseUrl = `https://${baseUrl}`;
      }
      baseUrl = baseUrl.replace(/\/$/, "");

      // Enviar al servicio legal-docs para procesar la comparación
      const response = await fetch(`${baseUrl}/compare-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIdA: body.documentIdA,
          documentIdB: body.documentIdB,
          instructions: body.instructions,
          additionalInstructions: body.additionalInstructions,
          areaLegal: body.areaLegal || "civil_comercial",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        app.log.error(`Error en legal-docs /compare-documents: ${response.status} - ${errorText}`);
        return rep.status(response.status).send({
          error: `Error al iniciar comparación: ${errorText || response.statusText}`,
        });
      }

      const data = await response.json();
      return rep.send(data);

    } catch (error) {
      app.log.error(error, "Error en /api/compare-documents");
      return rep.status(500).send({
        error: "Error interno en comparación de documentos",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  });

  // Obtener resultado de comparación
  app.get("/api/compare-documents/:comparisonId", async (req, rep) => {
    try {
      const { comparisonId } = req.params as { comparisonId: string };
      const LEGAL_DOCS_URL = process.env.LEGAL_DOCS_URL;
      if (!LEGAL_DOCS_URL) {
        return rep.status(500).send({ error: "LEGAL_DOCS_URL no configurada" });
      }

      // Normalizar URL (agregar protocolo si no tiene)
      let baseUrl = LEGAL_DOCS_URL.trim();
      if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
        baseUrl = `https://${baseUrl}`;
      }
      baseUrl = baseUrl.replace(/\/$/, "");

      const response = await fetch(`${baseUrl}/compare-documents/${comparisonId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return rep.status(response.status).send({
          error: `Error al obtener resultado: ${errorText || response.statusText}`,
        });
      }

      const data = await response.json();
      return rep.send(data);

    } catch (error) {
      app.log.error(error, "Error en /api/compare-documents/:comparisonId");
      return rep.status(500).send({
        error: "Error al obtener resultado de comparación",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  });

  // Generar documento sugerido basado en el análisis
  app.post("/api/generate-suggested-doc", async (req, rep) => {
    // Rate limiting: máximo 20 generaciones por hora por IP
    const clientId = getClientIdentifier(req);
    const rateLimit = checkRateLimit(clientId, 20, 60 * 60 * 1000); // 20 requests por hora
    
    if (!rateLimit.allowed) {
      app.log.warn(`[RATE-LIMIT] Generación bloqueada para ${clientId}`);
      return rep.status(429).send({
        error: "Rate limit exceeded",
        message: "Demasiadas generaciones. Intenta nuevamente más tarde.",
        retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      });
    }
    
    try {
      const body = req.body as {
        tipoDocumento: string;
        descripcion: string;
        contextoAnalisis: string;
        tipoDocumentoAnalizado?: string;
        jurisdiccion?: string;
        areaLegal?: string;
        citas?: Array<{ tipo: string; referencia: string; descripcion?: string; url?: string }>;
        reportData?: any; // Datos completos del reporte para extraer información
      };

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return rep.status(500).send({ error: "OPENAI_API_KEY no configurada" });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: openaiKey });

      const citasText = body.citas?.map(c => `- ${c.referencia}${c.descripcion ? `: ${c.descripcion}` : ""}`).join("\n") || "No hay citas disponibles";

      // Paso 1: Extraer datos estructurados del análisis
      const extractResponse = await openai.chat.completions.create({
        model: "gpt-4o", // Modelo más potente para extracción precisa de datos
        temperature: 0.1, // Muy baja temperatura para máxima precisión
        max_tokens: 3000, // Más tokens para extraer más datos
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Sos un asistente legal experto en extraer información estructurada de documentos legales.
Tu tarea es analizar un documento y extraer todos los datos relevantes en formato JSON.

IMPORTANTE:
- Si un dato NO está presente en el análisis, devolvé null o una cadena vacía
- NO inventes datos que no estén en el análisis
- Extraé solo información explícita o claramente inferible`
          },
          {
            role: "user",
            content: `Analizá el siguiente documento legal y extraé TODOS los datos relevantes en formato JSON.

ANÁLISIS DEL DOCUMENTO:
${body.contextoAnalisis.substring(0, 8000)}

IMPORTANTE: Extraé TODOS los datos que encuentres, incluyendo:
- Información de las partes (nombres completos, razones sociales, roles)
- Fechas (del documento, de inicio, de fin, plazos)
- Montos y valores (con moneda)
- Lugares y jurisdicciones
- Objetos y descripciones
- Condiciones, términos y cláusulas especiales
- Domicilios, CUIT/CUIL, datos de identificación
- Garantías, penalidades, sanciones
- Cualquier otro dato relevante mencionado

Extraé estos campos (si están disponibles, usa null si no están):
{
  "partes": ["nombre completo de parte 1", "nombre completo de parte 2"],
  "roles_partes": ["rol de parte 1 (ej: proveedor, cliente, comitente)", "rol de parte 2"],
  "fecha_documento": "DD/MM/YYYY o null",
  "lugar": "ciudad, provincia o null",
  "monto": "monto numérico o null",
  "moneda": "ARS, USD, EUR, etc. o null",
  "plazo": "duración o plazo mencionado (ej: 36 meses, 1 año) o null",
  "objeto": "objeto completo del contrato/documento o null",
  "condiciones_especiales": ["condición detallada 1", "condición detallada 2"],
  "jurisdiccion": "jurisdicción mencionada (ej: CABA, Provincia de Buenos Aires) o null",
  "domicilios": ["domicilio completo parte 1", "domicilio completo parte 2"],
  "cuit_cuil": ["CUIT/CUIL parte 1", "CUIT/CUIL parte 2"],
  "fecha_inicio": "fecha de inicio DD/MM/YYYY o null",
  "fecha_fin": "fecha de fin DD/MM/YYYY o null",
  "garantias": ["garantía detallada 1", "garantía detallada 2"],
  "penalidades": ["penalidad detallada 1", "penalidad detallada 2"],
  "formas_pago": ["forma de pago 1", "forma de pago 2"],
  "obligaciones_especificas": ["obligación específica 1", "obligación específica 2"],
  "derechos_especificos": ["derecho específico 1", "derecho específico 2"],
  "prohibiciones": ["prohibición 1", "prohibición 2"],
  "otros_datos": {}
}

Devuelve SOLO el JSON válido, sin texto adicional.`
          }
        ]
      });

      let datosExtraidos: Record<string, any> = {};
      try {
        const extractContent = extractResponse.choices[0]?.message?.content || "{}";
        datosExtraidos = JSON.parse(extractContent);
      } catch (e) {
        app.log.warn("Error parseando datos extraídos, continuando con datos vacíos");
        datosExtraidos = {};
      }

      // Paso 2: Generar el documento usando los datos extraídos
      const fechaActual = new Date().toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      // Construir contexto de datos disponibles
      const datosDisponibles = [];
      if (datosExtraidos.partes && Array.isArray(datosExtraidos.partes) && datosExtraidos.partes.length > 0) {
        datosDisponibles.push(`PARTES: ${datosExtraidos.partes.join(", ")}`);
      }
      if (datosExtraidos.fecha_documento) {
        datosDisponibles.push(`FECHA DEL DOCUMENTO: ${datosExtraidos.fecha_documento}`);
      }
      if (datosExtraidos.lugar) {
        datosDisponibles.push(`LUGAR: ${datosExtraidos.lugar}`);
      }
      if (datosExtraidos.monto) {
        datosDisponibles.push(`MONTO: ${datosExtraidos.monto} ${datosExtraidos.moneda || "ARS"}`);
      }
      if (datosExtraidos.plazo) {
        datosDisponibles.push(`PLAZO: ${datosExtraidos.plazo}`);
      }
      if (datosExtraidos.objeto) {
        datosDisponibles.push(`OBJETO: ${datosExtraidos.objeto}`);
      }
      if (datosDisponibles.length === 0) {
        datosDisponibles.push("No se encontraron datos específicos en el análisis.");
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Modelo más potente para documentos legales profesionales
        temperature: 0.2, // Menor temperatura para mayor precisión y consistencia
        max_tokens: 8000, // Más tokens para documentos completos y detallados
        messages: [
          {
            role: "system",
            content: `Sos un abogado argentino senior de WNS & Asociados con más de 15 años de experiencia en derecho ${body.areaLegal || "civil y comercial"}.

Tu tarea es redactar documentos legales profesionales, completos y listos para usar, basados en el análisis de un documento previo.

═══════════════════════════════════════════════════════════════════════════════
1. IDENTIDAD Y ESTILO
═══════════════════════════════════════════════════════════════════════════════

- Actuás como un abogado argentino real, no como un asistente genérico.
- Trabajás para WNS & Asociados, estudio jurídico integral.
- Usás lenguaje jurídico formal, preciso y profesional según la práctica jurídica argentina.
- El documento debe estar completo, profesional y listo para revisión, no un borrador básico.

═══════════════════════════════════════════════════════════════════════════════
2. REGLAS CRÍTICAS DE REDACCIÓN
═══════════════════════════════════════════════════════════════════════════════

- Redactá en español argentino formal y jurídico.
- Usá formato profesional de documento legal con estructura completa.
- INCLUÍ TODOS los datos disponibles del análisis de forma precisa.
- Para datos que NO están disponibles en el análisis, usá EXACTAMENTE "XXXXXX" como placeholder.
- NO inventes datos que no estén en el análisis.
- El documento debe ser COMPLETO y PROFESIONAL, no un esqueleto básico.
- Citá normativa relevante cuando sea apropiado (CCyC, leyes especiales, etc.).
- Incluí fecha actual si no hay fecha del documento: ${fechaActual}
- Usá numeración de cláusulas estándar (PRIMERA, SEGUNDA, TERCERA, etc. o 1., 2., 3., etc.).

═══════════════════════════════════════════════════════════════════════════════
3. ESTRUCTURA DEL DOCUMENTO
═══════════════════════════════════════════════════════════════════════════════

El documento debe incluir:

ENCABEZADO:
- Nombre del estudio: "WNS & ASOCIADOS"
- Tipo de documento (${body.tipoDocumento})
- Lugar y fecha (usar fecha actual si no hay fecha del documento: ${fechaActual})
- Identificación de las partes (usar datos del análisis o XXXXXX si faltan)

CUERPO PRINCIPAL:
- Preámbulo o considerandos (contexto y antecedentes)
- Cláusulas numeradas con contenido completo y detallado
- Todas las cláusulas estándar según el tipo de documento:
  * Para contratos: objeto, obligaciones de las partes, plazo/duración, precio/consideración, forma de pago, garantías, penalidades, rescisión, mora, jurisdicción, domicilios constituidos, etc.
  * Para dictámenes: antecedentes, análisis jurídico, fundamentos legales, conclusiones, recomendaciones
  * Para escritos judiciales: hechos, derecho aplicable, fundamentos, petitorio
- Referencias a normativa aplicable cuando corresponda

CIERRE:
- Firma de las partes (si corresponde)
- Testigos (si corresponde)
- Aclaraciones o anexos (si corresponde)

═══════════════════════════════════════════════════════════════════════════════
4. FORMATO DE PLACEHOLDERS
═══════════════════════════════════════════════════════════════════════════════

- Si falta el nombre de una parte: "XXXXXX"
- Si falta una fecha: "XXXXXX"
- Si falta un monto: "XXXXXX"
- Si falta un lugar: "XXXXXX"
- Si falta cualquier otro dato específico: "XXXXXX"
- NO uses placeholders para estructura o cláusulas estándar (esas deben estar completas)

═══════════════════════════════════════════════════════════════════════════════
5. NORMATIVA Y REFERENCIAS LEGALES
═══════════════════════════════════════════════════════════════════════════════

- Referenciá normativa relevante según el tipo de documento y área legal:
  * CCyC (Código Civil y Comercial de la Nación)
  * Leyes especiales aplicables
  * Jurisprudencia relevante (si está disponible en las citas)
  * Doctrina (si está disponible en las citas)
- Cuando cites normas, hacelo de forma precisa (artículo, inciso, etc.)
- Si no estás seguro de una cita, indicá "sujeto a verificación de normativa vigente"

═══════════════════════════════════════════════════════════════════════════════
6. CONTEXTO ESPECÍFICO
═══════════════════════════════════════════════════════════════════════════════

- Documento analizado: ${body.tipoDocumentoAnalizado || "No especificado"}
- Jurisdicción: ${body.jurisdiccion || "Nacional"}
- Área legal: ${body.areaLegal || "Civil y Comercial"}

CITAS LEGALES DISPONIBLES:
${citasText}

═══════════════════════════════════════════════════════════════════════════════
7. CALIDAD Y COMPLETITUD
═══════════════════════════════════════════════════════════════════════════════

- El documento debe ser COMPLETO, no un borrador básico.
- Incluí todas las cláusulas necesarias según el tipo de documento.
- Desarrollá cada cláusula con suficiente detalle y precisión.
- El documento debe estar listo para revisión profesional, no para completar estructura básica.
- Usá terminología jurídica apropiada y precisa.
- Mantené coherencia en el estilo y formato a lo largo de todo el documento.`
          },
          {
            role: "user",
            content: `Basándote en el siguiente análisis de documento, redactá un "${body.tipoDocumento}" completo, profesional y detallado.

MOTIVO Y CONTEXTO:
${body.descripcion}

DATOS DISPONIBLES DEL ANÁLISIS (usar estos datos cuando estén disponibles):
${datosDisponibles.join("\n")}

ANÁLISIS COMPLETO DEL DOCUMENTO ORIGINAL:
${body.contextoAnalisis.substring(0, 6000)}

INSTRUCCIONES ESPECÍFICAS:
1. Usá TODOS los datos disponibles del análisis de forma precisa y completa.
2. Para cualquier dato específico que NO esté disponible (nombres, fechas, montos, lugares, etc.), usá "XXXXXX" como placeholder.
3. Generá el documento COMPLETO, PROFESIONAL y DETALLADO, no un borrador básico.
4. El documento debe tener formato legal estándar con:
   - Encabezado completo con identificación de partes
   - Preámbulo o considerandos
   - Cláusulas numeradas y desarrolladas en detalle
   - Todas las cláusulas estándar según el tipo de documento
   - Referencias a normativa aplicable
   - Cierre apropiado
5. Incluí todas las secciones y cláusulas necesarias según el tipo de documento "${body.tipoDocumento}".
6. Desarrollá cada cláusula con suficiente detalle y precisión jurídica.
7. El documento debe estar listo para revisión profesional, con estructura completa y contenido desarrollado.

Generá el documento "${body.tipoDocumento}" completo y profesional:`
          }
        ]
      });

      let documento = response.choices[0]?.message?.content || "No se pudo generar el documento.";

      // Identificar y marcar los placeholders para facilitar su edición posterior
      const placeholders = documento.match(/XXXXXX/g) || [];
      
      return rep.send({ 
        documento,
        datosExtraidos,
        placeholdersCount: placeholders.length,
        tienePlaceholders: placeholders.length > 0
      });

    } catch (error) {
      app.log.error(error, "Error en /api/generate-suggested-doc");
      return rep.status(500).send({
        error: "Error al generar documento",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Generar documento legal desde plantilla con campos completados
  app.post("/api/generate-from-template", async (req, rep) => {
    try {
      const body = req.body as {
        templateId: string;
        templateName: string;
        campos: Record<string, string>;
      };

      const { templateId, templateName, campos } = body;

      if (!templateId || !templateName || !campos) {
        return rep.status(400).send({ error: "Faltan datos requeridos: templateId, templateName, campos" });
      }

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return rep.status(500).send({ error: "OPENAI_API_KEY no configurada" });
      }

      // Construir el prompt con los datos del formulario
      const camposFormateados = Object.entries(campos)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n");

      const systemPrompt = `Eres un abogado argentino experto en redacción de documentos legales. 
Tu tarea es generar un documento legal completo, profesional y listo para usar.

REGLAS IMPORTANTES:
1. El documento debe estar en español argentino formal y legal
2. Debe incluir todas las cláusulas estándar para este tipo de documento según la legislación argentina vigente
3. Debe ser completo y profesional, no un borrador
4. Incluir lugar y fecha al inicio
5. Incluir espacio para firmas al final
6. Usar terminología jurídica apropiada
7. Referenciar artículos del Código Civil y Comercial de la Nación u otras leyes aplicables cuando corresponda
8. Incluir cláusulas de jurisdicción y domicilios constituidos
9. Para contratos: incluir cláusulas de rescisión, mora, y resolución de conflictos`;

      const userPrompt = `Generá un "${templateName}" completo con los siguientes datos:

${camposFormateados}

El documento debe:
1. Estar completo y listo para firmar
2. Incluir todas las cláusulas legales necesarias según el tipo de documento
3. Ser profesional y formalmente correcto
4. Incluir referencias a la normativa aplicable (CCyCN, leyes especiales, etc.)
5. Tener formato adecuado con numeración de cláusulas

Generá el documento completo:`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        app.log.error(`Error de OpenAI: ${errorText}`);
        throw new Error(`Error de OpenAI: ${response.status}`);
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      const documento = data.choices[0]?.message?.content || "No se pudo generar el documento.";

      return rep.send({ documento });

    } catch (error) {
      app.log.error(error, "Error en /api/generate-from-template");
      return rep.status(500).send({
        error: "Error al generar documento desde plantilla",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Sugerir templates según el contenido del memo (con validación por IA)
  app.post("/api/templates/suggest", async (req, rep) => {
    try {
      const body = req.body as {
        areaLegal?: string;
        tipoDocumento?: string;
        resumen?: string;
        puntos_tratados?: string[];
        analisis_juridico?: string;
      };

      const area = (body.areaLegal || "civil_comercial") as LegalTemplate["areaLegal"];
      const tipo = (body.tipoDocumento || "dictamen") as LegalTemplate["tipoDocumento"];
      const texto = 
        (body.resumen || "") + 
        " " + 
        (body.analisis_juridico || "") + 
        " " + 
        (body.puntos_tratados || []).join(" ");

      // 1) Filtrar por área legal
      let candidatos = LEGAL_TEMPLATES.filter(t => t.areaLegal === area);

      // Si no hay candidatos para esa área, buscar en civil_comercial como fallback
      if (candidatos.length === 0) {
        candidatos = LEGAL_TEMPLATES.filter(t => t.areaLegal === "civil_comercial");
      }

      // 2) Priorizar por tipoDocumento
      candidatos = candidatos.sort((a, b) => {
        const puntaje = (t: LegalTemplate) => (t.tipoDocumento === tipo ? 2 : 0);
        return puntaje(b) - puntaje(a);
      });

      // 3) Scoring por tags (muy simple por ahora)
      const textoLower = texto.toLowerCase();
      candidatos = candidatos.sort((a, b) => {
        const score = (t: LegalTemplate) =>
          (t.tags || []).reduce(
            (acc, tag) => (textoLower.includes(tag.toLowerCase()) ? acc + 1 : acc),
            0
          );
        return score(b) - score(a);
      });

      // 4) Validar con IA que los templates sean apropiados (si hay OpenAI key)
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey && texto.trim().length > 50) {
        try {
          const OpenAI = (await import("openai")).default;
          const openai = new OpenAI({ apiKey: openaiKey });
          
          // Tomar los 5 mejores candidatos para validar
          const topCandidates = candidatos.slice(0, 5);
          
          const validationPrompt = `Eres un asistente jurídico experto. Analiza el siguiente memo y evalúa qué templates de documentos son más apropiados.

MEMO:
Área Legal: ${area}
Tipo de Documento: ${tipo}
Resumen: ${body.resumen || ""}
Análisis Jurídico: ${body.analisis_juridico?.substring(0, 500) || ""}
Puntos Tratados: ${body.puntos_tratados?.join(", ") || ""}

TEMPLATES CANDIDATOS:
${topCandidates.map((t, i) => `${i + 1}. ${t.nombre} (${t.tipoDocumento}) - ${t.descripcion || ""} - Tags: ${t.tags?.join(", ") || ""}`).join("\n")}

Evalúa cada template del 1 al 5 en términos de relevancia para este memo específico.
Responde SOLO con un JSON válido con esta estructura:
{
  "scores": {
    "1": <número del 1 al 5>,
    "2": <número del 1 al 5>,
    "3": <número del 1 al 5>,
    "4": <número del 1 al 5>,
    "5": <número del 1 al 5>
  },
  "reasoning": "Breve explicación de por qué estos templates son apropiados o no"
}`;

          const validationResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3,
            messages: [
              {
                role: "system",
                content: "Eres un asistente jurídico que evalúa la relevancia de templates de documentos legales. Responde SOLO con JSON válido."
              },
              {
                role: "user",
                content: validationPrompt
              }
            ],
            response_format: { type: "json_object" }
          });

          const validationContent = validationResponse.choices[0]?.message?.content;
          if (validationContent) {
            try {
              const validationData = JSON.parse(validationContent);
              if (validationData.scores) {
                // Reordenar candidatos según los scores de IA
                const scoredCandidates = topCandidates.map((t, i) => ({
                  template: t,
                  score: validationData.scores[String(i + 1)] || 0,
                  originalIndex: i
                }));
                
                scoredCandidates.sort((a, b) => b.score - a.score);
                
                app.log.info(`[TEMPLATE SUGGEST] Validación IA completada. Reasoning: ${validationData.reasoning || "N/A"}`);
                
                // Reconstruir lista de candidatos con los validados primero
                const validatedIds = new Set(scoredCandidates.map(sc => sc.template.id));
                candidatos = [
                  ...scoredCandidates.map(sc => sc.template),
                  ...candidatos.filter(t => !validatedIds.has(t.id))
                ];
              }
            } catch (parseError) {
              app.log.warn(`Error al parsear validación de IA, usando scoring original: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }
          }
        } catch (aiError) {
          app.log.warn(`Error en validación por IA, usando scoring original: ${aiError instanceof Error ? aiError.message : String(aiError)}`);
          // Continuar con el scoring original si falla la IA
        }
      }

      // Tomar los 3 mejores
      const sugeridos = candidatos.slice(0, 3).map(t => ({
        id: t.id,
        nombre: t.nombre,
        descripcion: t.descripcion,
        tipoDocumento: t.tipoDocumento,
      }));

      return rep.send({ sugeridos });

    } catch (error) {
      app.log.error(error, "Error en /api/templates/suggest");
      return rep.status(500).send({ 
        error: "Error al sugerir templates",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Descargar template por ID (rellenado con datos del memo)
  app.post("/api/templates/:id/download", async (req, rep) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as { memoData?: MemoOutput };
      
      app.log.info(`[TEMPLATE DOWNLOAD] Request recibido para templateId: ${id}`);
      app.log.info(`[TEMPLATE DOWNLOAD] Tiene datos del memo: ${!!body.memoData}`);
      
      const template = findTemplateById(id);

      if (!template) {
        app.log.warn(`[TEMPLATE DOWNLOAD] Template no encontrado en registro: ${id}`);
        return rep.status(404).send({ error: "Template no encontrado" });
      }

      const filePath = getTemplateAbsolutePath(template);
      
      // Verificar que el archivo existe
      if (!existsSync(filePath)) {
        app.log.error(`[TEMPLATE DOWNLOAD] Archivo template no existe en: ${filePath}`);
        return rep.status(404).send({ 
          error: "Archivo template no encontrado",
          path: template.rutaRelativa,
          absolutePath: filePath
        });
      }

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return rep.status(500).send({ error: "OPENAI_API_KEY no configurada" });
      }

      // Si hay datos del memo, rellenar el template
      if (body.memoData) {
        app.log.info(`[TEMPLATE DOWNLOAD] Rellenando template con datos del memo...`);
        try {
          const filledBuffer = await fillTemplateWithMemoData(
            filePath,
            body.memoData,
            id,
            openaiKey
          );

          const filename = `${template.nombre.replace(/\s+/g, "_")}_rellenado.docx`;
          
          rep.header("Content-Type", "application/octet-stream");
          rep.header("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
          rep.header("X-Content-Type-Options", "nosniff");
          rep.header("Cache-Control", "no-cache");

          return rep.send(filledBuffer);
        } catch (fillError) {
          app.log.error(fillError, "Error al rellenar template, enviando template vacío");
          // Si falla el rellenado, enviar template vacío como fallback
        }
      }

      // Si no hay datos del memo o falló el rellenado, enviar template vacío
      app.log.info(`[TEMPLATE DOWNLOAD] Enviando template sin rellenar...`);
      const stream = createReadStream(filePath);

      const filename = `${template.nombre.replace(/\s+/g, "_")}.docx`;
      
      rep.header("Content-Type", "application/octet-stream");
      rep.header("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      rep.header("X-Content-Type-Options", "nosniff");
      rep.header("Cache-Control", "no-cache");

      return rep.send(stream);

    } catch (error) {
      app.log.error(error, "Error al descargar template");
      return rep.status(500).send({ 
        error: "Error al descargar template",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Preview de template (convierte .docx a HTML, opcionalmente rellenado con datos del memo)
  app.post("/api/templates/:id/preview", async (req, rep) => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as { memoData?: MemoOutput };
      
      app.log.info(`[TEMPLATE PREVIEW] Request recibido para templateId: ${id}`);
      app.log.info(`[TEMPLATE PREVIEW] Tiene datos del memo: ${!!body.memoData}`);
      
      const template = findTemplateById(id);

      if (!template) {
        app.log.warn(`[TEMPLATE PREVIEW] Template no encontrado en registro: ${id}`);
        return rep.status(404).send({ error: "Template no encontrado" });
      }

      const filePath = getTemplateAbsolutePath(template);
      app.log.info(`[TEMPLATE PREVIEW] Template encontrado: ${template.nombre}`);
      app.log.info(`[TEMPLATE PREVIEW] Ruta relativa: ${template.rutaRelativa}`);
      app.log.info(`[TEMPLATE PREVIEW] Ruta absoluta: ${filePath}`);
      app.log.info(`[TEMPLATE PREVIEW] process.cwd(): ${process.cwd()}`);

      // Verificar que el archivo existe
      let finalPath = filePath;
      if (!existsSync(filePath)) {
        app.log.error(`[TEMPLATE PREVIEW] Archivo template no existe en: ${filePath}`);
        
        // Intentar rutas alternativas
        const cwd = process.cwd();
        const altPaths = [
          join(cwd, "api", "templates", template.rutaRelativa),
          join(cwd, "templates", template.rutaRelativa),
          join(__dirname, "..", "templates", template.rutaRelativa),
          join(__dirname, "..", "..", "api", "templates", template.rutaRelativa),
        ];
        
        for (const altPath of altPaths) {
          if (existsSync(altPath)) {
            app.log.info(`[TEMPLATE PREVIEW] Usando ruta alternativa: ${altPath}`);
            finalPath = altPath;
            break;
          }
        }
        
        if (!existsSync(finalPath)) {
          return rep.status(404).send({ 
            error: "Archivo template no encontrado",
            path: template.rutaRelativa,
            absolutePath: filePath,
            cwd: process.cwd()
          });
        }
      }

      let buffer: Buffer;
      const openaiKey = process.env.OPENAI_API_KEY;

      // Si hay datos del memo y tenemos OpenAI key, rellenar el template
      if (body.memoData && openaiKey) {
        app.log.info(`[TEMPLATE PREVIEW] Rellenando template con datos del memo...`);
        try {
          buffer = await fillTemplateWithMemoData(
            finalPath,
            body.memoData,
            id,
            openaiKey
          );
          app.log.info(`[TEMPLATE PREVIEW] Template rellenado exitosamente`);
        } catch (fillError) {
          app.log.error(fillError, "Error al rellenar template, usando template vacío");
          // Si falla el rellenado, usar template vacío
          buffer = await readFile(finalPath);
        }
      } else {
        // Sin datos del memo, usar template vacío
        app.log.info(`[TEMPLATE PREVIEW] Usando template sin rellenar...`);
        buffer = await readFile(finalPath);
      }

      // Convertir a HTML para preview
      app.log.info(`[TEMPLATE PREVIEW] Convirtiendo a HTML...`);
      const { value: html } = await mammoth.convertToHtml({ buffer });

      return rep.send({ 
        html, 
        nombre: template.nombre,
        descripcion: template.descripcion 
      });

    } catch (error) {
      app.log.error(error, "Error al generar preview del template");
      return rep.status(500).send({ 
        error: "Error al generar preview",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Endpoint legacy para compatibilidad (mantener por ahora)
  app.get("/api/memos/:memoId/documents/:docId/download", async (req, rep) => {
    try {
      const { docId } = req.params as { memoId: string; docId: string };
      const template = findTemplateById(docId);

      if (!template) {
        return rep.status(404).send({ error: "Documento no encontrado" });
      }

      const filePath = getTemplateAbsolutePath(template);

      if (!existsSync(filePath)) {
        return rep.status(404).send({ error: "Template no encontrado" });
      }

      const stream = createReadStream(filePath);

      const filename = `${template.nombre.replace(/\s+/g, "_")}.docx`;
      
      rep.header("Content-Type", "application/octet-stream");
      rep.header("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      rep.header("X-Content-Type-Options", "nosniff");
      rep.header("Cache-Control", "no-cache");

      return rep.send(stream);

    } catch (error) {
      app.log.error(error, "Error al descargar documento sugerido");
      return rep.status(500).send({ 
        error: "Error al descargar documento",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Endpoint para convertir contenido a Word (.docx)
  app.post("/api/convert-to-word", async (req, rep) => {
    try {
      const body = req.body as { content: string; title?: string };
      
      if (!body.content) {
        return rep.status(400).send({ error: "Se requiere el campo 'content'" });
      }

      const title = body.title || "Documento";
      const wordBuffer = await convertToWord(body.content, title);
      
      const filename = `${title.replace(/[^a-z0-9\-\_\ ]/gi, "_")}.docx`;
      
      // Asegurar que el buffer es válido
      if (!wordBuffer || wordBuffer.length === 0) {
        return rep.status(500).send({ error: "Error al generar el documento Word" });
      }

      rep.type("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      rep.header("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      rep.header("X-Content-Type-Options", "nosniff");
      rep.header("Cache-Control", "no-cache");

      // Enviar el buffer como respuesta binaria
      return rep.send(Buffer.from(wordBuffer));

    } catch (error) {
      app.log.error(error, "Error al convertir a Word");
      return rep.status(500).send({ 
        error: "Error al convertir a Word",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Endpoints para gestión de bases de conocimiento
  app.get("/api/knowledge-bases", async (req, rep) => {
    try {
    const kbs = await knowledgeBases.listKnowledgeBases(process.env.DATABASE_URL!);
    return rep.send({ knowledgeBases: kbs });
    } catch (error) {
      app.log.error(error, "Error al listar knowledge bases");
      // Si la tabla no existe, retornar array vacío en vez de error 500
      if (error instanceof Error && error.message.includes("does not exist")) {
        app.log.warn("Tabla knowledge_bases no existe, retornando array vacío");
        return rep.send({ knowledgeBases: [] });
      }
      return rep.status(500).send({ 
        error: "Error al obtener bases de conocimiento",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  app.get("/api/knowledge-bases/:id", async (req, rep) => {
    try {
    const { id } = req.params as { id: string };
    const kb = await knowledgeBases.getKnowledgeBase(process.env.DATABASE_URL!, id);
    if (!kb) {
      return rep.status(404).send({ error: "Base de conocimiento no encontrada" });
    }
    const stats = await knowledgeBases.getKnowledgeBaseStats(process.env.DATABASE_URL!, id);
    return rep.send({ ...kb, stats });
    } catch (error) {
      app.log.error(error, "Error al obtener knowledge base");
      // ✅ Si la tabla no existe, devolver 404 (no crashear)
      if (error instanceof Error && error.message.includes("does not exist")) {
        return rep.status(404).send({ error: "Base de conocimiento no encontrada" });
      }
      return rep.status(500).send({ 
        error: "Error al obtener base de conocimiento",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  app.post("/api/knowledge-bases", async (req, rep) => {
    try {
    const body = z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      sourceType: z.string(),
      enabled: z.boolean().optional(),
      metadata: z.record(z.any()).optional()
    }).parse(req.body);

    const kbData: Omit<knowledgeBases.KnowledgeBase, "createdAt" | "updatedAt"> = {
      id: body.id,
      name: body.name,
      description: body.description,
      sourceType: body.sourceType,
      enabled: body.enabled ?? true,  // Default true si no se especifica
      metadata: body.metadata ?? {}
    };

    const kb = await knowledgeBases.upsertKnowledgeBase(process.env.DATABASE_URL!, kbData);
    return rep.send(kb);
    } catch (error) {
      app.log.error(error, "Error al crear/actualizar knowledge base");
      // ✅ Si la tabla no existe, devolver error claro (no crashear)
      if (error instanceof Error && error.message.includes("does not exist")) {
        return rep.status(500).send({ 
          error: "Tabla knowledge_bases no existe",
          message: "Ejecuta la migración sql/002_add_knowledge_bases.sql en Railway"
        });
      }
      return rep.status(500).send({ 
        error: "Error al crear/actualizar base de conocimiento",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  app.patch("/api/knowledge-bases/:id/toggle", async (req, rep) => {
    try {
    const { id } = req.params as { id: string };
    const body = z.object({
      enabled: z.boolean()
    }).parse(req.body);

    await knowledgeBases.toggleKnowledgeBase(process.env.DATABASE_URL!, id, body.enabled);
    return rep.send({ ok: true });
    } catch (error) {
      app.log.error(error, "Error al toggle knowledge base");
      // ✅ Si la tabla no existe, devolver error claro (no crashear)
      if (error instanceof Error && error.message.includes("does not exist")) {
        return rep.status(500).send({ 
          error: "Tabla knowledge_bases no existe",
          message: "Ejecuta la migración sql/002_add_knowledge_bases.sql en Railway"
        });
      }
      return rep.status(500).send({ 
        error: "Error al habilitar/deshabilitar base de conocimiento",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Endpoint para scrapear URLs y guardarlas en base de conocimiento
  app.post("/api/scrape-urls", async (req, rep) => {
    try {
      const body = z.object({
        urls: z.array(z.string().url()),
        knowledgeBaseId: z.string().min(1),
        sourceType: z.string().optional().default("normativa")
      }).parse(req.body);

      const result = await scrapeAndIngestUrls(
        process.env.DATABASE_URL!,
        process.env.OPENAI_API_KEY!,
        body.urls,
        body.knowledgeBaseId,
        body.sourceType
      );

      return rep.send({
        ok: true,
        success: result.success,
        failed: result.failed,
        results: result.results
      });
    } catch (error) {
      app.log.error(error, "Error en /api/scrape-urls");
      return rep.status(500).send({
        error: "Error al scrapear URLs",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Endpoint para scrapear una sola URL (sin guardar, solo para probar)
  app.post("/api/scrape-url", async (req, rep) => {
    try {
      const body = z.object({
        url: z.string().url()
      }).parse(req.body);

      const result = await scrapeUrl(body.url);
      return rep.send(result);
    } catch (error) {
      app.log.error(error, "Error en /api/scrape-url");
      return rep.status(500).send({
        error: "Error al scrapear URL",
        message: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  });

  // Log de endpoints registrados
  app.log.info("Endpoints registrados:");
  app.log.info("  GET  /health");
  app.log.info("  POST /v1/generate");
  app.log.info("  POST /v1/ingest");
  app.log.info("  POST /v1/query");
  app.log.info("  GET  /api/knowledge-bases");
  app.log.info("  GET  /api/knowledge-bases/:id");
  app.log.info("  POST /api/knowledge-bases");
  app.log.info("  PATCH /api/knowledge-bases/:id/toggle");
  app.log.info("  POST /api/scrape-urls");
  app.log.info("  POST /api/scrape-url");
  app.log.info("  POST /api/memos/generate");
  app.log.info("  POST /api/memos/extract-text");
  app.log.info("  POST /api/memos/query");
  app.log.info("  POST /api/memos/chat");
  
  // Endpoint directo para upload de documentos legales (sin proxy, funciona como /api/memos/generate)
  app.post("/legal/upload", async (req, rep) => {
    // Rate limiting: máximo 10 uploads por minuto por IP
    const clientId = getClientIdentifier(req);
    const rateLimit = checkRateLimit(clientId, 10, 60 * 1000); // 10 requests por minuto
    
    if (!rateLimit.allowed) {
      app.log.warn(`[RATE-LIMIT] Upload bloqueado para ${clientId}`);
      return rep.status(429).send({
        error: "Rate limit exceeded",
        message: "Demasiados uploads. Intenta nuevamente en unos momentos.",
        retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      });
    }
    
    let documentId: string | null = null;
    let storagePath: string | null = null;
    
    try {
      app.log.info(`[UPLOAD] POST /legal/upload recibido (${rateLimit.remaining} requests restantes)`);
      
      if (!req.isMultipart()) {
        return rep.status(400).send({ error: "Se requiere multipart/form-data" });
      }

      let fileBuffer: Buffer | null = null;
      let filename: string | null = null;
      let mimetype: string | null = null;

      // 🔍 Leer stream con manejo de errores explícito para ERR_STREAM_PREMATURE_CLOSE
      try {
        app.log.info("[UPLOAD] Leyendo partes del multipart...");
        for await (const part of req.parts()) {
          if (part.type === "file" && part.fieldname === "file") {
            app.log.info(`[UPLOAD] Part encontrada: ${part.filename}, fieldname: ${part.fieldname}`);
            
            // ⚠️ CRÍTICO: Leer buffer completo antes de continuar
            // Si el stream se corta aquí, capturamos el error
            fileBuffer = await part.toBuffer();
            filename = part.filename || "document.pdf";
            mimetype = part.mimetype || "application/pdf";
            app.log.info(`[UPLOAD] Archivo leído: ${filename}, tamaño: ${fileBuffer.length} bytes`);
            break;
          }
        }
      } catch (streamError: any) {
        app.log.error(`[UPLOAD] Error leyendo stream: ${streamError?.code} - ${streamError?.message}`);
        if (streamError?.code === "ERR_STREAM_PREMATURE_CLOSE" || streamError?.message?.includes("Premature close")) {
          return rep.status(400).send({ 
            error: "Upload interrumpido",
            message: "El archivo se cortó durante la subida. Por favor, intentá nuevamente con un archivo más pequeño o verifica tu conexión.",
            code: "ERR_STREAM_PREMATURE_CLOSE"
          });
        }
        throw streamError; // Re-throw otros errores
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        app.log.warn("[UPLOAD] No se proporcionó archivo o archivo vacío");
        return rep.status(400).send({ error: "No se proporcionó archivo o el archivo está vacío" });
      }

      // Generar documentId ANTES de guardar (para poder limpiar si falla)
      const { randomUUID } = await import("crypto");
      documentId = randomUUID();
      
      const safeFilename = filename || "document.pdf";
      const safeMimetype = mimetype || "application/pdf";
      
      // Guardar archivo en disco (igual que legal-docs)
      const STORAGE_DIR = process.env.STORAGE_DIR || "./storage";
      const { writeFileSync, mkdirSync, existsSync, unlinkSync } = await import("fs");
      const { stat } = await import("fs/promises");
      
      if (!existsSync(STORAGE_DIR)) {
        mkdirSync(STORAGE_DIR, { recursive: true });
      }
      
      const fileExtension = safeFilename.split(".").pop() || "bin";
      storagePath = join(STORAGE_DIR, `${documentId}.${fileExtension}`);
      
      app.log.info(`[UPLOAD] Guardando archivo en disco: ${storagePath}`);
      writeFileSync(storagePath, fileBuffer);
      
      // ✅ VALIDAR que el archivo se guardó correctamente
      if (!existsSync(storagePath)) {
        app.log.error(`[UPLOAD] Archivo NO se guardó en disco: ${storagePath}`);
        throw new Error("No se pudo guardar el archivo en disco");
      }
      
      const stats = await stat(storagePath);
      if (stats.size !== fileBuffer.length) {
        app.log.error(`[UPLOAD] Tamaño del archivo guardado no coincide: esperado ${fileBuffer.length}, guardado ${stats.size}`);
        // Limpiar archivo corrupto
        try { unlinkSync(storagePath); } catch {}
        throw new Error("El archivo guardado está corrupto");
      }
      
      app.log.info(`[UPLOAD] Archivo guardado correctamente: ${storagePath} (${stats.size} bytes)`);
      
      // Guardar metadata en DB (tabla legal_documents)
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      
      try {
        // Crear tabla si no existe
        await client.query(`
          CREATE TABLE IF NOT EXISTS legal_documents (
            id VARCHAR(255) PRIMARY KEY,
            filename VARCHAR(500) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            raw_path TEXT NOT NULL,
            status VARCHAR(50) DEFAULT 'uploaded',
            progress INTEGER DEFAULT 0,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        
        // Guardar metadata con path real al archivo en disco
        await client.query(
          `INSERT INTO legal_documents (id, filename, mime_type, raw_path, status, progress, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'uploaded', 0, NOW(), NOW())
           RETURNING id`,
          [documentId, safeFilename, safeMimetype, storagePath]
        );
        app.log.info(`[UPLOAD] Documento guardado en DB, documentId: ${documentId}`);
        
        // ✅ SOLO devolver documentId si TODO salió bien
        return rep.send({ documentId });
      } catch (dbError) {
        app.log.error(`[UPLOAD] Error guardando en DB: ${dbError}`);
        // Limpiar archivo si falla la DB
        if (storagePath && existsSync(storagePath)) {
          try { unlinkSync(storagePath); } catch {}
        }
        throw dbError;
      } finally {
        await client.end();
      }
    } catch (error: any) {
      app.log.error(`[UPLOAD] Error en /legal/upload: ${error?.code} - ${error?.message}`);
      
      // Limpiar archivo si existe pero falló algo
      if (storagePath) {
        const { existsSync, unlinkSync } = await import("fs");
        if (existsSync(storagePath)) {
          try { 
            unlinkSync(storagePath);
            app.log.info(`[UPLOAD] Archivo limpiado después de error: ${storagePath}`);
          } catch {}
        }
      }
      
      // Limpiar registro de DB si existe
      if (documentId) {
        try {
          const client = new Client({ connectionString: process.env.DATABASE_URL });
          await client.connect();
          await client.query(`DELETE FROM legal_documents WHERE id = $1`, [documentId]);
          await client.end();
          app.log.info(`[UPLOAD] Registro de DB limpiado: ${documentId}`);
        } catch {}
      }
      
      // Mensaje de error específico según el tipo
      if (error?.code === "ERR_STREAM_PREMATURE_CLOSE" || error?.message?.includes("Premature close")) {
        return rep.status(400).send({
          error: "Upload interrumpido",
          message: "El archivo se cortó durante la subida. Por favor, intentá nuevamente.",
          code: "ERR_STREAM_PREMATURE_CLOSE"
        });
      }
      
      return rep.status(500).send({
        error: "Error al subir archivo",
        message: error instanceof Error ? error.message : "Error desconocido",
        code: error?.code
      });
    }
  });

  app.log.info("  POST /legal/upload → directo (sin proxy)");
  
  // Proxy routes para legal-docs service (para otros endpoints como /analyze, /result, etc.)
  const LEGAL_DOCS_URL = process.env.LEGAL_DOCS_URL;
  if (LEGAL_DOCS_URL) {
    app.log.info(`[LEGAL-DOCS] Proxy configurado a: ${LEGAL_DOCS_URL}`);
  } else {
    app.log.warn("[LEGAL-DOCS] ⚠️  LEGAL_DOCS_URL no configurada. Las rutas /legal/* no funcionarán.");
    app.log.warn("[LEGAL-DOCS] Para habilitar: agregar variable LEGAL_DOCS_URL en Railway apuntando a la URL del servicio legal-docs");
  }
  
  if (LEGAL_DOCS_URL) {
    const legalDocsTimeoutMs = Number(process.env.LEGAL_DOCS_TIMEOUT_MS || 110000); // Para rutas que pueden tardar (result, status)
    const analyzeTimeoutMs = Number(process.env.LEGAL_DOCS_ANALYZE_TIMEOUT_MS || 30000); // 30s - dar tiempo para cold start
    
    // Proxy para rutas específicas de /legal/* (EXCEPTO /legal/upload que se maneja directamente arriba)
    // Incluye GET, POST, DELETE, etc.
    // Usar rutas específicas en vez de app.all para evitar conflictos
    app.all("/legal/analyze/:documentId", async (req, rep) => {
      // Proxy a /analyze/:documentId (SIN /legal - el servicio no debe tener prefijo)
      const documentId = (req.params as any).documentId;
      const path = `/analyze/${documentId}`;
      
      // 🔍 LOGGING para diagnóstico
      app.log.info(`[GW-ANALYZE] Incoming: ${req.method} ${req.url}`);
      app.log.info(`[GW-ANALYZE] Params: documentId=${documentId}`);
      app.log.info(`[GW-ANALYZE] Proxy path: ${path}`);
      
      // Timeout corto: /analyze solo necesita confirmación (fire-and-forget en legal-docs)
      await proxyToLegalDocs(req, rep, path, analyzeTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/result/:documentId", async (req, rep) => {
      // Proxy a /result/:documentId (SIN /legal)
      const documentId = (req.params as any).documentId;
      const path = `/result/${documentId}`;
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/status/:documentId", async (req, rep) => {
      // Proxy a /status/:documentId (SIN /legal)
      const documentId = (req.params as any).documentId;
      const path = `/status/${documentId}`;
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/document/:documentId", async (req, rep) => {
      // Proxy a /document/:documentId (SIN /legal) - para DELETE de documentos
      const documentId = (req.params as any).documentId;
      const path = `/document/${documentId}`;
      app.log.info(`[GW-DELETE] Incoming: ${req.method} ${req.url} → ${path}`);
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/stats", async (req, rep) => {
      // Proxy a /stats (SIN /legal) - para estadísticas del dashboard
      const path = `/stats`;
      app.log.info(`[GW-STATS] Incoming: ${req.method} ${req.url} → ${path}`);
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/abogados", async (req, rep) => {
      // Proxy a /abogados (SIN /legal) - para gestión de abogados
      const path = `/abogados`;
      app.log.info(`[GW-ABOGADOS] Incoming: ${req.method} ${req.url} → ${path}`);
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/abogados/:id", async (req, rep) => {
      // Proxy a /abogados/:id (SIN /legal) - para gestión de abogados específicos
      const id = (req.params as any).id;
      const path = `/abogados/${id}`;
      app.log.info(`[GW-ABOGADOS] Incoming: ${req.method} ${req.url} → ${path}`);
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/assign-document", async (req, rep) => {
      // Proxy a /assign-document (SIN /legal) - para asignar documentos a abogados
      const path = `/assign-document`;
      app.log.info(`[GW-ASSIGN] Incoming: ${req.method} ${req.url} → ${path}`);
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/assign-document/:documentoId", async (req, rep) => {
      // Proxy a /assign-document/:documentoId (SIN /legal) - para obtener asignaciones
      const documentoId = (req.params as any).documentoId;
      const path = `/assign-document/${documentoId}`;
      app.log.info(`[GW-ASSIGN] Incoming: ${req.method} ${req.url} → ${path}`);
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/assignments", async (req, rep) => {
      // Proxy a /assignments - para obtener historial de asignaciones (admin)
      const path = `/assignments`;
      app.log.info(`[GW-ASSIGNMENTS] Incoming: ${req.method} ${req.url} → ${path}`);
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/assignments/:id", async (req, rep) => {
      // Proxy a /assignments/:id - para actualizar estado de asignación (admin)
      const id = (req.params as any).id;
      const path = `/assignments/${id}`;
      app.log.info(`[GW-ASSIGNMENTS] Incoming: ${req.method} ${req.url} → ${path}`);
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    // Endpoints de autenticación y usuarios
    app.all("/legal/auth/login", async (req, rep) => {
      const path = `/auth/login`;
      app.log.info(`[GW-AUTH] Incoming: ${req.method} ${req.url} → ${path}`);
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/usuarios", async (req, rep) => {
      const path = `/usuarios`;
      app.log.info(`[GW-USUARIOS] Incoming: ${req.method} ${req.url} → ${path}`);
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/usuarios/:id", async (req, rep) => {
      const id = (req.params as any).id;
      const path = `/usuarios/${id}`;
      app.log.info(`[GW-USUARIOS] Incoming: ${req.method} ${req.url} → ${path}`);
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    // Función helper para el proxy
    async function proxyToLegalDocs(req: any, rep: any, path: string, timeoutMs: number, baseUrl: string) {
      try {
        const startedAt = Date.now();
        
        // Normalizar baseUrl
        let normalizedUrl = baseUrl.trim();
        if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
          normalizedUrl = `https://${normalizedUrl}`;
        }
        normalizedUrl = normalizedUrl.replace(/\/$/, "");
        
        const targetUrl = `${normalizedUrl}${path}`;
        
        app.log.info(`[LEGAL-DOCS] Proxying ${req.method} ${req.url} → ${targetUrl}`);
        app.log.info(`[LEGAL-DOCS] Target URL completo: ${targetUrl}`);
        
        // Manejar multipart/form-data (archivos)
        const contentType = req.headers["content-type"] || "";
        const isMultipart = contentType.includes("multipart/form-data");
        
        // ✅ Detectar si es /analyze/:documentId (POST sin body)
        const isAnalyzeEndpoint = path.startsWith("/analyze/");
        
        let body: any = undefined;
        let headers: Record<string, string> = {};
        
        if (isMultipart) {
          const form = new FormData();
          
          const parts = req.parts();
          for await (const part of parts) {
            if (part.type === "file") {
              const buf = await part.toBuffer();
              const bytes = new Uint8Array(buf);
              const blob = new Blob([bytes], { type: part.mimetype || "application/octet-stream" });
              form.append(part.fieldname || "file", blob, part.filename || "file");
            } else {
              form.append(part.fieldname, String(part.value));
            }
          }
          
          body = form;
        } else if (req.method !== "GET" && req.method !== "HEAD") {
          // ✅ Para /analyze/:documentId, NO enviar Content-Type si no hay body
          // Esto evita el error FST_ERR_CTP_EMPTY_JSON_BODY en Fastify
          const hasBody = req.body !== undefined && req.body !== null && Object.keys(req.body || {}).length > 0;
          
          if (isAnalyzeEndpoint && !hasBody) {
            // POST /analyze/:id sin body → no enviar Content-Type
            // Fastify acepta POST sin body si no hay Content-Type
            body = undefined;
            // No agregar Content-Type a headers
          } else {
            // Para otros endpoints o si hay body, enviar Content-Type normalmente
            headers["Content-Type"] = contentType || "application/json";
            body = contentType.includes("application/json") 
              ? (hasBody ? JSON.stringify(req.body) : undefined)
              : req.body;
          }
        }
        
        // Headers CORS
        const origin = req.headers.origin;
        if (origin && isAllowedOrigin(origin)) {
          rep.header("Access-Control-Allow-Origin", origin);
          rep.header("Access-Control-Allow-Credentials", "true");
          rep.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
          rep.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");
        }
        
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        let response: Response;
        try {
          // ✅ Construir headers finales (sin Content-Type si no hay body para /analyze)
          const finalHeaders: Record<string, string> = {
            ...headers,
            ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          };
          
          // ✅ Si es /analyze y no hay body, asegurar que no haya Content-Type
          if (isAnalyzeEndpoint && !body) {
            delete finalHeaders["Content-Type"];
            delete finalHeaders["content-type"];
          }
          
          app.log.info(`[LEGAL-DOCS] Proxying ${req.method} ${path} → ${targetUrl}`);
          app.log.info(`[LEGAL-DOCS] Headers enviados: ${JSON.stringify(finalHeaders)}`);
          app.log.info(`[LEGAL-DOCS] Has body: ${body !== undefined ? "yes" : "no"}`);
          
          response = await fetch(targetUrl, {
            method: req.method,
            headers: finalHeaders,
            body: body,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(t);
        }
        
        const responseText = await response.text();
        let responseData: any;
        
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = responseText;
        }
        
        const durationMs = Date.now() - startedAt;
        app.log.info(`[LEGAL-DOCS] Response ${response.status} in ${durationMs}ms for ${req.method} ${req.url}`);
        
        // 🔍 LOGGING MEJORADO para diagnóstico de errores 400
        if (response.status >= 400) {
          app.log.error(`[LEGAL-DOCS] ❌❌❌ ERROR ${response.status} ❌❌❌`);
          app.log.error(`[LEGAL-DOCS] ❌ URL: ${targetUrl}`);
          app.log.error(`[LEGAL-DOCS] ❌ Response body completo: ${responseText}`);
          const headersObj: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            headersObj[key] = value;
          });
          app.log.error(`[LEGAL-DOCS] ❌ Response headers: ${JSON.stringify(headersObj)}`);
        }
        
        return rep.status(response.status).send(responseData);
      } catch (error) {
        app.log.error(error, "Error en proxy legal-docs");
        const name = (error as any)?.name;
        const message = (error as any)?.message;
        
        // Headers CORS también en errores
        const origin = req.headers.origin;
        if (origin && isAllowedOrigin(origin)) {
          rep.header("Access-Control-Allow-Origin", origin);
          rep.header("Access-Control-Allow-Credentials", "true");
          rep.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
          rep.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");
        }
        
        if (name === "AbortError") {
          return rep.status(504).send({
            error: "legal-docs timeout",
            message: `legal-docs did not respond within ${timeoutMs}ms`,
          });
        }
        return rep.status(502).send({ 
          error: "Error connecting to legal-docs service",
          message: error instanceof Error ? error.message : (message || "Unknown error")
        });
      }
    }
    
    // Proxy genérico para otras rutas /legal/* (fallback, pero /upload ya está excluido)
    app.all("/legal/*", async (req, rep) => {
      const urlPath = req.url.split("?")[0];
      if (urlPath === "/legal/upload") {
        return; // Ya manejado por el endpoint directo arriba
      }
      
      try {
        const startedAt = Date.now();
        
        // Extraer path correctamente: remover /legal del inicio y preservar query string si existe
        // req.url en Fastify es el pathname + query string (ej: "/legal/upload" o "/legal/upload?foo=bar")
        let path = req.url.replace(/^\/legal/, "") || "/";
        // Asegurar que empiece con /
        if (!path.startsWith("/")) {
          path = "/" + path;
        }
        
        // Normalizar LEGAL_DOCS_URL: si no tiene protocolo, agregar https://
        let baseUrl = LEGAL_DOCS_URL.trim();
        if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
          baseUrl = `https://${baseUrl}`;
        }
        // Remover barra final si existe para evitar doble barra
        baseUrl = baseUrl.replace(/\/$/, "");
        
        const targetUrl = `${baseUrl}${path}`;
        
        app.log.info(`[LEGAL-DOCS] Proxying ${req.method} ${req.url} → ${targetUrl}`);
        app.log.info(`[LEGAL-DOCS] Debug: baseUrl=${baseUrl}, path=${path}, LEGAL_DOCS_URL=${LEGAL_DOCS_URL}`);
        
        // Verificar que el servicio esté vivo antes de hacer el proxy
        try {
          const healthUrl = `${baseUrl}/health`;
          const healthCheck = await fetch(healthUrl, { 
            method: "GET",
            signal: AbortSignal.timeout(5000) // 5s timeout para health check
          });
          if (!healthCheck.ok) {
            app.log.warn(`[LEGAL-DOCS] Health check failed: ${healthCheck.status} ${healthCheck.statusText}`);
          } else {
            const healthData = await healthCheck.json();
            app.log.info(`[LEGAL-DOCS] Health check OK: ${JSON.stringify(healthData)}`);
          }
        } catch (healthError) {
          app.log.error(`[LEGAL-DOCS] Health check error: ${healthError instanceof Error ? healthError.message : String(healthError)}`);
          // Continuar de todas formas, puede ser un problema temporal
        }
        
        // Manejar multipart/form-data (archivos)
        const contentType = req.headers["content-type"] || "";
        const isMultipart = contentType.includes("multipart/form-data");
        
        let body: any = undefined;
        let headers: Record<string, string> = {};
        
        if (isMultipart) {
          // Para multipart, rearmar el body con FormData nativo (Node 18+/undici)
          // Nota: evitar `form-data` (legacy) porque puede no ser compatible con `fetch` nativo.
          const form = new FormData();
          
          // Obtener todos los campos del multipart
          const parts = req.parts();
          for await (const part of parts) {
            if (part.type === "file") {
              const buf = await part.toBuffer();
              // Node types: BlobPart no acepta Buffer<SharedArrayBuffer> estrictamente en TS,
              // así que normalizamos a Uint8Array.
              const bytes = new Uint8Array(buf);
              const blob = new Blob([bytes], { type: part.mimetype || "application/octet-stream" });
              form.append(part.fieldname || "file", blob, part.filename || "file");
            } else {
              form.append(part.fieldname, String(part.value));
            }
          }
          
          // Importante: NO seteamos Content-Type manualmente. `fetch` lo agrega con boundary.
          body = form;
        } else if (req.method !== "GET" && req.method !== "HEAD") {
          // Para JSON u otros tipos
          headers["Content-Type"] = contentType || "application/json";
          body = contentType.includes("application/json") 
            ? JSON.stringify(req.body) 
            : req.body;
        }
        
        // Usar fetch nativo con timeout (si el servicio legal-docs no responde, evitar quedar "pending")
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), legalDocsTimeoutMs);
        let response: Response;
        try {
          response = await fetch(targetUrl, {
          method: req.method,
          headers: {
            ...headers,
            // Copiar otros headers importantes
            ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          },
          body: body,
            signal: controller.signal,
        });
        } finally {
          clearTimeout(t);
        }
        
        const responseText = await response.text();
        let responseData: any;
        
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = responseText;
        }
        
        const durationMs = Date.now() - startedAt;
        app.log.info(`[LEGAL-DOCS] Response ${response.status} in ${durationMs}ms for ${req.method} ${req.url}`);
        
        // Asegurar headers CORS en la respuesta del proxy (Fastify CORS puede no aplicarse automáticamente a respuestas reenviadas)
        const origin = req.headers.origin;
        if (origin && isAllowedOrigin(origin)) {
          rep.header("Access-Control-Allow-Origin", origin);
          rep.header("Access-Control-Allow-Credentials", "true");
          rep.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
          rep.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");
        }
        
        return rep.status(response.status).send(responseData);
      } catch (error) {
        app.log.error(error, "Error en proxy legal-docs");
        const name = (error as any)?.name;
        const message = (error as any)?.message;
        // Asegurar headers CORS también en errores del proxy
        const origin = req.headers.origin;
        if (origin && isAllowedOrigin(origin)) {
          rep.header("Access-Control-Allow-Origin", origin);
          rep.header("Access-Control-Allow-Credentials", "true");
          rep.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
          rep.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");
        }
        
        if (name === "AbortError") {
          return rep.status(504).send({
            error: "legal-docs timeout",
            message: `legal-docs did not respond within ${Number(process.env.LEGAL_DOCS_TIMEOUT_MS || 110000)}ms`,
          });
        }
        return rep.status(502).send({ 
          error: "Error connecting to legal-docs service",
          message: error instanceof Error ? error.message : (message || "Unknown error")
        });
      }
    });
    
    app.log.info("  POST /legal/upload → legal-docs service");
    app.log.info("  POST /legal/analyze/:documentId → legal-docs service");
    app.log.info("  GET  /legal/result/:documentId → legal-docs service");
  } else {
    app.log.warn("[LEGAL-DOCS] LEGAL_DOCS_URL no configurada, rutas /legal/* deshabilitadas");
  }

  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT) || 3000 });
  app.log.info(`Servidor escuchando en puerto ${process.env.PORT || 3000}`);
}

start().catch((error) => {
  console.error("Error al iniciar servidor:", error);
  process.exit(1);
});

