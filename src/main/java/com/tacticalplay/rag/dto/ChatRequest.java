package com.tacticalplay.rag.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.util.UUID;

public record ChatRequest(
        @NotBlank(message = "El mensaje no puede estar vacío")
        String message,

        @NotBlank(message = "La modalidad es obligatoria")
        @Pattern(
                regexp = "Futsal|Fútbol 7|Fútbol 9|Fútbol 11",
                message = "La modalidad debe ser una de: Futsal, Fútbol 7, Fútbol 9, Fútbol 11"
        )
        String modality,

        String formation,

        String playStyle,

        Boolean tenantDocsOnly,

        UUID sessionId
) {
    public ChatRequest(String message, String modality) {
        this(message, modality, null, null, false, null);
    }

    public ChatRequest(String message, String modality, String formation, String playStyle) {
        this(message, modality, formation, playStyle, false, null);
    }

    public ChatRequest(String message, String modality, String formation, String playStyle, Boolean tenantDocsOnly) {
        this(message, modality, formation, playStyle, tenantDocsOnly, null);
    }
}
