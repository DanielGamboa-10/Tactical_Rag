package com.tacticalplay.rag.model;

public record CustomPlayerEntity(
        Long id,
        String name,
        int jerseyNumber,
        String position,
        String preferredFoot,
        int pace,
        int passing,
        int dribbling,
        int defending,
        int shooting,
        int vision
) {
    public int overallRating() {
        return Math.round((pace + passing + dribbling + defending + shooting + vision) / 6.0f);
    }
}
