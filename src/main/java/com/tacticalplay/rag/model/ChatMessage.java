package com.tacticalplay.rag.model;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ChatMessage(
        Long id,
        UUID sessionId,
        Long userId,
        String tenantId,
        String role,
        String content,
        List<String> sources,
        Instant createdAt
) {
}
