package com.tacticalplay.rag.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.interactive.action.PDAction;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionLaunch;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;

/**
 * Validación de seguridad para archivos cargados:
 * 1) Verificación de firma binaria PDF (%PDF-) y hash SHA-256.
 * 2) Inspección estructural de PDF (bloquea /Launch o /JavaScript embebido).
 * 3) Escaneo opcional con ClamAV (clamd INSTREAM) cuando está habilitado en producción/VPS.
 */
@Service
public class FileSecurityScanner {

    private static final Logger log = LoggerFactory.getLogger(FileSecurityScanner.class);

    private final boolean clamAvEnabled;
    private final String clamAvHost;
    private final int clamAvPort;

    public FileSecurityScanner(
            @Value("${security.clamav.enabled:false}") boolean clamAvEnabled,
            @Value("${security.clamav.host:localhost}") String clamAvHost,
            @Value("${security.clamav.port:3310}") int clamAvPort
    ) {
        this.clamAvEnabled = clamAvEnabled;
        this.clamAvHost = clamAvHost;
        this.clamAvPort = clamAvPort;
    }

    public String validateAndScanPdf(Path filePath) throws IOException {
        byte[] header = new byte[Math.min(1024, (int) Math.min(Files.size(filePath), 1024L))];
        try (InputStream in = Files.newInputStream(filePath)) {
            int read = in.read(header);
            String headStr = new String(header, 0, Math.max(read, 0), StandardCharsets.ISO_8859_1);
            if (!headStr.contains("%PDF-")) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "El archivo rechazado por seguridad no posee una firma binaria válida (%PDF-)."
                );
            }
        }

        if (clamAvEnabled) {
            scanWithClamAv(filePath);
        }

        try (PDDocument document = Loader.loadPDF(filePath.toFile())) {
            if (document.isEncrypted()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "El PDF está cifrado o protegido con contraseña y no puede indexarse de forma segura."
                );
            }
            inspectDocumentForActiveThreats(document);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "El archivo PDF está corrupto o no pudo validarse: " + ex.getMessage()
            );
        }

        return computeSha256(filePath);
    }

    private void inspectDocumentForActiveThreats(PDDocument document) {
        try {
            var catalog = document.getDocumentCatalog();
            if (catalog.getOpenAction() instanceof PDAction openAction) {
                if (openAction instanceof PDActionLaunch || openAction instanceof PDActionJavaScript) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "PDF bloqueado por seguridad: contiene acciones ejecutables (/Launch o /JavaScript) al abrir."
                    );
                }
            }
            PDDocumentNameDictionary names = catalog.getNames();
            if (names != null && names.getJavaScript() != null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "PDF bloqueado por seguridad: contiene scripts JavaScript embebidos."
                );
            }
            if (catalog.getCOSObject().containsKey(COSName.AA)) {
                log.debug("PDF contiene diccionario Additional Actions (/AA); procesando solo extracción de texto segura.");
            }
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            log.debug("No se pudo inspeccionar catálogo completo del PDF: {}", ex.getMessage());
        }
    }

    private void scanWithClamAv(Path filePath) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(clamAvHost, clamAvPort), 4000);
            socket.setSoTimeout(15000);

            DataOutputStream out = new DataOutputStream(socket.getOutputStream());
            out.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));

            byte[] buffer = new byte[8192];
            try (InputStream fileIn = Files.newInputStream(filePath)) {
                int read;
                while ((read = fileIn.read(buffer)) >= 0) {
                    out.write(ByteBuffer.allocate(4).putInt(read).array());
                    out.write(buffer, 0, read);
                }
            }
            out.writeInt(0);
            out.flush();

            String response = new String(socket.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            if (!response.contains("OK") || response.contains("FOUND")) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Archivo rechazado por el antivirus del servidor (ClamAV): " + response
                );
            }
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Escaneo antivirus obligatorio falló al contactar ClamAV (" + clamAvHost + ":" + clamAvPort + "): " + ex.getMessage()
            );
        }
    }

    private String computeSha256(Path filePath) throws IOException {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            try (InputStream in = Files.newInputStream(filePath)) {
                int read;
                while ((read = in.read(buffer)) != -1) {
                    md.update(buffer, 0, read);
                }
            }
            return HexFormat.of().formatHex(md.digest());
        } catch (Exception ex) {
            throw new IOException("Error calculando SHA-256 del PDF", ex);
        }
    }
}
