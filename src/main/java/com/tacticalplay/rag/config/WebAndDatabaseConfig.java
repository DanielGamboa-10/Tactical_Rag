package com.tacticalplay.rag.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebAndDatabaseConfig implements WebMvcConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebAndDatabaseConfig.class);

    private final JdbcTemplate jdbcTemplate;

    public WebAndDatabaseConfig(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns(
                        "http://localhost:*",
                        "http://127.0.0.1:*"
                )
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(1)
    public void ensurePgVectorSchema() {
        jdbcTemplate.execute("CREATE EXTENSION IF NOT EXISTS vector;");
        jdbcTemplate.execute("""
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
                """);

        try {
            jdbcTemplate.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS namespace VARCHAR(100) DEFAULT 'pdf-local';");
        } catch (Exception ex) {
            log.warn("No se pudo verificar la columna namespace: {}", ex.getMessage());
        }

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

        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_id ON document_chunks (tenant_id);");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_document_chunks_namespace ON document_chunks (namespace);");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_document_chunks_modality ON document_chunks (modality);");
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
                ON document_chunks USING hnsw (embedding vector_cosine_ops);
                """);

        jdbcTemplate.execute("""
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
                """);

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

        cleanResidualNonSportsEmbeddings();
    }

    private void cleanResidualNonSportsEmbeddings() {
        try {
            int deletedChunks = jdbcTemplate.update("""
                    DELETE FROM document_chunks
                    WHERE COALESCE(LOWER(namespace), '') NOT IN ('api-externa', 'futsal', 'futbol7', 'futbol9', 'futbol11')
                       OR LOWER(source_name) LIKE '%cv%'
                       OR LOWER(source_name) LIKE '%hoja_de_vida%'
                       OR LOWER(source_name) LIKE '%curriculum%'
                    """);
            if (deletedChunks > 0) {
                log.info("Limpieza vectorial completada en document_chunks: {} registros residuales no deportivos eliminados.", deletedChunks);
            }
        } catch (Exception ex) {
            log.warn("No se pudo ejecutar limpieza en document_chunks: {}", ex.getMessage());
        }

        try {
            Boolean hasLegacyTable = jdbcTemplate.queryForObject(
                    "SELECT to_regclass('public.document_embeddings') IS NOT NULL",
                    Boolean.class
            );
            if (Boolean.TRUE.equals(hasLegacyTable)) {
                int deletedLegacy = jdbcTemplate.update("""
                        DELETE FROM document_embeddings
                        WHERE COALESCE(LOWER(namespace), '') NOT IN ('api-externa', 'futsal', 'futbol7', 'futbol9', 'futbol11')
                           OR metadata->>'source' ILIKE '%cv%'
                           OR metadata->>'source' ILIKE '%hoja_de_vida%'
                        """);
                if (deletedLegacy > 0) {
                    log.info("Limpieza vectorial completada en document_embeddings: {} registros residuales eliminados.", deletedLegacy);
                }
            }
        } catch (Exception ignored) {
        }
    }
}
