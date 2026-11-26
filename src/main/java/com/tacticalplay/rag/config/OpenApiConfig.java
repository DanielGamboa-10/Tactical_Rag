package com.tacticalplay.rag.config;

import com.tacticalplay.rag.security.AuthPrincipal;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    static {
        SpringDocUtils.getConfig().addRequestWrapperToIgnore(AuthPrincipal.class);
    }

    @Bean
    public OpenAPI tacticalPlayOpenApi() {
        final String schemeName = "bearerAuth";
        return new OpenAPI()
                .info(new Info()
                        .title("TacticalPlay RAG API")
                        .version("0.1.0")
                        .description("API REST de dirección técnica deportiva con búsqueda híbrida PostgreSQL + pgvector, gestión multi-tenant de expedientes PDF, pizarra táctica y optimización de plantilla.")
                        .contact(new Contact().name("TacticalPlay RAG")))
                .addSecurityItem(new SecurityRequirement().addList(schemeName))
                .components(new Components()
                        .addSecuritySchemes(schemeName, new SecurityScheme()
                                .name(schemeName)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")));
    }
}
