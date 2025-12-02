# 🎯 Crear Tablas en Railway - Paso a Paso SIN Query

## Método Recomendado: "+ New Table"

### Paso 1: Crear tabla `legal_documents`

1. En Railway, ve a **Postgres** → **Database** → **Data**
2. Click en **"+ New Table"**
3. Nombre de la tabla: `legal_documents`
4. Agregar estas columnas (una por una):

   **Columna 1:**
   - Name: `id`
   - Type: `VARCHAR`
   - Length: `255`
   - ✅ Primary Key
   - ✅ Not Null

   **Columna 2:**
   - Name: `filename`
   - Type: `VARCHAR`
   - Length: `500`
   - ✅ Not Null

   **Columna 3:**
   - Name: `mime_type`
   - Type: `VARCHAR`
   - Length: `100`
   - ✅ Not Null

   **Columna 4:**
   - Name: `raw_path`
   - Type: `TEXT`
   - ✅ Not Null

   **Columna 5:**
   - Name: `created_at`
   - Type: `TIMESTAMP`
   - Default: `NOW()`

5. Click en **"Create Table"**

### Paso 2: Crear tabla `legal_analysis`

1. Click en **"+ New Table"** otra vez
2. Nombre: `legal_analysis`
3. Agregar columnas:

   **Columna 1:**
   - Name: `document_id`
   - Type: `VARCHAR(255)`
   - ✅ Primary Key
   - ✅ Not Null

   **Columna 2:**
   - Name: `type`
   - Type: `VARCHAR(100)`
   - ✅ Not Null

   **Columna 3:**
   - Name: `original`
   - Type: `JSONB`
   - ✅ Not Null

   **Columna 4:**
   - Name: `translated`
   - Type: `JSONB`
   - ✅ Not Null

   **Columna 5:**
   - Name: `checklist`
   - Type: `JSONB`
   - (nullable, sin Not Null)

   **Columna 6:**
   - Name: `report`
   - Type: `TEXT`
   - (nullable)

   **Columna 7:**
   - Name: `created_at`
   - Type: `TIMESTAMP`
   - Default: `NOW()`

4. Click en **"Create Table"**

### Paso 3: Agregar Foreign Key (Relación)

Después de crear ambas tablas:

1. Click en la tabla `legal_analysis`
2. Busca opción para agregar **Foreign Key** o **Constraint**
3. Agregar relación:
   - Column: `document_id`
   - References: `legal_documents(id)`
   - On Delete: `CASCADE`

## ✅ Verificación

Después de crear las tablas, deberías ver:
- ✅ `chunks`
- ✅ `documents`
- ✅ `legal_documents` (nueva)
- ✅ `legal_analysis` (nueva)

## ⚠️ Si no puedes crear Foreign Key

No es crítico. El sistema funcionará igual, solo que no habrá validación automática de integridad referencial.

## 🚀 Alternativa: Usar Railway CLI

Si tienes Railway CLI instalado, es más rápido:

```bash
railway run psql $DATABASE_URL -f sql/003_legal_documents.sql
```

