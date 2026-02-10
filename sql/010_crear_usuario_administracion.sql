-- Crear usuario con capacidades de administración
-- Email: administracion@wnsasociados.com
-- Contraseña inicial: AdministracionWns2025!
-- IMPORTANTE: Cambiá la contraseña después del primer inicio de sesión.

INSERT INTO usuarios (email, nombre, password_hash, rol, activo)
VALUES (
  'administracion@wnsasociados.com',
  'Administración WNS',
  '$2b$10$ncWljBxSq/YSc3PL64r37OETJTM9mQY4vmrOiel6ftKhKYJ.5S5bO',
  'admin',
  true
)
ON CONFLICT (email) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  password_hash = EXCLUDED.password_hash,
  rol = 'admin',
  activo = true,
  updated_at = NOW();

-- Verificar: debe aparecer con rol = 'admin'
-- SELECT id, email, nombre, rol, activo FROM usuarios WHERE email = 'administracion@wnsasociados.com';
