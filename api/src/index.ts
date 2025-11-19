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
      k: z.number().optional()
    }).parse(req.body);

    const res = await generateDoc(process.env.DATABASE_URL!, process.env.OPENAI_API_KEY!, body);
    return rep.send(res);
  });

  // Ingesta simple de texto (para seed o pruebas)
  app.post("/v1/ingest", async (req, rep) => {
    const body = z.object({
      items: z.array(z.object({
        text: z.string().min(20),
        source: z.enum(["normativa","juris","interno"]),
        title: z.string().optional(),
        url: z.string().optional(),
        meta: z.record(z.any()).optional()
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
        memoOutput = await generarMemoJuridicoDirect(openaiKey, {
          tipoDocumento,
          titulo,
          instrucciones,
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
        
        memoOutput = await generarMemoJuridico(openaiKey, {
          tipoDocumento,
          titulo,
          instrucciones,
          transcriptText
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

  // Log de endpoints registrados
  app.log.info("Endpoints registrados:");
  app.log.info("  GET  /health");
  app.log.info("  POST /v1/generate");
  app.log.info("  POST /v1/ingest");
  app.log.info("  POST /v1/query");
  app.log.info("  POST /api/memos/generate");

  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT) || 3000 });
  app.log.info(`Servidor escuchando en puerto ${process.env.PORT || 3000}`);
}

start().catch((error) => {
  console.error("Error al iniciar servidor:", error);
  process.exit(1);
});

