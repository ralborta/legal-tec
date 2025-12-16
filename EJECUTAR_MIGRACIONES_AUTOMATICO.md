# 🚀 Ejecutar Migraciones Automáticamente

Hay dos formas de ejecutar las migraciones:

## Opción 1: GitHub Actions (Recomendado)

He creado un workflow de GitHub Actions que ejecutará las migraciones automáticamente cuando:
- Haces push de cambios en `sql/` o `ejecutar-migracion.js`
- O manualmente desde la pestaña "Actions" en GitHub

### Configuración (solo una vez):

1. Ve a tu repositorio en GitHub: https://github.com/ralborta/legal-tec
2. Ve a **Settings** → **Secrets and variables** → **Actions**
3. Click en **"New repository secret"**
4. Agrega:
   - **Name**: `DATABASE_URL`
   - **Value**: Tu `DATABASE_URL` de Railway (cópiala desde Railway → Variables)

### Ejecutar:

**Opción A: Automático**
- Simplemente haz push de cambios en `sql/` o `ejecutar-migracion.js`
- GitHub Actions ejecutará las migraciones automáticamente

**Opción B: Manual**
1. Ve a la pestaña **"Actions"** en GitHub
2. Selecciona el workflow **"Ejecutar Migraciones SQL"**
3. Click en **"Run workflow"** → **"Run workflow"**

## Opción 2: Railway CLI (Manual)

Si prefieres ejecutarlo manualmente desde tu terminal:

```bash
# 1. Autenticarse (solo la primera vez)
railway login

# 2. Ejecutar migraciones
railway run node ejecutar-migracion.js
```

## Verificación

Después de ejecutar las migraciones, verifica que las tablas se crearon:

```bash
railway run psql -c "\dt" | grep -E "(knowledge_bases|legal_documents|legal_analysis)"
```

O desde Railway Dashboard:
1. Ve a tu servicio → **Data** → **Postgres**
2. Click en **"Query"**
3. Ejecuta: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('knowledge_bases', 'legal_documents', 'legal_analysis');`

