package com.tacticalplay.rag.model;

import java.time.Instant;
import java.util.UUID;

public record ChatSession(
        UUID id,
        Long userId,
        String tenantId,
        String title,
        String modality,
        String systemName,
        Instant createdAt,
        Instant updatedAt,
        int messageCount
) {
}
