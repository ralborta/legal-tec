# 🚀 Migración Rápida: Crear tabla `knowledge_bases`

## ⚡ Método más rápido (2 minutos)

### Paso 1: Abrir Railway Dashboard

1. Ve a [railway.app](https://railway.app)
2. Selecciona tu proyecto
3. Click en el servicio **PostgreSQL** (no el API, la base de datos)

### Paso 2: Abrir Query Editor

1. En la pestaña del servicio PostgreSQL, busca **"Query"** o **"SQL Editor"**
2. Click para abrir el editor SQL

### Paso 3: Copiar y pegar este SQL

```sql
-- Crear tabla knowledge_bases
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

-- Verificar
SELECT id, name, enabled FROM knowledge_bases;
```

### Paso 4: Ejecutar

1. Click en **"Run"** o **"Execute"**
2. Deberías ver un mensaje de éxito
3. Y al final, 3 filas con las bases de conocimiento

### Paso 5: Reiniciar servicios

1. Ve a tu servicio **API** (legal-tec)
2. Click en **"Restart"** o **"Redeploy"**
3. Espera a que termine de reiniciar

---

## ✅ Verificación

Después de reiniciar, probá:

```bash
curl https://TU_API_URL/api/knowledge-bases
```

Deberías ver:
```json
{
  "knowledgeBases": [
    {
      "id": "normativa_principal",
      "name": "Normativa Principal",
      "enabled": true
    },
    ...
  ]
}
```

---

## 🎯 Resultado esperado

- ✅ El servicio **NO crashea** más
- ✅ Upload funciona correctamente
- ✅ Analyze funciona correctamente
- ✅ Endpoints de knowledge-bases devuelven datos reales

---

## 📝 Nota

Si no encontrás el botón "Query" en Railway:
- Buscá "Data" → "Query"
- O "SQL Editor"
- O "Database" → "Query"

Si no está disponible, usá Railway CLI (ver método alternativo abajo).

---

## 🔄 Método alternativo: Railway CLI

Si preferís usar CLI:

```bash
# 1. Instalar Railway CLI (si no lo tenés)
npm i -g @railway/cli

# 2. Login
railway login

# 3. Link al proyecto
railway link

# 4. Ejecutar migración
railway run psql $DATABASE_URL -f crear-knowledge-bases.sql
```

O directamente:

```bash
railway run psql $DATABASE_URL << 'EOF'
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

INSERT INTO knowledge_bases (id, name, description, source_type, enabled) VALUES
  ('normativa_principal', 'Normativa Principal', 'Normativa argentina principal', 'normativa', true),
  ('jurisprudencia_principal', 'Jurisprudencia Principal', 'Jurisprudencia argentina principal', 'juris', true),
  ('interno_principal', 'Base Interna Principal', 'Documentos internos del estudio', 'interno', true)
ON CONFLICT (id) DO NOTHING;
EOF
```

---

## 🆘 Si algo falla

1. Verifica que estás en la DB correcta (la que usa `DATABASE_URL`)
2. Verifica que tienes permisos de escritura
3. Si ves "relation already exists" → la tabla ya existe, está bien
4. Si ves otro error → copiá el mensaje y te ayudo

