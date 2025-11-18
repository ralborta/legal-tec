# 📖 CÓMO FUNCIONA EL SISTEMA - Guía Completa

## 🎯 Visión General

El sistema genera documentos legales usando:
1. **RAG (Retrieval Augmented Generation)**: Busca información relevante en tu corpus legal
2. **LlamaIndex**: Búsqueda vectorial semántica
3. **OpenAI GPT-4**: Genera el documento basado en plantillas

---

## 📝 PASO 1: GENERAR UN DOCUMENTO

### **Ubicación en el Dashboard:**
Panel derecho **"Generar Documento"**

### **Campos a completar:**

#### **1. Tipo de documento** (Dropdown)
Elegí uno de estos:
- **Dictamen**: Opinión legal sobre un tema
- **Contrato**: Contratos entre partes
- **Memo**: Memorándums internos
- **Escrito**: Escritos judiciales

#### **2. Título** (Input)
Ejemplos:
```
Aplicación del art. 765 CCyC en mutuo USD
Dictamen sobre validez de cláusula penal
Contrato de locación comercial
```

#### **3. Instrucciones** (Textarea - IMPORTANTE)
Acá es donde le decís AL SISTEMA qué necesitás. Incluí:

**✅ INFORMACIÓN ESENCIAL:**
- **Hechos**: Qué pasó, situación del caso
- **Contexto**: Antecedentes, partes involucradas
- **Puntos a resolver**: Qué necesitás que analice
- **Tono**: Formal, técnico, simple
- **Jurisdicción**: Nacional, provincial, federal

**📋 Ejemplo de instrucciones completas:**

```
Hechos:
- El cliente firmó un contrato de mutuo en USD en marzo 2024
- El contrato tiene una cláusula que ajusta el capital por devaluación
- La parte deudora se negó a pagar el ajuste alegando ilegalidad

Contexto:
- El mutuo está regulado por el CCyC
- Hay jurisprudencia reciente sobre indexación en dólares
- La jurisdicción es Nacional, Juzgado Comercial

Puntos a resolver:
- Determinar si la cláusula de ajuste es válida según CCyC art. 765
- Analizar jurisprudencia sobre indexación en dólares
- Evaluar posibilidad de ejecución

Tono: Técnico, dirigido a juzgado
```

#### **4. Click en "Generar"**
- El sistema busca información relevante en el corpus
- Genera el documento usando la plantilla del tipo elegido
- Aparece en la "Bandeja de Solicitudes" (panel izquierdo)

---

## 🔍 PASO 2: VER EL DOCUMENTO GENERADO

### **En la Bandeja de Solicitudes:**
Cada documento aparece como una tarjeta con:
- Título
- Tipo
- Estado ("Listo para revisión")
- Hora de creación

### **Botones disponibles:**

#### **👁️ Ver** (Icono ojo)
- Muestra el documento en Markdown
- Muestra las citas usadas (fuentes del corpus)

#### **🔍 Preguntar** (Icono lupa - Tipo NotebookLM)
- Permite hacer preguntas sobre el documento
- Pedir modificaciones
- NO es conversación, solo input → output

**Ejemplos de queries:**
```
"Explica la conclusión del dictamen"
"Modifica la sección de análisis para incluir más sobre el CCyC"
"¿Qué dice sobre la cláusula de ajuste?"
"Reescribe el petitorio en tono más formal"
```

#### **⬇️ Descargar Markdown**
- Descarga el documento como archivo `.md`

#### **🗑️ Eliminar**
- Quita el documento de la bandeja

---

## 🧠 CÓMO FUNCIONA INTERNAMENTE

### **Flujo completo:**

```
Usuario completa formulario
    ↓
Frontend envía POST /v1/generate
    ↓
Backend (Railway):
  1. LlamaIndex busca chunks relevantes en Supabase
     - Usa embeddings para búsqueda semántica
     - Retorna top 6-10 chunks más similares
  2. Construye contexto con chunks encontrados
  3. OpenAI GPT-4 genera documento:
     - Usa la plantilla del tipo elegido
     - Rellena placeholders {{...}} con GPT-4
     - Basa todo en el contexto del corpus
  4. Guarda documento en Supabase
  5. Retorna markdown + citas al frontend
    ↓
Frontend muestra documento en bandeja
```

---

## 📚 CORPUS LEGAL (Base de Datos)

### **¿De dónde saca la información?**

El sistema busca en la tabla `chunks` de Supabase, que contiene:
- **Normativa**: Leyes, códigos, reglamentos
- **Jurisprudencia**: Fallos, sentencias
- **Interno**: Documentos internos del estudio

### **Cómo agregar información al corpus:**

**Endpoint:** `POST /v1/ingest`

```json
{
  "items": [
    {
      "text": "Artículo 765 del CCyC establece que...",
      "source": "normativa",
      "title": "CCyC Art. 765",
      "url": "https://...",
      "meta": { "vigencia": "2024" }
    }
  ]
}
```

**LlamaIndex:**
- Crea embedding vectorial del texto
- Almacena en `chunks` con metadata
- Permite búsqueda semántica

---

## 🎨 PLANTILLAS DE DOCUMENTOS

Cada tipo tiene una plantilla Markdown con placeholders:

### **Ejemplo: Dictamen**
```markdown
# Dictamen – {{titulo}}

**Hechos relevantes**
{{hechos}}

**Base normativa**
{{base_normativa}}

**Jurisprudencia**
{{jurisprudencia}}

**Análisis**
{{analisis}}

**Conclusión**
{{conclusion}}

**Citas**
{{citas}}
```

**GPT-4:**
- Recibe la plantilla
- Recibe el contexto del corpus
- Rellena cada `{{placeholder}}` con información relevante
- Genera el documento final

---

## 🔄 QUERY TYPE NOTEBOOKLM

### **¿Cómo funciona?**

Cuando hacés click en **🔍 Preguntar** en un documento:

1. **Escribís tu pregunta/instrucción:**
   ```
   "Modifica la sección de análisis"
   ```

2. **El sistema:**
   - Toma el documento actual
   - Toma tu query
   - Envía ambos a GPT-4

3. **GPT-4 responde:**
   - Basándose **SOLO** en el documento
   - NO tiene memoria de conversaciones anteriores
   - Cada query es independiente

4. **Ves la respuesta** debajo del input

---

## ⚙️ CONFIGURACIÓN NECESARIA

### **Variables de entorno:**

**Vercel (Frontend):**
- `NEXT_PUBLIC_API_URL`: URL de Railway API

**Railway (Backend):**
- `DATABASE_URL`: Connection string de Supabase PostgreSQL
- `OPENAI_API_KEY`: Tu clave de OpenAI
- `PORT`: 3000

---

## 📋 EJEMPLO COMPLETO DE USO

### **Caso: Generar dictamen sobre contrato de mutuo**

1. **Completás el formulario:**
   - Tipo: `Dictamen`
   - Título: `Validez de cláusula de ajuste en mutuo USD`
   - Instrucciones:
     ```
     Hechos: Cliente otorgó mutuo en USD con cláusula que ajusta el capital 
     por devaluación. Deudor se negó a pagar ajuste.
     
     Analizar: Validez de la cláusula según CCyC art. 765, jurisprudencia 
     sobre indexación en dólares, posibilidad de ejecución.
     
     Tono: Técnico para juzgado comercial
     ```

2. **Click en "Generar"**
   - Esperás 1-3 minutos (depende de la complejidad)
   - El documento aparece en la bandeja

3. **Revisás el documento:**
   - Click en **👁️ Ver**
   - Leés el dictamen generado
   - Verificás las citas usadas

4. **Si necesitás ajustes:**
   - Click en **🔍 Preguntar**
   - Escribís: "Agrega más argumentos sobre la validez de la cláusula"
   - Recibís respuesta con la modificación

5. **Descargás:**
   - Click en **⬇️ Descargar Markdown**
   - Tenés el archivo `.md` listo para editar

---

## ❓ PREGUNTAS FRECUENTES

### **¿Dónde se guardan los documentos?**
En Supabase, tabla `documents`. Persisten aunque cierres el navegador.

### **¿Puedo modificar un documento después?**
Sí, usando el botón **🔍 Preguntar**. Cada query es independiente.

### **¿Cómo sabe qué información buscar?**
Usa **búsqueda semántica**:
- Tu instrucción se convierte en embedding
- Busca chunks similares en el corpus
- Retorna los más relevantes

### **¿Qué pasa si no hay información en el corpus?**
GPT-4 marca `[REVISAR]` en las secciones sin evidencia suficiente.

### **¿Puedo agregar más información al corpus?**
Sí, usando el endpoint `/v1/ingest` o ejecutando el script de seed.

---

## 🚀 PRÓXIMOS PASOS

1. **Cargar corpus legal inicial:**
   - Ejecutar `/v1/ingest` con tus documentos legales
   - O usar el script `seed-run.ts`

2. **Generar primer documento:**
   - Completar formulario
   - Esperar generación
   - Revisar resultado

3. **Iterar y mejorar:**
   - Usar queries para refinar
   - Ajustar instrucciones
   - Cargar más corpus según necesidades

---

**¿Todo claro? ¿Alguna duda específica?** 🤔






