-- ⚠️ SCRIPT PARA BORRAR DATOS - SOLO DEJAR ÚLTIMOS 3 DOCUMENTOS
-- ⚠️ EJECUTAR SOLO DESPUÉS DE VERIFICAR CON verificar-datos-actuales.sql
-- ⚠️ ESTE SCRIPT ES IRREVERSIBLE - HACER BACKUP ANTES

-- Paso 1: Identificar los IDs de los últimos 3 documentos (los que se MANTIENEN)
-- Estos NO se borran
WITH ultimos_3 AS (
  SELECT id 
  FROM legal_documents 
  ORDER BY created_at DESC 
  LIMIT 3
)

-- Paso 2: Borrar análisis de documentos que NO están en los últimos 3
-- (legal_analysis tiene ON DELETE CASCADE, pero lo hacemos explícito por seguridad)
DELETE FROM legal_analysis
WHERE document_id NOT IN (SELECT id FROM ultimos_3);

-- Paso 3: Borrar documentos que NO están en los últimos 3
-- Esto automáticamente borra los análisis asociados por ON DELETE CASCADE
DELETE FROM legal_documents
WHERE id NOT IN (
  SELECT id 
  FROM legal_documents 
  ORDER BY created_at DESC 
  LIMIT 3
);

-- Paso 4: Verificar resultado (debería quedar solo 3 documentos)
SELECT 
  COUNT(*) as documentos_restantes,
  '✅ Debería ser 3' as verificacion
FROM legal_documents;

-- NOTA: Este script NO borra:
-- - chunks (datos de RAG/knowledge base)
-- - documents (documentos generados)
-- - knowledge_bases (configuración de bases de conocimiento)
-- Solo borra legal_documents y legal_analysis

