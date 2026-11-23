/* ==========================================================================
   TacticalPlay RAG — Modular Frontend Entry Point (Vite + ES Modules)
   ========================================================================== */

import { state, tacticalStore } from './store/tacticalStore.js';
import { renderTacticalPitch, renderSquadPitch } from './engine/pitchEngine.js';
import {
  checkBackendHealth,
  appendWelcomeMessage,
  initChatViewEvents
} from './ui/chatView.js';
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
import {
  initBlueRoseIntroEvents,
  playBlueRoseIntroCinematic
} from './engine/introRoseEngine.js';

const yieldToMain = () => {
  if ('scheduler' in globalThis && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
};

let fullStylesLoaded = false;
const loadDeferredStyles = () => {
  if (fullStylesLoaded) return;
  fullStylesLoaded = true;
  import('./style.css');
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

// Subscribe reactive view updates on tab navigation
tacticalStore.subscribe('tab:changed', (tabName) => {
  loadDeferredStyles();
  if (tabName === 'board') {
    requestAnimationFrame(() => ensureBoardInitialized({ renderPitch: true }));
  } else if (tabName === 'squad') {
    requestAnimationFrame(() => ensureSquadInitialized({ refresh: true }));
  }
});

// Re-adjust pitch coordinates on window resize
window.addEventListener('resize', () => {
  if (state.activeTab === 'board') {
    ensureBoardInitialized({ renderPitch: true });
  } else if (state.activeTab === 'squad') {
    ensureSquadInitialized({ refresh: false });
    renderSquadPitch();
  }
});

// Critical above-the-fold bootstrap: Blue Rose intro + Tab 1 shell
playBlueRoseIntroCinematic();
initBlueRoseIntroEvents();
initChatViewEvents();
appendWelcomeMessage({ animate: false });

// Load remaining non-critical stylesheet outside the initial render-blocking path
requestAnimationFrame(() => loadDeferredStyles());

// Defer Tab 2 / Tab 3 wiring and backend health probe into small idle main-thread chunks
async function bootstrapDeferredModules() {
  await yieldToMain();
  checkBackendHealth();

  const scheduleIdle = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 1200 })
    : (fn) => setTimeout(fn, 180);

  scheduleIdle(async () => {
    ensureBoardInitialized({ renderPitch: state.activeTab === 'board' });
    await yieldToMain();
    ensureSquadInitialized({ refresh: state.activeTab === 'squad' });
  });
}

bootstrapDeferredModules();
