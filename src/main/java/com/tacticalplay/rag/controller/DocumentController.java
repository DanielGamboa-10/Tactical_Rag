package com.tacticalplay.rag.controller;

import com.tacticalplay.rag.dto.PdfUploadResponse;
import com.tacticalplay.rag.security.AuthPrincipal;
import com.tacticalplay.rag.service.PdfIngestionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;

@RestController
public class DocumentController {

    private final PdfIngestionService pdfIngestionService;

    public DocumentController(PdfIngestionService pdfIngestionService) {
        this.pdfIngestionService = pdfIngestionService;
    }

    @PostMapping(
            value = {"/api/v1/documents/upload-pdf", "/api/documents/upload"},
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<PdfUploadResponse> uploadPdf(
            @RequestParam("file") MultipartFile file,
            @RequestParam("modality") String modality,
            @RequestParam(value = "title", required = false) String title,
            @RequestParam(value = "permissions", required = false) String permissions,
            @RequestParam(value = "visibility", required = false) String visibility,
            @RequestParam(value = "async", defaultValue = "true") boolean async,
            @AuthenticationPrincipal AuthPrincipal principal
    ) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Autenticación requerida.");
        }
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El archivo PDF no puede estar vacío.");
        }

        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        if (!filename.endsWith(".pdf")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El archivo subido debe tener extensión .pdf");
        }

        if (!pdfIngestionService.isValidModality(modality)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Modalidad inválida. Valores permitidos: Futsal, Fútbol 7, Fútbol 9, Fútbol 11"
            );
        }

        String effectiveVisibility = (visibility != null && !visibility.isBlank())
                ? visibility
                : ((permissions != null && !permissions.isBlank()) ? permissions : "PRIVATE");

        try {
            PdfUploadResponse response = pdfIngestionService.submitPdf(
                    file,
                    modality,
                    principal.tenantId(),
                    principal.userId(),
                    principal.username(),
                    title,
                    effectiveVisibility,
                    async
            );
            HttpStatus status = async ? HttpStatus.ACCEPTED : HttpStatus.CREATED;
            return ResponseEntity.status(status).body(response);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Error al procesar el archivo PDF: " + ex.getMessage(),
                    ex
            );
        }
    }
}
