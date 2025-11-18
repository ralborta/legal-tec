# 📋 Generador de Memos Jurídicos desde Transcripciones

## 🎯 Objetivo

Generar memos jurídicos argentinos a partir de transcripciones de reuniones (PDF) o instrucciones directas, usando OpenAI GPT-4.

---

## 🔌 Endpoint

### `POST /api/memos/generate`

**Content-Type:** `multipart/form-data`

### Campos del FormData

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `tipoDocumento` | string | ✅ Sí | Tipo de documento (ej: "Dictamen", "Memo de reunión", "Contrato") |
| `titulo` | string | ✅ Sí | Título del documento |
| `instrucciones` | string | ✅ Sí | Instrucciones del abogado (hechos, contexto, puntos a resolver) |
| `transcripcion` | File (PDF) | ❌ No | Archivo PDF con la transcripción de la reunión |

### Ejemplo de Request

```javascript
const formData = new FormData();
formData.append("tipoDocumento", "Memo de reunión");
formData.append("titulo", "Reunión con cliente X sobre contrato de mutuo");
formData.append("instrucciones", "Analizar validez de cláusula de ajuste según CCyC");
formData.append("transcripcion", pdfFile); // Opcional

fetch("https://api.railway.app/api/memos/generate", {
  method: "POST",
  body: formData
});
```

---

## 📤 Response

### Estructura JSON

```json
{
  "titulo": "Reunión con cliente X sobre contrato de mutuo",
  "tipo_documento": "Memo de reunión",
  "resumen": "Resumen ejecutivo del memo...",
  "puntos_tratados": [
    "Punto 1 tratado en la reunión",
    "Punto 2 tratado en la reunión"
  ],
  "analisis_juridico": "Análisis legal detallado...",
  "proximos_pasos": [
    "Acción 1 a realizar",
    "Acción 2 a realizar"
  ],
  "riesgos": [
    "Riesgo 1 identificado",
    "Riesgo 2 identificado"
  ],
  "texto_formateado": "Memo completo listo para copiar en Word..."
}
```

### Códigos de Error

- **400 Bad Request**: Faltan campos requeridos, PDF inválido, o PDF sin texto extraíble
- **500 Internal Server Error**: Error en OpenAI, falta `OPENAI_API_KEY`, o error interno

---

## 🔄 Flujo del Sistema

```
1. Usuario sube PDF (opcional) + completa formulario
   ↓
2. Frontend envía FormData a POST /api/memos/generate
   ↓
3. Backend:
   a. Extrae texto del PDF (si existe) con pdf-parse
   b. Valida campos requeridos
   c. Llama a generarMemoJuridico()
   ↓
4. generarMemoJuridico():
   a. Construye prompt jurídico argentino
   b. Llama a OpenAI GPT-4o-mini
   c. Parsea respuesta JSON
   d. Retorna MemoOutput
   ↓
5. Backend retorna JSON al frontend
   ↓
6. Frontend muestra resultado en panel
```

---

## 🧠 Prompt Jurídico

El sistema usa un **prompt especializado** que:

- Actúa como abogado argentino senior (derecho civil, comercial, societario)
- Se basa EXCLUSIVAMENTE en la transcripción e instrucciones (no inventa)
- Considera prelación normativa argentina (CCyC art. 2)
- Señala información faltante como "Punto a confirmar"
- Usa lenguaje jurídico claro y profesional

### Estructura del Prompt

**System Prompt:**
- Rol: Abogado argentino senior
- Lineamientos: Basarse solo en transcripción, no inventar, considerar CCyC
- Formato: JSON estricto con campos definidos

**User Prompt:**
- Transcripción de la reunión (o indicación de que no hay)
- Instrucciones del abogado
- Título sugerido

---

## 🛠️ Implementación Técnica

### Backend

**Archivos creados/modificados:**

1. **`api/src/pdf-extract.ts`**
   - Función `extractTextFromPdf(buffer: Buffer): Promise<string>`
   - Usa `pdf-parse` para extraer texto

2. **`api/src/memos/generate-memo.ts`**
   - Tipos: `MemoInput`, `MemoOutput`
   - Función: `generarMemoJuridico(openaiKey, input): Promise<MemoOutput>`
   - Maneja parsing de JSON con limpieza de markdown

3. **`api/src/index.ts`**
   - Registra `@fastify/multipart`
   - Endpoint `POST /api/memos/generate`
   - Maneja multipart form data
   - Valida campos y archivos

### Frontend

**Archivo modificado:**

- **`ui/app/page.tsx`** - Componente `GenerarPanel`
  - Estado para archivo PDF
  - Drag & drop de PDFs
  - Toggle para usar endpoint de memos
  - Visualización de resultados del memo

---

## 📦 Dependencias

### Backend

```json
{
  "@fastify/multipart": "^8.x",
  "pdf-parse": "^1.x",
  "openai": "^4.57.0"
}
```

### Frontend

No requiere dependencias adicionales (usa APIs nativas del navegador).

---

## ⚙️ Variables de Entorno

### Backend (Railway)

- `OPENAI_API_KEY`: Clave de API de OpenAI (requerida)
- `PORT`: Puerto del servidor (default: 3000)

### Frontend (Vercel)

- `NEXT_PUBLIC_API_URL`: URL del backend en Railway (ej: `https://legal-tec.railway.app`)

---

## 🧪 Pruebas

### Sin PDF (solo instrucciones)

```bash
curl -X POST https://api.railway.app/api/memos/generate \
  -F "tipoDocumento=Memo de reunión" \
  -F "titulo=Reunión con cliente" \
  -F "instrucciones=Analizar validez de contrato según CCyC"
```

### Con PDF

```bash
curl -X POST https://api.railway.app/api/memos/generate \
  -F "tipoDocumento=Memo de reunión" \
  -F "titulo=Reunión con cliente" \
  -F "instrucciones=Analizar puntos tratados" \
  -F "transcripcion=@reunion.pdf"
```

---

## 🔍 Diferencias con `/v1/generate`

| Característica | `/v1/generate` | `/api/memos/generate` |
|----------------|---------------|----------------------|
| **RAG** | ✅ Usa LlamaIndex + corpus | ❌ No usa RAG |
| **Input** | JSON (texto) | Multipart (PDF opcional) |
| **Fuentes** | Busca en corpus legal | Solo usa transcripción/instrucciones |
| **Uso** | Documentos con citas normativas | Memos desde transcripciones |
| **Modelo** | GPT-4 (con contexto RAG) | GPT-4o-mini (directo) |

---

## 📝 Notas

- **Límite de archivo**: 10MB máximo
- **Modelo OpenAI**: `gpt-4o-mini` (económico, fácil de cambiar)
- **Formato de respuesta**: JSON estricto (con limpieza de markdown si viene)
- **Validación**: Requiere al menos transcripción O instrucciones

---

## 🚀 Próximas Mejoras

- [ ] Guardar memos en base de datos
- [ ] Historial de memos generados
- [ ] Soporte para múltiples archivos
- [ ] Integración con RAG (opcional)
- [ ] Templates personalizables por tipo de documento

