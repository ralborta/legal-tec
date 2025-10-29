import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";

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

// Endpoint simplificado sin LlamaIndex
app.post("/v1/generate", async (req, rep) => {
  const body = z.object({
    type: z.enum(["dictamen","contrato","memo","escrito"]),
    title: z.string().min(3),
    instructions: z.string().min(10),
    k: z.number().optional()
  }).parse(req.body);

  // Respuesta mock por ahora
  const mockResponse = {
    markdown: `# ${body.title}

**Tipo:** ${body.type}
**Instrucciones:** ${body.instructions}

*Este es un documento de prueba generado sin LlamaIndex. El sistema RAG completo se implementará en la siguiente versión.*

## Próximos pasos:
- Integrar LlamaIndex en un entorno compatible
- Conectar con base de datos vectorial
- Implementar búsqueda semántica real`,
    citations: [
      { source: "mock", title: "Documento de prueba", url: "#" }
    ]
  };

  return rep.send(mockResponse);
});

// Endpoint simplificado sin LlamaIndex
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

  // Mock response
  return rep.send({ 
    ok: true, 
    count: body.items.length,
    message: "Ingesta mock - LlamaIndex se implementará en la siguiente versión"
  });
});

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT) || 3000 });
