/**
 * Límite de análisis concurrentes simple (sin Redis)
 * Evita saturar OpenAI con demasiadas requests simultáneas
 */

let activeAnalyses = 0;
const MAX_CONCURRENT_ANALYSES = 3; // Máximo 3 análisis al mismo tiempo
const waitingQueue: Array<() => void> = [];

export async function acquireAnalysisSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    if (activeAnalyses < MAX_CONCURRENT_ANALYSES) {
      activeAnalyses++;
      // Retornar función para liberar el slot
      resolve(() => {
        activeAnalyses--;
        // Procesar siguiente en la cola si hay
        if (waitingQueue.length > 0 && activeAnalyses < MAX_CONCURRENT_ANALYSES) {
          const next = waitingQueue.shift();
          if (next) {
            activeAnalyses++;
            next();
          }
        }
      });
    } else {
      // Agregar a la cola
      waitingQueue.push(() => {
        activeAnalyses++;
        resolve(() => {
          activeAnalyses--;
          if (waitingQueue.length > 0 && activeAnalyses < MAX_CONCURRENT_ANALYSES) {
            const next = waitingQueue.shift();
            if (next) {
              activeAnalyses++;
              next();
            }
          }
        });
      });
    }
  });
}

export function getConcurrencyStats() {
  return {
    active: activeAnalyses,
    max: MAX_CONCURRENT_ANALYSES,
    waiting: waitingQueue.length,
  };
}

