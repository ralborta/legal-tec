# Legal Docs Service

Microservicio para análisis de documentos legales usando agentes de IA.

## 🏗️ Arquitectura

Este servicio procesa documentos legales a través de un pipeline de agentes:

1. **OCR Agent** - Extrae texto de PDFs
2. **Translator Agent** - Traduce y estructura cláusulas
3. **Classifier Agent** - Clasifica el tipo de documento
4. **Distribution Analyzer** - Analiza contratos de distribución (BASEUS)
5. **Report Agent** - Genera reporte legal completo

## 🚀 Setup

### Variables de Entorno

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
OPENAI_API_KEY=sk-xxxx
STORAGE_DIR=./storage
PORT=3001
```

### Instalación

```bash
cd apps/legal-docs
npm install
```

### Base de Datos

Ejecutar el schema SQL:

```bash
psql $DATABASE_URL -f ../../sql/003_legal_documents.sql
```

### Desarrollo

```bash
npm run dev
```

### Build

```bash
npm run build
npm start
```

## 📡 API Endpoints

### POST /upload
Sube un documento PDF.

```bash
curl -X POST http://localhost:3001/upload \
  -F "file=@documento.pdf"
```

Response:
```json
{
  "documentId": "uuid-del-documento"
}
```

### POST /analyze/:documentId
Inicia el análisis del documento.

```bash
curl -X POST http://localhost:3001/analyze/{documentId}
```

Response:
```json
{
  "status": "processing",
  "documentId": "uuid-del-documento"
}
```

### GET /result/:documentId
Obtiene el resultado del análisis.

```bash
curl http://localhost:3001/result/{documentId}
```

Response:
```json
{
  "documentId": "uuid",
  "filename": "documento.pdf",
  "uploadedAt": "2025-01-15T10:00:00Z",
  "analysis": {
    "type": "distribution_contract",
    "original": { "text": "..." },
    "translated": [...],
    "checklist": { "items": [...] },
    "report": "Reporte completo...",
    "analyzedAt": "2025-01-15T10:05:00Z"
  }
}
```

## 🔗 Integración con API Gateway

Este servicio se integra con el api-gateway principal mediante proxy:

- `POST /legal/upload` → `POST /upload` (legal-docs)
- `POST /legal/analyze/:documentId` → `POST /analyze/:documentId` (legal-docs)
- `GET /legal/result/:documentId` → `GET /result/:documentId` (legal-docs)

Configurar en el api-gateway:
```bash
LEGAL_DOCS_URL=https://legal-docs-production.up.railway.app
```

## 🐳 Docker

```bash
docker build -t legal-docs .
docker run -p 3001:3001 --env-file .env legal-docs
```

## 📝 Notas

- Los documentos se almacenan localmente en `STORAGE_DIR`
- El análisis es asíncrono (se dispara y se consulta después)
- Los agentes usan GPT-4o-mini para eficiencia de costos

