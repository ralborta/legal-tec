# 📝 Ejecutar Migración SQL en Railway

## Paso a Paso

### 1. En Railway, ve a la pestaña "Query"

1. Estás en la pestaña **"Data"** (ya la veo abierta)
2. Busca el botón **"Query"** o **"SQL Query"** (debería estar cerca de "Connect" o en la parte superior)
3. Click en **"Query"**

### 2. Copia y pega este SQL

Copia TODO este código SQL:

```sql
-- Crear tabla para gestionar las bases de conocimiento disponibles
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  source_type text NOT NULL,
  enabled     boolean DEFAULT true,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Insertar bases de conocimiento por defecto
INSERT INTO knowledge_bases (id, name, description, source_type, enabled) VALUES
  ('normativa_principal', 'Normativa Principal', 'Normativa argentina principal', 'normativa', true),
  ('jurisprudencia_principal', 'Jurisprudencia Principal', 'Jurisprudencia argentina principal', 'juris', true),
  ('interno_principal', 'Base Interna Principal', 'Documentos internos del estudio', 'interno', true)
ON CONFLICT (id) DO NOTHING;
```

### 3. Ejecuta el Query

1. Pega el SQL en el editor
2. Click en **"Run"** o **"Execute"**
3. Deberías ver un mensaje de éxito

### 4. Verificar

Después de ejecutar, deberías ver una nueva tabla **"knowledge_bases"** junto a "chunks" y "documents".

## Si no encuentras el botón "Query"

Alternativa: Usa el botón **"+ New Table"** y crea la tabla manualmente con estos campos:

- `id` (text, PRIMARY KEY)
- `name` (text, NOT NULL)
- `description` (text)
- `source_type` (text, NOT NULL)
- `enabled` (boolean, DEFAULT true)
- `metadata` (jsonb, DEFAULT '{}')
- `created_at` (timestamptz, DEFAULT now())
- `updated_at` (timestamptz, DEFAULT now())

Pero es más fácil usar el Query con el SQL completo.

