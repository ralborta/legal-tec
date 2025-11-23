# Cómo Funciona la Selección y Rellenado de Templates con IA

## 📋 Resumen Ejecutivo

El sistema tiene **dos procesos principales**:
1. **Selección de Templates**: La IA analiza el memo y sugiere templates relevantes
2. **Rellenado de Templates**: La IA extrae información del memo y rellena el template seleccionado

---

## 1️⃣ ¿Cómo la IA Selecciona los Templates?

### Proceso Actual: **Sistema Híbrido (Reglas + Scoring)**

Actualmente, la selección de templates **NO usa IA directamente**, sino un sistema de **scoring basado en reglas** que analiza el contenido del memo:

#### Paso 1: Filtrado por Área Legal
```350:376:api/src/index.ts
  // Sugerir templates según el contenido del memo
  app.post("/api/templates/suggest", async (req, rep) => {
    try {
      const body = req.body as {
        areaLegal?: string;
        tipoDocumento?: string;
        resumen?: string;
        puntos_tratados?: string[];
        analisis_juridico?: string;
      };

      const area = (body.areaLegal || "civil_comercial") as LegalTemplate["areaLegal"];
      const tipo = (body.tipoDocumento || "dictamen") as LegalTemplate["tipoDocumento"];
      const texto = 
        (body.resumen || "") + 
        " " + 
        (body.analisis_juridico || "") + 
        " " + 
        (body.puntos_tratados || []).join(" ");

      // 1) Filtrar por área legal
      let candidatos = LEGAL_TEMPLATES.filter(t => t.areaLegal === area);

      // Si no hay candidatos para esa área, buscar en civil_comercial como fallback
      if (candidatos.length === 0) {
        candidatos = LEGAL_TEMPLATES.filter(t => t.areaLegal === "civil_comercial");
      }
```

#### Paso 2: Priorización por Tipo de Documento
```378:382:api/src/index.ts
      // 2) Priorizar por tipoDocumento
      candidatos = candidatos.sort((a, b) => {
        const puntaje = (t: LegalTemplate) => (t.tipoDocumento === tipo ? 2 : 0);
        return puntaje(b) - puntaje(a);
      });
```

#### Paso 3: Scoring por Tags (Palabras Clave)
```384:393:api/src/index.ts
      // 3) Scoring por tags (muy simple por ahora)
      const textoLower = texto.toLowerCase();
      candidatos = candidatos.sort((a, b) => {
        const score = (t: LegalTemplate) =>
          (t.tags || []).reduce(
            (acc, tag) => (textoLower.includes(tag.toLowerCase()) ? acc + 1 : acc),
            0
          );
        return score(b) - score(a);
      });
```

#### Paso 4: Selección de los 3 Mejores
```395:401:api/src/index.ts
      // Tomar los 3 mejores
      const sugeridos = candidatos.slice(0, 3).map(t => ({
        id: t.id,
        nombre: t.nombre,
        descripcion: t.descripcion,
        tipoDocumento: t.tipoDocumento,
      }));
```

### Registro de Templates

Los templates están registrados en `templates-registry.ts` con:
- **ID único**
- **Área legal** (civil_comercial, laboral, corporativo, etc.)
- **Tipo de documento** (contrato, dictamen, informe, etc.)
- **Tags** (palabras clave para matching)
- **Descripción**

Ejemplo:
```16:26:api/src/templates/templates-registry.ts
export const LEGAL_TEMPLATES: LegalTemplate[] = [
  // Contratos comerciales
  {
    id: "contrato-prestacion-servicios",
    nombre: "Contrato de Prestación de Servicios",
    areaLegal: "civil_comercial",
    tipoDocumento: "contrato",
    rutaRelativa: "CORPO/COMERCIAL/CONTRATO DE PRESTACION DE SERVICIOS - MANUEL GONZALEZ .docx",
    tags: ["servicios", "prestación", "contrato", "comercial"],
    descripcion: "Modelo base para contratos de servicios profesionales.",
  },
```

### ⚠️ Limitación Actual

El sistema actual es **muy básico**:
- Solo busca coincidencias exactas de palabras clave
- No entiende contexto semántico
- No usa modelos de IA para comprensión profunda

---

## 2️⃣ ¿La IA Trabaja con el Template una vez Seleccionado?

### ✅ SÍ - La IA Trabaja Activamente en el Rellenado

Una vez que el usuario selecciona un template, la IA realiza **dos procesos**:

### Proceso A: Extracción de Datos del Memo (con IA)

La IA analiza el memo completo y extrae información estructurada:

```10:44:api/src/templates/fill-template.ts
async function extractTemplateDataFromMemo(
  openaiKey: string,
  memo: MemoOutput,
  templateId: string
): Promise<Record<string, any>> {
  const openai = new OpenAI({ apiKey: openaiKey });

  const prompt = `Eres un asistente jurídico experto. Analiza el siguiente memo jurídico y extrae la información necesaria para rellenar un template de documento legal.

MEMO:
Título: ${memo.titulo}
Tipo: ${memo.tipo_documento}
Resumen: ${memo.resumen}
Análisis Jurídico: ${memo.analisis_juridico}
Puntos Tratados: ${memo.puntos_tratados.join(", ")}
Próximos Pasos: ${memo.proximos_pasos.join(", ")}
Riesgos: ${memo.riesgos.join(", ")}

Template ID: ${templateId}

Extrae y estructura la siguiente información del memo:
- fecha_actual: Fecha actual en formato DD/MM/YYYY
- titulo_documento: Título apropiado para el documento
- partes_involucradas: Nombres de las partes mencionadas (cliente, contraparte, etc.)
- objeto_contrato: Descripción del objeto o propósito principal
- condiciones_principales: Condiciones o términos principales mencionados
- monto_valor: Montos o valores mencionados (si aplica)
- plazo_duracion: Plazos o duraciones mencionados (si aplica)
- lugar: Lugar mencionado (si aplica)
- resumen_ejecutivo: Resumen breve del memo (2-3 líneas)
- analisis_relevante: Análisis jurídico más relevante para el documento
- riesgos_importantes: Riesgos principales a considerar
- proximos_pasos: Próximos pasos a seguir

Responde SOLO con un JSON válido con estas claves. Si alguna información no está disponible, usa valores por defecto apropiados o strings vacíos.`;
```

**Modelo usado**: `gpt-4o-mini` con `temperature: 0.2` (bajo para mayor precisión)

**Formato de respuesta**: JSON estructurado

### Proceso B: Rellenado del Template con Docxtemplater

Una vez extraídos los datos, se rellenan los placeholders del template:

```119:163:api/src/templates/fill-template.ts
/**
 * Rellena un template .docx con datos del memo
 */
export async function fillTemplateWithMemoData(
  templatePath: string,
  memo: MemoOutput,
  templateId: string,
  openaiKey: string
): Promise<Buffer> {
  // Leer el template
  const templateBuffer = await readFile(templatePath);

  // Extraer datos del memo usando IA
  const templateData = await extractTemplateDataFromMemo(openaiKey, memo, templateId);

  // Procesar el template con docxtemplater
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Rellenar el template con los datos extraídos
  // Los templates deben usar sintaxis {{variable}} para los placeholders
  doc.setData(templateData);

  try {
    doc.render();
  } catch (error: any) {
    console.error("Error al renderizar template:", error);
    // Si hay errores de renderizado, intentar con datos mínimos
    const minimalData = {
      fecha_actual: templateData.fecha_actual,
      titulo_documento: memo.titulo,
      resumen_ejecutivo: memo.resumen,
    };
    doc.setData(minimalData);
    doc.render();
  }

  // Generar el buffer del documento rellenado
  const buf = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return buf;
}
```

### Variables que la IA Extrae y Rellena

La IA extrae estas variables del memo:

1. **`fecha_actual`**: Fecha actual en formato DD/MM/YYYY
2. **`titulo_documento`**: Título apropiado para el documento
3. **`partes_involucradas`**: Nombres de las partes mencionadas
4. **`objeto_contrato`**: Descripción del objeto o propósito principal
5. **`condiciones_principales`**: Condiciones o términos principales
6. **`monto_valor`**: Montos o valores mencionados
7. **`plazo_duracion`**: Plazos o duraciones mencionados
8. **`lugar`**: Lugar mencionado
9. **`resumen_ejecutivo`**: Resumen breve del memo (2-3 líneas)
10. **`analisis_relevante`**: Análisis jurídico más relevante
11. **`riesgos_importantes`**: Riesgos principales
12. **`proximos_pasos`**: Próximos pasos a seguir

### Sintaxis de Templates

Los templates deben usar la sintaxis de **Docxtemplater**:
- `{{variable}}` para reemplazar texto
- `{{#array}}...{{/array}}` para loops
- `{{#if condition}}...{{/if}}` para condicionales

---

## 🔄 Flujo Completo

```
1. Usuario genera un memo jurídico
   ↓
2. Sistema analiza el memo (área legal, tipo, contenido)
   ↓
3. Sistema filtra templates por área legal
   ↓
4. Sistema prioriza por tipo de documento
   ↓
5. Sistema hace scoring por tags/palabras clave
   ↓
6. Sistema sugiere los 3 mejores templates
   ↓
7. Usuario selecciona un template
   ↓
8. IA analiza el memo completo (gpt-4o-mini)
   ↓
9. IA extrae información estructurada (JSON)
   ↓
10. Docxtemplater rellena el template con los datos
   ↓
11. Usuario descarga el documento rellenado
```

---

## 🎯 Mejoras Potenciales

### Para la Selección de Templates:

1. **Usar embeddings semánticos**: En lugar de matching exacto, usar embeddings para encontrar templates similares semánticamente
2. **Fine-tuning de modelo**: Entrenar un modelo específico para sugerir templates
3. **Análisis de contexto**: Analizar el contexto completo del memo, no solo palabras clave

### Para el Rellenado:

1. **Análisis del template**: Analizar el template primero para entender qué variables necesita
2. **Validación de datos**: Validar que los datos extraídos sean coherentes
3. **Manejo de errores mejorado**: Mejor fallback cuando faltan datos

---

## 📝 Notas Técnicas

- **Modelo de IA**: `gpt-4o-mini` (OpenAI)
- **Temperatura**: `0.2` (baja para mayor precisión)
- **Formato de respuesta**: JSON estructurado
- **Librería de templates**: `docxtemplater` + `pizzip`
- **Formato de archivo**: `.docx` (Office Open XML)

