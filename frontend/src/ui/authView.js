/* ==========================================================================
   JWT Multi-Tenant Auth Dialog & Accessible Form Validation
   ========================================================================== */

import {
  api,
  getStoredAuthSession,
  setStoredAuthSession,
  updateStoredDemoQuota,
  hydrateDemoDevicePersistence,
  getCachedDemoDeviceQuota,
  saveDemoDeviceQuotaCache
} from '../services/api.js';
import { state, dom, showToast, escapeHtml, switchTab } from '../store/tacticalStore.js';
import {
  handleToggleStadium3D,
  toggleHeatmapView,
  toggleFreehandDrawMode
} from '../engine/pitchEngine.js';

let onSessionChangedHandler = null;

let announcerEl = null;
let announceTimer = null;
let announcedField = null;

function ensureLiveAnnouncer() {
  if (announcerEl) return announcerEl;
  announcerEl = document.createElement('div');
  announcerEl.setAttribute('aria-live', 'polite');
  announcerEl.className = 'visually-hidden';
  document.body.append(announcerEl);
  return announcerEl;
}

function spokenText(node) {
  const copy = node.cloneNode(true);
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  copy.querySelectorAll('[role="img"][aria-label]').forEach((n) => {
    n.replaceWith(`${n.getAttribute('aria-label')}: `);
  });
  return copy.textContent.replace(/\s+/g, ' ').trim();
}

function linkError(el, shown) {
  const errorId = el.dataset.error;
  if (!errorId) return;
  const ids = (el.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (shown) ids.push(errorId);
  if (ids.length) {
    el.setAttribute('aria-describedby', ids.join(' '));
  } else {
    el.removeAttribute('aria-describedby');
  }
}

function announceFieldError(el) {
  const errorEl = document.getElementById(el.dataset.error);
  if (!errorEl) return;
  const announcer = ensureLiveAnnouncer();
  const label = el.labels?.[0] ? `${spokenText(el.labels[0])}: ` : '';
  clearTimeout(announceTimer);
  announcer.textContent = '';
  announcedField = el;
  announceTimer = setTimeout(() => {
    announcer.textContent = label + spokenText(errorEl);
  }, 500);
}

function initDeferredFormValidation(formEl) {
  if (!formEl) return;
  const supportsUserInvalid = typeof CSS !== 'undefined' && CSS.supports('selector(:user-invalid)');
  const dirtyMap = new WeakMap();
  const flagged = new WeakSet();
  const announced = new WeakSet();

  const syncFieldState = (el, { isInvalid, announce = false }) => {
    if (!supportsUserInvalid) {
      el.classList.toggle('user-invalid-fallback', isInvalid);
      el.classList.toggle('user-valid-fallback', !isInvalid);
    }
    if (isInvalid) {
      if (announce && !announced.has(el)) {
        announceFieldError(el);
        announced.add(el);
      }
      el.setAttribute('aria-invalid', 'true');
      linkError(el, true);
      flagged.add(el);
    } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
      el.setAttribute('aria-invalid', 'false');
      linkError(el, false);
      flagged.delete(el);
      announced.delete(el);
      if (announcedField === el && announcerEl) {
        clearTimeout(announceTimer);
        announcerEl.textContent = '';
      }
    }
  };

  formEl.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.hasAttribute('aria-invalid')) {
      el.setAttribute('aria-invalid', 'false');
    }
  });

  formEl.addEventListener(
    'blur',
    (e) => {
      const el = e.target;
      if (!el?.matches?.('input, select, textarea')) return;
      if (supportsUserInvalid) {
        syncFieldState(el, { isInvalid: el.matches(':user-invalid'), announce: true });
      } else {
        const meta = dirtyMap.get(el) || { hasInteracted: false, hasBlurred: false };
        meta.hasBlurred = true;
        dirtyMap.set(el, meta);
        if (meta.hasInteracted) {
          syncFieldState(el, { isInvalid: !el.validity.valid, announce: true });
        }
      }
    },
    true
  );

  formEl.addEventListener('input', (e) => {
    const el = e.target;
    if (!el?.matches?.('input, select, textarea')) return;
    if (supportsUserInvalid) {
      if (el.getAttribute('aria-invalid') === 'true' || el.matches(':user-invalid')) {
        syncFieldState(el, { isInvalid: el.matches(':user-invalid'), announce: false });
      }
    } else {
      const meta = dirtyMap.get(el) || { hasInteracted: false, hasBlurred: false };
      meta.hasInteracted = true;
      dirtyMap.set(el, meta);
      if (meta.hasBlurred) {
        syncFieldState(el, { isInvalid: !el.validity.valid, announce: false });
      }
    }
  });

  formEl.addEventListener(
    'invalid',
    (e) => {
      const el = e.target;
      if (!el?.matches?.('input, select, textarea')) return;
      announced.add(el);
      dirtyMap.set(el, { hasInteracted: true, hasBlurred: true });
      syncFieldState(el, { isInvalid: !el.validity.valid, announce: false });
    },
    true
  );

  formEl.addEventListener('reset', () => {
    setTimeout(() => {
      for (const control of formEl.elements) {
        if (!control.matches?.('input, select, textarea')) continue;
        dirtyMap.delete(control);
        control.classList.remove('user-invalid-fallback', 'user-valid-fallback');
        control.setAttribute('aria-invalid', 'false');
        linkError(control, false);
        flagged.delete(control);
        announced.delete(control);
      }
    });
  });
}

function wirePasswordToggle(btnId, inputId) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(isHidden));
    btn.textContent = isHidden ? 'Ocultar' : 'Mostrar';
    btn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}

export function isDemoSession(session = state.authSession) {
  return Boolean(session?.isDemo || session?.username === 'demo');
}

export function isDemoExhausted() {
  if (!isDemoSession(state.authSession)) return false;
  const remaining =
    state.demoQuota?.remaining ??
    state.authSession?.remainingQueries ??
    state.authSession?.demoQueriesRemaining ??
    15;
  return Number(remaining) <= 0;
}

export function setAuthGateMode(mode = 'login') {
  const loginTabBtn = document.getElementById('auth-mode-login-btn');
  const registerTabBtn = document.getElementById('auth-mode-register-btn');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginServerErr = document.getElementById('login-server-error');
  const regServerErr = document.getElementById('register-server-error');
  const isLogin = mode !== 'register';

  if (loginTabBtn) {
    loginTabBtn.classList.toggle('active', isLogin);
    loginTabBtn.setAttribute('aria-selected', String(isLogin));
  }
  if (registerTabBtn) {
    registerTabBtn.classList.toggle('active', !isLogin);
    registerTabBtn.setAttribute('aria-selected', String(!isLogin));
  }
  if (loginForm) loginForm.hidden = !isLogin;
  if (registerForm) registerForm.hidden = isLogin;
  if (loginServerErr) loginServerErr.hidden = true;
  if (regServerErr) regServerErr.hidden = true;
}

export function syncDemoGateButtonState(exhausted = false, quota = null) {
  const demoSwitchBtn = document.getElementById('switch-demo-session-btn');
  if (!demoSwitchBtn) return;

  // El botón "Entrar en Modo Demo" permanece SIEMPRE habilitado para explorar Pizarra 2D/2.5D
  demoSwitchBtn.disabled = false;
  demoSwitchBtn.classList.remove('demo-exhausted-btn');
  demoSwitchBtn.classList.toggle('demo-quota-empty', Boolean(exhausted));

  const limit = Number(quota?.limit ?? 15);
  const remaining = Math.max(0, Number(quota?.remaining ?? (exhausted ? 0 : limit)));
  const noteEl = document.getElementById('demo-gate-status-note');
  if (noteEl) {
    noteEl.textContent = `${remaining}/${limit} consultas disponibles · Pizarra 2D/2.5D libre`;
  } else {
    demoSwitchBtn.textContent = exhausted
      ? `Entrar en Modo Demo (0/${limit} consultas disponibles · Pizarra 2D/2.5D libre)`
      : `Entrar en Modo Demo (${remaining}/${limit} consultas disponibles · Pizarra 2D/2.5D libre)`;
  }
}

export async function refreshDemoDeviceStatus() {
  await hydrateDemoDevicePersistence();
  const cached = getCachedDemoDeviceQuota();
  if (cached) {
    syncDemoGateButtonState(cached.remaining <= 0, cached);
  }
  try {
    const serverStatus = await api.getDemoDeviceStatus();
    const used = Number(serverStatus.queriesUsed ?? serverStatus.demoQueriesUsed ?? 0);
    const limit = Number(serverStatus.maxQueries ?? serverStatus.demoQueriesLimit ?? 15);
    const remaining = Math.max(0, Number(serverStatus.remainingQueries ?? serverStatus.demoQueriesRemaining ?? limit - used));
    const exhausted = Boolean(serverStatus.demoExhausted || remaining <= 0);
    syncDemoGateButtonState(exhausted, { used, limit, remaining });
    return serverStatus;
  } catch {
    return cached;
  }
}

export function showAuthGate({ mode = 'login', focusInput = true } = {}) {
  const gateView = dom.authGateView || document.getElementById('auth-gate-view');
  const topbar = dom.topbarHeader || document.querySelector('.topbar');
  const mainContent = dom.appMainContent || document.getElementById('app-main-content');

  document.body.classList.add('auth-locked');
  if (topbar) topbar.hidden = true;
  if (mainContent) mainContent.hidden = true;
  if (gateView) gateView.hidden = false;

  setAuthGateMode(mode);
  refreshDemoDeviceStatus();

  if (focusInput) {
    requestAnimationFrame(() => {
      const targetId = mode === 'register' ? 'reg-display' : 'login-username';
      document.getElementById(targetId)?.focus();
    });
  }
}

export function hideAuthGate() {
  const gateView = dom.authGateView || document.getElementById('auth-gate-view');
  const topbar = dom.topbarHeader || document.querySelector('.topbar');
  const mainContent = dom.appMainContent || document.getElementById('app-main-content');

  if (gateView) gateView.hidden = true;
  if (topbar) topbar.hidden = false;
  if (mainContent) mainContent.hidden = false;
  document.body.classList.remove('auth-locked');
}

export function showDemoLimitModal(options = {}) {
  const dialog = dom.demoLimitDialog || document.getElementById('demo-limit-dialog');
  const kickerEl = document.getElementById('demo-limit-kicker');
  const titleEl = document.getElementById('demo-limit-dialog-title');
  const descEl = document.getElementById('demo-limit-dialog-desc');
  const reason = options?.reason || 'quota';
  const remaining = Math.max(0, Number(state.demoQuota?.remaining ?? state.authSession?.remainingQueries ?? state.authSession?.demoQueriesRemaining ?? 0));
  const limit = Number(state.demoQuota?.limit ?? state.authSession?.maxQueries ?? state.authSession?.demoQueriesLimit ?? 15);

  if (kickerEl) {
    if (reason === 'draw' || reason === 'heatmap' || reason === 'stadium3d') {
      kickerEl.textContent = `HERRAMIENTA EXCLUSIVA · MODO DEMO (${remaining} / ${limit} CONSULTAS)`;
    } else {
      kickerEl.textContent = `MODO DEMO AGOTADO · 0 / ${limit} CONSULTAS`;
    }
  }
  if (titleEl) {
    if (options?.title) {
      titleEl.textContent = options.title;
    } else if (reason === 'draw' || reason === 'heatmap' || reason === 'stadium3d') {
      titleEl.textContent = 'Desbloquear Cuenta Completa';
    } else {
      titleEl.textContent = 'Has agotado tus 15 consultas gratuitas en Modo Demo';
    }
  }
  if (descEl) {
    if (options?.description) {
      descEl.innerHTML = escapeHtml(options.description);
    } else if (reason === 'draw' || reason === 'heatmap') {
      descEl.innerHTML =
        'El <strong>dibujo de rutas tácticas (Trazar)</strong> y el <strong>análisis térmico zonal (Mapa de Calor)</strong> requieren una cuenta registrada gratuita. Regístrate en segundos para desbloquear todas las herramientas profesionales:';
    } else if (reason === 'stadium3d') {
      descEl.innerHTML =
        'La simulación <strong>Estadio 3D WebGL</strong>, el dibujo táctico y el análisis térmico zonal requieren una cuenta registrada gratuita:';
    } else {
      descEl.textContent =
        'Inicia sesión o crea tu cuenta gratuita para obtener consultas ilimitadas al Asistente RAG, guardar tu historial de conversaciones, subir expedientes PDF privados y desbloquear Mapa de Calor, Trazar Rutas, Estadio 3D y Gestión de Plantilla.';
    }
  }

  if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
    dialog.showModal();
  }
}

export function syncDemoQuotaUI(quota = state.demoQuota) {
  const isDemo = isDemoSession(state.authSession);
  const quotaPill = dom.demoQuotaPill || document.getElementById('demo-quota-pill');
  const limitBanner = dom.demoLimitBanner || document.getElementById('demo-limit-banner');
  const demoUpgradeBtn = dom.demoUpgradeBtn || document.getElementById('demo-upgrade-btn');

  if (!isDemo || !state.authSession?.token) {
    state.demoQuota = null;
    if (quotaPill) quotaPill.hidden = true;
    if (limitBanner) limitBanner.hidden = true;
    if (demoUpgradeBtn) demoUpgradeBtn.classList.remove('demo-upgrade-urgent');
    if (dom.chatInput) {
      dom.chatInput.disabled = false;
      dom.chatInput.readOnly = false;
      dom.chatInput.classList.remove('demo-input-exhausted');
      dom.chatInput.placeholder = 'Consulta ajustes de sistema, superioridades, balón parado o variantes...';
    }
    if (dom.sendChatBtn && !state.isSendingChat) dom.sendChatBtn.disabled = false;
    return;
  }

  const limit = Number(quota?.limit ?? state.authSession?.maxQueries ?? state.authSession?.demoQueriesLimit ?? 15);
  const used = Number(quota?.used ?? state.authSession?.queriesUsed ?? state.authSession?.demoQueriesUsed ?? 0);
  const remaining = Math.max(0, Number(quota?.remaining ?? state.authSession?.remainingQueries ?? state.authSession?.demoQueriesRemaining ?? limit - used));

  state.demoQuota = { used, limit, remaining };
  if (state.authSession) {
    state.authSession.queriesUsed = used;
    state.authSession.maxQueries = limit;
    state.authSession.remainingQueries = remaining;
    state.authSession.demoQueriesUsed = used;
    state.authSession.demoQueriesLimit = limit;
    state.authSession.demoQueriesRemaining = remaining;
    updateStoredDemoQuota(state.demoQuota);
  }

  const exhausted = remaining <= 0;

  if (quotaPill) {
    quotaPill.hidden = false;
    quotaPill.textContent = `Modo Demo · ${remaining} / ${limit} consultas`;
    quotaPill.classList.toggle('exhausted', exhausted);
  }

  if (limitBanner) {
    limitBanner.hidden = !exhausted;
  }

  if (demoUpgradeBtn) {
    demoUpgradeBtn.classList.toggle('demo-upgrade-urgent', exhausted);
  }

  // Mantenemos el input y el botón interactivos (readOnly cuando exhausted) para lanzar el modal al hacer clic/focus/enviar
  if (dom.chatInput) {
    dom.chatInput.disabled = false;
    dom.chatInput.readOnly = exhausted;
    dom.chatInput.classList.toggle('demo-input-exhausted', exhausted);
    if (exhausted) {
      dom.chatInput.value = '';
    }
    dom.chatInput.placeholder = exhausted
      ? '0/15 consultas disponibles — Haz clic aquí para crear cuenta gratis o iniciar sesión'
      : 'Consulta ajustes de sistema, superioridades, balón parado o variantes...';
  }
  if (dom.sendChatBtn && !state.isSendingChat) {
    dom.sendChatBtn.disabled = false;
  }
  if (dom.authSessionLabel && isDemo) {
    dom.authSessionLabel.textContent = `Modo Demo · ${remaining}/${limit} consultas`;
  }
  syncDemoGateButtonState(exhausted, state.demoQuota);
}

export function syncFeatureLocksUI() {
  const isDemo = isDemoSession(state.authSession);
  const demoUpgradeBtn = dom.demoUpgradeBtn || document.getElementById('demo-upgrade-btn');
  const squadLockBadge = dom.squadLockBadge || document.getElementById('squad-lock-badge');
  const squadExclusiveGate = dom.squadExclusiveGate || document.getElementById('squad-exclusive-gate');
  const squadWorkspaceGrid = dom.squadWorkspaceGrid || document.getElementById('squad-workspace-grid');

  if (demoUpgradeBtn) demoUpgradeBtn.hidden = !isDemo;
  if (squadLockBadge) squadLockBadge.hidden = !isDemo;
  if (squadExclusiveGate) squadExclusiveGate.hidden = !isDemo;
  if (squadWorkspaceGrid) squadWorkspaceGrid.hidden = isDemo;

  if (dom.goToSquadBtn) {
    const labelSpan = dom.goToSquadBtn.querySelector('span');
    if (labelSpan) labelSpan.textContent = isDemo ? 'Plantilla 🔒' : 'Plantilla';
    dom.goToSquadBtn.title = isDemo
      ? 'Exclusivo para usuarios registrados'
      : 'Ir a Gestión de Plantilla';
  }

  if (dom.toggleHeatmapBtn) {
    dom.toggleHeatmapBtn.classList.toggle('feature-locked', isDemo);
    const labelSpan = dom.toggleHeatmapBtn.querySelector('span');
    if (labelSpan) labelSpan.textContent = isDemo ? 'Calor 🔒' : 'Calor';
    dom.toggleHeatmapBtn.title = isDemo
      ? 'Mapa de Calor exclusivo para usuarios registrados'
      : 'Proyectar densidad térmica de ocupación espacial y telemetría zonal (solo vista 2D / 2.5D)';
  }

  if (dom.toggleDrawBtn) {
    dom.toggleDrawBtn.classList.toggle('feature-locked', isDemo);
    const labelSpan = dom.toggleDrawBtn.querySelector('span');
    if (labelSpan) labelSpan.textContent = isDemo ? 'Trazar 🔒' : 'Trazar';
    dom.toggleDrawBtn.title = isDemo
      ? 'Trazar Rutas Tácticas exclusivo para usuarios registrados'
      : 'Trazar pases, desmarques y zonas de presión sobre el campo (solo vista 2D / 2.5D)';
  }

  if (dom.toggleStadium3dBtn) {
    dom.toggleStadium3dBtn.classList.toggle('feature-locked', isDemo);
    const labelSpan = dom.toggleStadium3dBtn.querySelector('span');
    if (labelSpan) labelSpan.textContent = isDemo ? 'Estadio 3D 🔒' : 'Estadio 3D';
    dom.toggleStadium3dBtn.title = isDemo
      ? 'Estadio 3D exclusivo para usuarios registrados'
      : 'Simulación WebGL Estadio 3D';
  }

  if (isDemo) {
    if (state.isHeatmapActive) {
      toggleHeatmapView(false);
    }
    if (state.isDrawModeActive) {
      toggleFreehandDrawMode(false);
    }
    if (state.isStadium3DView) {
      handleToggleStadium3D(false);
    }
  }
}

export function syncAuthSessionHeader(session) {
  state.authSession = session || null;
  const logoutBtn = dom.logoutSessionBtn || document.getElementById('logout-session-btn');
  const summaryEl = document.getElementById('auth-current-summary');
  const isAuthenticated = Boolean(session?.token);
  const isDemo = isDemoSession(session);

  if (dom.authSessionLabel) {
    if (isAuthenticated && session?.username) {
      if (isDemo) {
        const limit = Number(session.demoQueriesLimit ?? 15);
        const rem = Number(session.demoQueriesRemaining ?? limit - Number(session.demoQueriesUsed ?? 0));
        dom.authSessionLabel.textContent = `Modo Demo · ${Math.max(0, rem)}/${limit} consultas`;
      } else {
        dom.authSessionLabel.textContent = `@${session.username}`;
      }
    } else {
      dom.authSessionLabel.textContent = 'Iniciar sesión';
    }
  }

  if (logoutBtn) logoutBtn.hidden = !isAuthenticated;

  if (summaryEl) {
    if (isAuthenticated) {
      const safeName = escapeHtml(session.fullName || session.displayName || session.username || 'Entrenador');
      const safeUser = escapeHtml(session.username || 'coach');
      summaryEl.innerHTML =
        `Sesión activa: <strong>${safeName}</strong> (<code>@${safeUser}</code>)`;
    } else {
      summaryEl.textContent =
        'Inicia sesión o crea tu perfil táctico aislado para entrar a TacticalPlay RAG.';
    }
  }

  syncFeatureLocksUI();
  syncDemoQuotaUI();
}

export async function bootstrapAuthSession() {
  await hydrateDemoDevicePersistence();
  const cached = getStoredAuthSession();
  if (!cached?.token) {
    syncAuthSessionHeader(null);
    showAuthGate({ mode: 'login', focusInput: false });
    return null;
  }

  syncAuthSessionHeader(cached);
  hideAuthGate();
  try {
    const profile = await api.getCurrentUser();
    const merged = { ...cached, ...profile };
    if (merged.isDemo) {
      const used = Number(merged.queriesUsed ?? merged.demoQueriesUsed ?? 0);
      const limit = Number(merged.maxQueries ?? merged.demoQueriesLimit ?? 15);
      const remaining = Math.max(0, Number(merged.remainingQueries ?? merged.demoQueriesRemaining ?? limit - used));
      merged.queriesUsed = used;
      merged.maxQueries = limit;
      merged.remainingQueries = remaining;
      merged.demoQueriesUsed = used;
      merged.demoQueriesLimit = limit;
      merged.demoQueriesRemaining = remaining;
      saveDemoDeviceQuotaCache({ used, limit, remaining });
    }
    setStoredAuthSession(merged);
    syncAuthSessionHeader(merged);
    return merged;
  } catch (err) {
    if (isDemoSession(cached)) {
      await refreshDemoDeviceStatus().catch(() => null);
    }
    const stillStored = getStoredAuthSession();
    if (!stillStored) {
      syncAuthSessionHeader(null);
      showAuthGate({ mode: 'login', focusInput: false });
      return null;
    }
    return stillStored;
  }
}

let unlockModalListenerBound = false;

export function initAuthView({ onSessionChanged } = {}) {
  onSessionChangedHandler = onSessionChanged || null;

  if (!unlockModalListenerBound) {
    unlockModalListenerBound = true;
    window.addEventListener('tactical:open-unlock-modal', (e) => {
      showDemoLimitModal(e?.detail || {});
    });
  }

  const logoutBtn = dom.logoutSessionBtn || document.getElementById('logout-session-btn');
  const demoUpgradeBtn = dom.demoUpgradeBtn || document.getElementById('demo-upgrade-btn');
  const demoLimitRegBtn = dom.demoLimitRegisterBtn || document.getElementById('demo-limit-register-btn');
  const squadGateRegBtn = dom.squadGateRegisterBtn || document.getElementById('squad-gate-register-btn');
  const squadGateLoginBtn = dom.squadGateLoginBtn || document.getElementById('squad-gate-login-btn');
  const demoLimitModalRegBtn = dom.demoLimitModalRegisterBtn || document.getElementById('demo-limit-modal-register-btn');
  const demoLimitModalLoginBtn = dom.demoLimitModalLoginBtn || document.getElementById('demo-limit-modal-login-btn');
  const demoLimitDialog = dom.demoLimitDialog || document.getElementById('demo-limit-dialog');
  const authSessionBtn = dom.authSessionBtn || document.getElementById('auth-session-btn');

  const loginTabBtn = document.getElementById('auth-mode-login-btn');
  const registerTabBtn = document.getElementById('auth-mode-register-btn');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginServerErr = document.getElementById('login-server-error');
  const regServerErr = document.getElementById('register-server-error');
  const demoSwitchBtn = document.getElementById('switch-demo-session-btn');

  loginTabBtn?.addEventListener('click', () => setAuthGateMode('login'));
  registerTabBtn?.addEventListener('click', () => setAuthGateMode('register'));

  wirePasswordToggle('toggle-login-password', 'login-password');
  wirePasswordToggle('toggle-reg-password', 'reg-password');

  initDeferredFormValidation(loginForm);
  initDeferredFormValidation(registerForm);

  const notifySwitch = async (session, actionLabel) => {
    hideAuthGate();
    syncAuthSessionHeader(session);
    switchTab('assistant');
    const remDemo = Math.max(
      0,
      Number(session?.remainingQueries ?? session?.demoQueriesRemaining ?? 0)
    );
    const limitDemo = Number(session?.maxQueries ?? session?.demoQueriesLimit ?? 15);
    showToast(
      actionLabel,
      session.isDemo
        ? (remDemo > 0
            ? `Modo Demo activo (${remDemo}/${limitDemo} consultas RAG) y Pizarra 2D/2.5D con jugadas preparadas.`
            : `Modo Demo activo (0/${limitDemo} consultas): explora libremente la Pizarra 2D/2.5D. Regístrate para consultas RAG ilimitadas.`)
        : `Perfil completo activo (@${session.username}) con Plantilla, Trazar, Mapa de Calor y Estadio 3D desbloqueados.`,
      remDemo === 0 && session.isDemo ? 'info' : 'success'
    );
    if (typeof onSessionChangedHandler === 'function') {
      await onSessionChangedHandler(session);
    }
  };

  const handleLogout = async (targetMode = 'login') => {
    api.logout();
    syncAuthSessionHeader(null);
    if (typeof onSessionChangedHandler === 'function') {
      await onSessionChangedHandler(null);
    }
    showAuthGate({ mode: targetMode });
  };

  logoutBtn?.addEventListener('click', async () => {
    showToast(
      'Sesión cerrada',
      'Vuelve a iniciar sesión o regístrate para entrar al estudio táctico.',
      'info'
    );
    await handleLogout('login');
  });

  const handleUpgradeFromDemo = async (targetMode = 'register') => {
    if (demoLimitDialog?.open) {
      demoLimitDialog.close();
    }
    await handleLogout(targetMode);
  };

  demoUpgradeBtn?.addEventListener('click', () => handleUpgradeFromDemo('register'));
  demoLimitRegBtn?.addEventListener('click', () => handleUpgradeFromDemo('register'));
  squadGateRegBtn?.addEventListener('click', () => handleUpgradeFromDemo('register'));
  squadGateLoginBtn?.addEventListener('click', () => handleUpgradeFromDemo('login'));
  demoLimitModalRegBtn?.addEventListener('click', () => handleUpgradeFromDemo('register'));
  demoLimitModalLoginBtn?.addEventListener('click', () => handleUpgradeFromDemo('login'));

  authSessionBtn?.addEventListener('click', () => {
    if (isDemoSession(state.authSession)) {
      handleUpgradeFromDemo('register');
    } else if (state.authSession?.username) {
      showToast(
        'Perfil Conectado',
        `Sesión activa como @${state.authSession.username}. Todas las funciones están desbloqueadas.`,
        'info'
      );
    }
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginServerErr) loginServerErr.hidden = true;
    if (!loginForm.checkValidity()) {
      loginForm.querySelector(':invalid')?.focus();
      return;
    }

    const submitBtn = document.getElementById('login-submit-btn');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const session = await api.login(
        loginForm.username.value.trim(),
        loginForm.password.value
      );
      loginForm.reset();
      await notifySwitch(session, 'Sesión Iniciada');
    } catch (err) {
      if (err.message.includes('DEMO_LIMIT_REACHED') || err.message.includes('Cuota Demo Agotada')) {
        saveDemoDeviceQuotaCache({ used: 15, limit: 15, remaining: 0 });
        syncDemoGateButtonState(true);
      }
      if (loginServerErr) {
        loginServerErr.textContent = err.message.replace(/^DEMO_LIMIT_REACHED:\s*/, '');
        loginServerErr.hidden = false;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (regServerErr) regServerErr.hidden = true;
    if (!registerForm.checkValidity()) {
      registerForm.querySelector(':invalid')?.focus();
      return;
    }

    const submitBtn = document.getElementById('register-submit-btn');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const session = await api.register({
        fullName: registerForm.fullName.value.trim(),
        username: registerForm.username.value.trim(),
        email: registerForm.email.value.trim(),
        password: registerForm.password.value
      });
      registerForm.reset();
      await notifySwitch(session, 'Cuenta Registrada');
    } catch (err) {
      if (regServerErr) {
        regServerErr.textContent = err.message;
        regServerErr.hidden = false;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  const demoLimitCancelBtn = document.getElementById('demo-limit-cancel-btn');
  demoLimitCancelBtn?.addEventListener('click', () => {
    switchTab('board');
  });

  demoSwitchBtn?.addEventListener('click', async () => {
    demoSwitchBtn.disabled = true;
    try {
      const session = await api.createDemoSession();
      await notifySwitch(session, 'Modo Demo Activado');
    } catch (err) {
      if (err.status === 403 || err.code === 'DEMO_QUERIES_EXHAUSTED' || err.message.includes('DEMO_LIMIT_REACHED')) {
        saveDemoDeviceQuotaCache({ used: 15, limit: 15, remaining: 0 });
        syncDemoGateButtonState(true, { used: 15, limit: 15, remaining: 0 });
        showToast('Modo Demo', err.message, 'info');
      } else {
        showToast('Error al activar modo demo', err.message, 'error');
      }
    } finally {
      demoSwitchBtn.disabled = false;
    }
  });
}
