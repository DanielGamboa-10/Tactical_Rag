package com.tacticalplay.rag.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tacticalplay.rag.dto.ChatRequest;
import com.tacticalplay.rag.dto.ChatResponse;
import com.tacticalplay.rag.model.ChatSession;
import com.tacticalplay.rag.model.DocumentChunk;
import com.tacticalplay.rag.repository.ChatHistoryRepository;
import com.tacticalplay.rag.repository.DemoQuotaRepository;
import com.tacticalplay.rag.repository.DocumentChunkRepository;
import com.tacticalplay.rag.repository.UserRepository;
import com.tacticalplay.rag.security.AuthPrincipal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private static final String GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    private static final int TOP_K_CHUNKS = 5;
    private static final Pattern FORMATION_PATTERN = Pattern.compile("\\b(1-\\d(?:-\\d){1,3}|5-0)\\b");
    private static final Pattern NUMERIC_FORMATION_TOKEN_PATTERN = Pattern.compile("(?<![\\d-])((?:\\d+-){1,4}\\d+)(?![\\d-])");

    private record TacticalProfile(String formation, String synergy) {
    }

    private record FormationSpec(String code, List<String> numericTokens, List<String> aliases, String tacticalAdvice) {
    }

    private record FormationResolution(
            String effectiveFormation,
            String appliedSystem,
            String recommendedSystem,
            String previousFormation,
            boolean formationSwitched
    ) {
    }

    private static final Map<String, List<FormationSpec>> MODALITY_FORMATIONS = Map.of(
            "Futsal", List.of(
                    new FormationSpec(
                            "1-1-2-1 (Pirámide)",
                            List.of("1-2-1", "1-1-2-1"),
                            List.of("piramide"),
                            "En 1-2-1 (1-1-2-1 Pirámide), un cierre da equilibrio atrás, las dos alas cierran líneas de pase por dentro y saltan a presión tras pérdida, y el pívot estira la defensa fijando al cierre rival para descargas o segundo palo."
                    ),
                    new FormationSpec(
                            "1-2-1-1 (Y Invertida)",
                            List.of("1-2-1-1", "2-1-1"),
                            List.of("y invertida"),
                            "En 2-1-1 (Y Invertida), el doble cierre garantiza superioridad 2v1 ante presión alta, un conector entre líneas recibe al pie y el pívot profundo amenaza siempre con pared vertical."
                    ),
                    new FormationSpec(
                            "1-4-0 (Sistema Plano)",
                            List.of("4-0", "1-4-0"),
                            List.of("sistema plano", "cuatro cero"),
                            "En 4-0 (Sistema Plano), los cuatro universales parten en línea sin pívot fijo, ejecutando rotaciones circulares y cortes continuos a la espalda para desordenar marcas individuales."
                    ),
                    new FormationSpec(
                            "1-2-2 (Cuadrado)",
                            List.of("2-2", "1-2-2"),
                            List.of("cuadrado"),
                            "En 2-2 (Cuadrado), el equipo defiende y ataca en dos líneas de dos: salidas limpias en paralelo o diagonal y ayudas cortas entre bandas para proteger el carril central."
                    ),
                    new FormationSpec(
                            "5-0 (Portero-Jugador)",
                            List.of("5-0"),
                            List.of("portero-jugador", "portero jugador", "cinco cero", "5v4", "5 vs 4"),
                            "En 5-0 (Portero-Jugador), el quinto atacante se suma en cancha contraria para generar 5v4, mover el rombo defensivo con circulación rápida y finalizar al segundo palo o de tiro exterior."
                    ),
                    new FormationSpec(
                            "1-3-1 (Presión Alta)",
                            List.of("3-1", "1-3-1"),
                            List.of("3-1 presion alta", "1-3-1 presion alta"),
                            "En 3-1 Presión Alta, el pívot orienta la salida rival hacia una banda y las alas saltan en anticipación mientras el cierre vigila los balones largos a la espalda."
                    ),
                    new FormationSpec(
                            "1-3-1 (Rombo)",
                            List.of("3-1", "1-3-1"),
                            List.of("3-1 rombo", "1-3-1 rombo", "rombo"),
                            "En 3-1 (Rombo), el cierre sostiene la base, las dos alas abren toda la pista de 40x20m para 1v1 o diagonales al segundo palo y el pívot fija de espaldas para descargar de cara."
                    )
            ),
            "Fútbol 7", List.of(
                    new FormationSpec("1-2-3-1", List.of("2-3-1", "1-2-3-1"), List.of(),
                            "En 2-3-1, dos centrales aseguran la salida, los tres medios cubren ancho y carril interior, y el punta fija para descargas y rupturas."),
                    new FormationSpec("1-3-2-1 (Árbol)", List.of("3-2-1", "1-3-2-1"), List.of("arbol"),
                            "En 3-2-1 (Árbol), tres atrás dan solidez y salida por fuera, dos interiores sostienen la circulación y el delantero ataca espacios tras recuperación."),
                    new FormationSpec("1-2-1-2-1 (Rombo)", List.of("2-1-2-1", "1-2-1-2-1"), List.of("rombo"),
                            "En 2-1-2-1 (Rombo), el mediocentro equilibra por delante de dos centrales y permite triangular por dentro con dos extremos cerrando hacia el punta."),
                    new FormationSpec("1-3-1-2", List.of("3-1-2", "1-3-1-2"), List.of(),
                            "En 3-1-2, la línea de tres sostiene el fondo mientras el pivote enlaza con dos puntas móviles que atacan ambos intervalos."),
                    new FormationSpec("1-2-2-2", List.of("2-2-2", "1-2-2-2"), List.of("cuadrado"),
                            "En 2-2-2, la estructura escalonada de pares facilita paredes por banda, coberturas rápidas y dos referencias ofensivas constantes."),
                    new FormationSpec("1-3-3 (Ofensivo)", List.of("3-3", "1-3-3"), List.of("3-3 ofensivo"),
                            "En 3-3, el equipo prioriza presión alta inmediata y tres atacantes agresivos listos para finalizar o atacar espalda rival."),
                    new FormationSpec("1-4-1-1 (Bloque Bajo)", List.of("4-1-1", "1-4-1-1"), List.of(),
                            "En 4-1-1, bloque compacto de cuatro defensas, pivote tapón y un delantero veloz para lanzar transiciones directas.")
            ),
            "Fútbol 9", List.of(
                    new FormationSpec("1-3-3-2", List.of("3-3-2", "1-3-3-2"), List.of(),
                            "En 3-3-2, tres centrales equilibran la base, el trivote interior controla el ritmo y dos puntas fijan a los centrales rivales."),
                    new FormationSpec("1-4-3-1", List.of("4-3-1", "1-4-3-1"), List.of(),
                            "En 4-3-1, los laterales ganan altura con cobertura del pivote y los tres volantes habilitan al delantero único entre líneas."),
                    new FormationSpec("1-3-4-1", List.of("3-4-1", "1-3-4-1"), List.of(),
                            "En 3-4-1, el rombo o línea de cuatro en medio domina la posesión y busca al delantero de referencia con apoyos cercanos."),
                    new FormationSpec("1-3-2-3", List.of("3-2-3", "1-3-2-3"), List.of(),
                            "En 3-2-3, doble pivote asociativo y tridente ofensivo abierto para generar 1v1 en bandas."),
                    new FormationSpec("1-4-2-2", List.of("4-2-2", "1-4-2-2"), List.of(),
                            "En 4-2-2, doble contención con dos mediapuntas interiores creando superioridad en zona 14 y dos delanteros."),
                    new FormationSpec("1-3-5-0 (Falso 9)", List.of("3-5-0", "1-3-5-0"), List.of("falso 9", "falso nueve"),
                            "En 3-5-0 (Falso 9), la densidad de cinco mediocampistas atrae a los centrales para romper desde segunda línea."),
                    new FormationSpec("1-4-1-3", List.of("4-1-3", "1-4-1-3"), List.of(),
                            "En 4-1-3, salida ordenada con un pivote posicional y tres atacantes agresivos en último tercio.")
            ),
            "Fútbol 11", List.of(
                    new FormationSpec("1-4-3-3", List.of("4-3-3", "1-4-3-3"), List.of(),
                            "En 4-3-3, salida limpia desde el pivote, triángulos en banda (lateral-interior-extremo) y presión alta coordinada con los tres delanteros."),
                    new FormationSpec("1-4-2-3-1", List.of("4-2-3-1", "1-4-2-3-1"), List.of(),
                            "En 4-2-3-1, el doble pivote da equilibrio en transiciones, el mediapunta juega a espalda de los medios rivales y los extremos atacan por fuera o dentro."),
                    new FormationSpec("1-3-5-2", List.of("3-5-2", "1-3-5-2"), List.of(),
                            "En 3-5-2, tres centrales facilitan salida 3+1, los carrileros aportan toda la amplitud y los dos puntas alternan apoyos y rupturas."),
                    new FormationSpec("1-4-4-2 (Rombo)", List.of("4-4-2", "1-4-4-2"), List.of("4-4-2 rombo", "4-4-2 en rombo", "4-4-2 diamante", "rombo"),
                            "En 4-4-2 (Rombo), el trivote cerrado más enganche domina el carril central mientras los laterales doblan por afuera y los dos puntas atacan intervalos."),
                    new FormationSpec("1-4-4-2 (Clásico)", List.of("4-4-2", "1-4-4-2"), List.of("4-4-2 clasico"),
                            "En 4-4-2 (Clásico), dos bloques compactos de cuatro cierran pasillos interiores y permiten juego directo o transiciones rápidas con doble punta."),
                    new FormationSpec("1-3-4-3", List.of("3-4-3", "1-3-4-3"), List.of(),
                            "En 3-4-3, amplitud con carrileros altos, doble pivote compacto y tres delanteros atacando pasillos interiores."),
                    new FormationSpec("1-4-1-4-1", List.of("4-1-4-1", "1-4-1-4-1"), List.of(),
                            "En 4-1-4-1, el pivote único protege entre líneas y los cuatro volantes escalonan ayudas para recuperar y lanzar ataques por banda."),
                    new FormationSpec("1-4-3-2-1 (Árbol de Navidad)", List.of("4-3-2-1", "1-4-3-2-1"), List.of("arbol de navidad", "arbol"),
                            "En 4-3-2-1 (Árbol de Navidad), gran densidad por dentro con tres medios y dos mediapuntas detrás del nueve, exigiendo amplitud a los laterales."),
                    new FormationSpec("1-5-3-2 (Bloque Bajo)", List.of("5-3-2", "1-5-3-2"), List.of("linea de 5"),
                            "En 5-3-2 (Bloque Bajo), cinco defensores cierran remates y centros laterales mientras el trivote lanza rápido hacia los dos puntas.")
            )
    );

    private static final Map<String, TacticalProfile> PROFILES = Map.of(
            "Futsal", new TacticalProfile(
                    "1-3-1 (Rombo)",
                    "En Futsal (5v5) la clave es mover la pelota rápido y rotar puestos entre el cierre, las alas y el pívot. "
                            + "Con un 1-3-1 tienes siempre al pívot arriba para aguantar el balón de espaldas y descargar "
                            + "de cara hacia las alas que llegan con velocidad."
            ),
            "Fútbol 7", new TacticalProfile(
                    "1-2-3-1",
                    "En Fútbol 7 es fundamental abrir bien la cancha con los jugadores de banda y que el mediocentro sostenga el medio. "
                            + "Con un 1-2-3-1 defiendes firme con dos centrales, controlas el centro del campo y armas paredes "
                            + "por afuera para dejar mano a mano al delantero."
            ),
            "Fútbol 9", new TacticalProfile(
                    "1-3-3-2",
                    "En Fútbol 9 ya necesitas buen orden entre líneas. Con un 1-3-3-2 cierras bien atrás con tres defensas, "
                            + "manejas la mitad con un volante central y dos interiores, y arriba juegas con dos puntas "
                            + "para incomodar todo el partido a los centrales rivales."
            ),
            "Fútbol 11", new TacticalProfile(
                    "1-4-3-3",
                    "En Fútbol 11 lo principal es estar bien parados en ancho y presionar apenas se pierde la pelota. "
                            + "Un 1-4-3-3 te da salida clara desde el fondo con el volante central, sociedades por banda "
                            + "entre lateral, interior y extremo, y tres jugadores listos para apretar arriba."
            )
    );

    private final DocumentChunkRepository chunkRepository;
    private final EmbeddingService embeddingService;
    private final TopPlayersApiService topPlayersApiService;
    private final ChatHistoryRepository chatHistoryRepository;
    private final DemoQuotaRepository demoQuotaRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final RestClient geminiClient;
    private final RestClient openAiClient;
    private final RestClient localClient;

    private final String configuredChatProvider;
    private final String geminiApiKey;
    private final String geminiChatModel;
    private final String openAiApiKey;
    private final String openAiChatModel;
    private final String localChatModel;

    public ChatService(
            DocumentChunkRepository chunkRepository,
            EmbeddingService embeddingService,
            TopPlayersApiService topPlayersApiService,
            ChatHistoryRepository chatHistoryRepository,
            DemoQuotaRepository demoQuotaRepository,
            UserRepository userRepository,
            ObjectMapper objectMapper,
            @Value("${ai.chat.provider:auto}") String configuredChatProvider,
            @Value("${ai.gemini.api-key:}") String geminiApiKey,
            @Value("${ai.gemini.chat-model:gemini-3.1-flash-lite}") String geminiChatModel,
            @Value("${ai.openai.api-key:}") String openAiApiKey,
            @Value("${ai.openai.base-url:https://api.openai.com/v1}") String openAiBaseUrl,
            @Value("${ai.openai.chat-model:gpt-4o-mini}") String openAiChatModel,
            @Value("${ai.local.base-url:http://localhost:11434}") String localBaseUrl,
            @Value("${ai.local.chat-model:llama3.1}") String localChatModel
    ) {
        this.chunkRepository = chunkRepository;
        this.embeddingService = embeddingService;
        this.topPlayersApiService = topPlayersApiService;
        this.chatHistoryRepository = chatHistoryRepository;
        this.demoQuotaRepository = demoQuotaRepository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
        this.configuredChatProvider = configuredChatProvider != null ? configuredChatProvider.trim().toLowerCase(Locale.ROOT) : "auto";

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(6));
        requestFactory.setReadTimeout(Duration.ofSeconds(20));

        this.geminiClient = RestClient.builder().baseUrl(GEMINI_BASE_URL).requestFactory(requestFactory).build();
        this.openAiClient = RestClient.builder()
                .baseUrl(openAiBaseUrl != null && !openAiBaseUrl.isBlank() ? openAiBaseUrl.trim() : "https://api.openai.com/v1")
                .requestFactory(requestFactory)
                .build();
        this.localClient = RestClient.builder()
                .baseUrl(localBaseUrl != null && !localBaseUrl.isBlank() ? localBaseUrl.trim() : "http://localhost:11434")
                .requestFactory(requestFactory)
                .build();

        this.geminiApiKey = geminiApiKey != null ? geminiApiKey.trim() : "";
        this.geminiChatModel = geminiChatModel;
        this.openAiApiKey = openAiApiKey != null ? openAiApiKey.trim() : "";
        this.openAiChatModel = openAiChatModel;
        this.localChatModel = localChatModel;
    }

    public ChatResponse generateTacticalResponse(ChatRequest request) {
        return generateTacticalResponse(request, new AuthPrincipal("demo", "Entrenador Demo", "demo-club", List.of("ROLE_COACH")));
    }

    public ChatResponse generateTacticalResponse(ChatRequest request, AuthPrincipal principal) {
        String tenantId = principal != null ? principal.tenantId() : "demo-club";
        String username = principal != null ? principal.username() : "demo";
        boolean isAdmin = principal != null && principal.isAdmin();

        Long userId = resolveUserId(principal);
        ChatSession targetSession = validateTargetSession(request.sessionId(), userId, tenantId);

        DemoQuotaRepository.DemoQuotaStatus demoQuota = null;
        if (principal != null && principal.isDemoAccount() && principal.demoKey() != null && !principal.demoKey().isBlank()) {
            demoQuota = demoQuotaRepository.consumeQueryOrThrow(principal.demoKey());
        }

        TacticalProfile profile = PROFILES.getOrDefault(request.modality(), PROFILES.get("Fútbol 11"));
        String currentFormation = (request.formation() != null && !request.formation().isBlank())
                ? request.formation().trim()
                : profile.formation();
        String requestedStyle = (request.playStyle() != null && !request.playStyle().isBlank())
                ? request.playStyle().trim()
                : "Posesión & Juego de Posición";
        FormationResolution resolution = resolveFormationChange(request.modality(), currentFormation, request.message());
        String effectiveFormation = resolution.effectiveFormation();

        // 1. Recuperación Híbrida (pgvector coseno + full-text tsvector + RRF rerank) con filtro de usuario privado + base del sistema
        String queryForSearch = request.message() + " " + effectiveFormation + " " + requestedStyle;
        boolean includePublicExternal = !Boolean.TRUE.equals(request.tenantDocsOnly());
        List<DocumentChunk> relevantChunks = retrieveRelevantChunks(
                tenantId, userId, username, isAdmin, request.modality(), queryForSearch, includePublicExternal
        );
        String retrievalSummaryMode = summarizeRetrievalMode(relevantChunks);

        Set<String> uniqueSources = new LinkedHashSet<>();
        List<ChatResponse.Citation> citations = new ArrayList<>();
        for (DocumentChunk chunk : relevantChunks) {
            uniqueSources.add(chunk.formattedSource());
            citations.add(new ChatResponse.Citation(
                    chunk.sourceName(),
                    chunk.pageNumber(),
                    chunk.sectionTitle(),
                    chunk.chunkOrder(),
                    chunk.retrievalMode(),
                    chunk.score()
            ));
        }

        // 2. Selección automática del proveedor de LLM (OpenAI / Gemini / Local / Respaldo)
        ChatResponse response;
        String chatProvider = resolveActiveChatProvider();
        if (!"none".equals(chatProvider)) {
            try {
                String llmText = switch (chatProvider) {
                    case "openai" -> callOpenAiChat(tenantId, request.modality(), resolution, requestedStyle, request.message(), relevantChunks);
                    case "gemini" -> callGeminiChat(tenantId, request.modality(), resolution, requestedStyle, request.message(), relevantChunks);
                    case "local" -> callLocalOllamaChat(tenantId, request.modality(), resolution, requestedStyle, request.message(), relevantChunks);
                    default -> throw new IllegalStateException("Proveedor chat no soportado: " + chatProvider);
                };

                String suggestedFormation = (resolution.formationSwitched() || (request.formation() != null && !request.formation().isBlank()))
                        ? effectiveFormation
                        : extractSuggestedFormation(llmText, profile.formation());

                StringBuilder finalReply = new StringBuilder(llmText.trim());
                if (relevantChunks.isEmpty() && Boolean.TRUE.equals(request.tenantDocsOnly())) {
                    finalReply.append("\n\nSin documentos indexados coincidentes para este tenant en esta consulta (no se citan fuentes documentales).");
                }

                response = ChatResponse.of(
                        finalReply.toString(),
                        request.modality(),
                        suggestedFormation,
                        resolution.appliedSystem(),
                        resolution.recommendedSystem(),
                        new ArrayList<>(uniqueSources),
                        citations,
                        retrievalSummaryMode,
                        chatProvider
                );
            } catch (Exception ex) {
                log.warn("Fallo al invocar LLM ({}), aplicando respuesta resiliente: {}", chatProvider, ex.getMessage());
                response = buildResilientFallbackResponse(
                        request,
                        profile,
                        resolution,
                        requestedStyle,
                        relevantChunks,
                        uniqueSources,
                        citations,
                        retrievalSummaryMode,
                        "No se pudo conectar con el proveedor IA (" + ex.getMessage() + "). Se muestra análisis táctico local con las evidencias recuperadas."
                );
            }
        } else {
            response = buildResilientFallbackResponse(
                    request,
                    profile,
                    resolution,
                    requestedStyle,
                    relevantChunks,
                    uniqueSources,
                    citations,
                    retrievalSummaryMode,
                    "No hay clave IA configurada (OPENAI_API_KEY / GEMINI_API_KEY)."
            );
        }

        ChatResponse persisted = persistConversationTurn(request, principal, userId, tenantId, targetSession, response);
        if (demoQuota != null) {
            return persisted.withDemoQuota(demoQuota.queriesUsed(), demoQuota.maxQueries(), demoQuota.remaining());
        }
        return persisted;
    }

    private Long resolveUserId(AuthPrincipal principal) {
        if (principal == null) {
            return null;
        }
        if (principal.userId() != null) {
            return principal.userId();
        }
        return userRepository.findByUsername(principal.username())
                .map(UserRepository.AppUserRecord::id)
                .orElse(null);
    }

    private ChatSession validateTargetSession(UUID sessionId, Long userId, String tenantId) {
        if (sessionId == null) {
            return null;
        }
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Autenticación válida requerida para continuar conversaciones.");
        }
        ChatSession session = chatHistoryRepository.findSessionById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversación no encontrada."));
        if (!session.userId().equals(userId) || !session.tenantId().equals(tenantId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permiso para escribir en esta conversación.");
        }
        return session;
    }

    private ChatResponse persistConversationTurn(
            ChatRequest request,
            AuthPrincipal principal,
            Long userId,
            String tenantId,
            ChatSession existingSession,
            ChatResponse response
    ) {
        if (principal == null || userId == null) {
            return response;
        }

        ChatSession session = existingSession;
        if (session == null) {
            session = chatHistoryRepository.createSession(
                    userId,
                    tenantId,
                    request.message(),
                    request.modality(),
                    response.suggestedFormation()
            );
        }

        chatHistoryRepository.saveMessage(
                session.id(),
                userId,
                tenantId,
                "user",
                request.message().trim(),
                List.of()
        );
        chatHistoryRepository.saveMessage(
                session.id(),
                userId,
                tenantId,
                "assistant",
                response.reply(),
                response.sources()
        );
        chatHistoryRepository.updateSessionActivity(
                session.id(),
                userId,
                tenantId,
                request.modality(),
                response.suggestedFormation()
        );

        return response.withSession(session.id(), session.title());
    }

    private String resolveActiveChatProvider() {
        return switch (configuredChatProvider) {
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
                yield "none";
            }
        };
    }

    private List<DocumentChunk> retrieveRelevantChunks(
            String tenantId,
            Long userId,
            String username,
            boolean isAdmin,
            String modality,
            String userMessage,
            boolean includePublicExternal
    ) {
        String queryVectorLiteral = null;
        String activeModel = null;
        if (embeddingService.isConfigured()) {
            try {
                queryVectorLiteral = embeddingService.embedToPgVectorLiteral(userMessage);
                activeModel = embeddingService.getActiveModelName();
            } catch (Exception ex) {
                log.warn("No se pudo generar embedding de consulta ({}); usando búsqueda textual.", ex.getMessage());
            }
        }

        try {
            return chunkRepository.findHybridChunks(
                    tenantId,
                    userId,
                    username,
                    isAdmin,
                    modality,
                    queryVectorLiteral,
                    activeModel,
                    userMessage,
                    TOP_K_CHUNKS,
                    includePublicExternal
            );
        } catch (Exception ex) {
            log.warn("Error en búsqueda híbrida ({}); devolviendo lista vacía.", ex.getMessage());
            return List.of();
        }
    }

    private String summarizeRetrievalMode(List<DocumentChunk> chunks) {
        if (chunks == null || chunks.isEmpty()) {
            return "none";
        }
        boolean hasHybrid = chunks.stream().anyMatch(c -> "hybrid".equals(c.retrievalMode()));
        if (hasHybrid) {
            return "hybrid";
        }
        boolean hasVector = chunks.stream().anyMatch(c -> "vector".equals(c.retrievalMode()));
        boolean hasLexical = chunks.stream().anyMatch(c -> "lexical".equals(c.retrievalMode()));
        if (hasVector && hasLexical) {
            return "hybrid";
        }
        return hasVector ? "vector" : "lexical";
    }

    private record PromptPair(String systemPrompt, String userPrompt) {
    }

    private PromptPair buildPrompts(
            String tenantId,
            String modality,
            FormationResolution resolution,
            String playStyle,
            String userMessage,
            List<DocumentChunk> chunks
    ) {
        String formation = resolution.effectiveFormation();
        String contextBlock;
        if (chunks.isEmpty()) {
            contextBlock = "No existen fragmentos de documentos indexados para este tenant en esta consulta. Aclara explícitamente que no hay documentos de respaldo para esta consulta y NO inventes citas, páginas ni nombres de archivos.";
        } else {
            contextBlock = chunks.stream()
                    .map(c -> String.format("[%s | modo=%s]: %s",
                            c.formattedSource(),
                            c.retrievalMode() != null ? c.retrievalMode() : "hybrid",
                            c.chunkText()))
                    .collect(Collectors.joining("\n\n"));
        }

        String squadContext = "";
        try {
            squadContext = topPlayersApiService.buildSquadContextForChatbot(modality, tenantId);
        } catch (Exception ignored) {
        }

        String formationSwitchRule = resolution.formationSwitched()
                ? String.format(
                        "\n6. ADOPCIÓN INMEDIATA DE NUEVA FORMACIÓN: El entrenador pidió probar o cambiar a %s (dejando atrás %s). "
                                + "ACEPTA y ADOPTA %s como sistema protagonista desde la primera frase. "
                                + "PROHIBIDO defender, justificar como obligatorio o pedir volver al esquema anterior (%s). "
                                + "Explica cómo ejecutar %s, sus ventajas clave y movimientos coordinados según el estilo \"%s\" y las evidencias recuperadas.",
                        formation,
                        resolution.previousFormation(),
                        formation,
                        resolution.previousFormation(),
                        formation,
                        playStyle
                )
                : "";

        String systemPrompt = String.format("""
                Eres un entrenador de fútbol experimentado, cercano, claro y directo de TacticalPlay RAG, especialista en %s.
                Sigue estas reglas obligatorias al pie de la letra:
                1. LENGUAJE SENCILLO Y DE CANCHA: Habla con palabras cotidianas de fútbol que cualquier jugador o entrenador entienda al instante. Está TERMINANTEMENTE PROHIBIDO usar jerga académica o palabras rebuscadas.
                2. REGLA ESTRICTA PARA PDFs QUE NO SON DE FÚTBOL: Revisa primero de qué tratan los fragmentos del PDF recuperados abajo. Si hay fragmentos de un PDF subido por el usuario que tratan de otro tema que NO sea fútbol, futsal, táctica, entrenamientos, jugadores o deporte (por ejemplo: currículums, facturas, programación, leyes, medicina, tareas escolares, etc.), PROHIBIDO inventar metáforas o mezclar ese contenido con fútbol. En ese caso responde ÚNICAMENTE y de forma textual:
                "El documento indexado ([nombre del archivo]) no contiene información relacionada con fútbol o táctica deportiva. Por favor, sube un manual táctico, guía de entrenamiento o análisis de partido en PDF para ayudarte."
                3. CONCISO Y PRÁCTICO: Si el documento sí es de fútbol (o artículos tácticos / consultas de cancha de %s), ve directo al grano con máximo 3 o 4 puntos cortos y prácticos enfocados en la formación %s con estilo "%s".
                4. PLANTILLA PROPIA DEL CLUB: Si abajo aparece la lista de jugadores de la "PLANTILLA PROPIA DEL ENTRENADOR" y el usuario pregunta por su equipo, alineación, cambios o jugadores, nómbralos por su nombre y dorsal real, menciona a qué crack del Top 100 se parecen y con qué compañeros hacen mejor sociedad.
                5. CITAS OBLIGATORIAS AL DOCUMENTO, PÁGINA Y SECCIÓN: Cuando uses datos de un PDF o artículo recuperado, cita explícitamente entre corchetes la fuente exacta tal como aparece en las evidencias (ej. [Manual.pdf (Pág. 2 · Sec: Salida de Balón)]).%s
                """,
                modality, modality, formation, playStyle, formationSwitchRule
        );

        String userPrompt = String.format("""
                CLUB / TENANT ACTIVO: %s
                MODALIDAD SELECCIONADA: %s
                FORMACIÓN ACTIVA AHORA: %s
                ESTILO DE JUEGO ELEGIDO: %s
                %s
                FRAGMENTOS RECUPERADOS DE LA BASE VECTORIAL HÍBRIDA (pgvector + tsvector):
                %s

                CONSULTA DEL ENTRENADOR:
                %s
                """,
                tenantId, modality, formation, playStyle, squadContext, contextBlock, userMessage
        );

        return new PromptPair(systemPrompt, userPrompt);
    }

    private String callGeminiChat(
            String tenantId,
            String modality,
            FormationResolution resolution,
            String playStyle,
            String userMessage,
            List<DocumentChunk> chunks
    ) throws Exception {
        PromptPair prompts = buildPrompts(tenantId, modality, resolution, playStyle, userMessage, chunks);
        Map<String, Object> payload = Map.of(
                "system_instruction", Map.of("parts", List.of(Map.of("text", prompts.systemPrompt()))),
                "contents", List.of(Map.of("role", "user", "parts", List.of(Map.of("text", prompts.userPrompt())))),
                "generationConfig", Map.of("temperature", 0.35, "maxOutputTokens", 900)
        );

        String rawResponse = geminiClient.post()
                .uri(uriBuilder -> uriBuilder
                        .path("/models/{model}:generateContent")
                        .queryParam("key", geminiApiKey)
                        .build(geminiChatModel))
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body(String.class);

        JsonNode partsNode = objectMapper.readTree(rawResponse).path("candidates").path(0).path("content").path("parts");
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

    private String callOpenAiChat(
            String tenantId,
            String modality,
            FormationResolution resolution,
            String playStyle,
            String userMessage,
            List<DocumentChunk> chunks
    ) throws Exception {
        PromptPair prompts = buildPrompts(tenantId, modality, resolution, playStyle, userMessage, chunks);
        Map<String, Object> payload = Map.of(
                "model", openAiChatModel,
                "temperature", 0.35,
                "max_tokens", 900,
                "messages", List.of(
                        Map.of("role", "system", "content", prompts.systemPrompt()),
                        Map.of("role", "user", "content", prompts.userPrompt())
                )
        );

        String rawResponse = openAiClient.post()
                .uri("/chat/completions")
                .header("Authorization", "Bearer " + openAiApiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body(String.class);

        String text = objectMapper.readTree(rawResponse).path("choices").path(0).path("message").path("content").asText("");
        if (text.isBlank()) {
            throw new IllegalStateException("OpenAI no devolvió contenido en choices[0].message.content");
        }
        return text;
    }

    private String callLocalOllamaChat(
            String tenantId,
            String modality,
            FormationResolution resolution,
            String playStyle,
            String userMessage,
            List<DocumentChunk> chunks
    ) throws Exception {
        PromptPair prompts = buildPrompts(tenantId, modality, resolution, playStyle, userMessage, chunks);
        Map<String, Object> payload = Map.of(
                "model", localChatModel,
                "stream", false,
                "messages", List.of(
                        Map.of("role", "system", "content", prompts.systemPrompt()),
                        Map.of("role", "user", "content", prompts.userPrompt())
                )
        );

        String rawResponse = localClient.post()
                .uri("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body(String.class);

        String text = objectMapper.readTree(rawResponse).path("message").path("content").asText("");
        if (text.isBlank()) {
            throw new IllegalStateException("Ollama local no devolvió respuesta.");
        }
        return text;
    }

    private ChatResponse buildResilientFallbackResponse(
            ChatRequest request,
            TacticalProfile profile,
            FormationResolution resolution,
            String playStyle,
            List<DocumentChunk> relevantChunks,
            Set<String> uniqueSources,
            List<ChatResponse.Citation> citations,
            String retrievalMode,
            String notice
    ) {
        String formation = resolution.effectiveFormation();
        String formationAdvice = resolveFormationAdvice(request.modality(), formation, profile.synergy());
        String switchHeader = resolution.formationSwitched()
                ? String.format("Adoptando el esquema %s para esta jugada (%s). ", formatShortFormation(formation), playStyle)
                : "";

        StringBuilder replyBuilder = new StringBuilder();
        replyBuilder.append(String.format(
                "[Análisis Táctico - %s · %s · %s] %sRespecto a tu consulta ('%s'): %s Con el sistema %s y estilo %s "
                        + "buscamos líneas juntas y pases claros entre líneas.\n\n"
                        + "ℹ️ Aviso: %s",
                request.modality(),
                formation,
                playStyle,
                switchHeader,
                request.message().trim(),
                formationAdvice,
                formatShortFormation(formation),
                playStyle,
                notice
        ));

        if (relevantChunks.isEmpty() && Boolean.TRUE.equals(request.tenantDocsOnly())) {
            replyBuilder.append("\n\nSin documentos indexados coincidentes para este tenant en esta consulta (no se citan fuentes documentales).");
        }

        return ChatResponse.of(
                replyBuilder.toString(),
                request.modality(),
                formation,
                resolution.appliedSystem(),
                resolution.recommendedSystem(),
                new ArrayList<>(uniqueSources),
                citations,
                retrievalMode,
                "fallback"
        );
    }

    private FormationResolution resolveFormationChange(String modality, String currentFormation, String userMessage) {
        if (userMessage == null || userMessage.isBlank()) {
            return new FormationResolution(currentFormation, null, null, currentFormation, false);
        }

        List<FormationSpec> specs = MODALITY_FORMATIONS.getOrDefault(modality, MODALITY_FORMATIONS.get("Fútbol 11"));
        String normalizedMsg = normalizeTacticalText(userMessage);
        String currentNormalizedCode = normalizeFormationCode(currentFormation);

        FormationSpec matchedSpec = detectNumericFormationSpec(modality, specs, normalizedMsg, currentNormalizedCode);
        if (matchedSpec == null && !normalizedMsg.contains("sistema actual")) {
            matchedSpec = detectAliasFormationSpec(specs, normalizedMsg);
        }

        if (matchedSpec == null) {
            return new FormationResolution(currentFormation, null, null, currentFormation, false);
        }

        boolean differsFromCurrent = !normalizeFormationCode(matchedSpec.code()).equals(currentNormalizedCode);
        boolean wantsAdoption = differsFromCurrent || containsFormationAdoptionIntent(normalizedMsg);
        if (wantsAdoption) {
            return new FormationResolution(
                    matchedSpec.code(),
                    matchedSpec.code(),
                    matchedSpec.code(),
                    currentFormation,
                    true
            );
        }
        return new FormationResolution(matchedSpec.code(), null, null, currentFormation, false);
    }

    private FormationSpec detectNumericFormationSpec(
            String modality,
            List<FormationSpec> specs,
            String normalizedMsg,
            String currentNormalizedCode
    ) {
        Matcher matcher = NUMERIC_FORMATION_TOKEN_PATTERN.matcher(normalizedMsg);
        FormationSpec bestSpec = null;
        int bestScore = Integer.MIN_VALUE;

        while (matcher.find()) {
            String token = matcher.group(1);
            int start = matcher.start(1);
            int end = matcher.end(1);
            String clauseBefore = extractClauseBefore(normalizedMsg, start);
            String tailAfter = normalizedMsg.substring(end, Math.min(normalizedMsg.length(), end + 28));

            if (isOpponentOrRejectedClause(clauseBefore, tailAfter)) {
                continue;
            }

            FormationSpec candidate = matchSpecForNumericToken(modality, specs, token, normalizedMsg, start, end);
            if (candidate == null) {
                continue;
            }

            int score = 0;
            if (!normalizeFormationCode(candidate.code()).equals(currentNormalizedCode)) {
                score += 20;
            }
            if (containsAdoptionCue(clauseBefore)) {
                score += 15;
            }
            if (score > bestScore) {
                bestScore = score;
                bestSpec = candidate;
            }
        }
        return bestSpec;
    }

    private FormationSpec matchSpecForNumericToken(
            String modality,
            List<FormationSpec> specs,
            String token,
            String normalizedMsg,
            int start,
            int end
    ) {
        List<FormationSpec> matches = specs.stream()
                .filter(spec -> spec.numericTokens().contains(token))
                .toList();
        if (matches.isEmpty()) {
            return null;
        }
        if (matches.size() == 1) {
            return matches.get(0);
        }

        String localWindow = normalizedMsg.substring(
                Math.max(0, start - 20),
                Math.min(normalizedMsg.length(), end + 30)
        );
        if ("Futsal".equals(modality)) {
            boolean highPress = localWindow.contains("presion alta")
                    || (normalizedMsg.contains("presion alta") && !localWindow.contains("rombo"));
            String target = highPress ? "1-3-1 (Presión Alta)" : "1-3-1 (Rombo)";
            return matches.stream().filter(s -> s.code().equals(target)).findFirst().orElse(matches.get(0));
        }
        if ("Fútbol 11".equals(modality)) {
            boolean diamond = localWindow.contains("rombo")
                    || localWindow.contains("diamante")
                    || (normalizedMsg.contains("rombo") && !localWindow.contains("clasico"));
            String target = diamond ? "1-4-4-2 (Rombo)" : "1-4-4-2 (Clásico)";
            return matches.stream().filter(s -> s.code().equals(target)).findFirst().orElse(matches.get(0));
        }
        return matches.get(0);
    }

    private FormationSpec detectAliasFormationSpec(List<FormationSpec> specs, String normalizedMsg) {
        record AliasCandidate(FormationSpec spec, String alias) {
        }
        List<AliasCandidate> candidates = new ArrayList<>();
        for (FormationSpec spec : specs) {
            for (String alias : spec.aliases()) {
                candidates.add(new AliasCandidate(spec, alias));
            }
        }
        candidates.sort(Comparator.comparingInt((AliasCandidate c) -> c.alias().length()).reversed());

        for (AliasCandidate candidate : candidates) {
            Pattern aliasPattern = Pattern.compile("(?<![a-z0-9])" + Pattern.quote(candidate.alias()) + "(?![a-z0-9])");
            Matcher m = aliasPattern.matcher(normalizedMsg);
            while (m.find()) {
                int start = m.start();
                int end = m.end();
                String clauseBefore = extractClauseBefore(normalizedMsg, start);
                String tailAfter = normalizedMsg.substring(end, Math.min(normalizedMsg.length(), end + 28));
                if (!isOpponentOrRejectedClause(clauseBefore, tailAfter)) {
                    return candidate.spec();
                }
            }
        }
        return null;
    }

    private String extractClauseBefore(String normalizedMsg, int tokenStart) {
        int lastPunctuation = -1;
        for (int i = tokenStart - 1; i >= 0; i--) {
            char ch = normalizedMsg.charAt(i);
            if (ch == '.' || ch == ',' || ch == '?' || ch == '!' || ch == ';') {
                lastPunctuation = i;
                break;
            }
        }
        int from = Math.max(lastPunctuation + 1, tokenStart - 48);
        return normalizedMsg.substring(from, tokenStart);
    }

    private boolean isOpponentOrRejectedClause(String clauseBefore, String tailAfter) {
        String paddedClause = " " + clauseBefore.trim() + " ";
        List<String> rejectCues = List.of(
                " contra ", " frente a ", " rival ", " del rival ", " oponente ", " adversario ",
                " defensa cerrada ", " defensa baja ", " romper ", " superar ",
                " en vez de ", " en lugar de ", " antes que ", " dejar el ", " dejar la ", " sin usar "
        );
        for (String cue : rejectCues) {
            if (paddedClause.contains(cue)) {
                return true;
            }
        }
        return clauseBefore.matches(".*\\b(?:de|del|el|la)\\s+$")
                && tailAfter.matches("^\\s+(?:a|al|por|hacia)\\b.*");
    }

    private boolean containsAdoptionCue(String clauseBefore) {
        String padded = " " + clauseBefore.trim() + " ";
        List<String> cues = List.of(
                " probar ", " prueba ", " cambia ", " cambiar ", " cambiemos ", " usar ", " usa ",
                " utilizar ", " pasemos ", " pasa ", " pasar ", " pon ", " poner ", " juega ",
                " jugar ", " adoptar ", " adopta ", " aplicar ", " aplica ", " armar ", " plantea ",
                " plantee ", " quiero ", " probemos ", " hacia ", " por ", " a ", " al ",
                " esquema ", " sistema ", " formacion "
        );
        for (String cue : cues) {
            if (padded.contains(cue)) {
                return true;
            }
        }
        return false;
    }

    private boolean containsFormationAdoptionIntent(String normalizedMsg) {
        String padded = " " + normalizedMsg + " ";
        List<String> intentVerbs = List.of(
                " probar ", " prueba ", " cambia ", " cambiar ", " cambiemos ", " usar ", " usa ",
                " utilizar ", " pasemos ", " pasa ", " pasar ", " pon ", " poner ", " jugar con ",
                " jugar al ", " juega con ", " adoptar ", " adopta ", " aplicar ", " aplica ",
                " probemos ", " armar ", " quiero "
        );
        for (String verb : intentVerbs) {
            if (padded.contains(verb)) {
                return true;
            }
        }
        return false;
    }

    private String resolveFormationAdvice(String modality, String formationCode, String defaultSynergy) {
        List<FormationSpec> specs = MODALITY_FORMATIONS.getOrDefault(modality, List.of());
        String targetNorm = normalizeFormationCode(formationCode);
        for (FormationSpec spec : specs) {
            if (normalizeFormationCode(spec.code()).equals(targetNorm)) {
                return spec.tacticalAdvice();
            }
        }
        return defaultSynergy;
    }

    private String formatShortFormation(String formationCode) {
        if (formationCode == null) {
            return "";
        }
        return formationCode.replaceFirst("^1-(?=\\d)", "");
    }

    private String normalizeTacticalText(String raw) {
        String decomposed = Normalizer.normalize(raw.toLowerCase(Locale.ROOT), Normalizer.Form.NFD);
        return decomposed.replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private String normalizeFormationCode(String code) {
        if (code == null) {
            return "";
        }
        return normalizeTacticalText(code);
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
}
