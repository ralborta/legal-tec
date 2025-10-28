# Legal Agents - Sistema RAG para documentos legales

Sistema de generación de documentos legales usando RAG (Retrieval-Augmented Generation) con LlamaIndex, PostgreSQL + pgvector, y OpenAI.

## 🏗️ Stack Tecnológico

- **Backend:** Fastify + TypeScript
- **Vector DB:** PostgreSQL + pgvector
- **RAG:** LlamaIndex
- **LLM:** OpenAI (GPT-4)
- **Deployment:** Railway / Vercel

## 📁 Estructura

```
legal-agents/
  api/
    src/
      index.ts       # API Fastify (endpoints /v1/generate, /v1/ingest)
      generate.ts    # Generación de documentos con RAG
      ingest.ts      # Ingesta de corpus a vector store
      templates.ts   # Plantillas Markdown para documentos
      seed-run.ts    # Script de carga inicial
    seed/
      ccyc_art_765.txt  # Ejemplo de normativa
  sql/
    001_init.sql     # Schema inicial (tablas chunks, documents)
  package.json
  tsconfig.json
```

## 🚀 Pasos de Instalación

### 1) Crear Base de Datos y ejecutar SQL inicial

```bash
# Si usas Railway Postgres
railway run psql -f sql/001_init.sql

# O con URL directa
psql "$DATABASE_URL" -f sql/001_init.sql
```

### 2) Instalar dependencias

```bash
pnpm install
# o npm install
```

### 3) Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:
```
DATABASE_URL=postgresql://user:pass@host:5432/db
OPENAI_API_KEY=sk-xxxx
PORT=3000
```

### 4) Cargar datos iniciales (seed)

```bash
pnpm seed
```

### 5) Ejecutar en desarrollo

```bash
pnpm dev
```

El servidor estará disponible en `http://localhost:3000`

## 📡 API Endpoints

### GET /health
Health check del servicio.

```bash
curl http://localhost:3000/health
```

### POST /v1/ingest
Ingesta de documentos al corpus vectorial.

```bash
curl -X POST http://localhost:3000/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "text": "Artículo 1...",
        "source": "normativa",
        "title": "Art. 1 CCyC",
        "url": "https://..."
      }
    ]
  }'
```

### POST /v1/generate
Genera documentos legales con RAG.

```bash
curl -X POST http://localhost:3000/v1/generate \
  -H "Content-Type: application/json" \
  -d '{
    "type": "dictamen",
    "title": "Análisis de responsabilidad contractual",
    "instructions": "Analizar la responsabilidad del vendedor en caso de vicios ocultos",
    "k": 6
  }'
```

**Tipos de documentos:**
- `dictamen` - Dictamen legal
- `contrato` - Contrato
- `memo` - Memorándum
- `escrito` - Escrito judicial

## 🚢 Deploy en Railway

1. Crear proyecto en Railway
2. Agregar servicio **PostgreSQL**
3. Ejecutar SQL inicial en la DB:
   ```bash
   railway run psql -f sql/001_init.sql
   ```
4. Crear servicio **Node.js** desde este repo
5. Configurar variables de entorno:
   - `DATABASE_URL` (auto desde Postgres)
   - `OPENAI_API_KEY`
   - `PORT=3000`
6. Start command: `pnpm dev` (o `pnpm start` para producción)

## 🏗️ Build para Producción

```bash
pnpm build   # Compila TypeScript a dist/
pnpm start   # Ejecuta desde dist/
```

## 📝 Notas

- El sistema usa **embeddings OpenAI (text-embedding-ada-002)** de dimensión 1536
- Los chunks se crean con tamaño 900 y overlap 120
- La búsqueda vectorial recupera top-K documentos (default: 6)
- Las citas se guardan en formato JSONB para trazabilidad
- Las plantillas usan formato Markdown con placeholders `{{variable}}`

## 🔜 Próximos pasos

- Conectar con UI de Centro de Gestión (Next.js en Vercel)
- Agregar más plantillas de documentos
- Implementar sistema de versiones de documentos
- Agregar exportación a PDF

