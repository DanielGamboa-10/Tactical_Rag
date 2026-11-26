package com.tacticalplay.rag.repository;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Repository
public class DemoQuotaRepository {

    public static final int DEFAULT_MAX_QUERIES = 15;

    public record DemoQuotaStatus(
            String demoKey,
            int queriesUsed,
            int maxQueries,
            boolean blocked
    ) {
        public DemoQuotaStatus(String demoKey, int queriesUsed, int maxQueries) {
            this(demoKey, queriesUsed, maxQueries, queriesUsed >= maxQueries);
        }

        public int remaining() {
            return Math.max(0, maxQueries - queriesUsed);
        }

        public boolean isExhausted() {
            return blocked || queriesUsed >= maxQueries;
        }
    }

    private static final RowMapper<DemoQuotaStatus> USAGE_MAPPER = (rs, rowNum) -> new DemoQuotaStatus(
            rs.getString("device_id"),
            rs.getInt("queries_used"),
            rs.getInt("max_queries"),
            rs.getBoolean("blocked")
    );

    private final JdbcTemplate jdbcTemplate;

    public DemoQuotaRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public DemoQuotaStatus createSessionQuota() {
        return resolveOrCreateDeviceQuota(UUID.randomUUID().toString());
    }

    public DemoQuotaStatus resolveOrCreateDeviceQuota(String rawDeviceId) {
        String deviceId = normalizeDeviceId(rawDeviceId);
        jdbcTemplate.update(
                """
                INSERT INTO demo_usage (device_id, queries_used, max_queries, blocked, created_at, updated_at)
                VALUES (?, 0, ?, FALSE, NOW(), NOW())
                ON CONFLICT (device_id) DO NOTHING
                """,
                deviceId,
                DEFAULT_MAX_QUERIES
        );
        return getStatus(deviceId);
    }

    public DemoQuotaStatus getStatus(String rawDeviceId) {
        if (rawDeviceId == null || rawDeviceId.isBlank()) {
            return new DemoQuotaStatus("demo-default", 0, DEFAULT_MAX_QUERIES, false);
        }
        String deviceId = normalizeDeviceId(rawDeviceId);
        List<DemoQuotaStatus> found = jdbcTemplate.query(
                "SELECT device_id, queries_used, max_queries, blocked FROM demo_usage WHERE device_id = ?",
                USAGE_MAPPER,
                deviceId
        );
        if (!found.isEmpty()) {
            return found.get(0);
        }
        return new DemoQuotaStatus(deviceId, 0, DEFAULT_MAX_QUERIES, false);
    }

    public DemoQuotaStatus consumeQueryOrThrow(String rawDeviceId) {
        if (rawDeviceId == null || rawDeviceId.isBlank()) {
            return new DemoQuotaStatus("demo-default", 0, DEFAULT_MAX_QUERIES, false);
        }

        String deviceId = normalizeDeviceId(rawDeviceId);
        jdbcTemplate.update(
                """
                INSERT INTO demo_usage (device_id, queries_used, max_queries, blocked, created_at, updated_at)
                VALUES (?, 0, ?, FALSE, NOW(), NOW())
                ON CONFLICT (device_id) DO NOTHING
                """,
                deviceId,
                DEFAULT_MAX_QUERIES
        );

        List<DemoQuotaStatus> updated = jdbcTemplate.query(
                """
                UPDATE demo_usage
                SET queries_used = queries_used + 1,
                    blocked = (queries_used + 1 >= max_queries),
                    updated_at = NOW()
                WHERE device_id = ? AND queries_used < max_queries AND blocked = FALSE
                RETURNING device_id, queries_used, max_queries, blocked
                """,
                USAGE_MAPPER,
                deviceId
        );

        if (updated.isEmpty()) {
            jdbcTemplate.update(
                    "UPDATE demo_usage SET blocked = TRUE, updated_at = NOW() WHERE device_id = ?",
                    deviceId
            );
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "DEMO_QUERIES_EXHAUSTED: Has agotado tus 15 consultas gratuitas en Modo Demo. Inicia sesión o crea tu cuenta gratuita para continuar."
            );
        }
        return updated.get(0);
    }

    public static String normalizeDeviceId(String rawDeviceId) {
        if (rawDeviceId == null || rawDeviceId.isBlank()) {
            return UUID.randomUUID().toString();
        }
        String cleaned = rawDeviceId.trim().replaceAll("[^A-Za-z0-9_-]", "");
        if (cleaned.length() < 8) {
            return UUID.randomUUID().toString();
        }
        return cleaned.length() > 128 ? cleaned.substring(0, 128) : cleaned;
    }
}
