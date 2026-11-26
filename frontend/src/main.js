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
  playBlueRoseIntroCinematic,
  initAmbientBluePetalsCanvas
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

function createKaiserVineCornerSvg(cornerClass) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', `kaiser-vine-corner ${cornerClass}`);
  svg.setAttribute('viewBox', '0 0 180 180');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');

  svg.innerHTML = `
    <g class="kaiser-vine-layer">
      <!-- Tallos principales entrelazados: contorno negro tinta #02050c + núcleo cobalto #1e3a8a + filo cian #38bdf8 -->
      <path d="M4 158 C8 114 20 74 52 44 C82 16 122 8 168 10" stroke="#02050c" stroke-width="7.2" stroke-linecap="round" />
      <path d="M4 158 C8 114 20 74 52 44 C82 16 122 8 168 10" stroke="#1e3a8a" stroke-width="4.2" stroke-linecap="round" />
      <path d="M4 158 C8 114 20 74 52 44 C82 16 122 8 168 10" stroke="#38bdf8" stroke-width="1.25" stroke-opacity="0.88" stroke-linecap="round" />

      <path d="M12 132 C16 86 38 48 82 28 C108 16 132 18 152 24" stroke="#02050c" stroke-width="5.2" stroke-linecap="round" />
      <path d="M12 132 C16 86 38 48 82 28 C108 16 132 18 152 24" stroke="#1e3a8a" stroke-width="2.8" stroke-linecap="round" />
      <path d="M12 132 C16 86 38 48 82 28 C108 16 132 18 152 24" stroke="#38bdf8" stroke-width="1" stroke-opacity="0.82" stroke-linecap="round" />

      <!-- Espinas triangulares afiladas a lo largo de los tallos -->
      <path d="M10 116 L0 105 L14 108 Z M19 88 L8 76 L24 81 Z M35 58 L27 42 L44 51 Z M65 34 L62 18 L75 29 Z M102 18 L104 4 L112 16 Z M136 12 L144 2 L146 13 Z M26 98 L40 105 L31 90 Z M54 50 L68 57 L58 43 Z M94 25 L106 34 L99 20 Z" fill="#1e3a8a" stroke="#02050c" stroke-width="1.3" stroke-linejoin="round" />
      <path d="M10 116 L0 105 M19 88 L8 76 M35 58 L27 42 M65 34 L62 18 M102 18 L104 4 M136 12 L144 2 M26 98 L40 105 M54 50 L68 57" stroke="#38bdf8" stroke-width="1.05" stroke-linecap="round" />

      <!-- Brote de Rosa Azul Esculpida en la esquina -->
      <g transform="translate(30, 30)">
        <path d="M-12 12 L-22 20 L-10 4 Z M12 -12 L22 -20 L4 -10 Z" fill="#02050c" stroke="#38bdf8" stroke-width="1" />
        <path d="M0 -22 L12 -16 L17 -4 L9 10 L-9 10 L-17 -4 L-12 -16 Z" fill="#1e3a8a" stroke="#02050c" stroke-width="1.8" stroke-linejoin="round" />
        <path d="M0 -22 L12 -16 L17 -4 L9 10 L-9 10 L-17 -4 L-12 -16 Z" stroke="#38bdf8" stroke-width="1.15" stroke-linejoin="round" />
        <path d="M-10 -12 L0 -18 L10 -12 L11 0 L0 8 L-11 0 Z" fill="#2563eb" stroke="#7dd3fc" stroke-width="1.15" stroke-linejoin="round" />
        <path d="M-6 -6 L0 -12 L6 -6 L4 2 L0 5 L-4 2 Z" fill="#02050c" stroke="#38bdf8" stroke-width="1.1" />
        <path d="M-3 -3 L0 -7 L3 -3 L0 2 Z" fill="#00f0ff" />
      </g>

      <!-- Haces de impulso nervioso cian (animados con stroke-dashoffset en :hover o cambio de pestaña) -->
      <path class="kaiser-vine-nerve" pathLength="100" d="M4 158 C8 114 20 74 52 44 C82 16 122 8 168 10" stroke="#00f0ff" stroke-width="2.2" stroke-linecap="round" />
      <path class="kaiser-vine-nerve nerve-alt" pathLength="100" d="M12 132 C16 86 38 48 82 28 C108 16 132 18 152 24" stroke="#e0f2fe" stroke-width="1.4" stroke-linecap="round" />
    </g>
  `;
  return svg;
}

function initKaiserCardVineFrames() {
  const cards = document.querySelectorAll('.glass-card');
  if (!cards.length) return;

  const template = document.createElement('div');
  template.className = 'kaiser-card-vines';
  template.setAttribute('aria-hidden', 'true');
  template.appendChild(createKaiserVineCornerSvg('tl'));
  template.appendChild(createKaiserVineCornerSvg('br'));

  cards.forEach((cardEl) => {
    if (cardEl.querySelector('.kaiser-card-vines')) return;
    cardEl.prepend(template.cloneNode(true));
  });
}

function triggerVineNervePulseOnActiveTab() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const activeCards = document.querySelectorAll('.tab-view.active-view .glass-card');
  if (!activeCards.length) return;
  activeCards.forEach((c) => c.classList.remove('vine-surge'));
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      activeCards.forEach((c) => c.classList.add('vine-surge'));
    });
  });
}

function initKineticHudInteractions() {
  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const hoverFineQuery = window.matchMedia?.('(hover: hover) and (pointer: fine)');

  initKaiserCardVineFrames();
  triggerVineNervePulseOnActiveTab();

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
  initKaiserCardVineFrames();
  triggerVineNervePulseOnActiveTab();
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
  initAmbientBluePetalsCanvas();
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
