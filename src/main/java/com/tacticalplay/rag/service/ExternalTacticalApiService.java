package com.tacticalplay.rag.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tacticalplay.rag.model.DocumentChunk;
import com.tacticalplay.rag.repository.DocumentChunkRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ExternalTacticalApiService {

    private static final Logger log = LoggerFactory.getLogger(ExternalTacticalApiService.class);
    private static final String WIKIPEDIA_API_URL = "https://es.wikipedia.org/w/api.php";
    private static final String EXTERNAL_NAMESPACE = "api-externa";
    private static final int CHUNK_SIZE = 750;
    private static final int CHUNK_OVERLAP = 120;

    private record WikiTopic(
            String title,
            String modality,
            String modalityCode,
            String styleLabel
    ) {
    }

    private static final List<WikiTopic> TACTICAL_TOPICS = List.of(
            new WikiTopic("Fútbol sala", "Futsal", "futsal", "Rotación Dinámica"),
            new WikiTopic("Fútbol 7", "Fútbol 7", "futbol7", "Posesión & Juego de Posición"),
            new WikiTopic("Formación (fútbol)", "Fútbol 9", "futbol9", "Posesión & Juego de Posición"),
            new WikiTopic("Formación (fútbol)", "Fútbol 11", "futbol11", "Posesión & Juego de Posición"),
            new WikiTopic("Tiki-taka", "Fútbol 11", "futbol11", "Posesión & Juego de Posición"),
            new WikiTopic("Gegenpressing", "Fútbol 11", "futbol11", "Presión Alta (Gegenpressing)"),
            new WikiTopic("Catenaccio", "Fútbol 11", "futbol11", "Bloque Bajo & Contragolpe"),
            new WikiTopic("Contraataque", "Fútbol 7", "futbol7", "Juego Directo & Vertical"),
            new WikiTopic("Fútbol total", "Fútbol 9", "futbol9", "Rotación Dinámica")
    );

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final DocumentChunkRepository chunkRepository;
    private final EmbeddingService embeddingService;

    public ExternalTacticalApiService(
            ObjectMapper objectMapper,
            DocumentChunkRepository chunkRepository,
            EmbeddingService embeddingService
    ) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(10));

        this.restClient = RestClient.builder()
                .baseUrl(WIKIPEDIA_API_URL)
                .requestFactory(factory)
                .defaultHeader("User-Agent", "TacticalPlayRAG/1.0 (https://github.com/DanielGamboa-10/Tactical_Rag)")
                .build();
        this.objectMapper = objectMapper;
        this.chunkRepository = chunkRepository;
        this.embeddingService = embeddingService;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(2)
    public void autoSyncOnStartup() {
        Thread backgroundSync = new Thread(() -> {
            try {
                int existing = chunkRepository.countByNamespace(EXTERNAL_NAMESPACE);
                if (existing > 0) {
                    log.info("Base vectorial ya cuenta con {} fragmentos bajo namespace '{}'.", existing, EXTERNAL_NAMESPACE);
                    return;
                }
                log.info("Sincronizando conocimiento táctico inicial desde Wikipedia API (namespace='{}')...", EXTERNAL_NAMESPACE);
                Map<String, Object> result = syncExternalTacticalKnowledge(false);
                log.info("Sincronización Wikipedia finalizada: {}", result);
            } catch (Exception ex) {
                log.warn("No se pudo completar la sincronización inicial de Wikipedia: {}", ex.getMessage());
            }
        }, "wikipedia-tactical-sync");
        backgroundSync.setDaemon(true);
        backgroundSync.start();
    }

    public Map<String, Object> syncExternalTacticalKnowledge(boolean forceRefresh) {
        int existing = chunkRepository.countByNamespace(EXTERNAL_NAMESPACE);
        if (existing > 0 && !forceRefresh) {
            return Map.of(
                    "status", "already_synced",
                    "namespace", EXTERNAL_NAMESPACE,
                    "chunksInDatabase", existing,
                    "message", "Los artículos tácticos de Wikipedia ya están indexados en PostgreSQL."
            );
        }

        if (forceRefresh && existing > 0) {
            chunkRepository.deleteByNamespace(EXTERNAL_NAMESPACE);
        }

        List<DocumentChunk> chunksToSave = new ArrayList<>();
        List<String> syncedArticles = new ArrayList<>();
        int embeddedCount = 0;

        for (WikiTopic topic : TACTICAL_TOPICS) {
            try {
                String extract = fetchWikipediaExtract(topic.title());
                if (extract == null || extract.isBlank()) {
                    continue;
                }

                syncedArticles.add(topic.title() + " [" + topic.modality() + "]");
                List<String> rawChunks = splitIntoChunks(extract, CHUNK_SIZE, CHUNK_OVERLAP, 3);

                int sectionIndex = 1;
                for (String rawChunk : rawChunks) {
                    String enrichedChunk = String.format(
                            "[Modalidad: %s (%s) | Estilo: %s | Fuente: Wikipedia - %s] %s",
                            topic.modality(),
                            topic.modalityCode(),
                            topic.styleLabel(),
                            topic.title(),
                            rawChunk
                    );

                    String embeddingLiteral = null;
                    if (embeddingService.isConfigured()) {
                        try {
                            embeddingLiteral = embeddingService.embedToPgVectorLiteral(enrichedChunk);
                            embeddedCount++;
                        } catch (Exception ex) {
                            log.warn("No se pudo generar embedding para artículo '{}': {}", topic.title(), ex.getMessage());
                        }
                    }

                    chunksToSave.add(DocumentChunk.forInsert(
                            EXTERNAL_NAMESPACE,
                            topic.modality(),
                            "Wikipedia: " + topic.title(),
                            sectionIndex++,
                            enrichedChunk,
                            embeddingLiteral
                    ));
                }
            } catch (Exception ex) {
                log.warn("Error descargando artículo '{}' desde Wikipedia: {}", topic.title(), ex.getMessage());
            }
        }

        int saved = chunkRepository.saveChunks(chunksToSave, EXTERNAL_NAMESPACE);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("status", "synced");
        summary.put("namespace", EXTERNAL_NAMESPACE);
        summary.put("articlesProcessed", syncedArticles.size());
        summary.put("articles", syncedArticles);
        summary.put("chunksSaved", saved);
        summary.put("embeddingsGenerated", embeddedCount);
        return summary;
    }

    private String fetchWikipediaExtract(String title) throws Exception {
        String responseJson = restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .queryParam("action", "query")
                        .queryParam("prop", "extracts")
                        .queryParam("explaintext", "1")
                        .queryParam("redirects", "1")
                        .queryParam("format", "json")
                        .queryParam("titles", title)
                        .build())
                .retrieve()
                .body(String.class);

        JsonNode pagesNode = objectMapper.readTree(responseJson).path("query").path("pages");
        Iterator<JsonNode> elements = pagesNode.elements();
        if (elements.hasNext()) {
            JsonNode page = elements.next();
            return page.path("extract").asText("");
        }
        return "";
    }

    private List<String> splitIntoChunks(String text, int chunkSize, int overlap, int maxChunksPerArticle) {
        String cleaned = text.trim().replaceAll("\\s+", " ");
        if (cleaned.isEmpty()) {
            return List.of();
        }
        if (cleaned.length() <= chunkSize) {
            return List.of(cleaned);
        }

        List<String> chunks = new ArrayList<>();
        int start = 0;
        int len = cleaned.length();

        while (start < len && chunks.size() < maxChunksPerArticle) {
            int end = Math.min(start + chunkSize, len);
            if (end < len) {
                int lastSpace = cleaned.lastIndexOf(' ', end);
                if (lastSpace > start + (chunkSize / 2)) {
                    end = lastSpace;
                }
            }
            String chunk = cleaned.substring(start, end).trim();
            if (!chunk.isEmpty()) {
                chunks.add(chunk);
            }
            if (end >= len) {
                break;
            }
            start = Math.max(0, end - overlap);
        }
        return chunks;
    }
}
