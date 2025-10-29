# Variables de entorno para Supabase

## En Supabase Dashboard → Settings → Edge Functions:

### Variables necesarias:
- `OPENAI_API_KEY`: Tu clave de OpenAI
- `DATABASE_URL`: postgresql://postgres:gPuTfBvkQGPDXEcWLtGuGOZAUWHMxDaV@db.ulkmzyujbcqmxavorbbu.supabase.co:5432/postgres

## En Vercel Dashboard → Settings → Environment Variables:

### Variables necesarias:
- `NEXT_PUBLIC_API_URL`: https://ulkmzyujbcqmxavorbbu.supabase.co/functions/v1

## URLs de las Edge Functions:
- Generate: https://ulkmzyujbcqmxavorbbu.supabase.co/functions/v1/generate-doc
- Ingest: https://ulkmzyujbcqmxavorbbu.supabase.co/functions/v1/ingest
