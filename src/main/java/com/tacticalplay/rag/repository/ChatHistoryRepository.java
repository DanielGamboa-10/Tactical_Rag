package com.tacticalplay.rag.repository;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tacticalplay.rag.model.ChatMessage;
import com.tacticalplay.rag.model.ChatSession;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ChatHistoryRepository {

    private static final RowMapper<ChatSession> SESSION_MAPPER = (rs, rowNum) -> new ChatSession(
            UUID.fromString(rs.getString("id")),
            rs.getLong("user_id"),
            rs.getString("tenant_id"),
            rs.getString("title"),
            rs.getString("modality"),
            rs.getString("system_name"),
            toInstant(rs.getTimestamp("created_at")),
            toInstant(rs.getTimestamp("updated_at")),
            rs.getInt("message_count")
    );

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public ChatHistoryRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public List<ChatSession> findSessionsByUserAndTenant(Long userId, String tenantId) {
        return jdbcTemplate.query(
                """
                SELECT s.id, s.user_id, s.tenant_id, s.title, s.modality, s.system_name,
                       s.created_at, s.updated_at, COUNT(m.id) AS message_count
                FROM chat_sessions s
                LEFT JOIN chat_messages m ON m.session_id = s.id
                WHERE s.user_id = ? AND s.tenant_id = ?
                GROUP BY s.id, s.user_id, s.tenant_id, s.title, s.modality, s.system_name, s.created_at, s.updated_at
                ORDER BY s.updated_at DESC, s.created_at DESC
                """,
                SESSION_MAPPER,
                userId,
                tenantId
        );
    }

    public Optional<ChatSession> findSessionById(UUID sessionId) {
        List<ChatSession> results = jdbcTemplate.query(
                """
                SELECT s.id, s.user_id, s.tenant_id, s.title, s.modality, s.system_name,
                       s.created_at, s.updated_at, COUNT(m.id) AS message_count
                FROM chat_sessions s
                LEFT JOIN chat_messages m ON m.session_id = s.id
                WHERE s.id = ?
                GROUP BY s.id, s.user_id, s.tenant_id, s.title, s.modality, s.system_name, s.created_at, s.updated_at
                """,
                SESSION_MAPPER,
                sessionId
        );
        return results.stream().findFirst();
    }

    public ChatSession createSession(Long userId, String tenantId, String title, String modality, String systemName) {
        UUID id = UUID.randomUUID();
        String safeTitle = normalizeTitle(title);
        String safeModality = (modality != null && !modality.isBlank()) ? modality.trim() : "Fútbol 11";
        String safeSystem = (systemName != null && !systemName.isBlank()) ? systemName.trim() : null;

        jdbcTemplate.update(
                """
                INSERT INTO chat_sessions (id, user_id, tenant_id, title, modality, system_name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
                """,
                id,
                userId,
                tenantId,
                safeTitle,
                safeModality,
                safeSystem
        );
        return findSessionById(id).orElseThrow();
    }

    public void updateSessionActivity(UUID sessionId, Long userId, String tenantId, String modality, String systemName) {
        jdbcTemplate.update(
                """
                UPDATE chat_sessions
                SET updated_at = NOW(),
                    modality = COALESCE(?, modality),
                    system_name = COALESCE(?, system_name)
                WHERE id = ? AND user_id = ? AND tenant_id = ?
                """,
                (modality != null && !modality.isBlank()) ? modality.trim() : null,
                (systemName != null && !systemName.isBlank()) ? systemName.trim() : null,
                sessionId,
                userId,
                tenantId
        );
    }

    public ChatMessage saveMessage(
            UUID sessionId,
            Long userId,
            String tenantId,
            String role,
            String content,
            List<String> sources
    ) {
        String sourcesJson = serializeSources(sources);
        return jdbcTemplate.queryForObject(
                """
                INSERT INTO chat_messages (session_id, user_id, tenant_id, role, content, sources_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
                RETURNING id, session_id, user_id, tenant_id, role, content, sources_json, created_at
                """,
                (rs, rowNum) -> mapMessage(rs),
                sessionId,
                userId,
                tenantId,
                role,
                content,
                sourcesJson
        );
    }

    public List<ChatMessage> findMessagesBySessionAndUser(UUID sessionId, Long userId, String tenantId) {
        return jdbcTemplate.query(
                """
                SELECT id, session_id, user_id, tenant_id, role, content, sources_json, created_at
                FROM chat_messages
                WHERE session_id = ? AND user_id = ? AND tenant_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (rs, rowNum) -> mapMessage(rs),
                sessionId,
                userId,
                tenantId
        );
    }

    public int deleteSessionOwnedByUser(UUID sessionId, Long userId, String tenantId) {
        return jdbcTemplate.update(
                "DELETE FROM chat_sessions WHERE id = ? AND user_id = ? AND tenant_id = ?",
                sessionId,
                userId,
                tenantId
        );
    }

    private ChatMessage mapMessage(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new ChatMessage(
                rs.getLong("id"),
                UUID.fromString(rs.getString("session_id")),
                rs.getLong("user_id"),
                rs.getString("tenant_id"),
                rs.getString("role"),
                rs.getString("content"),
                deserializeSources(rs.getString("sources_json")),
                toInstant(rs.getTimestamp("created_at"))
        );
    }

    private String serializeSources(List<String> sources) {
        try {
            return objectMapper.writeValueAsString(sources != null ? sources : List.of());
        } catch (Exception ex) {
            return "[]";
        }
    }

    private List<String> deserializeSources(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception ex) {
            return List.of();
        }
    }

    private static String normalizeTitle(String title) {
        String clean = (title != null) ? title.replaceAll("\\s+", " ").trim() : "";
        if (clean.isBlank()) {
            return "Nueva consulta táctica";
        }
        if (clean.length() > 64) {
            return clean.substring(0, 61).trim() + "...";
        }
        return clean;
    }

    private static Instant toInstant(Timestamp ts) {
        return ts != null ? ts.toInstant() : Instant.now();
    }
}
