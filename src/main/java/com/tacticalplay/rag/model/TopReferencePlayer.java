package com.tacticalplay.rag.model;

public record TopReferencePlayer(
        Long id,
        String name,
        String sport,
        String position,
        String era,
        String playStyle,
        int pace,
        int passing,
        int dribbling,
        int defending,
        int shooting,
        int vision,
        String wikiExtract
) {
}
