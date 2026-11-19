package com.tacticalplay.rag.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record PdfUploadResponse(
        String filename,
        @JsonProperty("tenant_id")
        String tenantId,
        String modality,
        @JsonProperty("pages_processed")
        int pagesProcessed,
        @JsonProperty("chunks_saved")
        int chunksSaved,
        String message
) {
}
