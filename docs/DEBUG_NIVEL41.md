# 🔍 Debug: Problema con www.nivel41.uk

## Problema
Los datos no se ven desde `www.nivel41.uk` pero sí desde Vercel.

## Posibles Causas

### 1. Variable de Entorno en Vercel
El frontend usa `NEXT_PUBLIC_API_URL` que se compila en **build time**.

**Verificar:**
1. Vercel Dashboard → Tu proyecto → Settings → Environment Variables
2. Verificar que `NEXT_PUBLIC_API_URL` esté configurada
3. Verificar que apunte a la URL correcta de Railway

**Solución:**
- Si falta, agregarla
- Si está mal, corregirla
- **Hacer redeploy** después de cambiar variables

### 2. Build Antiguo
Si el build se hizo antes de configurar el dominio personalizado, puede tener valores incorrectos.

**Solución:**
- Forzar un nuevo build en Vercel
- Vercel Dashboard → Deployments → "Redeploy"

### 3. Caché del Navegador
El navegador puede estar cacheando una versión antigua.

**Solución:**
- Hard refresh: `Ctrl+Shift+R` (Windows) o `Cmd+Shift+R` (Mac)
- O abrir en modo incógnito

### 4. CORS (Ya arreglado, pero verificar deploy)
El backend ya tiene `nivel41.uk` en CORS, pero el deploy puede no haber terminado.

**Verificar:**
1. Railway → Logs → Buscar: `CORS: Verificando origin: https://www.nivel41.uk`
2. Debería decir: `CORS: Origin permitido` (no "denegado")

### 5. Console del Navegador
Abrir DevTools (F12) y verificar:
- Errores en Console
- Errores de CORS
- Requests fallando en Network tab

## Pasos de Debug

### Paso 1: Verificar Variables en Vercel
```bash
# En Vercel Dashboard
Settings → Environment Variables
- NEXT_PUBLIC_API_URL = https://tu-api.railway.app
```

### Paso 2: Verificar Build
```bash
# En Vercel Dashboard
Deployments → Ver el último deployment
- Verificar que tenga las variables correctas
- Si no, hacer "Redeploy"
```

### Paso 3: Verificar Console del Navegador
1. Abrir `www.nivel41.uk` en el navegador
2. Abrir DevTools (F12)
3. Ir a Console tab
4. Buscar errores rojos
5. Ir a Network tab
6. Recargar la página
7. Ver qué requests fallan

### Paso 4: Verificar CORS en Backend
```bash
# En Railway Logs
Buscar: "CORS: Verificando origin: https://www.nivel41.uk"
Debería decir: "CORS: Origin permitido"
```

### Paso 5: Probar API Directamente
```bash
# Desde el navegador (www.nivel41.uk)
Abrir Console y ejecutar:
fetch('https://tu-api.railway.app/api/history')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

Si esto funciona, el problema es en el frontend.
Si esto falla, el problema es CORS o el backend.

## Solución Rápida

1. **Verificar variables en Vercel**
2. **Hacer redeploy en Vercel** (forzar nuevo build)
3. **Hard refresh en el navegador** (Ctrl+Shift+R)
4. **Verificar logs de Railway** para confirmar que CORS funciona

