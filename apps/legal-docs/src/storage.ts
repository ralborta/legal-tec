import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { legalDb } from "./db.js";

const STORAGE_DIR = process.env.STORAGE_DIR || "./storage";

// Asegurar que el directorio existe
if (!existsSync(STORAGE_DIR)) {
  mkdirSync(STORAGE_DIR, { recursive: true });
}

/**
 * Guardar documento de forma atómica y robusta
 * ✅ Solo devuelve documentId si el archivo se guardó correctamente
 * ✅ Valida tamaño máximo
 * ✅ Valida que el archivo existe después de guardarlo
 */
export async function saveOriginalDocument(file: {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}): Promise<string> {
  // Validar tamaño máximo (50MB)
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  if (file.buffer.length > MAX_FILE_SIZE) {
    throw new Error(`Archivo demasiado grande: ${(file.buffer.length / 1024 / 1024).toFixed(2)}MB. Máximo permitido: 50MB`);
  }

  if (file.buffer.length === 0) {
    throw new Error("El archivo está vacío");
  }

  const documentId = randomUUID();
  const fileExtension = file.filename.split(".").pop() || "bin";
  const storagePath = join(STORAGE_DIR, `${documentId}.${fileExtension}`);

  // ✅ PASO 1: Guardar archivo en disco PRIMERO
  try {
    writeFileSync(storagePath, file.buffer);
  } catch (error: any) {
    throw new Error(`Error al guardar archivo en disco: ${error?.message || "Error desconocido"}`);
  }

  // ✅ PASO 2: Validar que el archivo se guardó correctamente
  if (!existsSync(storagePath)) {
    throw new Error("El archivo no se guardó correctamente en disco");
  }

  // Validar tamaño del archivo guardado
  const { statSync } = await import("fs");
  const stats = statSync(storagePath);
  if (stats.size !== file.buffer.length) {
    // Limpiar archivo corrupto
    try {
      const { unlinkSync } = await import("fs");
      unlinkSync(storagePath);
    } catch {}
    throw new Error(`El archivo guardado está corrupto (tamaño esperado: ${file.buffer.length}, guardado: ${stats.size})`);
  }

  // ✅ PASO 3: Solo después de validar, guardar metadata en DB
  try {
    await legalDb.createDocument({
      id: documentId,
      filename: file.filename,
      mimeType: file.mimetype,
      rawPath: storagePath,
    });
  } catch (dbError: any) {
    // Si falla la DB, limpiar el archivo
    try {
      const { unlinkSync } = await import("fs");
      unlinkSync(storagePath);
    } catch {}
    throw new Error(`Error al guardar metadata en DB: ${dbError?.message || "Error desconocido"}`);
  }

  // ✅ PASO 4: Validación final - asegurar que todo está bien
  if (!existsSync(storagePath)) {
    throw new Error("El archivo desapareció después de guardarlo");
  }

  return documentId;
}

export async function getFullResult(documentId: string) {
  return await legalDb.getFullResult(documentId);
}

/**
 * Obtener buffer del documento
 * ✅ Valida que el archivo existe físicamente (no solo en DB)
 */
export async function getDocumentBuffer(documentId: string): Promise<Buffer | null> {
  const doc = await legalDb.getDocument(documentId);
  if (!doc) {
    console.warn(`[STORAGE] Documento no encontrado en DB: ${documentId}`);
    return null;
  }

  // ✅ Validar que el archivo existe físicamente
  if (!existsSync(doc.raw_path)) {
    console.error(`[STORAGE] Archivo no existe en disco: ${doc.raw_path} (documentId: ${documentId})`);
    return null;
  }

  try {
    const buffer = readFileSync(doc.raw_path);
    if (buffer.length === 0) {
      console.error(`[STORAGE] Archivo vacío: ${doc.raw_path}`);
      return null;
    }
    return buffer;
  } catch (error: any) {
    console.error(`[STORAGE] Error leyendo archivo ${doc.raw_path}:`, error?.message || error);
    return null;
  }
}

