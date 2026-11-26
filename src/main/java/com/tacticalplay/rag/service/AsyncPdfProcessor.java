package com.tacticalplay.rag.service;

import com.tacticalplay.rag.dto.PdfUploadResponse;
import com.tacticalplay.rag.model.DocumentChunk;
import com.tacticalplay.rag.repository.DocumentChunkRepository;
import com.tacticalplay.rag.repository.ExpedienteRepository;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class AsyncPdfProcessor {

    private static final Logger log = LoggerFactory.getLogger(AsyncPdfProcessor.class);
    private static final int MIN_TEXT_THRESHOLD_FOR_OCR = 40;
    private static final Pattern NUMBERED_HEADING = Pattern.compile("^(?:\\d+(?:\\.\\d+)*[.)]?|CAP[IÍ]TULO\\s+\\w+|SECCI[OÓ]N\\s+\\w+)\\s+.{3,75}$");

    private final DocumentChunkRepository chunkRepository;
    private final ExpedienteRepository expedienteRepository;
    private final EmbeddingService embeddingService;
    private final OcrService ocrService;
    private final int targetChunkChars;
    private final int overlapChunkChars;
    private final String cleanupPolicy;

    public AsyncPdfProcessor(
            DocumentChunkRepository chunkRepository,
            ExpedienteRepository expedienteRepository,
            EmbeddingService embeddingService,
            OcrService ocrService,
            @Value("${rag.chunk.target-chars:2200}") int targetChunkChars,
            @Value("${rag.chunk.overlap-chars:350}") int overlapChunkChars,
            @Value("${rag.cleanup.policy:DELETE_ON_VERIFY}") String cleanupPolicy
    ) {
        this.chunkRepository = chunkRepository;
        this.expedienteRepository = expedienteRepository;
        this.embeddingService = embeddingService;
        this.ocrService = ocrService;
        this.targetChunkChars = Math.max(400, targetChunkChars);
        this.overlapChunkChars = Math.max(50, Math.min(overlapChunkChars, this.targetChunkChars / 2));
        this.cleanupPolicy = cleanupPolicy != null ? cleanupPolicy.trim().toUpperCase() : "DELETE_ON_VERIFY";
    }

    @Async("pdfIngestionExecutor")
    public void processPdfAsync(
            String expedienteId,
            Path tempFile,
            String tenantId,
            String modality,
            String originalFilename,
            String permissions
    ) {
        processPdfAsync(expedienteId, tempFile, tenantId, null, modality, originalFilename, permissions);
    }

    @Async("pdfIngestionExecutor")
    public void processPdfAsync(
            String expedienteId,
            Path tempFile,
            String tenantId,
            Long ownerUserId,
            String modality,
            String originalFilename,
            String permissions
    ) {
        try {
            processPdfInternal(expedienteId, tempFile, tenantId, ownerUserId, modality, originalFilename, permissions);
        } catch (Exception ex) {
            log.error("Fallo en procesamiento asíncrono de expediente {}: {}", expedienteId, ex.getMessage(), ex);
        }
    }

    public PdfUploadResponse processPdfInternal(
            String expedienteId,
            Path tempFile,
            String tenantId,
            String modality,
            String originalFilename,
            String permissions
    ) throws IOException {
        return processPdfInternal(expedienteId, tempFile, tenantId, null, modality, originalFilename, permissions);
    }

    public PdfUploadResponse processPdfInternal(
            String expedienteId,
            Path tempFile,
            String tenantId,
            Long ownerUserId,
            String modality,
            String originalFilename,
            String permissions
    ) throws IOException {
        boolean anyOcrUsed = false;
        int totalPages = 0;
        int savedCount = 0;
        String activeProvider = embeddingService.getActiveProviderName();
        String activeModel = embeddingService.getActiveModelName();
        boolean tempDeleted = false;

        try {
            expedienteRepository.updateStatus(expedienteId, "PROCESSING");

            List<DocumentChunk> chunksToSave = new ArrayList<>();
            int globalOrder = 0;

            try (PDDocument document = Loader.loadPDF(tempFile.toFile())) {
                totalPages = document.getNumberOfPages();
                Map<Integer, String> outlineSections = extractOutlineMap(document);
                PDFTextStripper stripper = new PDFTextStripper();
                String currentSection = "Documento General";

                for (int page = 1; page <= totalPages; page++) {
                    if (outlineSections.containsKey(page)) {
                        currentSection = outlineSections.get(page);
                    }

                    stripper.setStartPage(page);
                    stripper.setEndPage(page);
                    String pageText = stripper.getText(document);
                    String trimmed = pageText != null ? pageText.trim() : "";

                    if (trimmed.length() < MIN_TEXT_THRESHOLD_FOR_OCR) {
                        expedienteRepository.updateProgress(expedienteId, "OCR_RUNNING", totalPages, anyOcrUsed);
                        OcrService.OcrResult ocrResult = ocrService.extractTextFromScannedPage(document, page - 1);
                        if (ocrResult.ocrApplied() && !ocrResult.text().isBlank()) {
                            pageText = ocrResult.text();
                            anyOcrUsed = true;
                            log.info("OCR aplicado ({}) en {} pág. {}", ocrResult.engineUsed(), originalFilename, page);
                        }
                    }

                    currentSection = detectSectionOnPage(pageText, outlineSections.get(page), currentSection);
                    List<String> pageChunks = splitTextIntoChunks(pageText, targetChunkChars, overlapChunkChars);

                    for (String chunkText : pageChunks) {
                        String embeddingLiteral = null;
                        if (embeddingService.isConfigured()) {
                            try {
                                embeddingLiteral = embeddingService.embedToPgVectorLiteral(chunkText);
                            } catch (Exception ex) {
                                log.warn("No se pudo generar embedding para fragmento de {} (Pág. {}): {}",
                                        originalFilename, page, ex.getMessage());
                            }
                        }

                        chunksToSave.add(DocumentChunk.forExpedienteInsert(
                                tenantId,
                                expedienteId,
                                modality,
                                originalFilename,
                                page,
                                currentSection,
                                globalOrder++,
                                chunkText,
                                embeddingLiteral,
                                embeddingLiteral != null ? activeModel : null,
                                permissions,
                                ownerUserId
                        ));
                    }
                }
            }

            expedienteRepository.updateProgress(expedienteId, "INDEXING", totalPages, anyOcrUsed);
            savedCount = chunkRepository.saveChunks(chunksToSave, "expediente");

            // Verificación explícita de indexación en PostgreSQL antes de eliminar la copia temporal
            int verifiedCount = chunkRepository.countByExpedienteId(expedienteId);
            if (savedCount > 0 && verifiedCount < savedCount) {
                throw new IllegalStateException(
                        "Verificación de indexación incompleta: esperados " + savedCount + ", confirmados " + verifiedCount
                );
            }

            if (!"RETAIN_FOR_AUDIT".equals(cleanupPolicy)) {
                tempDeleted = Files.deleteIfExists(tempFile);
            }

            expedienteRepository.markReady(
                    expedienteId,
                    totalPages,
                    verifiedCount,
                    anyOcrUsed,
                    activeProvider,
                    activeModel,
                    tempDeleted
            );

            String statusMsg = String.format(
                    "PDF verificado en PostgreSQL + pgvector (%d fragmentos, %d págs.%s, modelo: %s). Política temporal (%s): %s.",
                    verifiedCount,
                    totalPages,
                    anyOcrUsed ? ", OCR aplicado" : "",
                    activeModel,
                    cleanupPolicy,
                    tempDeleted ? "eliminado" : "retenido"
            );

            return new PdfUploadResponse(
                    expedienteId,
                    originalFilename,
                    tenantId,
                    modality,
                    "READY",
                    totalPages,
                    verifiedCount,
                    anyOcrUsed,
                    activeModel,
                    true,
                    tempDeleted,
                    statusMsg
            );
        } catch (Exception ex) {
            boolean cleanedOnError = false;
            if (!"RETAIN_ON_FAILURE".equals(cleanupPolicy) && !"RETAIN_FOR_AUDIT".equals(cleanupPolicy)) {
                try {
                    cleanedOnError = Files.deleteIfExists(tempFile);
                } catch (IOException ignored) {
                }
            }
            expedienteRepository.markFailed(expedienteId, ex.getMessage(), cleanedOnError);
            if (ex instanceof IOException ioEx) {
                throw ioEx;
            }
            throw new IOException("Error indexando PDF en expediente " + expedienteId + ": " + ex.getMessage(), ex);
        } finally {
            if ("DELETE_ON_VERIFY".equals(cleanupPolicy)) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException ignored) {
                }
            }
        }
    }

    private Map<Integer, String> extractOutlineMap(PDDocument document) {
        Map<Integer, String> map = new HashMap<>();
        try {
            PDDocumentOutline outline = document.getDocumentCatalog().getDocumentOutline();
            if (outline != null) {
                collectOutlineItems(document, outline.getFirstChild(), map);
            }
        } catch (Exception ignored) {
        }
        return map;
    }

    private void collectOutlineItems(PDDocument doc, PDOutlineItem item, Map<Integer, String> map) {
        while (item != null) {
            try {
                PDPage page = item.findDestinationPage(doc);
                if (page != null) {
                    int pageNum = doc.getPages().indexOf(page) + 1;
                    String title = item.getTitle() != null ? item.getTitle().trim() : "";
                    if (pageNum > 0 && !title.isBlank()) {
                        map.putIfAbsent(pageNum, truncate(title, 110));
                    }
                }
                if (item.hasChildren()) {
                    collectOutlineItems(doc, item.getFirstChild(), map);
                }
            } catch (Exception ignored) {
            }
            item = item.getNextSibling();
        }
    }

    private String detectSectionOnPage(String pageText, String outlineTitle, String fallbackSection) {
        if (outlineTitle != null && !outlineTitle.isBlank()) {
            return outlineTitle;
        }
        if (pageText == null || pageText.isBlank()) {
            return fallbackSection;
        }
        String[] lines = pageText.split("\\R");
        for (int i = 0; i < Math.min(lines.length, 8); i++) {
            String candidate = lines[i].trim().replaceAll("\\s+", " ");
            if (candidate.length() >= 4 && candidate.length() <= 80) {
                if (NUMBERED_HEADING.matcher(candidate).matches()) {
                    return truncate(candidate, 110);
                }
                boolean looksUpperHeading = candidate.equals(candidate.toUpperCase())
                        && candidate.chars().filter(Character::isLetter).count() >= 4;
                if (looksUpperHeading) {
                    return truncate(candidate, 110);
                }
            }
        }
        return fallbackSection;
    }

    private String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 3) + "...";
    }

    private List<String> splitTextIntoChunks(String text, int chunkSize, int chunkOverlap) {
        if (text == null) {
            return List.of();
        }
        String cleaned = text.trim().replaceAll("\\s+", " ");
        if (cleaned.isEmpty()) {
            return List.of();
        }
        if (cleaned.length() <= chunkSize) {
            return List.of(cleaned);
        }

        List<String> chunks = new ArrayList<>();
        int start = 0;
        int length = cleaned.length();

        while (start < length) {
            int end = Math.min(start + chunkSize, length);
            if (end < length) {
                int lastSpace = cleaned.lastIndexOf(' ', end);
                if (lastSpace > start + (chunkSize / 2)) {
                    end = lastSpace;
                }
            }

            String chunk = cleaned.substring(start, end).trim();
            if (!chunk.isEmpty()) {
                chunks.add(chunk);
            }

            if (end >= length) {
                break;
            }
            start = Math.max(0, end - chunkOverlap);
        }

        return chunks;
    }
}
