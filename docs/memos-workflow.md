# Flujo de Memos de Reunión - Legal Agents

Este documento describe el flujo completo para generar, visualizar y chatear sobre memos de reunión en el sistema Legal Agents de WNS & Asociados.

## 📋 Resumen del Flujo

El sistema permite:
1. **Generar memo de reunión** a partir de transcripciones (PDF o texto)
2. **Ver memos en la bandeja** de solicitudes
3. **Abrir memo en vista detalle** tipo NotebookLM
4. **Chatear sobre el memo** usando el asistente jurídico conversacional

## 🔄 Flujo Detallado

### 1. Generar Memo de Reunión

**Ubicación:** Panel derecho "Generar Documento" en la página principal (`/`)

**Pasos:**
1. El usuario selecciona el tipo de documento: **"Memo / Dictamen de reunión"** (opción por defecto)
2. Selecciona el área legal correspondiente
3. Ingresa un título para el memo
4. Escribe instrucciones adicionales (hechos, contexto, puntos a resolver, tono, jurisdicción)
5. Sube una transcripción de dos formas:
   - **PDF:** Arrastra o selecciona un PDF exportado desde Tactic/Meet
   - **Texto:** Hace click en "Pegar texto" y pega el texto de la transcripción
6. Selecciona el modo de generación:
   - **Memo de reunión (sin fuentes externas)** - Opción activa por defecto
   - **Dictamen normativo con fuentes (próximamente)** - Deshabilitada, solo visual
7. Hace click en "Generar"

**Backend:**
- Si hay PDF o texto de transcripción, se usa el endpoint `/api/memos/generate`
- El backend procesa el PDF usando OpenAI Assistants API o el texto directamente
- Se genera un `MemoOutput` con:
  - `resumen`: Resumen ejecutivo
  - `puntos_tratados`: Lista de puntos tratados en la reunión
  - `proximos_pasos`: Lista de próximos pasos a seguir
  - `riesgos`: Lista de riesgos identificados
  - `citas`: Referencias legales (si las hay)
  - `texto_formateado`: Texto completo del memo en formato markdown

**Frontend:**
- El memo generado se guarda en `localStorage` con un ID único
- Se muestra en la "Bandeja de Solicitudes"
- Se guarda el `transcriptText` para poder usarlo en el chat posterior

### 2. Ver Memos en la Bandeja

**Ubicación:** Panel central "Bandeja de Solicitudes" en la página principal (`/`)

**Características:**
- Muestra todos los memos generados en la sesión actual
- Cada memo muestra:
  - Título
  - Tipo de documento ("Memo / Dictamen de reunión")
  - Área legal
  - Fecha y hora de creación
  - Resumen (primeros 150 caracteres)
- Al hacer click en un memo, navega a la vista de detalle (`/memos/[id]`)

**Persistencia:**
- Los memos se guardan en `localStorage` con la clave `"legal-memos"`
- Se cargan automáticamente al iniciar la aplicación
- Permiten persistencia entre sesiones del navegador

### 3. Vista de Detalle del Memo (Tipo NotebookLM)

**Ubicación:** `/memos/[id]` (ruta dinámica)

**Layout:**
La vista está dividida en dos columnas:

**Columna Izquierda - Contenido del Memo:**
- **Cabecera:** Título, tipo de documento, área legal, fecha
- **Tabs de navegación:**
  - **Resumen:** Muestra el resumen ejecutivo del memo
  - **Puntos tratados:** Lista de puntos tratados en la reunión
  - **Próximos pasos:** Lista de acciones a seguir
  - **Riesgos:** Lista de riesgos identificados
  - **Citas:** Referencias legales utilizadas (si las hay)
  - **Texto completo:** Texto completo del memo en formato markdown, con opción de copiar

**Columna Derecha - Chat sobre el Memo:**
- Componente de chat conversacional
- Usa el endpoint `/api/memos/chat` del backend
- Permite hacer preguntas sobre el memo/transcripción
- El asistente jurídico responde basándose en:
  - La transcripción original (si está disponible)
  - El área legal seleccionada
  - El historial de la conversación

### 4. Chat sobre el Memo

**Funcionalidad:**
- El usuario puede hacer preguntas sobre el memo generado
- Ejemplos de preguntas:
  - "¿Qué riesgos hay en este caso?"
  - "¿Qué documentos necesito presentar?"
  - "Preparame un texto para el cliente sobre este tema"
  - "¿Cuáles son los próximos pasos legales?"

**Backend:**
- Endpoint: `POST /api/memos/chat`
- Body esperado:
  ```json
  {
    "transcriptText": "texto de la transcripción original",
    "areaLegal": "civil_comercial",
    "messages": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ]
  }
  ```
- Usa la función `chatMemo` de `api/src/memos/chat-memo.ts`
- El asistente actúa como un abogado senior de WNS & Asociados
- Proporciona respuestas prácticas y orientadas a la acción

**Frontend:**
- Muestra el historial de mensajes (usuario / asistente)
- Input de texto con placeholder descriptivo
- Botón "Enviar" para enviar mensajes
- Indicador de carga mientras procesa la respuesta

## 🎨 Mejoras de UX Implementadas

### Formulario de Generación
- ✅ Tipo de documento clarificado: "Memo / Dictamen de reunión"
- ✅ Helper text explicativo debajo del select
- ✅ Campo de transcripción mejorado con opción de pegar texto
- ✅ Radio buttons para modo de generación (memo vs dictamen con RAG)
- ✅ Placeholder mejorado en campo de instrucciones

### Bandeja de Solicitudes
- ✅ Mensaje cuando no hay memos: "Aún no hay documentos generados. Creá un memo de reunión desde la derecha."
- ✅ Cards mejoradas con información relevante
- ✅ Navegación directa a vista de detalle

### Vista de Detalle
- ✅ Layout tipo NotebookLM con dos columnas
- ✅ Tabs para navegar entre secciones del memo
- ✅ Chat integrado en la columna derecha
- ✅ Título de chat: "Chat sobre esta reunión"
- ✅ Placeholder del input: "Preguntá qué hacer, qué riesgos hay o pedí que te prepare un texto para el cliente…"

## 🔧 Archivos Modificados/Creados

### Frontend
- `ui/app/page.tsx`: Componente principal con formulario mejorado y bandeja
- `ui/app/memos/[id]/page.tsx`: Nueva página de detalle tipo NotebookLM

### Backend
- `api/src/index.ts`: Ya tenía el endpoint `/api/memos/chat` implementado
- `api/src/memos/chat-memo.ts`: Función de chat conversacional (ya existía)
- `api/src/memos/generate-memo.ts`: Generación de memos (ya existía)
- `api/src/memos/generate-memo-direct.ts`: Generación directa con PDF (ya existía)

## 📝 Notas Técnicas

### Persistencia
- Los memos se guardan en `localStorage` del navegador
- Clave: `"legal-memos"`
- Formato: Array de objetos JSON
- Cada memo tiene un `id` único generado con `crypto.randomUUID()`

### Routing
- Usa Next.js App Router (`app/` directory)
- Ruta dinámica: `/memos/[id]`
- Navegación con `useRouter` de `next/navigation`

### Estado
- Los memos se mantienen en estado local del componente principal
- Se sincronizan con `localStorage` en cada cambio
- Al cargar la página, se recuperan los memos desde `localStorage`

### Chat
- El chat mantiene el historial de mensajes en el estado del componente
- Cada mensaje se envía al backend con todo el historial
- El backend usa OpenAI GPT-4o-mini para generar respuestas
- El sistema prompt está diseñado para actuar como asistente jurídico conversacional

## 🚀 Próximos Pasos (Futuro)

1. **Persistencia en Base de Datos:**
   - Crear tabla `memos` en PostgreSQL
   - Guardar memos en DB en lugar de solo `localStorage`
   - Permitir sincronización entre dispositivos

2. **Modo Dictamen con RAG:**
   - Habilitar la opción "Dictamen normativo con fuentes"
   - Integrar con el sistema RAG existente
   - Filtrar por bases de conocimiento seleccionadas

3. **Mejoras de Chat:**
   - Guardar historial de chat en DB
   - Permitir múltiples conversaciones sobre el mismo memo
   - Exportar conversaciones

4. **Exportación:**
   - Exportar memo en formato Word/PDF
   - Exportar conversación de chat
   - Compartir memo con otros usuarios

5. **Búsqueda y Filtros:**
   - Buscar memos por título, contenido, área legal
   - Filtrar por fecha, área legal, tipo de documento
   - Ordenar por fecha, relevancia










