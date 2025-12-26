-- Script para hacer BACKUP antes de limpiar datos
-- Ejecutar esto PRIMERO para tener una copia de seguridad

-- Crear tablas temporales de backup (si no existen)
CREATE TABLE IF NOT EXISTS legal_documents_backup AS 
SELECT * FROM legal_documents;

CREATE TABLE IF NOT EXISTS legal_analysis_backup AS 
SELECT * FROM legal_analysis;

-- Verificar que el backup se creó correctamente
SELECT 
  'legal_documents_backup' as tabla,
  COUNT(*) as registros
FROM legal_documents_backup
UNION ALL
SELECT 
  'legal_analysis_backup' as tabla,
  COUNT(*) as registros
FROM legal_analysis_backup;

-- Para restaurar desde backup (si algo sale mal):
-- INSERT INTO legal_documents SELECT * FROM legal_documents_backup;
-- INSERT INTO legal_analysis SELECT * FROM legal_analysis_backup;

