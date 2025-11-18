import OpenAI from "openai";

export type MemoInput = {
  tipoDocumento: string;
  titulo: string;
  instrucciones: string;
  transcriptText: string;
};

export type MemoOutput = {
  titulo: string;
  tipo_documento: string;
  resumen: string;
  puntos_tratados: string[];
  analisis_juridico: string;
  proximos_pasos: string[];
  riesgos: string[];
  texto_formateado: string;
};

/**
 * Genera un memo jurídico argentino a partir de una transcripción y instrucciones
 */
export async function generarMemoJuridico(
  openaiKey: string,
  input: MemoInput
): Promise<MemoOutput> {
  const openai = new OpenAI({ apiKey: openaiKey });

  const systemPrompt = `Sos un abogado argentino senior, especialista en derecho civil, comercial y societario,
que trabaja para el estudio WNS & Asociados.

Tu tarea es elaborar un ${input.tipoDocumento} a partir de la transcripción de una reunión
y las instrucciones del abogado.

Lineamientos:

- Actuás como un abogado argentino real, no como un asistente genérico.
- Usás lenguaje jurídico claro, profesional y conciso.
- Te basás EXCLUSIVAMENTE en la transcripción y las instrucciones: no inventes hechos ni acuerdos que no estén.
- Si falta información relevante, señalalo explícitamente como "Punto a confirmar".
- Tené en cuenta la prelación normativa argentina y el art. 2 del CCyC:
  considerá el texto legal, su finalidad, normas análogas, tratados de derechos humanos vigentes,
  principios y coherencia del sistema.
- Cuando cites normas, hacelo de forma responsable. Si no estás seguro, indicá
  "sujeto a verificación de normativa vigente".

Devolvé SIEMPRE un JSON válido, sin texto extra, con esta estructura:

{
  "titulo": string,
  "tipo_documento": string,
  "resumen": string,
  "puntos_tratados": string[],
  "analisis_juridico": string,
  "proximos_pasos": string[],
  "riesgos": string[],
  "texto_formateado": string
}

- "texto_formateado" debe ser el memo completo listo para copiar en Word.
- No incluyas explicaciones fuera del JSON.`;

  const transcriptSection = input.transcriptText.trim()
    ? `Transcripción de la reunión:\n${input.transcriptText}`
    : "No se proporcionó transcripción, solo instrucciones.";

  const userPrompt = `${transcriptSection}

Instrucciones del abogado:

Título sugerido: ${input.titulo}

Detalles adicionales:
${input.instrucciones}`;

  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Modelo económico, fácil de cambiar a gpt-4o o gpt-4-turbo
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    });

    const content = chat.choices[0].message?.content;
    if (!content) {
      throw new Error("OpenAI no devolvió contenido");
    }

    // Limpiar el JSON si viene con markdown o texto extra
    let jsonText = content.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Buscar el primer { y último } si hay texto extra
    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(jsonText) as MemoOutput;

    // Validar estructura mínima
    if (!parsed.titulo || !parsed.texto_formateado) {
      throw new Error("Respuesta de OpenAI incompleta: faltan campos requeridos");
    }

    // Asegurar arrays
    parsed.puntos_tratados = parsed.puntos_tratados || [];
    parsed.proximos_pasos = parsed.proximos_pasos || [];
    parsed.riesgos = parsed.riesgos || [];

    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Error al parsear JSON de OpenAI: ${error.message}`);
    }
    throw error;
  }
}

