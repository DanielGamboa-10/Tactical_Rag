package com.tacticalplay.rag.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidationErrors(
            MethodArgumentNotValidException ex,
            HttpServletRequest request
    ) {
        Map<String, String> fieldErrors = ex.getBindingResult()
                .getFieldErrors()
                .stream()
                .collect(Collectors.toMap(
                        FieldError::getField,
                        error -> error.getDefaultMessage() != null ? error.getDefaultMessage() : "Valor inválido",
                        (first, second) -> first,
                        LinkedHashMap::new
                ));

        String summary = fieldErrors.values().stream().findFirst().orElse("Error de validación en la petición");

        Map<String, Object> body = buildErrorBody(
                HttpStatus.BAD_REQUEST,
                summary,
                request.getRequestURI()
        );
        body.put("errors", fieldErrors);

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler({
            MissingServletRequestPartException.class,
            MissingServletRequestParameterException.class
    })
    public ResponseEntity<Map<String, Object>> handleMissingParams(
            Exception ex,
            HttpServletRequest request
    ) {
        Map<String, Object> body = buildErrorBody(
                HttpStatus.BAD_REQUEST,
                "Falta un parámetro o archivo obligatorio en la petición: " + ex.getMessage(),
                request.getRequestURI()
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleMaxSizeException(
            MaxUploadSizeExceededException ex,
            HttpServletRequest request
    ) {
        Map<String, Object> body = buildErrorBody(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "El archivo excede el tamaño máximo permitido (25MB).",
                request.getRequestURI()
        );
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(body);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatusException(
            ResponseStatusException ex,
            HttpServletRequest request
    ) {
        HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
        String rawReason = ex.getReason() != null ? ex.getReason() : ex.getMessage();
        String errorCode = null;
        String detail = rawReason;
        if (rawReason != null && rawReason.startsWith("DEMO_QUERIES_EXHAUSTED:")) {
            errorCode = "DEMO_QUERIES_EXHAUSTED";
            detail = rawReason.substring("DEMO_QUERIES_EXHAUSTED:".length()).trim();
        } else if (rawReason != null && rawReason.startsWith("DEMO_LIMIT_REACHED:")) {
            errorCode = "DEMO_LIMIT_REACHED";
            detail = rawReason.substring("DEMO_LIMIT_REACHED:".length()).trim();
        }
        Map<String, Object> body = buildErrorBody(status, detail, request.getRequestURI());
        if (errorCode != null) {
            body.put("code", errorCode);
        }
        return ResponseEntity.status(status).body(body);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGenericException(
            Exception ex,
            HttpServletRequest request
    ) {
        Map<String, Object> body = buildErrorBody(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Error interno en el servidor: " + ex.getMessage(),
                request.getRequestURI()
        );
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    private Map<String, Object> buildErrorBody(HttpStatus status, String detail, String path) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        body.put("error", status.getReasonPhrase());
        body.put("detail", detail);
        body.put("path", path);
        return body;
    }
}
