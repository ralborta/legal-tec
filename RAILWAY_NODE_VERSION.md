# Configurar Node.js 20.18.1 en Railway

## ⚠️ IMPORTANTE: Configuración Manual Requerida

Railway con Nixpacks no siempre detecta automáticamente `.nvmrc` o `.node-version`. 
**Necesitás configurar manualmente la variable de entorno en Railway.**

## 🔧 Pasos para Configurar

1. **Ir al Dashboard de Railway**
   - Abrí tu proyecto en Railway
   - Andá a la pestaña **"Variables"**

2. **Añadir Variable de Entorno**
   - Click en **"New Variable"**
   - **Nombre:** `NODE_VERSION`
   - **Valor:** `20.18.1`
   - Click en **"Add"**

3. **Redeploy**
   - Andá a la pestaña **"Deployments"**
   - Click en **"Redeploy"** o esperá el deploy automático

## ✅ Verificación

Después del deploy, verificá en los logs que aparezca:
```
Node.js version: v20.18.1
```

En lugar de:
```
Node.js version: v20.6.1
```

## 📝 Notas

- Los archivos `.nvmrc` y `.node-version` están en el repo como respaldo
- `package.json` también especifica `"node": ">=20.18.1"`
- Pero Railway necesita la variable de entorno `NODE_VERSION` para funcionar correctamente con Nixpacks

