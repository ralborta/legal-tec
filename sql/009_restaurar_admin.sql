-- Restaurar privilegios de administrador para la cuenta principal
-- Ejecutar en la base de datos (Railway, Supabase, etc.) si el admin quedó como "usuario" por error.

-- Opción 1: Restaurar el admin por defecto (adm@wns.com)
UPDATE usuarios
SET rol = 'admin', activo = true, updated_at = NOW()
WHERE email = 'adm@wns.com';

-- Si tu cuenta de administrador usa otro email, usa esta línea cambiando 'tu-email@ejemplo.com':
-- UPDATE usuarios SET rol = 'admin', activo = true, updated_at = NOW() WHERE email = 'tu-email@ejemplo.com';

-- Verificar: debe devolver 1 fila con rol = 'admin'
-- SELECT id, email, nombre, rol, activo FROM usuarios WHERE email = 'adm@wns.com';
