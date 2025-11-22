import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { generateDoc } from "./generate.js";
import { ingestBatch } from "./ingest.js";
import { queryDocument } from "./query-doc.js";
import { extractTextFromPdf } from "./pdf-extract.js";
import { generarMemoJuridico } from "./memos/generate-memo.js";
import { generarMemoJuridicoDirect } from "./memos/generate-memo-direct.js";
import { queryMemo } from "./memos/query-memo.js";
import { chatMemo } from "./memos/chat-memo.js";
import * as knowledgeBases from "./knowledge-bases.js";
import { scrapeAndIngestUrls, scrapeUrl } from "./url-scraper.js";

// Log de versiones para diagnóstico
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  const fastifyPkg = JSON.parse(readFileSync(join(__dirname, "../../node_modules/fastify/package.json"), "utf-8"));
  const corsPkg = JSON.parse(readFileSync(join(__dirname, "../../node_modules/@fastify/cors/package.json"), "utf-8"));
  console.log("🔍 VERSIONES INSTALADAS:");
  console.log("  Fastify:", fastifyPkg.version);
  console.log("  @fastify/cors:", corsPkg.version);
} catch (e) {
  console.warn("⚠️  No se pudieron leer versiones de paquetes:", e);
}

async function start() {
  const app = Fastify({ logger: true });

  // CORS para frontend en Vercel y desarrollo local
  await app.register(cors, {
    origin: (origin, cb) => {
      // Permitir requests sin origin (Postman, curl, etc.)
      if (!origin) {
        app.log.info("CORS: Request sin origin, permitido");
        return cb(null, true);
      }
      
      app.log.info(`CORS: Verificando origin: ${origin}`);
      
      // Permitir localhost
      if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
        app.log.info("CORS: Localhost permitido");
        return cb(null, true);
      }
      
      // Permitir todos los dominios de Vercel (cualquier subdominio)
      if (origin.includes("vercel.app")) {
        app.log.info("CORS: Dominio Vercel permitido");
        return cb(null, true);
      }
      
      // Denegar otros orígenes
      app.log.warn(`CORS: Origin denegado: ${origin}`);
      return cb(new Error("Not allowed by CORS"), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  });

  // Multipart para manejar archivos
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB máximo
    }
  });

  app.get("/health", async () => ({ ok: true }));
  
  // Endpoint de prueba para verificar que el servidor está corriendo
  app.get("/api/test", async () => ({ 
    ok: true, 
    message: "Servidor funcionando correctamente",
    timestamp: new Date().toISOString()
  }));

  app.post("/v1/generate", async (req, rep) => {
    const body = z.object({
      type: z.enum(["dictamen","contrato","memo","escrito"]),
      title: z.string().min(3),
      instructions: z.string().min(10),
      k: z.number().optional(),
      knowledgeBases: z.array(z.string()).optional(), // IDs de bases de conocimiento a incluir
      excludeKnowledgeBases: z.array(z.string()).optional() // IDs de bases de conocimiento a excluir
    }).parse(req.body);

    const res = await generateDoc(process.env.DATABASE_URL!, process.env.OPENAI_API_KEY!, body);
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
        const areaLegal = fields.areaLegal || fields.area_legal || "civil_comercial";
        memoOutput = await generarMemoJuridicoDirect(openaiKey, {
          tipoDocumento,
          titulo,
          instrucciones,
          areaLegal: areaLegal as any,
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
        
        const areaLegal = fields.areaLegal || fields.area_legal || "civil_comercial";
        memoOutput = await generarMemoJuridico(openaiKey, {
          tipoDocumento,
          titulo,
          instrucciones,
          transcriptText,
          areaLegal: areaLegal as any
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
        areaLegal: z.string().optional()
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

  // Endpoints para gestión de bases de conocimiento
  app.get("/api/knowledge-bases", async (req, rep) => {
    const kbs = await knowledgeBases.listKnowledgeBases(process.env.DATABASE_URL!);
    return rep.send({ knowledgeBases: kbs });
  });

  app.get("/api/knowledge-bases/:id", async (req, rep) => {
    const { id } = req.params as { id: string };
    const kb = await knowledgeBases.getKnowledgeBase(process.env.DATABASE_URL!, id);
    if (!kb) {
      return rep.status(404).send({ error: "Base de conocimiento no encontrada" });
    }
    const stats = await knowledgeBases.getKnowledgeBaseStats(process.env.DATABASE_URL!, id);
    return rep.send({ ...kb, stats });
  });

  app.post("/api/knowledge-bases", async (req, rep) => {
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
  });

  app.patch("/api/knowledge-bases/:id/toggle", async (req, rep) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      enabled: z.boolean()
    }).parse(req.body);

    await knowledgeBases.toggleKnowledgeBase(process.env.DATABASE_URL!, id, body.enabled);
    return rep.send({ ok: true });
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

  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT) || 3000 });
  app.log.info(`Servidor escuchando en puerto ${process.env.PORT || 3000}`);
}

start().catch((error) => {
  console.error("Error al iniciar servidor:", error);
  process.exit(1);
});

