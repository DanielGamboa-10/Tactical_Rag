package com.tacticalplay.rag.service;

import com.tacticalplay.rag.dto.PdfUploadResponse;
import com.tacticalplay.rag.model.DocumentChunk;
import com.tacticalplay.rag.repository.DocumentChunkRepository;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
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

    private static final int DEFAULT_CHUNK_SIZE = 800;
    private static final int DEFAULT_CHUNK_OVERLAP = 150;
    private static final Set<String> VALID_MODALITIES = Set.of(
            "Futsal", "Fútbol 7", "Fútbol 9", "Fútbol 11"
    );

    private final DocumentChunkRepository chunkRepository;

    public PdfIngestionService(DocumentChunkRepository chunkRepository) {
        this.chunkRepository = chunkRepository;
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

            try (PDDocument document = Loader.loadPDF(tempFile.toFile())) {
                totalPages = document.getNumberOfPages();
                PDFTextStripper stripper = new PDFTextStripper();

                for (int page = 1; page <= totalPages; page++) {
                    stripper.setStartPage(page);
                    stripper.setEndPage(page);
                    String pageText = stripper.getText(document);

                    List<String> pageChunks = splitTextIntoChunks(pageText, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP);
                    for (String chunkText : pageChunks) {
                        chunksToSave.add(DocumentChunk.forInsert(
                                tenantId,
                                modality,
                                originalFilename,
                                page,
                                chunkText
                        ));
                    }
                }
            }

            int savedCount = chunkRepository.saveChunks(chunksToSave);

            return new PdfUploadResponse(
                    originalFilename,
                    tenantId,
                    modality,
                    totalPages,
                    savedCount,
                    "PDF procesado e indexado correctamente en PostgreSQL y archivo temporal eliminado."
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
