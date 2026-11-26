# Genera un certificado TLS/SSL PKCS12 local para ejecutar Spring Boot con --spring.profiles.active=https
$ErrorActionPreference = "Stop"
$certDir = Join-Path $PSScriptRoot "certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
$keystorePath = Join-Path $certDir "tacticalplay-dev.p12"

if (Test-Path $keystorePath) {
    Remove-Item $keystorePath -Force
}

keytool -genkeypair `
  -alias tacticalplay `
  -keyalg RSA `
  -keysize 2048 `
  -storetype PKCS12 `
  -keystore $keystorePath `
  -storepass tacticalplay `
  -validity 365 `
  -dname "CN=localhost, OU=TacticalPlay, O=TacticalPlayRAG, L=Madrid, C=ES" `
  -ext "SAN=DNS:localhost,IP:127.0.0.1"

Write-Host "Keystore generado en: $keystorePath"
Write-Host "Ejecuta Spring Boot con HTTPS: mvn spring-boot:run -Dspring-boot.run.profiles=https"
