package com.tacticalplay.rag.controller;

import com.tacticalplay.rag.dto.ChatRequest;
import com.tacticalplay.rag.dto.ChatResponse;
import com.tacticalplay.rag.service.ChatService;
import com.tacticalplay.rag.service.ExternalTacticalApiService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.File;
import java.util.Map;

@RestController
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);

    private final ChatService chatService;
    private final ExternalTacticalApiService externalTacticalApiService;
    private final ConfigurableApplicationContext applicationContext;

    public ChatController(
            ChatService chatService,
            ExternalTacticalApiService externalTacticalApiService,
            ConfigurableApplicationContext applicationContext
    ) {
        this.chatService = chatService;
        this.externalTacticalApiService = externalTacticalApiService;
        this.applicationContext = applicationContext;
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

    @PostMapping("/api/v1/tactical/sync-external")
    public ResponseEntity<Map<String, Object>> syncExternalKnowledge(
            @RequestParam(value = "force", defaultValue = "false") boolean force
    ) {
        return ResponseEntity.ok(externalTacticalApiService.syncExternalTacticalKnowledge(force));
    }

    @PostMapping("/api/v1/system/shutdown")
    public ResponseEntity<Map<String, String>> shutdownSystem() {
        Thread shutdownThread = new Thread(() -> {
            try {
                Thread.sleep(500);
                log.info("Iniciando apagado limpio del ecosistema TacticalPlay RAG...");

                // 1. Detener contenedor PostgreSQL en Docker
                try {
                    new ProcessBuilder("cmd.exe", "/c", "docker compose stop")
                            .directory(new File("C:\\Users\\Gamboa\\Tactical_Rag"))
                            .start()
                            .waitFor();
                } catch (Exception ex) {
                    log.warn("No se pudo detener Docker Compose: {}", ex.getMessage());
                }

                // 2. Cerrar ventana y proceso de Vite en el puerto 5173
                try {
                    new ProcessBuilder(
                            "cmd.exe",
                            "/c",
                            "taskkill /FI \"WINDOWTITLE eq TacticalPlay Frontend (5173)*\" /T /F >nul 2>&1 & "
                                    + "for /f \"tokens=5\" %a in ('netstat -aon ^| findstr \":5173\" ^| findstr \"LISTENING\"') do taskkill /F /PID %a >nul 2>&1"
                    ).start().waitFor();
                } catch (Exception ex) {
                    log.warn("No se pudo detener el servidor Frontend en 5173: {}", ex.getMessage());
                }

                // 3. Cerrar ventana de consola del Backend si fue abierta por el .bat y salir de Spring Boot
                int exitCode = SpringApplication.exit(applicationContext, () -> 0);
                System.exit(exitCode);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }, "tacticalplay-shutdown-thread");

        shutdownThread.setDaemon(false);
        shutdownThread.start();

        return ResponseEntity.ok(Map.of("status", "shutting_down"));
    }
}
