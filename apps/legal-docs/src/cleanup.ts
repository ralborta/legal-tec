/**
 * Cleanup automático de archivos antiguos
 * Estrategias:
 * 1. Por días (CLEANUP_DAYS_TO_KEEP)
 * 2. Por cantidad máxima (CLEANUP_MAX_DOCUMENTS) - MANTIENE los últimos N
 * 3. Por espacio en disco (si se implementa)
 */

import { readdir, unlink, stat } from "fs/promises";
import { join } from "path";
import { legalDb } from "./db.js";

const STORAGE_DIR = process.env.STORAGE_DIR || "./storage";
// ⚠️ IMPORTANTE: Valores por defecto solo se usan si las variables NO están configuradas
// Si las variables están configuradas, se usan esos valores. Si no, el cleanup está DESACTIVADO
const DAYS_TO_KEEP = process.env.CLEANUP_DAYS_TO_KEEP 
  ? parseInt(process.env.CLEANUP_DAYS_TO_KEEP, 10) 
  : 30; // Default más conservador si se usa
const MAX_DOCUMENTS = process.env.CLEANUP_MAX_DOCUMENTS 
  ? parseInt(process.env.CLEANUP_MAX_DOCUMENTS, 10) 
  : 100; // Default más conservador si se usa
const CLEANUP_INTERVAL_HOURS = process.env.CLEANUP_INTERVAL_HOURS 
  ? parseInt(process.env.CLEANUP_INTERVAL_HOURS, 10) 
  : 24; // Default más conservador si se usa

/**
 * Limpiar por cantidad: mantener solo los últimos N documentos
 */
async function cleanupByMaxDocuments() {
  try {
    console.log(`[CLEANUP] Verificando límite de documentos (máximo ${MAX_DOCUMENTS})...`);
    
    // Obtener todos los documentos ordenados por fecha (más recientes primero)
    const result = await legalDb.getAllDocumentsForCleanup();
    
    if (result.length <= MAX_DOCUMENTS) {
      console.log(`[CLEANUP] Hay ${result.length} documentos, no se excede el límite de ${MAX_DOCUMENTS}`);
      return { deletedFiles: 0, deletedDbRecords: 0, errors: 0 };
    }

    // Identificar documentos a borrar (todos excepto los últimos MAX_DOCUMENTS)
    const documentsToDelete = result.slice(MAX_DOCUMENTS);
    const idsToDelete = documentsToDelete.map((doc: any) => doc.id);
    
    console.log(`[CLEANUP] Hay ${result.length} documentos, borrando ${idsToDelete.length} (manteniendo los últimos ${MAX_DOCUMENTS})`);

    // Borrar archivos del disco
    let deletedFiles = 0;
    let errorCount = 0;
    
    for (const doc of documentsToDelete) {
      try {
        // raw_path puede ser relativo o absoluto
        const filePath = doc.raw_path.startsWith('/') 
          ? doc.raw_path 
          : join(STORAGE_DIR, doc.raw_path);
        
        try {
          await unlink(filePath);
          deletedFiles++;
          console.log(`[CLEANUP] Archivo eliminado: ${filePath}`);
        } catch (err: any) {
          // Archivo ya no existe o no se puede acceder, continuar
          if (err.code !== 'ENOENT') {
            console.warn(`[CLEANUP] Error eliminando archivo ${filePath}:`, err?.message);
            errorCount++;
          }
        }
      } catch (error: any) {
        errorCount++;
        console.warn(`[CLEANUP] Error procesando documento ${doc.id}:`, error?.message);
      }
    }

    // Borrar de la DB (esto también borra los análisis por CASCADE)
    const deletedDbRecords = await legalDb.deleteDocumentsByIds(idsToDelete);
    
    console.log(`[CLEANUP] Por cantidad: ${deletedFiles} archivos eliminados, ${deletedDbRecords} registros DB eliminados`);
    
    return { deletedFiles, deletedDbRecords, errors: errorCount };
  } catch (error: any) {
    console.error(`[CLEANUP] Error en limpieza por cantidad:`, error?.message);
    throw error;
  }
}

/**
 * Limpiar por días (método original)
 */
export async function cleanupOldFiles() {
  try {
    console.log(`[CLEANUP] Iniciando limpieza de archivos más antiguos que ${DAYS_TO_KEEP} días...`);
    
    const files = await readdir(STORAGE_DIR);
    const now = Date.now();
    const maxAge = DAYS_TO_KEEP * 24 * 60 * 60 * 1000; // Convertir días a ms
    let deletedCount = 0;
    let errorCount = 0;

    for (const file of files) {
      try {
        const filePath = join(STORAGE_DIR, file);
        const stats = await stat(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          // Archivo es más antiguo que el límite
          await unlink(filePath);
          deletedCount++;
          console.log(`[CLEANUP] Eliminado archivo antiguo: ${file}`);
        }
      } catch (error: any) {
        errorCount++;
        console.warn(`[CLEANUP] Error procesando archivo ${file}:`, error?.message);
      }
    }

    // También limpiar registros de DB antiguos
    const deletedDbRecords = await legalDb.cleanupOldDocuments(DAYS_TO_KEEP);
    
    console.log(`[CLEANUP] Por días: ${deletedCount} archivos eliminados, ${deletedDbRecords} registros DB eliminados, ${errorCount} errores`);
    
    return { deletedFiles: deletedCount, deletedDbRecords, errors: errorCount };
  } catch (error: any) {
    console.error(`[CLEANUP] Error en limpieza:`, error?.message);
    throw error;
  }
}

/**
 * Limpieza completa: por cantidad Y por días
 */
export async function runFullCleanup() {
  console.log(`[CLEANUP] ===== Iniciando limpieza completa =====`);
  
  // Primero limpiar por cantidad (más importante para piloto)
  const byCount = await cleanupByMaxDocuments();
  
  // Luego limpiar por días (por si acaso)
  const byDays = await cleanupOldFiles();
  
  const total = {
    deletedFiles: byCount.deletedFiles + byDays.deletedFiles,
    deletedDbRecords: byCount.deletedDbRecords + byDays.deletedDbRecords,
    errors: byCount.errors + byDays.errors,
  };
  
  console.log(`[CLEANUP] ===== Limpieza completa finalizada =====`);
  console.log(`[CLEANUP] Total: ${total.deletedFiles} archivos, ${total.deletedDbRecords} registros DB, ${total.errors} errores`);
  
  return total;
}

/**
 * Obtener estadísticas de uso
 */
export async function getStorageStats() {
  try {
    const result = await legalDb.getDocumentCount();
    const totalDocuments = result.count || 0;
    
    // Calcular tamaño total de archivos
    let totalSize = 0;
    let fileCount = 0;
    
    try {
      const files = await readdir(STORAGE_DIR);
      for (const file of files) {
        try {
          const filePath = join(STORAGE_DIR, file);
          const stats = await stat(filePath);
          totalSize += stats.size;
          fileCount++;
        } catch (err) {
          // Ignorar errores de archivos individuales
        }
      }
    } catch (err) {
      // Directorio no existe o no se puede leer
    }
    
    return {
      totalDocuments,
      maxDocuments: MAX_DOCUMENTS,
      fileCount,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      daysToKeep: DAYS_TO_KEEP,
      cleanupIntervalHours: CLEANUP_INTERVAL_HOURS,
    };
  } catch (error: any) {
    console.error(`[CLEANUP] Error obteniendo estadísticas:`, error?.message);
    return null;
  }
}

// Ejecutar cleanup cada X horas (configurable)
export function startCleanupScheduler() {
  // ⚠️ CRÍTICO: Solo ejecutar cleanup si las variables están EXPLÍCITAMENTE configuradas
  // Esto evita que se borren datos por accidente con valores por defecto
  const hasMaxDocuments = process.env.CLEANUP_MAX_DOCUMENTS !== undefined;
  const hasDaysToKeep = process.env.CLEANUP_DAYS_TO_KEEP !== undefined;
  const hasInterval = process.env.CLEANUP_INTERVAL_HOURS !== undefined;
  
  if (!hasMaxDocuments && !hasDaysToKeep && !hasInterval) {
    console.log(`[CLEANUP] ⚠️ Variables de entorno no configuradas - Cleanup DESACTIVADO`);
    console.log(`[CLEANUP] Para activar, configurar: CLEANUP_MAX_DOCUMENTS, CLEANUP_DAYS_TO_KEEP, CLEANUP_INTERVAL_HOURS`);
    return;
  }
  
  console.log(`[CLEANUP] ✅ Variables configuradas - Scheduler iniciado:`);
  console.log(`[CLEANUP]   - Limpieza cada ${CLEANUP_INTERVAL_HOURS} horas`);
  console.log(`[CLEANUP]   - Mantiene máximo ${MAX_DOCUMENTS} documentos`);
  console.log(`[CLEANUP]   - Mantiene archivos de últimos ${DAYS_TO_KEEP} días`);
  
  // Ejecutar inmediatamente al iniciar (solo si está configurado)
  runFullCleanup().catch((err) => {
    console.error("[CLEANUP] Error en cleanup inicial:", err);
  });

  // Luego cada X horas
  const intervalMs = CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;
  setInterval(() => {
    runFullCleanup().catch((err) => {
      console.error("[CLEANUP] Error en cleanup programado:", err);
    });
  }, intervalMs);
}
