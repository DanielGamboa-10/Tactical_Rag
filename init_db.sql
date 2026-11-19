CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    modality VARCHAR(50) NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    page_number INTEGER,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1536)
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_id ON document_chunks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_modality ON document_chunks (modality);
