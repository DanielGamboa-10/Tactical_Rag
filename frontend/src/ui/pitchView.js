/* ==========================================================================
   Tab 2 UI View: Pizarra Táctica (Selectores, Jugadas & Exportación)
   ========================================================================== */

import gsap from 'gsap';
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
  activate2DView,
  toggleTv25DView,
  handleToggleStadium3D,
  toggleHeatmapView,
  toggleFreehandDrawMode,
  setFreehandColor,
  undoLastFreehandStroke,
  clearFreehandDrawings,
  initFreehandDrawingEvents,
  toggleExpandBoard,
  handleExportPrintableMatchPlan,
  exportPitchAsPng
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
  const phasePrefix = state.setPieceCategory === 'attack' ? 'OF · ' : 'DEF · ';
  dom.setpieceSelect.innerHTML = list
    .map((item, idx) => `<option value="${idx}" ${idx === state.setPieceIndex ? 'selected' : ''}>${phasePrefix}${escapeHtml(item.name)}</option>`)
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

  // Export Tactical Pitch as High-Resolution PNG Image
  if (dom.exportPngBoardBtn) {
    dom.exportPngBoardBtn.addEventListener('click', () => exportPitchAsPng('board'));
  }

  // Selector de cámara segmentado (2D Cenital / TV 2.5D / Estadio 3D)
  if (dom.toggle2dViewBtn) {
    dom.toggle2dViewBtn.addEventListener('click', () => activate2DView());
  }

  // Toggle 2.5D TV Broadcast Perspective Camera
  if (dom.toggleTvViewBtn) {
    dom.toggleTvViewBtn.addEventListener('click', () => toggleTv25DView());
  }

  // Toggle 3D Night Stadium WebGL View (Three.js + OrbitControls + Follow-Cam)
  if (dom.toggleStadium3dBtn) {
    dom.toggleStadium3dBtn.addEventListener('click', () => handleToggleStadium3D());
  }

  // Toggle Tactical Heatmap Overlay
  if (dom.toggleHeatmapBtn) {
    dom.toggleHeatmapBtn.addEventListener('click', () => toggleHeatmapView());
  }

  // Toggle Freehand Tactical Drawing Pencil, Palette & Undo (Ctrl+Z)
  initFreehandDrawingEvents();
  if (dom.toggleDrawBtn) {
    dom.toggleDrawBtn.addEventListener('click', () => toggleFreehandDrawMode());
  }
  if (dom.freehandToolbar) {
    dom.freehandToolbar.addEventListener('click', (e) => {
      const colorBtn = e.target.closest('.freehand-color-btn');
      if (colorBtn && colorBtn.dataset.drawColor) {
        setFreehandColor(colorBtn.dataset.drawColor);
      }
    });
  }
  if (dom.undoDrawBtn) {
    dom.undoDrawBtn.addEventListener('click', () => undoLastFreehandStroke());
  }
  if (dom.clearDrawBtn) {
    dom.clearDrawBtn.addEventListener('click', () => clearFreehandDrawings());
  }
  document.addEventListener('keydown', (e) => {
    if (
      state.activeTab === 'board' &&
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === 'z' &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
    ) {
      if (undoLastFreehandStroke()) {
        e.preventDefault();
      }
    }
  });

  // Toggle Full-Width Presentation / Broadcast Mode
  if (dom.toggleExpandBoardBtn) {
    dom.toggleExpandBoardBtn.addEventListener('click', () => toggleExpandBoard());
  }

  // Inclinación 3D interactiva al cursor + brillo especular holográfico para la carta del DT Referente
  if (dom.referenceCoachCard) {
    dom.referenceCoachCard.addEventListener('mousemove', (e) => {
      const rect = dom.referenceCoachCard.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top) / rect.height;
      const rotateY = (relX - 0.5) * 18;
      const rotateX = (0.5 - relY) * 14;

      gsap.to(dom.referenceCoachCard, {
        rotateX,
        rotateY,
        scale: 1.015,
        transformPerspective: 1000,
        duration: 0.25,
        ease: 'power2.out',
        overwrite: 'auto'
      });

      if (dom.coachHoloGlareLayer) {
        const glareX = Math.round(relX * 100);
        const glareY = Math.round(relY * 100);
        dom.coachHoloGlareLayer.style.opacity = '1';
        dom.coachHoloGlareLayer.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(56, 189, 248, 0.34) 0%, rgba(56, 189, 248, 0.22) 40%, transparent 72%)`;
      }
    });

    dom.referenceCoachCard.addEventListener('mouseleave', () => {
      gsap.to(dom.referenceCoachCard, {
        rotateX: 0,
        rotateY: 0,
        scale: 1,
        transformPerspective: 1000,
        duration: 0.55,
        ease: 'elastic.out(1, 0.65)',
        overwrite: 'auto'
      });
      if (dom.coachHoloGlareLayer) {
        dom.coachHoloGlareLayer.style.opacity = '0';
      }
    });
  }
}
