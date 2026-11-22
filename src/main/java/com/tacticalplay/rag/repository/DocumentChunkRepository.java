package com.tacticalplay.rag.repository;

import com.tacticalplay.rag.model.DocumentChunk;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Types;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Repository
public class DocumentChunkRepository {

    private static final String SEMANTIC_SEARCH_NATIVE_SQL = """
            SELECT id, tenant_id, modality, source_name, page_number, chunk_text
            FROM document_chunks
            WHERE modality = :modality AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:queryEmbedding AS vector)
            LIMIT :limit
            """;

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
    private final NamedParameterJdbcTemplate namedJdbcTemplate;

    public DocumentChunkRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.namedJdbcTemplate = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    public int saveChunks(List<DocumentChunk> chunks) {
        return saveChunks(chunks, "pdf-local");
    }

    public int saveChunks(List<DocumentChunk> chunks, String namespace) {
        if (chunks == null || chunks.isEmpty()) {
            return 0;
        }

        String effectiveNamespace = (namespace != null && !namespace.isBlank()) ? namespace : "pdf-local";
        String sql = """
                INSERT INTO document_chunks (tenant_id, namespace, modality, source_name, page_number, chunk_text, embedding)
                VALUES (?, ?, ?, ?, ?, ?, CAST(? AS vector))
                """;

        jdbcTemplate.batchUpdate(sql, chunks, chunks.size(), (ps, chunk) -> {
            ps.setString(1, chunk.tenantId());
            ps.setString(2, effectiveNamespace);
            ps.setString(3, chunk.modality());
            ps.setString(4, chunk.sourceName());
            ps.setInt(5, chunk.pageNumber() != null ? chunk.pageNumber() : 1);
            ps.setString(6, chunk.chunkText());
            if (chunk.embeddingLiteral() != null && !chunk.embeddingLiteral().isBlank()) {
                ps.setString(7, chunk.embeddingLiteral());
            } else {
                ps.setNull(7, Types.OTHER);
            }
        });

        return chunks.size();
    }

    public int countByNamespace(String namespace) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM document_chunks WHERE namespace = ? OR tenant_id = ?",
                Integer.class,
                namespace,
                namespace
        );
        return count != null ? count : 0;
    }

    public int deleteByNamespace(String namespace) {
        return jdbcTemplate.update(
                "DELETE FROM document_chunks WHERE namespace = ? OR tenant_id = ?",
                namespace,
                namespace
        );
    }

    public List<DocumentChunk> findTopSimilarChunks(String modality, String queryEmbeddingLiteral, int limit) {
        if (queryEmbeddingLiteral == null || queryEmbeddingLiteral.isBlank()) {
            return List.of();
        }
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("modality", modality)
                .addValue("queryEmbedding", queryEmbeddingLiteral)
                .addValue("limit", limit);

        return namedJdbcTemplate.query(SEMANTIC_SEARCH_NATIVE_SQL, params, CHUNK_ROW_MAPPER);
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
