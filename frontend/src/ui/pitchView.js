/* ==========================================================================
   Tab 2 UI View: 🏟️ Pizarra & Formaciones (Selectores, Jugadas & Exportación)
   ========================================================================== */

import {
  state,
  dom,
  escapeHtml,
  switchTab,
  FORMATIONS_BY_MODALITY,
  getSetPiecesForCurrentSelection,
  getActiveFormationSetup,
  getActiveSetPiece,
  resolveReferenceCoach
} from '../store/tacticalStore.js';
import {
  clearPlaybackTimers,
  renderTacticalPitch,
  playSetPieceAnimation,
  advanceNextSetPieceStep,
  resetSetPieceToStart,
  toggleTv25DView,
  handleExportPrintableMatchPlan
} from '../engine/pitchEngine.js';
import { setModality, sendChatMessage } from './chatView.js';

function syncSelectTitle(selectEl) {
  if (!selectEl) return;
  const selectedOpt = selectEl.options?.[selectEl.selectedIndex];
  selectEl.title = selectedOpt ? selectedOpt.textContent.trim() : '';
}

export function populateFormationDropdown() {
  const list = FORMATIONS_BY_MODALITY[state.modality] || FORMATIONS_BY_MODALITY['Futsal'];
  dom.formationSelect.innerHTML = list
    .map((item, idx) => `<option value="${idx}" ${idx === state.formationIndex ? 'selected' : ''}>${escapeHtml(item.code)}</option>`)
    .join('');
  syncSelectTitle(dom.formationSelect);
  syncSelectTitle(dom.styleSelect);
  syncSelectTitle(dom.setpieceCategorySelect);
}

export function populateSetPieceDropdown() {
  if (!dom.setpieceSelect) return;
  const list = getSetPiecesForCurrentSelection();

  if (state.setPieceCategory === 'free' || list.length === 0) {
    dom.setpieceSelect.disabled = true;
    dom.setpieceSelect.innerHTML = '<option value="0">Posicional en cancha (Sin balón parado)</option>';
    syncSelectTitle(dom.setpieceSelect);
    return;
  }

  dom.setpieceSelect.disabled = false;
  const icon = state.setPieceCategory === 'attack' ? '⚔️ ' : '🛡️ ';
  dom.setpieceSelect.innerHTML = list
    .map((item, idx) => `<option value="${idx}" ${idx === state.setPieceIndex ? 'selected' : ''}>${icon}${escapeHtml(item.name)}</option>`)
    .join('');
  syncSelectTitle(dom.setpieceSelect);
}

export function initPitchViewEvents() {
  // Modality pills (Tab 2 board)
  dom.boardModalityPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.board-mod-pill');
    if (!pill) return;
    setModality(pill.dataset.modality);
  });

  // Formation dropdown change (Tab 2)
  dom.formationSelect.addEventListener('change', (e) => {
    state.formationIndex = Number(e.target.value) || 0;
    syncSelectTitle(dom.formationSelect);
    renderTacticalPitch(true);
  });

  // Play Style dropdown change (Tab 2)
  dom.styleSelect.addEventListener('change', (e) => {
    state.playStyle = e.target.value;
    syncSelectTitle(dom.styleSelect);
    renderTacticalPitch(true);
  });

  // Set Piece Category (4A) & Specific Set Piece (4B) dropdown changes
  if (dom.setpieceCategorySelect) {
    dom.setpieceCategorySelect.addEventListener('change', (e) => {
      clearPlaybackTimers();
      state.setPieceCategory = e.target.value;
      state.setPieceIndex = 0;
      state.setPieceStep = 0;
      syncSelectTitle(dom.setpieceCategorySelect);
      populateSetPieceDropdown();
      renderTacticalPitch(true);
      if (state.setPieceCategory !== 'free') {
        playSetPieceAnimation();
      }
    });
  }

  if (dom.setpieceSelect) {
    dom.setpieceSelect.addEventListener('change', (e) => {
      clearPlaybackTimers();
      state.setPieceIndex = Number(e.target.value) || 0;
      state.setPieceStep = 0;
      syncSelectTitle(dom.setpieceSelect);
      playSetPieceAnimation();
    });
  }

  if (dom.playSetpieceBtn) {
    dom.playSetpieceBtn.addEventListener('click', () => {
      playSetPieceAnimation();
    });
  }

  if (dom.nextStepSetpieceBtn) {
    dom.nextStepSetpieceBtn.addEventListener('click', () => {
      advanceNextSetPieceStep();
    });
  }

  if (dom.resetSetpieceBtn) {
    dom.resetSetpieceBtn.addEventListener('click', () => {
      resetSetPieceToStart();
    });
  }

  // Next formation button on tactical pitch
  dom.toggleVariantBtn.addEventListener('click', () => {
    clearPlaybackTimers();
    const list = FORMATIONS_BY_MODALITY[state.modality] || FORMATIONS_BY_MODALITY['Futsal'];
    state.formationIndex = (state.formationIndex + 1) % list.length;
    populateFormationDropdown();
    renderTacticalPitch(true);
  });

  // Analyze current board setup with AI Bot CTA
  dom.analyzeWithBotBtn.addEventListener('click', () => {
    const activeSetup = getActiveFormationSetup();
    const activeSetPiece = getActiveSetPiece();
    const coachInfo = resolveReferenceCoach(state.modality, activeSetup.code, state.playStyle);
    switchTab('assistant');

    const setPieceClause = activeSetPiece
      ? ` y cómo ejecutar la jugada de ${state.setPieceCategory === 'attack' ? 'ataque' : 'defensa'} "${activeSetPiece.name}"`
      : '';

    const prompt = `Míster, ¿cómo debemos jugar en ${state.modality} usando la formación ${activeSetup.code} con un estilo de ${state.playStyle} (tomando como referencia a ${coachInfo.name})${setPieceClause}? Dame 3 claves prácticas de cancha.`;
    sendChatMessage(prompt);
  });

  // Export Printable Match Plan PDF from Board
  if (dom.exportMatchPlanBoardBtn) {
    dom.exportMatchPlanBoardBtn.addEventListener('click', () => handleExportPrintableMatchPlan('board'));
  }

  // Toggle 2.5D TV Broadcast Perspective Camera
  if (dom.toggleTvViewBtn) {
    dom.toggleTvViewBtn.addEventListener('click', () => toggleTv25DView());
  }
}
