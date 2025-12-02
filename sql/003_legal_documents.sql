-- Schema para documentos legales
-- Tablas para el servicio legal-docs

CREATE TABLE IF NOT EXISTS legal_documents (
  id VARCHAR(255) PRIMARY KEY,
  filename VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  raw_path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

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

-- Índices para búsquedas
CREATE INDEX IF NOT EXISTS idx_legal_documents_created_at ON legal_documents(created_at);
CREATE INDEX IF NOT EXISTS idx_legal_analysis_type ON legal_analysis(type);
CREATE INDEX IF NOT EXISTS idx_legal_analysis_created_at ON legal_analysis(created_at);

