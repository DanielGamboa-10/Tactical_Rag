package com.tacticalplay.rag.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record ChatResponse(
        String reply,
        String modality,
        String suggestedFormation,
        @JsonProperty("suggested_formation")
        String suggestedFormationSnakeCase,
        List<String> sources
) {
    public static ChatResponse of(String reply, String modality, String suggestedFormation, List<String> sources) {
        return new ChatResponse(reply, modality, suggestedFormation, suggestedFormation, sources);
    }
}
