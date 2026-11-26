export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.protocol === 'https:' && !import.meta.env.VITE_API_BASE_URL
    ? window.location.origin
    : 'http://localhost:8000');

const AUTH_STORAGE_KEY = 'tacticalplay_auth_session_v1';
const DEMO_DEVICE_STORAGE_KEY = 'tacticalplay_demo_device_id';
const DEMO_QUOTA_CACHE_KEY = 'tacticalplay_demo_quota_cache_v1';
const DEMO_IDB_NAME = 'tacticalplay_demo_db';
const DEMO_IDB_STORE = 'device_meta';

function readCookieValue(name) {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writePersistentCookie(name, value) {
  if (typeof document === 'undefined' || !value) return;
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // Ignore cookie block
  }
}

function writeIdbKey(key, val) {
  if (typeof indexedDB === 'undefined') return;
  try {
    const req = indexedDB.open(DEMO_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DEMO_IDB_STORE)) {
        req.result.createObjectStore(DEMO_IDB_STORE);
      }
    };
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction(DEMO_IDB_STORE, 'readwrite');
        tx.objectStore(DEMO_IDB_STORE).put(val, key);
      } catch {
        // Ignore IDB write failures
      }
    };
  } catch {
    // Ignore IDB unavailability
  }
}

function readIdbKey(key) {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DEMO_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DEMO_IDB_STORE)) {
          req.result.createObjectStore(DEMO_IDB_STORE);
        }
      };
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction(DEMO_IDB_STORE, 'readonly');
          const getReq = tx.objectStore(DEMO_IDB_STORE).get(key);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function generateDeviceUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

let hydrationPromise = null;

export function getOrCreatePersistentDemoDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem(DEMO_DEVICE_STORAGE_KEY);
  } catch {
    // Ignore
  }
  if (!id) {
    id = readCookieValue(DEMO_DEVICE_STORAGE_KEY);
  }
  if (!id) {
    id = generateDeviceUuid();
  }
  try {
    localStorage.setItem(DEMO_DEVICE_STORAGE_KEY, id);
  } catch {
    // Ignore
  }
  writePersistentCookie(DEMO_DEVICE_STORAGE_KEY, id);
  writeIdbKey(DEMO_DEVICE_STORAGE_KEY, id);
  return id;
}

export const getOrCreateDemoDeviceId = getOrCreatePersistentDemoDeviceId;

export async function hydrateDemoDevicePersistence() {
  if (hydrationPromise) {
    return hydrationPromise;
  }
  hydrationPromise = (async () => {
    const idbDeviceId = await readIdbKey(DEMO_DEVICE_STORAGE_KEY);
    let lsDeviceId = null;
    try {
      lsDeviceId = localStorage.getItem(DEMO_DEVICE_STORAGE_KEY);
    } catch {
      // Ignore
    }
    const cookieDeviceId = readCookieValue(DEMO_DEVICE_STORAGE_KEY);
    const canonicalId = idbDeviceId || lsDeviceId || cookieDeviceId || generateDeviceUuid();

    try {
      localStorage.setItem(DEMO_DEVICE_STORAGE_KEY, canonicalId);
    } catch {
      // Ignore
    }
    writePersistentCookie(DEMO_DEVICE_STORAGE_KEY, canonicalId);
    writeIdbKey(DEMO_DEVICE_STORAGE_KEY, canonicalId);

    const idbQuota = await readIdbKey(DEMO_QUOTA_CACHE_KEY);
    if (idbQuota && typeof idbQuota === 'object') {
      try {
        const existingRaw = localStorage.getItem(DEMO_QUOTA_CACHE_KEY);
        const existing = existingRaw ? JSON.parse(existingRaw) : null;
        if (!existing || (idbQuota.used ?? 0) > (existing.used ?? 0)) {
          localStorage.setItem(DEMO_QUOTA_CACHE_KEY, JSON.stringify(idbQuota));
        }
      } catch {
        // Ignore
      }
    }
    return canonicalId;
  })();
  return hydrationPromise;
}

export function saveDemoDeviceQuotaCache(quota) {
  if (!quota || quota.limit == null) return;
  const payload = {
    used: Number(quota.used ?? 0),
    limit: Number(quota.limit ?? 15),
    remaining: Math.max(0, Number(quota.remaining ?? 0))
  };
  try {
    localStorage.setItem(DEMO_QUOTA_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore
  }
  writeIdbKey(DEMO_QUOTA_CACHE_KEY, payload);
}

export function getCachedDemoDeviceQuota() {
  try {
    const raw = localStorage.getItem(DEMO_QUOTA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.used === 'number') {
      return parsed;
    }
  } catch {
    // Ignore
  }
  return null;
}

function isTokenValid(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
    const claims = JSON.parse(json);
    const nowSec = Math.floor(Date.now() / 1000);
    return typeof claims.exp === 'number' && claims.exp > nowSec + 30;
  } catch {
    return false;
  }
}

export function getStoredAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.token && isTokenValid(parsed.token)) {
      return parsed;
    }
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

export function setStoredAuthSession(session) {
  try {
    if (session?.token) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // Almacenamiento bloqueado en modo privado estricto
  }
}

const AUTH_KEYS_TO_CLEAR = [AUTH_STORAGE_KEY, 'tacticalplay_jwt', 'tacticalplay_user'];

export function clearStoredAuthSession() {
  AUTH_KEYS_TO_CLEAR.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  });
}

export function updateStoredDemoQuota(quota) {
  saveDemoDeviceQuotaCache(quota);
  const existing = getStoredAuthSession();
  if (!existing || (!existing.isDemo && existing.username !== 'demo') || !quota) {
    return existing;
  }
  const updated = {
    ...existing,
    demoQueriesUsed: quota.used,
    demoQueriesLimit: quota.limit,
    demoQueriesRemaining: quota.remaining
  };
  setStoredAuthSession(updated);
  return updated;
}

function notifyAuthRequired(reason = 'unauthorized') {
  clearStoredAuthSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tactical:auth-required', { detail: { reason } }));
  }
}

async function parseJsonOrThrow(response, fallbackMsg = 'Error en la comunicación con el servidor') {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.detail || data.error || `${fallbackMsg} (HTTP ${response.status})`);
    err.status = response.status;
    err.code = data.code || '';
    throw err;
  }
  return data;
}

async function fetchWithAuth(url, options = {}) {
  const session = getStoredAuthSession();
  if (!session?.token) {
    notifyAuthRequired('missing');
    throw new Error('Inicia sesión o regístrate para acceder a este módulo.');
  }

  const persistentDeviceId = (await hydrateDemoDevicePersistence()) || getOrCreatePersistentDemoDeviceId();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }
  if (!headers.has('X-Demo-Device-Id')) {
    headers.set('X-Demo-Device-Id', persistentDeviceId);
  }

  const res = await fetch(url, { ...options, headers, credentials: 'include' });

  if (res.status === 401) {
    notifyAuthRequired('unauthorized');
  }

  return res;
}

export const api = {
  // 0. Autenticación JWT & Aislamiento Multi-Tenant
  async ensureAuthSession() {
    return getStoredAuthSession();
  },

  async getDemoDeviceStatus() {
    const deviceId = (await hydrateDemoDevicePersistence()) || getOrCreatePersistentDemoDeviceId();
    const res = await fetch(`${API_BASE_URL}/api/auth/demo/status`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-Demo-Device-Id': deviceId
      }
    });
    const status = await parseJsonOrThrow(res, 'No se pudo consultar cuota demo');
    if (status.deviceId && status.deviceId.length >= 8) {
      try {
        localStorage.setItem(DEMO_DEVICE_STORAGE_KEY, status.deviceId);
      } catch {}
      writePersistentCookie(DEMO_DEVICE_STORAGE_KEY, status.deviceId);
      writeIdbKey(DEMO_DEVICE_STORAGE_KEY, status.deviceId);
    }
    saveDemoDeviceQuotaCache({
      used: status.queriesUsed ?? status.demoQueriesUsed ?? 0,
      limit: status.maxQueries ?? status.demoQueriesLimit ?? 15,
      remaining: status.remainingQueries ?? status.demoQueriesRemaining ?? 15
    });
    return status;
  },

  async createDemoSession() {
    const deviceId = (await hydrateDemoDevicePersistence()) || getOrCreatePersistentDemoDeviceId();
    const res = await fetch(`${API_BASE_URL}/api/auth/demo`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-Demo-Device-Id': deviceId
      }
    });
    const session = await parseJsonOrThrow(res, 'No se pudo iniciar sesión demo');
    if (session.demoDeviceId) {
      try {
        localStorage.setItem(DEMO_DEVICE_STORAGE_KEY, session.demoDeviceId);
      } catch {}
      writePersistentCookie(DEMO_DEVICE_STORAGE_KEY, session.demoDeviceId);
      writeIdbKey(DEMO_DEVICE_STORAGE_KEY, session.demoDeviceId);
    }
    const used = Number(session.queriesUsed ?? session.demoQueriesUsed ?? 0);
    const limit = Number(session.maxQueries ?? session.demoQueriesLimit ?? 15);
    const remaining = Math.max(0, Number(session.remainingQueries ?? session.demoQueriesRemaining ?? limit - used));
    saveDemoDeviceQuotaCache({ used, limit, remaining });
    setStoredAuthSession({
      ...session,
      demoQueriesUsed: used,
      demoQueriesLimit: limit,
      demoQueriesRemaining: remaining
    });
    return {
      ...session,
      demoQueriesUsed: used,
      demoQueriesLimit: limit,
      demoQueriesRemaining: remaining
    };
  },

  async login(identifier, password) {
    const deviceId = (await hydrateDemoDevicePersistence()) || getOrCreatePersistentDemoDeviceId();
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Device-Id': deviceId
      },
      body: JSON.stringify({ identifier, username: identifier, password })
    });
    const session = await parseJsonOrThrow(res, 'Credenciales inválidas');
    if (session.isDemo) {
      saveDemoDeviceQuotaCache({
        used: session.demoQueriesUsed ?? 0,
        limit: session.demoQueriesLimit ?? 15,
        remaining: session.demoQueriesRemaining ?? 15
      });
    }
    setStoredAuthSession(session);
    return session;
  },

  async register({ fullName, username, email, password, clubName }) {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName,
        displayName: fullName,
        username,
        email,
        password,
        clubName
      })
    });
    const session = await parseJsonOrThrow(res, 'No se pudo registrar la cuenta');
    setStoredAuthSession(session);
    return session;
  },

  async getCurrentUser() {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/auth/me`, { method: 'GET' });
    return parseJsonOrThrow(res, 'Sesión no válida');
  },

  logout() {
    clearStoredAuthSession();
  },

  // 1. Salud del Sistema & Apagado Limpio
  async checkHealth() {
    const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
    return parseJsonOrThrow(res, 'Backend 8000 Offline');
  },

  async shutdownSystem() {
    return fetchWithAuth(`${API_BASE_URL}/api/v1/system/shutdown`, { method: 'POST' });
  },

  // 2. Sincronización Vectorial con Wikipedia API (pgvector)
  async syncWikipediaKnowledge() {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/tactical/sync-external`, { method: 'POST' });
    return parseJsonOrThrow(res, 'Error al sincronizar Wikipedia');
  },

  // 3. Chat RAG con Entrenador Táctico IA + Persistencia de Conversaciones por Perfil
  async askTacticalAssistant(payload, signal) {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(res, 'Error en la consulta táctica');
  },

  async getChatSessions() {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/chat/sessions`, { method: 'GET' });
    return parseJsonOrThrow(res, 'No se pudo cargar el historial de conversaciones');
  },

  async createChatSession(payload = {}) {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(res, 'No se pudo crear la conversación');
  },

  async getChatSessionMessages(sessionId) {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: 'GET'
    });
    return parseJsonOrThrow(res, 'No se pudieron recuperar los mensajes guardados');
  },

  async deleteChatSession(sessionId) {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE'
    });
    return parseJsonOrThrow(res, 'No se pudo eliminar la conversación');
  },

  // 4. Ingesta Asíncrona de Documentos PDF + OCR + Gestión de Expedientes
  async uploadPdfDocument(formData) {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/documents/upload-pdf`, {
      method: 'POST',
      body: formData
    });
    return parseJsonOrThrow(res, 'Error al procesar el PDF');
  },

  async getExpedientes() {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/expedientes`, { method: 'GET' });
    return parseJsonOrThrow(res, 'No se pudieron obtener los expedientes PDF');
  },

  async getExpediente(id) {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/expedientes/${encodeURIComponent(id)}`, {
      method: 'GET'
    });
    return parseJsonOrThrow(res, 'No se pudo consultar el estado del expediente');
  },

  async deleteExpediente(id) {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/expedientes/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return parseJsonOrThrow(res, 'No se pudo eliminar el expediente');
  },

  // 5. Gestión de Plantilla Personalizada & Motor de Sinergia / Top 100
  async getSquadPlayers() {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/squad/players`, { method: 'GET' });
    return parseJsonOrThrow(res, 'No se pudo obtener la plantilla');
  },

  async createSquadPlayer(payload) {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/squad/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(res, 'No se pudo guardar el jugador');
  },

  async deleteSquadPlayer(id) {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/squad/players/${id}`, { method: 'DELETE' });
    return parseJsonOrThrow(res, 'No se pudo eliminar el jugador');
  },

  async clearAllSquadPlayers() {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/squad/players`, { method: 'DELETE' });
    return parseJsonOrThrow(res, 'No se pudo vaciar la plantilla');
  },

  async loadDemoSquad(modality) {
    const res = await fetchWithAuth(
      `${API_BASE_URL}/api/v1/squad/demo?modality=${encodeURIComponent(modality)}`,
      { method: 'POST' }
    );
    return parseJsonOrThrow(res, 'Error al cargar plantilla demo');
  },

  async optimizeSquad(payload) {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/squad/optimize`, {
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
