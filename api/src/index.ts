import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { generateDoc } from "./generate";
import { ingestBatch } from "./ingest";

async function start() {
  const app = Fastify({ logger: true });

  // CORS para frontend en Vercel y desarrollo local
  await app.register(cors, {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      /\.vercel\.app$/,  // Todos los subdominios de Vercel
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });

  app.get("/health", async () => ({ ok: true }));

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

  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT) || 3000 });
}

start().catch(console.error);

