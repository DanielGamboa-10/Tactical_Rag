package com.tacticalplay.rag.model;

public record DocumentChunk(
        Long id,
        String tenantId,
        String modality,
        String sourceName,
        Integer pageNumber,
        String chunkText,
        String embeddingLiteral
) {
    public DocumentChunk(
            Long id,
            String tenantId,
            String modality,
            String sourceName,
            Integer pageNumber,
            String chunkText
    ) {
        this(id, tenantId, modality, sourceName, pageNumber, chunkText, null);
    }

    public static DocumentChunk forInsert(
            String tenantId,
            String modality,
            String sourceName,
            int pageNumber,
            String chunkText,
            String embeddingLiteral
    ) {
        return new DocumentChunk(null, tenantId, modality, sourceName, pageNumber, chunkText, embeddingLiteral);
    }

    public static DocumentChunk forInsert(
            String tenantId,
            String modality,
            String sourceName,
            int pageNumber,
            String chunkText
    ) {
        return new DocumentChunk(null, tenantId, modality, sourceName, pageNumber, chunkText, null);
    }

    public String formattedSource() {
        int page = pageNumber != null ? pageNumber : 1;
        return sourceName + " (Pág. " + page + ")";
    }
}
