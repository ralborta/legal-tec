CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Corpus (RAG)
CREATE TABLE IF NOT EXISTS chunks (
  id        bigserial PRIMARY KEY,
  source    text NOT NULL,        -- normativa|juris|interno
  title     text,
  url       text,
  meta      jsonb DEFAULT '{}'::jsonb,
  text      text NOT NULL,
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chunks_vector ON chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);

-- Documentos generados
CREATE TABLE IF NOT EXISTS documents (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type       text NOT NULL CHECK (type IN ('dictamen','contrato','memo','escrito')),
  title      text NOT NULL,
  content_md text NOT NULL,
  citations  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

