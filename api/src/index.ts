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
              app.log.warn("Error al parsear validación de IA, usando scoring original:", parseError);
            }
          }
        } catch (aiError) {
          app.log.warn("Error en validación por IA, usando scoring original:", aiError);
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

