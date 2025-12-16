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

// Log de versiones para diagnóstico

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

  const allowedOriginsFromEnv = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const isAllowedOrigin = (origin: string) => {
    // Permitir localhost
    if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return true;

    // Permitir todos los dominios de Vercel (preview + prod)
    if (origin.includes(".vercel.app") || origin.endsWith("vercel.app")) return true;

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
  
  // Endpoint directo para upload de documentos legales (sin proxy, funciona como /api/memos/generate)
  app.post("/legal/upload", async (req, rep) => {
    try {
      app.log.info("POST /legal/upload recibido");
      
      if (!req.isMultipart()) {
        return rep.status(400).send({ error: "Se requiere multipart/form-data" });
      }

      let fileBuffer: Buffer | null = null;
      let filename: string | null = null;
      let mimetype: string | null = null;

      for await (const part of req.parts()) {
        if (part.type === "file" && part.fieldname === "file") {
          fileBuffer = await part.toBuffer();
          filename = part.filename || "document.pdf";
          mimetype = part.mimetype || "application/pdf";
          app.log.info(`Archivo recibido: ${filename}, tamaño: ${fileBuffer.length} bytes`);
          break;
        }
      }

      if (!fileBuffer) {
        return rep.status(400).send({ error: "No se proporcionó archivo" });
      }

      // Generar documentId y guardar en DB + disco (mismo patrón que legal-docs)
      const { randomUUID } = await import("crypto");
      const documentId = randomUUID();
      
      // Asegurar que tenemos filename (ya validado arriba, pero TypeScript no lo sabe)
      const safeFilename = filename || "document.pdf";
      const safeMimetype = mimetype || "application/pdf";
      
      // Guardar archivo en disco (igual que legal-docs)
      const STORAGE_DIR = process.env.STORAGE_DIR || "./storage";
      const { writeFileSync, mkdirSync, existsSync } = await import("fs");
      
      if (!existsSync(STORAGE_DIR)) {
        mkdirSync(STORAGE_DIR, { recursive: true });
      }
      
      const fileExtension = safeFilename.split(".").pop() || "bin";
      const storagePath = join(STORAGE_DIR, `${documentId}.${fileExtension}`);
      writeFileSync(storagePath, fileBuffer);
      
      app.log.info(`Archivo guardado en disco: ${storagePath}`);
      
      // Guardar metadata en DB (tabla legal_documents)
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      
      try {
        // Asegurar que la tabla existe
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
        
        app.log.info(`Documento guardado en DB, documentId: ${documentId}, path: ${storagePath}`);
        return rep.send({ documentId });
      } finally {
        await client.end();
      }
    } catch (error) {
      app.log.error(error, "Error en /legal/upload");
      return rep.status(500).send({
        error: "Error al subir archivo",
        message: error instanceof Error ? error.message : "Error desconocido"
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
    const analyzeTimeoutMs = Number(process.env.LEGAL_DOCS_ANALYZE_TIMEOUT_MS || 10000); // 10s - solo necesita confirmación rápida
    
    // Proxy para rutas específicas de /legal/* (EXCEPTO /legal/upload que se maneja directamente arriba)
    // Usar rutas específicas en vez de app.all para evitar conflictos
    app.all("/legal/analyze/:documentId", async (req, rep) => {
      // Proxy a /analyze/:documentId
      const path = req.url.replace("/legal", "");
      // Timeout corto: /analyze solo necesita confirmación (fire-and-forget en legal-docs)
      await proxyToLegalDocs(req, rep, path, analyzeTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/result/:documentId", async (req, rep) => {
      // Proxy a /result/:documentId
      const path = req.url.replace("/legal", "");
      await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
    });
    
    app.all("/legal/status/:documentId", async (req, rep) => {
      // Proxy a /status/:documentId
      const path = req.url.replace("/legal", "");
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
        
        // Manejar multipart/form-data (archivos)
        const contentType = req.headers["content-type"] || "";
        const isMultipart = contentType.includes("multipart/form-data");
        
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
          headers["Content-Type"] = contentType || "application/json";
          body = contentType.includes("application/json") 
            ? JSON.stringify(req.body) 
            : req.body;
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
          response = await fetch(targetUrl, {
            method: req.method,
            headers: {
              ...headers,
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

