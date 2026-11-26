package com.tacticalplay.rag.controller;

import com.tacticalplay.rag.repository.DemoQuotaRepository;
import com.tacticalplay.rag.repository.UserRepository;
import com.tacticalplay.rag.security.AuthPrincipal;
import com.tacticalplay.rag.security.JwtService;
import com.tacticalplay.rag.service.EmbeddingService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping({"/api/auth", "/api/v1/auth"})
public class AuthController {

    private static final String DEMO_COOKIE_NAME = "tactical_demo_device";
    private static final String DEMO_DEVICE_HEADER = "X-Demo-Device-Id";

    private final UserRepository userRepository;
    private final DemoQuotaRepository demoQuotaRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final EmbeddingService embeddingService;
    private final boolean demoSessionEnabled;

    public AuthController(
            UserRepository userRepository,
            DemoQuotaRepository demoQuotaRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            EmbeddingService embeddingService,
            @Value("${security.demo-session.enabled:true}") boolean demoSessionEnabled
    ) {
        this.userRepository = userRepository;
        this.demoQuotaRepository = demoQuotaRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.embeddingService = embeddingService;
        this.demoSessionEnabled = demoSessionEnabled;
    }

    public record LoginRequest(
            String username,
            String email,
            String identifier,
            @NotBlank(message = "La contraseña es obligatoria.") String password
    ) {
        public String resolveIdentifier() {
            if (identifier != null && !identifier.isBlank()) return identifier.trim();
            if (email != null && !email.isBlank()) return email.trim();
            if (username != null && !username.isBlank()) return username.trim();
            return "";
        }
    }

    public record RegisterRequest(
            @NotBlank(message = "El usuario es obligatorio.")
            @Size(min = 3, max = 40, message = "El usuario debe tener entre 3 y 40 caracteres.")
            String username,

            @Email(message = "El correo electrónico no tiene un formato válido.")
            String email,

            @NotBlank(message = "La contraseña es obligatoria.")
            @Size(min = 8, max = 100, message = "La contraseña debe tener al menos 8 caracteres.")
            String password,

            String fullName,

            String displayName,

            String clubName
    ) {
        public String resolveFullName() {
            if (fullName != null && !fullName.isBlank()) return fullName.trim();
            if (displayName != null && !displayName.isBlank()) return displayName.trim();
            return "";
        }
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        String loginIdentifier = request.resolveIdentifier();
        if (loginIdentifier.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Debes ingresar tu usuario o correo electrónico.");
        }

        UserRepository.AppUserRecord user = userRepository.findByUsernameOrEmail(loginIdentifier)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales inválidas."));

        if (!passwordEncoder.matches(request.password(), user.passwordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciales inválidas.");
        }

        boolean isDemo = "demo".equalsIgnoreCase(user.username());
        AuthPrincipal principal = user.toPrincipal();
        DemoQuotaRepository.DemoQuotaStatus demoQuota = null;
        if (isDemo) {
            String deviceId = resolveDemoDeviceId(httpRequest, true);
            demoQuota = demoQuotaRepository.resolveOrCreateDeviceQuota(deviceId);
            writeDemoCookie(httpResponse, demoQuota.demoKey());
            principal = principal.withDemoKey(demoQuota.demoKey());
        }

        return ResponseEntity.ok(buildAuthResponse(principal, isDemo, demoQuota));
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody RegisterRequest request) {
        String resolvedName = request.resolveFullName();
        if (resolvedName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre completo es obligatorio.");
        }

        String normalizedUsername = request.username().trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]", "");
        if (normalizedUsername.length() < 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El usuario debe contener al menos 3 caracteres alfanuméricos.");
        }
        if (userRepository.existsByUsername(normalizedUsername)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El usuario '" + normalizedUsername + "' ya está registrado.");
        }

        String normalizedEmail = (request.email() != null && !request.email().isBlank())
                ? request.email().trim().toLowerCase(Locale.ROOT)
                : null;
        if (normalizedEmail != null && userRepository.existsByEmail(normalizedEmail)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El correo '" + normalizedEmail + "' ya está registrado.");
        }

        String tenantId;
        if (request.clubName() != null && !request.clubName().isBlank()) {
            String baseSlug = slugifyTenant(request.clubName());
            tenantId = ("demo-club".equals(baseSlug) || userRepository.existsByTenantId(baseSlug))
                    ? baseSlug + "-" + normalizedUsername
                    : baseSlug;
        } else {
            // Aislamiento estricto por perfil: cada nueva cuenta crea su tenant privado propio
            tenantId = "coach-" + normalizedUsername + "-" + UUID.randomUUID().toString().substring(0, 4);
        }

        UserRepository.AppUserRecord created = userRepository.createUser(
                normalizedUsername,
                normalizedEmail,
                passwordEncoder.encode(request.password()),
                resolvedName,
                tenantId,
                List.of("ROLE_COACH")
        );

        return ResponseEntity.status(HttpStatus.CREATED).body(buildAuthResponse(created.toPrincipal(), false, null));
    }

    @PostMapping({"/demo", "/demo-session"})
    public ResponseEntity<Map<String, Object>> createDemoSession(
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        if (!demoSessionEnabled) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "La sesión demo automática está deshabilitada en este entorno (SECURITY_DEMO_SESSION_ENABLED=false)."
            );
        }
        userRepository.ensureDefaultUsers(passwordEncoder);
        UserRepository.AppUserRecord demoUser = userRepository.findByUsername("demo")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Usuario demo no disponible."));

        String deviceId = resolveDemoDeviceId(httpRequest, true);
        DemoQuotaRepository.DemoQuotaStatus demoQuota = demoQuotaRepository.resolveOrCreateDeviceQuota(deviceId);
        writeDemoCookie(httpResponse, demoQuota.demoKey());

        AuthPrincipal principal = demoUser.toPrincipal().withDemoKey(demoQuota.demoKey());
        return ResponseEntity.ok(buildAuthResponse(principal, true, demoQuota));
    }

    @GetMapping("/demo/status")
    public ResponseEntity<Map<String, Object>> getDemoDeviceStatus(
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        String deviceId = resolveDemoDeviceId(httpRequest, false);
        DemoQuotaRepository.DemoQuotaStatus status = (deviceId != null)
                ? demoQuotaRepository.getStatus(deviceId)
                : new DemoQuotaRepository.DemoQuotaStatus("", 0, DemoQuotaRepository.DEFAULT_MAX_QUERIES, false);

        if (deviceId != null && !deviceId.isBlank()) {
            writeDemoCookie(httpResponse, DemoQuotaRepository.normalizeDeviceId(deviceId));
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("deviceId", status.demoKey());
        body.put("queriesUsed", status.queriesUsed());
        body.put("maxQueries", status.maxQueries());
        body.put("remainingQueries", status.remaining());
        body.put("demoQueriesUsed", status.queriesUsed());
        body.put("demoQueriesLimit", status.maxQueries());
        body.put("demoQueriesRemaining", status.remaining());
        body.put("demoExhausted", status.isExhausted());
        return ResponseEntity.ok(body);
    }

    private String resolveDemoDeviceId(HttpServletRequest request, boolean createIfMissing) {
        if (request != null) {
            String headerId = request.getHeader(DEMO_DEVICE_HEADER);
            if (headerId != null && !headerId.isBlank()) {
                return DemoQuotaRepository.normalizeDeviceId(headerId);
            }
            Cookie[] cookies = request.getCookies();
            if (cookies != null) {
                for (Cookie c : cookies) {
                    if ((DEMO_COOKIE_NAME.equals(c.getName()) || "tacticalplay_demo_device_id".equals(c.getName()))
                            && c.getValue() != null && !c.getValue().isBlank()) {
                        return DemoQuotaRepository.normalizeDeviceId(c.getValue());
                    }
                }
            }
        }
        return createIfMissing ? UUID.randomUUID().toString() : null;
    }

    private void writeDemoCookie(HttpServletResponse response, String deviceId) {
        if (response == null || deviceId == null || deviceId.isBlank()) {
            return;
        }
        ResponseCookie cookie = ResponseCookie.from(DEMO_COOKIE_NAME, deviceId)
                .httpOnly(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ofDays(365))
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> currentSession(
            @AuthenticationPrincipal AuthPrincipal principal,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión no autenticada.");
        }
        UserRepository.AppUserRecord dbUser = userRepository.findByUsername(principal.username()).orElse(null);
        AuthPrincipal resolved = (dbUser != null)
                ? dbUser.toPrincipal().withDemoKey(principal.demoKey())
                : principal;

        boolean isDemo = resolved.isDemoAccount();
        DemoQuotaRepository.DemoQuotaStatus demoQuota = null;
        if (isDemo) {
            String effectiveDemoKey = (resolved.demoKey() != null && !resolved.demoKey().isBlank())
                    ? resolved.demoKey()
                    : resolveDemoDeviceId(httpRequest, false);
            demoQuota = demoQuotaRepository.getStatus(effectiveDemoKey);
            if (effectiveDemoKey != null && !effectiveDemoKey.isBlank()) {
                writeDemoCookie(httpResponse, DemoQuotaRepository.normalizeDeviceId(effectiveDemoKey));
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("userId", resolved.userId());
        body.put("username", resolved.username());
        body.put("email", resolved.email());
        body.put("fullName", resolved.fullName());
        body.put("displayName", resolved.displayName());
        body.put("tenantId", resolved.tenantId());
        body.put("role", resolved.primaryRole());
        body.put("roles", resolved.roles());
        body.put("isDemo", isDemo);
        appendDemoFields(body, isDemo, demoQuota);
        body.put("embeddingProvider", embeddingService.getActiveProviderName());
        body.put("embeddingModel", embeddingService.getActiveModelName());
        return ResponseEntity.ok(body);
    }

    private Map<String, Object> buildAuthResponse(
            AuthPrincipal principal,
            boolean isDemo,
            DemoQuotaRepository.DemoQuotaStatus demoQuota
    ) {
        String token = jwtService.generateToken(principal);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("token", token);
        body.put("tokenType", "Bearer");
        body.put("expiresInMs", jwtService.getExpirationMs());
        body.put("userId", principal.userId());
        body.put("username", principal.username());
        body.put("email", principal.email());
        body.put("fullName", principal.fullName());
        body.put("displayName", principal.displayName());
        body.put("tenantId", principal.tenantId());
        body.put("role", principal.primaryRole());
        body.put("roles", principal.roles());
        body.put("isDemo", isDemo);
        appendDemoFields(body, isDemo, demoQuota);
        body.put("embeddingProvider", embeddingService.getActiveProviderName());
        body.put("embeddingModel", embeddingService.getActiveModelName());
        return body;
    }

    private void appendDemoFields(
            Map<String, Object> body,
            boolean isDemo,
            DemoQuotaRepository.DemoQuotaStatus demoQuota
    ) {
        if (isDemo) {
            int used = demoQuota != null ? demoQuota.queriesUsed() : 0;
            int limit = demoQuota != null ? demoQuota.maxQueries() : DemoQuotaRepository.DEFAULT_MAX_QUERIES;
            int remaining = demoQuota != null ? demoQuota.remaining() : Math.max(0, limit - used);
            boolean exhausted = demoQuota != null ? demoQuota.isExhausted() : (used >= limit);
            body.put("demoDeviceId", demoQuota != null ? demoQuota.demoKey() : null);
            body.put("queriesUsed", used);
            body.put("maxQueries", limit);
            body.put("remainingQueries", exhausted ? 0 : remaining);
            body.put("demoQueriesUsed", used);
            body.put("demoQueriesLimit", limit);
            body.put("demoQueriesRemaining", exhausted ? 0 : remaining);
            body.put("demoExhausted", exhausted);
            body.put("features", Map.of(
                    "ragLimit", limit,
                    "heatmap", false,
                    "freehandDraw", false,
                    "stadium3d", false,
                    "squadManager", false
            ));
        } else {
            body.put("queriesUsed", 0);
            body.put("maxQueries", null);
            body.put("remainingQueries", null);
            body.put("demoQueriesUsed", 0);
            body.put("demoQueriesLimit", null);
            body.put("demoQueriesRemaining", null);
            body.put("demoExhausted", false);
            body.put("features", Map.of(
                    "heatmap", true,
                    "freehandDraw", true,
                    "stadium3d", true,
                    "squadManager", true
            ));
        }
    }

    private String slugifyTenant(String raw) {
        String ascii = Normalizer.normalize(raw, Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (ascii.isBlank()) {
            return "club";
        }
        return ascii.length() > 40 ? ascii.substring(0, 40) : ascii;
    }
}
