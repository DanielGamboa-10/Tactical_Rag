package com.tacticalplay.rag.service;

import com.tacticalplay.rag.dto.PdfUploadResponse;
import com.tacticalplay.rag.model.DocumentChunk;
import com.tacticalplay.rag.repository.DocumentChunkRepository;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Service
public class PdfIngestionService {

    private static final Logger log = LoggerFactory.getLogger(PdfIngestionService.class);
    private static final int DEFAULT_CHUNK_SIZE = 800;
    private static final int DEFAULT_CHUNK_OVERLAP = 150;
    private static final Set<String> VALID_MODALITIES = Set.of(
            "Futsal", "Fútbol 7", "Fútbol 9", "Fútbol 11"
    );

    private final DocumentChunkRepository chunkRepository;
    private final EmbeddingService embeddingService;

    public PdfIngestionService(DocumentChunkRepository chunkRepository, EmbeddingService embeddingService) {
        this.chunkRepository = chunkRepository;
        this.embeddingService = embeddingService;
    }

    public boolean isValidModality(String modality) {
        return modality != null && VALID_MODALITIES.contains(modality);
    }

    public PdfUploadResponse ingestPdf(MultipartFile file, String modality, String tenantId) throws IOException {
        String originalFilename = file.getOriginalFilename() != null
                ? Path.of(file.getOriginalFilename()).getFileName().toString()
                : "document.pdf";

        Path tempFile = Files.createTempFile("tacticalplay_ingest_", ".pdf");

        try {
            Files.copy(file.getInputStream(), tempFile, StandardCopyOption.REPLACE_EXISTING);

            List<DocumentChunk> chunksToSave = new ArrayList<>();
            int totalPages;
            int embeddedChunksCount = 0;

            try (PDDocument document = Loader.loadPDF(tempFile.toFile())) {
                totalPages = document.getNumberOfPages();
                PDFTextStripper stripper = new PDFTextStripper();

                for (int page = 1; page <= totalPages; page++) {
                    stripper.setStartPage(page);
                    stripper.setEndPage(page);
                    String pageText = stripper.getText(document);

                    List<String> pageChunks = splitTextIntoChunks(pageText, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP);
                    for (String chunkText : pageChunks) {
                        String embeddingLiteral = null;
                        if (embeddingService.isConfigured()) {
                            try {
                                embeddingLiteral = embeddingService.embedToPgVectorLiteral(chunkText);
                                embeddedChunksCount++;
                            } catch (Exception ex) {
                                log.warn("No se pudo generar embedding para fragmento de {} (Pág. {}): {}",
                                        originalFilename, page, ex.getMessage());
                            }
                        }

                        chunksToSave.add(DocumentChunk.forInsert(
                                tenantId,
                                modality,
                                originalFilename,
                                page,
                                chunkText,
                                embeddingLiteral
                        ));
                    }
                }
            }

            int savedCount = chunkRepository.saveChunks(chunksToSave);
            String statusMsg = embeddedChunksCount > 0
                    ? String.format("PDF indexado con %d vectores semánticos (768 dims) en PostgreSQL y archivo temporal eliminado.", embeddedChunksCount)
                    : "PDF guardado en PostgreSQL (sin embeddings porque GEMINI_API_KEY no está configurada) y archivo temporal eliminado.";

            return new PdfUploadResponse(
                    originalFilename,
                    tenantId,
                    modality,
                    totalPages,
                    savedCount,
                    statusMsg
            );
        } finally {
            try {
                Files.deleteIfExists(tempFile);
            } catch (IOException ignored) {
            }
        }
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
