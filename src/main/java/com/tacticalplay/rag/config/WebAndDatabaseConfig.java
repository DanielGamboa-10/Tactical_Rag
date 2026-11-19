package com.tacticalplay.rag.config;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebAndDatabaseConfig implements WebMvcConfigurer {

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
    public void ensurePgVectorSchema() {
        jdbcTemplate.execute("CREATE EXTENSION IF NOT EXISTS vector;");
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id SERIAL PRIMARY KEY,
                    tenant_id VARCHAR(100) NOT NULL,
                    modality VARCHAR(50) NOT NULL,
                    source_name VARCHAR(255) NOT NULL,
                    page_number INTEGER,
                    chunk_text TEXT NOT NULL,
                    embedding VECTOR(1536)
                );
                """);
    }
}
