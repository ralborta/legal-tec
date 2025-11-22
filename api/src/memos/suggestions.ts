import type { MemoOutput, SuggestedDocument } from "./types.js";

/**
 * Sugiere documentos relevantes basándose en el contenido del memo
 * Analiza el texto del memo y propone templates de documentos que podrían ser útiles
 */
export function sugerirDocumentosParaMemo(memo: MemoOutput): SuggestedDocument[] {
  // Combinar todo el texto del memo para análisis
  const textoBase =
    (memo.analisis_juridico || "") +
    " " +
    (memo.texto_formateado || "") +
    " " +
    (memo.resumen || "") +
    " " +
    (memo.puntos_tratados || []).join(" ") +
    " " +
    (memo.proximos_pasos || []).join(" ");

  const lower = textoBase.toLowerCase();
  const sugeridos: SuggestedDocument[] = [];

  // Detectar fideicomiso
  if (lower.includes("fideicomiso") || lower.includes("fiduciario")) {
    // Usar un contrato comercial genérico como base
    sugeridos.push({
      id: "contrato_fideicomiso",
      titulo: "Modelo de Contrato de Fideicomiso",
      descripcion: "Contrato base de fideicomiso según práctica de WNS.",
      icono: "description",
      templatePath: "templates/CORPO/COMERCIAL/CONTRATO DE PRESTACION DE SERVICIOS - MANUEL GONZALEZ .docx",
      areaLegal: "civil_comercial",
    });
  }

  // Detectar demandas o juicios
  if (lower.includes("demanda") || lower.includes("juicio") || lower.includes("acción judicial") || lower.includes("litigio")) {
    // Usar un dictamen legal como base para demandas
    sugeridos.push({
      id: "borrador_demanda",
      titulo: "Borrador de Demanda",
      descripcion: "Esqueleto de demanda para iniciar acciones judiciales.",
      icono: "gavel",
      templatePath: "templates/CORPO/DICTAMENTES Y DIAGNOSTICOS/Dictamen Legal - En favor de B1 Simple..docx",
      areaLegal: "civil_comercial",
    });
  }

  // Detectar contratos de prestación de servicios
  if (lower.includes("prestación de servicios") || lower.includes("servicios") || lower.includes("contrato de servicios")) {
    sugeridos.push({
      id: "contrato_prestacion_servicios",
      titulo: "Contrato de Prestación de Servicios",
      descripcion: "Modelo base para contratos de servicios profesionales.",
      icono: "description",
      templatePath: "templates/CORPO/COMERCIAL/CONTRATO DE PRESTACION DE SERVICIOS - MANUEL GONZALEZ .docx",
      areaLegal: "civil_comercial",
    });
  }

  // Detectar mutuos o préstamos
  if (lower.includes("mutuo") || lower.includes("préstamo") || lower.includes("prestamo") || lower.includes("financiación")) {
    sugeridos.push({
      id: "contrato_mutuo",
      titulo: "Contrato de Mutuo",
      descripcion: "Modelo de contrato de mutuo para préstamos.",
      icono: "description",
      templatePath: "templates/CORPO/COMERCIAL/MUTUO 24 9 2025.docx",
      areaLegal: "civil_comercial",
    });
  }

  // Detectar compraventa
  if (lower.includes("compraventa") || lower.includes("compra venta") || lower.includes("venta") || lower.includes("boleto")) {
    sugeridos.push({
      id: "boleto_compraventa",
      titulo: "Boleto de Compraventa",
      descripcion: "Modelo de boleto de compraventa para inmuebles o automotores.",
      icono: "description",
      templatePath: "templates/CORPO/CONTRATOS-BOLETOS DESARROLLO INMOBILIARIO/Modelo BOLETO DE COMPRAVENTA (v.3.09.2024) (1).docx",
      areaLegal: "civil_comercial",
    });
  }

  // Detectar temas laborales
  if (lower.includes("laboral") || lower.includes("empleado") || lower.includes("trabajador") || lower.includes("despido") || lower.includes("contrato laboral")) {
    sugeridos.push({
      id: "dictamen_laboral",
      titulo: "Dictamen Laboral",
      descripcion: "Dictamen sobre temas laborales y relaciones de trabajo.",
      icono: "gavel",
      templatePath: "templates/CORPO/DICTAMENTES Y DIAGNOSTICOS/_Dictamen - Suspensión de empleados por falta de trabajo (1).docx",
      areaLegal: "laboral",
    });
  }

  // Detectar marcas o propiedad intelectual
  if (lower.includes("marca") || lower.includes("propiedad intelectual") || lower.includes("patente") || lower.includes("registro")) {
    sugeridos.push({
      id: "dictamen_marca",
      titulo: "Dictamen de Marca",
      descripcion: "Dictamen sobre registro y protección de marcas.",
      icono: "gavel",
      templatePath: "templates/CORPO/DICTAMENTES Y DIAGNOSTICOS/Dictamen de Marca - OLGUITA.docx",
      areaLegal: "civil_comercial",
    });
  }

  // Detectar acuerdos de accionistas o temas societarios
  if (lower.includes("sociedad") || lower.includes("accionista") || lower.includes("societario") || lower.includes("capital social")) {
    sugeridos.push({
      id: "acuerdo_accionistas",
      titulo: "Acuerdo de Accionistas",
      descripcion: "Modelo de acuerdo entre accionistas de una sociedad.",
      icono: "description",
      templatePath: "templates/CORPO/SOCIETARIO/Acuerdo de accionistas HITCOWORK v1 (2).docx",
      areaLegal: "civil_comercial",
    });
  }

  // Siempre sugerimos un informe legal como documento genérico útil
  sugeridos.push({
    id: "informe_legal",
    titulo: "Informe Legal",
    descripcion: "Modelo de informe legal para documentar análisis y recomendaciones.",
    icono: "edit_document",
    templatePath: "templates/CORPO/DICTAMENTES Y DIAGNOSTICOS/INFORME LEGAL – Análisis de Contingencias, Escenarios y Estrategia Societaria (1).docx",
    areaLegal: memo.areaLegal || "civil_comercial",
  });

  // Limitar a máximo 5 sugerencias para no saturar la UI
  return sugeridos.slice(0, 5);
}

