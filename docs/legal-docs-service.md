# Legal Docs Service - Documentación

## 📋 Resumen

Nuevo microservicio `legal-docs` para análisis automatizado de documentos legales usando agentes de IA especializados.

## 🏗️ Arquitectura

```
┌─────────────┐
│   Frontend  │ (Vercel)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ API Gateway │ (Railway - Fastify)
│  /legal/*   │ ──proxy──▶
└─────────────┘
                │
                ▼
       ┌─────────────────┐
       │  legal-docs     │ (Railway - Express)
       │  Service        │
       └─────────────────┘
                │
                ├──▶ OCR Agent
                ├──▶ Translator Agent (Bruno)
                ├──▶ Classifier Agent
                ├──▶ Distribution Analyzer (Leo - BASEUS)
                └──▶ Report Agent
```

## 📁 Estructura del Proyecto

```
Legal-Tec1/
├── apps/
│   └── legal-docs/          # Nuevo servicio
│       ├── src/
│       │   ├── index.ts     # Express server
│       │   ├── pipeline.ts  # Orquestador de agentes
│       │   ├── db.ts        # Conexión a Postgres
│       │   ├── storage.ts   # Manejo de archivos
│       │   └── agents/      # Agentes locales (copiados)
│       │       ├── ocr.ts
│       │       ├── translator.ts
│       │       ├── classifier.ts
│       │       ├── analyzerDistribution.ts
│       │       └── report.ts
│       ├── package.json
│       ├── Dockerfile
│       └── README.md
│
├── packages/
│   └── agents/
│       └── legal/           # Agentes reutilizables
│           ├── ocr.ts
│           ├── translator.ts
│           ├── classifier.ts
│           ├── analyzerDistribution.ts
│           └── report.ts
│
├── api/
│   └── src/
│       └── index.ts         # API Gateway (agregado proxy /legal/*)
│
└── sql/
    └── 003_legal_documents.sql  # Schema de BD
```

## 🔄 Flujo de Trabajo

### 1. Upload de Documento

```
Frontend → POST /legal/upload (via gateway)
         → legal-docs: POST /upload
         → Guarda archivo en storage/
         → Guarda metadata en legal_documents
         → Retorna documentId
```

### 2. Análisis

```
Frontend → POST /legal/analyze/:documentId (via gateway)
         → legal-docs: POST /analyze/:documentId
         → Dispara pipeline asíncrono:
           1. OCR Agent (extrae texto)
           2. Translator Agent (traduce y estructura)
           3. Classifier Agent (clasifica tipo)
           4. Distribution Analyzer (si es distribution_contract)
           5. Report Agent (genera reporte)
         → Guarda resultado en legal_analysis
```

### 3. Consulta de Resultado

```
Frontend → GET /legal/result/:documentId (via gateway)
         → legal-docs: GET /result/:documentId
         → Retorna análisis completo
```

## 🤖 Agentes

### OCR Agent
- **Input**: PDF buffer
- **Output**: Texto extraído
- **Tecnología**: `pdf-parse`

### Translator Agent (Bruno)
- **Input**: Texto en inglés
- **Output**: Array de cláusulas traducidas y estructuradas
- **Modelo**: GPT-4o-mini
- **Formato**: JSON con `clause_number`, `title_en`, `title_es`, `body_en`, `body_es`

### Classifier Agent
- **Input**: Cláusulas traducidas
- **Output**: Tipo de documento (`distribution_contract`, `service_contract`, etc.)
- **Modelo**: GPT-4o-mini

### Distribution Analyzer (Leo - BASEUS)
- **Input**: Cláusulas traducidas
- **Output**: Checklist de 8 puntos críticos:
  1. Sales targets
  2. Termination without cause
  3. Inventory buy back
  4. Payment terms
  5. Jurisdiction
  6. After-sales obligations
  7. Intellectual property
  8. Territorial restrictions
- **Modelo**: GPT-4o-mini
- **Perspectiva**: DISTRIBUTOR (distribuidor)

### Report Agent
- **Input**: Todo el análisis anterior
- **Output**: Reporte legal completo en español
- **Modelo**: GPT-4o-mini

## 🗄️ Base de Datos

### Tabla: `legal_documents`
```sql
CREATE TABLE legal_documents (
  id VARCHAR(255) PRIMARY KEY,
  filename VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  raw_path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: `legal_analysis`
```sql
CREATE TABLE legal_analysis (
  document_id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  original JSONB NOT NULL,
  translated JSONB NOT NULL,
  checklist JSONB,
  report TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (document_id) REFERENCES legal_documents(id)
);
```

## ⚙️ Configuración

### Railway - legal-docs Service

Variables de entorno:
```bash
DATABASE_URL=postgresql://...  # Mismo Postgres que otros servicios
OPENAI_API_KEY=sk-xxxx
STORAGE_DIR=./storage
PORT=3001
```

### Railway - API Gateway

Agregar variable:
```bash
LEGAL_DOCS_URL=https://legal-docs-production.up.railway.app
```

## 🚀 Deployment

### 1. Crear servicio en Railway

1. Nuevo servicio desde GitHub
2. Root directory: `apps/legal-docs`
3. Build command: `npm run build`
4. Start command: `npm start`
5. Variables de entorno (ver arriba)

### 2. Ejecutar migración SQL

```bash
railway run psql -f sql/003_legal_documents.sql
```

### 3. Configurar proxy en API Gateway

Agregar `LEGAL_DOCS_URL` en variables de entorno del api-gateway.

## 📝 Uso desde Frontend

```typescript
// 1. Subir documento
const formData = new FormData();
formData.append('file', file);

const uploadRes = await fetch(`${API_URL}/legal/upload`, {
  method: 'POST',
  body: formData,
});
const { documentId } = await uploadRes.json();

// 2. Iniciar análisis
await fetch(`${API_URL}/legal/analyze/${documentId}`, {
  method: 'POST',
});

// 3. Consultar resultado (polling)
const resultRes = await fetch(`${API_URL}/legal/result/${documentId}`);
const result = await resultRes.json();

if (result.analysis) {
  // Mostrar reporte, checklist, etc.
}
```

## 🔍 Troubleshooting

### Error: "LEGAL_DOCS_URL no configurada"
- Verificar que la variable esté en el api-gateway
- Verificar que el servicio legal-docs esté corriendo

### Error: "Document not found"
- Verificar que el documentId existe en `legal_documents`
- Verificar que el archivo existe en `storage/`

### Error: "Error connecting to legal-docs service"
- Verificar que el servicio esté corriendo
- Verificar la URL en `LEGAL_DOCS_URL`
- Verificar logs del servicio legal-docs

## 🎯 Próximos Pasos

- [ ] Implementar otros analizadores (service_contract, license_agreement, etc.)
- [ ] Agregar queue para procesamiento asíncrono (BullMQ/Redis)
- [ ] Implementar webhooks para notificar cuando el análisis esté listo
- [ ] Agregar cache de resultados
- [ ] Implementar retry logic para agentes

