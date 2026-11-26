package com.tacticalplay.rag.model;

import java.time.Instant;

public record Expediente(
        String id,
        String tenantId,
        String ownerUsername,
        String modality,
        String title,
        String originalFilename,
        String fileSha256,
        long fileSizeBytes,
        String status,
        boolean ocrUsed,
        int pagesTotal,
        int chunksCount,
        String embeddingProvider,
        String embeddingModel,
        String permissions,
        String errorMessage,
        boolean tempDeleted,
        Instant createdAt,
        Instant completedAt,
        Long ownerUserId
) {
    public Expediente(
            String id,
            String tenantId,
            String ownerUsername,
            String modality,
            String title,
            String originalFilename,
            String fileSha256,
            long fileSizeBytes,
            String status,
            boolean ocrUsed,
            int pagesTotal,
            int chunksCount,
            String embeddingProvider,
            String embeddingModel,
            String permissions,
            String errorMessage,
            boolean tempDeleted,
            Instant createdAt,
            Instant completedAt
    ) {
        this(id, tenantId, ownerUsername, modality, title, originalFilename, fileSha256, fileSizeBytes, status,
                ocrUsed, pagesTotal, chunksCount, embeddingProvider, embeddingModel, permissions, errorMessage,
                tempDeleted, createdAt, completedAt, null);
    }
}
