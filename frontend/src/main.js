/* ==========================================================================
   TacticalPlay RAG — Modular Frontend Entry Point (Vite + ES Modules)
   ========================================================================== */

import gsap from 'gsap';
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

const supportsAnchorSlidingPill =
  typeof CSS !== 'undefined' &&
  CSS.supports('(anchor-name: --a) and (inset-inline: anchor(left))');

function syncSlidingIndicator(container) {
  if (!container || supportsAnchorSlidingPill) return;
  const activeBtn = container.querySelector('.active');
  if (!activeBtn || activeBtn.offsetWidth === 0) return;
  container.style.setProperty('--pill-x', `${activeBtn.offsetLeft}px`);
  container.style.setProperty('--pill-w', `${activeBtn.offsetWidth}px`);
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
tacticalStore.subscribe('tab:changed', (tabName) => {
  loadDeferredStyles();
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

// Critical above-the-fold bootstrap: Blue Rose intro + Tab 1 shell
playBlueRoseIntroCinematic();
initBlueRoseIntroEvents();
initChatViewEvents();
appendWelcomeMessage({ animate: false });

// Load remaining non-critical stylesheet outside the initial render-blocking path
requestAnimationFrame(() => {
  loadDeferredStyles();
  initKineticHudInteractions();
});

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
