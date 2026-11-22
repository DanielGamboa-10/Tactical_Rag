export const API_BASE_URL = 'http://localhost:8000';

async function parseJsonOrThrow(response, fallbackMsg = 'Error en la comunicación con el servidor') {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.error || `${fallbackMsg} (HTTP ${response.status})`);
  }
  return data;
}

export const api = {
  // 1. Salud del Sistema & Apagado Limpio
  async checkHealth() {
    const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
    return parseJsonOrThrow(res, 'Backend 8000 Offline');
  },

  async shutdownSystem() {
    return fetch(`${API_BASE_URL}/api/v1/system/shutdown`, { method: 'POST' });
  },

  // 2. Sincronización Vectorial con Wikipedia API (pgvector)
  async syncWikipediaKnowledge() {
    const res = await fetch(`${API_BASE_URL}/api/v1/tactical/sync-external`, { method: 'POST' });
    return parseJsonOrThrow(res, 'Error al sincronizar Wikipedia');
  },

  // 3. Chat RAG con Entrenador Táctico IA (PostgreSQL + pgvector + Gemini)
  async askTacticalAssistant(payload, signal) {
    const res = await fetch(`${API_BASE_URL}/api/v1/tactical/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(res, 'Error en la consulta táctica');
  },

  // 4. Ingesta de Documentos PDF (opcional / legacy endpoint)
  async uploadPdfDocument(formData) {
    const res = await fetch(`${API_BASE_URL}/api/v1/documents/upload-pdf`, {
      method: 'POST',
      body: formData
    });
    return parseJsonOrThrow(res, 'Error al procesar el PDF');
  },

  // 5. Gestión de Plantilla Personalizada & Motor de Sinergia / Top 100
  async getSquadPlayers() {
    const res = await fetch(`${API_BASE_URL}/api/v1/squad/players`, { method: 'GET' });
    return parseJsonOrThrow(res, 'No se pudo obtener la plantilla');
  },

  async createSquadPlayer(payload) {
    const res = await fetch(`${API_BASE_URL}/api/v1/squad/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(res, 'No se pudo guardar el jugador');
  },

  async deleteSquadPlayer(id) {
    const res = await fetch(`${API_BASE_URL}/api/v1/squad/players/${id}`, { method: 'DELETE' });
    return parseJsonOrThrow(res, 'No se pudo eliminar el jugador');
  },

  async clearAllSquadPlayers() {
    const res = await fetch(`${API_BASE_URL}/api/v1/squad/players`, { method: 'DELETE' });
    return parseJsonOrThrow(res, 'No se pudo vaciar la plantilla');
  },

  async loadDemoSquad(modality) {
    const res = await fetch(
      `${API_BASE_URL}/api/v1/squad/demo?modality=${encodeURIComponent(modality)}`,
      { method: 'POST' }
    );
    return parseJsonOrThrow(res, 'Error al cargar plantilla demo');
  },

  async optimizeSquad(payload) {
    const res = await fetch(`${API_BASE_URL}/api/v1/squad/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(res, 'Error al optimizar la plantilla');
  },

  async getTop100Players() {
    const res = await fetch(`${API_BASE_URL}/api/v1/squad/top100`, { method: 'GET' });
    return parseJsonOrThrow(res, 'Error al obtener el catálogo Top 100');
  }
};
