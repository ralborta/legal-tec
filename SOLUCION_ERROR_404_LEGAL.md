# Solución al Error 404 en `/legal/upload`

## Problema

El error 404 indica que el endpoint `/legal/upload` no está disponible. Esto puede deberse a:

1. **Variable de entorno faltante**: `LEGAL_DOCS_URL` no está configurada en Railway
2. **Servicio no deployado**: El servicio `legal-docs` no está corriendo en Railway
3. **Proxy no configurado**: El proxy en el api-gateway no está funcionando correctamente

## Solución Paso a Paso

### 1. Verificar que el servicio `legal-docs` esté deployado

En Railway:
- Crear un nuevo servicio desde GitHub
- Root directory: `apps/legal-docs`
- Build command: `cd apps/legal-docs && npm install && npm run build`
- Start command: `cd apps/legal-docs && npm start`
- Variables de entorno necesarias:
  - `DATABASE_URL` (mismo que otros servicios)
  - `OPENAI_API_KEY`
  - `STORAGE_DIR=./storage`
  - `PORT=3001` (o el que Railway asigne)

### 2. Configurar variable de entorno en api-gateway

En Railway, en el servicio `api-gateway`, agregar:

```
LEGAL_DOCS_URL=https://legal-docs-production.up.railway.app
```

**Importante**: Reemplazar `legal-docs-production.up.railway.app` con la URL real de tu servicio `legal-docs` en Railway.

### 3. Verificar logs

Después de configurar, revisar los logs del `api-gateway`:

- Deberías ver: `[LEGAL-DOCS] Proxy configurado a: https://...`
- Si ves: `[LEGAL-DOCS] LEGAL_DOCS_URL no configurada, rutas /legal/* deshabilitadas` → La variable no está configurada

### 4. Probar el endpoint

```bash
curl -X POST https://tu-api-gateway.railway.app/legal/upload \
  -F "file=@documento.pdf"
```

## Cambios Realizados

Se mejoró el proxy en `api/src/index.ts` para:
- Manejar correctamente `multipart/form-data` (archivos)
- Reenviar archivos usando `form-data`
- Mejor manejo de errores

## Próximos Pasos

1. Deployar el servicio `legal-docs` en Railway
2. Configurar `LEGAL_DOCS_URL` en el api-gateway
3. Ejecutar la migración SQL: `sql/003_legal_documents.sql`
4. Probar el endpoint `/legal/upload`

