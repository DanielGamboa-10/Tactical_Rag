package com.tacticalplay.rag.security;

import java.util.List;

public record AuthPrincipal(
        Long userId,
        String username,
        String email,
        String displayName,
        String tenantId,
        List<String> roles,
        String demoKey
) {
    public AuthPrincipal(String username, String displayName, String tenantId, List<String> roles) {
        this(null, username, null, displayName, tenantId, roles, null);
    }

    public AuthPrincipal(
            Long userId,
            String username,
            String email,
            String displayName,
            String tenantId,
            List<String> roles
    ) {
        this(userId, username, email, displayName, tenantId, roles, null);
    }

    public AuthPrincipal withDemoKey(String newDemoKey) {
        return new AuthPrincipal(userId, username, email, displayName, tenantId, roles, newDemoKey);
    }

    public String fullName() {
        return displayName;
    }

    public boolean isDemoAccount() {
        return "demo".equalsIgnoreCase(username) || (demoKey != null && !demoKey.isBlank());
    }

    public boolean isAdmin() {
        return roles != null && roles.contains("ROLE_ADMIN");
    }

    public String primaryRole() {
        return (roles != null && !roles.isEmpty()) ? roles.get(0) : "ROLE_COACH";
    }
}
