package com.tacticalplay.rag.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class EmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);
    private static final String GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String apiKey;
    private final String embeddingModel;
    private final int dimensions;

    public EmbeddingService(
            ObjectMapper objectMapper,
            @Value("${ai.gemini.api-key:}") String apiKey,
            @Value("${ai.gemini.embedding-model:gemini-embedding-001}") String embeddingModel,
            @Value("${ai.embedding.dimensions:768}") int dimensions
    ) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(5));
        requestFactory.setReadTimeout(Duration.ofSeconds(15));

        this.restClient = RestClient.builder()
                .baseUrl(GEMINI_BASE_URL)
                .requestFactory(requestFactory)
                .build();
        this.objectMapper = objectMapper;
        this.apiKey = apiKey != null ? apiKey.trim() : "";
        this.embeddingModel = embeddingModel;
        this.dimensions = dimensions;
    }

    public boolean isConfigured() {
        return !apiKey.isBlank();
    }

    public float[] generateEmbedding(String text) {
        if (!isConfigured()) {
            throw new IllegalStateException(
                    "GEMINI_API_KEY no está configurada. Define la variable de entorno GEMINI_API_KEY antes de iniciar el servidor."
            );
        }
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("El texto para generar embedding no puede estar vacío.");
        }

        Map<String, Object> requestBody = Map.of(
                "model", "models/" + embeddingModel,
                "content", Map.of(
                        "parts", List.of(Map.of("text", text))
                ),
                "outputDimensionality", dimensions
        );

        try {
            String rawResponse = restClient.post()
                    .uri(uriBuilder -> uriBuilder
                            .path("/models/{model}:embedContent")
                            .queryParam("key", apiKey)
                            .build(embeddingModel))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .body(String.class);

            JsonNode root = objectMapper.readTree(rawResponse);
            JsonNode valuesNode = root.path("embedding").path("values");

            if (!valuesNode.isArray() || valuesNode.isEmpty()) {
                throw new IllegalStateException("La respuesta de Gemini Embeddings no contiene un vector válido.");
            }

            float[] vector = new float[dimensions];
            int count = Math.min(valuesNode.size(), dimensions);
            for (int i = 0; i < count; i++) {
                vector[i] = (float) valuesNode.get(i).asDouble();
            }
            return vector;
        } catch (RestClientResponseException ex) {
            log.error("Error HTTP de Gemini Embeddings ({}): {}", ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new IllegalStateException(
                    "Error al consultar Gemini Embeddings (" + ex.getStatusCode() + "): Verifica tu GEMINI_API_KEY o cuota disponible.",
                    ex
            );
        } catch (Exception ex) {
            log.error("Fallo al generar embedding con Gemini: {}", ex.getMessage());
            throw new IllegalStateException("No se pudo generar el vector de embedding: " + ex.getMessage(), ex);
        }
    }

    public String embedToPgVectorLiteral(String text) {
        float[] vector = generateEmbedding(text);
        return toPgVectorLiteral(vector);
    }

    public String toPgVectorLiteral(float[] vector) {
        if (vector == null || vector.length == 0) {
            return null;
        }
        StringBuilder sb = new StringBuilder(vector.length * 10);
        sb.append('[');
        for (int i = 0; i < vector.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(String.format(Locale.US, "%.6f", vector[i]));
        }
        sb.append(']');
        return sb.toString();
    }
}
