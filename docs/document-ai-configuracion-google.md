# Cómo configurar Google Document AI para OCR

Guía paso a paso para crear el proyecto en Google Cloud, activar Document AI, crear el procesador OCR y obtener las credenciales que usa legal-docs.

---

## 1. Crear o elegir un proyecto en Google Cloud

1. Entrá a **[Google Cloud Console](https://console.cloud.google.com)** e iniciá sesión con tu cuenta Google.
2. En la barra superior, hacé clic en el **selector de proyectos** (donde dice "Select a project" o el nombre del proyecto).
3. Clic en **"New Project"** (Nuevo proyecto).
4. Nombre: por ejemplo `legal-docs-ocr`.
5. Opcional: elegir una organización si tenés.
6. Clic en **"Create"**. Esperá unos segundos.
7. Seleccioná el proyecto recién creado para trabajar siempre en ese proyecto.

**Anotá el ID del proyecto** (ej. `legal-docs-ocr` o `legal-docs-ocr-123456`). Lo vas a usar como `DOCUMENT_AI_PROJECT_ID`.

---

## 2. Activar la facturación (requerido para Document AI)

Document AI no funciona sin una cuenta de facturación asociada (hay free tier, pero la cuenta debe estar activada).

1. En el menú lateral: **Billing** (Facturación).
2. Si te pide vincular una cuenta, **"Link a billing account"** o **"Create account"**.
3. Completá tarjeta y datos. Google suele dar crédito gratis inicial; Document AI tiene [cuota gratuita](https://cloud.google.com/document-ai/pricing) por mes (ej. primeras 1.000 páginas en Document OCR).
4. Asociá esa cuenta de facturación al proyecto que creaste (desde Billing → "My projects" → elegir el proyecto → Link billing account).

---

## 3. Activar la API de Document AI

1. En el menú lateral: **"APIs & Services"** → **"Library"** (Biblioteca).
2. En el buscador escribí **"Cloud Document AI API"**.
3. Entrá a **"Cloud Document AI API"** y clic en **"Enable"** (Activar).
4. Esperá a que diga "API enabled".

---

## 4. Crear el procesador "Document OCR"

1. En el buscador de la consola (arriba) escribí **"Document AI"** o entrá desde **"APIs & Services"** → **"Document AI"** (o desde el menú si lo ves).
2. En la página de Document AI, andá a **"Processors"** (Procesadores) en el menú lateral.
3. Clic en **"+ Create processor"** (Crear procesador).
4. Elegí el tipo: **"Document OCR"** (está pensado para extraer texto de PDFs e imágenes).
5. **Processor name**: por ejemplo `legal-docs-ocr`.
6. **Region**: elegí **"us"** (United States) o **"eu"** (Europe). Anotá la que elijas; es tu `DOCUMENT_AI_LOCATION`.
7. Clic en **"Create"**.
8. En la lista de procesadores, entrá al que creaste. En la parte superior o en "Processor details" vas a ver el **Processor ID** (un UUID tipo `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).

**Anotá:**
- **Processor ID** → será `DOCUMENT_AI_PROCESSOR_ID`
- **Region** (us o eu) → será `DOCUMENT_AI_LOCATION`

---

## 5. Crear una cuenta de servicio y descargar la clave JSON

Las credenciales que usa legal-docs son de una **cuenta de servicio** (service account), no tu cuenta personal.

1. En el menú lateral: **"IAM & Admin"** → **"Service accounts"** (Cuentas de servicio).
2. Clic en **"+ Create service account"**.
3. **Service account name**: ej. `legal-docs-ocr`.
4. **Service account ID**: se completa solo (ej. `legal-docs-ocr@tu-proyecto.iam.gserviceaccount.com`).
5. Clic en **"Create and continue"**.
6. **Role** (rol): podés dar **"Document AI API User"** (o "Document AI Editor" si preferís). Buscá "Document AI" en el selector de roles.
7. Clic en **"Continue"** y luego **"Done"**.
8. En la lista, hacé clic en la cuenta de servicio que creaste (el email).
9. Pestaña **"Keys"** (Claves).
10. **"Add key"** → **"Create new key"**.
11. Tipo: **JSON**. Clic en **"Create"**.
12. Se descarga un archivo `.json`. **Guardalo en un lugar seguro** y no lo subas a Git ni lo compartas en público. Ese archivo es tu credencial.

El JSON se ve similar a:

```json
{
  "type": "service_account",
  "project_id": "tu-proyecto-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "legal-docs-ocr@tu-proyecto.iam.gserviceaccount.com",
  "client_id": "...",
  ...
}
```

---

## 6. Configurar legal-docs con las variables de entorno

Tenés que decirle a legal-docs:
- qué proyecto y procesador usar (`DOCUMENT_AI_PROJECT_ID`, `DOCUMENT_AI_LOCATION`, `DOCUMENT_AI_PROCESSOR_ID`);
- cómo autenticarse (`GOOGLE_APPLICATION_CREDENTIALS`).

### Opción A: Servidor con disco (VPS, VM, tu máquina)

1. Copiá el archivo JSON a una ruta segura en el servidor, por ejemplo `/etc/legal-docs/gcp-key.json` (o una carpeta de tu app).
2. Exportá la variable **antes** de arrancar legal-docs:

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/etc/legal-docs/gcp-key.json"
   ```

3. Variables de Document AI (en `.env` o en el entorno):

   ```bash
   DOCUMENT_AI_PROJECT_ID=tu-proyecto-id
   DOCUMENT_AI_LOCATION=us
   DOCUMENT_AI_PROCESSOR_ID=el-uuid-del-procesador
   ```

4. Reiniciá legal-docs.

### Opción B: Railway (sin subir el archivo como repo)

Railway no te deja subir archivos arbitrarios; las credenciales se suelen pasar por variables de entorno.

1. **Variables de Document AI** en Railway (Settings → Variables):
   - `DOCUMENT_AI_PROJECT_ID` = ID del proyecto (ej. `legal-docs-ocr`)
   - `DOCUMENT_AI_LOCATION` = `us` o `eu`
   - `DOCUMENT_AI_PROCESSOR_ID` = UUID del procesador

2. **Credenciales Google:**  
   Opción recomendada: crear **una sola variable** (ej. `GOOGLE_APPLICATION_CREDENTIALS_JSON`) con **todo el contenido** del archivo JSON pegado en una línea (copiá el JSON completo y pegarlo en el valor de la variable).

   legal-docs al arrancar detecta `GOOGLE_APPLICATION_CREDENTIALS_JSON` y escribe ese JSON en un archivo temporal automáticamente; no tenés que configurar nada más. Solo hacé redeploy después de guardar las variables.

---

## 7. Probar que funciona

1. Desplegá o reiniciá legal-docs con las variables configuradas.
2. Subí un PDF escaneado o una imagen (JPG/PNG) a “Analizar documento”.
3. En los logs de legal-docs deberías ver algo como:
   - `[OCR] Intentando Google Document AI...`
   - y si todo va bien: `[OCR-DocumentAI] OK: X caracteres`

Si aparece un error de permisos o “could not load credentials”, revisá que el JSON sea el correcto y que la cuenta de servicio tenga el rol **Document AI API User** (o Document AI Editor) en el mismo proyecto donde está el procesador.

---

## Resumen de lo que tenés que anotar

| Dónde | Qué anotar |
|-------|------------|
| Proyecto | **Project ID** (ej. `legal-docs-ocr`) → `DOCUMENT_AI_PROJECT_ID` |
| Procesador Document OCR | **Region** (`us` o `eu`) → `DOCUMENT_AI_LOCATION` |
| Procesador Document OCR | **Processor ID** (UUID) → `DOCUMENT_AI_PROCESSOR_ID` |
| Cuenta de servicio | Archivo **JSON** de la clave → `GOOGLE_APPLICATION_CREDENTIALS` (ruta) o contenido en `GOOGLE_APPLICATION_CREDENTIALS_JSON` en Railway |

Con eso, legal-docs puede usar Document AI para OCR cuando Vision/tesseract no alcancen.
