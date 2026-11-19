package com.tacticalplay.rag.repository;

import com.tacticalplay.rag.model.DocumentChunk;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Repository
public class DocumentChunkRepository {

    private static final int EMBEDDING_DIM = 1536;
    private static final String ZERO_VECTOR_LITERAL =
            "[" + String.join(",", Collections.nCopies(EMBEDDING_DIM, "0.0")) + "]";

    private static final Set<String> STOP_WORDS = Set.of(
            "para", "como", "cual", "cuales", "cuando", "donde", "este", "esta",
            "estos", "estas", "con", "sin", "por", "los", "las", "una", "uno",
            "unos", "unas", "del", "que", "qué", "cómo", "cuál", "sobre", "entre",
            "hacia", "desde", "tiene", "tienen", "hacer", "jugar", "equipo", "futbol", "fútbol"
    );

    private static final RowMapper<DocumentChunk> CHUNK_ROW_MAPPER = (rs, rowNum) -> new DocumentChunk(
            rs.getLong("id"),
            rs.getString("tenant_id"),
            rs.getString("modality"),
            rs.getString("source_name"),
            rs.getObject("page_number") != null ? rs.getInt("page_number") : 1,
            rs.getString("chunk_text")
    );

    private final JdbcTemplate jdbcTemplate;

    public DocumentChunkRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public int saveChunks(List<DocumentChunk> chunks) {
        if (chunks == null || chunks.isEmpty()) {
            return 0;
        }

        String sql = """
                INSERT INTO document_chunks (tenant_id, modality, source_name, page_number, chunk_text, embedding)
                VALUES (?, ?, ?, ?, ?, CAST(? AS vector))
                """;

        jdbcTemplate.batchUpdate(sql, chunks, chunks.size(), (ps, chunk) -> {
            ps.setString(1, chunk.tenantId());
            ps.setString(2, chunk.modality());
            ps.setString(3, chunk.sourceName());
            ps.setInt(4, chunk.pageNumber() != null ? chunk.pageNumber() : 1);
            ps.setString(5, chunk.chunkText());
            ps.setString(6, ZERO_VECTOR_LITERAL);
        });

        return chunks.size();
    }

    public List<DocumentChunk> findContextualChunks(String modality, String userQuery, int limit) {
        List<String> keywords = extractKeywords(userQuery);
        List<DocumentChunk> matchedChunks = new ArrayList<>();

        if (!keywords.isEmpty()) {
            StringBuilder sql = new StringBuilder("""
                    SELECT id, tenant_id, modality, source_name, page_number, chunk_text
                    FROM document_chunks
                    WHERE modality = ?
                      AND (
                    """);

            List<Object> params = new ArrayList<>();
            params.add(modality);

            for (int i = 0; i < keywords.size(); i++) {
                if (i > 0) {
                    sql.append(" OR ");
                }
                sql.append("LOWER(chunk_text) LIKE ?");
                params.add("%" + keywords.get(i) + "%");
            }
            sql.append(") ORDER BY id DESC LIMIT ?");
            params.add(limit);

            matchedChunks = jdbcTemplate.query(sql.toString(), CHUNK_ROW_MAPPER, params.toArray());
        }

        if (!matchedChunks.isEmpty()) {
            return matchedChunks;
        }

        // Fallback to most recent chunks for this modality if no exact keyword match
        String fallbackSql = """
                SELECT id, tenant_id, modality, source_name, page_number, chunk_text
                FROM document_chunks
                WHERE modality = ?
                ORDER BY id DESC
                LIMIT ?
                """;
        return jdbcTemplate.query(fallbackSql, CHUNK_ROW_MAPPER, modality, limit);
    }

    private List<String> extractKeywords(String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return Arrays.stream(query.toLowerCase().split("[^\\p{L}\\p{N}]+"))
                .map(String::trim)
                .filter(word -> word.length() >= 3)
                .filter(word -> !STOP_WORDS.contains(word))
                .distinct()
                .limit(6)
                .collect(Collectors.toCollection(ArrayList::new));
    }
}
