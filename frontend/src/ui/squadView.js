/* ==========================================================================
   Tab 3 UI View: 👥 Tu Propia Plantilla (Drag & Drop, Química & Top 100)
   ========================================================================== */

import gsap from 'gsap';
import { api } from '../services/api.js';
import {
  state,
  dom,
  escapeHtml,
  showToast,
  switchTab,
  PLAY_STYLE_MODIFIERS,
  FORMATIONS_BY_MODALITY,
  NATURAL_POSITIONS_FUTSAL,
  NATURAL_POSITIONS_FIELD,
  getActiveSquadFormationSetup,
  isStrictNaturalPositionMatch
} from '../store/tacticalStore.js';
import {
  clearPlaybackTimers,
  renderTacticalPitch,
  renderSquadPitch,
  handleExportPrintableMatchPlan
} from '../engine/pitchEngine.js';
import { populateFormationDropdown, populateSetPieceDropdown } from './pitchView.js';
import { setModality, sendChatMessage } from './chatView.js';

let activeDragPayload = null;

export function isPlayerCompatibleWithActiveModality(positionCode, modality = state.squadModality) {
  const pos = String(positionCode || '').toUpperCase().trim();
  const isFutsal = String(modality || '').toLowerCase().includes('futsal');
  if (isFutsal) {
    return ['POR', 'CIE', 'ALA', 'PIV'].includes(pos);
  }
  return ['POR', 'DFC', 'LD', 'LI', 'MCD', 'MC', 'MCO', 'ED', 'EI', 'DC'].includes(pos);
}

function syncSquadSelectTitle(selectEl) {
  if (!selectEl) return;
  const selectedOpt = selectEl.options?.[selectEl.selectedIndex];
  selectEl.title = selectedOpt ? selectedOpt.textContent.trim() : '';
}

export function populatePlayerPositionSelect() {
  if (!dom.playerPosSelect) return;
  const isFutsal = String(state.squadModality || '').toLowerCase().includes('futsal');
  const options = isFutsal ? NATURAL_POSITIONS_FUTSAL : NATURAL_POSITIONS_FIELD;
  const currentVal = dom.playerPosSelect.value;

  dom.playerPosSelect.innerHTML = options
    .map((opt) => `<option value="${opt.code}">${escapeHtml(opt.label)}</option>`)
    .join('');

  if (options.some((o) => o.code === currentVal)) {
    dom.playerPosSelect.value = currentVal;
  } else {
    dom.playerPosSelect.value = isFutsal ? 'ALA' : 'MC';
  }
  syncSquadSelectTitle(dom.playerPosSelect);
  syncSquadSelectTitle(dom.playerFootSelect);
  syncSquadSelectTitle(dom.squadModalitySelect);
  syncSquadSelectTitle(dom.squadStyleSelect);
}

export function populateSquadFormationDropdown() {
  if (!dom.squadFormationSelect) return;
  const list = FORMATIONS_BY_MODALITY[state.squadModality] || FORMATIONS_BY_MODALITY['Fútbol 11'];
  dom.squadFormationSelect.innerHTML = list
    .map((item, idx) => `<option value="${idx}" ${idx === state.squadFormationIndex ? 'selected' : ''}>${escapeHtml(item.code)}</option>`)
    .join('');
  syncSquadSelectTitle(dom.squadFormationSelect);
}

function computePlayerOverall(p) {
  if (!p) return 75;
  if (typeof p.overall === 'number') return p.overall;
  return Math.round((p.pace + p.passing + p.dribbling + p.defending + p.shooting + p.vision) / 6);
}

export async function refreshSquadAndOptimize(idealChemistryMode = false) {
  if (!dom.squadRosterList) return;
  const setup = getActiveSquadFormationSetup();
  const targetSlots = setup.players.map((p) => p.role);
  const selectedPlayStyle = dom.squadStyleSelect ? dom.squadStyleSelect.value : 'Posesión & Juego de Posición';

  try {
    const requests = [
      api.getSquadPlayers(),
      api.optimizeSquad({
        modality: state.squadModality,
        formation: setup.code,
        targetSlots,
        playStyle: selectedPlayStyle,
        idealChemistryMode: Boolean(idealChemistryMode)
      })
    ];
    if (!Array.isArray(state.top100Catalog) || state.top100Catalog.length === 0) {
      requests.push(api.getTop100Players().catch(() => []));
    }

    const [players, opt, maybeTop100] = await Promise.all(requests);

    state.squadPlayers = players;
    state.squadOptimization = opt;
    if (Array.isArray(maybeTop100) && maybeTop100.length > 0) {
      state.top100Catalog = maybeTop100;
    }

    const modalityPlayers = state.squadPlayers.filter((p) =>
      isPlayerCompatibleWithActiveModality(p.position, state.squadModality)
    );
    if (
      modalityPlayers.length > 0 &&
      !modalityPlayers.some((p) => p.id === state.selectedSquadPlayerId)
    ) {
      state.selectedSquadPlayerId = modalityPlayers[0].id;
    }

    renderSquadRosterList();
    renderSquadPitch();
    renderSquadBench();
    renderIdealSquadBanner(idealChemistryMode);
    renderSelectedPlayerComparison();
  } catch (err) {
    console.warn('No se pudo cargar la plantilla personalizada:', err);
  }
}

export function renderIdealSquadBanner(showBanner = false) {
  if (!dom.idealSquadBanner) return;
  const opt = state.squadOptimization;
  if (!showBanner || !opt || !opt.idealMode) {
    dom.idealSquadBanner.classList.add('hidden');
    return;
  }

  const setup = getActiveSquadFormationSetup();
  const activeStyle = opt.playStyle || (dom.squadStyleSelect ? dom.squadStyleSelect.value : 'Posesión & Juego de Posición');
  if (dom.idealBannerTitle) {
    dom.idealBannerTitle.textContent = `✨ Plantilla Ideal por Química Colectiva · ${setup.code} (${activeStyle})`;
  }
  if (dom.idealBannerText) {
    dom.idealBannerText.textContent =
      opt.idealExplanation ||
      `Combinación óptima calculada para ${state.squadModality} maximizando complementariedad de roles, pie hábil y sinergia para el estilo ${activeStyle}.`;
  }
  if (dom.idealBannerPartners) {
    const partnerships = Array.isArray(opt.keyPartnerships) ? opt.keyPartnerships : [];
    dom.idealBannerPartners.innerHTML = partnerships
      .map((p) => `<span class="ideal-partner-pill">⚡ ${escapeHtml(p)}</span>`)
      .join('');
  }
  dom.idealSquadBanner.classList.remove('hidden');
}

async function handleGenerateIdealSquad() {
  if (!dom.generateIdealSquadBtn) return;
  dom.generateIdealSquadBtn.disabled = true;
  const activeStyle = dom.squadStyleSelect ? dom.squadStyleSelect.value : 'Posesión & Juego de Posición';

  try {
    await refreshSquadAndOptimize(true);
    const synergyPct = state.squadOptimization?.globalSynergy || 95;
    showToast(
      `✨ Plantilla Ideal Generada (${synergyPct}% Sinergia)`,
      `Titulares y banca optimizados por química colectiva, pie hábil y complementariedad para '${activeStyle}'.`,
      'success'
    );
  } finally {
    dom.generateIdealSquadBtn.disabled = false;
  }
}

function handleExportSquadToBoard() {
  const setup = getActiveSquadFormationSetup();
  const lineup = state.squadOptimization?.lineup || [];
  const selectedStyle = dom.squadStyleSelect
    ? dom.squadStyleSelect.value
    : 'Posesión & Juego de Posición';

  clearPlaybackTimers();
  state.modality = state.squadModality;
  state.formationIndex = state.squadFormationIndex;
  state.playStyle = PLAY_STYLE_MODIFIERS[selectedStyle]
    ? selectedStyle
    : 'Posesión & Juego de Posición';
  state.setPieceIndex = 0;
  state.setPieceStep = 0;

  state.exportedBoardLineup = {
    modality: state.squadModality,
    formationIndex: state.squadFormationIndex,
    formationCode: setup.code,
    playStyle: state.playStyle,
    starters: lineup.map((s) => ({ ...s }))
  };

  dom.modalitySelector.querySelectorAll('.modality-btn').forEach((btn) => {
    const isMatch = btn.dataset.modality === state.modality;
    btn.classList.toggle('active', isMatch);
    if (isMatch && dom.playersCountTag) {
      dom.playersCountTag.textContent = btn.dataset.players;
    }
  });
  dom.boardModalityPills.querySelectorAll('.board-mod-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.modality === state.modality);
  });

  populateFormationDropdown();
  if (dom.formationSelect) {
    dom.formationSelect.value = String(state.formationIndex);
  }
  if (dom.styleSelect) {
    dom.styleSelect.value = state.playStyle;
  }
  populateSetPieceDropdown();

  switchTab('board');
  renderTacticalPitch(true);

  const startersCount = lineup.filter((s) => s.assigned && s.playerId).length;
  showToast(
    '📤 Plantilla Exportada a la Pizarra',
    `${startersCount} titulares (${state.modality} · ${setup.code} · ${state.playStyle}) listos en cancha para ejecutar Jugadas Preparadas.`,
    'success'
  );
}

export function renderSquadRosterList() {
  if (!dom.squadRosterList) return;
  const compatiblePlayers = state.squadPlayers.filter((p) =>
    isPlayerCompatibleWithActiveModality(p.position, state.squadModality)
  );
  dom.squadCountBadge.textContent = String(compatiblePlayers.length);

  if (compatiblePlayers.length === 0) {
    dom.squadRosterList.innerHTML =
      `<li class="empty-docs-msg">No hay jugadores registrados para <strong>${escapeHtml(state.squadModality)}</strong>. Registra uno arriba o pulsa "⚡ Cargar Plantilla Demo".</li>`;
    return;
  }

  dom.squadRosterList.innerHTML = compatiblePlayers
    .map((p) => {
      const isSelected = p.id === state.selectedSquadPlayerId;
      const avg = computePlayerOverall(p);
      return `
        <li class="roster-player-item ${isSelected ? 'selected' : ''}" data-player-id="${p.id}">
          <div class="roster-item-left">
            <span class="roster-num-badge">${p.jerseyNumber}</span>
            <div class="doc-item-main">
              <span class="doc-item-name">${escapeHtml(p.name)}</span>
              <span class="doc-item-meta">${escapeHtml(p.position)} · Pie ${escapeHtml(p.preferredFoot)} · Media ${avg}</span>
            </div>
          </div>
          <button type="button" class="roster-delete-btn" data-delete-id="${p.id}" title="Eliminar jugador">✕</button>
        </li>
      `;
    })
    .join('');
}

export function renderSquadBench() {
  if (!dom.squadBenchList) return;
  const substitutes = state.squadOptimization?.substitutes || [];
  if (dom.benchCountBadge) {
    dom.benchCountBadge.textContent = `${substitutes.length} en banca`;
  }

  if (substitutes.length === 0) {
    dom.squadBenchList.innerHTML =
      '<div class="bench-empty-msg">No hay suplentes en banca. Si registras más de un jugador en la misma posición natural (o arrastras un titular aquí), aparecerán en la banca listos para entrar al campo.</div>';
    return;
  }

  dom.squadBenchList.innerHTML = substitutes
    .map((sub) => {
      const isSelected = sub.playerId === state.selectedSquadPlayerId;
      return `
        <div
          class="bench-player-chip ${isSelected ? 'selected-bench' : ''}"
          draggable="true"
          data-player-id="${sub.playerId}"
          title="Arrastra a cualquier posición de la cancha"
        >
          <span class="bench-chip-num">${sub.jerseyNumber}</span>
          <div class="bench-chip-info">
            <span class="bench-chip-name">${escapeHtml(sub.name)}</span>
            <span class="bench-chip-meta">Pie ${escapeHtml(sub.preferredFoot || 'Derecho')} · Media ${sub.overall || 80}</span>
          </div>
          <span class="bench-chip-pos">${escapeHtml(sub.naturalPosition || sub.position)}</span>
        </div>
      `;
    })
    .join('');
}

function recalculateLineupSynergy() {
  const opt = state.squadOptimization;
  if (!opt || !Array.isArray(opt.lineup)) return;

  let totalFit = 0;
  opt.lineup.forEach((slot) => {
    if (!slot.assigned || !slot.playerId) {
      slot.fitScore = 60;
      totalFit += 60;
      return;
    }
    const naturalMatch = isStrictNaturalPositionMatch(slot.naturalPosition, slot.slotRole);
    slot.outOfPosition = !naturalMatch;
    const baseOverall = slot.overall || 82;
    if (naturalMatch) {
      slot.fitScore = Math.min(99, Math.round(84 + (baseOverall - 70) * 0.45));
    } else {
      slot.fitScore = Math.max(52, Math.round(64 + (baseOverall - 75) * 0.25));
    }
    totalFit += slot.fitScore;
  });

  const avgSynergy = opt.lineup.length > 0 ? Math.round(totalFit / opt.lineup.length) : 82;
  opt.globalSynergy = Math.max(55, Math.min(99, avgSynergy));
  if (dom.squadGlobalSynergy) {
    dom.squadGlobalSynergy.textContent = `${opt.globalSynergy}%`;
  }
}

function handlePitchSlotDrop(targetSlotIdx) {
  if (!activeDragPayload || !state.squadOptimization) return;
  const opt = state.squadOptimization;
  const lineup = opt.lineup || [];
  const substitutes = opt.substitutes || [];
  const targetSlot = lineup[targetSlotIdx];
  if (!targetSlot) return;

  if (activeDragPayload.source === 'bench') {
    const subIdx = substitutes.findIndex((s) => s.playerId === activeDragPayload.playerId);
    if (subIdx === -1) return;
    const incomingSub = substitutes.splice(subIdx, 1)[0];

    if (targetSlot.assigned && targetSlot.playerId) {
      substitutes.push({
        playerId: targetSlot.playerId,
        name: targetSlot.name,
        jerseyNumber: targetSlot.jerseyNumber,
        naturalPosition: targetSlot.naturalPosition,
        preferredFoot: targetSlot.preferredFoot || 'Derecho',
        overall: targetSlot.overall || 82
      });
    }

    targetSlot.assigned = true;
    targetSlot.playerId = incomingSub.playerId;
    targetSlot.name = incomingSub.name;
    targetSlot.jerseyNumber = incomingSub.jerseyNumber;
    targetSlot.naturalPosition = incomingSub.naturalPosition || incomingSub.position;
    targetSlot.preferredFoot = incomingSub.preferredFoot;
    targetSlot.overall = incomingSub.overall;
    targetSlot.outOfPosition = !isStrictNaturalPositionMatch(targetSlot.naturalPosition, targetSlot.slotRole);
    state.selectedSquadPlayerId = incomingSub.playerId;
  } else if (activeDragPayload.source === 'pitch') {
    const sourceSlotIdx = activeDragPayload.slotIndex;
    if (sourceSlotIdx === targetSlotIdx) return;
    const sourceSlot = lineup[sourceSlotIdx];
    if (!sourceSlot || !sourceSlot.assigned) return;

    const temp = {
      assigned: targetSlot.assigned,
      playerId: targetSlot.playerId,
      name: targetSlot.name,
      jerseyNumber: targetSlot.jerseyNumber,
      naturalPosition: targetSlot.naturalPosition,
      preferredFoot: targetSlot.preferredFoot,
      overall: targetSlot.overall
    };

    targetSlot.assigned = true;
    targetSlot.playerId = sourceSlot.playerId;
    targetSlot.name = sourceSlot.name;
    targetSlot.jerseyNumber = sourceSlot.jerseyNumber;
    targetSlot.naturalPosition = sourceSlot.naturalPosition;
    targetSlot.preferredFoot = sourceSlot.preferredFoot;
    targetSlot.overall = sourceSlot.overall;
    targetSlot.outOfPosition = !isStrictNaturalPositionMatch(targetSlot.naturalPosition, targetSlot.slotRole);

    if (temp.assigned && temp.playerId) {
      sourceSlot.assigned = true;
      sourceSlot.playerId = temp.playerId;
      sourceSlot.name = temp.name;
      sourceSlot.jerseyNumber = temp.jerseyNumber;
      sourceSlot.naturalPosition = temp.naturalPosition;
      sourceSlot.preferredFoot = temp.preferredFoot;
      sourceSlot.overall = temp.overall;
      sourceSlot.outOfPosition = !isStrictNaturalPositionMatch(sourceSlot.naturalPosition, sourceSlot.slotRole);
    } else {
      sourceSlot.assigned = false;
      sourceSlot.playerId = null;
      sourceSlot.name = `Vacante (${sourceSlot.slotRole})`;
      sourceSlot.jerseyNumber = 0;
      sourceSlot.naturalPosition = sourceSlot.slotRole;
      sourceSlot.outOfPosition = false;
    }

    state.selectedSquadPlayerId = targetSlot.playerId;
  }

  activeDragPayload = null;
  recalculateLineupSynergy();
  renderSquadRosterList();
  renderSquadPitch();
  renderSquadBench();
  renderSelectedPlayerComparison();
}

function handleSendStarterToBench() {
  if (!activeDragPayload || activeDragPayload.source !== 'pitch' || !state.squadOptimization) return;
  const opt = state.squadOptimization;
  const lineup = opt.lineup || [];
  const substitutes = opt.substitutes || [];
  const sourceSlot = lineup[activeDragPayload.slotIndex];
  if (!sourceSlot || !sourceSlot.assigned || !sourceSlot.playerId) return;

  substitutes.push({
    playerId: sourceSlot.playerId,
    name: sourceSlot.name,
    jerseyNumber: sourceSlot.jerseyNumber,
    naturalPosition: sourceSlot.naturalPosition,
    preferredFoot: sourceSlot.preferredFoot || 'Derecho',
    overall: sourceSlot.overall || 82
  });

  sourceSlot.assigned = false;
  sourceSlot.playerId = null;
  sourceSlot.name = `Vacante (${sourceSlot.slotRole})`;
  sourceSlot.jerseyNumber = 0;
  sourceSlot.naturalPosition = sourceSlot.slotRole;
  sourceSlot.outOfPosition = false;

  activeDragPayload = null;
  recalculateLineupSynergy();
  renderSquadRosterList();
  renderSquadPitch();
  renderSquadBench();
  renderSelectedPlayerComparison();
}

const RADAR_CENTER_X = 120;
const RADAR_CENTER_Y = 102;
const RADAR_MAX_R = 68;
const RADAR_ANGLES_DEG = [-90, -30, 30, 90, 150, 210];

function computeRadarPoints(statsArray) {
  return statsArray.map((val, idx) => {
    const clamped = Math.max(35, Math.min(99, Number(val) || 75));
    const ratio = clamped / 100;
    const r = RADAR_MAX_R * ratio;
    const rad = (RADAR_ANGLES_DEG[idx] * Math.PI) / 180;
    const x = Math.round((RADAR_CENTER_X + r * Math.cos(rad)) * 10) / 10;
    const y = Math.round((RADAR_CENTER_Y + r * Math.sin(rad)) * 10) / 10;
    return { x, y, val: clamped };
  });
}

function renderPlayerRadarChart(userPlayer, crackRef, comp) {
  if (!dom.radarPolyUser || !dom.radarPolyCrack) return;

  const userStats = userPlayer
    ? [
        userPlayer.pace,
        userPlayer.passing,
        userPlayer.dribbling,
        userPlayer.defending,
        userPlayer.shooting,
        userPlayer.vision
      ]
    : [82, 84, 83, 76, 80, 84];

  const crackStats = crackRef
    ? [
        crackRef.pace,
        crackRef.passing,
        crackRef.dribbling,
        crackRef.defending,
        crackRef.shooting,
        crackRef.vision
      ]
    : userStats.map((s) => Math.min(98, s + 5));

  if (dom.radarLegendUser) {
    dom.radarLegendUser.textContent = comp
      ? `${comp.playerName.split(' ')[0]} (#${comp.jerseyNumber})`
      : 'Tu Jugador';
  }
  if (dom.radarLegendCrack) {
    dom.radarLegendCrack.textContent = comp?.similarCrackName
      ? comp.similarCrackName.split('(')[0].trim()
      : 'Crack Top 100';
  }

  // Actualizar etiquetas de los 6 ejes con el valor real del jugador seleccionado
  if (dom.radarLblPace) dom.radarLblPace.textContent = `RIT ${userStats[0]}`;
  if (dom.radarLblPassing) dom.radarLblPassing.textContent = `PAS ${userStats[1]}`;
  if (dom.radarLblDribbling) dom.radarLblDribbling.textContent = `REG ${userStats[2]}`;
  if (dom.radarLblDefending) dom.radarLblDefending.textContent = `DEF ${userStats[3]}`;
  if (dom.radarLblShooting) dom.radarLblShooting.textContent = `TIR ${userStats[4]}`;
  if (dom.radarLblVision) dom.radarLblVision.textContent = `VIS ${userStats[5]}`;

  const centerPointsStr = Array(6).fill(`${RADAR_CENTER_X},${RADAR_CENTER_Y}`).join(' ');
  const userPts = computeRadarPoints(userStats);
  const crackPts = computeRadarPoints(crackStats);

  const userPointsStr = userPts.map((pt) => `${pt.x},${pt.y}`).join(' ');
  const crackPointsStr = crackPts.map((pt) => `${pt.x},${pt.y}`).join(' ');

  // Animar expansión radial desde el centro hacia los 6 vértices con GSAP
  gsap.fromTo(
    dom.radarPolyCrack,
    { attr: { points: centerPointsStr }, opacity: 0.15 },
    {
      attr: { points: crackPointsStr },
      opacity: 1,
      duration: 0.72,
      ease: 'back.out(1.4)',
      overwrite: 'auto'
    }
  );

  gsap.fromTo(
    dom.radarPolyUser,
    { attr: { points: centerPointsStr }, opacity: 0.2 },
    {
      attr: { points: userPointsStr },
      opacity: 1,
      duration: 0.82,
      delay: 0.06,
      ease: 'elastic.out(1, 0.72)',
      overwrite: 'auto'
    }
  );

  if (dom.radarVerticesLayer) {
    dom.radarVerticesLayer.innerHTML = userPts
      .map(
        (pt) =>
          `<circle class="radar-vertex-dot user" cx="${pt.x}" cy="${pt.y}" r="3.1" />`
      )
      .concat(
        crackPts.map(
          (pt) =>
            `<circle class="radar-vertex-dot crack" cx="${pt.x}" cy="${pt.y}" r="2.5" />`
        )
      )
      .join('');

    gsap.fromTo(
      dom.radarVerticesLayer.querySelectorAll('circle'),
      { scale: 0, opacity: 0, transformOrigin: '50% 50%' },
      {
        scale: 1,
        opacity: 1,
        duration: 0.45,
        delay: 0.22,
        stagger: 0.03,
        ease: 'back.out(2)'
      }
    );
  }
}

export function renderSelectedPlayerComparison() {
  const comparisons = state.squadOptimization?.playerComparisons || [];
  const comp =
    comparisons.find((c) => c.playerId === state.selectedSquadPlayerId) ||
    comparisons.find((c) => isPlayerCompatibleWithActiveModality(c.position, state.squadModality)) ||
    comparisons[0] ||
    null;

  if (!comp) {
    dom.compPlayerNumber.textContent = '—';
    dom.compPlayerName.textContent = 'Sin jugador seleccionado';
    dom.compPlayerMeta.textContent = 'Registra un jugador o carga la Plantilla Demo';
    dom.compCrackName.textContent = 'Top 100 Mundial / Histórico';
    dom.compCrackStyle.textContent = '75 Cracks de Fútbol 11 + 25 de Futsal';
    dom.compCrackWiki.textContent = '';
    dom.compWhyText.textContent = 'Agrega jugadores a la izquierda para compararlos con las leyendas y cracks actuales.';
    dom.compPotentiateText.textContent = '—';
    dom.compPartnersChips.innerHTML = '';
    renderPlayerRadarChart(null, null, null);
    return;
  }

  state.selectedSquadPlayerId = comp.playerId;
  dom.compSimilarityBadge.textContent = `${comp.similarityPct || 92}% Similitud`;
  dom.compPlayerNumber.textContent = String(comp.jerseyNumber);
  dom.compPlayerName.textContent = comp.playerName;
  dom.compPlayerMeta.textContent = `Posición: ${comp.position} · Pie ${comp.preferredFoot} · Media ${comp.overall}`;
  dom.compMirrorBadge.textContent = comp.mirrorBadge || 'Top 100';
  dom.compCrackName.textContent = `${comp.similarCrackName} (${comp.similarCrackEra})`;
  dom.compCrackStyle.textContent = `${comp.similarCrackPosition} · ${comp.similarCrackStyle}`;
  dom.compCrackWiki.textContent = comp.similarCrackWiki || '';
  dom.compWhyText.textContent = comp.whySimilar || '';
  dom.compPotentiateText.textContent = comp.whatToPotentiate || '';

  const userPlayer = state.squadPlayers.find((p) => p.id === comp.playerId) || null;
  const crackRef =
    (state.top100Catalog || []).find((r) => r.name === comp.similarCrackName) || null;
  renderPlayerRadarChart(userPlayer, crackRef, comp);

  const partners = Array.isArray(comp.bestPartners) ? comp.bestPartners : [];
  dom.compPartnersChips.innerHTML = partners.length
    ? partners.map((pt) => `<span class="source-chip">🤝 ${escapeHtml(pt)}</span>`).join('')
    : '<span class="doc-item-meta">Agrega más compañeros para calcular sociedades.</span>';
}

async function handleCreateCustomPlayer(e) {
  e.preventDefault();
  const payload = {
    name: dom.playerNameInput.value.trim(),
    jerseyNumber: Number(dom.playerNumberInput.value) || 10,
    position: dom.playerPosSelect.value,
    preferredFoot: dom.playerFootSelect.value,
    pace: Number(dom.statPace.value),
    passing: Number(dom.statPassing.value),
    dribbling: Number(dom.statDribbling.value),
    defending: Number(dom.statDefending.value),
    shooting: Number(dom.statShooting.value),
    vision: Number(dom.statVision.value)
  };

  if (!payload.name) return;

  try {
    const created = await api.createSquadPlayer(payload);
    state.selectedSquadPlayerId = created.id;
    dom.playerNameInput.value = '';
    showToast('Jugador registrado', `${created.name} (#${created.jerseyNumber} · ${created.position}) añadido a tu plantilla.`, 'success');
    await refreshSquadAndOptimize();
  } catch (err) {
    showToast('Error al guardar jugador', err.message, 'error');
  }
}

async function handleLoadDemoSquad() {
  if (!dom.loadDemoSquadBtn) return;
  dom.loadDemoSquadBtn.disabled = true;
  dom.loadDemoSquadBtn.textContent = '⏳ Cargando...';

  try {
    const players = await api.loadDemoSquad(state.squadModality);
    state.selectedSquadPlayerId = players[0]?.id || null;
    showToast(
      `Plantilla Demo (${state.squadModality})`,
      `Se cargaron ${players.length} jugadores (titulares + suplentes en banca) comparados con el Top 100.`,
      'success'
    );
    await refreshSquadAndOptimize();
  } catch (err) {
    showToast('Error', err.message, 'error');
  } finally {
    dom.loadDemoSquadBtn.disabled = false;
    dom.loadDemoSquadBtn.textContent = '⚡ Cargar Plantilla Demo';
  }
}

async function handleClearSquad() {
  if (!dom.clearSquadBtn) return;
  dom.clearSquadBtn.disabled = true;

  try {
    await api.clearAllSquadPlayers();
    state.selectedSquadPlayerId = null;
    state.exportedBoardLineup = null;
    if (dom.idealSquadBanner) {
      dom.idealSquadBanner.classList.add('hidden');
    }
    await refreshSquadAndOptimize(false);
    renderTacticalPitch();
    showToast('🗑️ Plantilla Vaciada', 'Se eliminaron todos los jugadores personalizados de la plantilla.', 'info');
  } catch (err) {
    showToast('Error al vaciar plantilla', err.message, 'error');
  } finally {
    dom.clearSquadBtn.disabled = false;
  }
}

export function initSquadViewEvents() {
  const sliderPairs = [
    [dom.statPace, dom.valPace],
    [dom.statPassing, dom.valPassing],
    [dom.statDribbling, dom.valDribbling],
    [dom.statDefending, dom.valDefending],
    [dom.statShooting, dom.valShooting],
    [dom.statVision, dom.valVision]
  ];
  sliderPairs.forEach(([inputEl, labelEl]) => {
    if (inputEl && labelEl) {
      inputEl.addEventListener('input', () => {
        labelEl.textContent = inputEl.value;
      });
    }
  });

  if (dom.addPlayerForm) {
    dom.addPlayerForm.addEventListener('submit', handleCreateCustomPlayer);
  }

  if (dom.loadDemoSquadBtn) {
    dom.loadDemoSquadBtn.addEventListener('click', handleLoadDemoSquad);
  }

  if (dom.clearSquadBtn) {
    dom.clearSquadBtn.addEventListener('click', handleClearSquad);
  }

  if (dom.resetLineupBtn) {
    dom.resetLineupBtn.addEventListener('click', () => {
      refreshSquadAndOptimize(false);
      showToast('Alineación Auto-ordenada', 'Titulares ubicados en su posición natural y suplentes en la banca.', 'info');
    });
  }

  if (dom.generateIdealSquadBtn) {
    dom.generateIdealSquadBtn.addEventListener('click', handleGenerateIdealSquad);
  }

  if (dom.exportSquadToBoardBtn) {
    dom.exportSquadToBoardBtn.addEventListener('click', handleExportSquadToBoard);
  }

  if (dom.exportMatchPlanSquadBtn) {
    dom.exportMatchPlanSquadBtn.addEventListener('click', () => handleExportPrintableMatchPlan('squad'));
  }

  if (dom.closeIdealBannerBtn && dom.idealSquadBanner) {
    dom.closeIdealBannerBtn.addEventListener('click', () => {
      dom.idealSquadBanner.classList.add('hidden');
    });
  }

  if (dom.playerPosSelect) {
    dom.playerPosSelect.addEventListener('change', () => syncSquadSelectTitle(dom.playerPosSelect));
  }

  if (dom.playerFootSelect) {
    dom.playerFootSelect.addEventListener('change', () => syncSquadSelectTitle(dom.playerFootSelect));
  }

  if (dom.squadStyleSelect) {
    dom.squadStyleSelect.addEventListener('change', () => {
      syncSquadSelectTitle(dom.squadStyleSelect);
      if (state.squadOptimization?.idealMode) {
        handleGenerateIdealSquad();
      }
    });
  }

  if (dom.squadModalitySelect) {
    dom.squadModalitySelect.addEventListener('change', (e) => {
      state.squadModality = e.target.value;
      state.squadFormationIndex = 0;
      syncSquadSelectTitle(dom.squadModalitySelect);
      populatePlayerPositionSelect();
      populateSquadFormationDropdown();
      refreshSquadAndOptimize(false);
    });
  }

  if (dom.squadFormationSelect) {
    dom.squadFormationSelect.addEventListener('change', (e) => {
      state.squadFormationIndex = Number(e.target.value) || 0;
      syncSquadSelectTitle(dom.squadFormationSelect);
      refreshSquadAndOptimize(Boolean(state.squadOptimization?.idealMode));
    });
  }

  if (dom.squadRosterList) {
    dom.squadRosterList.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.roster-delete-btn');
      if (deleteBtn) {
        e.stopPropagation();
        const idToDelete = Number(deleteBtn.dataset.deleteId);
        if (!idToDelete) return;
        await api.deleteSquadPlayer(idToDelete);
        if (state.selectedSquadPlayerId === idToDelete) {
          state.selectedSquadPlayerId = null;
        }
        await refreshSquadAndOptimize();
        return;
      }

      const item = e.target.closest('.roster-player-item');
      if (item) {
        state.selectedSquadPlayerId = Number(item.dataset.playerId);
        renderSquadRosterList();
        renderSquadPitch();
        renderSquadBench();
        renderSelectedPlayerComparison();
      }
    });
  }

  // Click & Drag-and-Drop on Squad Pitch Tokens
  if (dom.squadPitchTokens) {
    dom.squadPitchTokens.addEventListener('click', (e) => {
      const token = e.target.closest('.player-token');
      if (token && token.dataset.playerId) {
        state.selectedSquadPlayerId = Number(token.dataset.playerId);
        renderSquadRosterList();
        renderSquadPitch();
        renderSquadBench();
        renderSelectedPlayerComparison();
      }
    });

    dom.squadPitchTokens.addEventListener('dragstart', (e) => {
      const token = e.target.closest('.player-token');
      if (!token || !token.dataset.playerId) {
        e.preventDefault();
        return;
      }
      activeDragPayload = {
        source: 'pitch',
        slotIndex: Number(token.dataset.slotIndex),
        playerId: Number(token.dataset.playerId)
      };
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(token.dataset.playerId));
      }
    });

    dom.squadPitchTokens.addEventListener('dragover', (e) => {
      const token = e.target.closest('.player-token');
      if (!token) return;
      e.preventDefault();
      token.classList.add('drag-over-target');
    });

    dom.squadPitchTokens.addEventListener('dragleave', (e) => {
      const token = e.target.closest('.player-token');
      if (token) {
        token.classList.remove('drag-over-target');
      }
    });

    dom.squadPitchTokens.addEventListener('drop', (e) => {
      const token = e.target.closest('.player-token');
      if (!token) return;
      e.preventDefault();
      token.classList.remove('drag-over-target');
      const targetSlotIdx = Number(token.dataset.slotIndex);
      if (!Number.isNaN(targetSlotIdx)) {
        handlePitchSlotDrop(targetSlotIdx);
      }
    });
  }

  // Click & Drag-and-Drop on Bench Substitutes
  if (dom.squadBenchSection && dom.squadBenchList) {
    dom.squadBenchList.addEventListener('click', (e) => {
      const chip = e.target.closest('.bench-player-chip');
      if (!chip) return;
      state.selectedSquadPlayerId = Number(chip.dataset.playerId);
      renderSquadRosterList();
      renderSquadPitch();
      renderSquadBench();
      renderSelectedPlayerComparison();
    });

    dom.squadBenchList.addEventListener('dragstart', (e) => {
      const chip = e.target.closest('.bench-player-chip');
      if (!chip || !chip.dataset.playerId) return;
      activeDragPayload = {
        source: 'bench',
        playerId: Number(chip.dataset.playerId)
      };
      chip.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(chip.dataset.playerId));
      }
    });

    dom.squadBenchList.addEventListener('dragend', (e) => {
      const chip = e.target.closest('.bench-player-chip');
      if (chip) chip.classList.remove('dragging');
    });

    dom.squadBenchSection.addEventListener('dragover', (e) => {
      if (activeDragPayload?.source === 'pitch') {
        e.preventDefault();
        dom.squadBenchSection.classList.add('drag-over-bench');
      }
    });

    dom.squadBenchSection.addEventListener('dragleave', () => {
      dom.squadBenchSection.classList.remove('drag-over-bench');
    });

    dom.squadBenchSection.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.squadBenchSection.classList.remove('drag-over-bench');
      handleSendStarterToBench();
    });
  }

  if (dom.askBotAboutSquadBtn) {
    dom.askBotAboutSquadBtn.addEventListener('click', () => {
      const setup = getActiveSquadFormationSetup();
      const lineup = state.squadOptimization?.lineup || [];
      const substitutes = state.squadOptimization?.substitutes || [];

      const startersSummary = lineup
        .filter((s) => s.assigned && s.playerId)
        .map(
          (s) =>
            `${s.name} (#${s.jerseyNumber}, pos. natural ${s.naturalPosition} jugando como ${s.slotRole}${
              s.outOfPosition ? ' [fuera de puesto]' : ''
            })`
        )
        .join(', ');

      const benchSummary = substitutes
        .map((sub) => `${sub.name} (#${sub.jerseyNumber}, ${sub.naturalPosition})`)
        .join(', ');

      setModality(state.squadModality);
      switchTab('assistant');
      const prompt = `Míster, analiza mi alineación personalizada en ${state.squadModality} con formación ${setup.code}. Titulares en cancha: ${startersSummary || 'por definir'}. Suplentes en la banca: ${benchSummary || 'ninguno'}. ¿Qué ajustes, cambios desde la banca o sociedades tácticas me recomiendas?`;
      sendChatMessage(prompt);
    });
  }
}
