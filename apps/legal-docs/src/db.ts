import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = {
  async query(text: string, params?: any[]) {
    const start = Date.now();
    const res = await pool.query(text, params);
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
  async createDocument(data: {
    id: string;
    filename: string;
    mimeType: string;
    rawPath: string;
  }) {
    const result = await db.query(
      `INSERT INTO legal_documents (id, filename, mime_type, raw_path, created_at)
       VALUES ($1, $2, $3, $4, NOW())
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
    report: string;
  }) {
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
        data.report,
      ]
    );
    return result.rows[0];
  },

  async getFullResult(documentId: string) {
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
      return null;
    }

    const row = result.rows[0];
    return {
      documentId: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      uploadedAt: row.created_at,
      analysis: row.analysis_type ? {
        type: row.analysis_type,
        original: row.original,
        translated: row.translated,
        checklist: row.checklist,
        report: row.report,
        analyzedAt: row.analyzed_at,
      } : null,
    };
  },

  async getAnalysis(documentId: string) {
    const result = await db.query(
      `SELECT * FROM legal_analysis WHERE document_id = $1`,
      [documentId]
    );
    return result.rows[0] || null;
  },

  async updateAnalysisStatus(documentId: string, status: string, progress: number) {
    // Por ahora solo logueamos, pero se puede extender la tabla después
    console.log(`[STATUS] ${documentId}: ${status} (${progress}%)`);
  },
};

