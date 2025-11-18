# 🔧 Troubleshooting Railway - Error 405

## ❌ Error 405: Method Not Allowed

Este error significa que el servidor recibió la request pero el método HTTP no está permitido. **NO es un problema de variables de entorno faltantes.**

---

## ✅ Checklist para Railway

### 1. **Variables de Entorno en Railway**

Ve a tu proyecto en Railway → **Variables** y verifica que tengas:

```
OPENAI_API_KEY=sk-xxxxx... (tu clave de OpenAI)
DATABASE_URL=postgresql://... (si usas Postgres en Railway)
PORT=3000 (opcional, Railway lo asigna automáticamente)
```

**⚠️ IMPORTANTE:** Si falta `OPENAI_API_KEY`, el servidor dará error **500**, no 405.

---

### 2. **Verificar que el Build Funcionó**

En Railway → **Deployments** → Último deployment:

1. **¿El build pasó?** (debe decir "Build succeeded")
2. **¿Hay errores en los logs?** Click en "View Logs"

**Errores comunes:**
- `Cannot find module '@fastify/multipart'` → Dependencias no instaladas
- `Cannot find module './memos/generate-memo.js'` → Build falló
- `Error: Cannot find module` → Archivos no compilados

---

### 3. **Verificar que el Servidor Está Corriendo**

En Railway → **Deployments** → **Logs**:

Busca estas líneas:
```
Server listening at http://0.0.0.0:3000
```

Si NO ves esto, el servidor no arrancó correctamente.

**Errores comunes:**
- `Error: listen EADDRINUSE` → Puerto ocupado
- `Error: Cannot find module` → Dependencias faltantes
- `SyntaxError` → Error en el código compilado

---

### 4. **Verificar la URL Pública**

En Railway → **Settings** → **Networking**:

1. **¿Tienes un dominio público?** (ej: `legal-tec-production.up.railway.app`)
2. **¿El servicio está expuesto?** (debe estar en "Public")

**URL correcta:**
```
https://legal-tec-production.up.railway.app
```

**NO uses:**
- `http://` (debe ser `https://`)
- URL con puerto (ej: `:3000`)

---

### 5. **Probar el Endpoint Directamente**

Abre una terminal y prueba:

```bash
# Health check (debe funcionar)
curl https://tu-railway-url.railway.app/health

# Debe responder: {"ok":true}
```

Si el health check funciona pero los otros endpoints dan 405, el problema es con el routing.

---

### 6. **Verificar CORS**

El error 405 también puede ser un problema de CORS mal configurado.

En `api/src/index.ts`, verifica que tengas:

```typescript
await app.register(cors, {
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    /\.vercel\.app$/,  // ← Esto debe incluir tu dominio de Vercel
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
});
```

**Si tu dominio de Vercel es diferente**, agrégalo explícitamente:

```typescript
origin: [
  "http://localhost:3000",
  "https://legal-tec-nwnf.vercel.app",  // ← Tu dominio de Vercel
  /\.vercel\.app$/,
],
```

---

## 🔍 Diagnóstico Rápido

### Paso 1: Verificar Health Check

```bash
curl https://tu-railway-url.railway.app/health
```

**Si responde `{"ok":true}`:**
- ✅ El servidor está corriendo
- ✅ El problema es con los endpoints específicos

**Si NO responde o da error:**
- ❌ El servidor no está corriendo
- ❌ Revisa los logs de Railway

---

### Paso 2: Verificar Endpoints

```bash
# Probar /v1/generate
curl -X POST https://tu-railway-url.railway.app/v1/generate \
  -H "Content-Type: application/json" \
  -d '{"type":"dictamen","title":"Test","instructions":"Test"}'

# Probar /api/memos/generate
curl -X POST https://tu-railway-url.railway.app/api/memos/generate \
  -F "tipoDocumento=Memo" \
  -F "titulo=Test" \
  -F "instrucciones=Test"
```

**Si ambos dan 405:**
- El servidor está corriendo pero los endpoints no se registraron
- Revisa los logs para ver si hay errores al arrancar

---

### Paso 3: Revisar Logs de Railway

En Railway → **Deployments** → **Logs**:

Busca:
1. **Errores al iniciar:** `Error:`, `Cannot find module`, `SyntaxError`
2. **Mensajes de registro:** `Server listening at...`
3. **Errores de importación:** `Cannot find module './memos/generate-memo.js'`

---

## 🚨 Problemas Comunes y Soluciones

### Problema 1: "Cannot find module '@fastify/multipart'"

**Causa:** Dependencias no instaladas en Railway

**Solución:**
1. Verifica que `package.json` tenga `@fastify/multipart`
2. Fuerza un nuevo build en Railway (redeploy)
3. Verifica que `npm ci` se ejecute correctamente

---

### Problema 2: "Cannot find module './memos/generate-memo.js'"

**Causa:** El build no compiló los archivos nuevos

**Solución:**
1. Verifica que `tsconfig.json` incluya `api/src/**/*.ts`
2. Fuerza un nuevo build
3. Verifica que `dist/memos/generate-memo.js` exista después del build

---

### Problema 3: El servidor arranca pero los endpoints dan 405

**Causa:** Los endpoints no se registraron correctamente

**Solución:**
1. Revisa los logs para ver si hay errores al registrar endpoints
2. Verifica que `app.post()` se ejecute antes de `app.listen()`
3. Verifica que no haya errores de sintaxis en los handlers

---

### Problema 4: CORS bloqueando las requests

**Causa:** El dominio de Vercel no está en la lista de CORS

**Solución:**
1. Agrega tu dominio de Vercel explícitamente en `origin`
2. O verifica que el regex `/\.vercel\.app$/` funcione
3. Redeploy el backend

---

## 📋 Checklist Final

Antes de reportar el problema, verifica:

- [ ] `OPENAI_API_KEY` está configurada en Railway
- [ ] El build en Railway pasó sin errores
- [ ] El servidor está corriendo (health check funciona)
- [ ] La URL pública de Railway está correcta
- [ ] CORS incluye tu dominio de Vercel
- [ ] Los logs no muestran errores al arrancar
- [ ] `NEXT_PUBLIC_API_URL` en Vercel apunta a Railway

---

## 🆘 Si Nada Funciona

1. **Revisa los logs completos** de Railway (últimos 1000 líneas)
2. **Prueba el health check** directamente con curl
3. **Verifica que el código esté en GitHub** y Railway esté conectado
4. **Fuerza un redeploy** desde Railway

---

## 📞 Información para Debug

Si necesitas ayuda, proporciona:

1. **URL de Railway:** `https://...`
2. **Últimos logs de Railway** (últimas 50 líneas)
3. **Respuesta del health check:** `curl https://.../health`
4. **Error exacto en la consola del navegador**

