# Implementación de `/legal/analyze/:id`

## 📍 Ubicación del código

### 1. API Gateway (Proxy) - `api/src/index.ts`

```typescript
// Línea ~1042
app.all("/legal/analyze/:documentId", async (req, rep) => {
  // Proxy a /analyze/:documentId
  const path = req.url.replace("/legal", "");
  await proxyToLegalDocs(req, rep, path, legalDocsTimeoutMs, LEGAL_DOCS_URL);
});
```

**Timeout del proxy:** `legalDocsTimeoutMs = 110000` (110 segundos)

**Función `proxyToLegalDocs` (línea ~1061):**
```typescript
async function proxyToLegalDocs(req: any, rep: any, path: string, timeoutMs: number, baseUrl: string) {
  try {
    // ... normalización de URL ...
    const targetUrl = `${normalizedUrl}${path}`;
    
    // ... preparación de headers/body ...
    
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: req.method,
        headers: { ...headers, ...(req.headers.authorization && { Authorization: req.headers.authorization }) },
        body: body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }
    
    const responseText = await response.text();
    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }
    
    return rep.status(response.status).send(responseData); // ⚠️ ESPERA la respuesta
  } catch (error) {
    // ... manejo de errores ...
  }
}
```

**⚠️ PROBLEMA:** El proxy está usando `await fetch(...)` y luego `await response.text()`, lo que significa que **ESPERA** la respuesta completa del servicio `legal-docs` antes de responder al frontend.

---

### 2. Legal-Docs Service - `apps/legal-docs/src/index.ts`

```typescript
// Línea ~103
async function handleAnalyze(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const { documentId } = req.params;
    
    console.log(`[ANALYZE] Starting analysis for document: ${documentId}`);
    
    // ✅ Disparar análisis de forma asíncrona (NO espera)
    runFullAnalysis(documentId).catch((error) => {
      console.error(`[ANALYZE] Error en análisis de documento ${documentId}:`, error);
    });

    // ✅ Responde inmediatamente
    res.json({ status: "processing", documentId });
  } catch (err) {
    next(err);
  }
}

app.post("/analyze/:documentId", handleAnalyze);
app.post("/legal/analyze/:documentId", handleAnalyze);
```

**✅ CORRECTO:** El endpoint en `legal-docs` ya está en modo "job":
- Dispara `runFullAnalysis()` sin `await` (fire-and-forget)
- Responde inmediatamente con `{ status: "processing", documentId }`
- El análisis corre en background

---

## 🔍 ANÁLISIS

### Estado actual:
1. ✅ **Legal-docs service:** Ya está en modo job (responde inmediatamente)
2. ⚠️ **API Gateway proxy:** Está esperando la respuesta del servicio (aunque es rápida, técnicamente está bloqueando)

### El problema:
Aunque `legal-docs` responde rápido (porque ya está en modo job), el proxy está usando `await` en el `fetch`, lo que significa:
- El proxy espera la respuesta HTTP completa de `legal-docs`
- Aunque es rápida (~100ms), técnicamente está "bloqueando" el request/response
- Si `legal-docs` tarda en responder (por cualquier razón), el proxy también tarda

### ¿Está realmente bloqueando?
- **Técnicamente SÍ:** El proxy usa `await fetch()` y espera la respuesta
- **En la práctica:** Como `legal-docs` responde inmediatamente, el bloqueo es mínimo (~100-500ms)
- **Pero:** Si `legal-docs` tiene problemas (cold start, timeout interno, etc.), el proxy también se bloquea

---

## 💡 PROPUESTA DE CAMBIO MÍNIMO

El proxy debería:
1. Hacer el `fetch` sin esperar (fire-and-forget) O
2. Mantener el `await` pero asegurarse de que `legal-docs` siempre responda rápido

**Opción recomendada:** Mantener el `await` (porque `legal-docs` ya responde rápido), pero agregar un timeout más corto para el proxy (ej: 5-10 segundos) ya que solo necesita recibir el `{ status: "processing" }`.

**Cambio mínimo sugerido:**
```typescript
// En api/src/index.ts, línea ~1038
const legalDocsTimeoutMs = Number(process.env.LEGAL_DOCS_TIMEOUT_MS || 10000); // 10s para /analyze (solo necesita confirmación)
```

O mejor aún, tener timeouts diferentes por endpoint:
```typescript
const analyzeTimeoutMs = 10000; // 10s - solo necesita confirmación
const resultTimeoutMs = 30000;  // 30s - puede tardar más
```

---

## 📝 CONCLUSIÓN

**Estado actual:**
- ✅ `legal-docs` ya está en modo job (correcto)
- ⚠️ El proxy espera la respuesta (técnicamente bloquea, pero es rápido en práctica)

**Recomendación:**
- Reducir timeout del proxy para `/analyze` a 10s (solo necesita confirmación rápida)
- O mantener como está si funciona bien (el bloqueo es mínimo)

¿Querés que implemente el cambio mínimo o preferís otra solución?

