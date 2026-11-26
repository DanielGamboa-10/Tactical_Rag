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
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Repository
public class DocumentChunkRepository {

    private static final String VISIBILITY_FILTER_SQL = """
            WHERE c.modality = :modality
              AND (
                (
                  :includePublic = true
                  AND (c.namespace IN ('api-externa', 'system') OR c.tenant_id = 'system')
                  AND COALESCE(c.permissions, 'PUBLIC') IN ('PUBLIC', 'SYSTEM')
                )
                OR (
                  c.tenant_id = :tenantId
                  AND (
                    :isAdmin = true
                    OR (
                      COALESCE(c.permissions, 'PRIVATE') = 'TENANT'
                      AND (e.id IS NOT NULL OR c.namespace = 'expediente')
                    )
                    OR (c.owner_user_id IS NOT NULL AND :userId IS NOT NULL AND c.owner_user_id = :userId)
                    OR (e.id IS NOT NULL AND LOWER(e.owner_username) = LOWER(:username))
                  )
                )
              )
            """;

    private static final String BASE_SELECT_SQL = """
            SELECT c.id, c.tenant_id, c.expediente_id, c.modality, c.source_name, c.page_number,
                   c.section_title, c.chunk_order, c.chunk_text, c.embedding_model, c.permissions, c.owner_user_id
            FROM document_chunks c
            LEFT JOIN expedientes e ON c.expediente_id = e.id
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
            rs.getString("expediente_id"),
            rs.getString("modality"),
            rs.getString("source_name"),
            rs.getObject("page_number") != null ? rs.getInt("page_number") : 1,
            rs.getString("section_title"),
            rs.getObject("chunk_order") != null ? rs.getInt("chunk_order") : 0,
            rs.getString("chunk_text"),
            null,
            rs.getString("embedding_model"),
            rs.getString("permissions"),
            hasColumn(rs, "score") && rs.getObject("score") != null ? rs.getDouble("score") : null,
            null,
            hasColumn(rs, "owner_user_id") && rs.getObject("owner_user_id") != null
                    ? ((Number) rs.getObject("owner_user_id")).longValue()
                    : null
    );

    private final JdbcTemplate jdbcTemplate;
    private final NamedParameterJdbcTemplate namedJdbcTemplate;

    public DocumentChunkRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.namedJdbcTemplate = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    private static boolean hasColumn(java.sql.ResultSet rs, String colName) {
        try {
            rs.findColumn(colName);
            return true;
        } catch (Exception ex) {
            return false;
        }
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
                INSERT INTO document_chunks (
                    tenant_id, owner_user_id, namespace, expediente_id, modality, source_name, page_number,
                    section_title, chunk_order, chunk_text, embedding, embedding_model, permissions, search_tsv
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS vector), ?, ?,
                    to_tsvector('spanish', COALESCE(?, '') || ' ' || COALESCE(?, '') || ' ' || COALESCE(?, ''))
                )
                """;

        jdbcTemplate.batchUpdate(sql, chunks, chunks.size(), (ps, chunk) -> {
            ps.setString(1, chunk.tenantId());
            if (chunk.ownerUserId() != null) {
                ps.setLong(2, chunk.ownerUserId());
            } else {
                ps.setNull(2, Types.BIGINT);
            }
            ps.setString(3, effectiveNamespace);
            if (chunk.expedienteId() != null) {
                ps.setString(4, chunk.expedienteId());
            } else {
                ps.setNull(4, Types.VARCHAR);
            }
            ps.setString(5, chunk.modality());
            ps.setString(6, chunk.sourceName());
            ps.setInt(7, chunk.pageNumber() != null ? chunk.pageNumber() : 1);
            ps.setString(8, chunk.sectionTitle() != null ? chunk.sectionTitle() : "");
            ps.setInt(9, chunk.chunkOrder() != null ? chunk.chunkOrder() : 0);
            ps.setString(10, chunk.chunkText());
            if (chunk.embeddingLiteral() != null && !chunk.embeddingLiteral().isBlank()) {
                ps.setString(11, chunk.embeddingLiteral());
            } else {
                ps.setNull(11, Types.OTHER);
            }
            ps.setString(12, chunk.embeddingModel());
            ps.setString(13, chunk.permissions() != null ? chunk.permissions() : "PRIVATE");
            ps.setString(14, chunk.sourceName());
            ps.setString(15, chunk.sectionTitle() != null ? chunk.sectionTitle() : "");
            ps.setString(16, chunk.chunkText());
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

    public int countByExpedienteId(String expedienteId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM document_chunks WHERE expediente_id = ?",
                Integer.class,
                expedienteId
        );
        return count != null ? count : 0;
    }

    public int deleteByNamespace(String namespace) {
        return jdbcTemplate.update(
                "DELETE FROM document_chunks WHERE namespace = ?",
                namespace
        );
    }

    public int deleteByExpedienteId(String expedienteId, String tenantId, boolean isAdmin) {
        String verifiedTenant = requireTenantId(tenantId);
        return jdbcTemplate.update(
                "DELETE FROM document_chunks WHERE expediente_id = ? AND tenant_id = ?",
                expedienteId,
                verifiedTenant
        );
    }

    public List<DocumentChunk> findByExpedienteIdAndTenant(
            String expedienteId,
            String tenantId,
            String username,
            boolean isAdmin
    ) {
        return findByExpedienteIdAndTenant(expedienteId, tenantId, null, username, isAdmin);
    }

    public List<DocumentChunk> findByExpedienteIdAndTenant(
            String expedienteId,
            String tenantId,
            Long userId,
            String username,
            boolean isAdmin
    ) {
        String verifiedTenant = requireTenantId(tenantId);
        String sql = """
                SELECT c.id, c.tenant_id, c.expediente_id, c.modality, c.source_name, c.page_number,
                       c.section_title, c.chunk_order, c.chunk_text, c.embedding_model, c.permissions, c.owner_user_id,
                       1.0 AS score
                FROM document_chunks c
                LEFT JOIN expedientes e ON c.expediente_id = e.id
                WHERE c.expediente_id = :expedienteId
                  AND c.tenant_id = :tenantId
                  AND (
                    :isAdmin = true
                    OR COALESCE(c.permissions, 'PRIVATE') = 'TENANT'
                    OR (c.owner_user_id IS NOT NULL AND :userId IS NOT NULL AND c.owner_user_id = :userId)
                    OR LOWER(e.owner_username) = LOWER(:username)
                  )
                ORDER BY c.chunk_order ASC, c.id ASC
                """;
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("expedienteId", expedienteId)
                .addValue("tenantId", verifiedTenant)
                .addValue("userId", userId, Types.BIGINT)
                .addValue("username", username != null ? username : "")
                .addValue("isAdmin", isAdmin);
        return namedJdbcTemplate.query(sql, params, CHUNK_ROW_MAPPER);
    }

    /**
     * Búsqueda híbrida (Vectorial pgvector + Full-Text tsvector) con fusión RRF y reordenamiento
     * aplicando siempre aislamiento obligatorio por tenant_id, owner_user_id y consistencia de modelo.
     */
    public List<DocumentChunk> findHybridChunks(
            String tenantId,
            String username,
            boolean isAdmin,
            String modality,
            String queryEmbeddingLiteral,
            String userQuery,
            int limit
    ) {
        return findHybridChunks(tenantId, null, username, isAdmin, modality, queryEmbeddingLiteral, null, userQuery, limit, true);
    }

    public List<DocumentChunk> findHybridChunks(
            String tenantId,
            String username,
            boolean isAdmin,
            String modality,
            String queryEmbeddingLiteral,
            String embeddingModel,
            String userQuery,
            int limit
    ) {
        return findHybridChunks(tenantId, null, username, isAdmin, modality, queryEmbeddingLiteral, embeddingModel, userQuery, limit, true);
    }

    public List<DocumentChunk> findHybridChunks(
            String tenantId,
            String username,
            boolean isAdmin,
            String modality,
            String queryEmbeddingLiteral,
            String embeddingModel,
            String userQuery,
            int limit,
            boolean includePublicExternal
    ) {
        return findHybridChunks(tenantId, null, username, isAdmin, modality, queryEmbeddingLiteral, embeddingModel, userQuery, limit, includePublicExternal);
    }

    public List<DocumentChunk> findHybridChunks(
            String tenantId,
            Long userId,
            String username,
            boolean isAdmin,
            String modality,
            String queryEmbeddingLiteral,
            String embeddingModel,
            String userQuery,
            int limit,
            boolean includePublicExternal
    ) {
        String verifiedTenant = requireTenantId(tenantId);
        String effectiveUser = (username != null && !username.isBlank()) ? username : "";
        String effectiveModel = (embeddingModel != null && !embeddingModel.isBlank() && !"unconfigured".equals(embeddingModel))
                ? embeddingModel
                : null;
        int candidateLimit = Math.max(limit * 3, 12);

        List<DocumentChunk> vectorHits = (queryEmbeddingLiteral != null && !queryEmbeddingLiteral.isBlank())
                ? findVectorCandidates(verifiedTenant, userId, effectiveUser, isAdmin, modality, queryEmbeddingLiteral, effectiveModel, candidateLimit, includePublicExternal)
                : List.of();

        List<String> keywords = extractKeywords(userQuery);
        List<DocumentChunk> lexicalHits = findFullTextCandidates(
                verifiedTenant, userId, effectiveUser, isAdmin, modality, keywords, userQuery, candidateLimit, includePublicExternal
        );

        return rerankWithRrf(vectorHits, lexicalHits, keywords, limit);
    }

    public List<DocumentChunk> findTopSimilarChunks(String tenantId, String modality, String queryEmbeddingLiteral, int limit) {
        return findVectorCandidates(requireTenantId(tenantId), null, "", false, modality, queryEmbeddingLiteral, null, limit, true);
    }

    public List<DocumentChunk> findContextualChunks(String tenantId, String modality, String userQuery, int limit) {
        List<String> keywords = extractKeywords(userQuery);
        return findFullTextCandidates(requireTenantId(tenantId), null, "", false, modality, keywords, userQuery, limit, true);
    }

    private String requireTenantId(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalArgumentException("tenant_id es obligatorio en toda consulta vectorial/textual.");
        }
        return tenantId.trim();
    }

    private List<DocumentChunk> findVectorCandidates(
            String tenantId,
            Long userId,
            String username,
            boolean isAdmin,
            String modality,
            String queryEmbeddingLiteral,
            String embeddingModel,
            int limit,
            boolean includePublicExternal
    ) {
        if (queryEmbeddingLiteral == null || queryEmbeddingLiteral.isBlank()) {
            return List.of();
        }
        String sql = """
                SELECT c.id, c.tenant_id, c.expediente_id, c.modality, c.source_name, c.page_number,
                       c.section_title, c.chunk_order, c.chunk_text, c.embedding_model, c.permissions, c.owner_user_id,
                       (1.0 - (c.embedding <=> CAST(:queryEmbedding AS vector))) AS score
                FROM document_chunks c
                LEFT JOIN expedientes e ON c.expediente_id = e.id
                """ + VISIBILITY_FILTER_SQL + """
                  AND c.embedding IS NOT NULL
                  AND (:embeddingModel IS NULL OR c.embedding_model IS NULL OR c.embedding_model = :embeddingModel)
                ORDER BY c.embedding <=> CAST(:queryEmbedding AS vector)
                LIMIT :limit
                """;

        MapSqlParameterSource params = baseParams(tenantId, userId, username, isAdmin, modality, limit, includePublicExternal)
                .addValue("queryEmbedding", queryEmbeddingLiteral)
                .addValue("embeddingModel", embeddingModel, Types.VARCHAR);

        return namedJdbcTemplate.query(sql, params, CHUNK_ROW_MAPPER);
    }

    private List<DocumentChunk> findFullTextCandidates(
            String tenantId,
            Long userId,
            String username,
            boolean isAdmin,
            String modality,
            List<String> keywords,
            String rawQuery,
            int limit,
            boolean includePublicExternal
    ) {
        List<DocumentChunk> results = new ArrayList<>();

        if (!keywords.isEmpty()) {
            String orTsQuery = keywords.stream()
                    .map(w -> w.replaceAll("[^\\p{L}\\p{N}]", ""))
                    .filter(w -> w.length() >= 2)
                    .collect(Collectors.joining(" | "));

            if (!orTsQuery.isBlank()) {
                try {
                    String ftsSql = """
                            SELECT c.id, c.tenant_id, c.expediente_id, c.modality, c.source_name, c.page_number,
                                   c.section_title, c.chunk_order, c.chunk_text, c.embedding_model, c.permissions, c.owner_user_id,
                                   ts_rank_cd(
                                       COALESCE(c.search_tsv, to_tsvector('spanish', COALESCE(c.source_name, '') || ' ' || COALESCE(c.section_title, '') || ' ' || c.chunk_text)),
                                       to_tsquery('spanish', :orTsQuery)
                                   ) AS score
                            FROM document_chunks c
                            LEFT JOIN expedientes e ON c.expediente_id = e.id
                            """ + VISIBILITY_FILTER_SQL + """
                              AND COALESCE(c.search_tsv, to_tsvector('spanish', COALESCE(c.source_name, '') || ' ' || COALESCE(c.section_title, '') || ' ' || c.chunk_text))
                                  @@ to_tsquery('spanish', :orTsQuery)
                            ORDER BY score DESC, c.id DESC
                            LIMIT :limit
                            """;

                    MapSqlParameterSource params = baseParams(tenantId, userId, username, isAdmin, modality, limit, includePublicExternal)
                            .addValue("orTsQuery", orTsQuery);
                    results = namedJdbcTemplate.query(ftsSql, params, CHUNK_ROW_MAPPER);
                } catch (Exception ignored) {
                }
            }
        }

        if (results.size() < limit && !keywords.isEmpty()) {
            StringBuilder likeSql = new StringBuilder("""
                    SELECT c.id, c.tenant_id, c.expediente_id, c.modality, c.source_name, c.page_number,
                           c.section_title, c.chunk_order, c.chunk_text, c.embedding_model, c.permissions, c.owner_user_id,
                           0.15 AS score
                    FROM document_chunks c
                    LEFT JOIN expedientes e ON c.expediente_id = e.id
                    """).append(VISIBILITY_FILTER_SQL).append(" AND (");

            MapSqlParameterSource params = baseParams(tenantId, userId, username, isAdmin, modality, limit, includePublicExternal);
            for (int i = 0; i < keywords.size(); i++) {
                if (i > 0) {
                    likeSql.append(" OR ");
                }
                String paramName = "kw" + i;
                likeSql.append("LOWER(c.chunk_text) LIKE :").append(paramName)
                        .append(" OR LOWER(COALESCE(c.section_title, '')) LIKE :").append(paramName);
                params.addValue(paramName, "%" + keywords.get(i) + "%");
            }
            likeSql.append(") ORDER BY (c.expediente_id IS NOT NULL) DESC, c.id DESC LIMIT :limit");

            List<DocumentChunk> likeHits = namedJdbcTemplate.query(likeSql.toString(), params, CHUNK_ROW_MAPPER);
            Map<Long, DocumentChunk> merged = new LinkedHashMap<>();
            for (DocumentChunk c : results) {
                merged.put(c.id(), c);
            }
            for (DocumentChunk c : likeHits) {
                merged.putIfAbsent(c.id(), c);
            }
            results = new ArrayList<>(merged.values());
        }

        return results;
    }

    private List<DocumentChunk> rerankWithRrf(
            List<DocumentChunk> vectorHits,
            List<DocumentChunk> lexicalHits,
            List<String> keywords,
            int limit
    ) {
        final double kRrf = 60.0;

        class Candidate {
            DocumentChunk chunk;
            int vectorRank = -1;
            int lexicalRank = -1;
            double vectorSim = 0.0;
            double lexicalRankScore = 0.0;
        }

        Map<Long, Candidate> byId = new LinkedHashMap<>();
        for (int i = 0; i < vectorHits.size(); i++) {
            DocumentChunk c = vectorHits.get(i);
            Candidate cand = byId.computeIfAbsent(c.id(), id -> new Candidate());
            cand.chunk = c;
            cand.vectorRank = i + 1;
            cand.vectorSim = c.score() != null ? c.score() : 0.0;
        }
        for (int i = 0; i < lexicalHits.size(); i++) {
            DocumentChunk c = lexicalHits.get(i);
            Candidate cand = byId.computeIfAbsent(c.id(), id -> new Candidate());
            if (cand.chunk == null) {
                cand.chunk = c;
            }
            cand.lexicalRank = i + 1;
            cand.lexicalRankScore = c.score() != null ? c.score() : 0.0;
        }

        List<DocumentChunk> reranked = new ArrayList<>(byId.size());
        for (Candidate cand : byId.values()) {
            double rrf = 0.0;
            if (cand.vectorRank > 0) {
                rrf += 1.0 / (kRrf + cand.vectorRank);
            }
            if (cand.lexicalRank > 0) {
                rrf += 1.0 / (kRrf + cand.lexicalRank);
            }

            double simBoost = Math.max(0.0, cand.vectorSim) * 0.025;
            double lexicalBoost = Math.min(0.02, cand.lexicalRankScore * 0.02);
            double kwOverlap = computeKeywordOverlap(cand.chunk, keywords) * 0.015;
            double ownPdfBoost = cand.chunk.expedienteId() != null ? 0.008 : 0.0;

            double finalScore = rrf + simBoost + lexicalBoost + kwOverlap + ownPdfBoost;
            String mode = (cand.vectorRank > 0 && cand.lexicalRank > 0)
                    ? "hybrid"
                    : (cand.vectorRank > 0 ? "vector" : "lexical");

            reranked.add(cand.chunk.withSearchMetadata(Math.round(finalScore * 10000.0) / 10000.0, mode));
        }

        reranked.sort(Comparator.comparingDouble((DocumentChunk c) -> c.score() != null ? c.score() : 0.0).reversed());
        return reranked.size() <= limit ? reranked : new ArrayList<>(reranked.subList(0, limit));
    }

    private double computeKeywordOverlap(DocumentChunk chunk, List<String> keywords) {
        if (keywords == null || keywords.isEmpty() || chunk == null) {
            return 0.0;
        }
        String haystack = (
                (chunk.sectionTitle() != null ? chunk.sectionTitle() + " " : "") + chunk.chunkText()
        ).toLowerCase(Locale.ROOT);
        long hits = keywords.stream().filter(haystack::contains).count();
        return (double) hits / keywords.size();
    }

    private MapSqlParameterSource baseParams(
            String tenantId,
            Long userId,
            String username,
            boolean isAdmin,
            String modality,
            int limit,
            boolean includePublicExternal
    ) {
        return new MapSqlParameterSource()
                .addValue("tenantId", tenantId)
                .addValue("userId", userId, Types.BIGINT)
                .addValue("username", username)
                .addValue("isAdmin", isAdmin)
                .addValue("modality", modality)
                .addValue("limit", limit)
                .addValue("includePublic", includePublicExternal);
    }

    private List<String> extractKeywords(String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return Arrays.stream(query.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+"))
                .map(String::trim)
                .filter(word -> word.length() >= 3)
                .filter(word -> !STOP_WORDS.contains(word))
                .distinct()
                .limit(6)
                .collect(Collectors.toCollection(ArrayList::new));
    }
}
