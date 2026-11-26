package com.tacticalplay.rag.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class JwtService {

    private static final String HMAC_ALGO = "HmacSHA256";
    private static final Base64.Encoder URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder URL_DECODER = Base64.getUrlDecoder();

    private final ObjectMapper objectMapper;
    private final byte[] secretBytes;
    private final long expirationMs;

    public JwtService(
            ObjectMapper objectMapper,
            @Value("${security.jwt.secret:TacticalPlayRagDevSecretKeyHMAC256ForLocalJwtSigning2026!}") String secret,
            @Value("${security.jwt.expiration-ms:86400000}") long expirationMs
    ) {
        this.objectMapper = objectMapper;
        String effectiveSecret = (secret != null && secret.length() >= 32)
                ? secret
                : "TacticalPlayRagDevSecretKeyHMAC256ForLocalJwtSigning2026!";
        this.secretBytes = effectiveSecret.getBytes(StandardCharsets.UTF_8);
        this.expirationMs = expirationMs > 0 ? expirationMs : 86400000L;
    }

    public long getExpirationMs() {
        return expirationMs;
    }

    public String generateToken(AuthPrincipal principal) {
        try {
            long nowSeconds = Instant.now().getEpochSecond();
            long expSeconds = nowSeconds + (expirationMs / 1000L);

            Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
            Map<String, Object> claims = new LinkedHashMap<>();
            claims.put("sub", principal.username());
            if (principal.userId() != null) {
                claims.put("userId", principal.userId());
            }
            if (principal.email() != null && !principal.email().isBlank()) {
                claims.put("email", principal.email());
            }
            if (principal.demoKey() != null && !principal.demoKey().isBlank()) {
                claims.put("demoKey", principal.demoKey());
            }
            claims.put("displayName", principal.displayName());
            claims.put("fullName", principal.fullName());
            claims.put("tenantId", principal.tenantId());
            claims.put("roles", principal.roles());
            claims.put("iat", nowSeconds);
            claims.put("exp", expSeconds);

            String encodedHeader = URL_ENCODER.encodeToString(objectMapper.writeValueAsBytes(header));
            String encodedPayload = URL_ENCODER.encodeToString(objectMapper.writeValueAsBytes(claims));
            String signingInput = encodedHeader + "." + encodedPayload;
            String signature = sign(signingInput);

            return signingInput + "." + signature;
        } catch (Exception ex) {
            throw new IllegalStateException("No se pudo firmar el token JWT.", ex);
        }
    }

    public Optional<AuthPrincipal> parseAndValidate(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return Optional.empty();
        }

        try {
            String signingInput = parts[0] + "." + parts[1];
            String expectedSig = sign(signingInput);
            if (!MessageDigest.isEqual(
                    expectedSig.getBytes(StandardCharsets.UTF_8),
                    parts[2].getBytes(StandardCharsets.UTF_8)
            )) {
                return Optional.empty();
            }

            byte[] payloadBytes = URL_DECODER.decode(parts[1]);
            Map<String, Object> claims = objectMapper.readValue(payloadBytes, new TypeReference<>() {});

            Object expObj = claims.get("exp");
            if (!(expObj instanceof Number expNum)) {
                return Optional.empty();
            }
            if (Instant.now().getEpochSecond() >= expNum.longValue()) {
                return Optional.empty();
            }

            String username = String.valueOf(claims.getOrDefault("sub", ""));
            String tenantId = String.valueOf(claims.getOrDefault("tenantId", ""));
            if (username.isBlank() || tenantId.isBlank()) {
                return Optional.empty();
            }

            String displayName = String.valueOf(claims.getOrDefault("displayName", claims.getOrDefault("fullName", username)));
            Long userId = (claims.get("userId") instanceof Number num) ? num.longValue() : null;
            Object rawEmail = claims.get("email");
            String email = (rawEmail != null && !String.valueOf(rawEmail).isBlank()) ? String.valueOf(rawEmail) : null;
            Object rawDemoKey = claims.get("demoKey");
            String demoKey = (rawDemoKey != null && !String.valueOf(rawDemoKey).isBlank()) ? String.valueOf(rawDemoKey) : null;
            List<String> roles = extractRoles(claims.get("roles"));
            return Optional.of(new AuthPrincipal(userId, username, email, displayName, tenantId, roles, demoKey));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    private List<String> extractRoles(Object rolesClaim) {
        if (rolesClaim instanceof List<?> rawList) {
            return rawList.stream().map(String::valueOf).filter(s -> !s.isBlank()).toList();
        }
        if (rolesClaim instanceof String rawStr && !rawStr.isBlank()) {
            return Arrays.stream(rawStr.split(",")).map(String::trim).filter(s -> !s.isBlank()).toList();
        }
        return List.of("ROLE_COACH");
    }

    private String sign(String data) throws Exception {
        Mac mac = Mac.getInstance(HMAC_ALGO);
        mac.init(new SecretKeySpec(secretBytes, HMAC_ALGO));
        byte[] raw = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        return URL_ENCODER.encodeToString(raw);
    }
}
