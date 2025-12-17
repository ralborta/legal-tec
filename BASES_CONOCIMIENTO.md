# 📚 Sistema de Bases de Conocimiento Adicionales

## ✅ Implementación Completada

Se ha añadido un sistema completo para gestionar múltiples bases de conocimiento adicionales en el proyecto Legal-Tec1.

## 🎯 Funcionalidades Añadidas

### 1. **Base de Datos**
- ✅ Nueva tabla `knowledge_bases` para gestionar bases de conocimiento
- ✅ Columna `knowledge_base` en la tabla `chunks` para asociar documentos
- ✅ Índices optimizados para búsquedas eficientes
- ✅ Migración SQL lista: `sql/002_add_knowledge_bases.sql`

### 2. **Backend API**
- ✅ Endpoint `GET /api/knowledge-bases` - Listar todas las bases
- ✅ Endpoint `GET /api/knowledge-bases/:id` - Obtener una base específica con estadísticas
- ✅ Endpoint `POST /api/knowledge-bases` - Crear/actualizar una base
- ✅ Endpoint `PATCH /api/knowledge-bases/:id/toggle` - Habilitar/deshabilitar
- ✅ Endpoint `POST /v1/ingest` - Actualizado para aceptar `knowledgeBase`
- ✅ Endpoint `POST /v1/generate` - Actualizado para filtrar por `knowledgeBases` o `excludeKnowledgeBases`

### 3. **Frontend**
- ✅ Selector de bases de conocimiento en el panel de generación
- ✅ Carga automática de bases disponibles
- ✅ Interfaz para seleccionar múltiples bases
- ✅ Solo visible cuando se usa RAG (no para memos)

### 4. **Documentación**
- ✅ Guía completa en `docs/knowledge-bases.md`
- ✅ Ejemplos de uso y casos prácticos

## 🚀 Cómo Usar

### Paso 1: Aplicar la Migración

```bash
# Si usas PostgreSQL directamente
psql $DATABASE_URL -f sql/002_add_knowledge_bases.sql

# Si usas Supabase
supabase db push sql/002_add_knowledge_bases.sql
```

### Paso 2: Crear una Nueva Base de Conocimiento

```bash
curl -X POST https://tu-api.railway.app/api/knowledge-bases \
  -H "Content-Type: application/json" \
  -d '{
    "id": "doctrina_wna",
    "name": "Doctrina WNS & Asociados",
    "description": "Base de conocimiento con doctrina específica del estudio",
    "sourceType": "doctrina",
    "enabled": true
  }'
```

### Paso 3: Ingresar Documentos a la Base

```bash
curl -X POST https://tu-api.railway.app/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "text": "Texto del documento legal...",
        "source": "doctrina",
        "title": "Título del documento",
        "knowledgeBase": "doctrina_wna"
      }
    ]
  }'
```

### Paso 4: Usar la Base en la Generación

En el frontend, cuando generes un documento con RAG:
1. Desmarcá "Usar generador de memos (sin RAG)"
2. Seleccioná las bases de conocimiento que querés usar
3. Generá el documento normalmente

O vía API:

```bash
curl -X POST https://tu-api.railway.app/v1/generate \
  -H "Content-Type: application/json" \
  -d '{
    "type": "dictamen",
    "title": "Dictamen sobre...",
    "instructions": "Analizar...",
    "knowledgeBases": ["doctrina_wna", "normativa_principal"]
  }'
```

## 📋 Archivos Modificados/Creados

### Nuevos Archivos
- `sql/002_add_knowledge_bases.sql` - Migración de base de datos
- `api/src/knowledge-bases.ts` - Funciones de gestión de bases
- `docs/knowledge-bases.md` - Documentación completa
- `BASES_CONOCIMIENTO.md` - Este archivo

### Archivos Modificados
- `api/src/ingest.ts` - Soporte para `knowledgeBase`
- `api/src/generate.ts` - Filtrado por bases de conocimiento
- `api/src/index.ts` - Nuevos endpoints
- `ui/app/page.tsx` - Selector de bases en el frontend

## 💡 Ejemplos de Casos de Uso

### Caso 1: Base de Jurisprudencia Extranjera
```json
{
  "id": "jurisprudencia_extranjera",
  "name": "Jurisprudencia Extranjera",
  "sourceType": "jurisprudencia_extranjera"
}
```

### Caso 2: Base Interna del Estudio
```json
{
  "id": "interno_wna",
  "name": "Base Interna WNS",
  "sourceType": "interno"
}
```

### Caso 3: Base de Doctrina Especializada
```json
{
  "id": "doctrina_comercial",
  "name": "Doctrina Comercial",
  "sourceType": "doctrina"
}
```

## 🔧 Próximos Pasos Sugeridos

1. **Compilar el código TypeScript**:
   ```bash
   cd api
   npm run build
   ```

2. **Probar los endpoints** con Postman o curl

3. **Añadir más bases de conocimiento** según necesidad

4. **Monitorear el rendimiento** de las búsquedas con múltiples bases

## 📝 Notas Importantes

- Las bases de conocimiento solo funcionan con el endpoint `/v1/generate` (RAG)
- El endpoint `/api/memos/generate` no usa bases de conocimiento (usa el contenido del PDF directamente)
- Si no seleccionás ninguna base, se buscará en todas las disponibles
- Las bases deshabilitadas no aparecen en el selector del frontend

## 🎉 ¡Listo para Usar!

El sistema está completamente implementado y listo para añadir bases de conocimiento adicionales. Consultá `docs/knowledge-bases.md` para más detalles y ejemplos.




