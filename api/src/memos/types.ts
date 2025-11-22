import type { LegalArea } from "./legal-areas.js";

/**
 * Tipo de documento sugerido basado en el contenido del memo
 */
export interface SuggestedDocument {
  id: string;                // "contrato_fideicomiso", "borrador_demanda", etc.
  titulo: string;            // Texto que se muestra en la UI
  descripcion?: string;      // Opcional: breve explicación
  icono?: "description" | "gavel" | "edit_document" | "file_present"; // nombre de material icon
  templatePath: string;      // ruta relativa al repo, ej: "templates/corpo/comercial/CONTRATO_FIDEICOMISO_BASE.docx"
  areaLegal?: LegalArea;      // "civil_comercial", "laboral", ...
}

/**
 * Estructura completa de salida de un memo jurídico
 */
export interface MemoOutput {
  titulo: string;
  tipo_documento: string;
  resumen: string;
  puntos_tratados: string[];
  analisis_juridico: string;
  proximos_pasos: string[];
  riesgos: string[];
  texto_formateado: string;
  areaLegal?: LegalArea; // Área legal del memo (opcional, se puede inferir del contenido)
  citas?: Array<{
    tipo: "normativa" | "jurisprudencia" | "doctrina" | "otra";
    referencia: string;
    descripcion?: string;
    url?: string;
  }>;
  documentos_sugeridos?: SuggestedDocument[];
}

