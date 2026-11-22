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

// Subscribe reactive view updates on tab navigation
tacticalStore.subscribe('tab:changed', (tabName) => {
  if (tabName === 'board') {
    requestAnimationFrame(() => renderTacticalPitch());
  } else if (tabName === 'squad') {
    requestAnimationFrame(() => refreshSquadAndOptimize());
  }
});

// Re-adjust pitch coordinates on window resize
window.addEventListener('resize', () => {
  if (state.activeTab === 'board') {
    renderTacticalPitch();
  } else if (state.activeTab === 'squad') {
    renderSquadPitch();
  }
});

// Bootstrap Application
initChatViewEvents();
initPitchViewEvents();
initSquadViewEvents();

populateFormationDropdown();
populateSetPieceDropdown();
populatePlayerPositionSelect();
populateSquadFormationDropdown();

checkBackendHealth();
renderTacticalPitch();
appendWelcomeMessage();
