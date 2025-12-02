import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { legalDb } from "./db.js";

const STORAGE_DIR = process.env.STORAGE_DIR || "./storage";

// Asegurar que el directorio existe
if (!existsSync(STORAGE_DIR)) {
  mkdirSync(STORAGE_DIR, { recursive: true });
}

export async function saveOriginalDocument(file: {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}): Promise<string> {
  const documentId = randomUUID();
  const fileExtension = file.filename.split(".").pop() || "bin";
  const storagePath = join(STORAGE_DIR, `${documentId}.${fileExtension}`);

  // Guardar archivo en disco
  writeFileSync(storagePath, file.buffer);

  // Guardar metadata en DB
  await legalDb.createDocument({
    id: documentId,
    filename: file.filename,
    mimeType: file.mimetype,
    rawPath: storagePath,
  });

  return documentId;
}

export async function getFullResult(documentId: string) {
  return await legalDb.getFullResult(documentId);
}

export async function getDocumentBuffer(documentId: string): Promise<Buffer | null> {
  const doc = await legalDb.getDocument(documentId);
  if (!doc) {
    return null;
  }

  try {
    return readFileSync(doc.raw_path);
  } catch (error) {
    console.error(`Error reading file ${doc.raw_path}:`, error);
    return null;
  }
}

