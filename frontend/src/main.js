/* ==========================================================================
   TacticalPlay RAG — Modular Frontend Entry Point (Vite + ES Modules)
   ========================================================================== */

import gsap from 'gsap';
import { state, tacticalStore } from './store/tacticalStore.js';
import { renderTacticalPitch, renderSquadPitch } from './engine/pitchEngine.js';
import {
  checkBackendHealth,
  appendWelcomeMessage,
  initChatViewEvents,
  refreshExpedientesList,
  refreshChatSessionsList
} from './ui/chatView.js';
import {
  initAuthView,
  bootstrapAuthSession,
  showAuthGate,
  hideAuthGate,
  syncAuthSessionHeader,
  refreshDemoDeviceStatus,
  isDemoSession
} from './ui/authView.js';
import { getStoredAuthSession, getOrCreatePersistentDemoDeviceId } from './services/api.js';
import {
  populateFormationDropdown,
  populateSetPieceDropdown,
  initPitchViewEvents
} from './ui/pitchView.js';
import {
  populatePlayerPositionSelect,
  populateSquadFormationDropdown,
  refreshSquadAndOptimize,
  initSquadViewEvents
} from './ui/squadView.js';
import './style.css';
import {
  initBlueRoseIntroEvents,
  playBlueRoseIntroCinematic,
  initAmbientBluePetalsCanvas
} from './engine/introRoseEngine.js';
import { initLoginBackdropCanvas } from './engine/loginBackdropEngine.js';

const yieldToMain = () => {
  if ('scheduler' in globalThis && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
};

let boardInitialized = false;
function ensureBoardInitialized({ renderPitch = false } = {}) {
  if (!boardInitialized) {
    boardInitialized = true;
    initPitchViewEvents();
    populateFormationDropdown();
    populateSetPieceDropdown();
  }
  if (renderPitch) {
    renderTacticalPitch();
  }
}

let squadInitialized = false;
function ensureSquadInitialized({ refresh = false } = {}) {
  if (!squadInitialized) {
    squadInitialized = true;
    initSquadViewEvents();
    populatePlayerPositionSelect();
    populateSquadFormationDropdown();
  }
  if (refresh) {
    refreshSquadAndOptimize();
  }
}

const supportsAnchorSlidingPill =
  typeof CSS !== 'undefined' &&
  CSS.supports('(anchor-name: --a) and (inset-inline: anchor(left))');

function syncSlidingIndicator(container) {
  if (!container || supportsAnchorSlidingPill) return;
  const activeBtn = container.querySelector('.active');
  if (!activeBtn) return;
  const btnW = activeBtn.offsetWidth;
  if (btnW === 0) return;
  const btnX = activeBtn.offsetLeft;
  container.style.setProperty('--pill-x', `${btnX}px`);
  container.style.setProperty('--pill-w', `${btnW}px`);
  container.classList.add('indicator-ready');
}

function initKineticHudInteractions() {
  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const hoverFineQuery = window.matchMedia?.('(hover: hover) and (pointer: fine)');

  // 1. Segmented sliding indicator fallback when CSS Anchor Positioning isn't supported
  if (!supportsAnchorSlidingPill) {
    const navTabsEl = document.querySelector('.view-tabs-nav');
    const cameraSegEl = document.querySelector('.pitch-camera-segmented');

    requestAnimationFrame(() => {
      syncSlidingIndicator(navTabsEl);
      syncSlidingIndicator(cameraSegEl);
    });

    [navTabsEl, cameraSegEl].forEach((groupEl) => {
      if (!groupEl) return;
      const observer = new MutationObserver(() => {
        requestAnimationFrame(() => syncSlidingIndicator(groupEl));
      });
      observer.observe(groupEl, { attributes: true, subtree: true, attributeFilter: ['class'] });
    });
  }

  // 2. Cursor Spotlight tracking on .glass-card & .btn-primary (rAF-batched, zero forced reflow)
  if (!hoverFineQuery || hoverFineQuery.matches) {
    let pendingTarget = null;
    let pendingX = 0;
    let pendingY = 0;
    let spotlightRafId = 0;

    document.addEventListener(
      'pointermove',
      (e) => {
        if (reducedMotionQuery?.matches) return;
        const target = e.target?.closest?.('.glass-card, .btn-primary');
        if (!target) return;
        pendingTarget = target;
        pendingX = e.clientX;
        pendingY = e.clientY;
        if (!spotlightRafId) {
          spotlightRafId = requestAnimationFrame(() => {
            spotlightRafId = 0;
            const el = pendingTarget;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const xPct = Math.round(((pendingX - rect.left) / rect.width) * 1000) / 10;
            const yPct = Math.round(((pendingY - rect.top) / rect.height) * 1000) / 10;
            el.style.setProperty('--spot-x', `${xPct}%`);
            el.style.setProperty('--spot-y', `${yPct}%`);
          });
        }
      },
      { passive: true }
    );
  }
}

// Subscribe reactive view updates on tab navigation
document.body.dataset.activeTab = state.activeTab || 'assistant';

tacticalStore.subscribe('tab:changed', (tabName) => {
  document.body.dataset.activeTab = tabName || 'assistant';
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    const activeViewEl = document.querySelector('.tab-view.active-view');
    if (activeViewEl) {
      const cards = activeViewEl.querySelectorAll('.glass-card');
      gsap.killTweensOf(cards);
      gsap.set(cards, { clearProps: 'transform,opacity' });
    }
  }
  if (!supportsAnchorSlidingPill) {
    requestAnimationFrame(() => {
      syncSlidingIndicator(document.querySelector('.view-tabs-nav'));
      if (tabName === 'board') {
        syncSlidingIndicator(document.querySelector('.pitch-camera-segmented'));
      }
    });
  }
  if (tabName === 'board') {
    requestAnimationFrame(() => ensureBoardInitialized({ renderPitch: true }));
  } else if (tabName === 'squad') {
    requestAnimationFrame(() => ensureSquadInitialized({ refresh: true }));
  }
});

// Re-adjust pitch coordinates & sliding indicators on window resize
window.addEventListener('resize', () => {
  if (!supportsAnchorSlidingPill) {
    requestAnimationFrame(() => {
      syncSlidingIndicator(document.querySelector('.view-tabs-nav'));
      if (state.activeTab === 'board') {
        syncSlidingIndicator(document.querySelector('.pitch-camera-segmented'));
      }
    });
  }
  if (state.activeTab === 'board') {
    ensureBoardInitialized({ renderPitch: true });
  } else if (state.activeTab === 'squad') {
    ensureSquadInitialized({ refresh: false });
    renderSquadPitch();
  }
});

// Critical above-the-fold bootstrap: Persistent Demo Device ID + Blue Rose intro + Auth Gate / App Shell
getOrCreatePersistentDemoDeviceId();
const cachedOnBoot = getStoredAuthSession();
if (cachedOnBoot?.token) {
  syncAuthSessionHeader(cachedOnBoot);
  hideAuthGate();
} else {
  syncAuthSessionHeader(null);
  showAuthGate({ mode: 'login', focusInput: false });
}

playBlueRoseIntroCinematic();
initBlueRoseIntroEvents();
initLoginBackdropCanvas();
initAmbientBluePetalsCanvas();
initChatViewEvents();
initAuthView({
  onSessionChanged: async (session) => {
    state.activeChatSessionId = null;
    state.squadPlayers = [];
    state.indexedDocs = [];
    state.chatSessions = [];
    appendWelcomeMessage({ animate: false });
    await Promise.all([refreshChatSessionsList(), refreshExpedientesList()]);
    if (squadInitialized && session?.token && !isDemoSession(session)) {
      refreshSquadAndOptimize();
    }
  }
});
appendWelcomeMessage({ animate: false });

const isIntroOverlayVisible = () => {
  const overlay = document.getElementById('intro-rose-overlay');
  return Boolean(overlay && !overlay.classList.contains('hidden') && overlay.style.display !== 'none');
};

window.addEventListener('tactical:intro-finished', () => {
  if (!getStoredAuthSession()) {
    showAuthGate({ mode: 'login', focusInput: true });
  }
});

window.addEventListener('tactical:auth-required', () => {
  syncAuthSessionHeader(null);
  state.activeChatSessionId = null;
  state.chatSessions = [];
  state.indexedDocs = [];
  refreshChatSessionsList();
  refreshExpedientesList();
  showAuthGate({ mode: 'login', focusInput: !isIntroOverlayVisible() });
});

requestAnimationFrame(() => {
  initKineticHudInteractions();
});

// Defer Tab 2 / Tab 3 wiring and backend health probe into small idle main-thread chunks
async function bootstrapDeferredModules() {
  await yieldToMain();
  await checkBackendHealth();
  const session = await bootstrapAuthSession();
  if (session?.token) {
    await Promise.all([refreshChatSessionsList(), refreshExpedientesList()]);
  } else {
    refreshChatSessionsList();
    refreshExpedientesList();
    await refreshDemoDeviceStatus();
  }

  const scheduleIdle = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 1200 })
    : (fn) => setTimeout(fn, 180);

  scheduleIdle(async () => {
    ensureBoardInitialized({ renderPitch: state.activeTab === 'board' });
    await yieldToMain();
    ensureSquadInitialized({
      refresh: Boolean(session?.token) && !isDemoSession(session) && state.activeTab === 'squad'
    });
  });
}

bootstrapDeferredModules();
