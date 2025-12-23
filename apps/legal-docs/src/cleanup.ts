/**
 * Cleanup automático de archivos antiguos
 * Elimina archivos y registros de DB más antiguos que X días
 */

import { readdir, unlink, stat } from "fs/promises";
import { join } from "path";
import { legalDb } from "./db.js";

const STORAGE_DIR = process.env.STORAGE_DIR || "./storage";
const DAYS_TO_KEEP = parseInt(process.env.CLEANUP_DAYS_TO_KEEP || "30", 10); // 30 días por defecto

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
    
    console.log(`[CLEANUP] Completado: ${deletedCount} archivos eliminados, ${deletedDbRecords} registros DB eliminados, ${errorCount} errores`);
    
    return { deletedFiles: deletedCount, deletedDbRecords, errors: errorCount };
  } catch (error: any) {
    console.error(`[CLEANUP] Error en limpieza:`, error?.message);
    throw error;
  }
}

// Ejecutar cleanup cada 24 horas
export function startCleanupScheduler() {
  // Ejecutar inmediatamente al iniciar
  cleanupOldFiles().catch((err) => {
    console.error("[CLEANUP] Error en cleanup inicial:", err);
  });

  // Luego cada 24 horas
  setInterval(() => {
    cleanupOldFiles().catch((err) => {
      console.error("[CLEANUP] Error en cleanup programado:", err);
    });
  }, 24 * 60 * 60 * 1000);

  console.log(`[CLEANUP] Scheduler iniciado: limpieza cada 24 horas, manteniendo archivos de últimos ${DAYS_TO_KEEP} días`);
}

