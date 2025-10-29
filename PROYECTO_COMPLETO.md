# 📚 PROYECTO LEGAL-TEC - Documentación Completa

## 🎯 IDEA DEL PROYECTO

**Centro de Gestión Legal con IA** - Sistema para generar documentos legales (dictámenes, contratos, memos, escritos judiciales) usando:

- **RAG (Retrieval Augmented Generation)**: Búsqueda semántica en corpus legal
- **LlamaIndex**: Framework para búsqueda vectorial y embeddings
- **OpenAI GPT-4**: Generación de documentos basada en plantillas
- **PostgreSQL + pgvector**: Base de datos vectorial para embeddings

---

## 🏗️ ARQUITECTURA DEL SISTEMA

```
┌─────────────────┐
│   VERCEL        │  Frontend (Next.js)
│   Dashboard UI  │  → Se conecta a Railway API
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   RAILWAY       │  Backend API (Fastify)
│   Procesamiento │  → LlamaIndex + OpenAI
│   Pesado        │  → Sin límites de tiempo/memoria
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   SUPABASE      │  Base de Datos (PostgreSQL)
│   PostgreSQL    │  → pgvector nativo
│   + pgvector    │  → Embeddings almacenados
└─────────────────┘
```

### **Por qué esta arquitectura:**

1. **Vercel**: Ideal para frontend estático/SSR, CDN global
2. **Railway**: Sin límites para procesamiento pesado (LlamaIndex puede tardar)
3. **Supabase**: PostgreSQL con pgvector nativo (Railway no lo tiene)

---

## 📁 ESTRUCTURA DEL PROYECTO

```
Legal-Tec1/
├── api/                    # Backend (Railway)
│   ├── src/
│   │   ├── index.ts       # Servidor Fastify principal
│   │   ├── generate.ts    # Generación de documentos con RAG
│   │   ├── ingest.ts      # Ingesta de documentos al corpus
│   │   ├── templates.ts   # Plantillas Markdown para documentos
│   │   └── seed-run.ts    # Script para cargar datos de prueba
│   └── seed/
│       └── ccyc_art_765.txt  # Datos de ejemplo
│
├── ui/                     # Frontend (Vercel)
│   ├── app/
│   │   ├── dashboard/
│   │   │   └── page.tsx   # Dashboard principal
│   │   ├── layout.tsx     # Layout de Next.js
│   │   └── globals.css    # Estilos globales
│   └── package.json       # Dependencies del frontend
│
├── sql/                    # Scripts SQL
│   ├── 001_init.sql       # Schema completo con pgvector
│   └── 001_init_simple.sql # Schema sin pgvector (para Railway)
│
├── supabase/               # Configuración Supabase (NO USAMOS Edge Functions)
│   ├── migrations/        # SQL migrations
│   └── functions/         # Edge Functions (no se usan)
│
├── package.json           # Backend dependencies
├── tsconfig.json          # TypeScript config
├── nixpacks.toml         # Railway build config
└── Procfile              # Railway start command
```

---

## 🔄 FLUJO DE FUNCIONAMIENTO

### **1. Ingesta de Documentos (Corpus Legal)**

```
Usuario → Frontend → Railway API → Supabase DB
                              ↓
                        LlamaIndex crea embeddings
                        → Almacena en tabla "chunks"
```

**Endpoint:** `POST /v1/ingest`

**Ejemplo:**
```json
{
  "items": [
    {
      "text": "Artículo 765 del Código Civil...",
      "source": "normativa",
      "title": "CCyC Art. 765",
      "url": "https://...",
      "meta": { "vigencia": "2024" }
    }
  ]
}
```

**Proceso:**
1. LlamaIndex crea embedding del texto (vector 1536 dimensiones)
2. Almacena en `chunks` con metadata
3. Crea índice vectorial para búsqueda rápida

---

### **2. Generación de Documentos**

```
Usuario → Frontend → Railway API → Supabase DB
                        ↓           ↓
                   LlamaIndex  Búsqueda semántica
                   (RAG)      ↓
                   ↓       Top K resultados
                OpenAI GPT-4
                ↓
              Documento generado
              ↓
         Guarda en tabla "documents"
```

**Endpoint:** `POST /v1/generate`

**Ejemplo:**
```json
{
  "type": "dictamen",
  "title": "Dictamen sobre Contrato de Compraventa",
  "instructions": "Analizar validez de cláusulas del contrato...",
  "k": 6
}
```

**Proceso:**
1. **Búsqueda Semántica**: LlamaIndex busca chunks relevantes en el corpus
2. **Contexto**: Construye contexto con los top K resultados
3. **Generación**: OpenAI GPT-4 genera documento basado en:
   - Plantilla del tipo de documento
   - Contexto del corpus
   - Instrucciones del usuario
4. **Guardado**: Almacena documento en `documents` con citas

---

## 🗄️ BASE DE DATOS (Supabase PostgreSQL)

### **Tabla: `chunks`** (Corpus Legal)

```sql
CREATE TABLE chunks (
  id        bigserial PRIMARY KEY,
  source    text NOT NULL,        -- normativa|juris|interno
  title     text,
  url       text,
  meta      jsonb DEFAULT '{}',
  text      text NOT NULL,
  embedding vector(1536),         -- Embedding vectorial
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chunks_vector ON chunks USING ivfflat (embedding vector_cosine_ops);
```

**Propósito:** Almacenar documentos legales vectorizados para búsqueda semántica.

---

### **Tabla: `documents`** (Documentos Generados)

```sql
CREATE TABLE documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text NOT NULL,       -- dictamen|contrato|memo|escrito
  title      text NOT NULL,
  content_md text NOT NULL,       -- Markdown generado
  citations  jsonb NOT NULL,      -- Citas usadas del corpus
  created_at timestamptz DEFAULT now()
);
```

**Propósito:** Almacenar documentos generados por el sistema.

---

## 📝 PLANTILLAS DE DOCUMENTOS

### **Tipos disponibles:**
- `dictamen`: Dictámenes legales
- `contrato`: Contratos
- `memo`: Memorándums
- `escrito`: Escritos judiciales

Cada plantilla tiene placeholders `{{...}}` que se rellenan con GPT-4 basado en el contexto.

---

## 🌐 ENDPOINTS DE LA API (Railway)

### **1. Health Check**
```
GET /health
→ { "ok": true }
```

### **2. Ingesta**
```
POST /v1/ingest
Body: { items: [...] }
→ { ok: true, count: N }
```

### **3. Generación**
```
POST /v1/generate
Body: { type, title, instructions, k? }
→ { markdown: "...", citations: [...] }
```

---

## 🔧 VARIABLES DE ENTORNO

### **Railway (Backend):**
```bash
DATABASE_URL=postgresql://postgres:PASSWORD@db.ulkmzyujbcqmxavorbbu.supabase.co:5432/postgres
OPENAI_API_KEY=sk-...
PORT=3000
```

### **Vercel (Frontend):**
```bash
NEXT_PUBLIC_API_URL=https://tu-api.railway.app
```

### **Supabase (DB):**
- Ya configurado (pgvector habilitado)
- Tablas creadas

---

## ✅ ESTADO ACTUAL DEL PROYECTO

### **✅ Completado:**
- ✅ Código backend con LlamaIndex
- ✅ Frontend dashboard completo
- ✅ Plantillas de documentos
- ✅ Schema de base de datos
- ✅ Supabase configurado con pgvector
- ✅ Frontend deployado en Vercel

### **⏳ Pendiente:**
- ⏳ Actualizar `DATABASE_URL` en Railway a Supabase
- ⏳ Railway deploy con conexión a Supabase
- ⏳ Probar generación completa
- ⏳ Cargar corpus legal inicial

---

## 🚀 PRÓXIMOS PASOS

### **1. Completar configuración Railway:**
```
Railway Dashboard → Variables → DATABASE_URL
→ Cambiar a: postgresql://postgres:gPuTfBvkQGPDXEcWLtGuGOZAUWHMxDaV@db.ulkmzyujbcqmxavorbbu.supabase.co:5432/postgres
```

### **2. Deploy automático:**
- Railway debería redeployar automáticamente
- Probar `/health` endpoint

### **3. Probar generación:**
- Cargar datos de prueba con `/v1/ingest`
- Generar primer documento con `/v1/generate`

---

## 🎯 OBJETIVO FINAL

**Sistema completo que permite:**
1. Ingresar corpus legal (normativa, jurisprudencia, documentos internos)
2. Buscar semánticamente información relevante
3. Generar documentos legales profesionales basados en el corpus
4. Mantener trazabilidad de citas y fuentes

---

## 📊 TECNOLOGÍAS USADAS

- **Backend:** Fastify, TypeScript, LlamaIndex, OpenAI API
- **Frontend:** Next.js 16, React, Tailwind CSS, Framer Motion
- **Base de Datos:** PostgreSQL (Supabase) + pgvector
- **Deployment:** Railway (backend), Vercel (frontend)

---

**¿Todo claro? ¿Quieres que profundice en alguna parte específica?** 🚀
