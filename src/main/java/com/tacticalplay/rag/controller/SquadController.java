package com.tacticalplay.rag.controller;

import com.tacticalplay.rag.model.CustomPlayerEntity;
import com.tacticalplay.rag.model.TopReferencePlayer;
import com.tacticalplay.rag.service.TopPlayersApiService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/squad")
public class SquadController {

    private final TopPlayersApiService topPlayersApiService;

    public SquadController(TopPlayersApiService topPlayersApiService) {
        this.topPlayersApiService = topPlayersApiService;
    }

    public record OptimizeSquadRequest(
            String modality,
            String formation,
            List<String> targetSlots,
            String playStyle,
            Boolean idealChemistryMode
    ) {
    }

    @GetMapping("/players")
    public ResponseEntity<List<CustomPlayerEntity>> listCustomPlayers() {
        return ResponseEntity.ok(topPlayersApiService.getAllCustomPlayers());
    }

    @PostMapping("/players")
    public ResponseEntity<CustomPlayerEntity> createCustomPlayer(@RequestBody CustomPlayerEntity payload) {
        if (payload.name() == null || payload.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre del jugador es obligatorio.");
        }
        if (payload.position() == null || payload.position().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La posición del jugador es obligatoria.");
        }
        CustomPlayerEntity saved = topPlayersApiService.createCustomPlayer(payload);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @DeleteMapping("/players/{id}")
    public ResponseEntity<Map<String, Object>> deleteCustomPlayer(@PathVariable("id") Long id) {
        topPlayersApiService.deleteCustomPlayer(id);
        return ResponseEntity.ok(Map.of("deletedId", id, "status", "deleted"));
    }

    @DeleteMapping("/players")
    public ResponseEntity<Map<String, Object>> clearAllCustomPlayers() {
        topPlayersApiService.clearAllCustomPlayers();
        return ResponseEntity.ok(Map.of("status", "cleared"));
    }

    @PostMapping("/demo")
    public ResponseEntity<List<CustomPlayerEntity>> loadDemoSquad(
            @org.springframework.web.bind.annotation.RequestParam(value = "modality", defaultValue = "Fútbol 11") String modality
    ) {
        return ResponseEntity.ok(topPlayersApiService.seedDemoSquad(modality));
    }

    @GetMapping("/top100")
    public ResponseEntity<List<TopReferencePlayer>> listTop100Players() {
        return ResponseEntity.ok(topPlayersApiService.getAllTopReferencePlayers());
    }

    @PostMapping("/optimize")
    public ResponseEntity<Map<String, Object>> optimizeSquad(@RequestBody OptimizeSquadRequest request) {
        String modality = (request.modality() != null && !request.modality().isBlank())
                ? request.modality()
                : "Fútbol 11";
        String formation = (request.formation() != null && !request.formation().isBlank())
                ? request.formation()
                : "1-4-3-3";
        String playStyle = (request.playStyle() != null && !request.playStyle().isBlank())
                ? request.playStyle()
                : "Posesión";
        boolean idealMode = Boolean.TRUE.equals(request.idealChemistryMode());
        return ResponseEntity.ok(
                topPlayersApiService.optimizeSquadAndCompare(
                        modality,
                        formation,
                        request.targetSlots(),
                        playStyle,
                        idealMode
                )
        );
    }

    @PostMapping("/ideal")
    public ResponseEntity<Map<String, Object>> generateIdealSquad(@RequestBody OptimizeSquadRequest request) {
        String modality = (request.modality() != null && !request.modality().isBlank())
                ? request.modality()
                : "Fútbol 11";
        String formation = (request.formation() != null && !request.formation().isBlank())
                ? request.formation()
                : "1-4-3-3";
        String playStyle = (request.playStyle() != null && !request.playStyle().isBlank())
                ? request.playStyle()
                : "Posesión";
        return ResponseEntity.ok(
                topPlayersApiService.optimizeSquadAndCompare(
                        modality,
                        formation,
                        request.targetSlots(),
                        playStyle,
                        true
                )
        );
    }
}
