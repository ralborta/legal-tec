import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Evitar requests colgados si Postgres está lento/no disponible (Railway cold start / networking)
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
});

export const db = {
  async query(text: string, params?: any[], opts?: { timeoutMs?: number }) {
    const start = Date.now();
    const timeoutMs = opts?.timeoutMs ?? Number(process.env.PG_QUERY_TIMEOUT_MS || 20000);

    const res = (await Promise.race([
      pool.query(text, params),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`DB query timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ])) as any;
    const duration = Date.now() - start;
    console.log("Executed query", { text, duration, rows: res.rowCount });
    return res;
  },

  async getClient() {
    const client = await pool.connect();
    return client;
  },
};

// Helper functions para documentos legales
export const legalDb = {
  /**
   * Asegura que el schema mínimo exista.
   * Esto evita que el servicio quede "procesando" infinito si no se ejecutaron migraciones.
   */
  async ensureSchema() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS legal_documents (
        id VARCHAR(255) PRIMARY KEY,
        filename VARCHAR(500) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        raw_path TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'uploaded',
        progress INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS legal_analysis (
        document_id VARCHAR(255) PRIMARY KEY,
        type VARCHAR(100) NOT NULL,
        original JSONB NOT NULL,
        translated JSONB NOT NULL,
        checklist JSONB,
        report TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (document_id) REFERENCES legal_documents(id) ON DELETE CASCADE
      );
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_legal_documents_created_at ON legal_documents(created_at);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_legal_analysis_type ON legal_analysis(type);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_legal_analysis_created_at ON legal_analysis(created_at);`);

    // Asegurar columnas en caso de una tabla creada por migración vieja
    await db.query(`ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'uploaded';`);
    await db.query(`ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;`);
    await db.query(`ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS error_message TEXT;`);
    await db.query(`ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();`);

    // ✅ Crear tabla knowledge_bases automáticamente (si no existe)
    // Esto evita que el servicio crashee si la tabla no existe
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS knowledge_bases (
          id          text PRIMARY KEY,
          name        text NOT NULL,
          description text,
          source_type text NOT NULL,
          enabled     boolean DEFAULT true,
          metadata    jsonb DEFAULT '{}'::jsonb,
          created_at  timestamptz DEFAULT now(),
          updated_at  timestamptz DEFAULT now()
        )
      `);
      
      // Insertar bases de conocimiento por defecto (si no existen)
      await db.query(`
        INSERT INTO knowledge_bases (id, name, description, source_type, enabled) VALUES
          ('normativa_principal', 'Normativa Principal', 'Normativa argentina principal', 'normativa', true),
          ('jurisprudencia_principal', 'Jurisprudencia Principal', 'Jurisprudencia argentina principal', 'juris', true),
          ('interno_principal', 'Base Interna Principal', 'Documentos internos del estudio', 'interno', true)
        ON CONFLICT (id) DO NOTHING
      `);
      
      console.log("[DB] Tabla knowledge_bases creada/verificada");
    } catch (error) {
      console.warn("[DB] No se pudo crear/verificar knowledge_bases (continuando igual):", error);
      // No crashear si falla, el código es resiliente
    }
  },

  async createDocument(data: {
    id: string;
    filename: string;
    mimeType: string;
    rawPath: string;
  }) {
    const result = await db.query(
      `INSERT INTO legal_documents (id, filename, mime_type, raw_path, status, progress, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'uploaded', 0, NOW(), NOW())
       RETURNING *`,
      [data.id, data.filename, data.mimeType, data.rawPath]
    );
    return result.rows[0];
  },

  async getDocument(id: string) {
    const result = await db.query(
      `SELECT * FROM legal_documents WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async upsertAnalysis(data: {
    documentId: string;
    type: string;
    original: any;
    translated: any;
    checklist: any;
    report: any; // string o AnalysisReport object
  }) {
    try {
      // Preparar report: si es objeto, convertir a JSON string
      let reportValue: string;
      if (typeof data.report === 'string') {
        reportValue = data.report;
      } else {
        reportValue = JSON.stringify(data.report);
      }
      
      console.log(`[DB] Guardando análisis para ${data.documentId}, tipo: ${data.type}, report length: ${reportValue.length}`);
      
      const result = await db.query(
        `INSERT INTO legal_analysis (document_id, type, original, translated, checklist, report, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (document_id) 
         DO UPDATE SET 
           type = EXCLUDED.type,
           original = EXCLUDED.original,
           translated = EXCLUDED.translated,
           checklist = EXCLUDED.checklist,
           report = EXCLUDED.report,
           created_at = NOW()
         RETURNING *`,
        [
          data.documentId,
          data.type,
          JSON.stringify(data.original),
          JSON.stringify(data.translated),
          JSON.stringify(data.checklist),
          reportValue,
        ]
      );
      
      console.log(`[DB] ✅ Análisis guardado correctamente para ${data.documentId}`);
      return result.rows[0];
    } catch (error: any) {
      console.error(`[DB] ❌ Error guardando análisis para ${data.documentId}:`, error.message);
      throw error;
    }
  },

  async getFullResult(documentId: string) {
    try {
      const result = await db.query(
        `SELECT 
           d.*,
           a.type as analysis_type,
           a.original,
           a.translated,
           a.checklist,
           a.report,
           a.created_at as analyzed_at
         FROM legal_documents d
         LEFT JOIN legal_analysis a ON d.id = a.document_id
         WHERE d.id = $1`,
        [documentId]
      );
      
      if (result.rows.length === 0) {
        console.log(`[DB] Documento ${documentId} no encontrado`);
        return null;
      }
      
      const row = result.rows[0];
      
      if (!row.analysis_type) {
        console.log(`[DB] Documento ${documentId} existe pero no tiene análisis`);
        // Retornar documento sin análisis
        return {
          documentId: row.id,
          filename: row.filename,
          mimeType: row.mime_type,
          uploadedAt: row.created_at,
          analysis: null,
        };
      }
      
      console.log(`[DB] ✅ Análisis encontrado para ${documentId}, tipo: ${row.analysis_type}`);
      
      // Parsear report si es string JSON
      // PostgreSQL puede devolver JSONB como objeto o como string dependiendo del driver
      let report = row.report;
      if (report) {
        // Si es string, intentar parsear
        if (typeof report === 'string') {
          try {
            // Si es un string JSON válido, parsearlo
            if (report.trim().startsWith('{') || report.trim().startsWith('[')) {
              report = JSON.parse(report);
            }
            // Si no es JSON, mantener como string (texto plano)
          } catch (e) {
            console.warn(`[DB] No se pudo parsear report como JSON para ${row.id}:`, e.message);
            // Si no es JSON válido, mantener como string
          }
        }
        // Si ya es objeto (JSONB devuelto como objeto), usarlo directamente
      }
      
      return {
        documentId: row.id,
        filename: row.filename,
        mimeType: row.mime_type,
        uploadedAt: row.created_at,
        analysis: {
          type: row.analysis_type,
          original: row.original,
          translated: row.translated,
          checklist: row.checklist,
          report: report,
          analyzedAt: row.analyzed_at,
        },
      };
    } catch (error: any) {
      console.error(`[DB] ❌ Error obteniendo resultado para ${documentId}:`, error.message);
      throw error;
    }
  },

  async getAnalysis(documentId: string) {
    const result = await db.query(
      `SELECT * FROM legal_analysis WHERE document_id = $1`,
      [documentId]
    );
    return result.rows[0] || null;
  },

  async getAllDocumentsWithAnalysis(limit = 100) {
    const result = await db.query(
      `SELECT 
         d.id,
         d.filename,
         d.mime_type,
         d.status,
         d.created_at,
         d.updated_at,
         a.type as analysis_type,
         a.report,
         a.created_at as analyzed_at
       FROM legal_documents d
       LEFT JOIN legal_analysis a ON d.id = a.document_id
       ORDER BY d.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  async updateAnalysisStatus(documentId: string, status: string, progress: number) {
    // Persistir en legal_documents para que /status y la UI puedan reportar progreso real
    try {
      await db.query(
        `UPDATE legal_documents
         SET status = $2, progress = $3, updated_at = NOW()
         WHERE id = $1`,
        [documentId, status, progress]
      );
    } catch (error) {
      console.log(`[STATUS] ${documentId}: ${status} (${progress}%) (no persistido: ${error})`);
    }
  },

  async setAnalysisError(documentId: string, message: string) {
    try {
      await db.query(
        `UPDATE legal_documents
         SET status = 'error', progress = 0, error_message = $2, updated_at = NOW()
         WHERE id = $1`,
        [documentId, message]
      );
    } catch (error) {
      console.log(`[STATUS] ${documentId}: error (no persistido: ${error})`);
    }
  },

  async cleanupOldDocuments(daysToKeep: number) {
    try {
      const result = await db.query(
        `DELETE FROM legal_documents
         WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
         RETURNING id, raw_path`
      );
      
      // También eliminar análisis asociados
      if (result.rows.length > 0) {
        const ids = result.rows.map((r: any) => r.id);
        await db.query(
          `DELETE FROM legal_analysis WHERE document_id = ANY($1)`,
          [ids]
        );
      }
      
      return result.rows.length;
    } catch (error: any) {
      console.error(`[DB] Error en cleanup:`, error?.message);
      return 0;
    }
  },

  async getAllDocumentsForCleanup() {
    // Obtener todos los documentos ordenados por fecha (más recientes primero)
    // Incluye raw_path para poder borrar los archivos
    const result = await db.query(
      `SELECT id, filename, raw_path, created_at
       FROM legal_documents
       ORDER BY created_at DESC`
    );
    return result.rows;
  },

  async deleteDocumentsByIds(ids: string[]) {
    if (ids.length === 0) return 0;
    
    try {
      // Borrar análisis primero (aunque CASCADE lo haría automáticamente)
      await db.query(
        `DELETE FROM legal_analysis WHERE document_id = ANY($1)`,
        [ids]
      );
      
      // Borrar documentos
      const result = await db.query(
        `DELETE FROM legal_documents WHERE id = ANY($1) RETURNING id`,
        [ids]
      );
      
      return result.rows.length;
    } catch (error: any) {
      console.error(`[DB] Error borrando documentos por IDs:`, error?.message);
      return 0;
    }
  },

  async getDocumentCount() {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM legal_documents`
    );
    return result.rows[0] || { count: 0 };
  },
};

