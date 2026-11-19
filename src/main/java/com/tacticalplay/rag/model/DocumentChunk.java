package com.tacticalplay.rag.model;

public record DocumentChunk(
        Long id,
        String tenantId,
        String modality,
        String sourceName,
        Integer pageNumber,
        String chunkText
) {
    public static DocumentChunk forInsert(
            String tenantId,
            String modality,
            String sourceName,
            int pageNumber,
            String chunkText
    ) {
        return new DocumentChunk(null, tenantId, modality, sourceName, pageNumber, chunkText);
    }

    public String formattedSource() {
        int page = pageNumber != null ? pageNumber : 1;
        return sourceName + " (Pág. " + page + ")";
    }
}
