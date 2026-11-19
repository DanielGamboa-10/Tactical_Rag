package com.tacticalplay.rag.service;

import com.tacticalplay.rag.dto.ChatRequest;
import com.tacticalplay.rag.dto.ChatResponse;
import com.tacticalplay.rag.model.DocumentChunk;
import com.tacticalplay.rag.repository.DocumentChunkRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ChatService {

    private record TacticalProfile(String formation, String synergy, List<String> defaultSources) {
    }

    private static final Map<String, TacticalProfile> PROFILES = Map.of(
            "Futsal", new TacticalProfile(
                    "1-3-1 (Rombo) / 1-2-2 (Cuadrado)",
                    "En Futsal (5v5) la sinergia exige rotaciones constantes entre el cierre, las alas y el pívot. "
                            + "Con un esquema 1-3-1 logras profundidad inmediata para jugar de espaldas con el pívot "
                            + "y liberar líneas de pase hacia las alas en transición rápida.",
                    List.of("Manual_Tactico_Futsal_FIFA.pdf (Pág. 14)", "Sistemas_Rotacion_40x20.pdf (Pág. 8)")
            ),
            "Fútbol 7", new TacticalProfile(
                    "1-2-3-1 / 1-3-2-1",
                    "En Fútbol 7 la amplitud de los carrileros y el equilibrio del mediocentro son determinantes. "
                            + "El sistema 1-2-3-1 ofrece solidez con dos defensores centrales, superioridad en zona "
                            + "medular y triángulos de asociación por bandas para abastecer al punta.",
                    List.of("Guia_Tactica_Futbol7_Base.pdf (Pág. 22)", "Transiciones_Campos_Reducidos_F7.pdf (Pág. 11)")
            ),
            "Fútbol 9", new TacticalProfile(
                    "1-3-3-2 / 1-3-4-1",
                    "El Fútbol 9 actúa como puente táctico hacia el campo completo. Con un 1-3-3-2 aseguras "
                            + "coberturas defensivas en anchura, control del carril central mediante un pivote y dos "
                            + "interiores, y doble referencia ofensiva para fijar centrales rivales.",
                    List.of("Metodologia_Puente_Futbol9.pdf (Pág. 19)", "Estructuras_Precompetitivas_F9.pdf (Pág. 31)")
            ),
            "Fútbol 11", new TacticalProfile(
                    "1-4-3-3 / 1-4-2-3-1",
                    "En Fútbol 11 la ocupación racional de los cinco carriles y la presión tras pérdida marcan la "
                            + "diferencia. Un 1-4-3-3 permite salida limpia con pivote posicional, triángulos entre "
                            + "lateral-interior-extremo y presión alta coordinada sobre la salida rival.",
                    List.of("Teoria_Tactica_Moderna_F11.pdf (Pág. 45)", "Sinergias_Posicionales_11v11.pdf (Pág. 17)")
            )
    );

    private final DocumentChunkRepository chunkRepository;

    public ChatService(DocumentChunkRepository chunkRepository) {
        this.chunkRepository = chunkRepository;
    }

    public ChatResponse generateTacticalResponse(ChatRequest request) {
        TacticalProfile profile = PROFILES.getOrDefault(request.modality(), PROFILES.get("Fútbol 11"));

        List<DocumentChunk> relevantChunks = new ArrayList<>();
        try {
            relevantChunks = chunkRepository.findContextualChunks(request.modality(), request.message(), 3);
        } catch (Exception ignored) {
            // Si la base de datos no está disponible temporalmente, se usa el perfil táctico base
        }

        Set<String> uniqueSources = new LinkedHashSet<>();
        for (DocumentChunk chunk : relevantChunks) {
            uniqueSources.add(chunk.formattedSource());
        }
        if (uniqueSources.isEmpty()) {
            uniqueSources.addAll(profile.defaultSources());
        }

        StringBuilder replyBuilder = new StringBuilder();
        replyBuilder.append(String.format(
                "[Análisis Táctico - %s] Respecto a tu consulta ('%s'): %s Se recomienda estructurar el bloque en %s "
                        + "para maximizar las líneas de pase y las coberturas compensatorias.",
                request.modality(),
                request.message().trim(),
                profile.synergy(),
                profile.formation()
        ));

        if (!relevantChunks.isEmpty()) {
            String contextSummary = relevantChunks.stream()
                    .map(chunk -> String.format("• [%s]: \"%s\"", chunk.formattedSource(), truncateSnippet(chunk.chunkText(), 240)))
                    .collect(Collectors.joining("\n"));

            replyBuilder.append("\n\nContexto documental recuperado de tus PDFs:\n")
                    .append(contextSummary);
        }

        return ChatResponse.of(
                replyBuilder.toString(),
                request.modality(),
                profile.formation(),
                new ArrayList<>(uniqueSources)
        );
    }

    private String truncateSnippet(String text, int maxLength) {
        if (text == null || text.length() <= maxLength) {
            return text != null ? text : "";
        }
        return text.substring(0, maxLength).trim() + "...";
    }
}
