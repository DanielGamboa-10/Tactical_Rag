package com.tacticalplay.rag.service;

import com.tacticalplay.rag.dto.PdfUploadResponse;
import com.tacticalplay.rag.model.Expediente;
import com.tacticalplay.rag.repository.ExpedienteRepository;
import com.tacticalplay.rag.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

@Service
public class PdfIngestionService {

    private static final Set<String> VALID_MODALITIES = Set.of(
            "Futsal", "Fútbol 7", "Fútbol 9", "Fútbol 11"
    );
    private static final Set<String> VALID_PERMISSIONS = Set.of("TENANT", "PRIVATE");

    private final ExpedienteRepository expedienteRepository;
    private final UserRepository userRepository;
    private final FileSecurityScanner fileSecurityScanner;
    private final AsyncPdfProcessor asyncPdfProcessor;
    private final EmbeddingService embeddingService;

    public PdfIngestionService(
            ExpedienteRepository expedienteRepository,
            UserRepository userRepository,
            FileSecurityScanner fileSecurityScanner,
            AsyncPdfProcessor asyncPdfProcessor,
            EmbeddingService embeddingService
    ) {
        this.expedienteRepository = expedienteRepository;
        this.userRepository = userRepository;
        this.fileSecurityScanner = fileSecurityScanner;
        this.asyncPdfProcessor = asyncPdfProcessor;
        this.embeddingService = embeddingService;
    }

    public boolean isValidModality(String modality) {
        return modality != null && VALID_MODALITIES.contains(modality);
    }

    public String normalizePermissions(String permissions) {
        if (permissions == null || permissions.isBlank()) {
            return "PRIVATE";
        }
        String upper = permissions.trim().toUpperCase();
        return VALID_PERMISSIONS.contains(upper) ? upper : "PRIVATE";
    }

    public PdfUploadResponse submitPdf(
            MultipartFile file,
            String modality,
            String tenantId,
            String ownerUsername,
            String title,
            String permissions,
            boolean async
    ) throws IOException {
        return submitPdf(file, modality, tenantId, null, ownerUsername, title, permissions, async);
    }

    public PdfUploadResponse submitPdf(
            MultipartFile file,
            String modality,
            String tenantId,
            Long ownerUserId,
            String ownerUsername,
            String title,
            String permissions,
            boolean async
    ) throws IOException {
        String originalFilename = file.getOriginalFilename() != null
                ? Path.of(file.getOriginalFilename()).getFileName().toString()
                : "document.pdf";

        String effectivePermissions = normalizePermissions(permissions);
        String effectiveTitle = (title != null && !title.isBlank()) ? title.trim() : originalFilename;
        String expedienteId = UUID.randomUUID().toString();
        Long resolvedOwnerUserId = ownerUserId != null
                ? ownerUserId
                : userRepository.findByUsername(ownerUsername)
                        .map(UserRepository.AppUserRecord::id)
                        .orElse(null);

        Path tempFile = Files.createTempFile("tacticalplay_ingest_", ".pdf");
        String sha256;
        try {
            Files.copy(file.getInputStream(), tempFile, StandardCopyOption.REPLACE_EXISTING);
            sha256 = fileSecurityScanner.validateAndScanPdf(tempFile);
        } catch (Exception ex) {
            try {
                Files.deleteIfExists(tempFile);
            } catch (IOException ignored) {
            }
            if (ex instanceof IOException ioEx) {
                throw ioEx;
            }
            if (ex instanceof RuntimeException rEx) {
                throw rEx;
            }
            throw new IOException(ex.getMessage(), ex);
        }

        Expediente expediente = new Expediente(
                expedienteId,
                tenantId,
                ownerUsername,
                modality,
                effectiveTitle,
                originalFilename,
                sha256,
                file.getSize(),
                "PENDING",
                false,
                0,
                0,
                embeddingService.getActiveProviderName(),
                embeddingService.getActiveModelName(),
                effectivePermissions,
                null,
                false,
                Instant.now(),
                null,
                resolvedOwnerUserId
        );
        expedienteRepository.create(expediente);

        if (async) {
            asyncPdfProcessor.processPdfAsync(
                    expedienteId,
                    tempFile,
                    tenantId,
                    resolvedOwnerUserId,
                    modality,
                    originalFilename,
                    effectivePermissions
            );
            return new PdfUploadResponse(
                    expedienteId,
                    originalFilename,
                    tenantId,
                    modality,
                    "PENDING",
                    0,
                    0,
                    false,
                    embeddingService.getActiveModelName(),
                    false,
                    false,
                    "Archivo validado y encolado en el procesador asíncrono (extracción + OCR + pgvector)."
            );
        }

        return asyncPdfProcessor.processPdfInternal(
                expedienteId,
                tempFile,
                tenantId,
                resolvedOwnerUserId,
                modality,
                originalFilename,
                effectivePermissions
        );
    }

    public PdfUploadResponse ingestPdf(MultipartFile file, String modality, String tenantId) throws IOException {
        return submitPdf(file, modality, tenantId, null, "system", null, "PRIVATE", false);
    }
}
