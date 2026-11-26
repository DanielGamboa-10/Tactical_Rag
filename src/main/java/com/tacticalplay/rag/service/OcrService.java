package com.tacticalplay.rag.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Servicio de OCR para páginas escaneadas o sin texto seleccionable.
 * Estrategia en cascada:
 * 1) Tesseract OCR CLI local (PATH o rutas estándar Windows/Linux).
 * 2) Servicio HTTP local/externo de OCR si está configurado (ocr.endpoint-url).
 * 3) Multimodal Vision OCR (Gemini Vision u OpenAI Vision) renderizando la página con PDFBox.
 */
@Service
public class OcrService {

    private static final Logger log = LoggerFactory.getLogger(OcrService.class);
    private static final String GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

    public record OcrResult(String text, boolean ocrApplied, String engineUsed) {
    }

    private final ObjectMapper objectMapper;
    private final RestClient geminiClient;
    private final RestClient openAiClient;
    private final RestClient customOcrClient;

    private final String tesseractEnabled;
    private final String tesseractCommand;
    private final String ocrLanguage;
    private final String customOcrEndpoint;
    private final boolean visionFallbackEnabled;

    private final String geminiApiKey;
    private final String geminiChatModel;
    private final String openAiApiKey;
    private final String openAiChatModel;

    public OcrService(
            ObjectMapper objectMapper,
            @Value("${ocr.tesseract.enabled:auto}") String tesseractEnabled,
            @Value("${ocr.tesseract.command:tesseract}") String tesseractCommand,
            @Value("${ocr.tesseract.language:spa+eng}") String ocrLanguage,
            @Value("${ocr.endpoint-url:}") String customOcrEndpoint,
            @Value("${ocr.vision-fallback-enabled:true}") boolean visionFallbackEnabled,
            @Value("${ai.gemini.api-key:}") String geminiApiKey,
            @Value("${ai.gemini.chat-model:gemini-3.1-flash-lite}") String geminiChatModel,
            @Value("${ai.openai.api-key:}") String openAiApiKey,
            @Value("${ai.openai.base-url:https://api.openai.com/v1}") String openAiBaseUrl,
            @Value("${ai.openai.chat-model:gpt-4o-mini}") String openAiChatModel
    ) {
        this.objectMapper = objectMapper;
        this.tesseractEnabled = tesseractEnabled != null ? tesseractEnabled.trim().toLowerCase(Locale.ROOT) : "auto";
        this.tesseractCommand = resolveTesseractExecutable(tesseractCommand);
        this.ocrLanguage = ocrLanguage;
        this.customOcrEndpoint = customOcrEndpoint != null ? customOcrEndpoint.trim() : "";
        this.visionFallbackEnabled = visionFallbackEnabled;
        this.geminiApiKey = geminiApiKey != null ? geminiApiKey.trim() : "";
        this.geminiChatModel = geminiChatModel;
        this.openAiApiKey = openAiApiKey != null ? openAiApiKey.trim() : "";
        this.openAiChatModel = openAiChatModel;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(8));
        factory.setReadTimeout(Duration.ofSeconds(30));

        this.geminiClient = RestClient.builder().baseUrl(GEMINI_BASE_URL).requestFactory(factory).build();
        this.openAiClient = RestClient.builder()
                .baseUrl(openAiBaseUrl != null && !openAiBaseUrl.isBlank() ? openAiBaseUrl.trim() : "https://api.openai.com/v1")
                .requestFactory(factory)
                .build();
        this.customOcrClient = !this.customOcrEndpoint.isBlank()
                ? RestClient.builder().requestFactory(factory).build()
                : null;
    }

    public OcrResult extractTextFromScannedPage(PDDocument document, int zeroBasedPageIndex) {
        try {
            PDFRenderer renderer = new PDFRenderer(document);
            BufferedImage image = renderer.renderImageWithDPI(zeroBasedPageIndex, 180, ImageType.RGB);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(image, "png", baos);
            return extractTextFromPngBytes(baos.toByteArray(), zeroBasedPageIndex + 1);
        } catch (Exception ex) {
            log.warn("No se pudo renderizar para OCR la página {}: {}", zeroBasedPageIndex + 1, ex.getMessage());
            return new OcrResult("", false, "none");
        }
    }

    public OcrResult extractTextFromPngBytes(byte[] pngBytes, int oneBasedPage) {
        try {
            if (!"false".equals(tesseractEnabled)) {
                String tessText = tryTesseractCli(pngBytes);
                if (tessText != null && !tessText.isBlank()) {
                    return new OcrResult(tessText.trim(), true, "tesseract-cli");
                }
            }

            if (customOcrClient != null && !customOcrEndpoint.isBlank()) {
                String httpOcrText = tryCustomOcrEndpoint(pngBytes, oneBasedPage);
                if (httpOcrText != null && !httpOcrText.isBlank()) {
                    return new OcrResult(httpOcrText.trim(), true, "http-ocr-service");
                }
            }

            if (visionFallbackEnabled) {
                if (!geminiApiKey.isBlank()) {
                    String visionText = tryGeminiVisionOcr(pngBytes);
                    if (visionText != null && !visionText.isBlank()) {
                        return new OcrResult(visionText.trim(), true, "gemini-vision-ocr");
                    }
                }
                if (!openAiApiKey.isBlank()) {
                    String openAiVisionText = tryOpenAiVisionOcr(pngBytes);
                    if (openAiVisionText != null && !openAiVisionText.isBlank()) {
                        return new OcrResult(openAiVisionText.trim(), true, "openai-vision-ocr");
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("No se pudo ejecutar OCR en la página {}: {}", oneBasedPage, ex.getMessage());
        }
        return new OcrResult("", false, "none");
    }

    private String resolveTesseractExecutable(String configured) {
        String base = (configured != null && !configured.isBlank()) ? configured.trim() : "tesseract";
        if ("tesseract".equalsIgnoreCase(base)) {
            List<Path> commonWindowsPaths = List.of(
                    Path.of("C:\\Program Files\\Tesseract-OCR\\tesseract.exe"),
                    Path.of("C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe")
            );
            for (Path candidate : commonWindowsPaths) {
                if (Files.isRegularFile(candidate)) {
                    return candidate.toString();
                }
            }
        }
        return base;
    }

    private String tryCustomOcrEndpoint(byte[] pngBytes, int page) {
        try {
            String base64Png = Base64.getEncoder().encodeToString(pngBytes);
            String raw = customOcrClient.post()
                    .uri(customOcrEndpoint)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "imageBase64", base64Png,
                            "mimeType", "image/png",
                            "language", ocrLanguage,
                            "page", page
                    ))
                    .retrieve()
                    .body(String.class);
            JsonNode root = objectMapper.readTree(raw);
            String extracted = root.path("text").asText("");
            if (!extracted.isBlank()) {
                return extracted;
            }
            return root.path("data").path("text").asText("");
        } catch (Exception ex) {
            log.warn("Endpoint HTTP OCR ({}) falló: {}", customOcrEndpoint, ex.getMessage());
            return null;
        }
    }

    private String tryTesseractCli(byte[] pngBytes) {
        Path tempImg = null;
        try {
            tempImg = Files.createTempFile("tactical_ocr_", ".png");
            Files.write(tempImg, pngBytes);

            Process process = new ProcessBuilder(
                    tesseractCommand,
                    tempImg.toAbsolutePath().toString(),
                    "stdout",
                    "-l",
                    ocrLanguage
            ).redirectErrorStream(true).start();

            boolean finished = process.waitFor(20, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return null;
            }
            if (process.exitValue() == 0) {
                return new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (Exception ignored) {
            // Tesseract no instalado en host: continúa hacia servicio OCR HTTP / Vision OCR
        } finally {
            if (tempImg != null) {
                try {
                    Files.deleteIfExists(tempImg);
                } catch (Exception ignored) {
                }
            }
        }
        return null;
    }

    private String tryGeminiVisionOcr(byte[] pngBytes) {
        try {
            String base64Png = Base64.getEncoder().encodeToString(pngBytes);
            Map<String, Object> payload = Map.of(
                    "contents", List.of(
                            Map.of(
                                    "role", "user",
                                    "parts", List.of(
                                            Map.of("text", "Realiza OCR literal y exacto de todo el texto visible en esta página escaneada. Conserva títulos y párrafos en orden de lectura sin inventar contenido."),
                                            Map.of("inline_data", Map.of(
                                                    "mime_type", "image/png",
                                                    "data", base64Png
                                            ))
                                    )
                            )
                    ),
                    "generationConfig", Map.of("temperature", 0.0, "maxOutputTokens", 2048)
            );

            String raw = geminiClient.post()
                    .uri(uriBuilder -> uriBuilder
                            .path("/models/{model}:generateContent")
                            .queryParam("key", geminiApiKey)
                            .build(geminiChatModel))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(String.class);

            JsonNode parts = objectMapper.readTree(raw).path("candidates").path(0).path("content").path("parts");
            if (parts.isArray()) {
                for (JsonNode part : parts) {
                    if (!part.path("thought").asBoolean(false) && !part.path("text").asText().isBlank()) {
                        return part.path("text").asText();
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Gemini Vision OCR falló: {}", ex.getMessage());
        }
        return null;
    }

    private String tryOpenAiVisionOcr(byte[] pngBytes) {
        try {
            String dataUri = "data:image/png;base64," + Base64.getEncoder().encodeToString(pngBytes);
            Map<String, Object> payload = Map.of(
                    "model", openAiChatModel,
                    "temperature", 0.0,
                    "messages", List.of(
                            Map.of(
                                    "role", "user",
                                    "content", List.of(
                                            Map.of("type", "text", "text", "Transcribe textualmente todo el texto visible en esta página PDF escaneada sin añadir comentarios."),
                                            Map.of("type", "image_url", "image_url", Map.of("url", dataUri))
                                    )
                            )
                    )
            );

            String raw = openAiClient.post()
                    .uri("/chat/completions")
                    .header("Authorization", "Bearer " + openAiApiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(String.class);

            return objectMapper.readTree(raw).path("choices").path(0).path("message").path("content").asText("");
        } catch (Exception ex) {
            log.warn("OpenAI Vision OCR falló: {}", ex.getMessage());
        }
        return null;
    }
}
