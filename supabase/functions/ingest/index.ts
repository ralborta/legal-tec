import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Document, VectorStoreIndex } from "npm:llamaindex@0.11.21"
import { PGVectorStore } from "npm:@llamaindex/postgres@0.0.31"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { items } = await req.json()

    // Validación
    if (!items || !Array.isArray(items)) {
      return new Response(
        JSON.stringify({ error: 'Items array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Database URL para LlamaIndex
    const dbUrl = Deno.env.get('DATABASE_URL')!

    // LlamaIndex setup
    const store = new PGVectorStore({
      clientConfig: { connectionString: dbUrl },
      schemaName: "public",
      tableName: "chunks"
    })

    // Crear documentos
    const docs = items.map(item => new Document({
      text: item.text,
      metadata: {
        source: item.source,
        title: item.title,
        url: item.url,
        ...item.meta
      }
    }))

    // Indexar documentos
    await VectorStoreIndex.fromDocuments(docs, { vectorStore: store })

    return new Response(
      JSON.stringify({ ok: true, count: items.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
