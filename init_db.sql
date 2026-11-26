CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS app_users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    email VARCHAR(160) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL DEFAULT 'Coach',
    display_name VARCHAR(120) NOT NULL,
    tenant_id VARCHAR(100) NOT NULL,
    role VARCHAR(60) NOT NULL DEFAULT 'ROLE_COACH',
    roles VARCHAR(120) NOT NULL DEFAULT 'ROLE_COACH',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    tenant_id VARCHAR(100) NOT NULL,
    title VARCHAR(180) NOT NULL,
    modality VARCHAR(40) NOT NULL DEFAULT 'Fútbol 11',
    system_name VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_tenant_updated
    ON chat_sessions (user_id, tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    tenant_id VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    sources_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
    ON chat_messages (session_id, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS demo_quota (
    demo_key VARCHAR(64) PRIMARY KEY,
    queries_used INTEGER NOT NULL DEFAULT 0,
    max_queries INTEGER NOT NULL DEFAULT 15,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demo_usage (
    device_id VARCHAR(128) PRIMARY KEY,
    queries_used INT NOT NULL DEFAULT 0,
    max_queries INT NOT NULL DEFAULT 15,
    blocked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expedientes (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    owner_user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE,
    owner_username VARCHAR(80) NOT NULL,
    modality VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_sha256 VARCHAR(64),
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    ocr_used BOOLEAN NOT NULL DEFAULT FALSE,
    pages_total INTEGER NOT NULL DEFAULT 0,
    chunks_count INTEGER NOT NULL DEFAULT 0,
    embedding_provider VARCHAR(40),
    embedding_model VARCHAR(100),
    permissions VARCHAR(100) NOT NULL DEFAULT 'PRIVATE',
    error_message TEXT,
    temp_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_expedientes_tenant_id ON expedientes (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expedientes_owner_user_id ON expedientes (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    owner_user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE,
    namespace VARCHAR(100) DEFAULT 'pdf-local',
    expediente_id VARCHAR(64),
    modality VARCHAR(50) NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    page_number INTEGER,
    section_title VARCHAR(255),
    chunk_order INTEGER NOT NULL DEFAULT 0,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(768),
    embedding_model VARCHAR(100),
    permissions VARCHAR(100) NOT NULL DEFAULT 'PRIVATE',
    search_tsv TSVECTOR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_id ON document_chunks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_owner_user_id ON document_chunks (owner_user_id, modality);
CREATE INDEX IF NOT EXISTS idx_document_chunks_namespace ON document_chunks (namespace);
CREATE INDEX IF NOT EXISTS idx_document_chunks_modality ON document_chunks (modality);
CREATE INDEX IF NOT EXISTS idx_document_chunks_expediente_id ON document_chunks (expediente_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_modality ON document_chunks (tenant_id, modality);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
    ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_document_chunks_search_tsv
    ON document_chunks USING gin (search_tsv);

CREATE TABLE IF NOT EXISTS custom_players (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'demo-club',
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

CREATE INDEX IF NOT EXISTS idx_custom_players_tenant_id ON custom_players (tenant_id);

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
