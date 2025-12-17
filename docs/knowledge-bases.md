# Guía de Bases de Conocimiento Adicionales

## 📚 Introducción

El sistema ahora soporta múltiples bases de conocimiento que pueden ser añadidas, gestionadas y utilizadas de forma independiente. Esto permite tener diferentes fuentes de información legal organizadas y filtradas según necesidad.

## 🗄️ Estructura de Base de Datos

### Tabla `knowledge_bases`
Gestiona las bases de conocimiento disponibles:

```sql
CREATE TABLE knowledge_bases (
  id          text PRIMARY KEY,           -- Identificador único
  name        text NOT NULL,               -- Nombre descriptivo
  description text,                        -- Descripción
  source_type text NOT NULL,               -- Tipo: normativa, juris, interno, doctrina, etc.
  enabled     boolean DEFAULT true,        -- Si está habilitada
  metadata    jsonb DEFAULT '{}',          -- Metadata adicional
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
```

### Columna `knowledge_base` en `chunks`
Cada chunk puede estar asociado a una base de conocimiento específica:

```sql
ALTER TABLE chunks ADD COLUMN knowledge_base text;
```

## 🚀 Uso

### 1. Crear una Nueva Base de Conocimiento

```bash
POST /api/knowledge-bases
Content-Type: application/json

{
  "id": "doctrina_wna",
  "name": "Doctrina WNS & Asociados",
  "description": "Base de conocimiento con doctrina específica del estudio",
  "sourceType": "doctrina",
  "enabled": true,
  "metadata": {
    "version": "1.0",
    "lastUpdated": "2024-01-15"
  }
}
```

### 2. Ingresar Documentos a una Base de Conocimiento

```bash
POST /v1/ingest
Content-Type: application/json

{
  "items": [
    {
      "text": "Texto del documento legal...",
      "source": "doctrina",
      "title": "Título del documento",
      "url": "https://ejemplo.com/doc",
      "knowledgeBase": "doctrina_wna",
      "meta": {
        "autor": "Dr. Juan Pérez",
        "año": 2024
      }
    }
  ]
}
```

### 3. Generar Documentos Usando Bases de Conocimiento Específicas

#### Incluir solo ciertas bases:
```bash
POST /v1/generate
Content-Type: application/json

{
  "type": "dictamen",
  "title": "Dictamen sobre...",
  "instructions": "Analizar...",
  "knowledgeBases": ["doctrina_wna", "normativa_principal"]
}
```

#### Excluir ciertas bases:
```bash
POST /v1/generate
Content-Type: application/json

{
  "type": "dictamen",
  "title": "Dictamen sobre...",
  "instructions": "Analizar...",
  "excludeKnowledgeBases": ["jurisprudencia_extranjera"]
}
```

### 4. Listar Bases de Conocimiento Disponibles

```bash
GET /api/knowledge-bases
```

Respuesta:
```json
{
  "knowledgeBases": [
    {
      "id": "normativa_principal",
      "name": "Normativa Principal",
      "description": "Normativa argentina principal",
      "sourceType": "normativa",
      "enabled": true,
      "metadata": {},
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 5. Obtener Estadísticas de una Base

```bash
GET /api/knowledge-bases/doctrina_wna
```

Respuesta:
```json
{
  "id": "doctrina_wna",
  "name": "Doctrina WNS & Asociados",
  "stats": {
    "totalChunks": 150,
    "sourceTypes": {
      "doctrina": 150
    }
  }
}
```

### 6. Habilitar/Deshabilitar una Base

```bash
PATCH /api/knowledge-bases/doctrina_wna/toggle
Content-Type: application/json

{
  "enabled": false
}
```

## 📝 Ejemplos de Casos de Uso

### Caso 1: Base de Conocimiento de Jurisprudencia Extranjera

```bash
# Crear la base
POST /api/knowledge-bases
{
  "id": "jurisprudencia_extranjera",
  "name": "Jurisprudencia Extranjera",
  "description": "Fallos de tribunales internacionales y de otros países",
  "sourceType": "jurisprudencia_extranjera",
  "enabled": true
}

# Ingresar documentos
POST /v1/ingest
{
  "items": [
    {
      "text": "Texto del fallo...",
      "source": "jurisprudencia_extranjera",
      "title": "Corte Internacional de Justicia - Caso XYZ",
      "knowledgeBase": "jurisprudencia_extranjera"
    }
  ]
}

# Usar solo esta base para generar un documento
POST /v1/generate
{
  "type": "dictamen",
  "title": "Análisis de jurisprudencia internacional",
  "instructions": "Analizar jurisprudencia extranjera sobre...",
  "knowledgeBases": ["jurisprudencia_extranjera"]
}
```

### Caso 2: Base de Conocimiento Interna del Estudio

```bash
# Crear base interna
POST /api/knowledge-bases
{
  "id": "interno_wna",
  "name": "Base Interna WNS",
  "description": "Documentos internos, precedentes y plantillas del estudio",
  "sourceType": "interno",
  "enabled": true
}

# Ingresar documentos internos
POST /v1/ingest
{
  "items": [
    {
      "text": "Precedente interno sobre...",
      "source": "interno",
      "title": "Precedente WNA-2024-001",
      "knowledgeBase": "interno_wna"
    }
  ]
}
```

## 🔧 Migración

Para aplicar los cambios a tu base de datos existente:

```bash
# Ejecutar la migración SQL
psql $DATABASE_URL -f sql/002_add_knowledge_bases.sql
```

O si usas Supabase:

```bash
# Subir la migración a Supabase
supabase db push sql/002_add_knowledge_bases.sql
```

## 💡 Mejores Prácticas

1. **Nombres descriptivos**: Usa IDs claros y descriptivos para las bases (ej: `doctrina_wna`, `jurisprudencia_extranjera`)

2. **Metadata útil**: Aprovecha el campo `metadata` para almacenar información adicional como versiones, fechas de actualización, etc.

3. **Organización por tipo**: Agrupa bases de conocimiento por tipo de fuente (`normativa`, `juris`, `doctrina`, etc.)

4. **Habilitación selectiva**: Deshabilita bases que no quieras usar temporalmente en lugar de eliminarlas

5. **Filtrado inteligente**: Usa `knowledgeBases` para incluir solo las bases relevantes y mejorar la precisión de las búsquedas

## 🎯 Ventajas

- ✅ **Organización**: Separa diferentes fuentes de conocimiento
- ✅ **Filtrado**: Busca solo en las bases relevantes
- ✅ **Escalabilidad**: Añade nuevas bases sin afectar las existentes
- ✅ **Control**: Habilita/deshabilita bases según necesidad
- ✅ **Trazabilidad**: Identifica de qué base proviene cada resultado




