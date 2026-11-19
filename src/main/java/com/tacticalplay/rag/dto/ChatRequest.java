package com.tacticalplay.rag.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record ChatRequest(
        @NotBlank(message = "El mensaje no puede estar vacío")
        String message,

        @NotBlank(message = "La modalidad es obligatoria")
        @Pattern(
                regexp = "Futsal|Fútbol 7|Fútbol 9|Fútbol 11",
                message = "La modalidad debe ser una de: Futsal, Fútbol 7, Fútbol 9, Fútbol 11"
        )
        String modality
) {
}
