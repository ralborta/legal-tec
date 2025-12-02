# 🚀 Instrucciones Rápidas para Deploy en Railway

## ⚡ Pasos Rápidos (5 minutos)

### 1. Crear Servicio Legal-Docs

1. Ve a: https://railway.app/dashboard
2. Click en tu proyecto `legal-tec`
3. Click en **"New"** → **"GitHub Repo"**
4. Selecciona tu repositorio `legal-tec`
5. En la configuración que aparece:
   - **Service Name**: `legal-docs`
   - **Root Directory**: `apps/legal-docs` ⚠️ IMPORTANTE
   - **Build Command**: `cd apps/legal-docs && npm install && npm run build`
   - **Start Command**: `cd apps/legal-docs && npm start`

### 2. Configurar Variables de Entorno

En el servicio `legal-docs` recién creado:

1. Ve a la pestaña **"Variables"**
2. Agrega estas variables (copia desde tu servicio `api-gateway`):
   - `DATABASE_URL` = (mismo valor que en api-gateway)
   - `OPENAI_API_KEY` = (mismo valor que en api-gateway)
   - `STORAGE_DIR` = `./storage`
   - `PORT` = (Railway lo asigna automáticamente, no es necesario)

### 3. Obtener la URL del Servicio

1. Ve a la pestaña **"Settings"** del servicio `legal-docs`
2. En **"Domains"**, Railway te dará una URL como:
   ```
   https://legal-docs-production.up.railway.app
   ```
   **Copia esta URL completa**

### 4. Configurar Proxy en API Gateway

1. Ve a tu servicio `legal-tec-production` (api-gateway)
2. Pestaña **"Variables"**
3. Agrega nueva variable:
   - **Name**: `LEGAL_DOCS_URL`
   - **Value**: `https://legal-docs-production.up.railway.app` (la URL que copiaste en paso 3)

### 5. Ejecutar Migración SQL

1. En Railway, ve a tu servicio `legal-docs` o `api-gateway`
2. Pestaña **"Data"** → Click en tu base de datos PostgreSQL
3. Click en **"Query"**
4. Copia y pega este SQL:

```sql
CREATE TABLE IF NOT EXISTS legal_documents (
  id VARCHAR(255) PRIMARY KEY,
  filename VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  raw_path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS legal_analysis (
  document_id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  original JSONB NOT NULL,
  translated JSONB NOT NULL,
  checklist JSONB,
  report TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (document_id) REFERENCES legal_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_created_at ON legal_documents(created_at);
CREATE INDEX IF NOT EXISTS idx_legal_analysis_type ON legal_analysis(type);
CREATE INDEX IF NOT EXISTS idx_legal_analysis_created_at ON legal_analysis(created_at);
```

5. Click en **"Run"**

### 6. Verificar que Funciona

1. Espera a que ambos servicios terminen de deployar (verde = listo)
2. Ve a los logs del servicio `legal-docs` y busca:
   ```
   legal-docs service running on port XXXX
   ```
3. Ve a los logs del servicio `api-gateway` y busca:
   ```
   [LEGAL-DOCS] Proxy configurado a: https://...
   ```

## ✅ Checklist

- [ ] Servicio `legal-docs` creado en Railway
- [ ] Root Directory configurado como `apps/legal-docs`
- [ ] Variables de entorno configuradas (DATABASE_URL, OPENAI_API_KEY)
- [ ] URL del servicio `legal-docs` copiada
- [ ] Variable `LEGAL_DOCS_URL` agregada en `api-gateway`
- [ ] Migración SQL ejecutada
- [ ] Ambos servicios deployados correctamente

## 🐛 Troubleshooting

**Error: "Cannot find module"**
- Verifica que Root Directory sea exactamente `apps/legal-docs`

**Error 404 en /legal/upload**
- Verifica que `LEGAL_DOCS_URL` esté configurada correctamente
- Verifica que el servicio `legal-docs` esté corriendo (logs verdes)

**Error 502 Bad Gateway**
- Verifica que la URL en `LEGAL_DOCS_URL` sea correcta
- Verifica que el servicio `legal-docs` tenga las variables de entorno correctas

## 📞 Si Necesitas Ayuda

Comparte:
1. Los logs del servicio `legal-docs`
2. Los logs del servicio `api-gateway`
3. La URL que te dio Railway para `legal-docs`

