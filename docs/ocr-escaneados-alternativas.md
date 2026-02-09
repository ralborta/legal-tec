# OCR para documentos escaneados – alternativas

Cuando un PDF escaneado no se lee bien con el flujo actual (pdf-parse → Vision → tesseract), tenés estas opciones.

## Costo aproximado

- **Tesseract (local):** gratis.
- **gpt-4o Vision (por página):** OpenAI cobra por tokens (imagen + texto). Un documento de ~12 páginas escaneadas suele estar en el orden de **0,10–0,30 USD** por análisis. No es gratis, pero el costo por documento es bajo.
- Para **reducir costo**: en legal-docs podés setear `OCR_PREFER_TESSERACT=true`. Así se usa primero tesseract (gratis) y Vision solo si tesseract devuelve muy poco. Calidad puede bajar en escaneos difíciles.

## Cambios ya hechos en el flujo actual

- **Vision primero:** Si el PDF tiene poco texto extraíble, se usa gpt-4o Vision sobre todas las páginas *antes* que tesseract (Vision suele dar mejor resultado en escaneos).
- **Más resolución:** Las imágenes que se mandan a Vision se generan a 300 DPI por defecto (`OCR_VISION_DPI=300`). Podés subir a 400 si hace falta.
- **Más tokens por página:** Hasta 8192 tokens por página en Vision para no cortar hojas largas.
- **Hasta 25 páginas** por documento (`OCR_MAX_PAGES`).

Variables útiles en **legal-docs** (Railway / env):

- `OCR_VISION_DPI=300` (o 400) – resolución al convertir PDF a imagen para Vision.
- `OCR_MAX_PAGES=25` – máximo de páginas a procesar (Vision + tesseract).

## Si sigue sin “ver” el escaneado

### 1. Subir por imágenes (rápido, sin cambiar backend)

Si el PDF es escaneado y el sistema no lo lee:

1. Convertí el PDF a imágenes (una por página), por ejemplo con “Exportar como imágenes” o una herramienta online.
2. Subí esas imágenes (JPG/PNG) como **varios archivos** en “Analizar documento”.  
   El flujo actual acepta imágenes y las procesa con Vision.  
   **Importante:** hoy cada archivo = un “documento”; si subís 12 imágenes se hace análisis conjunto de 12 “documentos”. Para un solo contrato de 12 hojas, una opción es subir **un solo PDF** (no 12 imágenes) para que quede como 1 documento; si el PDF falla, probar con 1 imagen por página y tener en cuenta que el título dirá “N documentos”.

### 2. Mejorar calidad del PDF antes de subir

- Escanear de nuevo a **300 DPI** como mínimo, en blanco y negro o escala de grises.
- Evitar sombras, hojas torcidas o recortes raros.
- Si podés, exportar/guardar como PDF con “OCR incluido” desde el escáner (así el PDF ya trae capa de texto y a veces pdf-parse lo lee sin Vision).

### 3. Integrar un OCR dedicado (medio/largo plazo)

Para escaneados muy malos o mucho volumen:

| Servicio | Ventaja | Costo / nota |
|----------|--------|----------------|
| **Google Document AI** | Muy bueno con documentos e idiomas | Por uso, cuenta GCP |
| **Azure Document Intelligence** | Bueno para formularios y tablas | Por uso, cuenta Azure |
| **AWS Textract** | Bueno para tablas y textos | Por uso, cuenta AWS |

Implementación típica: en `apps/legal-docs/src/agents/ocr.ts`, si tenés una API key del servicio, llamar a su API de OCR con el buffer del PDF (o con las imágenes por página), obtener el texto y devolverlo como “original” del documento. El resto del pipeline (traducción, clasificación, reporte) sigue igual.

### 4. Reintentar después del deploy

Tras cada cambio en OCR (Vision primero, DPI, tokens), hace falta **volver a desplegar** legal-docs y **volver a analizar** el mismo PDF (subir de nuevo o “Regenerar análisis”). Los análisis ya guardados no se reprocesan solos.

---

Resumen: primero probar con el flujo actual (Vision primero + 300 DPI + 25 páginas). Si no alcanza, probar subiendo imágenes o mejorando la calidad del escaneo; si el problema es estructural, plantear integración con Document AI / Azure / Textract.
