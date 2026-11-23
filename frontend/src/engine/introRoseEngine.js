/* ==========================================================================
   Blue Rose Opening Cinematic Engine (HTML5 Canvas 2D + SVG + GSAP Timeline)
   Phase 1 (0.0s–1.4s): ~95 Sculpted Angular Petals with Veins Converge &
                        Reveal the Sculpted Blue Rose by Layers (Core -> Mid -> Outer)
   Phase 2 (1.4s–2.4s): Curved Stem with Thorns & Serrated Leaves + Fully Sealed Glass Dome
   Phase 3 (2.4s–3.6s): Blue Flames, Engraved Floral Pattern & Calligraphic Quote
   Phase 4 (3.6s–4.2s): Cyan-Sapphire Flash & Smooth Dissolve into TacticalPlay RAG
   ========================================================================== */

import gsap from 'gsap';

let introRafId = null;
let introTimeline = null;
let isIntroRunning = false;
let resizeHandler = null;

const PETAL_COLORS = [
  { base: '#020617', mid: '#002b80', rim: '#38bdf8', glow: 'rgba(0, 43, 128, 0.85)' },
  { base: '#020617', mid: '#1d4ed8', rim: '#7dd3fc', glow: 'rgba(29, 78, 216, 0.85)' },
  { base: '#001a4d', mid: '#0284c7', rim: '#bae6fd', glow: 'rgba(2, 132, 199, 0.9)' },
  { base: '#020617', mid: '#2563eb', rim: '#38bdf8', glow: 'rgba(37, 99, 235, 0.85)' },
  { base: '#002b80', mid: '#38bdf8', rim: '#e0f2fe', glow: 'rgba(56, 189, 248, 0.95)' }
];

function createSpiralPetals(count, width, height, targetX, targetY) {
  const petals = [];
  const maxDist = Math.hypot(width, height) * 0.68;

  for (let i = 0; i < count; i++) {
    const layerRatio = i / count;
    const startAngle = i * 2.39996 + (Math.random() - 0.5) * 0.35;
    const startRadius = maxDist * (0.72 + Math.random() * 0.45);
    const spiralTurns = (1.25 + (i % 3) * 0.32) * (i % 2 === 0 ? 1 : -1);

    const finalRingRadius = 3 + Math.pow(layerRatio, 0.85) * 46;
    const finalAngle = i * 2.39996;
    const destX = targetX + Math.cos(finalAngle) * finalRingRadius;
    const destY = targetY + Math.sin(finalAngle) * finalRingRadius * 0.88;

    const palette = PETAL_COLORS[i % PETAL_COLORS.length];
    const size = 12 + Math.pow(layerRatio, 0.72) * 16;

    petals.push({
      startAngle,
      startRadius,
      spiralTurns,
      destX,
      destY,
      finalAngle,
      size,
      palette,
      spinSpeed: (Math.random() - 0.5) * 4.8,
      delayOffset: (i / count) * 0.25
    });
  }
  return petals;
}

function createBlueFlameParticles(count, width, height) {
  const flames = [];
  for (let i = 0; i < count; i++) {
    flames.push({
      x: width * (0.14 + Math.random() * 0.72),
      baseY: height + 20 + Math.random() * 90,
      y: height + Math.random() * 80,
      width: 18 + Math.random() * 34,
      height: 85 + Math.random() * 145,
      speedY: 1.8 + Math.random() * 2.6,
      swayAmp: 8 + Math.random() * 16,
      swayFreq: 1.5 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.16 + Math.random() * 0.28,
      isCyanCore: i % 3 === 0
    });
  }
  return flames;
}

/**
 * Dibuja un pétalo esculpido estilo anime/Blue Lock (gota curva con punta angular,
 * sombreado negro tinta en la base, borde iluminado en cian y nervadura central)
 */
function drawSculptedRosePetalOnCanvas(ctx, x, y, size, rotation, palette, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;

  const grad = ctx.createLinearGradient(0, size, 0, -size);
  grad.addColorStop(0, palette.base);
  grad.addColorStop(0.55, palette.mid);
  grad.addColorStop(1, palette.rim);

  ctx.fillStyle = grad;
  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = 1.3;
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = 9;

  // Silueta esculpida de pétalo de rosa con pico superior angular y pliegue lateral
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.05);
  ctx.lineTo(size * 0.52, -size * 0.68);
  ctx.quadraticCurveTo(size * 0.92, -size * 0.1, size * 0.54, size * 0.58);
  ctx.lineTo(0, size * 0.98);
  ctx.lineTo(-size * 0.54, size * 0.58);
  ctx.quadraticCurveTo(-size * 0.92, -size * 0.1, -size * 0.52, -size * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Nervadura central y pliegue interior en tinta oscura / luz cian
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(224, 242, 254, 0.55)';
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.78);
  ctx.quadraticCurveTo(size * 0.12, 0, 0, size * 0.72);
  ctx.moveTo(0, -size * 0.25);
  ctx.lineTo(size * 0.34, -size * 0.46);
  ctx.moveTo(0, 0.05);
  ctx.lineTo(-size * 0.34, -size * 0.2);
  ctx.stroke();

  ctx.restore();
}

function drawBlueFlameOnCanvas(ctx, flame, timeSec, masterAlpha) {
  if (masterAlpha <= 0.01) return;
  const currentX =
    flame.x + Math.sin(timeSec * flame.swayFreq + flame.phase) * flame.swayAmp;
  const currentY = flame.y;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = flame.alpha * masterAlpha;

  const grad = ctx.createRadialGradient(
    currentX,
    currentY,
    2,
    currentX,
    currentY - flame.height * 0.35,
    flame.height * 0.75
  );
  if (flame.isCyanCore) {
    grad.addColorStop(0, 'rgba(224, 242, 254, 0.95)');
    grad.addColorStop(0.35, 'rgba(56, 189, 248, 0.75)');
    grad.addColorStop(0.75, 'rgba(29, 78, 216, 0.28)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  } else {
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.85)');
    grad.addColorStop(0.45, 'rgba(37, 99, 235, 0.55)');
    grad.addColorStop(0.82, 'rgba(0, 43, 128, 0.22)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(currentX, currentY - flame.height);
  ctx.quadraticCurveTo(
    currentX + flame.width,
    currentY - flame.height * 0.35,
    currentX,
    currentY + 18
  );
  ctx.quadraticCurveTo(
    currentX - flame.width,
    currentY - flame.height * 0.35,
    currentX,
    currentY - flame.height
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

let escapeIntroHandler = null;

function stopAndCleanupIntroCanvas(canvas) {
  if (escapeIntroHandler) {
    window.removeEventListener('keydown', escapeIntroHandler);
    escapeIntroHandler = null;
  }
  if (introRafId) {
    cancelAnimationFrame(introRafId);
    introRafId = null;
  }
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 1;
    canvas.height = 1;
  }
  isIntroRunning = false;
}

export function playBlueRoseIntroCinematic() {
  const overlay = document.getElementById('intro-rose-overlay');
  const canvas = document.getElementById('intro-rose-canvas');
  const bgPattern = document.getElementById('intro-rose-bg-pattern');
  const assembledRose = document.getElementById('intro-assembled-rose-group');
  const roseLayerCore = document.getElementById('intro-rose-layer-core');
  const roseLayerMid = document.getElementById('intro-rose-layer-mid');
  const roseLayerOuter = document.getElementById('intro-rose-layer-outer');
  const stemPath = document.getElementById('intro-rose-stem-path');
  const leafLeft = document.getElementById('intro-leaf-left');
  const leafRight = document.getElementById('intro-leaf-right');
  const domePath = document.getElementById('intro-glass-dome-path');
  const domeReflection = document.getElementById('intro-glass-dome-reflection');
  const domeBase = document.getElementById('intro-dome-base');
  const quoteEl = document.getElementById('intro-rose-quote');
  const flashLayer = document.getElementById('intro-flash-layer');

  if (!overlay || !canvas) return;

  if (introTimeline) {
    introTimeline.kill();
    introTimeline = null;
  }
  stopAndCleanupIntroCanvas(canvas);
  isIntroRunning = true;

  escapeIntroHandler = (e) => {
    if (e.key === 'Escape' && isIntroRunning) {
      e.preventDefault();
      finishIntroAndRevealApp();
    }
  };
  window.addEventListener('keydown', escapeIntroHandler);

  // Mostrar overlay y resetear estados iniciales por capas
  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';
  gsap.set(overlay, { opacity: 1, scale: 1 });
  gsap.set(bgPattern, { opacity: 0, scale: 1.04 });
  gsap.set(assembledRose, { opacity: 1, scale: 1 });
  gsap.set([roseLayerCore, roseLayerMid, roseLayerOuter], {
    opacity: 0,
    scale: 0.55,
    transformOrigin: '0px 0px'
  });
  gsap.set([leafLeft, leafRight], { opacity: 0, scale: 0.35, transformOrigin: '50% 50%' });
  gsap.set(domeBase, { opacity: 0, scaleX: 0.3, transformOrigin: '50% 50%' });
  gsap.set(domeReflection, { opacity: 0 });
  gsap.set(quoteEl, { opacity: 0, y: 14 });
  gsap.set(flashLayer, { opacity: 0 });

  // Respetar preferencia del SO prefers-reduced-motion mostrando emblema estático breve
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    [stemPath, domePath].forEach((pathEl) => {
      if (!pathEl) return;
      pathEl.style.strokeDasharray = 'none';
      pathEl.style.strokeDashoffset = '0';
      pathEl.style.opacity = '1';
    });
    gsap.set(bgPattern, { opacity: 0.28, scale: 1 });
    gsap.set([roseLayerCore, roseLayerMid, roseLayerOuter, leafLeft, leafRight], {
      opacity: 1,
      scale: 1
    });
    gsap.set(domeBase, { opacity: 1, scaleX: 1 });
    gsap.set(domeReflection, { opacity: 0.45 });
    gsap.set(quoteEl, { opacity: 1, y: 0 });
    introTimeline = gsap.delayedCall(1.6, () => finishIntroAndRevealApp());
    return;
  }

  // Preparar trazos SVG con holgura extra (+18px) para que al llegar a offset 0 la cúpula selle 100% cerrada
  [stemPath, domePath].forEach((pathEl) => {
    if (!pathEl) return;
    const len = (pathEl.getTotalLength ? Math.ceil(pathEl.getTotalLength()) : 820) + 18;
    pathEl.style.strokeDasharray = `${len}`;
    pathEl.style.strokeDashoffset = `${len}`;
    pathEl.style.opacity = '1';
  });

  const ctx = canvas.getContext('2d');
  let width = window.innerWidth || 1280;
  let height = window.innerHeight || 720;
  let roseCenterX = width / 2;
  let roseCenterY = height / 2 - 58;

  const updateCanvasSize = () => {
    width = window.innerWidth || 1280;
    height = window.innerHeight || 720;
    canvas.width = width;
    canvas.height = height;
    roseCenterX = width / 2;
    roseCenterY = height / 2 - 58;
  };
  updateCanvasSize();

  resizeHandler = () => updateCanvasSize();
  window.addEventListener('resize', resizeHandler);

  const petals = createSpiralPetals(95, width, height, roseCenterX, roseCenterY);
  const flames = createBlueFlameParticles(36, width, height);

  const animState = {
    petalConvergence: 0,
    petalCanvasAlpha: 1,
    flameIntensity: 0
  };

  const startTime = performance.now();

  const renderCanvasFrame = (now) => {
    if (!isIntroRunning) return;
    const elapsedSec = (now - startTime) / 1000;
    ctx.clearRect(0, 0, width, height);

    // 1. Halo radial azul cobalto en el centro
    const centerGlow = ctx.createRadialGradient(
      roseCenterX,
      roseCenterY + 35,
      10,
      roseCenterX,
      roseCenterY + 35,
      320
    );
    centerGlow.addColorStop(0, 'rgba(2, 132, 199, 0.25)');
    centerGlow.addColorStop(0.5, 'rgba(0, 43, 128, 0.12)');
    centerGlow.addColorStop(1, 'rgba(2, 4, 9, 0)');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, width, height);

    // 2. Fase 3: Llamas azules translúcidas ascendiendo alrededor de la cúpula
    if (animState.flameIntensity > 0.01) {
      flames.forEach((fl) => {
        fl.y -= fl.speedY;
        if (fl.y < height * 0.24) {
          fl.y = fl.baseY;
        }
        drawBlueFlameOnCanvas(ctx, fl, elapsedSec, animState.flameIntensity);
      });
    }

    // 3. Fase 1: ~95 Pétalos esculpidos con nervadura convergiendo hacia el centro
    if (animState.petalCanvasAlpha > 0.01) {
      const globalP = animState.petalConvergence;
      petals.forEach((p) => {
        const localT = Math.max(
          0,
          Math.min(1, (globalP - p.delayOffset) / (1 - p.delayOffset))
        );
        const eased = 1 - Math.pow(1 - localT, 3);

        const currentRadius = (1 - eased) * p.startRadius;
        const currentAngle = p.startAngle + (1 - eased) * p.spiralTurns * Math.PI;

        const spiralX = roseCenterX + Math.cos(currentAngle) * currentRadius;
        const spiralY = roseCenterY + Math.sin(currentAngle) * currentRadius;

        const x = spiralX * (1 - eased) + p.destX * eased;
        const y = spiralY * (1 - eased) + p.destY * eased;
        const rot = p.finalAngle + Math.PI / 2 + (1 - eased) * p.spinSpeed;
        const alpha = Math.min(1, localT * 2.2) * animState.petalCanvasAlpha;

        drawSculptedRosePetalOnCanvas(ctx, x, y, p.size, rot, p.palette, alpha);
      });
    }

    introRafId = requestAnimationFrame(renderCanvasFrame);
  };

  introRafId = requestAnimationFrame(renderCanvasFrame);

  // =========================================================================
  // GSAP Master Timeline (5.0 Segundos Exactos en 4 Fases)
  // =========================================================================
  introTimeline = gsap.timeline({
    onComplete: () => finishIntroAndRevealApp()
  });

  // FASE 1 (0.0s – 1.6s): Convergencia de pétalos y ensamblaje escalonado por capas (Capullo -> Media -> Exterior)
  introTimeline.to(
    animState,
    {
      petalConvergence: 1,
      duration: 1.56,
      ease: 'power2.inOut'
    },
    0
  );

  // 1A. Capullo Central en copa (5 pétalos internos con filo cian)
  introTimeline.to(
    roseLayerCore,
    {
      opacity: 1,
      scale: 1,
      duration: 0.42,
      ease: 'back.out(1.9)'
    },
    0.96
  );

  // 1B. Capa Media envolvente (6 pétalos con pliegues en negro tinta)
  introTimeline.to(
    roseLayerMid,
    {
      opacity: 1,
      scale: 1,
      duration: 0.44,
      ease: 'back.out(1.7)'
    },
    1.14
  );

  // 1C. Capa Exterior angular y sépalos
  introTimeline.to(
    roseLayerOuter,
    {
      opacity: 1,
      scale: 1,
      duration: 0.46,
      ease: 'back.out(1.6)'
    },
    1.3
  );

  introTimeline.to(
    animState,
    {
      petalCanvasAlpha: 0,
      duration: 0.36,
      ease: 'power2.out'
    },
    1.34
  );

  // FASE 2 (1.6s – 2.8s): Tallo curvado con espinas y hojas dentadas + Cúpula de Cristal 100% sellada
  introTimeline.to(
    stemPath,
    {
      strokeDashoffset: 0,
      duration: 0.9,
      ease: 'power2.inOut'
    },
    1.6
  );

  introTimeline.to(
    [leafLeft, leafRight],
    {
      opacity: 1,
      scale: 1,
      duration: 0.54,
      stagger: 0.12,
      ease: 'back.out(1.8)'
    },
    1.96
  );

  introTimeline.to(
    domeBase,
    {
      opacity: 1,
      scaleX: 1,
      duration: 0.55,
      ease: 'power3.out'
    },
    1.88
  );

  introTimeline.to(
    domePath,
    {
      strokeDashoffset: 0,
      duration: 1.12,
      ease: 'power2.inOut'
    },
    1.66
  );

  introTimeline.to(
    domeReflection,
    {
      opacity: 0.85,
      duration: 0.45,
      ease: 'sine.out'
    },
    2.35
  );

  // FASE 3 (2.8s – 4.3s): Fuego Azul ascendente, grabado floral y lema legible durante 1.5s
  introTimeline.to(
    bgPattern,
    {
      opacity: 0.34,
      scale: 1,
      duration: 0.9,
      ease: 'power2.out'
    },
    2.8
  );

  introTimeline.to(
    animState,
    {
      flameIntensity: 1,
      duration: 0.65,
      ease: 'sine.inOut'
    },
    2.75
  );

  introTimeline.to(
    quoteEl,
    {
      opacity: 1,
      y: 0,
      duration: 0.65,
      ease: 'power3.out'
    },
    2.8
  );

  // FASE 4 (4.3s – 5.0s): Destello azul-cian y desvanecimiento suave hacia la aplicación (5.00s total)
  introTimeline.to(
    flashLayer,
    {
      opacity: 0.88,
      duration: 0.28,
      ease: 'power2.in'
    },
    4.3
  );

  introTimeline.to(
    overlay,
    {
      opacity: 0,
      scale: 1.05,
      duration: 0.58,
      ease: 'power2.inOut'
    },
    4.42
  );
}

export function finishIntroAndRevealApp() {
  const overlay = document.getElementById('intro-rose-overlay');
  const canvas = document.getElementById('intro-rose-canvas');

  if (introTimeline) {
    introTimeline.kill();
    introTimeline = null;
  }
  stopAndCleanupIntroCanvas(canvas);

  if (overlay && !overlay.classList.contains('hidden')) {
    gsap.to(overlay, {
      opacity: 0,
      scale: 1.04,
      duration: 0.28,
      ease: 'power2.out',
      onComplete: () => {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
      }
    });
  }

  const visibleCards = document.querySelectorAll('.active-view .glass-card');
  if (visibleCards.length > 0) {
    gsap.fromTo(
      visibleCards,
      { opacity: 0.65, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: 0.45,
        stagger: 0.05,
        ease: 'power2.out',
        overwrite: 'auto'
      }
    );
  }
}

export function initBlueRoseIntroEvents() {
  const skipBtn = document.getElementById('skip-intro-rose-btn');
  const replayBtn = document.getElementById('replay-intro-rose-btn');

  if (skipBtn) {
    skipBtn.addEventListener('click', () => finishIntroAndRevealApp());
  }
  if (replayBtn) {
    replayBtn.addEventListener('click', () => playBlueRoseIntroCinematic());
  }
}
