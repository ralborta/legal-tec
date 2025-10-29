# Supabase Migration Guide

## 🚀 Pasos para migrar a Supabase

### 1. Crear proyecto Supabase
1. Ve a [supabase.com](https://supabase.com)
2. Sign in con GitHub
3. "New project"
4. Name: `legal-tec`
5. Database Password: (guárdala)
6. Region: `South America (São Paulo)`
7. "Create new project"

### 2. Ejecutar migración SQL
1. Ve a **SQL Editor** en Supabase
2. Copia y pega el contenido de `supabase/migrations/001_init.sql`
3. Ejecuta el script

### 3. Configurar Edge Functions
1. Instala Supabase CLI:
   ```bash
   npm install -g supabase
   ```
2. Login:
   ```bash
   supabase login
   ```
3. Link proyecto:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
4. Deploy functions:
   ```bash
   supabase functions deploy generate-doc
   supabase functions deploy ingest
   ```

### 4. Variables de entorno
En Supabase Dashboard → Settings → Edge Functions:
- `OPENAI_API_KEY`: Tu clave de OpenAI
- `DATABASE_URL`: `postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres`

### 5. Actualizar frontend
Cambiar en Vercel:
- `NEXT_PUBLIC_API_URL`: `https://YOUR_PROJECT_REF.supabase.co/functions/v1`

## ✅ Resultado
- ✅ PostgreSQL con pgvector funcionando
- ✅ LlamaIndex funcionando al 100%
- ✅ Edge Functions para API
- ✅ Dashboard funcionando
