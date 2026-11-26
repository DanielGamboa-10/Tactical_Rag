package com.tacticalplay.rag;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.tacticalplay.rag.dto.ChatRequest;
import com.tacticalplay.rag.dto.ChatResponse;
import com.tacticalplay.rag.dto.PdfUploadResponse;
import com.tacticalplay.rag.model.DocumentChunk;
import com.tacticalplay.rag.model.Expediente;
import com.tacticalplay.rag.repository.DemoQuotaRepository;
import com.tacticalplay.rag.repository.DocumentChunkRepository;
import com.tacticalplay.rag.repository.ExpedienteRepository;
import com.tacticalplay.rag.security.AuthPrincipal;
import com.tacticalplay.rag.security.JwtService;
import com.tacticalplay.rag.service.AsyncPdfProcessor;
import com.tacticalplay.rag.service.ChatService;
import com.tacticalplay.rag.service.EmbeddingService;
import com.tacticalplay.rag.service.FileSecurityScanner;
import com.tacticalplay.rag.service.OcrService;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.server.ResponseStatusException;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class TacticalPlayRagApplicationTests {

    @Autowired
    private ChatService chatService;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private DemoQuotaRepository demoQuotaRepository;

    @Autowired
    private DocumentChunkRepository chunkRepository;

    @Autowired
    private ExpedienteRepository expedienteRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void contextLoadsAndGeneratesTacticalResponse() {
        assertNotNull(chatService);
        ChatRequest request = new ChatRequest("¿Cómo organizar la salida de balón?", "Futsal");
        ChatResponse response = chatService.generateTacticalResponse(request);

        assertNotNull(response);
        assertEquals("Futsal", response.modality());
        assertNotNull(response.reply());
        assertFalse(response.sources().isEmpty());
        assertNotNull(response.citations());
    }

    @Test
    void jwtSignsValidatesAndRejectsTamperedToken() {
        AuthPrincipal principal = new AuthPrincipal("coach1", "Coach Uno", "club-1", List.of("ROLE_COACH"));
        String token = jwtService.generateToken(principal);

        var parsed = jwtService.parseAndValidate(token);
        assertTrue(parsed.isPresent());
        assertEquals("coach1", parsed.get().username());
        assertEquals("club-1", parsed.get().tenantId());

        String tampered = token.substring(0, token.length() - 2) + "XX";
        assertTrue(jwtService.parseAndValidate(tampered).isEmpty());
    }

    @Test
    void embeddingServiceExecutesOpenAiAndLocalOllamaHttpPayloads() throws Exception {
        StringBuilder fake768 = new StringBuilder("[");
        for (int i = 0; i < 768; i++) {
            if (i > 0) fake768.append(',');
            fake768.append(i == 0 ? "0.8" : "0.01");
        }
        fake768.append(']');

        HttpServer mockServer = HttpServer.create(new InetSocketAddress(0), 0);
        try {
            int port = mockServer.getAddress().getPort();
            mockServer.createContext("/embeddings", exchange -> {
                String auth = exchange.getRequestHeaders().getFirst("Authorization");
                String reqBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                assertEquals("Bearer sk-mvp-test", auth);
                assertTrue(reqBody.contains("\"dimensions\":768"));
                assertTrue(reqBody.contains("text-embedding-3-small"));

                String resp = "{\"data\":[{\"embedding\":" + fake768 + "}]}";
                byte[] bytes = resp.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
            });

            mockServer.createContext("/api/embeddings", exchange -> {
                String reqBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                assertTrue(reqBody.contains("nomic-embed-text"));

                String resp = "{\"embedding\":" + fake768 + "}";
                byte[] bytes = resp.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
            });
            mockServer.start();

            String baseUrl = "http://localhost:" + port;
            EmbeddingService openAiSvc = new EmbeddingService(
                    objectMapper, "auto", 768,
                    "sk-mvp-test", baseUrl, "text-embedding-3-small",
                    "gm-ignored", "gemini-embedding-001",
                    baseUrl, "nomic-embed-text"
            );
            assertEquals("openai", openAiSvc.getActiveProviderName());
            String openAiVec = openAiSvc.embedToPgVectorLiteral("presión alta");
            assertTrue(openAiVec.startsWith("[0.800000,0.010000"));

            EmbeddingService localSvc = new EmbeddingService(
                    objectMapper, "local", 768,
                    "", baseUrl, "text-embedding-3-small",
                    "", "gemini-embedding-001",
                    baseUrl, "nomic-embed-text"
            );
            assertEquals("local", localSvc.getActiveProviderName());
            String localVec = localSvc.embedToPgVectorLiteral("salida de balón");
            assertTrue(localVec.startsWith("[0.800000,0.010000"));
        } finally {
            mockServer.stop(0);
        }
    }

    @Test
    void clamAvScannerValidatesCleanPdfAndBlocksMalwareStream() throws Exception {
        Path cleanTemp = Files.createTempFile("clam_clean_", ".pdf");
        Files.write(cleanTemp, createTestPdfBytes("TACTICA", "Documento limpio"));

        try (ServerSocket cleanServer = new ServerSocket(0)) {
            int cleanPort = cleanServer.getLocalPort();
            Thread cleanThread = new Thread(() -> acceptMockClamAv(cleanServer, "stream: OK\0"));
            cleanThread.start();

            FileSecurityScanner cleanScanner = new FileSecurityScanner(true, "localhost", cleanPort);
            String sha = cleanScanner.validateAndScanPdf(cleanTemp);
            assertEquals(64, sha.length());
            cleanThread.join(3000);
        } finally {
            Files.deleteIfExists(cleanTemp);
        }

        Path infectedTemp = Files.createTempFile("clam_bad_", ".pdf");
        Files.write(infectedTemp, createTestPdfBytes("VIRUS", "Payload prueba"));
        try (ServerSocket badServer = new ServerSocket(0)) {
            int badPort = badServer.getLocalPort();
            Thread badThread = new Thread(() -> acceptMockClamAv(badServer, "stream: Eicar-Test-Signature FOUND\0"));
            badThread.start();

            FileSecurityScanner badScanner = new FileSecurityScanner(true, "localhost", badPort);
            ResponseStatusException ex = assertThrows(
                    ResponseStatusException.class,
                    () -> badScanner.validateAndScanPdf(infectedTemp)
            );
            assertEquals(400, ex.getStatusCode().value());
            badThread.join(3000);
        } finally {
            Files.deleteIfExists(infectedTemp);
        }
    }

    @Test
    void scannedImagePdfTriggersOcrAndMatchesOnlySameEmbeddingModel() throws Exception {
        String expIdSameModel = "ocr-exp-" + UUID.randomUUID().toString().substring(0, 8);
        String expIdOtherModel = "other-exp-" + UUID.randomUUID().toString().substring(0, 8);
        String tenantId = "ocr-tenant-" + UUID.randomUUID().toString().substring(0, 6);

        StringBuilder vecA = new StringBuilder("[");
        StringBuilder vecDifferentModel = new StringBuilder("[");
        for (int i = 0; i < 768; i++) {
            if (i > 0) {
                vecA.append(',');
                vecDifferentModel.append(',');
            }
            vecA.append(i == 0 ? "0.9" : "0.02");
            vecDifferentModel.append(i == 0 ? "0.99" : "0.0");
        }
        vecA.append(']');
        vecDifferentModel.append(']');

        HttpServer mockAiAndOcr = HttpServer.create(new InetSocketAddress(0), 0);
        Path scannedTemp = Files.createTempFile("scanned_ocr_", ".pdf");
        try {
            int port = mockAiAndOcr.getAddress().getPort();
            mockAiAndOcr.createContext("/ocr", exchange -> {
                String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                assertTrue(body.contains("\"imageBase64\""));
                String resp = "{\"text\":\"1. MARCA EN ZONA OCR999\\nCobertura del cierre por eje central en futsal.\"}";
                byte[] out = resp.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, out.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(out);
                }
            });
            mockAiAndOcr.createContext("/embeddings", exchange -> {
                String resp = "{\"data\":[{\"embedding\":" + vecA + "}]}";
                byte[] out = resp.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, out.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(out);
                }
            });
            mockAiAndOcr.start();

            String baseUrl = "http://localhost:" + port;
            EmbeddingService openAiMockSvc = new EmbeddingService(
                    objectMapper, "openai", 768,
                    "sk-ocr-test", baseUrl, "text-embedding-3-small",
                    "", "gemini-embedding-001", baseUrl, "nomic-embed-text"
            );
            OcrService ocrSvc = new OcrService(
                    objectMapper, "false", "tesseract", "spa+eng",
                    baseUrl + "/ocr", false,
                    "", "gemini-3.1-flash-lite", "", baseUrl, "gpt-4o-mini"
            );
            AsyncPdfProcessor processor = new AsyncPdfProcessor(
                    chunkRepository, expedienteRepository, openAiMockSvc, ocrSvc,
                    2200, 350, "DELETE_ON_VERIFY"
            );

            Files.write(scannedTemp, createImageOnlyScannedPdfBytes("ESCANEADO"));
            expedienteRepository.create(new Expediente(
                    expIdSameModel, tenantId, "coach_ocr", "Futsal", "Escaneado OCR",
                    "escaneado.pdf", "0000", Files.size(scannedTemp),
                    "PENDING", false, 0, 0, "openai", "text-embedding-3-small",
                    "TENANT", null, false, Instant.now(), null
            ));

            PdfUploadResponse uploadResp = processor.processPdfInternal(
                    expIdSameModel, scannedTemp, tenantId, "Futsal", "escaneado.pdf", "TENANT"
            );

            assertTrue(uploadResp.ocrUsed(), "PDF sin texto seleccionable debe activar OCR");
            assertTrue(uploadResp.tempDeleted(), "Copia temporal debe eliminarse tras verificación");
            assertFalse(Files.exists(scannedTemp), "El archivo temporal no debe permanecer en disco");
            assertEquals("text-embedding-3-small", uploadResp.embeddingModel());

            // Insertar otro documento bajo un modelo diferente para validar filtro estricto por modelo en vectores
            expedienteRepository.create(new Expediente(
                    expIdOtherModel, tenantId, "coach_ocr", "Futsal", "Otro Modelo",
                    "otro_modelo.pdf", "1111", 100L,
                    "VERIFIED", false, 1, 1, "legacy", "legacy-embed-v0",
                    "TENANT", null, true, Instant.now(), Instant.now()
            ));
            chunkRepository.saveChunks(List.of(DocumentChunk.forExpedienteInsert(
                    tenantId, expIdOtherModel, "Futsal", "otro_modelo.pdf", 1,
                    "Seccion Legacy", 0, "Contenido distinto sin keywords coincidentes",
                    vecDifferentModel.toString(), "legacy-embed-v0", "TENANT"
            )), "expediente");

            List<DocumentChunk> hybridHits = chunkRepository.findHybridChunks(
                    tenantId, "coach_ocr", false, "Futsal",
                    vecA.toString(), "text-embedding-3-small", "OCR999 cierre central", 5, false
            );
            assertTrue(hybridHits.stream().anyMatch(c -> c.chunkText().contains("OCR999")));
            assertTrue(hybridHits.stream().anyMatch(c ->
                    c.chunkText().contains("OCR999") && "text-embedding-3-small".equals(c.embeddingModel())
            ));
            // Verifica combinación real vectorial (<=>) + full-text (tsvector) + reranking RRF
            assertTrue(hybridHits.stream().anyMatch(c -> c.chunkText().contains("OCR999") && "hybrid".equals(c.retrievalMode())),
                    "El fragmento debe ser recuperado mediante búsqueda híbrida (vectorial + full-text tsvector)");
            assertTrue(hybridHits.stream().noneMatch(c -> "legacy-embed-v0".equals(c.embeddingModel())),
                    "No debe mezclar vectores indexados con otro modelo");
        } finally {
            mockAiAndOcr.stop(0);
            Files.deleteIfExists(scannedTemp);
            jdbcTemplate.update("DELETE FROM document_chunks WHERE expediente_id IN (?, ?)", expIdSameModel, expIdOtherModel);
            jdbcTemplate.update("DELETE FROM expedientes WHERE id IN (?, ?)", expIdSameModel, expIdOtherModel);
        }
    }

    @Test
    void endpointsRequireJwtValidatePdfSignatureAndIsolateTenants() throws Exception {
        mockMvc.perform(get("/api/v1/expedientes")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/system/shutdown")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/tactical/ask")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"hola\",\"modality\":\"Futsal\"}"))
                .andExpect(status().isUnauthorized());

        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String userA = "testcoach_a_" + suffix;
        String userA2 = "testcoach_a2_" + suffix;
        String userB = "testcoach_b_" + suffix;
        String clubA = "ClubTestA_" + suffix;
        String clubB = "ClubTestB_" + suffix;
        String expId = null;
        String asyncExpId = null;

        try {
            MvcResult regARes = mockMvc.perform(post("/api/v1/auth/register")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "username", userA,
                                    "password", "TestPass2026!",
                                    "displayName", "Coach Alfa",
                                    "clubName", clubA
                            ))))
                    .andExpect(status().isCreated())
                    .andReturn();
            JsonNode regAJson = objectMapper.readTree(regARes.getResponse().getContentAsString());
            String tokenA = regAJson.get("token").asText();
            String tenantA = regAJson.get("tenantId").asText();

            String tokenA2 = jwtService.generateToken(new AuthPrincipal(userA2, "Asistente Alfa", tenantA, List.of("ROLE_COACH")));

            MvcResult regBRes = mockMvc.perform(post("/api/v1/auth/register")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "username", userB,
                                    "password", "TestPass2026!",
                                    "displayName", "Coach Beta",
                                    "clubName", clubB
                            ))))
                    .andExpect(status().isCreated())
                    .andReturn();
            JsonNode regBJson = objectMapper.readTree(regBRes.getResponse().getContentAsString());
            String tokenB = regBJson.get("token").asText();
            String tenantB = regBJson.get("tenantId").asText();

            MockMultipartFile fakePdf = new MockMultipartFile(
                    "file", "malware.pdf", "application/pdf",
                    "MZ_SPOOFED_EXECUTABLE_CONTENT".getBytes(StandardCharsets.UTF_8)
            );
            mockMvc.perform(multipart("/api/v1/documents/upload-pdf")
                            .file(fakePdf)
                            .param("modality", "Futsal")
                            .header("Authorization", "Bearer " + tokenA))
                    .andExpect(status().isBadRequest());

            byte[] realPdfBytes = createTestPdfBytes(
                    "1. PRESION TRAS PERDIDA",
                    "Protocolo exclusivo del club Alfa: activar trampa tactica ZETA99 en banda derecha tras perdida."
            );
            MockMultipartFile realPdf = new MockMultipartFile(
                    "file", "manual_alfa.pdf", "application/pdf", realPdfBytes
            );

            long tempBefore = Files.list(Path.of(System.getProperty("java.io.tmpdir")))
                    .filter(p -> p.getFileName().toString().startsWith("tacticalplay_ingest_"))
                    .count();

            MvcResult uploadRes = mockMvc.perform(multipart("/api/v1/documents/upload-pdf")
                            .file(realPdf)
                            .param("modality", "Futsal")
                            .param("permissions", "PRIVATE")
                            .param("async", "false")
                            .header("Authorization", "Bearer " + tokenA))
                    .andExpect(status().isCreated())
                    .andReturn();

            JsonNode uploadJson = objectMapper.readTree(uploadRes.getResponse().getContentAsString());
            expId = uploadJson.get("expediente_id").asText();
            assertEquals("READY", uploadJson.get("status").asText());
            assertTrue(uploadJson.get("verified").asBoolean());
            assertTrue(uploadJson.get("chunks_saved").asInt() >= 1);
            assertTrue(uploadJson.get("temp_deleted").asBoolean());

            long tempAfter = Files.list(Path.of(System.getProperty("java.io.tmpdir")))
                    .filter(p -> p.getFileName().toString().startsWith("tacticalplay_ingest_"))
                    .count();
            assertTrue(tempAfter <= tempBefore, "No deben quedar copias temporales de ingesta PDF en disco");

            // Verificar columnas reales persistidas en PostgreSQL: page_number, section_title, chunk_order, embedding_model, tenant_id, search_tsv
            var storedMeta = jdbcTemplate.queryForMap(
                    "SELECT tenant_id, page_number, section_title, chunk_order, (search_tsv IS NOT NULL) AS has_tsv " +
                    "FROM document_chunks WHERE expediente_id = ? LIMIT 1",
                    expId
            );
            assertEquals(tenantA, storedMeta.get("tenant_id"));
            assertEquals(1, ((Number) storedMeta.get("page_number")).intValue());
            assertTrue(String.valueOf(storedMeta.get("section_title")).contains("PRESION TRAS PERDIDA"));
            assertEquals(0, ((Number) storedMeta.get("chunk_order")).intValue());
            assertEquals(Boolean.TRUE, storedMeta.get("has_tsv"));

            // Repositorio debe rechazar consultas sin tenant_id explícito
            assertThrows(IllegalArgumentException.class,
                    () -> chunkRepository.findHybridChunks("", userA, false, "Futsal", null, "ZETA99", 5));

            mockMvc.perform(get("/api/v1/expedientes/" + expId + "/chunks")
                            .header("Authorization", "Bearer " + tokenA))
                    .andExpect(status().isOk());
            mockMvc.perform(get("/api/v1/expedientes/" + expId + "/chunks")
                            .header("Authorization", "Bearer " + tokenA2))
                    .andExpect(status().isForbidden());

            List<DocumentChunk> hitsA = chunkRepository.findHybridChunks(
                    tenantA, userA, false, "Futsal", null, "trampa tactica ZETA99", 5
            );
            assertTrue(hitsA.stream().anyMatch(c -> c.chunkText().contains("ZETA99")));
            assertTrue(hitsA.stream().anyMatch(c ->
                    c.sectionTitle() != null && c.sectionTitle().contains("PRESION TRAS PERDIDA")
            ));

            List<DocumentChunk> hitsA2 = chunkRepository.findHybridChunks(
                    tenantA, userA2, false, "Futsal", null, "trampa tactica ZETA99", 5
            );
            assertTrue(hitsA2.stream().noneMatch(c -> c.chunkText().contains("ZETA99")));

            List<DocumentChunk> hitsB = chunkRepository.findHybridChunks(
                    tenantB, userB, false, "Futsal", null, "trampa tactica ZETA99", 5
            );
            assertTrue(hitsB.stream().noneMatch(c -> c.chunkText().contains("ZETA99")));

            // Consultar /tactical/ask autenticado como Tenant A devuelve citas estructuradas del PDF real
            MvcResult askResA = mockMvc.perform(post("/api/v1/tactical/ask")
                            .header("Authorization", "Bearer " + tokenA)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"message\":\"Explica ZETA99\",\"modality\":\"Futsal\",\"tenantDocsOnly\":true}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode askJsonA = objectMapper.readTree(askResA.getResponse().getContentAsString());
            assertTrue(askJsonA.path("citations").isArray());
            assertFalse(askJsonA.path("citations").isEmpty());
            assertEquals("manual_alfa.pdf", askJsonA.path("citations").get(0).path("source").asText());
            assertEquals(1, askJsonA.path("citations").get(0).path("page").asInt());

            // Consultar /tactical/ask autenticado como Tenant B (0 docs propios) no filtra chunks de A ni inventa fuentes
            MvcResult askResB = mockMvc.perform(post("/api/v1/tactical/ask")
                            .header("Authorization", "Bearer " + tokenB)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"message\":\"Explica ZETA99\",\"modality\":\"Futsal\",\"tenantDocsOnly\":true}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode askJsonB = objectMapper.readTree(askResB.getResponse().getContentAsString());
            assertTrue(askJsonB.path("sources").isEmpty(), "Sin chunks del tenant, sources debe estar vacío sin inventar citas");
            assertTrue(askJsonB.path("citations").isEmpty(), "Sin chunks del tenant, citations debe estar vacío");
            assertFalse(askJsonB.path("reply").asText().contains("manual_alfa.pdf"));
            assertTrue(askJsonB.path("reply").asText().contains("Sin documentos indexados coincidentes"));

            mockMvc.perform(get("/api/v1/expedientes/" + expId)
                            .header("Authorization", "Bearer " + tokenB))
                    .andExpect(status().isNotFound());
            mockMvc.perform(get("/api/v1/expedientes/" + expId)
                            .header("Authorization", "Bearer " + tokenA2))
                    .andExpect(status().isForbidden());

            byte[] asyncPdfBytes = createTestPdfBytes(
                    "2. SALIDA LAVOLPIANA",
                    "Protocolo compartido del club Alfa: salida de tres jugadores OMEGA77 en cancha."
            );
            MockMultipartFile asyncPdf = new MockMultipartFile(
                    "file", "salida_alfa.pdf", "application/pdf", asyncPdfBytes
            );
            MvcResult asyncRes = mockMvc.perform(multipart("/api/v1/documents/upload-pdf")
                            .file(asyncPdf)
                            .param("modality", "Futsal")
                            .param("permissions", "TENANT")
                            .header("Authorization", "Bearer " + tokenA))
                    .andExpect(status().isAccepted())
                    .andReturn();
            asyncExpId = objectMapper.readTree(asyncRes.getResponse().getContentAsString()).get("expediente_id").asText();

            String asyncStatus = "PENDING";
            boolean asyncTempDeleted = false;
            for (int attempt = 0; attempt < 30; attempt++) {
                Thread.sleep(250);
                MvcResult pollRes = mockMvc.perform(get("/api/v1/expedientes/" + asyncExpId)
                                .header("Authorization", "Bearer " + tokenA2))
                        .andExpect(status().isOk())
                        .andReturn();
                JsonNode pollJson = objectMapper.readTree(pollRes.getResponse().getContentAsString());
                asyncStatus = pollJson.get("status").asText();
                asyncTempDeleted = pollJson.get("tempDeleted").asBoolean();
                if ("READY".equals(asyncStatus) || "FAILED".equals(asyncStatus)) {
                    break;
                }
            }
            assertEquals("READY", asyncStatus);
            assertTrue(asyncTempDeleted);

            mockMvc.perform(delete("/api/v1/expedientes/" + expId)
                            .header("Authorization", "Bearer " + tokenA))
                    .andExpect(status().isOk());
            expId = null;
            mockMvc.perform(delete("/api/v1/expedientes/" + asyncExpId)
                            .header("Authorization", "Bearer " + tokenA))
                    .andExpect(status().isOk());
            asyncExpId = null;
        } finally {
            if (expId != null) {
                jdbcTemplate.update("DELETE FROM document_chunks WHERE expediente_id = ?", expId);
                jdbcTemplate.update("DELETE FROM expedientes WHERE id = ?", expId);
            }
            if (asyncExpId != null) {
                jdbcTemplate.update("DELETE FROM document_chunks WHERE expediente_id = ?", asyncExpId);
                jdbcTemplate.update("DELETE FROM expedientes WHERE id = ?", asyncExpId);
            }
            jdbcTemplate.update("DELETE FROM app_users WHERE username IN (?, ?)", userA, userB);
        }
    }

    @Test
    void registrationEmailLoginAndChatHistoryAreStrictlyIsolatedPerUser() throws Exception {
        mockMvc.perform(get("/api/chat/sessions")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"hola\",\"modality\":\"Futsal\"}"))
                .andExpect(status().isUnauthorized());

        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String user1 = "hist_coach1_" + suffix;
        String email1 = "coach1_" + suffix + "@tacticalplay.test";
        String user2 = "hist_coach2_" + suffix;
        String email2 = "coach2_" + suffix + "@tacticalplay.test";

        String demoSessionId = null;
        String demoKey = null;
        try {
            // 1. Registro completo sin clubName -> genera tenant_id único aislado
            MvcResult reg1Res = mockMvc.perform(post("/api/auth/register")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "fullName", "Entrenador Uno Táctico",
                                    "username", user1,
                                    "email", email1,
                                    "password", "TacticalPass2026!"
                            ))))
                    .andExpect(status().isCreated())
                    .andReturn();
            JsonNode reg1 = objectMapper.readTree(reg1Res.getResponse().getContentAsString());
            long user1Id = reg1.get("userId").asLong();
            String tenant1 = reg1.get("tenantId").asText();
            assertEquals(email1, reg1.get("email").asText());
            assertEquals("Entrenador Uno Táctico", reg1.get("fullName").asText());

            // 2. Login real usando correo electrónico + /api/auth/me
            MvcResult login1Res = mockMvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "identifier", email1,
                                    "password", "TacticalPass2026!"
                            ))))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode login1 = objectMapper.readTree(login1Res.getResponse().getContentAsString());
            String token1 = login1.get("token").asText();
            assertEquals(user1Id, login1.get("userId").asLong());
            assertEquals(tenant1, login1.get("tenantId").asText());

            MvcResult meRes = mockMvc.perform(get("/api/auth/me")
                            .header("Authorization", "Bearer " + token1))
                    .andExpect(status().isOk())
                    .andReturn();
            assertEquals(user1, objectMapper.readTree(meRes.getResponse().getContentAsString()).get("username").asText());

            // 3. Usuario 1 envía consulta sin sessionId -> crea chat_session y persiste user+assistant
            MvcResult chat1Res = mockMvc.perform(post("/api/chat")
                            .header("Authorization", "Bearer " + token1)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "message", "¿Cómo organizar salida 3+1 contra presión alta?",
                                    "modality", "Futsal",
                                    "formation", "1-3-1 (Rombo)",
                                    "playStyle", "Posesión & Juego de Posición"
                            ))))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode chat1Json = objectMapper.readTree(chat1Res.getResponse().getContentAsString());
            String sessionId = chat1Json.get("sessionId").asText();
            assertNotNull(sessionId);
            assertFalse(sessionId.isBlank());

            // Segundo turno en la misma conversación
            MvcResult chat2Res = mockMvc.perform(post("/api/chat")
                            .header("Authorization", "Bearer " + token1)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "message", "¿Qué ajuste hace el pívot en segunda jugada?",
                                    "modality", "Futsal",
                                    "sessionId", sessionId
                            ))))
                    .andExpect(status().isOk())
                    .andReturn();
            assertEquals(sessionId, objectMapper.readTree(chat2Res.getResponse().getContentAsString()).get("sessionId").asText());

            // Verificar historial completo de Usuario 1
            MvcResult list1Res = mockMvc.perform(get("/api/chat/sessions")
                            .header("Authorization", "Bearer " + token1))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode list1 = objectMapper.readTree(list1Res.getResponse().getContentAsString());
            assertEquals(1, list1.size());
            assertEquals(sessionId, list1.get(0).get("id").asText());
            assertEquals(4, list1.get(0).get("messageCount").asInt());

            MvcResult msgs1Res = mockMvc.perform(get("/api/chat/sessions/" + sessionId + "/messages")
                            .header("Authorization", "Bearer " + token1))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode msgs1 = objectMapper.readTree(msgs1Res.getResponse().getContentAsString()).get("messages");
            assertEquals(4, msgs1.size());
            assertEquals("user", msgs1.get(0).get("role").asText());
            assertEquals("assistant", msgs1.get(1).get("role").asText());
            assertTrue(msgs1.get(1).has("sources"));

            // 4. Registro de Usuario 2 -> aislamiento total y 403 Forbidden cruzado
            MvcResult reg2Res = mockMvc.perform(post("/api/auth/register")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "fullName", "Entrenador Dos Rival",
                                    "username", user2,
                                    "email", email2,
                                    "password", "RivalPass2026!"
                            ))))
                    .andExpect(status().isCreated())
                    .andReturn();
            String token2 = objectMapper.readTree(reg2Res.getResponse().getContentAsString()).get("token").asText();

            MvcResult list2Res = mockMvc.perform(get("/api/chat/sessions")
                            .header("Authorization", "Bearer " + token2))
                    .andExpect(status().isOk())
                    .andReturn();
            assertEquals(0, objectMapper.readTree(list2Res.getResponse().getContentAsString()).size());

            mockMvc.perform(get("/api/chat/sessions/" + sessionId + "/messages")
                            .header("Authorization", "Bearer " + token2))
                    .andExpect(status().isForbidden());

            mockMvc.perform(post("/api/chat")
                            .header("Authorization", "Bearer " + token2)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "message", "Intento leer o escribir sesión ajena",
                                    "modality", "Futsal",
                                    "sessionId", sessionId
                            ))))
                    .andExpect(status().isForbidden());

            mockMvc.perform(delete("/api/chat/sessions/" + sessionId)
                            .header("Authorization", "Bearer " + token2))
                    .andExpect(status().isForbidden());

            // 5. Usuario 1 elimina su propia sesión cleanly
            mockMvc.perform(delete("/api/chat/sessions/" + sessionId)
                            .header("Authorization", "Bearer " + token1))
                    .andExpect(status().isOk());

            // 6. Modo Demo: huella persistente de dispositivo + límite irreversible de 15 consultas (403 DEMO_LIMIT_REACHED)
            String demoDeviceId = "test-demo-device-" + suffix;
            MvcResult demoRes = mockMvc.perform(post("/api/auth/demo")
                            .header("X-Demo-Device-Id", demoDeviceId))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode demoJson = objectMapper.readTree(demoRes.getResponse().getContentAsString());
            assertTrue(demoJson.get("isDemo").asBoolean());
            assertEquals(15, demoJson.get("demoQueriesLimit").asInt());
            assertEquals(15, demoJson.get("demoQueriesRemaining").asInt());
            String demoToken = demoJson.get("token").asText();
            demoKey = jwtService.parseAndValidate(demoToken).orElseThrow().demoKey();
            assertEquals(demoDeviceId, demoKey);

            mockMvc.perform(get("/api/v1/squad/players")
                            .header("Authorization", "Bearer " + demoToken))
                    .andExpect(status().isForbidden());
            mockMvc.perform(post("/api/v1/squad/demo")
                            .header("Authorization", "Bearer " + demoToken))
                    .andExpect(status().isForbidden());

            // Consulta #1 real vía POST /api/chat
            MvcResult q1Res = mockMvc.perform(post("/api/chat")
                            .header("Authorization", "Bearer " + demoToken)
                            .header("X-Demo-Device-Id", demoDeviceId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "message", "Consulta demo #1 sobre salida 1-3-1",
                                    "modality", "Futsal"
                            ))))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode q1Json = objectMapper.readTree(q1Res.getResponse().getContentAsString());
            demoSessionId = q1Json.get("sessionId").asText();
            assertEquals(1, q1Json.get("demoQueriesUsed").asInt());
            assertEquals(14, q1Json.get("demoQueriesRemaining").asInt());

            // Consultas #2..#14 atómicas en PostgreSQL demo_usage
            for (int q = 2; q <= 14; q++) {
                var status = demoQuotaRepository.consumeQueryOrThrow(demoKey);
                assertEquals(q, status.queriesUsed());
                assertEquals(15 - q, status.remaining());
            }

            // Consulta #15 (última permitida) real vía POST /api/chat en la misma sesión
            MvcResult q15Res = mockMvc.perform(post("/api/chat")
                            .header("Authorization", "Bearer " + demoToken)
                            .header("X-Demo-Device-Id", demoDeviceId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "message", "Consulta demo #15 sobre bloqueo",
                                    "modality", "Futsal",
                                    "sessionId", demoSessionId
                            ))))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode q15Json = objectMapper.readTree(q15Res.getResponse().getContentAsString());
            assertEquals(15, q15Json.get("demoQueriesUsed").asInt());
            assertEquals(0, q15Json.get("demoQueriesRemaining").asInt());

            // Consulta #16 en Modo Demo debe ser bloqueada con 403 Forbidden y código estructurado DEMO_QUERIES_EXHAUSTED
            MvcResult q16BlockedRes = mockMvc.perform(post("/api/chat")
                            .header("Authorization", "Bearer " + demoToken)
                            .header("X-Demo-Device-Id", demoDeviceId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "message", "Consulta demo #16 debe bloquearse",
                                    "modality", "Futsal",
                                    "sessionId", demoSessionId
                            ))))
                    .andExpect(status().isForbidden())
                    .andReturn();
            JsonNode q16BlockedJson = objectMapper.readTree(q16BlockedRes.getResponse().getContentAsString());
            assertEquals("DEMO_QUERIES_EXHAUSTED", q16BlockedJson.get("code").asText());

            // Reintentar POST /api/auth/demo con la misma huella tras agotar cuota -> 200 OK (pizarra libre) manteniendo 0/15 sin reiniciar
            MvcResult reenterDemoRes = mockMvc.perform(post("/api/auth/demo")
                            .header("X-Demo-Device-Id", demoDeviceId))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode reenterDemoJson = objectMapper.readTree(reenterDemoRes.getResponse().getContentAsString());
            assertTrue(reenterDemoJson.get("isDemo").asBoolean());
            assertTrue(reenterDemoJson.get("demoExhausted").asBoolean());
            assertEquals(15, reenterDemoJson.get("queriesUsed").asInt());
            assertEquals(0, reenterDemoJson.get("remainingQueries").asInt());
            assertEquals(0, reenterDemoJson.get("demoQueriesRemaining").asInt());
            String reenteredDemoToken = reenterDemoJson.get("token").asText();

            // Nuevo intento de consulta al chat con el nuevo JWT demo agotado -> sigue devolviendo 403 DEMO_QUERIES_EXHAUSTED
            MvcResult q17BlockedRes = mockMvc.perform(post("/api/chat")
                            .header("Authorization", "Bearer " + reenteredDemoToken)
                            .header("X-Demo-Device-Id", demoDeviceId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "message", "Consulta demo #17 tras reentrar debe bloquearse",
                                    "modality", "Futsal",
                                    "sessionId", demoSessionId
                            ))))
                    .andExpect(status().isForbidden())
                    .andReturn();
            assertEquals("DEMO_QUERIES_EXHAUSTED", objectMapper.readTree(q17BlockedRes.getResponse().getContentAsString()).get("code").asText());

            // GET /api/auth/demo/status confirma persistencia en 0/15
            MvcResult demoStatusRes = mockMvc.perform(get("/api/auth/demo/status")
                            .header("X-Demo-Device-Id", demoDeviceId))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode demoStatusJson = objectMapper.readTree(demoStatusRes.getResponse().getContentAsString());
            assertTrue(demoStatusJson.get("demoExhausted").asBoolean());
            assertEquals(15, demoStatusJson.get("queriesUsed").asInt());
            assertEquals(0, demoStatusJson.get("remainingQueries").asInt());
            assertEquals(0, demoStatusJson.get("demoQueriesRemaining").asInt());

            // Usuario registrado sí accede al Gestor de Plantilla
            mockMvc.perform(get("/api/v1/squad/players")
                            .header("Authorization", "Bearer " + token1))
                    .andExpect(status().isOk());
        } finally {
            if (demoSessionId != null) {
                jdbcTemplate.update("DELETE FROM chat_sessions WHERE id = ?", UUID.fromString(demoSessionId));
            }
            if (demoKey != null) {
                jdbcTemplate.update("DELETE FROM demo_usage WHERE device_id = ?", demoKey);
            }
            jdbcTemplate.update("DELETE FROM app_users WHERE username IN (?, ?)", user1, user2);
        }
    }

    @Test
    void swaggerUiAndOpenApiDocsAreAccessibleWithoutJwt() throws Exception {
        MvcResult docsRes = mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode docsJson = objectMapper.readTree(docsRes.getResponse().getContentAsString());
        assertEquals("TacticalPlay RAG API", docsJson.path("info").path("title").asText());
        assertTrue(docsJson.path("paths").has("/api/chat"));
        assertTrue(docsJson.path("paths").has("/api/auth/demo"));
        assertTrue(docsJson.path("paths").has("/api/v1/squad/players"));
        assertTrue(docsJson.path("components").path("securitySchemes").has("bearerAuth"));

        mockMvc.perform(get("/swagger-ui/index.html"))
                .andExpect(status().isOk());
    }

    @Test
    void chatServiceSwitchesFormationAndReturnsAppliedSystemWhenRequested() throws Exception {
        ChatResponse futsalSwitch = chatService.generateTacticalResponse(
                new ChatRequest("quiero probar una 1-2-1", "Futsal", "1-4-0 (Sistema Plano)", "Posesión & Juego de Posición")
        );
        assertEquals("1-1-2-1 (Pirámide)", futsalSwitch.appliedSystem());
        assertEquals("1-1-2-1 (Pirámide)", futsalSwitch.recommendedSystem());
        assertEquals("1-1-2-1 (Pirámide)", futsalSwitch.suggestedFormation());
        assertTrue(futsalSwitch.reply().contains("1-2-1") || futsalSwitch.reply().contains("1-1-2-1"));
        String json = objectMapper.writeValueAsString(futsalSwitch);
        JsonNode jsonNode = objectMapper.readTree(json);
        assertEquals("1-1-2-1 (Pirámide)", jsonNode.get("appliedSystem").asText());
        assertEquals("1-1-2-1 (Pirámide)", jsonNode.get("recommendedSystem").asText());

        ChatResponse diamondSwitch = chatService.generateTacticalResponse(
                new ChatRequest("cambia a 3-1 rombo", "Futsal", "1-4-0 (Sistema Plano)", "Posesión & Juego de Posición")
        );
        assertEquals("1-3-1 (Rombo)", diamondSwitch.appliedSystem());
        assertEquals("1-3-1 (Rombo)", diamondSwitch.suggestedFormation());

        ChatResponse opponentOnly = chatService.generateTacticalResponse(
                new ChatRequest("¿Cómo romper una defensa cerrada 2-2 en media cancha con mi sistema actual?", "Futsal", "1-4-0 (Sistema Plano)", "Posesión & Juego de Posición")
        );
        assertNull(opponentOnly.appliedSystem());
        assertEquals("1-4-0 (Sistema Plano)", opponentOnly.suggestedFormation());

        ChatResponse f11Switch = chatService.generateTacticalResponse(
                new ChatRequest("cambia a 4-2-3-1 para tener doble pivote", "Fútbol 11", "1-4-3-3", "Posesión & Juego de Posición")
        );
        assertEquals("1-4-2-3-1", f11Switch.appliedSystem());
        assertEquals("1-4-2-3-1", f11Switch.recommendedSystem());
        assertEquals("1-4-2-3-1", f11Switch.suggestedFormation());
    }

    @Test
    void registeredUserPdfUploadDefaultsToPrivateAndListsImmediatelyAndRetrievesSystemDocs() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String userA = "priv_a_" + suffix;
        String userB = "priv_b_" + suffix;
        String expId = null;

        try {
            MvcResult regARes = mockMvc.perform(post("/api/v1/auth/register")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "username", userA,
                                    "password", "TestPass2026!",
                                    "fullName", "Entrenador Privado A"
                            ))))
                    .andExpect(status().isCreated())
                    .andReturn();
            JsonNode regAJson = objectMapper.readTree(regARes.getResponse().getContentAsString());
            String tokenA = regAJson.get("token").asText();
            long userAId = regAJson.get("userId").asLong();
            String tenantA = regAJson.get("tenantId").asText();

            MvcResult regBRes = mockMvc.perform(post("/api/v1/auth/register")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(java.util.Map.of(
                                    "username", userB,
                                    "password", "TestPass2026!",
                                    "fullName", "Entrenador Privado B"
                            ))))
                    .andExpect(status().isCreated())
                    .andReturn();
            JsonNode regBJson = objectMapper.readTree(regBRes.getResponse().getContentAsString());
            String tokenB = regBJson.get("token").asText();
            long userBId = regBJson.get("userId").asLong();

            byte[] pdfBytes = createTestPdfBytes(
                    "1. VARIANTE PRIVADA KRONOS99",
                    "Táctica exclusiva del usuario privado A sobre presión tras pérdida en Futsal KRONOS99."
            );
            MockMultipartFile pdfFile = new MockMultipartFile(
                    "file", "privado_a.pdf", "application/pdf", pdfBytes
            );

            // Subida a POST /api/documents/upload SIN parámetro permissions ni visibility -> PRIVATE + owner_user_id
            MvcResult uploadRes = mockMvc.perform(multipart("/api/documents/upload")
                            .file(pdfFile)
                            .param("modality", "Futsal")
                            .param("title", "Manual Privado A")
                            .param("async", "false")
                            .header("Authorization", "Bearer " + tokenA))
                    .andExpect(status().isCreated())
                    .andReturn();
            JsonNode uploadJson = objectMapper.readTree(uploadRes.getResponse().getContentAsString());
            expId = uploadJson.get("expediente_id").asText();
            assertEquals("READY", uploadJson.get("status").asText());

            var expRow = jdbcTemplate.queryForMap(
                    "SELECT owner_user_id, tenant_id, permissions FROM expedientes WHERE id = ?",
                    expId
            );
            assertEquals(userAId, ((Number) expRow.get("owner_user_id")).longValue());
            assertEquals(tenantA, expRow.get("tenant_id"));
            assertEquals("PRIVATE", expRow.get("permissions"));

            var chunkRow = jdbcTemplate.queryForMap(
                    "SELECT owner_user_id, tenant_id, permissions FROM document_chunks WHERE expediente_id = ? LIMIT 1",
                    expId
            );
            assertEquals(userAId, ((Number) chunkRow.get("owner_user_id")).longValue());
            assertEquals(tenantA, chunkRow.get("tenant_id"));
            assertEquals("PRIVATE", chunkRow.get("permissions"));

            // Aparece inmediatamente en GET /api/v1/expedientes para el usuario A, pero NO para B
            MvcResult listARes = mockMvc.perform(get("/api/v1/expedientes")
                            .header("Authorization", "Bearer " + tokenA))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode listAJson = objectMapper.readTree(listARes.getResponse().getContentAsString());
            assertTrue(listAJson.isArray() && listAJson.size() >= 1);
            assertEquals(expId, listAJson.get(0).get("id").asText());
            assertEquals("Manual Privado A", listAJson.get(0).get("title").asText());

            MvcResult listBRes = mockMvc.perform(get("/api/v1/expedientes")
                            .header("Authorization", "Bearer " + tokenB))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode listBJson = objectMapper.readTree(listBRes.getResponse().getContentAsString());
            assertTrue(listBJson.isArray() && listBJson.isEmpty());

            // Token con mismo tenantA pero distinto userBId tampoco accede ni filtra chunks privados de A
            String sameTenantTokenB = jwtService.generateToken(
                    new AuthPrincipal(userBId, userB, null, "Entrenador B", tenantA, List.of("ROLE_COACH"))
            );
            mockMvc.perform(get("/api/v1/expedientes")
                            .header("Authorization", "Bearer " + sameTenantTokenB))
                    .andExpect(status().isOk())
                    .andExpect(result -> assertEquals("[]", result.getResponse().getContentAsString()));

            // Chat RAG de A recupera su documento privado + base del sistema; B (ni compartiendo tenant) recupera KRONOS99
            MvcResult chatARes = mockMvc.perform(post("/api/chat")
                            .header("Authorization", "Bearer " + tokenA)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"message\":\"Analiza KRONOS99 y principios tácticos de Futsal\",\"modality\":\"Futsal\"}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode chatAJson = objectMapper.readTree(chatARes.getResponse().getContentAsString());
            assertTrue(chatAJson.get("sources").toString().contains("privado_a.pdf"));

            MvcResult chatBRes = mockMvc.perform(post("/api/chat")
                            .header("Authorization", "Bearer " + sameTenantTokenB)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"message\":\"Analiza KRONOS99 en Futsal\",\"modality\":\"Futsal\"}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode chatBJson = objectMapper.readTree(chatBRes.getResponse().getContentAsString());
            assertFalse(chatBJson.get("sources").toString().contains("privado_a.pdf"));
        } finally {
            if (expId != null) {
                jdbcTemplate.update("DELETE FROM document_chunks WHERE expediente_id = ?", expId);
                jdbcTemplate.update("DELETE FROM expedientes WHERE id = ?", expId);
            }
            jdbcTemplate.update("DELETE FROM chat_sessions WHERE user_id IN (SELECT id FROM app_users WHERE username IN (?, ?))", userA, userB);
            jdbcTemplate.update("DELETE FROM app_users WHERE username IN (?, ?)", userA, userB);
        }
    }

    private void acceptMockClamAv(ServerSocket server, String reply) {
        try (Socket socket = server.accept()) {
            DataInputStream in = new DataInputStream(socket.getInputStream());
            byte[] header = new byte[10]; // "zINSTREAM\0"
            in.readFully(header);
            while (true) {
                int len = in.readInt();
                if (len == 0) {
                    break;
                }
                in.readNBytes(len);
            }
            socket.getOutputStream().write(reply.getBytes(StandardCharsets.UTF_8));
            socket.getOutputStream().flush();
        } catch (Exception ignored) {
        }
    }

    private byte[] createTestPdfBytes(String heading, String body) throws Exception {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 14);
                cs.newLineAtOffset(50, 720);
                cs.showText(heading);
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 11);
                cs.newLineAtOffset(0, -24);
                cs.showText(body);
                cs.endText();
            }
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private byte[] createImageOnlyScannedPdfBytes(String label) throws Exception {
        BufferedImage img = new BufferedImage(320, 120, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 320, 120);
        g.setColor(Color.BLACK);
        g.setFont(new Font("SansSerif", Font.BOLD, 20));
        g.drawString(label, 24, 60);
        g.dispose();

        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            PDImageXObject pdImage = LosslessFactory.createFromImage(doc, img);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(pdImage, 50, 600, 320, 120);
            }
            doc.save(baos);
            return baos.toByteArray();
        }
    }
}
