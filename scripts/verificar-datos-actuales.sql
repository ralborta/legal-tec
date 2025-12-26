-- Script para VERIFICAR datos actuales antes de borrar
-- NO BORRA NADA, solo muestra qué hay

-- 1. Contar documentos en legal_documents
SELECT 
  COUNT(*) as total_documentos,
  MIN(created_at) as documento_mas_viejo,
  MAX(created_at) as documento_mas_reciente
FROM legal_documents;

-- 2. Ver los últimos 3 documentos (los que se MANTENDRÍAN)
SELECT 
  id,
  filename,
  created_at,
  status
FROM legal_documents
ORDER BY created_at DESC
LIMIT 3;

-- 3. Ver documentos que se BORRARÍAN (todos excepto los últimos 3)
SELECT 
  id,
  filename,
  created_at,
  status
FROM legal_documents
WHERE id NOT IN (
  SELECT id 
  FROM legal_documents 
  ORDER BY created_at DESC 
  LIMIT 3
)
ORDER BY created_at DESC;

-- 4. Contar análisis asociados a documentos que se borrarían
SELECT 
  COUNT(*) as analisis_a_borrar
FROM legal_analysis
WHERE document_id NOT IN (
  SELECT id 
  FROM legal_documents 
  ORDER BY created_at DESC 
  LIMIT 3
);

-- 5. Ver otros datos (chunks, documents generados, etc.)
SELECT 
  'chunks' as tabla,
  COUNT(*) as total
FROM chunks
UNION ALL
SELECT 
  'documents' as tabla,
  COUNT(*) as total
FROM documents
UNION ALL
SELECT 
  'knowledge_bases' as tabla,
  COUNT(*) as total
FROM knowledge_bases;

