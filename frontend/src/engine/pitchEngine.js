/* ==========================================================================
   Pitch Engine — GSAP Spring Physics, Bézier Motion Trails, 2.5D TV Camera &
   Dynamic Hover Influence / Passing Triangles (Decoupled from HTTP API)
   ========================================================================== */

import gsap from 'gsap';
import {
  state,
  dom,
  escapeHtml,
  PLAY_STYLE_MODIFIERS,
  FUTSAL_ATTACK_PLAYS,
  FIELD_ATTACK_PLAYS,
  getActiveFormationSetup,
  getActiveSetPiece,
  getActiveSquadFormationSetup,
  resolveReferenceCoach,
  updateContextBadges,
  isStrictNaturalPositionMatch
} from '../store/tacticalStore.js';

let currentBoardCoords = [];
let currentSquadCoords = [];

export function clearPlaybackTimers() {
  while (state.playbackTimers.length > 0) {
    clearTimeout(state.playbackTimers.pop());
  }
  while (state.motionBlurTimers.length > 0) {
    clearTimeout(state.motionBlurTimers.pop());
  }
}

export function triggerMotionBlurOnElements(elements, durationMs = 1050) {
  elements.forEach((el) => {
    if (!el) return;
    el.classList.add('is-moving');
    const t = setTimeout(() => {
      el.classList.remove('is-moving');
    }, durationMs);
    state.motionBlurTimers.push(t);
  });
}

export function resolvePlayerIndex(rawIdx, totalPlayers) {
  if (rawIdx < 0) {
    return Math.max(1, totalPlayers + rawIdx);
  }
  return Math.min(totalPlayers - 1, rawIdx);
}

/**
 * Clasifica la línea táctica (0: POR -> 1: DEF -> 2: MED -> 3: DEL)
 * para aplicar un stagger escalonado de 0.06s por línea con física GSAP.
 */
export function getTacticalLineRank(p) {
  const role = String(p?.role || '').toUpperCase();
  if (p?.gk || role === 'POR' || role === 'PJ') return 0;
  if (
    role.startsWith('DF') ||
    role.startsWith('CIE') ||
    role === 'LIB' ||
    role === 'LI' ||
    role === 'LD' ||
    role.startsWith('LAT')
  ) {
    return 1;
  }
  if (
    role.startsWith('MC') ||
    role.startsWith('INT') ||
    role.startsWith('CAR') ||
    role.startsWith('ENG') ||
    role.startsWith('UNI') ||
    role === 'MI' ||
    role === 'MD' ||
    (role === 'PIV' && (p?.x ?? 180) < 220)
  ) {
    return 2;
  }
  return 3;
}

/**
 * Construye una curva Bézier cuadrática SVG ("M x1 y1 Q cx cy x2 y2")
 * con curvatura natural hacia el interior del campo.
 */
function buildQuadraticBezierD(x1, y1, x2, y2, curveIntensity = 0.2) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  // Vector normal unitario orientado suavemente hacia el eje central (y = 110)
  const nx = -dy / dist;
  const ny = dx / dist;
  const dirSign = my > 110 ? -1 : 1;
  const offset = Math.min(24, dist * curveIntensity) * dirSign;
  const cx = Math.round((mx + nx * offset) * 10) / 10;
  const cy = Math.round((my + ny * offset) * 10) / 10;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

export function positionBallToken(x, y, visible = true, animateBlur = false) {
  if (!dom.ballToken) return;
  if (!visible) {
    dom.ballToken.classList.add('hidden');
    dom.ballToken.classList.remove('is-moving');
    return;
  }
  const pitchWidth = dom.pitchTokens.clientWidth || 720;
  const pitchHeight = dom.pitchTokens.clientHeight || 430;
  const scaleX = pitchWidth / 360;
  const scaleY = pitchHeight / 220;
  dom.ballToken.classList.remove('hidden');
  const tx = Math.round(x * scaleX);
  const ty = Math.round(y * scaleY);
  const billboardRotX = state.isTv25DView ? -28 : 0;

  if (animateBlur) {
    triggerMotionBlurOnElements([dom.ballToken], 980);
  }

  gsap.to(dom.ballToken, {
    x: tx,
    y: ty,
    rotateX: billboardRotX,
    scale: animateBlur ? 1.12 : 1,
    transformOrigin: '50% 100%',
    duration: animateBlur ? 0.95 : 0.45,
    ease: animateBlur ? 'power3.out' : 'back.out(1.5)',
    overwrite: 'auto',
    onComplete: () => {
      if (animateBlur) {
        gsap.to(dom.ballToken, {
          scale: 1,
          rotateX: state.isTv25DView ? -28 : 0,
          duration: 0.25
        });
      }
    }
  });
}

export function toggleTv25DView(forceState = null) {
  state.isTv25DView = typeof forceState === 'boolean' ? forceState : !state.isTv25DView;
  const active = state.isTv25DView;

  if (dom.toggleTvViewBtn) {
    dom.toggleTvViewBtn.classList.toggle('active', active);
    dom.toggleTvViewBtn.setAttribute('aria-pressed', String(active));
  }

  if (dom.tacticalPitch) {
    dom.tacticalPitch.classList.toggle('tv-25d-active', active);
    gsap.to(dom.tacticalPitch, {
      rotateX: active ? 28 : 0,
      scale: active ? 0.96 : 1,
      transformPerspective: 1200,
      transformOrigin: '50% 62%',
      duration: 0.78,
      ease: 'power3.out',
      overwrite: 'auto'
    });
  }

  // Billboarding inverso en todas las fichas y el balón para mantenerlos verticales
  const allBoardTokens = dom.pitchTokens
    ? Array.from(dom.pitchTokens.querySelectorAll('.player-token'))
    : [];
  if (allBoardTokens.length > 0) {
    gsap.to(allBoardTokens, {
      rotateX: active ? -28 : 0,
      transformOrigin: '50% 100%',
      duration: 0.78,
      ease: 'power3.out',
      overwrite: 'auto'
    });
  }

  if (dom.ballToken && !dom.ballToken.classList.contains('hidden')) {
    gsap.to(dom.ballToken, {
      rotateX: active ? -28 : 0,
      transformOrigin: '50% 100%',
      duration: 0.78,
      ease: 'power3.out'
    });
  }
}

/**
 * Zonas de Influencia (Aura radial según Visión) y Triángulos de Pase Dinámicos en Hover
 */
export function renderHoverInfluenceOnPitch(
  hoveredIndex,
  coordsList,
  svgLayerEl,
  tokensContainerEl,
  visionScore = 86
) {
  if (!svgLayerEl || !tokensContainerEl) return;
  svgLayerEl.innerHTML = '';

  const target = coordsList[hoveredIndex];
  if (!target) return;

  const px = target.adjX ?? target.x;
  const py = target.adjY ?? target.y;

  // 1. Encontrar los 3 compañeros más cercanos para formar triángulos de pase
  const neighbors = coordsList
    .map((pt, idx) => {
      const nx = pt.adjX ?? pt.x;
      const ny = pt.adjY ?? pt.y;
      return {
        idx,
        x: nx,
        y: ny,
        dist: idx === hoveredIndex ? Infinity : Math.hypot(nx - px, ny - py)
      };
    })
    .filter((n) => Number.isFinite(n.dist))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);

  // 2. Dibujar triángulos de pase traslúcidos entre el jugador y sus socios cercanos
  if (neighbors.length >= 2) {
    for (let i = 0; i < neighbors.length - 1; i++) {
      const n1 = neighbors[i];
      const n2 = neighbors[i + 1];
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', `${px},${py} ${n1.x},${n1.y} ${n2.x},${n2.y}`);
      poly.setAttribute('class', 'hover-pass-triangle');
      svgLayerEl.appendChild(poly);
      gsap.fromTo(
        poly,
        { opacity: 0 },
        { opacity: 1, duration: 0.35, ease: 'power2.out' }
      );
    }
  }

  // 3. Dibujar aura radial proporcional al atributo de Visión
  const auraRadius = Math.max(24, Math.min(48, Math.round(22 + (visionScore - 60) * 0.55)));
  const aura = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  aura.setAttribute('cx', px);
  aura.setAttribute('cy', py);
  aura.setAttribute('r', auraRadius);
  aura.setAttribute('class', 'hover-vision-aura');
  svgLayerEl.appendChild(aura);
  gsap.fromTo(
    aura,
    { attr: { r: 6 }, opacity: 0 },
    { attr: { r: auraRadius }, opacity: 1, duration: 0.45, ease: 'back.out(1.6)' }
  );

  // 4. Dibujar líneas punteadas brillantes hacia los socios más cercanos + cierre del triángulo
  const tokenEls = Array.from(tokensContainerEl.querySelectorAll('.player-token'));
  tokenEls.forEach((el) => el.classList.remove('partner-highlight'));

  neighbors.forEach((n, idx) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', px);
    line.setAttribute('y1', py);
    line.setAttribute('x2', n.x);
    line.setAttribute('y2', n.y);
    line.setAttribute('class', 'hover-pass-link');
    svgLayerEl.appendChild(line);

    if (idx < neighbors.length - 1) {
      const nextN = neighbors[idx + 1];
      const triEdge = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      triEdge.setAttribute('x1', n.x);
      triEdge.setAttribute('y1', n.y);
      triEdge.setAttribute('x2', nextN.x);
      triEdge.setAttribute('y2', nextN.y);
      triEdge.setAttribute('class', 'hover-pass-link secondary');
      svgLayerEl.appendChild(triEdge);
    }

    if (tokenEls[n.idx]) {
      tokenEls[n.idx].classList.add('partner-highlight');
    }
  });
}

export function clearHoverInfluenceOnPitch(svgLayerEl, tokensContainerEl) {
  if (svgLayerEl) {
    svgLayerEl.innerHTML = '';
  }
  if (tokensContainerEl) {
    tokensContainerEl
      .querySelectorAll('.player-token.partner-highlight')
      .forEach((el) => el.classList.remove('partner-highlight'));
  }
}

export function resolveActiveStartersForStepFormatting(
  targetModality = state.modality,
  setup = getActiveFormationSetup()
) {
  if (
    state.exportedBoardLineup &&
    state.exportedBoardLineup.modality === targetModality &&
    Array.isArray(state.exportedBoardLineup.starters)
  ) {
    return state.exportedBoardLineup.starters;
  }
  if (
    state.squadOptimization &&
    state.squadOptimization.modality === targetModality &&
    Array.isArray(state.squadOptimization.lineup)
  ) {
    return state.squadOptimization.lineup;
  }
  return null;
}

export function formatSetPieceStepText(
  rawStep,
  setup = getActiveFormationSetup(),
  startersOverride = null,
  targetModality = state.modality
) {
  if (!rawStep) return '';
  const starters = startersOverride || resolveActiveStartersForStepFormatting(targetModality, setup);
  const players = setup?.players || [];

  const getPlayerLabelAt = (idx) => {
    const resolvedIdx = resolvePlayerIndex(idx, players.length || 5);
    const assigned = starters?.[resolvedIdx];
    if (assigned && assigned.assigned && assigned.playerId && assigned.name) {
      return `(${assigned.name} #${assigned.jerseyNumber})`;
    }
    const slot = players[resolvedIdx];
    if (slot) {
      return `(#${slot.num} · ${slot.role})`;
    }
    return '';
  };

  let formatted = String(rawStep);

  formatted = formatted.replace(/\(idx\s+(\d+)\s+y\s+(\d+)\)/gi, (_, i1, i2) => {
    const idx1 = Number(i1);
    const idx2 = Number(i2);
    const a1 = starters?.[idx1];
    const a2 = starters?.[idx2];
    if (a1?.assigned && a1?.name && a2?.assigned && a2?.name) {
      return `(${a1.name} #${a1.jerseyNumber} y ${a2.name} #${a2.jerseyNumber})`;
    }
    const s1 = players[idx1];
    const s2 = players[idx2];
    if (s1 && s2) {
      return `(#${s1.num} ${s1.role} y #${s2.num} ${s2.role})`;
    }
    return '';
  });

  formatted = formatted.replace(/\(idx\s+(-?\d+)\)/gi, (_, i1) => {
    return getPlayerLabelAt(Number(i1));
  });

  return formatted.replace(/\s{2,}/g, ' ').trim();
}

export function updateLiveStepHighlight(setPiece, stepNumber) {
  if (!setPiece || !dom.setpieceStepsList) return;
  const items = Array.from(dom.setpieceStepsList.querySelectorAll('li'));
  items.forEach((li, idx) => {
    li.classList.toggle('active-step', idx === stepNumber - 1);
  });

  if (!dom.setpieceLiveBanner) return;
  if (stepNumber <= 0 || stepNumber > setPiece.steps.length) {
    dom.setpieceLiveBanner.classList.add('hidden');
    return;
  }

  dom.setpieceLiveBanner.classList.remove('hidden');
  dom.liveStepBadge.textContent = `Paso ${stepNumber}/${setPiece.steps.length}`;
  dom.liveStepText.textContent = formatSetPieceStepText(setPiece.steps[stepNumber - 1]);
}

export function renderSetPieceOverlay(setPiece, totalPlayers) {
  if (!dom.setpieceOverlay) return;
  dom.setpieceOverlay.innerHTML = '';

  if (!setPiece) {
    if (dom.setpieceStepsBox) dom.setpieceStepsBox.classList.add('hidden');
    if (dom.setpiecePlaybackControls) dom.setpiecePlaybackControls.classList.add('hidden');
    positionBallToken(0, 0, false);
    return;
  }

  if (dom.setpiecePlaybackControls) {
    dom.setpiecePlaybackControls.classList.remove('hidden');
  }

  if (dom.setpieceStepsBox) {
    dom.setpieceStepsBox.classList.remove('hidden');
    const catBadge = state.setPieceCategory === 'attack' ? '⚔️ Ataque: ' : '🛡️ Defensa: ';
    dom.setpieceTitleText.textContent = catBadge + setPiece.name;
    const activeSetup = getActiveFormationSetup();
    dom.setpieceStepsList.innerHTML = setPiece.steps
      .map((step) => `<li>${escapeHtml(formatSetPieceStepText(step, activeSetup))}</li>`)
      .join('');
  }

  // Zonas objetivo de remate o bloqueo
  (setPiece.zones || []).forEach((z) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', z.cx);
    circle.setAttribute('cy', z.cy);
    circle.setAttribute('r', z.r);
    circle.setAttribute('fill', 'rgba(244, 63, 94, 0.16)');
    circle.setAttribute('stroke', '#f43f5e');
    circle.setAttribute('stroke-width', '1.4');
    circle.setAttribute('stroke-dasharray', '3 3');
    dom.setpieceOverlay.appendChild(circle);
  });

  // 1. Trayectorias curvas Bézier de desmarques + estelas luminosas animadas (Motion Trails)
  (setPiece.movements || []).forEach((mv, idx) => {
    const dist = Math.hypot(mv.endX - mv.startX, mv.endY - mv.startY);
    if (dist < 6) return;
    const d = buildQuadraticBezierD(mv.startX, mv.startY, mv.endX, mv.endY, 0.18);

    const runPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    runPath.setAttribute('d', d);
    runPath.setAttribute('fill', 'none');
    runPath.setAttribute('stroke', 'rgba(56, 189, 248, 0.74)');
    runPath.setAttribute('stroke-width', '1.8');
    runPath.setAttribute('stroke-dasharray', '5 4');
    runPath.setAttribute('marker-end', 'url(#arrow-run)');
    dom.setpieceOverlay.appendChild(runPath);

    // Estela luminosa (Motion Trail) detrás del jugador que rompe al espacio
    const trailPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trailPath.setAttribute('d', d);
    trailPath.setAttribute('class', 'bezier-motion-trail run-trail');
    dom.setpieceOverlay.appendChild(trailPath);

    gsap.fromTo(
      trailPath,
      { strokeDasharray: '28 240', strokeDashoffset: 180, opacity: 0.95 },
      {
        strokeDashoffset: 0,
        opacity: 0.18,
        duration: 1.25,
        delay: idx * 0.08,
        ease: 'power2.out'
      }
    );
  });

  // 2. Trayectorias curvas Bézier del balón (Pases elevados, centros y remates) + Motion Trail
  const bp = setPiece.ballPath || [];
  for (let i = 0; i < bp.length - 1; i++) {
    const from = bp[i];
    const to = bp[i + 1];
    const isShot = to.type === 'shot';
    const d = buildQuadraticBezierD(from.x, from.y, to.x, to.y, isShot ? 0.1 : 0.24);

    const ballCurve = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ballCurve.setAttribute('d', d);
    ballCurve.setAttribute('fill', 'none');

    if (isShot) {
      ballCurve.setAttribute('stroke', 'rgba(244, 63, 94, 0.88)');
      ballCurve.setAttribute('stroke-width', '2.4');
      ballCurve.setAttribute('marker-end', 'url(#arrow-shot)');
    } else {
      ballCurve.setAttribute('stroke', 'rgba(251, 191, 36, 0.88)');
      ballCurve.setAttribute('stroke-width', '2.1');
      ballCurve.setAttribute('marker-end', 'url(#arrow-pass)');
    }
    dom.setpieceOverlay.appendChild(ballCurve);

    const ballTrail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ballTrail.setAttribute('d', d);
    ballTrail.setAttribute(
      'class',
      `bezier-motion-trail ${isShot ? 'shot-trail' : 'pass-trail'}`
    );
    dom.setpieceOverlay.appendChild(ballTrail);

    gsap.fromTo(
      ballTrail,
      { strokeDasharray: '34 260', strokeDashoffset: 210, opacity: 1 },
      {
        strokeDashoffset: 0,
        opacity: 0.2,
        duration: 1.3,
        delay: i * 0.15,
        ease: 'power2.out'
      }
    );
  }
}

export function executeSetPieceStep(stepNum) {
  const activeSetPiece = getActiveSetPiece();
  if (!activeSetPiece) return;

  const totalSteps = activeSetPiece.steps.length || 3;
  state.setPieceStep = Math.max(0, Math.min(totalSteps, stepNum));
  renderTacticalPitch(true);
  updateLiveStepHighlight(activeSetPiece, state.setPieceStep);

  const bp = activeSetPiece.ballPath || [];
  if (bp.length === 0) return;

  if (state.setPieceStep <= 1) {
    positionBallToken(bp[0].x, bp[0].y, true, false);
  } else if (state.setPieceStep === 2) {
    const targetPt = bp[Math.min(1, bp.length - 1)];
    positionBallToken(targetPt.x, targetPt.y, true, true);
  } else {
    const finalPt = bp[bp.length - 1];
    positionBallToken(finalPt.x, finalPt.y, true, true);
  }
}

export function playSetPieceAnimation() {
  const activeSetPiece = getActiveSetPiece();
  if (!activeSetPiece) return;

  clearPlaybackTimers();
  const totalSteps = activeSetPiece.steps.length || 3;
  const STEP_PAUSE_MS = 2500;

  executeSetPieceStep(1);

  for (let s = 2; s <= totalSteps; s++) {
    const timer = setTimeout(() => {
      executeSetPieceStep(s);
    }, (s - 1) * STEP_PAUSE_MS);
    state.playbackTimers.push(timer);
  }
}

export function advanceNextSetPieceStep() {
  const activeSetPiece = getActiveSetPiece();
  if (!activeSetPiece) return;
  clearPlaybackTimers();
  const totalSteps = activeSetPiece.steps.length || 3;
  const nextStep = state.setPieceStep >= totalSteps ? 1 : state.setPieceStep + 1;
  executeSetPieceStep(nextStep);
}

export function resetSetPieceToStart() {
  clearPlaybackTimers();
  state.setPieceStep = 1;
  executeSetPieceStep(1);
}

export function applyPitchSurfaceTheme(pitchEl, modality) {
  if (!pitchEl) return;
  const isFutsal = String(modality || '').toLowerCase().includes('futsal');
  pitchEl.classList.toggle('surface-futsal', isFutsal);
  pitchEl.classList.toggle('surface-grass', !isFutsal);
}

export function renderTacticalPitch(animateMotionBlur = false) {
  const activeSetup = getActiveFormationSetup();
  const activeSetPiece = getActiveSetPiece();
  const styleMod = PLAY_STYLE_MODIFIERS[state.playStyle] || PLAY_STYLE_MODIFIERS['Posesión & Juego de Posición'];

  applyPitchSurfaceTheme(dom.tacticalPitch, state.modality);

  const hasExportedLineup =
    state.exportedBoardLineup &&
    state.exportedBoardLineup.modality === state.modality &&
    state.exportedBoardLineup.formationIndex === state.formationIndex &&
    Array.isArray(state.exportedBoardLineup.starters);

  dom.boardPitchTitle.textContent = hasExportedLineup
    ? `Pizarra Táctica · ${state.modality} (Tu Plantilla en Cancha)`
    : `Pizarra Táctica · ${state.modality}`;
  dom.boardStyleBadge.textContent = state.playStyle;
  dom.formationBadge.textContent = activeSetup.code;

  const coachInfo = resolveReferenceCoach(state.modality, activeSetup.code, state.playStyle);
  if (dom.coachNameText) {
    dom.coachNameText.textContent = coachInfo.name;
    dom.coachOriginBadge.textContent = coachInfo.badge;
    dom.coachOriginBadge.classList.toggle('adapted', coachInfo.isAdapted);
    dom.coachNoteText.textContent = coachInfo.note;
  }

  dom.tacticOverviewText.textContent = activeSetup.overview;
  dom.roleDefenseText.textContent = `${activeSetup.defenseRole} ${styleMod.defenseAddon}`;
  dom.roleMidfieldText.textContent = `${activeSetup.midfieldRole} ${styleMod.midfieldAddon}`;
  dom.roleAttackText.textContent = `${activeSetup.attackRole} ${styleMod.attackAddon}`;
  dom.styleEffectDescription.textContent = styleMod.effect;

  updateContextBadges();
  clearHoverInfluenceOnPitch(dom.hoverInfluenceLayer, dom.pitchTokens);

  const pitchWidth = dom.pitchTokens.clientWidth || 720;
  const pitchHeight = dom.pitchTokens.clientHeight || 430;
  const scaleX = pitchWidth / 360;
  const scaleY = pitchHeight / 220;

  const existingTokens = Array.from(dom.pitchTokens.querySelectorAll('.player-token'));
  while (existingTokens.length > activeSetup.players.length) {
    existingTokens.pop().remove();
  }

  const actorMovementMap = new Map();
  if (activeSetPiece && Array.isArray(activeSetPiece.movements)) {
    activeSetPiece.movements.forEach((mv, orderIdx) => {
      const idx = resolvePlayerIndex(mv.playerIndex, activeSetup.players.length);
      actorMovementMap.set(idx, { ...mv, orderIdx });
    });
  }

  const adjustedCoords = activeSetup.players.map((p, idx) => {
    const actorMv = actorMovementMap.get(idx);
    if (actorMv) {
      let progress = 0;
      if (state.setPieceStep <= 1) {
        progress = 0;
      } else if (state.setPieceStep === 2) {
        progress = actorMv.orderIdx <= 1 ? 1 : 0.55;
      } else {
        progress = 1;
      }
      const targetX = actorMv.startX + (actorMv.endX - actorMv.startX) * progress;
      const targetY = actorMv.startY + (actorMv.endY - actorMv.startY) * progress;
      return { ...p, adjX: targetX, adjY: targetY, isActor: true };
    }

    if (p.gk && activeSetup.code !== '5-0 (Portero-Jugador)') {
      return { ...p, adjX: p.x, adjY: p.y, isActor: false };
    }
    const rawX = p.x + styleMod.shiftX;
    const rawY = 110 + (p.y - 110) * styleMod.spreadY;
    const adjX = Math.max(28, Math.min(334, rawX));
    const adjY = Math.max(24, Math.min(196, rawY));
    return { ...p, adjX, adjY, isActor: false };
  });

  currentBoardCoords = adjustedCoords;
  const movingElements = [];
  const billboardRotX = state.isTv25DView ? -28 : 0;

  adjustedCoords.forEach((p, idx) => {
    let tokenEl = existingTokens[idx];
    if (!tokenEl) {
      tokenEl = document.createElement('div');
      tokenEl.className = 'player-token';
      gsap.set(tokenEl, {
        x: 180 * scaleX,
        y: 110 * scaleY,
        scale: 0.4,
        rotateX: billboardRotX,
        transformOrigin: '50% 100%'
      });
      dom.pitchTokens.appendChild(tokenEl);

      // Eventos Hover para proyectar Zona de Influencia y Triángulos de Pase Dinámicos
      tokenEl.addEventListener('mouseenter', () => {
        const hoverIdx = Number(tokenEl.dataset.slotIndex || 0);
        const visionVal = Number(tokenEl.dataset.vision || 86);
        renderHoverInfluenceOnPitch(
          hoverIdx,
          currentBoardCoords,
          dom.hoverInfluenceLayer,
          dom.pitchTokens,
          visionVal
        );
      });
      tokenEl.addEventListener('mouseleave', () => {
        clearHoverInfluenceOnPitch(dom.hoverInfluenceLayer, dom.pitchTokens);
      });
    }

    const exportedSlot = hasExportedLineup ? state.exportedBoardLineup.starters[idx] : null;
    const hasExportedPlayer = Boolean(exportedSlot && exportedSlot.assigned && exportedSlot.playerId);
    const tokenNum = hasExportedPlayer ? String(exportedSlot.jerseyNumber) : p.num;
    const tokenRoleLabel = hasExportedPlayer
      ? `${exportedSlot.name.split(' ')[0]} (${p.role})`
      : p.role;

    const matchedCustomPlayer = hasExportedPlayer
      ? state.squadPlayers.find((sp) => sp.id === exportedSlot.playerId)
      : null;
    const visionStat = matchedCustomPlayer?.vision || (p.gk ? 84 : 88);

    tokenEl.className = `player-token ${p.gk ? 'gk' : ''} ${p.isActor ? 'active-actor' : ''}`.trim();
    tokenEl.textContent = tokenNum;
    tokenEl.setAttribute('data-role', tokenRoleLabel);
    tokenEl.dataset.slotIndex = String(idx);
    tokenEl.dataset.vision = String(visionStat);

    if (hasExportedPlayer) {
      tokenEl.title = `${exportedSlot.name} (#${exportedSlot.jerseyNumber} · ${p.role} · Visión ${visionStat})`;
    } else {
      tokenEl.title = `Dorsal #${p.num} · Rol ${p.role} (Pasa el cursor para ver zona de influencia y triángulos de pase)`;
    }

    const prevX = Number(tokenEl.dataset.tx || 180 * scaleX);
    const prevY = Number(tokenEl.dataset.ty || 110 * scaleY);
    const tx = Math.round(p.adjX * scaleX);
    const ty = Math.round(p.adjY * scaleY);
    const movedDistance = Math.hypot(tx - prevX, ty - prevY);

    tokenEl.dataset.tx = String(tx);
    tokenEl.dataset.ty = String(ty);

    const shouldBlur = animateMotionBlur && movedDistance > 8;
    if (shouldBlur) {
      movingElements.push(tokenEl);
    }

    // Stagger escalonado por línea táctica (POR -> DEF -> MED -> DEL, 0.06s por línea) + Física GSAP
    const lineRank = getTacticalLineRank(p);
    const staggerDelay = activeSetPiece ? 0 : lineRank * 0.06;

    gsap.to(tokenEl, {
      x: tx,
      y: ty,
      scale: 1,
      rotateX: billboardRotX,
      transformOrigin: '50% 100%',
      duration: activeSetPiece ? 0.98 : 0.92,
      delay: staggerDelay,
      ease: activeSetPiece ? 'power3.inOut' : 'elastic.out(1, 0.65)',
      overwrite: 'auto'
    });
  });

  if (movingElements.length > 0) {
    triggerMotionBlurOnElements(movingElements, 980);
  }

  dom.synergyLinks.innerHTML = '';
  if (!activeSetPiece) {
    if (dom.setpieceLiveBanner) dom.setpieceLiveBanner.classList.add('hidden');
    (activeSetup.links || []).forEach(([fromIdx, toIdx]) => {
      const p1 = adjustedCoords[fromIdx];
      const p2 = adjustedCoords[toIdx];
      if (!p1 || !p2) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', p1.adjX);
      line.setAttribute('y1', p1.adjY);
      line.setAttribute('x2', p2.adjX);
      line.setAttribute('y2', p2.adjY);
      dom.synergyLinks.appendChild(line);
    });
  }

  renderSetPieceOverlay(activeSetPiece, activeSetup.players.length);
  if (activeSetPiece && state.setPieceStep > 0) {
    updateLiveStepHighlight(activeSetPiece, state.setPieceStep);
  }
}

export function renderSquadPitch() {
  if (!dom.squadPitchTokens || !dom.squadSynergyLinks) return;
  const setup = getActiveSquadFormationSetup();
  const opt = state.squadOptimization;
  const lineup = opt?.lineup || [];

  applyPitchSurfaceTheme(dom.squadPitch, state.squadModality);

  if (dom.squadGlobalSynergy && opt?.globalSynergy) {
    dom.squadGlobalSynergy.textContent = `${opt.globalSynergy}%`;
  }

  clearHoverInfluenceOnPitch(dom.squadHoverInfluenceLayer, dom.squadPitchTokens);

  const pitchWidth = dom.squadPitchTokens.clientWidth || 580;
  const pitchHeight = dom.squadPitchTokens.clientHeight || 430;
  const scaleX = pitchWidth / 360;
  const scaleY = pitchHeight / 220;

  const existingTokens = Array.from(dom.squadPitchTokens.querySelectorAll('.player-token'));
  while (existingTokens.length > setup.players.length) {
    existingTokens.pop().remove();
  }

  currentSquadCoords = setup.players.map((p) => ({ ...p, adjX: p.x, adjY: p.y }));
  const movingEls = [];

  setup.players.forEach((slotPlayer, idx) => {
    const assignedSlot = lineup[idx];
    let tokenEl = existingTokens[idx];
    if (!tokenEl) {
      tokenEl = document.createElement('div');
      tokenEl.className = 'player-token squad-token';
      gsap.set(tokenEl, {
        x: 180 * scaleX,
        y: 110 * scaleY,
        scale: 0.45
      });
      dom.squadPitchTokens.appendChild(tokenEl);

      tokenEl.addEventListener('mouseenter', () => {
        const hoverIdx = Number(tokenEl.dataset.slotIndex || 0);
        const visionVal = Number(tokenEl.dataset.vision || 85);
        renderHoverInfluenceOnPitch(
          hoverIdx,
          currentSquadCoords,
          dom.squadHoverInfluenceLayer,
          dom.squadPitchTokens,
          visionVal
        );
      });
      tokenEl.addEventListener('mouseleave', () => {
        clearHoverInfluenceOnPitch(dom.squadHoverInfluenceLayer, dom.squadPitchTokens);
      });
    }

    const isAssigned = Boolean(assignedSlot?.assigned && assignedSlot?.playerId);
    const playerId = isAssigned ? assignedSlot.playerId : null;
    const isOutOfPos =
      isAssigned &&
      (assignedSlot.outOfPosition ||
        !isStrictNaturalPositionMatch(assignedSlot.naturalPosition, slotPlayer.role));

    const matchedPlayer = isAssigned
      ? state.squadPlayers.find((sp) => sp.id === playerId)
      : null;
    const visionStat = matchedPlayer?.vision || (assignedSlot?.overall || 84);

    const displayNum = isAssigned ? assignedSlot.jerseyNumber : '+';
    const shortName = isAssigned
      ? `${assignedSlot.name.split(' ')[0]} (${assignedSlot.naturalPosition}${isOutOfPos ? ' ⚠' : ''})`
      : `Vacante · ${slotPlayer.role}`;
    const isSelected = playerId && playerId === state.selectedSquadPlayerId;

    tokenEl.className = [
      'player-token',
      'squad-token',
      slotPlayer.gk ? 'gk' : '',
      isSelected ? 'selected-token' : '',
      !isAssigned ? 'vacant-slot' : '',
      isOutOfPos ? 'out-of-position' : ''
    ]
      .filter(Boolean)
      .join(' ');

    tokenEl.textContent = String(displayNum);
    tokenEl.setAttribute('data-role', shortName);
    tokenEl.dataset.slotIndex = String(idx);
    tokenEl.dataset.vision = String(visionStat);
    tokenEl.draggable = isAssigned;

    if (playerId) {
      tokenEl.dataset.playerId = String(playerId);
      tokenEl.title = isOutOfPos
        ? `${assignedSlot.name} (${assignedSlot.naturalPosition} jugando en puesto de ${slotPlayer.role}) — Arrastra para cambiar`
        : `${assignedSlot.name} (${assignedSlot.naturalPosition} · Visión ${visionStat}) — Arrastra para intercambiar o enviar a la banca`;
    } else {
      delete tokenEl.dataset.playerId;
      tokenEl.title = `Puesto vacante (${slotPlayer.role}) — Arrastra un jugador desde la banca aquí`;
    }

    const tx = Math.round(slotPlayer.x * scaleX);
    const ty = Math.round(slotPlayer.y * scaleY);
    const lineRank = getTacticalLineRank(slotPlayer);
    movingEls.push(tokenEl);

    gsap.to(tokenEl, {
      x: tx,
      y: ty,
      scale: 1,
      duration: 0.88,
      delay: lineRank * 0.06,
      ease: 'back.out(1.45)',
      overwrite: 'auto'
    });
  });

  triggerMotionBlurOnElements(movingEls, 920);

  dom.squadSynergyLinks.innerHTML = '';
  (setup.links || []).forEach(([fromIdx, toIdx]) => {
    const p1 = setup.players[fromIdx];
    const p2 = setup.players[toIdx];
    if (!p1 || !p2) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', p1.x);
    line.setAttribute('y1', p1.y);
    line.setAttribute('x2', p2.x);
    line.setAttribute('y2', p2.y);
    dom.squadSynergyLinks.appendChild(line);
  });
}

export function handleExportPrintableMatchPlan(sourceTab = 'board') {
  if (!dom.printableMatchPlan) return;

  const isFromSquad = sourceTab === 'squad';
  const activeModality = isFromSquad ? state.squadModality : state.modality;
  const activeSetup = isFromSquad ? getActiveSquadFormationSetup() : getActiveFormationSetup();
  const activeStyle = isFromSquad
    ? (dom.squadStyleSelect ? dom.squadStyleSelect.value : state.playStyle)
    : state.playStyle;

  const styleMod = PLAY_STYLE_MODIFIERS[activeStyle] || PLAY_STYLE_MODIFIERS['Posesión & Juego de Posición'];
  const coachInfo = resolveReferenceCoach(activeModality, activeSetup.code, activeStyle);

  const squadOpt = state.squadOptimization;
  const hasRealSquadForModality =
    isFromSquad ||
    (state.exportedBoardLineup && state.exportedBoardLineup.modality === activeModality) ||
    (squadOpt && squadOpt.modality === activeModality && Array.isArray(squadOpt.lineup) && squadOpt.lineup.some((s) => s.assigned));

  const rawLineup = isFromSquad
    ? (squadOpt?.lineup || [])
    : (state.exportedBoardLineup?.modality === activeModality
        ? state.exportedBoardLineup.starters
        : (squadOpt?.modality === activeModality ? squadOpt.lineup : []));

  const substitutes = squadOpt?.modality === activeModality ? (squadOpt?.substitutes || []) : [];
  const synergyText = hasRealSquadForModality && squadOpt?.globalSynergy
    ? `${squadOpt.globalSynergy}%`
    : '92% (Base Táctica)';

  const startersRowsHtml = activeSetup.players
    .map((slotPlayer, idx) => {
      const assigned = rawLineup?.[idx];
      const hasPlayer = Boolean(assigned && assigned.assigned && assigned.playerId);
      const dorsal = hasPlayer ? assigned.jerseyNumber : slotPlayer.num;
      const playerName = hasPlayer ? assigned.name : `Titular Posicional (${slotPlayer.role})`;
      const naturalPos = hasPlayer ? assigned.naturalPosition : slotPlayer.role;
      const foot = hasPlayer ? (assigned.preferredFoot || 'Derecho') : 'Perfil Natural';
      return `
        <tr>
          <td><strong>#${escapeHtml(String(dorsal))}</strong></td>
          <td><strong>${escapeHtml(playerName)}</strong></td>
          <td>${escapeHtml(slotPlayer.role)}</td>
          <td>${escapeHtml(naturalPos)}</td>
          <td>${escapeHtml(foot)}</td>
        </tr>
      `;
    })
    .join('');

  const benchRowsHtml = substitutes.length > 0
    ? substitutes
        .map(
          (sub) => `
            <tr>
              <td>#${escapeHtml(String(sub.jerseyNumber))}</td>
              <td>${escapeHtml(sub.name)}</td>
              <td>${escapeHtml(sub.naturalPosition || sub.position || 'SUP')}</td>
              <td>${escapeHtml(sub.preferredFoot || 'Derecho')}</td>
              <td>Media ${escapeHtml(String(sub.overall || 82))} (Revulsivo)</td>
            </tr>
          `
        )
        .join('')
    : `<tr><td colspan="5">Sin suplentes adicionales registrados en banca para ${escapeHtml(activeModality)}.</td></tr>`;

  let activeSetPiece = getActiveSetPiece();
  let setPiecePhaseLabel = state.setPieceCategory === 'defense' ? 'Defensa / Balón Parado' : 'Ataque / Balón Parado';
  if (!activeSetPiece) {
    const attackCatalog = activeModality === 'Futsal' ? FUTSAL_ATTACK_PLAYS : FIELD_ATTACK_PLAYS;
    activeSetPiece = attackCatalog[0] || null;
    setPiecePhaseLabel = 'Jugada Preparada Recomendada (Ataque)';
  }

  const setPieceStepsHtml = activeSetPiece
    ? `<ol>${activeSetPiece.steps
        .map((st) => `<li>${escapeHtml(formatSetPieceStepText(st, activeSetup, rawLineup, activeModality))}</li>`)
        .join('')}</ol>`
    : '<p>Juego posicional libre según funciones de línea.</p>';

  const nowStr = new Date().toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  dom.printableMatchPlan.innerHTML = `
    <div class="print-sheet-header">
      <div>
        <h1 class="print-brand-title">TacticalPlay RAG — Plan Táctico de Partido</h1>
        <div class="print-brand-subtitle">Ficha Oficial de Vestuario · Generada por Asistente Táctico IA &amp; Simulador Posicional</div>
      </div>
      <div class="print-meta-box">
        <div><strong>Fecha:</strong> ${escapeHtml(nowStr)}</div>
        <div><strong>Sinergia Global:</strong> ${escapeHtml(synergyText)}</div>
      </div>
    </div>

    <div class="print-summary-grid">
      <div class="print-summary-item">
        <span class="print-summary-label">Modalidad &amp; Sistema</span>
        <span class="print-summary-value">${escapeHtml(activeModality)} · ${escapeHtml(activeSetup.code)}</span>
      </div>
      <div class="print-summary-item">
        <span class="print-summary-label">Estilo de Juego</span>
        <span class="print-summary-value">${escapeHtml(activeStyle)}</span>
      </div>
      <div class="print-summary-item">
        <span class="print-summary-label">DT Referente (${escapeHtml(coachInfo.badge)})</span>
        <span class="print-summary-value">${escapeHtml(coachInfo.name)}</span>
      </div>
    </div>

    <h3 class="print-section-title">1. Alineación Titular en Cancha (${activeSetup.players.length} Jugadores)</h3>
    <table class="print-table">
      <thead>
        <tr>
          <th style="width: 10%">Dorsal</th>
          <th style="width: 36%">Jugador Titular</th>
          <th style="width: 18%">Rol en Sistema</th>
          <th style="width: 18%">Pos. Natural</th>
          <th style="width: 18%">Pie Hábil</th>
        </tr>
      </thead>
      <tbody>
        ${startersRowsHtml}
      </tbody>
    </table>

    <h3 class="print-section-title">2. Banca de Suplentes &amp; Revulsivos</h3>
    <table class="print-table">
      <thead>
        <tr>
          <th style="width: 10%">Dorsal</th>
          <th style="width: 36%">Jugador Suplente</th>
          <th style="width: 18%">Pos. Natural</th>
          <th style="width: 18%">Pie Hábil</th>
          <th style="width: 18%">Rol de Recambio</th>
        </tr>
      </thead>
      <tbody>
        ${benchRowsHtml}
      </tbody>
    </table>

    <h3 class="print-section-title">3. Instrucciones por Línea &amp; Jugada Preparada</h3>
    <div class="print-two-cols">
      <div class="print-card-box">
        <h4>Funciones Tácticas por Línea</h4>
        <p><strong>• Salida &amp; Defensa:</strong> ${escapeHtml(activeSetup.defenseRole)} ${escapeHtml(styleMod.defenseAddon)}</p>
        <p><strong>• Mediocampo &amp; Elaboración:</strong> ${escapeHtml(activeSetup.midfieldRole)} ${escapeHtml(styleMod.midfieldAddon)}</p>
        <p><strong>• Definición &amp; Presión:</strong> ${escapeHtml(activeSetup.attackRole)} ${escapeHtml(styleMod.attackAddon)}</p>
        <p><strong>• Efecto del Estilo:</strong> ${escapeHtml(styleMod.effect)}</p>
      </div>
      <div class="print-card-box">
        <h4>${escapeHtml(setPiecePhaseLabel)}: ${escapeHtml(activeSetPiece ? activeSetPiece.name : 'Posicional')}</h4>
        ${setPieceStepsHtml}
        <p style="margin-top: 6px;"><strong>• Modelo DT (${escapeHtml(coachInfo.name)}):</strong> ${escapeHtml(coachInfo.note)}</p>
      </div>
    </div>

    <div class="print-footer-note">
      <span>TacticalPlay RAG · Motor Táctico Multideporte (Futsal · Fútbol 7 · Fútbol 9 · Fútbol 11)</span>
      <span>Documento listo para vestuario / charla técnica</span>
    </div>
  `;

  window.print();
}
