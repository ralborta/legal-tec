-- Migración mínima para crear tabla knowledge_bases
-- Ejecutar en Railway → PostgreSQL → Query

-- Crear tabla knowledge_bases
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  source_type text NOT NULL,
  enabled     boolean DEFAULT true,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Insertar bases de conocimiento por defecto
INSERT INTO knowledge_bases (id, name, description, source_type, enabled) VALUES
  ('normativa_principal', 'Normativa Principal', 'Normativa argentina principal', 'normativa', true),
  ('jurisprudencia_principal', 'Jurisprudencia Principal', 'Jurisprudencia argentina principal', 'juris', true),
  ('interno_principal', 'Base Interna Principal', 'Documentos internos del estudio', 'interno', true)
ON CONFLICT (id) DO NOTHING;

-- Verificar que se creó correctamente
SELECT id, name, enabled, created_at FROM knowledge_bases ORDER BY id;

