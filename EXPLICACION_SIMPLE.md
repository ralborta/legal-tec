# 🎯 Explicación Simple: Qué Hice y Qué Falta

## ✅ LO QUE YA HICE (automático, sin SQL manual)

### 1. El código ahora crea la tabla `knowledge_bases` automáticamente

**Antes:**
- La tabla `knowledge_bases` no existía
- El código intentaba usarla → error → servicio crasheaba
- Tenías que ejecutar SQL manualmente (pero Railway no permite)

**Ahora:**
- El código crea la tabla automáticamente al iniciar
- Igual que hace con `legal_documents` (ya lo hacía así)
- No necesitás ejecutar SQL manualmente

### 2. Dónde se crea automáticamente

**En el API Gateway (`api/src/index.ts`):**
```typescript
// Al iniciar el servicio, automáticamente:
CREATE TABLE IF NOT EXISTS knowledge_bases (...)
INSERT INTO knowledge_bases (...) VALUES (...)
```

**En legal-docs (`apps/legal-docs/src/db.ts`):**
```typescript
// En ensureSchema(), automáticamente:
CREATE TABLE IF NOT EXISTS knowledge_bases (...)
INSERT INTO knowledge_bases (...) VALUES (...)
```

---

## 🔄 QUÉ TENÉS QUE HACER (solo reiniciar)

### Paso 1: Reiniciar servicios en Railway

1. Ve a Railway → Tu proyecto
2. Click en el servicio **API** (legal-tec)
3. Click en **"Restart"** o **"Redeploy"**
4. Espera a que termine

5. Click en el servicio **legal-docs**
6. Click en **"Restart"** o **"Redeploy"**
7. Espera a que termine

### Paso 2: Verificar en los logs

Después de reiniciar, en los logs deberías ver:
```
[STARTUP] Tabla knowledge_bases creada/verificada correctamente
```

O en legal-docs:
```
[DB] Tabla knowledge_bases creada/verificada
```

---

## 🎯 RESULTADO ESPERADO

Después de reiniciar:
- ✅ La tabla `knowledge_bases` se crea automáticamente
- ✅ El servicio NO crashea más
- ✅ Upload funciona
- ✅ Analyze funciona

---

## ❓ Si después de reiniciar sigue el error 400

El 400 puede ser por otras razones:

1. **El archivo no existe físicamente** (upload falló antes)
   - Solución: Subí el archivo de nuevo

2. **El documentId es inválido**
   - Solución: Subí el archivo de nuevo para obtener un ID nuevo

3. **El servicio legal-docs no está respondiendo**
   - Solución: Verifica los logs de legal-docs

---

## 📝 Resumen Ultra Simple

**Lo que hice:**
- El código ahora crea la tabla automáticamente (como `legal_documents`)

**Lo que tenés que hacer:**
- Reiniciar los servicios en Railway (2 clicks)

**Resultado:**
- La tabla se crea sola
- Todo funciona

---

¿Querés que te ayude a verificar los logs después de reiniciar o hay algo más que no entendés?

