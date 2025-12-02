# 🚀 Deploy del Servicio Legal-Docs en Railway

## Paso 1: Crear Nuevo Servicio en Railway

1. Ve a tu proyecto en Railway: https://railway.app
2. Click en **"New Service"** o **"Add Service"**
3. Selecciona **"GitHub Repo"** y elige tu repositorio `legal-tec`
4. En la configuración del servicio:
   - **Name**: `legal-docs` (o `legal-docs-service`)
   - **Root Directory**: `apps/legal-docs`
   - **Build Command**: `cd apps/legal-docs && npm install && npm run build`
   - **Start Command**: `cd apps/legal-docs && npm start`

## Paso 2: Configurar Variables de Entorno

En el nuevo servicio `legal-docs`, agregar:

```bash
DATABASE_URL=postgresql://... (el mismo que usa api-gateway)
OPENAI_API_KEY=sk-... (tu clave de OpenAI)
STORAGE_DIR=./storage
PORT=3001
```

**Nota**: Railway asignará automáticamente un `PORT`, pero puedes dejarlo así.

## Paso 3: Obtener la URL del Servicio

Después del deploy, Railway te dará una URL como:
```
https://legal-docs-production.up.railway.app
```
o
```
https://legal-docs-xxxxx.up.railway.app
```

**Esta es tu `LEGAL_DOCS_URL`**

## Paso 4: Configurar en API Gateway

En el servicio `api-gateway` (legal-tec-production), agregar variable de entorno:

```bash
LEGAL_DOCS_URL=https://legal-docs-production.up.railway.app
```

(Reemplazar con la URL real que te dio Railway)

## Paso 5: Ejecutar Migración SQL

En Railway, en el servicio `legal-docs` o `api-gateway`, ejecutar:

```bash
railway run psql $DATABASE_URL -f sql/003_legal_documents.sql
```

O manualmente en la consola de Railway:
- Ir a la pestaña "Data"
- Click en "Query"
- Pegar el contenido de `sql/003_legal_documents.sql`
- Ejecutar

## Verificación

1. Health check del servicio legal-docs:
```bash
curl https://legal-docs-production.up.railway.app/health
```

Debería responder:
```json
{"service":"legal-docs","ok":true}
```

2. Verificar logs del api-gateway:
Deberías ver:
```
[LEGAL-DOCS] Proxy configurado a: https://legal-docs-production.up.railway.app
```

## Estructura Final

```
Railway Project
├── legal-tec-production (api-gateway)
│   └── LEGAL_DOCS_URL=https://legal-docs-production.up.railway.app
│
└── legal-docs-production (nuevo servicio)
    ├── Root: apps/legal-docs
    ├── DATABASE_URL (mismo que api-gateway)
    └── OPENAI_API_KEY
```

## Troubleshooting

- **404 en /legal/upload**: Verificar que `LEGAL_DOCS_URL` esté configurada correctamente
- **502 Bad Gateway**: El servicio legal-docs no está corriendo o la URL es incorrecta
- **Timeout**: Revisar logs del servicio legal-docs para ver dónde se atasca

