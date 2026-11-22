package com.tacticalplay.rag.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tacticalplay.rag.dto.ChatRequest;
import com.tacticalplay.rag.dto.ChatResponse;
import com.tacticalplay.rag.model.DocumentChunk;
import com.tacticalplay.rag.repository.DocumentChunkRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private static final String GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    private static final int TOP_K_CHUNKS = 4;
    private static final Pattern FORMATION_PATTERN = Pattern.compile("\\b(1-\\d(?:-\\d){1,3}|5-0)\\b");

    private record TacticalProfile(String formation, String synergy, List<String> defaultSources) {
    }

    private static final Map<String, TacticalProfile> PROFILES = Map.of(
            "Futsal", new TacticalProfile(
                    "1-3-1 (Rombo)",
                    "En Futsal (5v5) la clave es mover la pelota rápido y rotar puestos entre el cierre, las alas y el pívot. "
                            + "Con un 1-3-1 tienes siempre al pívot arriba para aguantar el balón de espaldas y descargar "
                            + "de cara hacia las alas que llegan con velocidad.",
                    List.of("Manual_Tactico_Futsal_FIFA.pdf (Pág. 14)", "Wikipedia: Fútbol sala (Pág. 1)")
            ),
            "Fútbol 7", new TacticalProfile(
                    "1-2-3-1",
                    "En Fútbol 7 es fundamental abrir bien la cancha con los jugadores de banda y que el mediocentro sostenga el medio. "
                            + "Con un 1-2-3-1 defiendes firme con dos centrales, controlas el centro del campo y armas paredes "
                            + "por afuera para dejar mano a mano al delantero.",
                    List.of("Guia_Tactica_Futbol7_Base.pdf (Pág. 22)", "Wikipedia: Fútbol 7 (Pág. 1)")
            ),
            "Fútbol 9", new TacticalProfile(
                    "1-3-3-2",
                    "En Fútbol 9 ya necesitas buen orden entre líneas. Con un 1-3-3-2 cierras bien atrás con tres defensas, "
                            + "manejas la mitad con un volante central y dos interiores, y arriba juegas con dos puntas "
                            + "para incomodar todo el partido a los centrales rivales.",
                    List.of("Metodologia_Puente_Futbol9.pdf (Pág. 19)", "Wikipedia: Formación (fútbol) (Pág. 1)")
            ),
            "Fútbol 11", new TacticalProfile(
                    "1-4-3-3",
                    "En Fútbol 11 lo principal es estar bien parados en ancho y presionar apenas se pierde la pelota. "
                            + "Un 1-4-3-3 te da salida clara desde el fondo con el volante central, sociedades por banda "
                            + "entre lateral, interior y extremo, y tres jugadores listos para apretar arriba.",
                    List.of("Teoria_Tactica_Moderna_F11.pdf (Pág. 45)", "Wikipedia: Formación (fútbol) (Pág. 1)")
            )
    );

    private final DocumentChunkRepository chunkRepository;
    private final EmbeddingService embeddingService;
    private final TopPlayersApiService topPlayersApiService;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final String apiKey;
    private final String chatModel;

    public ChatService(
            DocumentChunkRepository chunkRepository,
            EmbeddingService embeddingService,
            TopPlayersApiService topPlayersApiService,
            ObjectMapper objectMapper,
            @Value("${ai.gemini.api-key:}") String apiKey,
            @Value("${ai.gemini.chat-model:gemini-3.1-flash-lite}") String chatModel
    ) {
        this.chunkRepository = chunkRepository;
        this.embeddingService = embeddingService;
        this.topPlayersApiService = topPlayersApiService;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(5));
        requestFactory.setReadTimeout(Duration.ofSeconds(15));

        this.restClient = RestClient.builder()
                .baseUrl(GEMINI_BASE_URL)
                .requestFactory(requestFactory)
                .build();
        this.apiKey = apiKey != null ? apiKey.trim() : "";
        this.chatModel = chatModel;
    }

    public ChatResponse generateTacticalResponse(ChatRequest request) {
        TacticalProfile profile = PROFILES.getOrDefault(request.modality(), PROFILES.get("Fútbol 11"));
        String requestedFormation = (request.formation() != null && !request.formation().isBlank())
                ? request.formation().trim()
                : profile.formation();
        String requestedStyle = (request.playStyle() != null && !request.playStyle().isBlank())
                ? request.playStyle().trim()
                : "Posesión & Juego de Posición";

        // 1. Recuperación Semántica Vectorial (Top 4) enriquecida con formación y estilo
        String queryForSearch = request.message() + " " + requestedFormation + " " + requestedStyle;
        List<DocumentChunk> relevantChunks = retrieveRelevantChunks(request.modality(), queryForSearch);

        Set<String> uniqueSources = new LinkedHashSet<>();
        for (DocumentChunk chunk : relevantChunks) {
            uniqueSources.add(chunk.formattedSource());
        }
        if (uniqueSources.isEmpty()) {
            uniqueSources.addAll(profile.defaultSources());
        }

        // 2. Si GEMINI_API_KEY está configurada, generar análisis táctico con Gemini LLM
        if (embeddingService.isConfigured()) {
            try {
                String llmText = callGeminiChat(
                        request.modality(),
                        requestedFormation,
                        requestedStyle,
                        request.message(),
                        relevantChunks
                );
                String suggestedFormation = (request.formation() != null && !request.formation().isBlank())
                        ? requestedFormation
                        : extractSuggestedFormation(llmText, profile.formation());

                StringBuilder finalReply = new StringBuilder(llmText.trim());
                if (!llmText.contains("no contiene información relacionada con fútbol o táctica deportiva")) {
                    appendRetrievedChunksSection(finalReply, relevantChunks);
                }

                return ChatResponse.of(
                        finalReply.toString(),
                        request.modality(),
                        suggestedFormation,
                        new ArrayList<>(uniqueSources)
                );
            } catch (Exception ex) {
                log.warn("Fallo al invocar Gemini Chat API, aplicando respuesta resiliente: {}", ex.getMessage());
                return buildResilientFallbackResponse(
                        request,
                        profile,
                        requestedFormation,
                        requestedStyle,
                        relevantChunks,
                        uniqueSources,
                        "No se pudo conectar con Gemini API (" + ex.getMessage() + "). Se muestra análisis táctico local con los fragmentos recuperados."
                );
            }
        }

        // 3. Respuesta resiliente cuando GEMINI_API_KEY está vacía
        return buildResilientFallbackResponse(
                request,
                profile,
                requestedFormation,
                requestedStyle,
                relevantChunks,
                uniqueSources,
                "GEMINI_API_KEY no está configurada en .env."
        );
    }

    private List<DocumentChunk> retrieveRelevantChunks(String modality, String userMessage) {
        List<DocumentChunk> chunks = new ArrayList<>();
        if (embeddingService.isConfigured()) {
            try {
                String queryVectorLiteral = embeddingService.embedToPgVectorLiteral(userMessage);
                chunks = chunkRepository.findTopSimilarChunks(modality, queryVectorLiteral, TOP_K_CHUNKS);
            } catch (Exception ex) {
                log.warn("Búsqueda vectorial no disponible ({}), usando búsqueda contextual de respaldo.", ex.getMessage());
            }
        }

        if (chunks.isEmpty()) {
            try {
                chunks = chunkRepository.findContextualChunks(modality, userMessage, TOP_K_CHUNKS);
            } catch (Exception ignored) {
            }
        }
        return chunks;
    }

    private String callGeminiChat(
            String modality,
            String formation,
            String playStyle,
            String userMessage,
            List<DocumentChunk> chunks
    ) throws Exception {
        String contextBlock;
        if (chunks.isEmpty()) {
            contextBlock = "No hay fragmentos de PDF subidos para esta modalidad todavía. Usa tu conocimiento táctico experto.";
        } else {
            contextBlock = chunks.stream()
                    .map(c -> String.format("[%s]: %s", c.formattedSource(), c.chunkText()))
                    .collect(Collectors.joining("\n\n"));
        }

        String squadContext = "";
        try {
            squadContext = topPlayersApiService.buildSquadContextForChatbot(modality);
        } catch (Exception ignored) {
        }

        String systemPrompt = String.format("""
                Eres un entrenador de fútbol experimentado, cercano, claro y directo de TacticalPlay RAG, especialista en %s.
                Sigue estas reglas obligatorias al pie de la letra:
                1. LENGUAJE SENCILLO Y DE CANCHA: Habla con palabras cotidianas de fútbol que cualquier jugador o entrenador entienda al instante. Está TERMINANTEMENTE PROHIBIDO usar jerga académica, empresarial o palabras rebuscadas como "traslación de competencias", "ocupación racional", "coberturas compensatorias", "sinergia interdepartamental" o tecnicismos confusos.
                2. REGLA ESTRICTA PARA PDFs QUE NO SON DE FÚTBOL: Revisa primero de qué tratan los fragmentos del PDF recuperados abajo. Si hay fragmentos de un PDF subido por el usuario que tratan de otro tema que NO sea fútbol, futsal, táctica, entrenamientos, jugadores o deporte (por ejemplo: currículums, facturas, programación, leyes, medicina, tareas escolares, etc.), PROHIBIDO inventar metáforas, analogías o mezclar ese contenido con fútbol. En ese caso responde ÚNICAMENTE y de forma textual:
                "El documento indexado ([nombre del archivo]) no contiene información relacionada con fútbol o táctica deportiva. Por favor, sube un manual táctico, guía de entrenamiento o análisis de partido en PDF para ayudarte."
                3. CONCISO Y PRÁCTICO: Si el documento sí es de fútbol (o si son artículos tácticos de Wikipedia / consultas de cancha de %s), ve directo al grano con máximo 3 o 4 puntos cortos y prácticos enfocados en la formación %s con estilo "%s".
                4. PLANTILLA PROPIA DEL USUARIO: Si abajo aparece la lista de jugadores de la "PLANTILLA PROPIA DEL ENTRENADOR" y el usuario pregunta por su equipo, alineación, cambios o jugadores, nómbralos por su nombre y dorsal real, menciona a qué crack del Top 100 se parecen y con qué compañeros hacen mejor sociedad.
                5. CITAS Y FORMACIÓN: Cuando uses datos de un documento o artículo válido de fútbol, menciona la fuente entre corchetes (ej. [Manual.pdf (Pág. 2)] o [Wikipedia: Tiki-taka (Pág. 1)]) y explica cómo parar el esquema %s con el estilo "%s".
                """,
                modality, modality, formation, playStyle, formation, playStyle
        );

        String userPrompt = String.format("""
                MODALIDAD SELECCIONADA: %s
                FORMACIÓN ELEGIDA: %s
                ESTILO DE JUEGO ELEGIDO: %s
                %s
                FRAGMENTOS RECUPERADOS DE LA BASE VECTORIAL (pgvector):
                %s

                CONSULTA DEL ENTRENADOR:
                %s
                """,
                modality, formation, playStyle, squadContext, contextBlock, userMessage
        );

        Map<String, Object> payload = Map.of(
                "system_instruction", Map.of(
                        "parts", List.of(Map.of("text", systemPrompt))
                ),
                "contents", List.of(
                        Map.of(
                                "role", "user",
                                "parts", List.of(Map.of("text", userPrompt))
                        )
                ),
                "generationConfig", Map.of(
                        "temperature", 0.35,
                        "maxOutputTokens", 900
                )
        );

        String rawResponse = restClient.post()
                .uri(uriBuilder -> uriBuilder
                        .path("/models/{model}:generateContent")
                        .queryParam("key", apiKey)
                        .build(chatModel))
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body(String.class);

        JsonNode root = objectMapper.readTree(rawResponse);
        JsonNode partsNode = root.path("candidates").path(0).path("content").path("parts");
        if (partsNode.isArray()) {
            for (JsonNode part : partsNode) {
                if (!part.path("thought").asBoolean(false) && !part.path("text").asText().isBlank()) {
                    return part.path("text").asText();
                }
            }
            String fallbackText = partsNode.path(0).path("text").asText();
            if (!fallbackText.isBlank()) {
                return fallbackText;
            }
        }
        throw new IllegalStateException("Gemini no devolvió texto en candidates[0].content.parts");
    }

    private ChatResponse buildResilientFallbackResponse(
            ChatRequest request,
            TacticalProfile profile,
            String formation,
            String playStyle,
            List<DocumentChunk> relevantChunks,
            Set<String> uniqueSources,
            String notice
    ) {
        StringBuilder replyBuilder = new StringBuilder();
        replyBuilder.append(String.format(
                "[Análisis Táctico - %s · %s · %s] Respecto a tu consulta ('%s'): %s Con el esquema %s y estilo %s "
                        + "buscamos líneas juntas y pases claros entre líneas.\n\n"
                        + "ℹ️ Aviso: %s",
                request.modality(),
                formation,
                playStyle,
                request.message().trim(),
                profile.synergy(),
                formation,
                playStyle,
                notice
        ));

        appendRetrievedChunksSection(replyBuilder, relevantChunks);

        return ChatResponse.of(
                replyBuilder.toString(),
                request.modality(),
                formation,
                new ArrayList<>(uniqueSources)
        );
    }

    private void appendRetrievedChunksSection(StringBuilder replyBuilder, List<DocumentChunk> relevantChunks) {
        if (!relevantChunks.isEmpty()) {
            String contextSummary = relevantChunks.stream()
                    .map(chunk -> String.format("• [%s]: \"%s\"", chunk.formattedSource(), truncateSnippet(chunk.chunkText(), 240)))
                    .collect(Collectors.joining("\n"));

            replyBuilder.append("\n\nContexto documental recuperado de tus PDFs:\n")
                    .append(contextSummary);
        }
    }

    private String extractSuggestedFormation(String text, String defaultFormation) {
        if (text != null) {
            Matcher matcher = FORMATION_PATTERN.matcher(text);
            if (matcher.find()) {
                return matcher.group(1);
            }
        }
        return defaultFormation;
    }

    private String truncateSnippet(String text, int maxLength) {
        if (text == null || text.length() <= maxLength) {
            return text != null ? text : "";
        }
        return text.substring(0, maxLength).trim() + "...";
    }
}
