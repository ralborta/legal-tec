# 🔧 Configuración Correcta - LlamaIndex + Supabase

## ✅ Cambios Implementados

### 1. **Imports Correctos de LlamaIndex**
```typescript
// ✅ CORRECTO
import { PGVectorStore } from "llamaindex/vector-stores/pgvector";
import { OpenAIEmbedding, Settings } from "llamaindex";

// ❌ INCORRECTO (anterior)
import { PGVectorStore } from "@llamaindex/postgres";
```

### 2. **Embedding Model Configurado**
```typescript
Settings.embedModel = new OpenAIEmbedding({
  apiKey: openaiKey,
  model: "text-embedding-3-small" // 1536 dimensiones
});
```

### 3. **Schema SQL Optimizado**
- Tabla `chunks` con estructura compatible con LlamaIndex
- `id` como TEXT (LlamaIndex lo maneja)
- `embedding vector(1536)` para text-embedding-3-small
- Índice `ivfflat` con 100 lists (balance rendimiento/precisión)

---

## 🔒 Connection String con SSL

### **Para Railway (Variables de Entorno):**

```bash
DATABASE_URL=postgresql://postgres:PASSWORD@db.ulkmzyujbcqmxavorbbu.supabase.co:5432/postgres?sslmode=require
```

**⚠️ IMPORTANTE:** Agrega `?sslmode=require` al final.

---

## 🏊‍♂️ Pooler de Supabase (Producción)

### **Connection String del Pooler:**

En Supabase Dashboard → Settings → Database → Connection Pooling

Usa la URL del **pooler** (puerto diferente, típicamente 6543):

```
postgresql://postgres:PASSWORD@db.ulkmzyujbcqmxavorbbu.supabase.co:6543/postgres?sslmode=require&pgbouncer=true
```

**Ventajas del Pooler:**
- ✅ Evita saturar conexiones (límite de Supabase: ~60 conexiones directas)
- ✅ Útil para ingestas masivas/embeddings
- ✅ Mejor rendimiento en producción

---

## 📊 Estructura de Datos

### **Tabla `chunks` (LlamaIndex):**
```sql
chunks (
  id        TEXT PRIMARY KEY,      -- LlamaIndex lo genera
  doc_id    TEXT,                  -- ID documento original
  content   TEXT,                  -- Texto del chunk
  metadata  JSONB,                 -- {source, title, url, ...}
  embedding vector(1536),          -- Embedding vectorial
  created_at timestamptz
)
```

### **Metadata Ejemplo:**
```json
{
  "source": "normativa",
  "title": "CCyC Art. 765",
  "url": "https://...",
  "vigencia": "2024"
}
```

---

## 🔐 Seguridad

### **⚠️ CRÍTICO - Credenciales Expuestas:**

Las siguientes credenciales fueron compartidas en el chat y **DEBEN SER ROTADAS**:

1. **Database Password:** `gPuTfBvkQGPDXEcWLtGuGOZAUWHMxDaV`
   - Cambiar en: Supabase Dashboard → Settings → Database → Reset database password

2. **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - Cambiar en: Supabase Dashboard → Settings → API → Regenerate keys

### **Mejores Prácticas:**

1. ✅ **Nunca commitear** `.env` o credenciales
2. ✅ **Usar variables de entorno** en Railway/Vercel
3. ✅ **Rotar credenciales** periódicamente
4. ✅ **No compartir** credenciales en chats/documentos públicos

---

## 🔄 RLS (Row Level Security)

**⚠️ IMPORTANTE:** Al conectar **directo a PostgreSQL** (usando `DATABASE_URL`), estás **fuera** de RLS/Auth de Supabase.

### **Opciones:**

1. **Mantener conexión directa** (actual):
   - ✅ Más rápido
   - ❌ Sin RLS/Auth por usuario
   - ✅ Ideal para backend privado

2. **Usar Supabase Client SDK:**
   - ✅ RLS habilitado
   - ✅ Auth por usuario
   - ❌ Más lento (vía API REST)

**Para este proyecto:** Conexión directa está bien (backend privado en Railway).

---

## 📦 Dependencies

### **Remover `@llamaindex/postgres` (si está):**
```bash
npm uninstall @llamaindex/postgres
```

Ya no es necesario - usamos el path interno de `llamaindex`.

---

## ✅ Checklist Final

- [x] Imports corregidos (`llamaindex/vector-stores/pgvector`)
- [x] Embedding model configurado (`text-embedding-3-small`)
- [x] Schema SQL optimizado
- [x] Connection string con `sslmode=require`
- [x] Documentación de seguridad
- [ ] ⚠️ **Rotar credenciales expuestas**
- [ ] Configurar pooler en producción
- [ ] Probar conexión Railway → Supabase

---

## 🚀 Próximos Pasos

1. **Actualizar Railway:**
   ```
   DATABASE_URL=postgresql://postgres:PASSWORD@db.ulkmzyujbcqmxavorbbu.supabase.co:5432/postgres?sslmode=require
   ```

2. **Ejecutar SQL optimizado** en Supabase:
   - Usar `sql/001_init_optimized.sql`

3. **Rotar credenciales** (urgente)

4. **Probar ingest y generate** endpoints

---

**¿Todo claro? ¿Alguna pregunta?** 🔧
