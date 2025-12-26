-- Script para verificar el estado actual antes del piloto
-- NO BORRA NADA, solo muestra estadísticas

-- 1. Total de documentos
SELECT 
  COUNT(*) as total_documentos,
  'Total en legal_documents' as descripcion
FROM legal_documents;

-- 2. Documentos con análisis
SELECT 
  COUNT(*) as documentos_con_analisis,
  'Documentos que tienen análisis completo' as descripcion
FROM legal_analysis;

-- 3. Últimos 10 documentos (los más recientes)
SELECT 
  id,
  filename,
  status,
  created_at,
  'Últimos 10 documentos' as nota
FROM legal_documents
ORDER BY created_at DESC
LIMIT 10;

-- 4. Documentos más antiguos (primeros 10)
SELECT 
  id,
  filename,
  status,
  created_at,
  'Documentos más antiguos' as nota
FROM legal_documents
ORDER BY created_at ASC
LIMIT 10;

-- 5. Distribución por estado
SELECT 
  status,
  COUNT(*) as cantidad,
  'Distribución por estado' as descripcion
FROM legal_documents
GROUP BY status
ORDER BY cantidad DESC;

-- 6. Tamaño estimado de la tabla (PostgreSQL)
SELECT 
  pg_size_pretty(pg_total_relation_size('legal_documents')) as tamaño_tabla_documentos,
  pg_size_pretty(pg_total_relation_size('legal_analysis')) as tamaño_tabla_analisis,
  'Tamaño en disco de las tablas' as descripcion;

-- 7. Documentos por día (últimos 7 días)
SELECT 
  DATE(created_at) as fecha,
  COUNT(*) as documentos_ese_dia,
  'Documentos subidos por día' as descripcion
FROM legal_documents
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY fecha DESC;

