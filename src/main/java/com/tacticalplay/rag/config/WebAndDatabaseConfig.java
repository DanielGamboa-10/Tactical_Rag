package com.tacticalplay.rag.config;

import com.tacticalplay.rag.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class WebAndDatabaseConfig {

    private static final Logger log = LoggerFactory.getLogger(WebAndDatabaseConfig.class);

    private final JdbcTemplate jdbcTemplate;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public WebAndDatabaseConfig(
            JdbcTemplate jdbcTemplate,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(1)
    public void ensurePgVectorSchema() {
        jdbcTemplate.execute("CREATE EXTENSION IF NOT EXISTS vector;");

        jdbcTemplate.execute("""
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
                """);

        // Migración idempotente de perfil y correo electrónico único en app_users
        executeSilently("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email VARCHAR(160);");
        executeSilently("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS full_name VARCHAR(120);");
        executeSilently("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role VARCHAR(60) NOT NULL DEFAULT 'ROLE_COACH';");
        executeSilently("UPDATE app_users SET full_name = display_name WHERE full_name IS NULL;");
        executeSilently("UPDATE app_users SET role = SPLIT_PART(roles, ',', 1) WHERE (role IS NULL OR role = '') AND roles IS NOT NULL;");
        executeSilently("CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_unique ON app_users (LOWER(email)) WHERE email IS NOT NULL;");

        jdbcTemplate.execute("""
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
                """);
        executeSilently("CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_tenant_updated ON chat_sessions (user_id, tenant_id, updated_at DESC);");

        jdbcTemplate.execute("""
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
                """);
        executeSilently("CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages (session_id, created_at ASC, id ASC);");

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS demo_quota (
                    demo_key VARCHAR(64) PRIMARY KEY,
                    queries_used INTEGER NOT NULL DEFAULT 0,
                    max_queries INTEGER NOT NULL DEFAULT 15,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS demo_usage (
                    device_id VARCHAR(128) PRIMARY KEY,
                    queries_used INT NOT NULL DEFAULT 0,
                    max_queries INT NOT NULL DEFAULT 15,
                    blocked BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                """);
        executeSilently("ALTER TABLE demo_usage ALTER COLUMN device_id TYPE VARCHAR(128);");
        executeSilently("ALTER TABLE demo_usage ADD COLUMN IF NOT EXISTS max_queries INT NOT NULL DEFAULT 15;");
        executeSilently("ALTER TABLE demo_usage ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE;");

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS expedientes (
                    id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(100) NOT NULL,
                    owner_user_id BIGINT,
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
                """);
        executeSilently("ALTER TABLE expedientes ADD COLUMN IF NOT EXISTS owner_user_id BIGINT;");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_expedientes_tenant_id ON expedientes (tenant_id, created_at DESC);");
        executeSilently("CREATE INDEX IF NOT EXISTS idx_expedientes_owner_user_id ON expedientes (owner_user_id, created_at DESC);");

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id SERIAL PRIMARY KEY,
                    tenant_id VARCHAR(100) NOT NULL,
                    owner_user_id BIGINT,
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
                """);

        // Migración idempotente de columnas nuevas en instalaciones previas
        executeSilently("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS owner_user_id BIGINT;");
        executeSilently("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS namespace VARCHAR(100) DEFAULT 'pdf-local';");
        executeSilently("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS expediente_id VARCHAR(64);");
        executeSilently("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS section_title VARCHAR(255);");
        executeSilently("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS chunk_order INTEGER NOT NULL DEFAULT 0;");
        executeSilently("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100);");
        executeSilently("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS permissions VARCHAR(100) NOT NULL DEFAULT 'PRIVATE';");
        executeSilently("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS search_tsv TSVECTOR;");
        executeSilently("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();");

        // Migrar columna embedding a vector(768) si la tabla fue creada previamente con vector(1536)
        try {
            jdbcTemplate.execute("""
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_name = 'document_chunks'
                              AND column_name = 'embedding'
                        ) THEN
                            BEGIN
                                ALTER TABLE document_chunks
                                    ALTER COLUMN embedding TYPE vector(768)
                                    USING CASE
                                        WHEN embedding IS NOT NULL AND vector_dims(embedding) = 768 THEN embedding
                                        ELSE NULL
                                    END;
                            EXCEPTION WHEN OTHERS THEN
                                UPDATE document_chunks SET embedding = NULL;
                                ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(768);
                            END;
                        ELSE
                            ALTER TABLE document_chunks ADD COLUMN embedding vector(768);
                        END IF;
                    END $$;
                    """);
        } catch (Exception ex) {
            log.warn("No se pudo ejecutar la migración automática de embedding a vector(768): {}", ex.getMessage());
        }

        // Poblar search_tsv en filas existentes y asegurar visibilidad PUBLIC únicamente para artículos Wikipedia
        executeSilently("""
                UPDATE document_chunks
                SET search_tsv = to_tsvector('spanish', COALESCE(source_name, '') || ' ' || COALESCE(section_title, '') || ' ' || COALESCE(chunk_text, ''))
                WHERE search_tsv IS NULL;
                """);
        executeSilently("""
                UPDATE document_chunks
                SET permissions = 'PUBLIC'
                WHERE (namespace IN ('api-externa', 'system') OR tenant_id = 'system')
                  AND COALESCE(permissions, '') <> 'PUBLIC';
                """);
        executeSilently("""
                UPDATE expedientes e
                SET owner_user_id = u.id
                FROM app_users u
                WHERE e.owner_user_id IS NULL
                  AND LOWER(e.owner_username) = LOWER(u.username);
                """);
        executeSilently("""
                UPDATE document_chunks c
                SET owner_user_id = e.owner_user_id
                FROM expedientes e
                WHERE c.owner_user_id IS NULL
                  AND c.expediente_id = e.id
                  AND e.owner_user_id IS NOT NULL;
                """);

        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_id ON document_chunks (tenant_id);");
        executeSilently("CREATE INDEX IF NOT EXISTS idx_document_chunks_owner_user_id ON document_chunks (owner_user_id, modality);");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_document_chunks_namespace ON document_chunks (namespace);");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_document_chunks_modality ON document_chunks (modality);");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_document_chunks_expediente_id ON document_chunks (expediente_id);");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_modality ON document_chunks (tenant_id, modality);");
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
                ON document_chunks USING hnsw (embedding vector_cosine_ops);
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_document_chunks_search_tsv
                ON document_chunks USING gin (search_tsv);
                """);

        jdbcTemplate.execute("""
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
                """);
        executeSilently("ALTER TABLE custom_players ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) NOT NULL DEFAULT 'demo-club';");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_custom_players_tenant_id ON custom_players (tenant_id);");

        jdbcTemplate.execute("""
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
                """);

        userRepository.ensureDefaultUsers(passwordEncoder);
        cleanResidualNonSportsEmbeddings();
    }

    private void executeSilently(String sql) {
        try {
            jdbcTemplate.execute(sql);
        } catch (Exception ex) {
            log.warn("No se pudo ejecutar sentencia DDL/migración ({}): {}", sql.lines().findFirst().orElse(""), ex.getMessage());
        }
    }

    private void cleanResidualNonSportsEmbeddings() {
        try {
            // Conserva explícitamente 'pdf-local' y 'expediente' para persistencia multi-tenant de PDFs subidos.
            int deletedChunks = jdbcTemplate.update("""
                    DELETE FROM document_chunks
                    WHERE COALESCE(LOWER(namespace), '') NOT IN ('api-externa', 'pdf-local', 'expediente', 'futsal', 'futbol7', 'futbol9', 'futbol11')
                       OR LOWER(source_name) LIKE '%hoja_de_vida%'
                       OR LOWER(source_name) LIKE '%curriculum%'
                    """);
            if (deletedChunks > 0) {
                log.info("Limpieza vectorial completada en document_chunks: {} registros residuales no deportivos eliminados.", deletedChunks);
            }
        } catch (Exception ex) {
            log.warn("No se pudo ejecutar limpieza en document_chunks: {}", ex.getMessage());
        }
    }
}
