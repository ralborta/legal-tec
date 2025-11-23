# Mejoras Implementadas en el Sistema de Templates con IA

## 📋 Resumen de Cambios

Se han implementado mejoras significativas en el sistema de selección y rellenado de templates para resolver los problemas identificados:

1. ✅ **Análisis del template antes de rellenar** - El sistema ahora analiza el template primero
2. ✅ **Extracción inteligente de variables** - Solo extrae las variables que el template realmente necesita
3. ✅ **Validación con IA de templates sugeridos** - La IA valida que los templates sean apropiados
4. ✅ **Manejo mejorado de fechas y datos** - Normalización y validación de fechas y otros datos

---

## 🔍 Cambio 1: Análisis del Template Antes de Rellenar

### Antes:
- El sistema asumía un conjunto fijo de variables
- No analizaba qué variables realmente necesitaba el template
- Podía extraer datos innecesarios o faltar datos requeridos

### Ahora:
```11:50:api/src/templates/fill-template.ts
async function extractTemplateVariables(
  templateBuffer: Buffer
): Promise<string[]> {
  try {
    // Convertir el docx a texto para analizar los placeholders
    const { value: text } = await mammoth.extractRawText({ buffer: templateBuffer });
    
    // Buscar todas las variables en formato {{variable}} o {{#variable}}
    const variableRegex = /\{\{([#\/]?)([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
    const variables = new Set<string>();
    let match;
    
    while ((match = variableRegex.exec(text)) !== null) {
      const varName = match[2];
      // Ignorar comandos especiales de docxtemplater
      if (!varName.startsWith('if') && !varName.startsWith('each') && varName !== 'end') {
        variables.add(varName);
      }
    }
    
    return Array.from(variables);
  } catch (error) {
    console.error("Error al extraer variables del template:", error);
    // Retornar variables comunes como fallback
    return [
      "fecha_actual",
      "titulo_documento",
      "partes_involucradas",
      "objeto_contrato",
      "condiciones_principales",
      "monto_valor",
      "plazo_duracion",
      "lugar",
      "resumen_ejecutivo",
      "analisis_relevante",
      "riesgos_importantes",
      "proximos_pasos"
    ];
  }
}
```

**Beneficios:**
- Solo extrae las variables que el template realmente necesita
- Reduce tiempo de procesamiento
- Evita errores por variables faltantes o innecesarias

---

## 🎯 Cambio 2: Extracción Inteligente de Datos

### Antes:
- Prompt genérico con variables fijas
- No consideraba el contexto del template
- Podía generar datos en formato incorrecto

### Ahora:
```56:149:api/src/templates/fill-template.ts
async function extractTemplateDataFromMemo(
  openaiKey: string,
  memo: MemoOutput,
  templateId: string,
  templateBuffer: Buffer
): Promise<Record<string, any>> {
  const openai = new OpenAI({ apiKey: openaiKey });

  // Primero, analizar el template para ver qué variables necesita
  const templateVariables = await extractTemplateVariables(templateBuffer);
  console.log(`[TEMPLATE FILL] Variables encontradas en template: ${templateVariables.join(", ")}`);

  // Obtener el texto del template para contexto
  let templateText = "";
  try {
    const { value: text } = await mammoth.extractRawText({ buffer: templateBuffer });
    templateText = text.substring(0, 2000); // Primeros 2000 caracteres para contexto
  } catch (error) {
    console.warn("No se pudo extraer texto del template para contexto:", error);
  }

  // Construir el prompt con las variables específicas del template
  const variablesDescription = templateVariables.map(v => {
    // Mapear nombres comunes a descripciones
    const descriptions: Record<string, string> = {
      fecha_actual: "Fecha actual en formato DD/MM/YYYY",
      fecha: "Fecha en formato DD/MM/YYYY",
      fecha_documento: "Fecha del documento en formato DD/MM/YYYY",
      titulo: "Título del documento",
      titulo_documento: "Título apropiado para el documento",
      partes: "Nombres de las partes involucradas (cliente, contraparte, etc.)",
      partes_involucradas: "Nombres de las partes mencionadas (cliente, contraparte, etc.)",
      objeto: "Objeto o propósito principal del documento",
      objeto_contrato: "Descripción del objeto o propósito principal",
      condiciones: "Condiciones o términos principales",
      condiciones_principales: "Condiciones o términos principales mencionados",
      monto: "Monto o valor mencionado",
      monto_valor: "Montos o valores mencionados (si aplica)",
      valor: "Valor monetario mencionado",
      plazo: "Plazo o duración mencionado",
      plazo_duracion: "Plazos o duraciones mencionados (si aplica)",
      duracion: "Duración del contrato o acuerdo",
      lugar: "Lugar mencionado (si aplica)",
      resumen: "Resumen breve del memo",
      resumen_ejecutivo: "Resumen breve del memo (2-3 líneas)",
      analisis: "Análisis jurídico relevante",
      analisis_relevante: "Análisis jurídico más relevante para el documento",
      riesgos: "Riesgos principales",
      riesgos_importantes: "Riesgos principales a considerar",
      proximos_pasos: "Próximos pasos a seguir",
      hechos: "Hechos relevantes del caso",
      base_normativa: "Base normativa aplicable",
      jurisprudencia: "Jurisprudencia relevante",
      conclusion: "Conclusión del análisis",
      recomendaciones: "Recomendaciones",
      obligaciones: "Obligaciones de las partes",
      incumplimiento: "Consecuencias del incumplimiento",
      jurisdiccion: "Jurisdicción competente",
      caratula: "Carátula del expediente",
      derecho: "Fundamento legal",
      petitorio: "Petitorio o solicitud",
    };
    return `- ${v}: ${descriptions[v] || `Valor para ${v}`}`;
  }).join("\n");

  const prompt = `Eres un asistente jurídico experto. Analiza el siguiente memo jurídico y extrae la información necesaria para rellenar un template de documento legal.

MEMO:
Título: ${memo.titulo || "Sin título"}
Tipo: ${memo.tipo_documento || "Sin tipo"}
Resumen: ${memo.resumen || ""}
Análisis Jurídico: ${memo.analisis_juridico || ""}
Puntos Tratados: ${memo.puntos_tratados?.join(", ") || ""}
Próximos Pasos: ${memo.proximos_pasos?.join(", ") || ""}
Riesgos: ${memo.riesgos?.join(", ") || ""}
Texto Formateado: ${memo.texto_formateado?.substring(0, 1000) || ""}

Template ID: ${templateId}

CONTEXTO DEL TEMPLATE (primeros caracteres):
${templateText || "No disponible"}

VARIABLES QUE NECESITA EL TEMPLATE:
${variablesDescription}

INSTRUCCIONES:
1. Extrae SOLO las variables que aparecen en la lista de arriba
2. Para fechas, usa formato DD/MM/YYYY (ejemplo: 15/01/2025)
3. Si una variable no está disponible en el memo, usa un valor por defecto apropiado o string vacío
4. Para montos, incluye el símbolo de moneda si está mencionado (ej: "$100.000" o "USD 50.000")
5. Para fechas, si no hay fecha específica en el memo, usa la fecha actual
6. Asegúrate de que los valores sean coherentes y profesionales

Responde SOLO con un JSON válido con las claves de las variables listadas arriba.`;
```

**Beneficios:**
- Prompt específico basado en las variables del template
- Incluye contexto del template para mejor comprensión
- Instrucciones claras sobre formato de fechas y datos

---

## 📅 Cambio 3: Manejo Mejorado de Fechas y Datos

### Antes:
- Fechas podían venir en formatos inconsistentes
- No se validaba el formato
- Variables faltantes causaban errores

### Ahora:
```189:230:api/src/templates/fill-template.ts
    // Normalizar fechas - asegurar que todas las variables de fecha tengan formato correcto
    const fechaActual = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    // Normalizar todas las variables de fecha encontradas
    templateVariables.forEach(v => {
      if (v.includes('fecha') || v.includes('date')) {
        if (!extractedData[v] || extractedData[v] === '') {
          extractedData[v] = fechaActual;
        } else {
          // Asegurar formato DD/MM/YYYY
          const fecha = extractedData[v];
          if (typeof fecha === 'string' && !fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            // Intentar parsear y reformatear
            try {
              const dateObj = new Date(fecha);
              if (!isNaN(dateObj.getTime())) {
                extractedData[v] = dateObj.toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                });
              } else {
                extractedData[v] = fechaActual;
              }
            } catch {
              extractedData[v] = fechaActual;
            }
          }
        }
      }
    });

    // Asegurar que todas las variables del template estén presentes
    templateVariables.forEach(v => {
      if (!(v in extractedData)) {
        extractedData[v] = "";
      }
    });
```

**Beneficios:**
- Normalización automática de fechas a formato DD/MM/YYYY
- Validación de formato
- Fallback inteligente para fechas faltantes
- Garantiza que todas las variables estén presentes

---

## 🤖 Cambio 4: Validación con IA de Templates Sugeridos

### Antes:
- Solo scoring basado en palabras clave exactas
- No validaba si el template era realmente apropiado
- Podía sugerir templates irrelevantes

### Ahora:
```350:412:api/src/index.ts
  // Sugerir templates según el contenido del memo (con validación por IA)
  app.post("/api/templates/suggest", async (req, rep) => {
    try {
      // ... código de filtrado inicial ...
      
      // 4) Validar con IA que los templates sean apropiados (si hay OpenAI key)
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey && texto.trim().length > 50) {
        try {
          const OpenAI = (await import("openai")).default;
          const openai = new OpenAI({ apiKey: openaiKey });
          
          // Tomar los 5 mejores candidatos para validar
          const topCandidates = candidatos.slice(0, 5);
          
          const validationPrompt = `Eres un asistente jurídico experto. Analiza el siguiente memo y evalúa qué templates de documentos son más apropiados.

MEMO:
Área Legal: ${area}
Tipo de Documento: ${tipo}
Resumen: ${body.resumen || ""}
Análisis Jurídico: ${body.analisis_juridico?.substring(0, 500) || ""}
Puntos Tratados: ${body.puntos_tratados?.join(", ") || ""}

TEMPLATES CANDIDATOS:
${topCandidates.map((t, i) => `${i + 1}. ${t.nombre} (${t.tipoDocumento}) - ${t.descripcion || ""} - Tags: ${t.tags?.join(", ") || ""}`).join("\n")}

Evalúa cada template del 1 al 5 en términos de relevancia para este memo específico.
Responde SOLO con un JSON válido con esta estructura:
{
  "scores": {
    "1": <número del 1 al 5>,
    "2": <número del 1 al 5>,
    "3": <número del 1 al 5>,
    "4": <número del 1 al 5>,
    "5": <número del 1 al 5>
  },
  "reasoning": "Breve explicación de por qué estos templates son apropiados o no"
}`;

          const validationResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3,
            messages: [
              {
                role: "system",
                content: "Eres un asistente jurídico que evalúa la relevancia de templates de documentos legales. Responde SOLO con JSON válido."
              },
              {
                role: "user",
                content: validationPrompt
              }
            ],
            response_format: { type: "json_object" }
          });

          const validationContent = validationResponse.choices[0]?.message?.content;
          if (validationContent) {
            try {
              const validationData = JSON.parse(validationContent);
              if (validationData.scores) {
                // Reordenar candidatos según los scores de IA
                const scoredCandidates = topCandidates.map((t, i) => ({
                  template: t,
                  score: validationData.scores[String(i + 1)] || 0,
                  originalIndex: i
                }));
                
                scoredCandidates.sort((a, b) => b.score - a.score);
                
                app.log.info(`[TEMPLATE SUGGEST] Validación IA completada. Reasoning: ${validationData.reasoning || "N/A"}`);
                
                // Reconstruir lista de candidatos con los validados primero
                const validatedIds = new Set(scoredCandidates.map(sc => sc.template.id));
                candidatos = [
                  ...scoredCandidates.map(sc => sc.template),
                  ...candidatos.filter(t => !validatedIds.has(t.id))
                ];
              }
            } catch (parseError) {
              app.log.warn("Error al parsear validación de IA, usando scoring original:", parseError);
            }
          }
        } catch (aiError) {
          app.log.warn("Error en validación por IA, usando scoring original:", aiError);
          // Continuar con el scoring original si falla la IA
        }
      }
```

**Beneficios:**
- Validación semántica de relevancia
- Reordenamiento inteligente basado en contexto
- Mejora la calidad de las sugerencias
- Fallback al sistema original si falla la IA

---

## 🔧 Mejoras en Manejo de Errores

### Antes:
- Errores silenciosos
- Fallback básico sin contexto

### Ahora:
```302:340:api/src/templates/fill-template.ts
  try {
    doc.render();
    console.log(`[TEMPLATE FILL] Template rellenado exitosamente con ${Object.keys(templateData).length} variables`);
  } catch (error: any) {
    console.error("Error al renderizar template:", error);
    console.error("Variables disponibles:", Object.keys(templateData));
    console.error("Detalles del error:", error.properties);
    
    // Si hay errores de renderizado, intentar identificar qué variables faltan
    if (error.properties && error.properties.errors) {
      const missingVars = error.properties.errors
        .filter((e: any) => e.name === 'UnclosedTagError' || e.name === 'UnopenedTagError')
        .map((e: any) => e.explanation);
      console.error("Variables con problemas:", missingVars);
    }
    
    // Intentar con datos mínimos como último recurso
    const minimalData: Record<string, any> = {};
    const fechaActual = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    // Extraer variables del template para el fallback
    const templateVars = await extractTemplateVariables(templateBuffer);
    templateVars.forEach(v => {
      if (v.includes('fecha')) {
        minimalData[v] = fechaActual;
      } else if (v.includes('titulo')) {
        minimalData[v] = memo.titulo || "";
      } else {
        minimalData[v] = "";
      }
    });
    
    doc.setData(minimalData);
    doc.render();
  }
```

**Beneficios:**
- Logging detallado de errores
- Identificación de variables problemáticas
- Fallback inteligente basado en variables del template

---

## 📊 Resultados Esperados

### Antes:
- ❌ Fechas en formato inconsistente
- ❌ Variables faltantes o innecesarias
- ❌ Templates sugeridos no siempre apropiados
- ❌ Errores silenciosos

### Ahora:
- ✅ Fechas siempre en formato DD/MM/YYYY
- ✅ Solo variables necesarias extraídas
- ✅ Templates validados por IA para relevancia
- ✅ Manejo robusto de errores con logging detallado
- ✅ Análisis del template antes de rellenar

---

## 🚀 Próximos Pasos Sugeridos

1. **Monitoreo**: Revisar logs para verificar que las mejoras funcionan correctamente
2. **Ajustes**: Ajustar las descripciones de variables según feedback
3. **Optimización**: Cachear análisis de templates para mejorar performance
4. **Testing**: Probar con diferentes tipos de templates y memos

