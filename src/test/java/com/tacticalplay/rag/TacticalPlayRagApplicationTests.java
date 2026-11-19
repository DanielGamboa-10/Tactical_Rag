package com.tacticalplay.rag;

import com.tacticalplay.rag.dto.ChatRequest;
import com.tacticalplay.rag.dto.ChatResponse;
import com.tacticalplay.rag.service.ChatService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

@SpringBootTest
class TacticalPlayRagApplicationTests {

    @Autowired
    private ChatService chatService;

    @Test
    void contextLoadsAndGeneratesTacticalResponse() {
        assertNotNull(chatService);
        ChatRequest request = new ChatRequest("¿Cómo organizar la salida de balón?", "Futsal");
        ChatResponse response = chatService.generateTacticalResponse(request);

        assertNotNull(response);
        assertEquals("Futsal", response.modality());
        assertNotNull(response.reply());
        assertFalse(response.sources().isEmpty());
    }
}
