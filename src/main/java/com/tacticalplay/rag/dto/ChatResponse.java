package com.tacticalplay.rag.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.UUID;

public record ChatResponse(
        UUID sessionId,
        String sessionTitle,
        String reply,
        String modality,
        String suggestedFormation,
        @JsonProperty("suggested_formation")
        String suggestedFormationSnakeCase,
        String appliedSystem,
        String recommendedSystem,
        List<String> sources,
        List<Citation> citations,
        @JsonProperty("retrieval_mode")
        String retrievalMode,
        @JsonProperty("ai_provider")
        String aiProvider,
        Integer demoQueriesUsed,
        Integer demoQueriesLimit,
        Integer demoQueriesRemaining
) {
    @JsonProperty("queriesUsed")
    public Integer queriesUsed() {
        return demoQueriesUsed;
    }

    @JsonProperty("maxQueries")
    public Integer maxQueries() {
        return demoQueriesLimit;
    }

    @JsonProperty("remainingQueries")
    public Integer remainingQueries() {
        return demoQueriesRemaining;
    }

    public record Citation(
            String source,
            Integer page,
            String section,
            Integer order,
            String mode,
            Double score
    ) {
    }

    public static ChatResponse of(String reply, String modality, String suggestedFormation, List<String> sources) {
        return new ChatResponse(null, null, reply, modality, suggestedFormation, suggestedFormation, null, null, sources, List.of(), "hybrid", "gemini", null, null, null);
    }

    public static ChatResponse of(
            String reply,
            String modality,
            String suggestedFormation,
            List<String> sources,
            String retrievalMode,
            String aiProvider
    ) {
        return new ChatResponse(null, null, reply, modality, suggestedFormation, suggestedFormation, null, null, sources, List.of(), retrievalMode, aiProvider, null, null, null);
    }

    public static ChatResponse of(
            String reply,
            String modality,
            String suggestedFormation,
            List<String> sources,
            List<Citation> citations,
            String retrievalMode,
            String aiProvider
    ) {
        return of(reply, modality, suggestedFormation, null, null, sources, citations, retrievalMode, aiProvider);
    }

    public static ChatResponse of(
            String reply,
            String modality,
            String suggestedFormation,
            String appliedSystem,
            String recommendedSystem,
            List<String> sources,
            List<Citation> citations,
            String retrievalMode,
            String aiProvider
    ) {
        return new ChatResponse(
                null,
                null,
                reply,
                modality,
                suggestedFormation,
                suggestedFormation,
                appliedSystem,
                recommendedSystem,
                sources,
                citations,
                retrievalMode,
                aiProvider,
                null,
                null,
                null
        );
    }

    public ChatResponse withSession(UUID sessionId, String sessionTitle) {
        return new ChatResponse(
                sessionId,
                sessionTitle,
                reply,
                modality,
                suggestedFormation,
                suggestedFormationSnakeCase,
                appliedSystem,
                recommendedSystem,
                sources,
                citations,
                retrievalMode,
                aiProvider,
                demoQueriesUsed,
                demoQueriesLimit,
                demoQueriesRemaining
        );
    }

    public ChatResponse withDemoQuota(Integer used, Integer limit, Integer remaining) {
        return new ChatResponse(
                sessionId,
                sessionTitle,
                reply,
                modality,
                suggestedFormation,
                suggestedFormationSnakeCase,
                appliedSystem,
                recommendedSystem,
                sources,
                citations,
                retrievalMode,
                aiProvider,
                used,
                limit,
                remaining
        );
    }
}
