-- Tabla para almacenar usuarios del sistema
-- Permite gestionar usuarios con diferentes roles (admin, usuario)

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(50) DEFAULT 'usuario' CHECK (rol IN ('admin', 'usuario')),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo);

-- Insertar usuario admin inicial
-- Password: adm123 (hash bcrypt con salt rounds 10)
-- Hash generado: $2b$10$C0xyNMS3pZIaWvZIZ.l/aey./IL9mABMOoJVSjZHDyqT1yOgsddUe
-- Para generar nuevo hash: usar bcrypt.hashSync('password', 10)
INSERT INTO usuarios (email, nombre, password_hash, rol, activo) VALUES
  ('adm@wns.com', 'Administrador', '$2b$10$C0xyNMS3pZIaWvZIZ.l/aey./IL9mABMOoJVSjZHDyqT1yOgsddUe', 'admin', true)
ON CONFLICT (email) DO NOTHING;

-- Comentarios
COMMENT ON TABLE usuarios IS 'Usuarios del sistema con roles (admin, usuario)';
COMMENT ON COLUMN usuarios.rol IS 'Rol del usuario: admin (acceso completo) o usuario (acceso básico)';
COMMENT ON COLUMN usuarios.password_hash IS 'Hash bcrypt de la contraseña del usuario';
COMMENT ON COLUMN usuarios.activo IS 'Indica si el usuario está activo y puede acceder al sistema';
