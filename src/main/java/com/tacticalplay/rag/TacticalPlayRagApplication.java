package com.tacticalplay.rag;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@SpringBootApplication
@EnableAsync
public class TacticalPlayRagApplication {

    public static void main(String[] args) {
        SpringApplication.run(TacticalPlayRagApplication.class, args);
    }

    @Bean(name = "pdfIngestionExecutor")
    public Executor pdfIngestionExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(25);
        executor.setThreadNamePrefix("pdf-ingest-");
        executor.initialize();
        return executor;
    }
}
