# 🚀 Ejecutar Migración de `knowledge_bases` en Railway

## ⚠️ IMPORTANTE: Esta tabla es necesaria para que el servicio no crashee

El código ya es resiliente (no crashea si falta), pero **funciona mejor si la tabla existe**.

---

## 📋 Opción A: Railway Dashboard (Más fácil)

### 1. Ve a Railway → Tu proyecto → PostgreSQL service

### 2. Click en "Query" o "SQL Editor"

### 3. Copia y pega este SQL:

```sql
-- Crear tabla knowledge_bases (mínimo indispensable)
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

-- Insertar bases de conocimiento por defecto (opcional)
INSERT INTO knowledge_bases (id, name, description, source_type, enabled) VALUES
  ('normativa_principal', 'Normativa Principal', 'Normativa argentina principal', 'normativa', true),
  ('jurisprudencia_principal', 'Jurisprudencia Principal', 'Jurisprudencia argentina principal', 'juris', true),
  ('interno_principal', 'Base Interna Principal', 'Documentos internos del estudio', 'interno', true)
ON CONFLICT (id) DO NOTHING;

-- Verificar que se creó
SELECT * FROM knowledge_bases;
```

### 4. Click en "Run" o "Execute"

### 5. Deberías ver las 3 bases de conocimiento creadas

---

## 📋 Opción B: Railway CLI (Más rápido)

```bash
# Conectar a la DB y ejecutar migración
railway run psql $DATABASE_URL -f sql/002_add_knowledge_bases.sql
```

O manualmente:

```bash
railway run psql $DATABASE_URL << EOF
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

## ✅ Verificar que funcionó

```bash
railway run psql $DATABASE_URL -c "SELECT id, name, enabled FROM knowledge_bases;"
```

Deberías ver:
```
                id                 |           name            | enabled 
-----------------------------------+---------------------------+---------
 normativa_principal              | Normativa Principal       | t
 jurisprudencia_principal         | Jurisprudencia Principal  | t
 interno_principal                | Base Interna Principal    | t
```

---

## 🎯 Después de ejecutar

1. **Reiniciar el servicio** en Railway (para que tome la nueva tabla)
2. **Probar upload** - debería funcionar sin errores
3. **Probar analyze** - debería funcionar correctamente

---

## 📝 Nota importante

- ✅ El código **YA es resiliente** (no crashea si falta la tabla)
- ✅ Pero funciona **MEJOR** si la tabla existe
- ✅ Los endpoints de knowledge-bases devuelven valores reales en vez de vacíos
- ✅ El RAG puede usar las bases de conocimiento para filtrar mejor

---

## 🔍 Si prefieres NO crear la tabla ahora

El código funciona sin ella, pero:
- Los endpoints `/api/knowledge-bases` devuelven `[]`
- El RAG funciona igual (sin filtrado por knowledge base)
- Todo funciona, solo que sin la funcionalidad de "bases de conocimiento"

**Recomendación**: Crear la tabla es rápido (2 minutos) y evita problemas futuros.

