import pg from "pg";
const { Client } = pg;

/**
 * Gestión de bases de conocimiento adicionales
 * Permite crear, listar, habilitar/deshabilitar bases de conocimiento
 */

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  sourceType: string;
  enabled: boolean;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Listar todas las bases de conocimiento disponibles
 */
export async function listKnowledgeBases(dbUrl: string): Promise<KnowledgeBase[]> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  try {
    const result = await client.query(
      `SELECT id, name, description, source_type, enabled, metadata, created_at, updated_at 
       FROM knowledge_bases 
       ORDER BY name`
    );
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      sourceType: row.source_type,
      enabled: row.enabled,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } finally {
    await client.end();
  }
}

/**
 * Obtener una base de conocimiento por ID
 */
export async function getKnowledgeBase(dbUrl: string, id: string): Promise<KnowledgeBase | null> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  try {
    const result = await client.query(
      `SELECT id, name, description, source_type, enabled, metadata, created_at, updated_at 
       FROM knowledge_bases 
       WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      sourceType: row.source_type,
      enabled: row.enabled,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } finally {
    await client.end();
  }
}

/**
 * Crear o actualizar una base de conocimiento
 */
export async function upsertKnowledgeBase(
  dbUrl: string, 
  kb: Omit<KnowledgeBase, "createdAt" | "updatedAt">
): Promise<KnowledgeBase> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  try {
    const result = await client.query(
      `INSERT INTO knowledge_bases (id, name, description, source_type, enabled, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) 
       DO UPDATE SET 
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         source_type = EXCLUDED.source_type,
         enabled = EXCLUDED.enabled,
         metadata = EXCLUDED.metadata,
         updated_at = now()
       RETURNING id, name, description, source_type, enabled, metadata, created_at, updated_at`,
      [
        kb.id,
        kb.name,
        kb.description || null,
        kb.sourceType,
        kb.enabled,
        JSON.stringify(kb.metadata || {})
      ]
    );
    
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      sourceType: row.source_type,
      enabled: row.enabled,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } finally {
    await client.end();
  }
}

/**
 * Habilitar o deshabilitar una base de conocimiento
 */
export async function toggleKnowledgeBase(
  dbUrl: string, 
  id: string, 
  enabled: boolean
): Promise<void> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  try {
    await client.query(
      `UPDATE knowledge_bases SET enabled = $1, updated_at = now() WHERE id = $2`,
      [enabled, id]
    );
  } finally {
    await client.end();
  }
}

/**
 * Obtener estadísticas de una base de conocimiento
 */
export async function getKnowledgeBaseStats(dbUrl: string, id: string): Promise<{
  totalChunks: number;
  sourceTypes: Record<string, number>;
}> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  try {
    const totalResult = await client.query(
      `SELECT COUNT(*) as count FROM chunks WHERE knowledge_base = $1`,
      [id]
    );
    
    const sourceResult = await client.query(
      `SELECT source, COUNT(*) as count 
       FROM chunks 
       WHERE knowledge_base = $1 
       GROUP BY source`,
      [id]
    );
    
    const sourceTypes: Record<string, number> = {};
    sourceResult.rows.forEach(row => {
      sourceTypes[row.source] = parseInt(row.count);
    });
    
    return {
      totalChunks: parseInt(totalResult.rows[0].count),
      sourceTypes
    };
  } finally {
    await client.end();
  }
}


