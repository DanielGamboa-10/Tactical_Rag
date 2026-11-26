package com.tacticalplay.rag.controller;

import com.tacticalplay.rag.model.ChatMessage;
import com.tacticalplay.rag.model.ChatSession;
import com.tacticalplay.rag.repository.ChatHistoryRepository;
import com.tacticalplay.rag.repository.UserRepository;
import com.tacticalplay.rag.security.AuthPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping({"/api/chat/sessions", "/api/v1/chat/sessions"})
public class ChatHistoryController {

    public record CreateSessionRequest(
            String title,
            String modality,
            String systemName
    ) {
    }

    private final ChatHistoryRepository chatHistoryRepository;
    private final UserRepository userRepository;

    public ChatHistoryController(
            ChatHistoryRepository chatHistoryRepository,
            UserRepository userRepository
    ) {
        this.chatHistoryRepository = chatHistoryRepository;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<List<ChatSession>> listSessions(@AuthenticationPrincipal AuthPrincipal principal) {
        Long userId = requireUserId(principal);
        List<ChatSession> sessions = chatHistoryRepository.findSessionsByUserAndTenant(userId, principal.tenantId());
        return ResponseEntity.ok(sessions);
    }

    @PostMapping
    public ResponseEntity<ChatSession> createSession(
            @RequestBody(required = false) CreateSessionRequest request,
            @AuthenticationPrincipal AuthPrincipal principal
    ) {
        Long userId = requireUserId(principal);
        String title = request != null ? request.title() : null;
        String modality = request != null ? request.modality() : "Futsal";
        String systemName = request != null ? request.systemName() : null;
        ChatSession created = chatHistoryRepository.createSession(userId, principal.tenantId(), title, modality, systemName);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/{sessionId}/messages")
    public ResponseEntity<Map<String, Object>> getSessionMessages(
            @PathVariable UUID sessionId,
            @AuthenticationPrincipal AuthPrincipal principal
    ) {
        Long userId = requireUserId(principal);
        ChatSession session = chatHistoryRepository.findSessionById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversación no encontrada."));

        if (!session.userId().equals(userId) || !session.tenantId().equals(principal.tenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permiso para ver esta conversación.");
        }

        List<ChatMessage> messages = chatHistoryRepository.findMessagesBySessionAndUser(
                sessionId,
                userId,
                principal.tenantId()
        );

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("session", session);
        body.put("messages", messages);
        return ResponseEntity.ok(body);
    }

    @DeleteMapping("/{sessionId}")
    public ResponseEntity<Map<String, Object>> deleteSession(
            @PathVariable UUID sessionId,
            @AuthenticationPrincipal AuthPrincipal principal
    ) {
        Long userId = requireUserId(principal);
        ChatSession session = chatHistoryRepository.findSessionById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversación no encontrada."));

        if (!session.userId().equals(userId) || !session.tenantId().equals(principal.tenantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permiso para eliminar esta conversación.");
        }

        chatHistoryRepository.deleteSessionOwnedByUser(sessionId, userId, principal.tenantId());
        return ResponseEntity.ok(Map.of(
                "deleted", true,
                "sessionId", sessionId
        ));
    }

    private Long requireUserId(AuthPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Autenticación requerida.");
        }
        if (principal.userId() != null) {
            return principal.userId();
        }
        return userRepository.findByUsername(principal.username())
                .map(UserRepository.AppUserRecord::id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Perfil de usuario no válido."));
    }
}
