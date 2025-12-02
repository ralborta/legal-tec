# 🚀 Ejecutar Migración SQL - Instrucciones

## Opción 1: Usar Railway CLI (Recomendado)

### Paso 1: Login en Railway CLI

```bash
railway login
```

Esto abrirá tu navegador para autenticarte.

### Paso 2: Vincular proyecto (si es necesario)

```bash
cd /Users/ralborta/Legal-Tec1
railway link
```

Selecciona tu proyecto `legal-tec`.

### Paso 3: Ejecutar migración

```bash
railway run psql $DATABASE_URL -f sql/003_legal_documents.sql
```

O usando el script Node.js:

```bash
railway run node ejecutar-migracion.js
```

## Opción 2: Ejecutar desde Railway Dashboard

1. Ve a Railway → Tu proyecto → Servicio `legal-docs` o `legal-tec`
2. Pestaña **"Deployments"**
3. Click en el deployment más reciente
4. Click en **"Shell"** o **"Terminal"**
5. Ejecuta:

```bash
psql $DATABASE_URL -f sql/003_legal_documents.sql
```

O:

```bash
node ejecutar-migracion.js
```

## Opción 3: Usar "+ New Table" en Railway (Sin SQL)

Si prefieres crear las tablas manualmente desde la UI, sigue las instrucciones en `CREAR_TABLAS_RAILWAY_PASO_A_PASO.md`.

## ✅ Verificación

Después de ejecutar, verifica en Railway → Postgres → Database → Data que aparezcan:
- ✅ `chunks`
- ✅ `documents`
- ✅ `legal_documents` (nueva)
- ✅ `legal_analysis` (nueva)

