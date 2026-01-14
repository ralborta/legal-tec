-- Tabla para almacenar abogados senior
-- Permite gestionar la lista de abogados que pueden recibir asignaciones

CREATE TABLE IF NOT EXISTS abogados_senior (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  telefono VARCHAR(50),
  email VARCHAR(255) NOT NULL,
  activo BOOLEAN DEFAULT true,
  orden INTEGER DEFAULT 0, -- Para ordenar la lista
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_abogados_senior_activo ON abogados_senior(activo);
CREATE INDEX IF NOT EXISTS idx_abogados_senior_orden ON abogados_senior(orden);

-- Insertar algunos abogados de ejemplo (opcional, para desarrollo)
-- INSERT INTO abogados_senior (nombre, telefono, email, orden) VALUES
--   ('Dr. Juan Pérez', '+54 11 1234-5678', 'juan.perez@wns.com', 1),
--   ('Dra. María González', '+54 11 2345-6789', 'maria.gonzalez@wns.com', 2),
--   ('Dr. Carlos Rodríguez', '+54 11 3456-7890', 'carlos.rodriguez@wns.com', 3),
--   ('Dra. Ana Martínez', '+54 11 4567-8901', 'ana.martinez@wns.com', 4),
--   ('Dr. Luis Fernández', '+54 11 5678-9012', 'luis.fernandez@wns.com', 5),
--   ('Dra. Sofía López', '+54 11 6789-0123', 'sofia.lopez@wns.com', 6)
-- ON CONFLICT DO NOTHING;

-- Comentarios
COMMENT ON TABLE abogados_senior IS 'Lista de abogados senior que pueden recibir asignaciones de documentos';
COMMENT ON COLUMN abogados_senior.activo IS 'Indica si el abogado está activo y puede recibir asignaciones';
COMMENT ON COLUMN abogados_senior.orden IS 'Orden de visualización en la lista (menor número = primero)';
