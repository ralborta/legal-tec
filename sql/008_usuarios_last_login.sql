-- Usuarios activos: registrar último login para el dashboard
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_last_login_at ON usuarios(last_login_at);
COMMENT ON COLUMN usuarios.last_login_at IS 'Última vez que el usuario inició sesión; se usa para contar usuarios activos (ej. últimos 30 min)';
