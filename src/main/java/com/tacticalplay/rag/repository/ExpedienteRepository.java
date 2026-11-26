package com.tacticalplay.rag.repository;

import com.tacticalplay.rag.model.Expediente;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class ExpedienteRepository {

    private static final RowMapper<Expediente> ROW_MAPPER = (rs, rowNum) -> {
        Timestamp createdTs = rs.getTimestamp("created_at");
        Timestamp completedTs = rs.getTimestamp("completed_at");
        return new Expediente(
                rs.getString("id"),
                rs.getString("tenant_id"),
                rs.getString("owner_username"),
                rs.getString("modality"),
                rs.getString("title"),
                rs.getString("original_filename"),
                rs.getString("file_sha256"),
                rs.getLong("file_size_bytes"),
                rs.getString("status"),
                rs.getBoolean("ocr_used"),
                rs.getInt("pages_total"),
                rs.getInt("chunks_count"),
                rs.getString("embedding_provider"),
                rs.getString("embedding_model"),
                rs.getString("permissions"),
                rs.getString("error_message"),
                rs.getBoolean("temp_deleted"),
                tsToInstant(createdTs),
                tsToInstantOrNull(completedTs),
                hasColumn(rs, "owner_user_id") && rs.getObject("owner_user_id") != null
                        ? ((Number) rs.getObject("owner_user_id")).longValue()
                        : null
        );
    };

    private static Instant tsToInstant(Timestamp ts) {
        return ts != null ? ts.toInstant() : Instant.now();
    }

    private static Instant tsToInstantOrNull(Timestamp ts) {
        return ts != null ? ts.toInstant() : null;
    }

    private static boolean hasColumn(java.sql.ResultSet rs, String colName) {
        try {
            rs.findColumn(colName);
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    private final JdbcTemplate jdbcTemplate;

    public ExpedienteRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void create(Expediente exp) {
        jdbcTemplate.update("""
                INSERT INTO expedientes (
                    id, tenant_id, owner_user_id, owner_username, modality, title, original_filename,
                    file_sha256, file_size_bytes, status, ocr_used, pages_total, chunks_count,
                    embedding_provider, embedding_model, permissions, error_message, temp_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                exp.id(),
                exp.tenantId(),
                exp.ownerUserId(),
                exp.ownerUsername(),
                exp.modality(),
                exp.title(),
                exp.originalFilename(),
                exp.fileSha256(),
                exp.fileSizeBytes(),
                exp.status(),
                exp.ocrUsed(),
                exp.pagesTotal(),
                exp.chunksCount(),
                exp.embeddingProvider(),
                exp.embeddingModel(),
                exp.permissions(),
                exp.errorMessage(),
                exp.tempDeleted()
        );
    }

    public void updateStatus(String id, String status) {
        jdbcTemplate.update("UPDATE expedientes SET status = ? WHERE id = ?", status, id);
    }

    public void updateProgress(String id, String status, int pagesTotal, boolean ocrUsed) {
        jdbcTemplate.update(
                "UPDATE expedientes SET status = ?, pages_total = ?, ocr_used = ? WHERE id = ?",
                status, pagesTotal, ocrUsed, id
        );
    }

    public void markReady(
            String id,
            int pagesTotal,
            int chunksCount,
            boolean ocrUsed,
            String provider,
            String model,
            boolean tempDeleted
    ) {
        jdbcTemplate.update("""
                UPDATE expedientes
                SET status = 'READY',
                    pages_total = ?,
                    chunks_count = ?,
                    ocr_used = ?,
                    embedding_provider = ?,
                    embedding_model = ?,
                    temp_deleted = ?,
                    error_message = NULL,
                    completed_at = NOW()
                WHERE id = ?
                """,
                pagesTotal, chunksCount, ocrUsed, provider, model, tempDeleted, id
        );
    }

    public void markFailed(String id, String errorMessage, boolean tempDeleted) {
        jdbcTemplate.update("""
                UPDATE expedientes
                SET status = 'FAILED',
                    error_message = ?,
                    temp_deleted = ?,
                    completed_at = NOW()
                WHERE id = ?
                """,
                errorMessage, tempDeleted, id
        );
    }

    public List<Expediente> findByTenant(String tenantId) {
        return jdbcTemplate.query(
                "SELECT * FROM expedientes WHERE tenant_id = ? ORDER BY created_at DESC",
                ROW_MAPPER,
                tenantId
        );
    }

    public Optional<Expediente> findByIdAndTenant(String id, String tenantId, boolean isAdmin) {
        List<Expediente> rows = jdbcTemplate.query(
                "SELECT * FROM expedientes WHERE id = ? AND tenant_id = ?",
                ROW_MAPPER, id, tenantId
        );
        return rows.stream().findFirst();
    }

    public int deleteByIdAndTenant(String id, String tenantId, boolean isAdmin) {
        return jdbcTemplate.update("DELETE FROM expedientes WHERE id = ? AND tenant_id = ?", id, tenantId);
    }
}
