package com.tacticalplay.rag.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record PdfUploadResponse(
        @JsonProperty("expediente_id")
        String expedienteId,
        String filename,
        @JsonProperty("tenant_id")
        String tenantId,
        String modality,
        String status,
        @JsonProperty("pages_processed")
        int pagesProcessed,
        @JsonProperty("chunks_saved")
        int chunksSaved,
        @JsonProperty("ocr_used")
        boolean ocrUsed,
        @JsonProperty("embedding_model")
        String embeddingModel,
        boolean verified,
        @JsonProperty("temp_deleted")
        boolean tempDeleted,
        String message
) {
}
