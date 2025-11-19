# 🔍 Diagnóstico Error 502 - Bad Gateway

## ❌ Error 502: Bad Gateway

Este error significa que **Railway no puede conectarse al servidor** o el servidor **no está respondiendo**.

---

## 🔍 Pasos de Diagnóstico

### 1. **Verificar que el servidor arrancó**

En Railway → **Deployments** → **Logs**, busca estas líneas:

```
Endpoints registrados:
  GET  /health
  POST /v1/generate
  POST /v1/ingest
  POST /v1/query
  POST /api/memos/generate
Servidor escuchando en puerto 3000
```

**Si NO ves estas líneas:**
- ❌ El servidor no arrancó
- Revisa los errores anteriores en los logs

---

### 2. **Errores comunes que impiden el arranque**

#### Error 1: `FST_ERR_PLUGIN_VERSION_MISMATCH`
```
fastify-plugin: @fastify/cors - expected '5.x' fastify version, '4.29.1' is installed
```

**Solución:**
- Verifica que `package.json` tenga `"@fastify/cors": "10.1.0"` (sin `^`)
- Verifica que `package-lock.json` tenga la versión correcta
- Fuerza un redeploy limpio

#### Error 2: `Cannot find module`
```
Error: Cannot find module './memos/generate-memo.js'
```

**Solución:**
- Verifica que el build pasó correctamente
- Verifica que `dist/memos/generate-memo.js` exista

#### Error 3: `SyntaxError` o errores de importación
```
SyntaxError: The requested module 'pdf-parse' does not provide an export named 'default'
```

**Solución:**
- Ya corregido con importación dinámica
- Verifica que el build pase sin errores

---

### 3. **Verificar que el servidor está escuchando**

En Railway → **Deployments** → **Logs**, busca:

```
Server listening at http://0.0.0.0:3000
```

O en nuestros logs personalizados:
```
Servidor escuchando en puerto 3000
```

**Si NO ves esto:**
- El servidor no arrancó
- Revisa los errores anteriores

---

### 4. **Probar el health check directamente**

Abre una terminal y prueba:

```bash
curl https://tu-railway-url.railway.app/health
```

**Si responde `{"ok":true}`:**
- ✅ El servidor está corriendo
- El problema es con el endpoint específico

**Si da error de conexión o timeout:**
- ❌ El servidor no está corriendo
- Revisa los logs de Railway

---

### 5. **Verificar variables de entorno**

En Railway → **Variables**, verifica:

- `OPENAI_API_KEY` = `sk-xxxxx...` (requerida)
- `DATABASE_URL` = `postgresql://...` (si usas Postgres)
- `PORT` = `3000` (opcional, Railway lo asigna automáticamente)

**Si falta `OPENAI_API_KEY`:**
- El servidor puede arrancar pero dará error 500 al generar memos
- No debería causar 502

---

### 6. **Verificar la URL en Vercel**

En Vercel → **Settings** → **Environment Variables**:

- `NEXT_PUBLIC_API_URL` = `https://tu-railway-url.railway.app`
- **NO debe tener barra final** (`/`)
- Debe ser `https://` (no `http://`)

---

## 🚨 Soluciones Rápidas

### Solución 1: Forzar redeploy limpio

1. Railway → **Deployments** → **New Deployment**
2. Selecciona el commit más reciente
3. Espera a que termine el build

### Solución 2: Verificar logs completos

1. Railway → **Deployments** → Último deployment → **Logs**
2. Busca errores en las últimas 100 líneas
3. Busca específicamente:
   - `Error al iniciar servidor`
   - `FST_ERR_PLUGIN_VERSION_MISMATCH`
   - `Cannot find module`
   - `SyntaxError`

### Solución 3: Verificar que el build pasó

1. Railway → **Deployments** → Último deployment
2. Verifica que diga **"Build succeeded"**
3. Si dice **"Build failed"**, revisa los errores

---

## 📋 Checklist de Verificación

Antes de reportar el problema, verifica:

- [ ] El build en Railway pasó sin errores
- [ ] El servidor arrancó (ves "Servidor escuchando...")
- [ ] Los endpoints están registrados (ves "Endpoints registrados...")
- [ ] El health check funciona: `curl https://.../health`
- [ ] `OPENAI_API_KEY` está configurada en Railway
- [ ] `NEXT_PUBLIC_API_URL` está configurada en Vercel
- [ ] La URL de Railway es correcta (sin barra final, con https)

---

## 🆘 Si Nada Funciona

1. **Revisa los logs completos** de Railway (últimas 200 líneas)
2. **Prueba el health check** directamente con curl
3. **Verifica que el código esté en GitHub** y Railway esté conectado
4. **Fuerza un redeploy** desde Railway

---

## 📞 Información para Debug

Si necesitas ayuda, proporciona:

1. **URL de Railway:** `https://...`
2. **Últimos logs de Railway** (últimas 50 líneas)
3. **Respuesta del health check:** `curl https://.../health`
4. **Estado del build:** ¿pasó o falló?
5. **Mensaje de error exacto** en la consola del navegador

