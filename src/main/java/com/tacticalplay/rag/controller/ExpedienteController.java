package com.tacticalplay.rag.controller;

import com.tacticalplay.rag.model.DocumentChunk;
import com.tacticalplay.rag.model.Expediente;
import com.tacticalplay.rag.repository.DocumentChunkRepository;
import com.tacticalplay.rag.repository.ExpedienteRepository;
import com.tacticalplay.rag.repository.UserRepository;
import com.tacticalplay.rag.security.AuthPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/api/v1/expedientes")
public class ExpedienteController {

    private final ExpedienteRepository expedienteRepository;
    private final DocumentChunkRepository chunkRepository;
    private final UserRepository userRepository;

    public ExpedienteController(
            ExpedienteRepository expedienteRepository,
            DocumentChunkRepository chunkRepository,
            UserRepository userRepository
    ) {
        this.expedienteRepository = expedienteRepository;
        this.chunkRepository = chunkRepository;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<List<Expediente>> listExpedientes(@AuthenticationPrincipal AuthPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Autenticación requerida.");
        }
        Long currentUserId = resolveUserId(principal);
        List<Expediente> visible = expedienteRepository.findByTenant(principal.tenantId()).stream()
                .filter(exp -> canView(exp, principal, currentUserId))
                .toList();
        return ResponseEntity.ok(visible);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Expediente> getExpedienteStatus(
            @PathVariable("id") String id,
            @AuthenticationPrincipal AuthPrincipal principal
    ) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Autenticación requerida.");
        }
        Long currentUserId = resolveUserId(principal);
        Expediente exp = expedienteRepository.findByIdAndTenant(id, principal.tenantId(), principal.isAdmin())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Expediente no encontrado para tu tenant."));

        if (!canView(exp, principal, currentUserId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes autorización para acceder a este expediente privado.");
        }
        return ResponseEntity.ok(exp);
    }

    @GetMapping("/{id}/chunks")
    public ResponseEntity<List<DocumentChunk>> getExpedienteChunks(
            @PathVariable("id") String id,
            @AuthenticationPrincipal AuthPrincipal principal
    ) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Autenticación requerida.");
        }
        Long currentUserId = resolveUserId(principal);
        Expediente exp = expedienteRepository.findByIdAndTenant(id, principal.tenantId(), principal.isAdmin())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Expediente no encontrado para tu tenant."));

        if (!canView(exp, principal, currentUserId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes autorización para inspeccionar fragmentos de este expediente.");
        }
        return ResponseEntity.ok(
                chunkRepository.findByExpedienteIdAndTenant(id, principal.tenantId(), currentUserId, principal.username(), principal.isAdmin())
        );
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteExpediente(
            @PathVariable("id") String id,
            @AuthenticationPrincipal AuthPrincipal principal
    ) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Autenticación requerida.");
        }
        Long currentUserId = resolveUserId(principal);
        Expediente exp = expedienteRepository.findByIdAndTenant(id, principal.tenantId(), principal.isAdmin())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Expediente no encontrado."));

        if (!canManage(exp, principal, currentUserId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Solo el propietario o administrador puede eliminar este expediente.");
        }

        int deletedChunks = chunkRepository.deleteByExpedienteId(id, principal.tenantId(), principal.isAdmin());
        expedienteRepository.deleteByIdAndTenant(id, principal.tenantId(), principal.isAdmin());

        return ResponseEntity.ok(Map.of(
                "deletedExpedienteId", id,
                "deletedChunks", deletedChunks,
                "status", "deleted"
        ));
    }

    private Long resolveUserId(AuthPrincipal principal) {
        if (principal.userId() != null) {
            return principal.userId();
        }
        return userRepository.findByUsername(principal.username())
                .map(UserRepository.AppUserRecord::id)
                .orElse(null);
    }

    private boolean isOwner(Expediente exp, AuthPrincipal principal, Long currentUserId) {
        if (exp.ownerUserId() != null && currentUserId != null) {
            return Objects.equals(exp.ownerUserId(), currentUserId);
        }
        return exp.ownerUsername() != null && exp.ownerUsername().equalsIgnoreCase(principal.username());
    }

    private boolean canView(Expediente exp, AuthPrincipal principal, Long currentUserId) {
        if (!exp.tenantId().equalsIgnoreCase(principal.tenantId())) {
            return false;
        }
        if (principal.isAdmin()) {
            return true;
        }
        if ("TENANT".equalsIgnoreCase(exp.permissions())) {
            return true;
        }
        return isOwner(exp, principal, currentUserId);
    }

    private boolean canManage(Expediente exp, AuthPrincipal principal, Long currentUserId) {
        if (!exp.tenantId().equalsIgnoreCase(principal.tenantId())) {
            return false;
        }
        return principal.isAdmin() || isOwner(exp, principal, currentUserId);
    }
}
