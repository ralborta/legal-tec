

## 🔴 EL ERROR

**Síntoma:** El frontend mostraba el error:
```
"Tiempo de espera agotado. Railway puede estar iniciando (cold start) o la subida es lenta. Reintentá en unos segundos."
```

**Causa raíz:** Después de integrar RAG (consulta de jurisprudencia) en el análisis de documentos, el proceso se volvió más lento porque:

1. **RAG sin timeout:** La consulta a la base de conocimiento podía tardar indefinidamente
2. **Frontend con timeout corto:** El timeout era de 60 segundos, insuficiente para el nuevo flujo con RAG
3. **RAG bloqueante:** Si el RAG tardaba mucho, bloqueaba todo el análisis

---

## ✅ LA SOLUCIÓN
# Explicación del Error de Timeout y Solución
### 1. Agregar timeout al RAG (15 segundos)
- Si el RAG tarda más de 15s, devuelve array vacío y continúa sin jurisprudencia
- El análisis NO se bloquea si el RAG falla o tarda

### 2. Aumentar timeout del frontend (60s → 120s)
- Ahora el frontend espera 2 minutos para iniciar el análisis
- Da tiempo suficiente para que el RAG complete (si es rápido) o timeout (si es lento)

### 3. Hacer RAG resiliente
- Si falla, el análisis continúa normalmente
- Si funciona, se incluye jurisprudencia en el reporte

---

## 📁 CÓDIGO INVOLUCRADO

### 1. `apps/legal-docs/src/agents/rag-query.ts`
**Función:** Consulta la base de conocimiento usando búsqueda vectorial

```typescript
import pg from "pg";
const { Client } = pg;
import { VectorStoreIndex } from "llamaindex";
import { PGVectorStore } from "@llamaindex/postgres";

/**
 * Consulta la base de conocimiento (jurisprudencia) usando RAG
 * para encontrar información relevante al documento analizado
 */
export async function queryJurisprudence(
  documentText: string,
  documentType: string,
  maxResults: number = 6
): Promise<Array<{ title: string; text: string; source: string; url?: string }>> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[RAG] DATABASE_URL no configurado, omitiendo consulta de jurisprudencia");
    return [];
  }

  // ⚡ SOLUCIÓN: Timeout de 15 segundos para RAG (no debe bloquear el análisis)
  const RAG_TIMEOUT = 15000;
  
  try {
    // Crear promesa para el RAG
    const ragPromise = (async () => {
      const client = new Client({ connectionString: dbUrl });
      await client.connect();

      const store = new PGVectorStore({
        clientConfig: { connectionString: dbUrl },
        schemaName: "public",
        tableName: "chunks",
      });

      const index = await VectorStoreIndex.fromVectorStore(store);
      const retriever = index.asRetriever({ similarityTopK: maxResults * 2 });

      // Query: buscar jurisprudencia relevante
      const query = `Documento tipo: ${documentType}
    
Contenido del documento:
${documentText.substring(0, 2000)} // ⚡ Optimización: reducir tamaño

Buscar jurisprudencia, normativa y doctrina relevante que pueda ayudar a:
- Identificar riesgos legales
- Comparar cláusulas similares
- Sugerir mejoras basadas en fallos o normativa
- Evaluar cumplimiento legal`;

      const results = await retriever.retrieve(query);

      // Filtrar solo jurisprudencia y normativa relevante
      const filtered = results
        .filter((r) => {
          const source = (r.node.metadata as any)?.source;
          return (
            source === "juris" ||
            source === "jurisprudencia_extranjera" ||
            source === "normativa" ||
            source === "doctrina"
          );
        })
        .slice(0, maxResults);

      const citations = filtered.map((r) => ({
        title: (r.node.metadata as any)?.title || "Fuente legal",
        text: ((r.node as any).text || "").substring(0, 800), // ⚡ Optimización: limitar tamaño
        source: (r.node.metadata as any)?.source || "desconocido",
        url: (r.node.metadata as any)?.url,
      }));

      await client.end();
      return citations;
    })();

    // ⚡ SOLUCIÓN: Aplicar timeout usando Promise.race
    // Si tarda más de 15s, devolver array vacío
    const timeoutPromise = new Promise<Array<{ title: string; text: string; source: string; url?: string }>>((resolve) => {
      setTimeout(() => {
        console.warn("[RAG] Timeout después de 15s, continuando sin jurisprudencia");
        resolve([]); // ⚡ No falla, solo devuelve vacío
      }, RAG_TIMEOUT);
    });

    // ⚡ SOLUCIÓN: Promise.race - el que termine primero gana
    const citations = await Promise.race([ragPromise, timeoutPromise]);
    return citations;
  } catch (error) {
    console.error("[RAG] Error consultando jurisprudencia:", error);
    return []; // ⚡ Si falla, continuar sin jurisprudencia (no bloquea)
  }
}
```

**Cambios clave:**
- ✅ Timeout de 15 segundos usando `Promise.race`
- ✅ Si falla o timeout, devuelve `[]` (no bloquea)
- ✅ Optimización: reducir tamaño de texto consultado (2000 chars)
- ✅ Optimización: limitar tamaño de citas (800 chars)

---

### 2. `apps/legal-docs/src/agents/report.ts`
**Función:** Genera el reporte final del análisis, ahora incluye jurisprudencia

```typescript
import OpenAI from "openai";
import type { DistributionChecklistItem } from "./analyzerDistribution.js";
import type { TranslatedClause } from "./translator.js";
import { queryJurisprudence } from "./rag-query.js"; // ⚡ Importar RAG

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ReportInput {
  original: string;
  translated: TranslatedClause[];
  type: string;
  checklist: { items?: DistributionChecklistItem[] } | null;
}

const prompt = `You are a legal report generator for WNS & Asociados.

Generate a comprehensive legal analysis report in Spanish based on:

1. Original document text (English)
2. Translated clauses (Spanish)
3. Document type classification
4. Analysis checklist (if available)
5. Relevant jurisprudence and legal precedents (if available) // ⚡ NUEVO

The report should include:

- Executive summary
- Document type and key characteristics
- Critical clauses analysis
- Risk assessment (considering relevant jurisprudence) // ⚡ NUEVO
- Legal precedents and jurisprudence analysis (if available) // ⚡ NUEVO
- Recommendations for the client (DISTRIBUTOR perspective)
- Action items

Format: Professional legal report in Spanish, structured with clear sections.
When citing jurisprudence, include the source and URL if available.

Return ONLY the report text, no JSON, no markdown headers.`;

export async function generateReport(input: ReportInput): Promise<string> {
  const startTime = Date.now();
  const timeout = 90000; // 90 segundos timeout
  
  try {
    // ⚡ NUEVO: Consultar jurisprudencia relevante usando RAG
    console.log(`[REPORT] Consultando jurisprudencia para tipo: ${input.type}`);
    const jurisprudence = await queryJurisprudence(
      input.original,
      input.type,
      6 // Máximo 6 resultados
    );
    console.log(`[REPORT] Encontradas ${jurisprudence.length} fuentes de jurisprudencia`);

    const checklistText = input.checklist?.items
      ? input.checklist.items
          .map(
            (item) =>
              `- ${item.key}: ${item.found} (Riesgo: ${item.risk})\n  ${item.comment}`
          )
          .join("\n\n")
      : "No checklist disponible";

    const translatedText = input.translated
      .map((c) => `${c.clause_number}. ${c.title_es}\n${c.body_es}`)
      .join("\n\n")
      .substring(0, 6000);

    // ⚡ NUEVO: Formatear jurisprudencia para el prompt
    const jurisprudenceText = jurisprudence.length > 0
      ? jurisprudence
          .map(
            (j) =>
              `### ${j.title} (${j.source})\n${j.text}${j.url ? `\nFuente: ${j.url}` : ""}`
          )
          .join("\n\n")
      : "No se encontró jurisprudencia relevante para este documento.";

    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content: "You are a legal report generator. Return ONLY the report text in Spanish, professional format.",
          },
          {
            role: "user",
            content: `${prompt}

TIPO DE DOCUMENTO: ${input.type}

TEXTO ORIGINAL (primeros caracteres):
${input.original.substring(0, 2000)}

CLÁUSULAS TRADUCIDAS:
${translatedText}

CHECKLIST DE ANÁLISIS:
${checklistText}

JURISPRUDENCIA Y NORMATIVA RELEVANTE: // ⚡ NUEVO
${jurisprudenceText}`, // ⚡ NUEVO: incluir jurisprudencia en el prompt
          },
        ],
      }, { timeout }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Report generation timeout after 90s")), timeout)
      )
    ]) as any;
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[REPORT] Completed in ${duration}s`);

    const report = response.choices[0]?.message?.content || "No se pudo generar el reporte.";
    return report;
  } catch (error) {
    console.error("Error generando reporte:", error);
    return `Error al generar reporte: ${error instanceof Error ? error.message : "Error desconocido"}`;
  }
}
```

**Cambios clave:**
- ✅ Llama a `queryJurisprudence()` antes de generar el reporte
- ✅ Incluye jurisprudencia en el prompt de OpenAI
- ✅ Si no hay jurisprudencia, continúa normalmente

---

### 3. `apps/legal-docs/src/pipeline.ts`
**Función:** Pipeline completo del análisis (no cambió, pero muestra el flujo)

```typescript
import { legalDb } from "./db.js";
import { getDocumentBuffer } from "./storage.js";
import { ocrAgent } from "./agents/ocr.js";
import { translatorAgent } from "./agents/translator.js";
import { classifierAgent } from "./agents/classifier.js";
import { runDistributionAnalyzer } from "./agents/analyzerDistribution.js";
import { generateReport } from "./agents/report.js"; // ⚡ Este ahora incluye RAG

export async function runFullAnalysis(documentId: string) {
  const startTime = Date.now();
  const MAX_PIPELINE_TIME = 180000; // 3 minutos máximo para todo el pipeline
  
  const pipelineTimeout = setTimeout(() => {
    console.error(`[PIPELINE] TIMEOUT: Analysis exceeded ${MAX_PIPELINE_TIME}ms for document ${documentId}`);
    throw new Error(`Pipeline timeout: analysis took more than ${MAX_PIPELINE_TIME / 1000}s`);
  }, MAX_PIPELINE_TIME);
  
  try {
    const doc = await legalDb.getDocument(documentId);
    if (!doc) {
      throw new Error("Document not found");
    }

    console.log(`[PIPELINE] Starting analysis for document ${documentId}`);
    await updateAnalysisStatus(documentId, "ocr", 10);

    // 1. OCR / Extraer texto
    const fileBuffer = await getDocumentBuffer(documentId);
    if (!fileBuffer) {
      throw new Error("Could not read document file");
    }

    const originalText = await ocrAgent({
      buffer: fileBuffer,
      mimeType: doc.mime_type,
      filename: doc.filename,
    });

    console.log(`[PIPELINE] OCR completed, extracted ${originalText.length} characters`);
    await updateAnalysisStatus(documentId, "translating", 25);

    // 2. Traducción y estructuración
    const translated = await translatorAgent(originalText);
    console.log(`[PIPELINE] Translation completed, ${translated.length} clauses`);
    await updateAnalysisStatus(documentId, "classifying", 40);

    // 3. Clasificación genérica
    const { type } = await classifierAgent(translated);
    console.log(`[PIPELINE] Classification: ${type}`);
    await updateAnalysisStatus(documentId, "analyzing", 60);

    // 4. Router según tipo (por ahora, BASEUS / distribución)
    let checklist: any = null;
    if (type === "distribution_contract") {
      checklist = await runDistributionAnalyzer(translated);
      console.log(`[PIPELINE] Distribution analysis completed`);
    } else {
      checklist = { type, note: "No specific analyzer implemented yet" };
    }
    await updateAnalysisStatus(documentId, "generating_report", 80);

    // 5. Generar reporte (⚡ AQUÍ SE LLAMA AL RAG dentro de generateReport)
    const report = await generateReport({
      original: originalText,
      translated,
      type,
      checklist,
    });
    console.log(`[PIPELINE] Report generated`);
    await updateAnalysisStatus(documentId, "saving", 90);

    // 6. Guardar análisis
    await legalDb.upsertAnalysis({
      documentId,
      type,
      original: { text: originalText },
      translated,
      checklist,
      report,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[PIPELINE] Analysis completed for document ${documentId} in ${duration}s`);
    await updateAnalysisStatus(documentId, "completed", 100);
    clearTimeout(pipelineTimeout);
  } catch (error) {
    clearTimeout(pipelineTimeout);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[PIPELINE] ERROR after ${duration}s:`, error);
    await updateAnalysisStatus(documentId, "error", 0);
    await legalDb.setAnalysisError(
      documentId,
      error instanceof Error ? error.message : "Error desconocido"
    );
    throw error;
  }
}
```

**Flujo:**
1. OCR → 2. Traducción → 3. Clasificación → 4. Checklist → 5. **Reporte (con RAG)** → 6. Guardar

---

### 4. `ui/app/page.tsx` (Frontend)
**Función:** Maneja el upload y polling del análisis

```typescript
// ⚡ SOLUCIÓN: Función helper para timeouts
async function fetchWithTimeout(
  input: RequestInfo | URL, 
  init: RequestInit = {}, 
  timeoutMs = 30000
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ⚡ SOLUCIÓN: Mensaje de error amigable para timeouts
function toUserFriendlyError(err: unknown, fallback: string) {
  if (err && typeof err === "object") {
    const anyErr = err as any;
    const name = anyErr?.name as string | undefined;
    const message = anyErr?.message as string | undefined;
    if (name === "AbortError" || (message && /aborted/i.test(message))) {
      return "Tiempo de espera agotado. Railway puede estar iniciando (cold start) o la subida es lenta. Reintentá en unos segundos.";
    }
    if (message) return message;
  }
  return fallback;
}

const handleUpload = async () => {
  if (!file) {
    setError("Por favor selecciona un archivo PDF");
    return;
  }

  setError(null);
  setAnalyzing(true);
  setProgress(0);
  setStatusLabel("Subiendo…");

  try {
    const formData = new FormData();
    formData.append("file", file);

    // Upload: 120 segundos
    const response = await fetchWithTimeout(`${API}/legal/upload`, {
      method: "POST",
      body: formData,
    }, 120000);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Error al subir archivo (${response.status}): ${errorText || response.statusText || "Sin detalles"}`);
    }

    const data = await response.json();
    setDocumentId(data.documentId);

    // ⚡ SOLUCIÓN: Iniciar análisis con timeout aumentado (60s → 120s)
    setStatusLabel("Iniciando análisis…");
    const analyzeResponse = await fetchWithTimeout(`${API}/legal/analyze/${data.documentId}`, {
      method: "POST",
    }, 120000); // ⚡ ANTES: 60000 (60s), AHORA: 120000 (120s = 2 minutos)

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text().catch(() => "");
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || "Error desconocido" };
      }
      throw new Error(`Error al iniciar análisis (${analyzeResponse.status}): ${errorData.error || errorData.message || "Sin detalles"}`);
    }

    // Iniciar polling para obtener resultados
    setPolling(true);
    pollForResults(data.documentId);
  } catch (err: any) {
    setError(toUserFriendlyError(err, "Error al procesar documento"));
    setAnalyzing(false);
  }
};

const pollForResults = async (docId: string) => {
  const maxAttempts = 60; // ~3 min
  let attempts = 0;

  const poll = async () => {
    try {
      // 1) Obtener status/progreso primero (si existe)
      try {
        const statusRes = await fetchWithTimeout(`${API}/legal/status/${docId}`, {}, 15000);
        if (statusRes.ok) {
          const s = await statusRes.json();
          if (typeof s.progress === "number") setProgress(s.progress);
          if (s.status) setStatusLabel(`Estado: ${s.status}`);
          if (s.status === "error") {
            setError(s.error || "Error durante el análisis");
            setAnalyzing(false);
            setPolling(false);
            return;
          }
        }
      } catch {
        // ignorar: seguimos con /result
      }

      // 2) Intentar obtener resultado
      const response = await fetchWithTimeout(`${API}/legal/result/${docId}`, {}, 15000);
      if (!response.ok) throw new Error(`Error al obtener resultados (${response.status})`);
      const result = await response.json();

      if (result.analysis) {
        setAnalysisResult(result);
        setAnalyzing(false);
        setPolling(false);
        setProgress(100);
        setStatusLabel("Completado");
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(poll, 3000); // Poll cada 3 segundos
      } else {
        setError("Tiempo de espera agotado esperando resultados");
        setAnalyzing(false);
        setPolling(false);
      }
    } catch (err: any) {
      if (attempts < maxAttempts) {
        attempts++;
        setTimeout(poll, 3000);
      } else {
        setError(toUserFriendlyError(err, "Error al obtener resultados"));
        setAnalyzing(false);
        setPolling(false);
      }
    }
  };

  poll();
};
```

**Cambios clave:**
- ✅ Timeout aumentado de 60s a 120s para `/legal/analyze`
- ✅ Mensaje de error amigable para timeouts
- ✅ Polling cada 3 segundos para obtener resultados

---

## 📊 RESUMEN DE CAMBIOS

| Archivo | Cambio | Razón |
|---------|--------|-------|
| `rag-query.ts` | Timeout de 15s con `Promise.race` | Evitar que RAG bloquee el análisis |
| `rag-query.ts` | Devolver `[]` si falla/timeout | Análisis continúa sin jurisprudencia |
| `rag-query.ts` | Reducir tamaño de texto (2000 chars) | Optimizar velocidad de consulta |
| `report.ts` | Llamar a `queryJurisprudence()` | Integrar RAG en el reporte |
| `page.tsx` | Timeout 60s → 120s para `/legal/analyze` | Dar tiempo al RAG |

---

## 🎯 RESULTADO

**Antes:**
- ❌ RAG podía bloquear el análisis indefinidamente
- ❌ Frontend timeout de 60s era insuficiente
- ❌ Error: "Tiempo de espera agotado"

**Después:**
- ✅ RAG tiene timeout de 15s (no bloquea)
- ✅ Frontend timeout de 120s (suficiente)
- ✅ Si RAG falla, análisis continúa sin jurisprudencia
- ✅ Si RAG funciona, reporte incluye jurisprudencia

---

## 🔍 CÓMO FUNCIONA AHORA

1. **Usuario sube PDF** → Frontend espera 120s para iniciar análisis
2. **Backend inicia análisis:**
   - OCR (10s)
   - Traducción (15s)
   - Clasificación (5s)
   - Checklist (20s)
   - **Reporte con RAG:**
     - RAG consulta jurisprudencia (máx 15s)
     - Si RAG completa → incluye jurisprudencia
     - Si RAG timeout/falla → continúa sin jurisprudencia
     - Genera reporte con OpenAI (90s)
3. **Frontend hace polling** cada 3s hasta obtener resultado
4. **Usuario ve reporte** con o sin jurisprudencia (según si RAG funcionó)

---

## 📝 NOTAS TÉCNICAS

- **Promise.race:** Usado para implementar timeout en RAG
- **Resiliencia:** RAG nunca bloquea el análisis
- **Optimización:** Texto reducido para consultas más rápidas
- **UX:** Mensajes de error claros para el usuario

