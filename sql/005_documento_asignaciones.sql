-- Tabla para almacenar asignaciones de documentos a abogados
-- Permite rastrear qué documentos han sido asignados a qué abogados

CREATE TABLE IF NOT EXISTS documento_asignaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id VARCHAR(255) NOT NULL,
  documento_tipo VARCHAR(100) NOT NULL,
  documento_titulo TEXT,
  abogado_id UUID NOT NULL,
  abogado_nombre VARCHAR(255) NOT NULL,
  abogado_email VARCHAR(255) NOT NULL,
  abogado_telefono VARCHAR(50),
  asignado_por VARCHAR(255),
  estado VARCHAR(50) DEFAULT 'asignado',
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (abogado_id) REFERENCES abogados_senior(id) ON DELETE RESTRICT
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_documento_asignaciones_documento_id ON documento_asignaciones(documento_id);
CREATE INDEX IF NOT EXISTS idx_documento_asignaciones_abogado_id ON documento_asignaciones(abogado_id);
CREATE INDEX IF NOT EXISTS idx_documento_asignaciones_created_at ON documento_asignaciones(created_at);
CREATE INDEX IF NOT EXISTS idx_documento_asignaciones_estado ON documento_asignaciones(estado);

-- Comentarios
COMMENT ON TABLE documento_asignaciones IS 'Asignaciones de documentos legales a abogados senior';
COMMENT ON COLUMN documento_asignaciones.documento_id IS 'ID del documento asignado (puede ser ID de análisis, memo, etc.)';
COMMENT ON COLUMN documento_asignaciones.documento_tipo IS 'Tipo de documento (analysis, memo, etc.)';
COMMENT ON COLUMN documento_asignaciones.estado IS 'Estado de la asignación (asignado, revisado, completado, etc.)';
COMMENT ON COLUMN documento_asignaciones.asignado_por IS 'Usuario o sistema que realizó la asignación';
