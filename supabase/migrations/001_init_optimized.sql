-- Schema optimizado para LlamaIndex + Supabase PostgreSQL con pgvector
-- Usa text-embedding-3-small (1536 dimensiones)

-- Habilitar extensiones
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla chunks (corpus legal con embeddings)
CREATE TABLE IF NOT EXISTS chunks (
  id        TEXT PRIMARY KEY,              -- ID generado por LlamaIndex
  doc_id    TEXT,                          -- ID del documento original
  content   TEXT NOT NULL,                 -- Texto del chunk
  metadata  JSONB DEFAULT '{}'::jsonb,     -- Metadata (source, title, url, etc.)
  embedding vector(1536) NOT NULL,         -- Embedding vectorial (1536 = text-embedding-3-small)
  created_at timestamptz DEFAULT now()
);

-- Índice vectorial aproximado (rápido para búsqueda)
-- ivfflat con 100 lists es un buen balance para datasets medianos
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
ON chunks
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Índice adicional para metadata (búsqueda por source)
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks((metadata->>'source'));
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);

-- Tabla documents (documentos generados)
CREATE TABLE IF NOT EXISTS documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text NOT NULL CHECK (type IN ('dictamen','contrato','memo','escrito')),
  title      text NOT NULL,
  content_md text NOT NULL,
  citations  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Índice para búsqueda por tipo
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);
