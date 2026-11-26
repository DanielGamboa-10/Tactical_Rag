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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Servicio de embeddings enchufable con soporte para OpenAI Embeddings (MVP),
 * Google Gemini y proveedor local (Ollama / servidor compatible).
 */
@Service
public class EmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);
    private static final String GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

    private final RestClient geminiClient;
    private final RestClient openAiClient;
    private final RestClient localClient;
    private final ObjectMapper objectMapper;

    private final String configuredProvider;
    private final int dimensions;

    private final String openAiApiKey;
    private final String openAiEmbeddingModel;

    private final String geminiApiKey;
    private final String geminiEmbeddingModel;

    private final String localBaseUrl;
    private final String localEmbeddingModel;
    private final boolean localExplicitlyConfigured;

    public EmbeddingService(
            ObjectMapper objectMapper,
            @Value("${ai.embedding.provider:auto}") String configuredProvider,
            @Value("${ai.embedding.dimensions:768}") int dimensions,
            @Value("${ai.openai.api-key:}") String openAiApiKey,
            @Value("${ai.openai.base-url:https://api.openai.com/v1}") String openAiBaseUrl,
            @Value("${ai.openai.embedding-model:text-embedding-3-small}") String openAiEmbeddingModel,
            @Value("${ai.gemini.api-key:}") String geminiApiKey,
            @Value("${ai.gemini.embedding-model:gemini-embedding-001}") String geminiEmbeddingModel,
            @Value("${ai.local.base-url:http://localhost:11434}") String localBaseUrl,
            @Value("${ai.local.embedding-model:nomic-embed-text}") String localEmbeddingModel
    ) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(6));
        requestFactory.setReadTimeout(Duration.ofSeconds(20));

        this.objectMapper = objectMapper;
        this.configuredProvider = configuredProvider != null ? configuredProvider.trim().toLowerCase(Locale.ROOT) : "auto";
        this.dimensions = dimensions;

        this.openAiApiKey = openAiApiKey != null ? openAiApiKey.trim() : "";
        this.openAiEmbeddingModel = openAiEmbeddingModel;

        this.geminiApiKey = geminiApiKey != null ? geminiApiKey.trim() : "";
        this.geminiEmbeddingModel = geminiEmbeddingModel;

        this.localBaseUrl = localBaseUrl != null ? localBaseUrl.trim() : "http://localhost:11434";
        this.localEmbeddingModel = localEmbeddingModel;
        this.localExplicitlyConfigured = "local".equals(this.configuredProvider);

        this.geminiClient = RestClient.builder()
                .baseUrl(GEMINI_BASE_URL)
                .requestFactory(requestFactory)
                .build();
        this.openAiClient = RestClient.builder()
                .baseUrl(openAiBaseUrl != null && !openAiBaseUrl.isBlank() ? openAiBaseUrl.trim() : "https://api.openai.com/v1")
                .requestFactory(requestFactory)
                .build();
        this.localClient = RestClient.builder()
                .baseUrl(this.localBaseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    public String getActiveProviderName() {
        return switch (configuredProvider) {
            case "openai" -> !openAiApiKey.isBlank() ? "openai" : (!geminiApiKey.isBlank() ? "gemini" : "none");
            case "gemini" -> !geminiApiKey.isBlank() ? "gemini" : (!openAiApiKey.isBlank() ? "openai" : "none");
            case "local" -> "local";
            default -> {
                if (!openAiApiKey.isBlank()) {
                    yield "openai";
                }
                if (!geminiApiKey.isBlank()) {
                    yield "gemini";
                }
                yield localExplicitlyConfigured ? "local" : "none";
            }
        };
    }

    public String getActiveModelName() {
        return switch (getActiveProviderName()) {
            case "openai" -> openAiEmbeddingModel;
            case "gemini" -> geminiEmbeddingModel;
            case "local" -> localEmbeddingModel;
            default -> "unconfigured";
        };
    }

    public boolean isConfigured() {
        return !"none".equals(getActiveProviderName());
    }

    public float[] generateEmbedding(String text) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("El texto para generar embedding no puede estar vacío.");
        }

        String provider = getActiveProviderName();
        return switch (provider) {
            case "openai" -> generateOpenAiEmbedding(text);
            case "gemini" -> generateGeminiEmbedding(text);
            case "local" -> generateLocalOllamaEmbedding(text);
            default -> throw new IllegalStateException(
                    "No hay proveedor de embeddings configurado (ni OPENAI_API_KEY, ni GEMINI_API_KEY, ni AI_EMBEDDING_PROVIDER=local)."
            );
        };
    }

    private float[] generateOpenAiEmbedding(String text) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", openAiEmbeddingModel);
        body.put("input", text);
        body.put("dimensions", dimensions);

        try {
            String rawResponse = openAiClient.post()
                    .uri("/embeddings")
                    .header("Authorization", "Bearer " + openAiApiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);

            JsonNode vectorNode = objectMapper.readTree(rawResponse)
                    .path("data")
                    .path(0)
                    .path("embedding");

            if (!vectorNode.isArray() || vectorNode.isEmpty()) {
                throw new IllegalStateException("La respuesta de OpenAI Embeddings no contiene un vector válido.");
            }
            return toFixedDimensions(vectorNode);
        } catch (RestClientResponseException ex) {
            log.error("Error HTTP de OpenAI Embeddings ({}): {}", ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new IllegalStateException("Error al consultar OpenAI Embeddings (" + ex.getStatusCode() + ").", ex);
        } catch (Exception ex) {
            throw new IllegalStateException("No se pudo generar el vector de embedding con OpenAI: " + ex.getMessage(), ex);
        }
    }

    private float[] generateGeminiEmbedding(String text) {
        Map<String, Object> requestBody = Map.of(
                "model", "models/" + geminiEmbeddingModel,
                "content", Map.of(
                        "parts", List.of(Map.of("text", text))
                ),
                "outputDimensionality", dimensions
        );

        try {
            String rawResponse = geminiClient.post()
                    .uri(uriBuilder -> uriBuilder
                            .path("/models/{model}:embedContent")
                            .queryParam("key", geminiApiKey)
                            .build(geminiEmbeddingModel))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .body(String.class);

            JsonNode valuesNode = objectMapper.readTree(rawResponse).path("embedding").path("values");
            if (!valuesNode.isArray() || valuesNode.isEmpty()) {
                throw new IllegalStateException("La respuesta de Gemini Embeddings no contiene un vector válido.");
            }
            return toFixedDimensions(valuesNode);
        } catch (RestClientResponseException ex) {
            log.error("Error HTTP de Gemini Embeddings ({}): {}", ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new IllegalStateException(
                    "Error al consultar Gemini Embeddings (" + ex.getStatusCode() + "): Verifica tu GEMINI_API_KEY o cuota.",
                    ex
            );
        } catch (Exception ex) {
            log.error("Fallo al generar embedding con Gemini: {}", ex.getMessage());
            throw new IllegalStateException("No se pudo generar el vector de embedding con Gemini: " + ex.getMessage(), ex);
        }
    }

    private float[] generateLocalOllamaEmbedding(String text) {
        Map<String, Object> body = Map.of(
                "model", localEmbeddingModel,
                "prompt", text
        );
        try {
            String rawResponse = localClient.post()
                    .uri("/api/embeddings")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);

            JsonNode vectorNode = objectMapper.readTree(rawResponse).path("embedding");
            if (!vectorNode.isArray() || vectorNode.isEmpty()) {
                throw new IllegalStateException("El proveedor local de embeddings (" + localBaseUrl + ") no devolvió un vector.");
            }
            return toFixedDimensions(vectorNode);
        } catch (Exception ex) {
            log.error("Fallo al consultar proveedor local de embeddings ({}): {}", localBaseUrl, ex.getMessage());
            throw new IllegalStateException("Error con el proveedor local de embeddings: " + ex.getMessage(), ex);
        }
    }

    private float[] toFixedDimensions(JsonNode valuesNode) {
        float[] vector = new float[dimensions];
        int count = Math.min(valuesNode.size(), dimensions);
        double normSq = 0.0;
        for (int i = 0; i < count; i++) {
            float val = (float) valuesNode.get(i).asDouble();
            vector[i] = val;
            normSq += val * val;
        }
        // Si el modelo local tuviera > dimensions o < dimensions, normalizar L2 asegura estabilidad de similitud coseno
        if (valuesNode.size() != dimensions && normSq > 0.0) {
            double norm = Math.sqrt(normSq);
            for (int i = 0; i < dimensions; i++) {
                vector[i] = (float) (vector[i] / norm);
            }
        }
        return vector;
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
