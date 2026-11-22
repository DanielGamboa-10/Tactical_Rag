CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    namespace VARCHAR(100) DEFAULT 'pdf-local',
    modality VARCHAR(50) NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    page_number INTEGER,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(768)
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_id ON document_chunks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_namespace ON document_chunks (namespace);
CREATE INDEX IF NOT EXISTS idx_document_chunks_modality ON document_chunks (modality);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
    ON document_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS custom_players (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    jersey_number INTEGER NOT NULL,
    position VARCHAR(30) NOT NULL,
    preferred_foot VARCHAR(20) DEFAULT 'Derecho',
    pace INTEGER NOT NULL DEFAULT 75,
    passing INTEGER NOT NULL DEFAULT 75,
    dribbling INTEGER NOT NULL DEFAULT 75,
    defending INTEGER NOT NULL DEFAULT 75,
    shooting INTEGER NOT NULL DEFAULT 75,
    vision INTEGER NOT NULL DEFAULT 75
);

CREATE TABLE IF NOT EXISTS top_reference_players (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    sport VARCHAR(30) NOT NULL,
    position VARCHAR(30) NOT NULL,
    era VARCHAR(60) NOT NULL,
    play_style VARCHAR(140) NOT NULL,
    pace INTEGER NOT NULL,
    passing INTEGER NOT NULL,
    dribbling INTEGER NOT NULL,
    defending INTEGER NOT NULL,
    shooting INTEGER NOT NULL,
    vision INTEGER NOT NULL,
    wiki_extract TEXT
);
