import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Document, VectorStoreIndex } from "npm:llamaindex@0.11.21"
import { PGVectorStore } from "npm:@llamaindex/postgres@0.0.31"
import OpenAI from "npm:openai@4.57.0"

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
    const { type, title, instructions, k = 6 } = await req.json()

    // Validación
    if (!type || !title || !instructions) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Database URL para LlamaIndex
    const dbUrl = Deno.env.get('DATABASE_URL')!

    // Templates
    const TPL = {
      dictamen: `# Dictamen – {{titulo}}

## Antecedentes
{{antecedentes}}

## Análisis Legal
{{analisis}}

## Conclusiones
{{conclusiones}}

## Recomendaciones
{{recomendaciones}}

## Citas
{{citas}}`,
      contrato: `# Contrato – {{titulo}}

## Partes
{{partes}}

## Objeto
{{objeto}}

## Términos y Condiciones
{{terminos}}

## Cláusulas Especiales
{{clausulas}}

## Citas
{{citas}}`,
      memo: `# Memorándum – {{titulo}}

## Asunto
{{asunto}}

## Análisis
{{analisis}}

## Recomendaciones
{{recomendaciones}}

## Citas
{{citas}}`,
      escrito: `# Escrito Judicial – {{titulo}}

## Hechos
{{hechos}}

## Derecho Aplicable
{{derecho}}

## Fundamentos
{{fundamentos}}

## Petitorio
{{petitorio}}

## Citas
{{citas}}`
    }

    // LlamaIndex setup
    const store = new PGVectorStore({
      clientConfig: { connectionString: dbUrl },
      schemaName: "public",
      tableName: "chunks"
    })

    const index = await VectorStoreIndex.fromVectorStore(store)
    const retriever = index.asRetriever({ similarityTopK: k })

    // Búsqueda semántica
    const query = `Instrucciones: ${instructions}
Quiero normativa (artículos exactos + fuente/vigencia) y jurisprudencia (tribunal, año, holding, enlace si existe).
Si no hay evidencia suficiente, marcá [REVISAR].`

    const results = await retriever.retrieve(query)

    // Construir contexto
    const context = results.map(r => {
      const text = (r.node as any).text || ''
      return `### ${r.node.metadata?.title || "Fuente"}
${text}
[${r.node.metadata?.source||"fuente"}](${r.node.metadata?.url||"#"})`
    }).join("\n\n")

    const citations = results.map(r => ({
      source: r.node.metadata?.source,
      title: r.node.metadata?.title,
      url: r.node.metadata?.url
    }))

    const tpl = TPL[type as keyof typeof TPL] ?? TPL.dictamen

    // Generar con OpenAI
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! })
    
    const sys = `Sos un asistente legal. Usá SOLO el contexto. No inventes. Respetá la plantilla. Devuelve un JSON con los campos {{...}}.`
    const user = `
PLANTILLA:
${tpl}

CONTEXTO:
${context}

TAREA:
Rellená la plantilla para el título "${title}".
Devolvé JSON con las claves que aparecen en {{...}} (según la plantilla).
Si falta evidencia, marcá [REVISAR] en la sección correspondiente.`

    const chat = await openai.chat.completions.create({
      model: "gpt-4",
      temperature: 0.2,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ]
    })

    const data = JSON.parse(chat.choices[0].message!.content!)

    // Componer markdown
    let md = tpl
    Object.entries(data).forEach(([k, v]) => {
      md = md.replaceAll(`{{${k}}}`, String(v ?? ""))
    })
    
    if (md.includes("{{citas}}")) {
      const list = citations.map(c => `- ${c.title||""} (${c.source||""}) ${c.url||""}`).join("\n")
      md = md.replaceAll("{{citas}}", list)
    }

    // Guardar en Supabase
    const { error } = await supabase
      .from('documents')
      .insert({
        type,
        title,
        content_md: md,
        citations: JSON.stringify(citations)
      })

    if (error) {
      throw new Error(`Supabase error: ${error.message}`)
    }

    return new Response(
      JSON.stringify({ markdown: md, citations }),
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
