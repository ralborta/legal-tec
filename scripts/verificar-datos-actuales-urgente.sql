-- Script URGENTE para verificar qué datos hay realmente en la DB
-- Ejecutar esto PRIMERO para entender qué pasó

-- 1. Total de documentos en legal_documents
SELECT 
  COUNT(*) as total_documentos,
  'Total documentos en legal_documents' as descripcion
FROM legal_documents;

-- 2. Total de análisis en legal_analysis
SELECT 
  COUNT(*) as total_analisis,
  'Total análisis en legal_analysis' as descripcion
FROM legal_analysis;

-- 3. Documentos con análisis (JOIN)
SELECT 
  COUNT(*) as documentos_con_analisis,
  'Documentos que tienen análisis completo' as descripcion
FROM legal_documents d
INNER JOIN legal_analysis a ON d.id = a.document_id;

-- 4. Documentos SIN análisis
SELECT 
  COUNT(*) as documentos_sin_analisis,
  'Documentos que NO tienen análisis' as descripcion
FROM legal_documents d
LEFT JOIN legal_analysis a ON d.id = a.document_id
WHERE a.document_id IS NULL;

-- 5. Últimos 5 documentos (más recientes)
SELECT 
  d.id,
  d.filename,
  d.status,
  d.created_at,
  CASE 
    WHEN a.document_id IS NOT NULL THEN 'Tiene análisis'
    ELSE 'Sin análisis'
  END as tiene_analisis
FROM legal_documents d
LEFT JOIN legal_analysis a ON d.id = a.document_id
ORDER BY d.created_at DESC
LIMIT 5;

-- 6. Documentos más antiguos (primeros 5)
SELECT 
  d.id,
  d.filename,
  d.status,
  d.created_at,
  CASE 
    WHEN a.document_id IS NOT NULL THEN 'Tiene análisis'
    ELSE 'Sin análisis'
  END as tiene_analisis
FROM legal_documents d
LEFT JOIN legal_analysis a ON d.id = a.document_id
ORDER BY d.created_at ASC
LIMIT 5;

-- 7. Distribución por fecha (últimos 7 días)
SELECT 
  DATE(created_at) as fecha,
  COUNT(*) as documentos_ese_dia,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completados,
  COUNT(CASE WHEN status = 'processing' THEN 1 END) as procesando,
  COUNT(CASE WHEN status = 'error' THEN 1 END) as errores
FROM legal_documents
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY fecha DESC;

