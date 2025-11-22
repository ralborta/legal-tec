-- Migración para añadir soporte a bases de conocimiento adicionales
-- Esta migración extiende el sistema para soportar múltiples bases de conocimiento

-- Añadir columna para identificar la base de conocimiento específica
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS knowledge_base text;

-- Crear índice para búsquedas por base de conocimiento
CREATE INDEX IF NOT EXISTS idx_chunks_knowledge_base ON chunks(knowledge_base);

-- Crear índice compuesto para búsquedas más eficientes
CREATE INDEX IF NOT EXISTS idx_chunks_source_kb ON chunks(source, knowledge_base);

-- Crear tabla para gestionar las bases de conocimiento disponibles
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id          text PRIMARY KEY,                    -- Identificador único (ej: "doctrina_wna", "jurisprudencia_extranjera")
  name        text NOT NULL,                      -- Nombre descriptivo
  description text,                                -- Descripción de la base
  source_type text NOT NULL,                       -- Tipo de fuente (normativa, juris, interno, doctrina, etc.)
  enabled     boolean DEFAULT true,                -- Si está habilitada
  metadata    jsonb DEFAULT '{}'::jsonb,          -- Metadata adicional (URL API, credenciales, etc.)
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Insertar bases de conocimiento por defecto
INSERT INTO knowledge_bases (id, name, description, source_type, enabled) VALUES
  ('normativa_principal', 'Normativa Principal', 'Normativa argentina principal', 'normativa', true),
  ('jurisprudencia_principal', 'Jurisprudencia Principal', 'Jurisprudencia argentina principal', 'juris', true),
  ('interno_principal', 'Base Interna Principal', 'Documentos internos del estudio', 'interno', true)
ON CONFLICT (id) DO NOTHING;

-- Comentarios para documentación
COMMENT ON COLUMN chunks.knowledge_base IS 'Identificador de la base de conocimiento específica (ej: "doctrina_wna", "jurisprudencia_extranjera")';
COMMENT ON COLUMN knowledge_bases.id IS 'Identificador único de la base de conocimiento';
COMMENT ON COLUMN knowledge_bases.source_type IS 'Tipo de fuente: normativa, juris, interno, doctrina, etc.';


