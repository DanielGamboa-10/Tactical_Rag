package com.tacticalplay.rag.repository;

import com.tacticalplay.rag.security.AuthPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Repository;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@Repository
public class UserRepository {

    public record AppUserRecord(
            Long id,
            String username,
            String email,
            String passwordHash,
            String fullName,
            String displayName,
            String tenantId,
            List<String> roles
    ) {
        public AuthPrincipal toPrincipal() {
            return new AuthPrincipal(id, username, email, displayName, tenantId, roles);
        }

        public String primaryRole() {
            return (roles != null && !roles.isEmpty()) ? roles.get(0) : "ROLE_COACH";
        }
    }

    private static final RowMapper<AppUserRecord> USER_MAPPER = (rs, rowNum) -> {
        String rawRoles = rs.getString("roles");
        List<String> roles = (rawRoles != null && !rawRoles.isBlank())
                ? Arrays.stream(rawRoles.split(",")).map(String::trim).filter(s -> !s.isBlank()).toList()
                : List.of("ROLE_COACH");
        String displayName = rs.getString("display_name");
        String fullName = rs.getString("full_name");
        String resolvedFullName = (fullName != null && !fullName.isBlank()) ? fullName : displayName;
        return new AppUserRecord(
                rs.getLong("id"),
                rs.getString("username"),
                rs.getString("email"),
                rs.getString("password_hash"),
                resolvedFullName,
                displayName,
                rs.getString("tenant_id"),
                roles
        );
    };

    private final JdbcTemplate jdbcTemplate;

    public UserRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<AppUserRecord> findByUsername(String username) {
        if (username == null || username.isBlank()) {
            return Optional.empty();
        }
        List<AppUserRecord> results = jdbcTemplate.query(
                "SELECT id, username, email, password_hash, full_name, display_name, tenant_id, roles FROM app_users WHERE LOWER(username) = LOWER(?)",
                USER_MAPPER,
                username.trim()
        );
        return results.stream().findFirst();
    }

    public Optional<AppUserRecord> findByUsernameOrEmail(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            return Optional.empty();
        }
        String trimmed = identifier.trim();
        List<AppUserRecord> results = jdbcTemplate.query(
                "SELECT id, username, email, password_hash, full_name, display_name, tenant_id, roles "
                        + "FROM app_users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1",
                USER_MAPPER,
                trimmed,
                trimmed
        );
        return results.stream().findFirst();
    }

    public boolean existsByUsername(String username) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM app_users WHERE LOWER(username) = LOWER(?)",
                Integer.class,
                username.trim()
        );
        return count != null && count > 0;
    }

    public boolean existsByEmail(String email) {
        if (email == null || email.isBlank()) {
            return false;
        }
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM app_users WHERE LOWER(email) = LOWER(?)",
                Integer.class,
                email.trim()
        );
        return count != null && count > 0;
    }

    public boolean existsByTenantId(String tenantId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM app_users WHERE LOWER(tenant_id) = LOWER(?)",
                Integer.class,
                tenantId.trim()
        );
        return count != null && count > 0;
    }

    public AppUserRecord createUser(
            String username,
            String passwordHash,
            String displayName,
            String tenantId,
            List<String> roles
    ) {
        return createUser(username, null, passwordHash, displayName, tenantId, roles);
    }

    public AppUserRecord createUser(
            String username,
            String email,
            String passwordHash,
            String fullName,
            String tenantId,
            List<String> roles
    ) {
        List<String> effectiveRoles = (roles == null || roles.isEmpty()) ? List.of("ROLE_COACH") : roles;
        String rolesCsv = String.join(",", effectiveRoles);
        String primaryRole = effectiveRoles.get(0);
        String normalizedEmail = (email != null && !email.isBlank()) ? email.trim().toLowerCase() : null;
        String cleanName = fullName.trim();

        return jdbcTemplate.queryForObject(
                """
                INSERT INTO app_users (username, email, password_hash, full_name, display_name, tenant_id, role, roles)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id, username, email, password_hash, full_name, display_name, tenant_id, roles
                """,
                USER_MAPPER,
                username.trim().toLowerCase(),
                normalizedEmail,
                passwordHash,
                cleanName,
                cleanName,
                tenantId.trim().toLowerCase(),
                primaryRole,
                rolesCsv
        );
    }

    public void ensureDefaultUsers(PasswordEncoder passwordEncoder) {
        if (!existsByUsername("demo")) {
            createUser(
                    "demo",
                    "demo@tacticalplay.ai",
                    passwordEncoder.encode("TacticalPlay2026!"),
                    "Entrenador Demo",
                    "demo-club",
                    List.of("ROLE_COACH")
            );
        } else if (!existsByEmail("demo@tacticalplay.ai")) {
            jdbcTemplate.update(
                    "UPDATE app_users SET email = 'demo@tacticalplay.ai', full_name = COALESCE(full_name, display_name) WHERE LOWER(username) = 'demo' AND email IS NULL"
            );
        }
        if (!existsByUsername("admin")) {
            createUser(
                    "admin",
                    "admin@tacticalplay.ai",
                    passwordEncoder.encode("TacticalAdmin2026!"),
                    "Director Técnico",
                    "demo-club",
                    List.of("ROLE_ADMIN", "ROLE_COACH")
            );
        } else if (!existsByEmail("admin@tacticalplay.ai")) {
            jdbcTemplate.update(
                    "UPDATE app_users SET email = 'admin@tacticalplay.ai', full_name = COALESCE(full_name, display_name) WHERE LOWER(username) = 'admin' AND email IS NULL"
            );
        }
    }
}
