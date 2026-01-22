/**
 * Límite de análisis concurrentes simple (sin Redis)
 * Evita saturar OpenAI con demasiadas requests simultáneas
 */

let activeAnalyses = 0;
// Configurable por variable de entorno, default 3
const MAX_CONCURRENT_ANALYSES = process.env.MAX_CONCURRENT_ANALYSES 
  ? parseInt(process.env.MAX_CONCURRENT_ANALYSES, 10) 
  : 3; // Máximo 3 análisis al mismo tiempo por defecto
const waitingQueue: Array<() => void> = [];
const MAX_QUEUE_SIZE = 10; // Máximo 10 análisis en cola de espera

export async function acquireAnalysisSlot(): Promise<() => void> {
  return new Promise((resolve, reject) => {
    // Si la cola está llena, rechazar inmediatamente
    if (waitingQueue.length >= MAX_QUEUE_SIZE) {
      reject(new Error(`Cola de análisis llena. Hay ${waitingQueue.length} análisis esperando. Por favor, intenta más tarde.`));
      return;
    }
    
    if (activeAnalyses < MAX_CONCURRENT_ANALYSES) {
      activeAnalyses++;
      console.log(`[CONCURRENCY] Slot adquirido. Activos: ${activeAnalyses}/${MAX_CONCURRENT_ANALYSES}, En cola: ${waitingQueue.length}`);
      // Retornar función para liberar el slot
      resolve(() => {
        activeAnalyses--;
        console.log(`[CONCURRENCY] Slot liberado. Activos: ${activeAnalyses}/${MAX_CONCURRENT_ANALYSES}, En cola: ${waitingQueue.length}`);
        // Procesar siguiente en la cola si hay
        if (waitingQueue.length > 0 && activeAnalyses < MAX_CONCURRENT_ANALYSES) {
          const next = waitingQueue.shift();
          if (next) {
            activeAnalyses++;
            console.log(`[CONCURRENCY] Procesando siguiente de cola. Activos: ${activeAnalyses}/${MAX_CONCURRENT_ANALYSES}`);
            next();
          }
        }
      });
    } else {
      // Agregar a la cola
      console.log(`[CONCURRENCY] Sin slots disponibles. Agregando a cola (posición ${waitingQueue.length + 1}/${MAX_QUEUE_SIZE})`);
      waitingQueue.push(() => {
        activeAnalyses++;
        console.log(`[CONCURRENCY] Slot adquirido desde cola. Activos: ${activeAnalyses}/${MAX_CONCURRENT_ANALYSES}, En cola: ${waitingQueue.length}`);
        resolve(() => {
          activeAnalyses--;
          console.log(`[CONCURRENCY] Slot liberado. Activos: ${activeAnalyses}/${MAX_CONCURRENT_ANALYSES}, En cola: ${waitingQueue.length}`);
          if (waitingQueue.length > 0 && activeAnalyses < MAX_CONCURRENT_ANALYSES) {
            const next = waitingQueue.shift();
            if (next) {
              activeAnalyses++;
              console.log(`[CONCURRENCY] Procesando siguiente de cola. Activos: ${activeAnalyses}/${MAX_CONCURRENT_ANALYSES}`);
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

