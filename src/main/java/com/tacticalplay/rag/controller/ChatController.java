package com.tacticalplay.rag.controller;

import com.tacticalplay.rag.dto.ChatRequest;
import com.tacticalplay.rag.dto.ChatResponse;
import com.tacticalplay.rag.service.ChatService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> healthCheck() {
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "service", "TacticalPlay RAG (Spring Boot)"
        ));
    }

    @PostMapping("/api/v1/tactical/ask")
    public ResponseEntity<ChatResponse> askTacticalAssistant(@Valid @RequestBody ChatRequest request) {
        return ResponseEntity.ok(chatService.generateTacticalResponse(request));
    }
}
