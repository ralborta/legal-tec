import { join } from "path";

export type LegalArea = "civil_comercial" | "laboral" | "corporativo" | "societario" | "consumidor" | "marcas";
export type DocumentType = "contrato" | "dictamen" | "informe" | "acta" | "demanda" | "boleto" | "acuerdo";

export type LegalTemplate = {
  id: string;                    // identificador estable
  nombre: string;                // cómo lo ve el usuario
  areaLegal: LegalArea;
  tipoDocumento: DocumentType;
  rutaRelativa: string;          // ruta dentro de /templates (desde la raíz del proyecto)
  tags?: string[];               // palabras clave para sugerencias
  descripcion?: string;          // descripción breve del template
};

export const LEGAL_TEMPLATES: LegalTemplate[] = [
  // Contratos comerciales
  {
    id: "contrato-prestacion-servicios",
    nombre: "Contrato de Prestación de Servicios",
    areaLegal: "civil_comercial",
    tipoDocumento: "contrato",
    rutaRelativa: "templates/CORPO/COMERCIAL/CONTRATO DE PRESTACION DE SERVICIOS - MANUEL GONZALEZ .docx",
    tags: ["servicios", "prestación", "contrato", "comercial"],
    descripcion: "Modelo base para contratos de servicios profesionales.",
  },
  {
    id: "contrato-mutuo",
    nombre: "Contrato de Mutuo",
    areaLegal: "civil_comercial",
    tipoDocumento: "contrato",
    rutaRelativa: "templates/CORPO/COMERCIAL/MUTUO 24 9 2025.docx",
    tags: ["mutuo", "préstamo", "financiación", "dinero"],
    descripcion: "Modelo de contrato de mutuo para préstamos.",
  },
  {
    id: "contrato-locacion",
    nombre: "Contrato de Locación",
    areaLegal: "civil_comercial",
    tipoDocumento: "contrato",
    rutaRelativa: "templates/CORPO/COMERCIAL/CONTRATO DE LOCACIÓN - LOCAL - SÖNNE.docx",
    tags: ["locación", "alquiler", "inmueble", "local"],
    descripcion: "Contrato de locación para locales comerciales.",
  },
  {
    id: "contrato-leasing",
    nombre: "Contrato de Leasing",
    areaLegal: "civil_comercial",
    tipoDocumento: "contrato",
    rutaRelativa: "templates/CORPO/COMERCIAL/CONTRATO DE LEASING - INKTEC 14 10 2025.docx",
    tags: ["leasing", "arrendamiento", "equipamiento"],
    descripcion: "Contrato de leasing para equipos y bienes muebles.",
  },
  {
    id: "contrato-licencia",
    nombre: "Contrato de Licencia",
    areaLegal: "civil_comercial",
    tipoDocumento: "contrato",
    rutaRelativa: "templates/CORPO/COMERCIAL/Contrato de Licencia - TrackIOT (29_09_25) (1).docx",
    tags: ["licencia", "software", "tecnología", "propiedad intelectual"],
    descripcion: "Contrato de licencia de software y tecnología.",
  },
  {
    id: "contrato-obra",
    nombre: "Contrato de Obra",
    areaLegal: "civil_comercial",
    tipoDocumento: "contrato",
    rutaRelativa: "templates/CORPO/COMERCIAL/Contrato de Obra- Jurojin _ Escritores de Artículos.docx",
    tags: ["obra", "construcción", "edificación", "trabajos"],
    descripcion: "Contrato para ejecución de obras y trabajos.",
  },
  {
    id: "contrato-comodato",
    nombre: "Contrato de Comodato",
    areaLegal: "civil_comercial",
    tipoDocumento: "contrato",
    rutaRelativa: "templates/CORPO/COMERCIAL/Contrato de comodato - Double G. (1).docx",
    tags: ["comodato", "préstamo", "uso", "bienes"],
    descripcion: "Contrato de comodato para préstamo de uso.",
  },
  
  // Boletos y compraventas
  {
    id: "boleto-compraventa",
    nombre: "Boleto de Compraventa",
    areaLegal: "civil_comercial",
    tipoDocumento: "boleto",
    rutaRelativa: "templates/CORPO/CONTRATOS-BOLETOS DESARROLLO INMOBILIARIO/Modelo BOLETO DE COMPRAVENTA (v.3.09.2024) (1).docx",
    tags: ["boleto", "compraventa", "inmueble", "venta"],
    descripcion: "Modelo de boleto de compraventa para inmuebles.",
  },
  {
    id: "cesion-boleto",
    nombre: "Cesión de Boleto",
    areaLegal: "civil_comercial",
    tipoDocumento: "contrato",
    rutaRelativa: "templates/CORPO/COMERCIAL/Cesión de Boleto _ 8B y 2A Est. de Israel.docx",
    tags: ["cesión", "boleto", "transferencia", "derechos"],
    descripcion: "Modelo de cesión de boleto de compraventa.",
  },
  
  // Dictámenes e informes
  {
    id: "dictamen-legal",
    nombre: "Dictamen Legal",
    areaLegal: "civil_comercial",
    tipoDocumento: "dictamen",
    rutaRelativa: "templates/CORPO/DICTAMENTES Y DIAGNOSTICOS/Dictamen Legal - En favor de B1 Simple..docx",
    tags: ["dictamen", "legal", "opinión", "análisis"],
    descripcion: "Modelo de dictamen legal para análisis jurídico.",
  },
  {
    id: "dictamen-marca",
    nombre: "Dictamen de Marca",
    areaLegal: "marcas",
    tipoDocumento: "dictamen",
    rutaRelativa: "templates/CORPO/DICTAMENTES Y DIAGNOSTICOS/Dictamen de Marca - OLGUITA.docx",
    tags: ["marca", "propiedad intelectual", "registro", "trademark"],
    descripcion: "Dictamen sobre registro y protección de marcas.",
  },
  {
    id: "dictamen-laboral",
    nombre: "Dictamen Laboral",
    areaLegal: "laboral",
    tipoDocumento: "dictamen",
    rutaRelativa: "templates/CORPO/DICTAMENTES Y DIAGNOSTICOS/_Dictamen - Suspensión de empleados por falta de trabajo (1).docx",
    tags: ["laboral", "empleado", "trabajador", "despido", "suspensión"],
    descripcion: "Dictamen sobre temas laborales y relaciones de trabajo.",
  },
  {
    id: "informe-legal",
    nombre: "Informe Legal",
    areaLegal: "civil_comercial",
    tipoDocumento: "informe",
    rutaRelativa: "templates/CORPO/DICTAMENTES Y DIAGNOSTICOS/INFORME LEGAL – Análisis de Contingencias, Escenarios y Estrategia Societaria (1).docx",
    tags: ["informe", "análisis", "contingencias", "societario"],
    descripcion: "Modelo de informe legal para análisis de contingencias.",
  },
  {
    id: "diagnostico-legal",
    nombre: "Diagnóstico Legal",
    areaLegal: "civil_comercial",
    tipoDocumento: "informe",
    rutaRelativa: "templates/CORPO/DICTAMENTES Y DIAGNOSTICOS/Diagnóstico Legal - SUPPLY SOLUTIONS (1).docx",
    tags: ["diagnóstico", "análisis", "evaluación", "situación"],
    descripcion: "Modelo de diagnóstico legal para evaluar situaciones jurídicas.",
  },
  
  // Acuerdos societarios
  {
    id: "acuerdo-accionistas",
    nombre: "Acuerdo de Accionistas",
    areaLegal: "societario",
    tipoDocumento: "acuerdo",
    rutaRelativa: "templates/CORPO/SOCIETARIO/Acuerdo de accionistas HITCOWORK v1 (2).docx",
    tags: ["sociedad", "accionistas", "acuerdo", "societario"],
    descripcion: "Modelo de acuerdo entre accionistas de una sociedad.",
  },
];

/**
 * Obtiene la ruta absoluta de un template
 */
export function getTemplateAbsolutePath(template: LegalTemplate): string {
  return join(process.cwd(), template.rutaRelativa);
}

/**
 * Busca un template por su ID
 */
export function findTemplateById(id: string): LegalTemplate | undefined {
  return LEGAL_TEMPLATES.find(t => t.id === id);
}

