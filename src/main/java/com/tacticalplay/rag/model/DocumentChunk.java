package com.tacticalplay.rag.model;

public record DocumentChunk(
        Long id,
        String tenantId,
        String expedienteId,
        String modality,
        String sourceName,
        Integer pageNumber,
        String sectionTitle,
        Integer chunkOrder,
        String chunkText,
        String embeddingLiteral,
        String embeddingModel,
        String permissions,
        Double score,
        String retrievalMode,
        Long ownerUserId
) {
    public DocumentChunk(
            Long id,
            String tenantId,
            String expedienteId,
            String modality,
            String sourceName,
            Integer pageNumber,
            String sectionTitle,
            Integer chunkOrder,
            String chunkText,
            String embeddingLiteral,
            String embeddingModel,
            String permissions,
            Double score,
            String retrievalMode
    ) {
        this(id, tenantId, expedienteId, modality, sourceName, pageNumber, sectionTitle, chunkOrder, chunkText,
                embeddingLiteral, embeddingModel, permissions, score, retrievalMode, null);
    }

    public DocumentChunk(
            Long id,
            String tenantId,
            String modality,
            String sourceName,
            Integer pageNumber,
            String chunkText
    ) {
        this(id, tenantId, null, modality, sourceName, pageNumber, null, 0, chunkText, null, null, "PRIVATE", null, null, null);
    }

    public DocumentChunk(
            Long id,
            String tenantId,
            String modality,
            String sourceName,
            Integer pageNumber,
            String chunkText,
            String embeddingLiteral
    ) {
        this(id, tenantId, null, modality, sourceName, pageNumber, null, 0, chunkText, embeddingLiteral, null, "PRIVATE", null, null, null);
    }

    public static DocumentChunk forInsert(
            String tenantId,
            String modality,
            String sourceName,
            int pageNumber,
            String chunkText,
            String embeddingLiteral
    ) {
        return new DocumentChunk(
                null, tenantId, null, modality, sourceName, pageNumber, null, 0, chunkText, embeddingLiteral, null, "PRIVATE", null, null, null
        );
    }

    public static DocumentChunk forInsert(
            String tenantId,
            String modality,
            String sourceName,
            int pageNumber,
            String chunkText
    ) {
        return forInsert(tenantId, modality, sourceName, pageNumber, chunkText, null);
    }

    public static DocumentChunk forExpedienteInsert(
            String tenantId,
            String expedienteId,
            String modality,
            String sourceName,
            int pageNumber,
            String sectionTitle,
            int chunkOrder,
            String chunkText,
            String embeddingLiteral,
            String embeddingModel,
            String permissions
    ) {
        return forExpedienteInsert(
                tenantId,
                expedienteId,
                modality,
                sourceName,
                pageNumber,
                sectionTitle,
                chunkOrder,
                chunkText,
                embeddingLiteral,
                embeddingModel,
                permissions,
                null
        );
    }

    public static DocumentChunk forExpedienteInsert(
            String tenantId,
            String expedienteId,
            String modality,
            String sourceName,
            int pageNumber,
            String sectionTitle,
            int chunkOrder,
            String chunkText,
            String embeddingLiteral,
            String embeddingModel,
            String permissions,
            Long ownerUserId
    ) {
        return new DocumentChunk(
                null,
                tenantId,
                expedienteId,
                modality,
                sourceName,
                pageNumber,
                sectionTitle,
                chunkOrder,
                chunkText,
                embeddingLiteral,
                embeddingModel,
                permissions != null ? permissions : "PRIVATE",
                null,
                null,
                ownerUserId
        );
    }

    public DocumentChunk withSearchMetadata(Double newScore, String newMode) {
        return new DocumentChunk(
                id,
                tenantId,
                expedienteId,
                modality,
                sourceName,
                pageNumber,
                sectionTitle,
                chunkOrder,
                chunkText,
                embeddingLiteral,
                embeddingModel,
                permissions,
                newScore,
                newMode,
                ownerUserId
        );
    }

    public String formattedSource() {
        int page = pageNumber != null ? pageNumber : 1;
        if (sectionTitle != null && !sectionTitle.isBlank()) {
            return sourceName + " (Pág. " + page + " · Sec: " + sectionTitle + ")";
        }
        return sourceName + " (Pág. " + page + ")";
    }
}
