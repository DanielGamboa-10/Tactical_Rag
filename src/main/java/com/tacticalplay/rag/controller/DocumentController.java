package com.tacticalplay.rag.controller;

import com.tacticalplay.rag.dto.PdfUploadResponse;
import com.tacticalplay.rag.service.PdfIngestionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;

@RestController
@RequestMapping("/api/v1/documents")
public class DocumentController {

    private final PdfIngestionService pdfIngestionService;

    public DocumentController(PdfIngestionService pdfIngestionService) {
        this.pdfIngestionService = pdfIngestionService;
    }

    @PostMapping(value = "/upload-pdf", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<PdfUploadResponse> uploadPdf(
            @RequestParam("file") MultipartFile file,
            @RequestParam("modality") String modality,
            @RequestParam(value = "tenant_id", defaultValue = "default") String tenantId
    ) {
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

        try {
            PdfUploadResponse response = pdfIngestionService.ingestPdf(file, modality, tenantId);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (IOException ex) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Error al procesar el archivo PDF: " + ex.getMessage(),
                    ex
            );
        }
    }
}
