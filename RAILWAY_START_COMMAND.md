# 🚀 Configuración de Start Command en Railway

## ✅ Problema Resuelto

El error `tsx: not found` ocurría porque Railway estaba intentando ejecutar `npm run dev` en producción, pero `tsx` es una `devDependency` y no está disponible cuando `NODE_ENV=production`.

## 🔧 Solución Implementada

### 1. `railway.json` actualizado

Se agregó el `startCommand` explícito en `railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "startCommand": "npm run start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 2. Scripts en `package.json` (ya correctos)

```json
{
  "scripts": {
    "dev": "tsx api/src/index.ts",      // Solo para desarrollo local
    "build": "tsc -p tsconfig.json",     // Compila TypeScript
    "start": "node dist/index.js"        // Ejecuta el código compilado
  }
}
```

### 3. Dockerfile (ya correcto)

El Dockerfile ya está configurado para:
1. Compilar TypeScript en el stage de build
2. Ejecutar `node dist/index.js` en producción

```dockerfile
# Stage 1: Build
RUN npm run build

# Stage 2: Runtime
CMD ["node", "dist/index.js"]
```

## 📋 Verificación Local

Antes de deployar, verificá que todo funcione localmente:

```bash
# 1. Compilar
npm run build

# 2. Verificar que dist/index.js existe
ls -la dist/index.js

# 3. Ejecutar en modo producción
npm run start
```

Si levanta correctamente, el backend está listo para Railway.

## 🚢 Deploy en Railway

### Opción A: Usando `railway.json` (Recomendado)

Con el `startCommand` en `railway.json`, Railway debería usar automáticamente `npm run start`.

**Pasos:**
1. Hacé commit y push de los cambios:
   ```bash
   git add railway.json
   git commit -m "fix: Configurar startCommand para producción"
   git push
   ```

2. Railway detectará el cambio y hará redeploy automáticamente.

### Opción B: Configuración Manual en Railway UI

Si por alguna razón Railway no respeta el `railway.json`, podés configurarlo manualmente:

1. Entrá a tu servicio en Railway
2. Pestaña **Settings** (o "Variables / Deploy")
3. Buscá **Start Command** / **Start**
4. Si ves `npm run dev` o algo similar, cambiarlo por:
   ```bash
   npm run start
   ```
5. Guardá y Railway hará redeploy

## ✅ Verificación Post-Deploy

Después del deploy, verificá en los logs de Railway:

1. Deberías ver algo como:
   ```
   > start
   > node dist/index.js
   ```

2. NO deberías ver:
   ```
   > dev
   > tsx api/src/index.ts
   tsx: not found
   ```

3. El servicio debería levantarse correctamente y responder en el puerto configurado.

## 🎯 Flujo Completo

```
Local Development:
  npm run dev  →  tsx api/src/index.ts  →  Hot reload, desarrollo

Production (Railway):
  npm run build  →  tsc compila  →  dist/index.js
  npm run start  →  node dist/index.js  →  Código compilado, producción
```

## 📝 Notas Importantes

- **`npm run dev`**: Solo para desarrollo local, usa `tsx` para hot reload
- **`npm run build`**: Compila TypeScript a JavaScript en `dist/`
- **`npm run start`**: Ejecuta el código compilado, sin necesidad de TypeScript ni `tsx`

- En producción, Railway ejecuta:
  1. `npm ci --omit=dev` (solo dependencias de producción)
  2. `npm run build` (compila TypeScript)
  3. `npm run start` (ejecuta `node dist/index.js`)

- El Dockerfile ya maneja esto correctamente con multi-stage build.

## 🔍 Troubleshooting

Si después del cambio sigue fallando:

1. **Verificá los logs de Railway:**
   - ¿Qué comando está ejecutando?
   - ¿Existe `dist/index.js` después del build?

2. **Verificá que el build funcione:**
   ```bash
   npm run build
   ls -la dist/
   ```

3. **Verificá el Dockerfile:**
   - ¿Está copiando `dist/` al stage de runtime?
   - ¿El `CMD` apunta a `node dist/index.js`?

4. **Verificá `railway.json`:**
   - ¿El `startCommand` está correcto?
   - ¿Railway está leyendo el archivo?

## ✨ Resultado Esperado

Una vez configurado correctamente:

- ✅ Railway compila TypeScript durante el build
- ✅ Railway ejecuta `npm run start` en producción
- ✅ El servicio levanta con `node dist/index.js`
- ✅ No hay errores de `tsx: not found`
- ✅ El backend está estable y disponible
- ✅ Los endpoints `/api/memos/*` funcionan correctamente

