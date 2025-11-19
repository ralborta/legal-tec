/**
 * Polyfill para DOMMatrix (requerido por pdf-parse en Node.js)
 * Se ejecuta inmediatamente al cargar el módulo
 */
if (typeof globalThis.DOMMatrix === 'undefined') {
  // @ts-ignore - Polyfill para DOMMatrix
  globalThis.DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0;
    
    constructor(init?: string | number[] | DOMMatrix) {
      if (init) {
        if (typeof init === 'string') {
          // Parsear matriz CSS
          const values = init.match(/matrix\(([^)]+)\)/)?.[1]?.split(',').map(Number) || [];
          if (values.length >= 6) {
            this.a = values[0]; this.b = values[1];
            this.c = values[2]; this.d = values[3];
            this.e = values[4]; this.f = values[5];
            this.m11 = values[0]; this.m12 = values[1];
            this.m21 = values[2]; this.m22 = values[3];
            this.m41 = values[4]; this.m42 = values[5];
          }
        } else if (Array.isArray(init)) {
          if (init.length >= 6) {
            this.a = init[0]; this.b = init[1];
            this.c = init[2]; this.d = init[3];
            this.e = init[4]; this.f = init[5];
            this.m11 = init[0]; this.m12 = init[1];
            this.m21 = init[2]; this.m22 = init[3];
            this.m41 = init[4]; this.m42 = init[5];
          }
        }
      }
    }
    
    static fromMatrix(other?: DOMMatrix) {
      return new DOMMatrix(other as any);
    }
    
    multiply(other: DOMMatrix) {
      return new DOMMatrix();
    }
    
    translate(x: number, y: number) {
      return new DOMMatrix();
    }
    
    scale(x: number, y?: number) {
      return new DOMMatrix();
    }
  } as any;
}

/**
 * Extrae texto de un buffer de PDF
 * @param buffer Buffer del archivo PDF
 * @returns Texto extraído del PDF
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Polyfill ya está configurado al inicio del módulo
    // Usar createRequire para importar CommonJS en ESM
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const pdfParse = require("pdf-parse");
    
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (error) {
    throw new Error(`Error al extraer texto del PDF: ${error instanceof Error ? error.message : "Error desconocido"}`);
  }
}

