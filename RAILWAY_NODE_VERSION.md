# Configurar Node.js 22 en Railway

## ⚠️ IMPORTANTE: Configuración Manual Requerida

Railway con Nixpacks necesita que configures manualmente la variable de entorno `NIXPACKS_NODE_VERSION` para usar Node 22.

## 🔧 Pasos para Configurar

1. **Ir al Dashboard de Railway**
   - Abrí tu proyecto en Railway
   - Andá a la pestaña **"Variables"**

2. **Añadir Variable de Entorno**
   - Click en **"New Variable"** (o editar si ya existe)
   - **Nombre:** `NIXPACKS_NODE_VERSION`
   - **Valor:** `22`
   - Click en **"Add"** o **"Save"**

3. **Redeploy**
   - Andá a la pestaña **"Deployments"**
   - Click en **"Redeploy"** o esperá el deploy automático

## ✅ Verificación

Después del deploy, verificá en los logs que aparezca:
```
v22.x.x
```

En el script `postinstall` verás algo como:
```
v22.11.0
10.x.x
```

## 📝 Notas

- Node 22 cumple con los requisitos de `pdf-parse` y `pdfjs-dist` (>=22.3.0)
- Los warnings `EBADENGINE` deberían desaparecer
- El archivo `package.json` ya tiene `"engines": { "node": "22" }`
- `nixpacks.toml` está configurado para `nodejs_22`

## 🚨 Si el Deploy Falla

Si ves `EBADENGINE` pero el deploy falla, buscá más abajo en los logs el primer `npm ERR!` real. Los `EBADENGINE` son solo warnings; el error real puede ser otro.
