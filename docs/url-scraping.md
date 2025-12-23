# 📡 Scraping de URLs para RAG

## 🎯 Descripción

Sistema para scrapear URLs públicas y añadirlas a la base de conocimiento del RAG. Permite acceder a contenido web en tiempo real y guardarlo para uso en generación de documentos.

## 🚀 Uso

### 1. Scrapear URLs Nacionales (Script Predefinido)

Las 8 URLs nacionales argentinas están predefinidas. Para scrapearlas y guardarlas:

```bash
npm run seed-urls
```

Esto:
- Crea la base de conocimiento `normativa_nacional_urls`
- Scrapea las 8 URLs nacionales
- Genera embeddings y los guarda en la DB
- Las hace disponibles para el RAG

### 2. Scrapear URLs Personalizadas (API)

```bash
POST /api/scrape-urls
Content-Type: application/json

{
  "urls": [
    "https://ejemplo.com/pagina1",
    "https://ejemplo.com/pagina2"
  ],
  "knowledgeBaseId": "mi_base_urls",
  "sourceType": "normativa"
}
```

### 3. Probar Scraping de una URL (Sin Guardar)

```bash
POST /api/scrape-url
Content-Type: application/json

{
  "url": "https://ejemplo.com/pagina"
}
```

Respuesta:
```json
{
  "url": "https://ejemplo.com/pagina",
  "title": "Título de la página",
  "text": "Contenido extraído...",
  "success": true
}
```

## 📋 URLs Nacionales Predefinidas

1. **Boletín Oficial**: `https://www.boletinoficial.gob.ar/`
2. **InfoLEG**: `https://www.argentina.gob.ar/normativa`
3. **SIPROJUD**: `http://www.csjn.gov.ar/siprojur/`
4. **Código Civil y Comercial**: `http://www.bibliotecadigital.gob.ar/items/show/2690`
5. **Código Procesal**: `https://www.saij.gob.ar/7425-local-buenos-aires-codigo-procesal-civil-comercial-buenos-aires-lpb0007425-1968-09-19/123456789-0abc-defg-524-7000bvorpyel`
6. **SAIJ Jurisprudencia**: `https://www.argentina.gob.ar/justicia/saij`
7. **Cámara de Diputados**: `https://www.hcdn.gob.ar/`
8. **Senado**: `https://www.senado.gob.ar/`

## 🔧 Características

### Extracción Inteligente
- Detecta automáticamente el contenido principal
- Remueve scripts, estilos, navegación, etc.
- Limita a 50K caracteres por página
- Limpia espacios y saltos de línea

### Rate Limiting
- Delay de 1 segundo entre requests
- Timeout de 30 segundos por URL
- Manejo de errores HTTP

### Almacenamiento
- Guarda en tabla `chunks` con metadata
- Asocia a base de conocimiento específica
- Genera embeddings automáticamente
- Incluye timestamp de scraping

## 💡 Uso en Generación de Documentos

Una vez scrapeadas, las URLs están disponibles en el RAG:

1. **En el Frontend**: Seleccioná la base de conocimiento `normativa_nacional_urls` al generar
2. **Via API**: Usá `knowledgeBases: ["normativa_nacional_urls"]` en `/v1/generate`

## 🔄 Actualización

Para actualizar el contenido:

```bash
# Re-ejecutar el script (sobrescribe contenido existente)
npm run seed-urls
```

O usar el endpoint API con las URLs que querés actualizar.

## ⚠️ Limitaciones

- Solo URLs públicas (sin autenticación)
- Contenido estático (no JavaScript dinámico)
- Máximo 50K caracteres por página
- Rate limiting: 1 segundo entre requests
- Timeout: 30 segundos por URL

## 🛠️ Troubleshooting

### Error: "HTTP 403"
- El sitio puede estar bloqueando bots
- Verificar User-Agent en el código

### Error: "Timeout"
- La página tarda mucho en cargar
- Considerar aumentar timeout o usar Puppeteer

### Contenido vacío
- La página puede requerir JavaScript
- Considerar usar Puppeteer para páginas dinámicas

## 📝 Notas

- El scraping se hace una vez y se guarda en DB
- Para contenido siempre actualizado, re-ejecutar periódicamente
- Los embeddings se generan automáticamente al guardar
- El contenido está disponible inmediatamente después del scraping










