# Configurar Node.js 20 en Railway

## ✅ Solución Aplicada: Node 20 (Soportado Establemente)

**Cambiamos a Node 20** porque Railway/Nixpacks lo soporta mejor que Node 22, y cumple con los requisitos de `pdf-parse` y `pdfjs-dist` (>=20.16.0).

## 🔧 Configuración en Railway

### Paso 1: Variable de Entorno

1. **Railway Dashboard** → tu servicio (no el proyecto completo)
2. Pestaña **"Variables"**
3. Crear o editar variable:
   - **Nombre:** `NIXPACKS_NODE_VERSION`
   - **Valor:** `20` (solo el número, sin `v`, sin `>=`)
4. Guardar

### Paso 2: Rebuild con Cache Limpia

1. Pestaña **"Deployments"**
2. Click en **"Clear cache & redeploy"** o **"Rebuild"**
3. Esto asegura que no use la imagen vieja con Node 18

## ✅ Verificación en los Logs

Después del deploy, buscá el output de `postinstall`:

**✅ CORRECTO:**
```
v20.x.x    ← Debe ser 20, NO 18
9.x.x o 10.x.x  ← Versión de npm
```

**❌ INCORRECTO (si sigue apareciendo):**
```
v18.17.1   ← Railway NO tomó la configuración
9.6.7
```

## 📝 Estado Actual del Código

- ✅ `.nixpacks.toml` con `nodejs_version = "20"`
- ✅ `.nvmrc` con `20`
- ✅ `.node-version` con `20`
- ✅ `package.json` con `"engines": { "node": "20", "npm": ">=9.0.0" }`
- ✅ Script `postinstall` para verificar versión
- ✅ `.npmrc` con `engine-strict=false` (los warnings no rompen el build)

## 🎯 Por Qué Node 20

- ✅ Railway/Nixpacks lo soporta de forma estable
- ✅ Cumple con requisitos de `pdf-parse` y `pdfjs-dist` (>=20.16.0)
- ✅ Más estable que Node 22 en Railway actualmente
- ✅ Los warnings `EBADENGINE` deberían desaparecer o reducirse

## 🚨 Si Sigue Apareciendo Node 18

Si después del cambio a Node 20 **sigue apareciendo `v18.17.1`** en los logs:

1. Verificá en **Settings → Deployment method** que diga **"Nixpacks"** o **"Auto"**
2. Si dice **"Dockerfile"**, entonces necesitamos cambiar el `FROM` en el Dockerfile
3. Verificá que la variable `NIXPACKS_NODE_VERSION=20` esté en el **servicio correcto**

## 📋 Resumen de Cambios

- Todo configurado para Node 20
- Variable `NIXPACKS_NODE_VERSION=20` debe estar en Railway
- Rebuild con cache limpia necesario
- Verificar logs para confirmar que usa Node 20
