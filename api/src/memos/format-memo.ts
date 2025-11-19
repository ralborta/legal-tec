import type { MemoOutput } from "./generate-memo-direct.js";

/**
 * Formatea un memo con diseño profesional si la IA no lo generó correctamente
 */
export function formatMemoProfesional(memo: MemoOutput): string {
  const fecha = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const separador = "═══════════════════════════════════════════════════════════════════════════════";
  const separadorSec = "───────────────────────────────────────────────────────────────────────────────";

  let texto = `${separador}\n`;
  texto += `WNS & ASOCIADOS\n`;
  texto += `ESTUDIO JURÍDICO\n\n`;
  texto += `Fecha: ${fecha}\n\n`;
  texto += `MEMORÁNDUM\n\n`;
  texto += `PARA: Cliente\n`;
  texto += `DE: WNS & Asociados\n`;
  texto += `ASUNTO: ${memo.titulo}\n`;
  texto += `${separador}\n\n\n`;

  // RESUMEN EJECUTIVO
  texto += `RESUMEN EJECUTIVO\n`;
  texto += `${separadorSec}\n`;
  texto += `${memo.resumen}\n\n\n`;

  // PUNTOS TRATADOS
  if (memo.puntos_tratados && memo.puntos_tratados.length > 0) {
    texto += `PUNTOS TRATADOS\n`;
    texto += `${separadorSec}\n`;
    memo.puntos_tratados.forEach((punto, index) => {
      texto += `${index + 1}. ${punto}\n`;
    });
    texto += `\n\n`;
  }

  // ANÁLISIS JURÍDICO
  texto += `ANÁLISIS JURÍDICO\n`;
  texto += `${separadorSec}\n`;
  texto += `${memo.analisis_juridico}\n\n\n`;

  // PRÓXIMOS PASOS
  if (memo.proximos_pasos && memo.proximos_pasos.length > 0) {
    texto += `PRÓXIMOS PASOS\n`;
    texto += `${separadorSec}\n`;
    memo.proximos_pasos.forEach((paso) => {
      texto += `• ${paso}\n`;
    });
    texto += `\n\n`;
  }

  // RIESGOS IDENTIFICADOS
  if (memo.riesgos && memo.riesgos.length > 0) {
    texto += `RIESGOS IDENTIFICADOS\n`;
    texto += `${separadorSec}\n`;
    memo.riesgos.forEach((riesgo) => {
      texto += `⚠ ${riesgo}\n`;
    });
    texto += `\n\n`;
  }

  // CIERRE
  texto += `${separador}\n\n`;
  texto += `Atentamente,\n\n`;
  texto += `WNS & ASOCIADOS\n`;
  texto += `Estudio Jurídico\n\n`;
  texto += `${separador}\n`;

  return texto;
}

