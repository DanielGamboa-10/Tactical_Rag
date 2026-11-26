/* ==========================================================================
   Pitch Engine — GSAP Spring Physics, Bézier Motion Trails, 2.5D TV Camera &
   Dynamic Hover Influence / Passing Triangles (Decoupled from HTTP API)
   ========================================================================== */

import gsap from 'gsap';
import {
  state,
  dom,
  escapeHtml,
  showToast,
  animateNumericCounter,
  getPersonInitials,
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
let stadium3DModule = null;
let stadium3DModulePromise = null;

function loadStadium3DModule() {
  if (stadium3DModule) return Promise.resolve(stadium3DModule);
  if (!stadium3DModulePromise) {
    stadium3DModulePromise = import('./stadium3DEngine.js').then((mod) => {
      stadium3DModule = mod;
      return mod;
    });
  }
  return stadium3DModulePromise;
}

function syncStadium3DScene(adjustedCoords = [], activeSetPiece = null) {
  if (stadium3DModule) {
    stadium3DModule.syncStadium3DScene(adjustedCoords, activeSetPiece);
  }
}

function animateBall3DParabolic(fromPt2D, toPt2D, isElevatedPass = true, isShot = false) {
  if (stadium3DModule) {
    stadium3DModule.animateBall3DParabolic(fromPt2D, toPt2D, isElevatedPass, isShot);
  }
}

function toggleStadium3DView(forceState = null, coords = []) {
  if (!stadium3DModule && forceState === false) return;
  loadStadium3DModule()
    .then((mod) => {
      mod.toggleStadium3DView(forceState, coords);
      syncCameraSegmentedButtons();
    })
    .catch((err) => {
      console.warn('Error cargando módulo Estadio 3D:', err);
    });
}

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

function spawnKaiserImpactFlash2D(tx, ty) {
  if (!dom.tacticalPitch) return;
  const flashEl = document.createElement('div');
  flashEl.className = 'kaiser-impact-shockwave';
  flashEl.setAttribute('aria-hidden', 'true');
  dom.tacticalPitch.appendChild(flashEl);

  gsap.fromTo(
    flashEl,
    { x: tx, y: ty, scale: 0.25, opacity: 0.96 },
    {
      x: tx,
      y: ty,
      scale: 2.25,
      opacity: 0,
      duration: 0.54,
      ease: 'power2.out',
      onComplete: () => flashEl.remove()
    }
  );
}

export function positionBallToken(x, y, visible = true, animateBlur = false) {
  if (!dom.ballToken) return;
  if (!visible) {
    dom.ballToken.classList.add('hidden');
    dom.ballToken.classList.remove('is-moving', 'kaiser-impact-active');
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
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (animateBlur && !reducedMotion) {
    dom.ballToken.classList.add('kaiser-impact-active');
    triggerMotionBlurOnElements([dom.ballToken], 980);
  } else {
    dom.ballToken.classList.remove('kaiser-impact-active');
  }

  gsap.to(dom.ballToken, {
    x: tx,
    y: ty,
    rotateX: billboardRotX,
    scale: animateBlur && !reducedMotion ? 1.15 : 1,
    transformOrigin: '50% 100%',
    duration: reducedMotion ? 0.15 : animateBlur ? 0.92 : 0.45,
    ease: animateBlur ? 'power3.out' : 'back.out(1.5)',
    overwrite: 'auto',
    onComplete: () => {
      dom.ballToken?.classList.remove('kaiser-impact-active');
      if (animateBlur && !reducedMotion) {
        spawnKaiserImpactFlash2D(tx, ty);
        gsap.to(dom.ballToken, {
          scale: 1,
          rotateX: state.isTv25DView ? -28 : 0,
          duration: 0.25
        });
      }
    }
  });
}

export function syncCameraSegmentedButtons() {
  const is3d = Boolean(state.isStadium3DView);
  const is25d = Boolean(state.isTv25DView) && !is3d;
  const is2d = !is3d && !is25d;

  if (dom.toggle2dViewBtn) {
    dom.toggle2dViewBtn.classList.toggle('active', is2d);
    dom.toggle2dViewBtn.setAttribute('aria-pressed', String(is2d));
  }
  if (dom.toggleTvViewBtn) {
    dom.toggleTvViewBtn.classList.toggle('active', is25d);
    dom.toggleTvViewBtn.setAttribute('aria-pressed', String(is25d));
  }
  if (dom.toggleStadium3dBtn) {
    dom.toggleStadium3dBtn.classList.toggle('active', is3d);
    dom.toggleStadium3dBtn.setAttribute('aria-pressed', String(is3d));
  }
  if (dom.sidebarCameraValue) {
    dom.sidebarCameraValue.textContent = is3d ? 'Estadio 3D' : is25d ? 'TV 2.5D' : '2D Cenital';
  }
}

export function activate2DView() {
  if (state.isStadium3DView) {
    toggleStadium3DView(false, currentBoardCoords);
  }
  if (state.isTv25DView) {
    toggleTv25DView(false);
  }
  syncCameraSegmentedButtons();
}

export function toggleTv25DView(forceState = null) {
  if (state.isStadium3DView && forceState !== false) {
    toggleStadium3DView(false, currentBoardCoords);
  }
  state.isTv25DView = typeof forceState === 'boolean' ? forceState : !state.isTv25DView;
  const active = state.isTv25DView;

  syncCameraSegmentedButtons();

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

export function handleToggleStadium3D(forceState = null) {
  if (state.isTv25DView && forceState !== false) {
    toggleTv25DView(false);
  }
  toggleStadium3DView(forceState, currentBoardCoords);
  syncCameraSegmentedButtons();
}

export function toggleExpandBoard(forceState = null) {
  state.isBoardExpanded =
    typeof forceState === 'boolean' ? forceState : !state.isBoardExpanded;
  const expanded = state.isBoardExpanded;

  if (dom.boardLayout) {
    dom.boardLayout.classList.toggle('board-expanded', expanded);
  }
  if (dom.toggleExpandBoardBtn) {
    dom.toggleExpandBoardBtn.classList.toggle('active', expanded);
    dom.toggleExpandBoardBtn.setAttribute('aria-pressed', String(expanded));
    dom.toggleExpandBoardBtn.innerHTML = expanded
      ? `<svg class="ui-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <polyline points="4 14 10 14 10 20" />
           <polyline points="20 10 14 10 14 4" />
           <line x1="14" y1="10" x2="21" y2="3" />
           <line x1="3" y1="21" x2="10" y2="14" />
         </svg>
         <span>Contraer</span>`
      : `<svg class="ui-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <polyline points="15 3 21 3 21 9" />
           <polyline points="9 21 3 21 3 15" />
           <line x1="21" y1="3" x2="14" y2="10" />
           <line x1="3" y1="21" x2="10" y2="14" />
         </svg>
         <span>Expandir</span>`;
  }

  requestAnimationFrame(() => {
    renderTacticalPitch(true);
  });
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
    const catBadge = state.setPieceCategory === 'attack' ? 'Ofensivo · ' : 'Defensivo · ';
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

  // 2. Trayectorias curvas Bézier del balón + Kaiser Impact Trail (#00f0ff)
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
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
      ballCurve.setAttribute('stroke', 'rgba(244, 63, 94, 0.92)');
      ballCurve.setAttribute('stroke-width', '2.4');
      ballCurve.setAttribute('marker-end', 'url(#arrow-kaiser)');
    } else {
      ballCurve.setAttribute('stroke', 'rgba(56, 189, 248, 0.88)');
      ballCurve.setAttribute('stroke-width', '2.1');
      ballCurve.setAttribute('marker-end', 'url(#arrow-kaiser)');
    }
    dom.setpieceOverlay.appendChild(ballCurve);

    const kaiserTrail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    kaiserTrail.setAttribute('d', d);
    kaiserTrail.setAttribute(
      'class',
      `bezier-motion-trail kaiser-impact-trail ${isShot ? 'shot-trail' : 'pass-trail'}`
    );
    dom.setpieceOverlay.appendChild(kaiserTrail);

    const kaiserCore = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    kaiserCore.setAttribute('d', d);
    kaiserCore.setAttribute('class', 'bezier-motion-trail kaiser-impact-core');
    dom.setpieceOverlay.appendChild(kaiserCore);

    if (!prefersReducedMotion) {
      gsap.fromTo(
        kaiserTrail,
        { strokeDasharray: '42 260', strokeDashoffset: 220, opacity: 1 },
        {
          strokeDashoffset: 0,
          opacity: 0.34,
          duration: 1.25,
          delay: i * 0.14,
          ease: 'power2.out'
        }
      );
      gsap.fromTo(
        kaiserCore,
        { strokeDasharray: '28 280', strokeDashoffset: 220, opacity: 0.96 },
        {
          strokeDashoffset: 0,
          opacity: 0.42,
          duration: 1.18,
          delay: i * 0.14,
          ease: 'power2.out'
        }
      );
    } else {
      kaiserTrail.style.opacity = '0.72';
      kaiserCore.style.opacity = '0.88';
    }
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
    if (state.isStadium3DView) {
      animateBall3DParabolic(bp[0], bp[0], false, false);
    }
  } else if (state.setPieceStep === 2) {
    const targetPt = bp[Math.min(1, bp.length - 1)];
    positionBallToken(targetPt.x, targetPt.y, true, true);
    if (state.isStadium3DView) {
      animateBall3DParabolic(bp[0], targetPt, true, targetPt.type === 'shot');
    }
  } else {
    const prevPt = bp[Math.min(1, bp.length - 1)];
    const finalPt = bp[bp.length - 1];
    positionBallToken(finalPt.x, finalPt.y, true, true);
    if (state.isStadium3DView) {
      animateBall3DParabolic(prevPt, finalPt, false, true);
    }
  }
}

export function playSetPieceAnimation() {
  const activeSetPiece = getActiveSetPiece();
  if (!activeSetPiece) return;

  clearPlaybackTimers();
  const totalSteps = activeSetPiece.steps.length || 3;
  const STEP_PAUSE_MS = 2850;

  executeSetPieceStep(1);

  for (let s = 2; s <= totalSteps; s++) {
    const timer = setTimeout(() => {
      executeSetPieceStep(s);
    }, (s - 1) * STEP_PAUSE_MS);
    state.playbackTimers.push(timer);
  }
}

let lastCoachWalkoutKey = '';

function updateReferenceCoachBadgeAndWalkout(coachName) {
  if (dom.coachAvatarInitials) {
    dom.coachAvatarInitials.textContent = getPersonInitials(coachName);
  }

  if (coachName === lastCoachWalkoutKey) return;
  lastCoachWalkoutKey = coachName;

  // Animación Walkout 3D con GSAP cada vez que cambia el DT referente
  if (dom.referenceCoachCard) {
    gsap.fromTo(
      dom.referenceCoachCard,
      {
        rotateY: -22,
        rotateX: 6,
        scale: 0.94,
        opacity: 0.72,
        transformPerspective: 1000
      },
      {
        rotateY: 0,
        rotateX: 0,
        scale: 1,
        opacity: 1,
        transformPerspective: 1000,
        duration: 0.68,
        ease: 'back.out(1.6)',
        overwrite: 'auto'
      }
    );
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

const SVG_NS = 'http://www.w3.org/2000/svg';

function renderRegulatoryPitchLines(pitchEl, isFutsal) {
  if (!pitchEl) return;
  const sportGroup = pitchEl.querySelector('[data-sport-lines]');
  if (!sportGroup) return;

  sportGroup.innerHTML = '';

  const mk = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
  };

  if (isFutsal) {
    // Arcos semicirculares reglamentarios de 6m en ambas metas + marcas de 6m y 10m
    sportGroup.appendChild(mk('path', { d: 'M 10 56 A 44 54 0 0 1 10 164', fill: 'none', 'stroke-width': '1.5' }));
    sportGroup.appendChild(mk('path', { d: 'M 350 56 A 44 54 0 0 0 350 164', fill: 'none', 'stroke-width': '1.5' }));
    // Punto de penalti (6m) y doble penalti (10m)
    sportGroup.appendChild(mk('circle', { cx: '46', cy: '110', r: '1.8', fill: '#38bdf8' }));
    sportGroup.appendChild(mk('circle', { cx: '72', cy: '110', r: '1.8', fill: 'rgba(125, 211, 252, 0.85)' }));
    sportGroup.appendChild(mk('circle', { cx: '314', cy: '110', r: '1.8', fill: '#38bdf8' }));
    sportGroup.appendChild(mk('circle', { cx: '288', cy: '110', r: '1.8', fill: 'rgba(125, 211, 252, 0.85)' }));
  } else {
    // Fútbol 7 / 9 / 11: Área grande rectangular, área de meta, punto de penalti y medialuna (18 yd)
    sportGroup.appendChild(mk('rect', { x: '10', y: '52', width: '50', height: '116', fill: 'none', 'stroke-width': '1.5' }));
    sportGroup.appendChild(mk('rect', { x: '10', y: '82', width: '18', height: '56', fill: 'none', 'stroke-width': '1.2' }));
    sportGroup.appendChild(mk('circle', { cx: '43', cy: '110', r: '1.9', fill: '#a7f3d0' }));
    sportGroup.appendChild(mk('path', { d: 'M 60 93 A 24 24 0 0 1 60 127', fill: 'none', 'stroke-width': '1.3' }));

    sportGroup.appendChild(mk('rect', { x: '300', y: '52', width: '50', height: '116', fill: 'none', 'stroke-width': '1.5' }));
    sportGroup.appendChild(mk('rect', { x: '332', y: '82', width: '18', height: '56', fill: 'none', 'stroke-width': '1.2' }));
    sportGroup.appendChild(mk('circle', { cx: '317', cy: '110', r: '1.9', fill: '#a7f3d0' }));
    sportGroup.appendChild(mk('path', { d: 'M 300 93 A 24 24 0 0 0 300 127', fill: 'none', 'stroke-width': '1.3' }));
  }

  // Arcos de esquina (4 córners)
  sportGroup.appendChild(mk('path', { d: 'M 10 18 A 8 8 0 0 0 18 10', fill: 'none', 'stroke-width': '1.2' }));
  sportGroup.appendChild(mk('path', { d: 'M 342 10 A 8 8 0 0 0 350 18', fill: 'none', 'stroke-width': '1.2' }));
  sportGroup.appendChild(mk('path', { d: 'M 10 202 A 8 8 0 0 1 18 210', fill: 'none', 'stroke-width': '1.2' }));
  sportGroup.appendChild(mk('path', { d: 'M 342 210 A 8 8 0 0 1 350 202', fill: 'none', 'stroke-width': '1.2' }));
}

export function applyPitchSurfaceTheme(pitchEl, modality) {
  if (!pitchEl) return;
  const isFutsal = String(modality || '').toLowerCase().includes('futsal');
  pitchEl.classList.toggle('surface-futsal', isFutsal);
  pitchEl.classList.toggle('surface-grass', !isFutsal);
  renderRegulatoryPitchLines(pitchEl, isFutsal);
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
    updateReferenceCoachBadgeAndWalkout(coachInfo.name);
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
      // Clic en ficha dentro de #tactical-pitch para fijar el aura Metavision giratoria en Juego Libre
      tokenEl.addEventListener('click', () => {
        if (getActiveSetPiece()) return;
        const clickedIdx = Number(tokenEl.dataset.slotIndex || 0);
        dom.pitchTokens.dataset.focusedSlot = String(clickedIdx);
        const tokens = dom.pitchTokens.querySelectorAll('.player-token');
        tokens.forEach((el, i) => {
          const isMatch = i === clickedIdx;
          el.classList.toggle('active-actor', isMatch);
          if (currentBoardCoords[i]) {
            currentBoardCoords[i].isActor = isMatch;
          }
        });
        if (state.isStadium3DView) {
          syncStadium3DScene(currentBoardCoords, null);
        }
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

    let isMetavisionFocused = Boolean(p.isActor);
    if (!activeSetPiece) {
      let focusedSlot = Number.parseInt(dom.pitchTokens.dataset.focusedSlot || '', 10);
      if (Number.isNaN(focusedSlot) || focusedSlot >= adjustedCoords.length) {
        const defaultIdx = adjustedCoords.findIndex(
          (c) => Number(c.num) === 10 || /ENG|MCO|PIV|ALA/i.test(String(c.role || ''))
        );
        focusedSlot = defaultIdx >= 0 ? defaultIdx : Math.max(0, Math.floor(adjustedCoords.length / 2));
        dom.pitchTokens.dataset.focusedSlot = String(focusedSlot);
      }
      isMetavisionFocused = idx === focusedSlot;
      adjustedCoords[idx].isActor = isMetavisionFocused;
    }

    tokenEl.className = `player-token ${p.gk ? 'gk' : ''} ${isMetavisionFocused ? 'active-actor' : ''}`.trim();
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

  renderTacticalHeatmap(adjustedCoords, activeSetup.links || [], styleMod);

  if (state.isStadium3DView) {
    syncStadium3DScene(adjustedCoords, activeSetPiece);
  }
}

export function renderSquadPitch() {
  if (!dom.squadPitchTokens || !dom.squadSynergyLinks) return;
  const setup = getActiveSquadFormationSetup();
  const opt = state.squadOptimization;
  const lineup = opt?.lineup || [];

  applyPitchSurfaceTheme(dom.squadPitch, state.squadModality);

  if (dom.squadGlobalSynergy && opt?.globalSynergy) {
    animateNumericCounter(dom.squadGlobalSynergy, opt.globalSynergy, '%');
  }
  updateContextBadges();

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
      ? `${assignedSlot.name.split(' ')[0]} (${assignedSlot.naturalPosition}${isOutOfPos ? ' · Adapt.' : ''})`
      : `Vacante · ${slotPlayer.role}`;
    const isSelected = playerId && playerId === state.selectedSquadPlayerId;
    const isSwapArmedTarget = Boolean(state.pendingSwapBenchPlayerId);

    tokenEl.className = [
      'player-token',
      'squad-token',
      slotPlayer.gk ? 'gk' : '',
      isSelected ? 'selected-token' : '',
      !isAssigned ? 'vacant-slot' : '',
      isOutOfPos ? 'out-of-position' : '',
      isSwapArmedTarget ? 'swap-target-candidate' : ''
    ]
      .filter(Boolean)
      .join(' ');

    tokenEl.textContent = String(displayNum);
    tokenEl.setAttribute('data-role', shortName);
    tokenEl.setAttribute('role', 'button');
    tokenEl.setAttribute('tabindex', '0');
    tokenEl.dataset.slotIndex = String(idx);
    tokenEl.dataset.vision = String(visionStat);
    tokenEl.draggable = isAssigned;

    if (playerId) {
      tokenEl.dataset.playerId = String(playerId);
      tokenEl.setAttribute(
        'aria-label',
        `${assignedSlot.name}, dorsal ${assignedSlot.jerseyNumber}, puesto ${slotPlayer.role}${isSwapArmedTarget ? '. Haz clic o pulsa Enter para permutar' : ''}`
      );
      tokenEl.title = isOutOfPos
        ? `${assignedSlot.name} (${assignedSlot.naturalPosition} jugando en puesto de ${slotPlayer.role}) — Arrastra o usa Clic-para-Permutar`
        : `${assignedSlot.name} (${assignedSlot.naturalPosition} · Visión ${visionStat}) — Arrastra o usa Clic-para-Permutar`;
    } else {
      delete tokenEl.dataset.playerId;
      tokenEl.setAttribute(
        'aria-label',
        `Puesto vacante ${slotPlayer.role}${isSwapArmedTarget ? '. Pulsa Enter o haz clic para asignar suplente' : ''}`
      );
      tokenEl.title = `Puesto vacante (${slotPlayer.role}) — Selecciona o arrastra un jugador desde la banca aquí`;
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

  updateCollectiveBalanceMeters(setup, lineup);
}

/**
 * 1. Mapa de Calor Táctico Dinámico (SVG Thermal Layer)
 * Calcula zonas térmicas difuminadas a partir de las posiciones activas y el estilo de juego.
 */
export function renderTacticalHeatmap(adjustedCoords = [], links = [], styleMod = {}) {
  if (!dom.heatmapOverlayLayer) return;
  dom.heatmapOverlayLayer.innerHTML = '';

  if (!state.isHeatmapActive) {
    dom.heatmapOverlayLayer.classList.add('hidden');
    return;
  }

  dom.heatmapOverlayLayer.classList.remove('hidden');

  const isHighPress = state.playStyle.includes('Presión Alta') || state.playStyle.includes('Directo');
  const isPossession = state.playStyle.includes('Posesión') || state.playStyle.includes('Rotación');
  const isLowBlock = state.playStyle.includes('Bloque Bajo');

  const thermalShiftX = isHighPress ? 14 : isLowBlock ? -12 : 4;
  const rxBase = isHighPress ? 42 : isPossession ? 38 : 34;
  const ryBase = isPossession ? 36 : 30;

  // Puentes térmicos en las zonas de asociación entre socios conectados
  links.forEach(([fromIdx, toIdx]) => {
    const p1 = adjustedCoords[fromIdx];
    const p2 = adjustedCoords[toIdx];
    if (!p1 || !p2) return;
    const midX = Math.max(22, Math.min(338, (p1.adjX + p2.adjX) / 2 + thermalShiftX * 0.6));
    const midY = (p1.adjY + p2.adjY) / 2;

    const bridgeBlob = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    bridgeBlob.setAttribute('cx', String(Math.round(midX)));
    bridgeBlob.setAttribute('cy', String(Math.round(midY)));
    bridgeBlob.setAttribute('rx', String(Math.round(rxBase * 0.85)));
    bridgeBlob.setAttribute('ry', String(Math.round(ryBase * 0.78)));
    bridgeBlob.setAttribute('fill', 'url(#heat-grad-bridge)');
    dom.heatmapOverlayLayer.appendChild(bridgeBlob);
  });

  // Focos térmicos principales por jugador según su línea y estilo
  adjustedCoords.forEach((p) => {
    const shift = p.gk ? thermalShiftX * 0.2 : thermalShiftX;
    const cx = Math.max(20, Math.min(340, p.adjX + shift));
    const cy = p.adjY;
    const rx = p.gk ? 26 : rxBase;
    const ry = p.gk ? 24 : ryBase;

    const coreBlob = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    coreBlob.setAttribute('cx', String(Math.round(cx)));
    coreBlob.setAttribute('cy', String(Math.round(cy)));
    coreBlob.setAttribute('rx', String(rx));
    coreBlob.setAttribute('ry', String(ry));
    coreBlob.setAttribute('fill', 'url(#heat-grad-core)');
    dom.heatmapOverlayLayer.appendChild(coreBlob);
  });

  gsap.fromTo(
    dom.heatmapOverlayLayer,
    { opacity: 0.15 },
    { opacity: 0.9, duration: 0.42, ease: 'power2.out', overwrite: 'auto' }
  );
}

export function toggleHeatmapView(forceState = null) {
  if (state.isStadium3DView && forceState !== false) {
    showToast(
      'Mapa de Calor solo en 2D / 2.5D',
      'Cambia a vista 2D o TV 2.5D para proyectar la densidad térmica espacial.',
      'info'
    );
    return;
  }
  state.isHeatmapActive =
    typeof forceState === 'boolean' ? forceState : !state.isHeatmapActive;
  const active = state.isHeatmapActive;

  if (dom.toggleHeatmapBtn) {
    dom.toggleHeatmapBtn.classList.toggle('active', active);
    dom.toggleHeatmapBtn.setAttribute('aria-pressed', String(active));
  }

  const activeSetup = getActiveFormationSetup();
  const styleMod = PLAY_STYLE_MODIFIERS[state.playStyle] || PLAY_STYLE_MODIFIERS['Posesión & Juego de Posición'];
  renderTacticalHeatmap(currentBoardCoords, activeSetup.links || [], styleMod);
}

/**
 * 2. Lápiz Táctico Libre sobre la Cancha (SVG Pointer Drawing)
 */
let isDrawingStroke = false;
let activeStrokePoints = [];
let activeStrokePathEl = null;
let strokeColorIndex = 0;

function clientToSvgCoords(svgEl, clientX, clientY) {
  const rect = svgEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 180, y: 110 };
  const x = Math.max(8, Math.min(352, ((clientX - rect.left) / rect.width) * 360));
  const y = Math.max(8, Math.min(212, ((clientY - rect.top) / rect.height) * 220));
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

function buildSmoothFreehandPathD(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = Math.round(((pts[i].x + pts[i + 1].x) / 2) * 10) / 10;
    const midY = Math.round(((pts[i].y + pts[i + 1].y) / 2) * 10) / 10;
    d += ` Q ${pts[i].x} ${pts[i].y} ${midX} ${midY}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function setFreehandColor(color = 'cyan') {
  const validColors = new Set(['cyan', 'amber', 'red']);
  state.drawColor = validColors.has(color) ? color : 'cyan';
  if (dom.freehandToolbar) {
    dom.freehandToolbar.querySelectorAll('.freehand-color-btn').forEach((btn) => {
      const isMatch = btn.dataset.drawColor === state.drawColor;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', String(isMatch));
    });
  }
}

export function syncDrawToolbarButtons() {
  const strokeCount = dom.freehandPathsGroup ? dom.freehandPathsGroup.children.length : 0;
  const hasStrokes = strokeCount > 0;
  if (dom.clearDrawBtn) {
    dom.clearDrawBtn.classList.toggle('hidden', !state.isDrawModeActive && !hasStrokes);
  }
  if (dom.undoDrawBtn) {
    dom.undoDrawBtn.disabled = !hasStrokes;
  }
  if (dom.freehandToolbar) {
    dom.freehandToolbar.classList.toggle('hidden', !state.isDrawModeActive);
  }
}

export function undoLastFreehandStroke() {
  if (!dom.freehandPathsGroup) return false;
  const last = dom.freehandPathsGroup.lastElementChild;
  if (!last) return false;
  last.remove();
  syncDrawToolbarButtons();
  return true;
}

export function toggleFreehandDrawMode(forceState = null) {
  if (state.isStadium3DView && forceState !== false) {
    showToast(
      'Trazado manual no disponible en 3D',
      'Vuelve a vista 2D o TV 2.5D para dibujar rutas tácticas sobre la pizarra.',
      'info'
    );
    return;
  }
  state.isDrawModeActive =
    typeof forceState === 'boolean' ? forceState : !state.isDrawModeActive;
  const active = state.isDrawModeActive;

  if (dom.toggleDrawBtn) {
    dom.toggleDrawBtn.classList.toggle('active', active);
    dom.toggleDrawBtn.setAttribute('aria-pressed', String(active));
  }
  if (dom.freehandDrawSvg) {
    dom.freehandDrawSvg.classList.toggle('drawing-enabled', active);
  }
  syncDrawToolbarButtons();
}

export function clearFreehandDrawings() {
  if (dom.freehandPathsGroup) {
    dom.freehandPathsGroup.innerHTML = '';
  }
  syncDrawToolbarButtons();
}

export function initFreehandDrawingEvents() {
  const svgEl = dom.freehandDrawSvg;
  const groupEl = dom.freehandPathsGroup;
  if (!svgEl || !groupEl) return;

  svgEl.addEventListener('pointerdown', (e) => {
    if (!state.isDrawModeActive) return;
    e.preventDefault();
    svgEl.setPointerCapture(e.pointerId);
    isDrawingStroke = true;

    const startPt = clientToSvgCoords(svgEl, e.clientX, e.clientY);
    activeStrokePoints = [startPt];

    // Shift + arrastrar alterna rápido a Ámbar manteniendo color seleccionado para uso normal
    const activeColor = e.shiftKey ? 'amber' : (state.drawColor || 'cyan');
    const markerId =
      activeColor === 'amber'
        ? 'url(#arrow-freehand-amber)'
        : activeColor === 'red'
          ? 'url(#arrow-freehand-red)'
          : 'url(#arrow-freehand-cyan)';

    activeStrokePathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    activeStrokePathEl.setAttribute('class', `freehand-stroke ${activeColor}`);
    activeStrokePathEl.setAttribute('d', `M ${startPt.x} ${startPt.y}`);
    activeStrokePathEl.setAttribute('marker-end', markerId);
    groupEl.appendChild(activeStrokePathEl);
  });

  svgEl.addEventListener('pointermove', (e) => {
    if (!isDrawingStroke || !activeStrokePathEl) return;
    const pt = clientToSvgCoords(svgEl, e.clientX, e.clientY);
    const prev = activeStrokePoints[activeStrokePoints.length - 1];
    if (Math.hypot(pt.x - prev.x, pt.y - prev.y) < 3.2) return;
    activeStrokePoints.push(pt);
    activeStrokePathEl.setAttribute('d', buildSmoothFreehandPathD(activeStrokePoints));
  });

  const finishStroke = (e) => {
    if (!isDrawingStroke) return;
    isDrawingStroke = false;
    if (e?.pointerId !== undefined && svgEl.hasPointerCapture(e.pointerId)) {
      svgEl.releasePointerCapture(e.pointerId);
    }
    syncDrawToolbarButtons();
    activeStrokePathEl = null;
    activeStrokePoints = [];
  };

  svgEl.addEventListener('pointerup', finishStroke);
  svgEl.addEventListener('pointercancel', finishStroke);
}

/**
 * 3. Medidor de Balance Colectivo (ATAQUE / CREACIÓN / DEFENSA) con GSAP
 */
export function updateCollectiveBalanceMeters(
  setup = getActiveSquadFormationSetup(),
  lineup = state.squadOptimization?.lineup || []
) {
  if (!dom.balanceValAttack || !dom.balanceBarAttack) return;

  const totalSlots = setup?.players?.length || 5;
  let sumAttack = 0;
  let sumCreation = 0;
  let sumDefense = 0;

  for (let i = 0; i < totalSlots; i++) {
    const slotPlayer = setup.players[i];
    const assigned = lineup[i];
    const isAssigned = Boolean(assigned?.assigned && assigned?.playerId);
    const fullPlayer = isAssigned
      ? state.squadPlayers.find((sp) => sp.id === assigned.playerId)
      : null;

    if (fullPlayer) {
      sumAttack += (Number(fullPlayer.shooting || 80) + Number(fullPlayer.dribbling || 80)) / 2;
      sumCreation += (Number(fullPlayer.passing || 82) + Number(fullPlayer.vision || 82)) / 2;
      sumDefense += (Number(fullPlayer.defending || 78) + Number(fullPlayer.pace || 80)) / 2;
    } else if (isAssigned) {
      const ovr = Number(assigned.overall || 82);
      sumAttack += ovr - (slotPlayer?.gk ? 10 : 1);
      sumCreation += ovr;
      sumDefense += ovr;
    } else {
      sumAttack += 74;
      sumCreation += 76;
      sumDefense += 74;
    }
  }

  const attackScore = Math.max(45, Math.min(99, Math.round(sumAttack / totalSlots)));
  const creationScore = Math.max(45, Math.min(99, Math.round(sumCreation / totalSlots)));
  const defenseScore = Math.max(45, Math.min(99, Math.round(sumDefense / totalSlots)));

  animateNumericCounter(dom.balanceValAttack, attackScore, '');
  animateNumericCounter(dom.balanceValCreation, creationScore, '');
  animateNumericCounter(dom.balanceValDefense, defenseScore, '');

  gsap.to(dom.balanceBarAttack, {
    width: `${attackScore}%`,
    duration: 0.75,
    ease: 'power3.out',
    overwrite: 'auto'
  });
  gsap.to(dom.balanceBarCreation, {
    width: `${creationScore}%`,
    duration: 0.75,
    delay: 0.05,
    ease: 'power3.out',
    overwrite: 'auto'
  });
  gsap.to(dom.balanceBarDefense, {
    width: `${defenseScore}%`,
    duration: 0.75,
    delay: 0.1,
    ease: 'power3.out',
    overwrite: 'auto'
  });
}

/**
 * 4. Exportación Rápida de la Pizarra Táctica a Imagen PNG (tacticalplay-pizarra.png)
 */
export function exportPitchAsPng(sourceTab = 'board') {
  const isFromSquad = sourceTab === 'squad';
  const activeModality = isFromSquad ? state.squadModality : state.modality;
  const activeSetup = isFromSquad ? getActiveSquadFormationSetup() : getActiveFormationSetup();
  const activeStyle = isFromSquad
    ? (dom.squadStyleSelect ? dom.squadStyleSelect.value : state.playStyle)
    : state.playStyle;
  const coachInfo = resolveReferenceCoach(activeModality, activeSetup.code, activeStyle);
  const isFutsal = String(activeModality || '').toLowerCase().includes('futsal');

  const canvas = document.createElement('canvas');
  canvas.width = 1440;
  canvas.height = 940;
  const ctx = canvas.getContext('2d');

  // 1. Fondo general Slate/Obsidian
  ctx.fillStyle = '#0b0d14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Encabezado Broadcast
  ctx.fillStyle = '#0b1222';
  ctx.fillRect(40, 24, 1360, 76);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 24, 1360, 76);

  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 26px "Plus Jakarta Sans", "Inter", sans-serif';
  ctx.fillText(`TacticalPlay RAG · ${activeModality} · Sistema ${activeSetup.code}`, 64, 58);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 17px "Inter", sans-serif';
  ctx.fillText(`Estilo: ${activeStyle}   |   DT Referente: ${coachInfo.name}`, 64, 84);

  // 3. Superficie de cancha (X: 40..1400, Y: 120..880 -> 1360 x 760)
  const pitchX = 40;
  const pitchY = 120;
  const pitchW = 1360;
  const pitchH = 760;

  if (isFutsal) {
    const grad = ctx.createRadialGradient(720, 500, 80, 720, 500, 780);
    grad.addColorStop(0, '#0f2952');
    grad.addColorStop(0.65, '#091936');
    grad.addColorStop(1, '#040b1a');
    ctx.fillStyle = grad;
    ctx.fillRect(pitchX, pitchY, pitchW, pitchH);
  } else {
    const stripeCount = 16;
    const stripeW = pitchW / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#064e3b' : '#043927';
      ctx.fillRect(pitchX + i * stripeW, pitchY, stripeW, pitchH);
    }
  }

  // Escala del viewBox SVG (360 x 220) al rectángulo de cancha en canvas
  const mapX = (x2d) => pitchX + (x2d / 360) * pitchW;
  const mapY = (y2d) => pitchY + (y2d / 220) * pitchH;

  // 4. Mapa de Calor si está activo
  const coordsToDraw = isFromSquad
    ? (currentSquadCoords.length > 0
        ? currentSquadCoords
        : activeSetup.players.map((p) => ({ ...p, adjX: p.x, adjY: p.y })))
    : (currentBoardCoords.length > 0
        ? currentBoardCoords
        : activeSetup.players.map((p) => ({ ...p, adjX: p.x, adjY: p.y })));

  if (!isFromSquad && state.isHeatmapActive) {
    coordsToDraw.forEach((p) => {
      const hx = mapX(p.adjX ?? p.x);
      const hy = mapY(p.adjY ?? p.y);
      const rad = ctx.createRadialGradient(hx, hy, 12, hx, hy, 135);
      rad.addColorStop(0, 'rgba(239, 68, 68, 0.55)');
      rad.addColorStop(0.45, 'rgba(245, 158, 11, 0.35)');
      rad.addColorStop(0.8, 'rgba(16, 185, 129, 0.16)');
      rad.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = rad;
      ctx.beginPath();
      ctx.arc(hx, hy, 135, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 5. Líneas reglamentarias de la cancha
  ctx.strokeStyle = isFutsal ? 'rgba(56, 189, 248, 0.65)' : 'rgba(110, 231, 183, 0.65)';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(mapX(10), mapY(10), (340 / 360) * pitchW, (200 / 220) * pitchH);

  // Línea media y círculo central
  ctx.beginPath();
  ctx.moveTo(mapX(180), mapY(10));
  ctx.lineTo(mapX(180), mapY(210));
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(mapX(180), mapY(110), (32 / 360) * pitchW, 0, Math.PI * 2);
  ctx.stroke();

  // Áreas reglamentarias diferenciadas por modalidad (Futsal vs Fútbol 7/9/11)
  if (isFutsal) {
    ctx.beginPath();
    ctx.ellipse(mapX(10), mapY(110), (44 / 360) * pitchW, (54 / 220) * pitchH, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(mapX(350), mapY(110), (44 / 360) * pitchW, (54 / 220) * pitchH, 0, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.stroke();
    [46, 72, 288, 314].forEach((pxDot) => {
      ctx.beginPath();
      ctx.arc(mapX(pxDot), mapY(110), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
    });
  } else {
    ctx.strokeRect(mapX(10), mapY(52), (50 / 360) * pitchW, (116 / 220) * pitchH);
    ctx.strokeRect(mapX(10), mapY(82), (18 / 360) * pitchW, (56 / 220) * pitchH);
    ctx.strokeRect(mapX(300), mapY(52), (50 / 360) * pitchW, (116 / 220) * pitchH);
    ctx.strokeRect(mapX(332), mapY(82), (18 / 360) * pitchW, (56 / 220) * pitchH);
    ctx.beginPath();
    ctx.arc(mapX(43), mapY(110), (24 / 360) * pitchW, -0.78, 0.78);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mapX(317), mapY(110), (24 / 360) * pitchW, Math.PI - 0.78, Math.PI + 0.78);
    ctx.stroke();
  }

  // 6. Líneas de sinergia
  ctx.save();
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.48)';
  ctx.lineWidth = 2.5;
  (activeSetup.links || []).forEach(([i1, i2]) => {
    const p1 = coordsToDraw[i1];
    const p2 = coordsToDraw[i2];
    if (!p1 || !p2) return;
    ctx.beginPath();
    ctx.moveTo(mapX(p1.adjX ?? p1.x), mapY(p1.adjY ?? p1.y));
    ctx.lineTo(mapX(p2.adjX ?? p2.x), mapY(p2.adjY ?? p2.y));
    ctx.stroke();
  });
  ctx.restore();

  // 6B. Rutas de Balón Parado activas (si hay una jugada seleccionada)
  const activeSetPieceForPng = !isFromSquad ? getActiveSetPiece() : null;
  if (activeSetPieceForPng && Array.isArray(activeSetPieceForPng.movements)) {
    activeSetPieceForPng.movements.forEach((mv) => {
      const targetPlayer = coordsToDraw[mv.playerIndex];
      const startX = mv.fromX ?? targetPlayer?.x;
      const startY = mv.fromY ?? targetPlayer?.y;
      if (startX === undefined || mv.toX === undefined) return;
      ctx.save();
      ctx.strokeStyle = mv.type === 'pass' ? '#fbbf24' : mv.type === 'shot' ? '#f43f5e' : '#38bdf8';
      ctx.lineWidth = 3.2;
      if (mv.type === 'pass') ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.moveTo(mapX(startX), mapY(startY));
      ctx.lineTo(mapX(mv.toX), mapY(mv.toY));
      ctx.stroke();
      ctx.restore();
    });
  }

  // 7. Trazos manuales dibujados con el lápiz táctico
  if (!isFromSquad && dom.freehandPathsGroup && dom.freehandPathsGroup.children.length > 0) {
    Array.from(dom.freehandPathsGroup.children).forEach((pathEl) => {
      const dAttr = pathEl.getAttribute('d');
      if (!dAttr) return;
      const isAmber = pathEl.classList.contains('amber');
      const isRed = pathEl.classList.contains('red');
      ctx.save();
      ctx.translate(pitchX, pitchY);
      ctx.scale(pitchW / 360, pitchH / 220);
      ctx.strokeStyle = isRed ? '#f43f5e' : isAmber ? '#fbbf24' : '#38bdf8';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const path2d = new Path2D(dAttr);
      ctx.stroke(path2d);
      ctx.restore();
    });
  }

  // 8. Fichas de jugadores (Dorsal + Nombre/Rol)
  const rawLineup = isFromSquad
    ? (state.squadOptimization?.lineup || [])
    : (state.exportedBoardLineup?.modality === activeModality
        ? state.exportedBoardLineup.starters
        : []);

  coordsToDraw.forEach((p, idx) => {
    const px = mapX(p.adjX ?? p.x);
    const py = mapY(p.adjY ?? p.y);
    const assigned = rawLineup?.[idx];
    const hasPlayer = Boolean(assigned && assigned.assigned && assigned.playerId);
    const dorsal = hasPlayer ? String(assigned.jerseyNumber) : String(p.num);
    const labelText = hasPlayer
      ? `${assigned.name.split(' ')[0]} (${p.role})`
      : p.role;

    // Círculo del jugador
    ctx.beginPath();
    ctx.arc(px, py, 24, 0, Math.PI * 2);
    ctx.fillStyle = p.gk ? '#059669' : p.isActor ? '#0284c7' : '#1d4ed8';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = p.isActor ? '#00d2ff' : '#bae6fd';
    ctx.stroke();

    // Dorsal
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px "JetBrains Mono", "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dorsal, px, py);

    // Etiqueta inferior
    ctx.fillStyle = '#bae6fd';
    ctx.font = 'bold 14px "Inter", sans-serif';
    ctx.fillText(labelText, px, py + 36);
  });

  // 9. Descargar archivo PNG
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = 'tacticalplay-pizarra.png';
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();

  showToast(
    'Imagen Guardada',
    'Se descargó la captura táctica en alta resolución (tacticalplay-pizarra.png).',
    'success'
  );
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
