/* ==========================================================================
   Estética Azul Abisal — High-DPI Faceted Geometric Login Backdrop Renderer
   Draws faceted polygonal Blue Roses (#0f296e -> #1d4ed8 -> #38bdf8, bright
   cyan faceted edges #7dd3fc/#e0f2fe, dark hexagonal/pentagonal core, 3 pointed
   base leaves), double-line luminous cyan thorny vines with hollow bright-cyan
   triangular thorns, and geometric Azul Abisal Crowns.
   ========================================================================== */

let backdropRafId = null;
let resizeTimer = null;

function evalCubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y
  };
}

function evalCubicTangent(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
  };
}

function evalCubicNormal(p0, p1, p2, p3, t) {
  const tan = evalCubicTangent(p0, p1, p2, p3, t);
  const len = Math.hypot(tan.x, tan.y) || 1;
  return { x: -tan.y / len, y: tan.x / len };
}

function buildSpacedThorns(curve, spacingPx = 31, maxThornSize = 15, phaseOffset = 0) {
  const sampleCount = 72;
  const points = [];
  const cumLengths = [0];
  let totalLen = 0;

  for (let i = 0; i <= sampleCount; i++) {
    const pt = evalCubicBezier(curve.p0, curve.p1, curve.p2, curve.p3, i / sampleCount);
    points.push(pt);
    if (i > 0) {
      totalLen += Math.hypot(pt.x - points[i - 1].x, pt.y - points[i - 1].y);
      cumLengths.push(totalLen);
    }
  }

  const thorns = [];
  let nextDist = 24;
  let sideToggle = phaseOffset % 2 === 0 ? 1 : -1;

  for (let i = 1; i < sampleCount; i++) {
    if (cumLengths[i] >= nextDist && cumLengths[i] <= totalLen - 16) {
      const t = i / sampleCount;
      const taperScale = 0.78 + 0.32 * Math.sin(t * Math.PI);
      thorns.push({
        t,
        side: sideToggle,
        size: Math.round(maxThornSize * taperScale)
      });
      sideToggle *= -1;
      nextDist = cumLengths[i] + spacingPx;
    }
  }
  return thorns;
}

/**
 * Draws one of 3 sharp pointed faceted leaves at the rose base.
 */
function drawFacetedPointedLeaf(ctx, x, y, length, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const grad = ctx.createLinearGradient(0, 0, length, 0);
  grad.addColorStop(0, '#040b1a');
  grad.addColorStop(0.48, '#0f296e');
  grad.addColorStop(0.88, '#1d4ed8');
  grad.addColorStop(1, '#38bdf8');

  ctx.fillStyle = grad;
  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 1.15;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length * 0.28, -length * 0.22);
  ctx.lineTo(length * 0.62, -length * 0.16);
  ctx.lineTo(length, 0);
  ctx.lineTo(length * 0.62, length * 0.16);
  ctx.lineTo(length * 0.28, length * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sharp angular internal leaf ridge
  ctx.strokeStyle = 'rgba(224, 242, 254, 0.58)';
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(length * 0.9, 0);
  ctx.moveTo(length * 0.28, -length * 0.22);
  ctx.lineTo(length * 0.42, 0);
  ctx.lineTo(length * 0.28, length * 0.22);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a faceted polygonal rose petal with sharp crystalline internal facet lines
 * and luminous #7dd3fc / #e0f2fe rim highlights.
 */
function drawFacetedPolygonPetal(ctx, radius, layerProgress, angleRad, facetSkew = 1) {
  const w = radius * (0.58 + (1 - layerProgress) * 0.22);
  const h = radius * (0.96 + (1 - layerProgress) * 0.12);

  ctx.save();
  ctx.rotate(angleRad);

  ctx.shadowColor = 'rgba(2, 6, 23, 0.88)';
  ctx.shadowBlur = 7;

  const grad = ctx.createLinearGradient(0, 0, facetSkew * w * 0.35, -h);
  grad.addColorStop(0, '#040b1a');
  grad.addColorStop(0.32, '#0f296e');
  grad.addColorStop(0.68, '#1d4ed8');
  grad.addColorStop(0.92, '#38bdf8');
  grad.addColorStop(1, '#e0f2fe');

  ctx.fillStyle = grad;

  // Angular polygonal faceted petal silhouette
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(-w * 0.78, -h * 0.26);
  ctx.lineTo(-w * 0.94, -h * 0.68);
  ctx.lineTo(-w * 0.36, -h * 0.98);
  ctx.lineTo(0, -h * 0.88);
  ctx.lineTo(w * 0.38, -h * 0.98);
  ctx.lineTo(w * 0.94, -h * 0.66);
  ctx.lineTo(w * 0.76, -h * 0.24);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = layerProgress > 0.65 ? '#e0f2fe' : '#7dd3fc';
  ctx.lineWidth = layerProgress > 0.65 ? 1.25 : 1.05;
  ctx.stroke();

  // Sharp internal crystalline facet planes
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.45)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-w * 0.36, -h * 0.96);
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.38, -h * 0.96);
  ctx.moveTo(-w * 0.76, -h * 0.28);
  ctx.lineTo(0, -h * 0.86);
  ctx.lineTo(w * 0.74, -h * 0.26);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a Táctico Faceted Geometric Blue Rose (polygonal petals + 3 pointed leaves + dark hex/pentagon core).
 */
function drawFacetedBlueRose(ctx, cx, cy, scaleRadius, seedOffset = 0) {
  ctx.save();
  ctx.translate(cx, cy);

  // Subtle cyan crystal glow halo behind the faceted rose
  const halo = ctx.createRadialGradient(0, 0, scaleRadius * 0.14, 0, 0, scaleRadius * 1.45);
  halo.addColorStop(0, 'rgba(56, 189, 248, 0.26)');
  halo.addColorStop(0.55, 'rgba(29, 78, 216, 0.15)');
  halo.addColorStop(1, 'rgba(3, 6, 15, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, scaleRadius * 1.45, 0, Math.PI * 2);
  ctx.fill();

  // 3 pointed jagged leaves anchored at the rose base
  drawFacetedPointedLeaf(ctx, 0, scaleRadius * 0.16, scaleRadius * 1.28, Math.PI * 0.52 + seedOffset * 0.2);
  drawFacetedPointedLeaf(ctx, -scaleRadius * 0.12, scaleRadius * 0.12, scaleRadius * 1.18, Math.PI * 0.78 + seedOffset * 0.2);
  drawFacetedPointedLeaf(ctx, scaleRadius * 0.12, scaleRadius * 0.12, scaleRadius * 1.18, Math.PI * 0.26 + seedOffset * 0.2);

  // Faceted concentric petal rings (outer -> middle -> inner -> geometric inner petals)
  const rings = [
    { count: 6, radiusRatio: 0.98, offsetRatio: 0.22, progress: 0.18, rotBias: 0.0 },
    { count: 6, radiusRatio: 0.76, offsetRatio: 0.17, progress: 0.48, rotBias: 0.52 },
    { count: 5, radiusRatio: 0.54, offsetRatio: 0.11, progress: 0.76, rotBias: 0.25 }
  ];

  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const a = (i / ring.count) * Math.PI * 2 + ring.rotBias + seedOffset;
      const dist = scaleRadius * ring.offsetRatio;
      ctx.save();
      ctx.translate(Math.cos(a) * dist, Math.sin(a) * dist);
      drawFacetedPolygonPetal(
        ctx,
        scaleRadius * ring.radiusRatio,
        ring.progress,
        a + Math.PI / 2,
        i % 2 === 0 ? 1 : -1
      );
      ctx.restore();
    }
  }

  // Dark hexagonal/pentagonal geometric core crystal rimmed in #00f0ff
  const coreRadius = scaleRadius * 0.26;
  ctx.fillStyle = '#030816';
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seedOffset;
    const vx = Math.cos(a) * coreRadius;
    const vy = Math.sin(a) * coreRadius;
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner rotated dark pentagon core facet
  const innerR = coreRadius * 0.58;
  ctx.fillStyle = '#020617';
  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + seedOffset;
    const vx = Math.cos(a) * innerR;
    const vy = Math.sin(a) * innerR;
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a faceted geometric Azul Abisal Crown above principal roses.
 */
function drawGeometricCrown(ctx, cx, cy, scale = 1, tiltRad = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tiltRad);
  ctx.scale(scale, scale);

  const goldGrad = ctx.createLinearGradient(-38, 22, 38, -28);
  goldGrad.addColorStop(0, '#b45309');
  goldGrad.addColorStop(0.35, '#eab308');
  goldGrad.addColorStop(0.7, '#fde047');
  goldGrad.addColorStop(1, '#ca8a04');

  ctx.shadowColor = 'rgba(234, 179, 8, 0.5)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(234, 179, 8, 0.2)';
  ctx.strokeStyle = goldGrad;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'miter';

  // Faceted angular geometric crown spires
  ctx.beginPath();
  ctx.moveTo(-36, 16);
  ctx.lineTo(-44, -12);
  ctx.lineTo(-22, 2);
  ctx.lineTo(-14, -22);
  ctx.lineTo(-4, -2);
  ctx.lineTo(0, -30);
  ctx.lineTo(4, -2);
  ctx.lineTo(14, -22);
  ctx.lineTo(22, 2);
  ctx.lineTo(44, -12);
  ctx.lineTo(36, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sharp faceted gold base bar
  ctx.fillStyle = goldGrad;
  ctx.fillRect(-35, 19, 70, 6);

  // Cyan diamond shard in the center spire
  ctx.shadowColor = 'rgba(0, 240, 255, 0.85)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#00f0ff';
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(5.5, -1.5);
  ctx.lineTo(0, 8);
  ctx.lineTo(-5.5, -1.5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draws double-line luminous cyan tattoo vines (#040b1a inner channel, twin bright
 * #38bdf8 / #7dd3fc parallel lines) with hollow sharp triangular thorns.
 */
function drawDoubleCyanThornyVine(ctx, curve) {
  const { p0, p1, p2, p3, halfSpread = 2.4, thorns = [] } = curve;

  // Hollow sharp triangular thorns with bright cyan perimeter stroke (#38bdf8 / #e0f2fe)
  for (const th of thorns) {
    const pt = evalCubicBezier(p0, p1, p2, p3, th.t);
    const tan = evalCubicTangent(p0, p1, p2, p3, th.t);
    const tanAngle = Math.atan2(tan.y, tan.x);
    const normAngle = tanAngle + th.side * (Math.PI / 2 - 0.34);
    const len = th.size;

    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(normAngle);

    // Hollow dark core matching #03060f + bright sharp cyan border
    ctx.fillStyle = '#03060f';
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(-3.6, -3.4);
    ctx.lineTo(len, 0);
    ctx.lineTo(3.6, 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Specular pinpoint on thorn tip
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.arc(len, 0, 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const segs = 40;
  const upperPts = [];
  const lowerPts = [];
  const centerPts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const pt = evalCubicBezier(p0, p1, p2, p3, t);
    const n = evalCubicNormal(p0, p1, p2, p3, t);
    const taper = halfSpread * (1 - t * 0.42);
    centerPts.push(pt);
    upperPts.push({ x: pt.x + n.x * taper, y: pt.y + n.y * taper });
    lowerPts.push({ x: pt.x - n.x * taper, y: pt.y - n.y * taper });
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Inner dark cobalt core track separating the double cyan lines
  ctx.strokeStyle = '#0b1c47';
  ctx.lineWidth = halfSpread * 2 + 1.2;
  ctx.beginPath();
  ctx.moveTo(centerPts[0].x, centerPts[0].y);
  for (let i = 1; i <= segs; i++) ctx.lineTo(centerPts[i].x, centerPts[i].y);
  ctx.stroke();

  // First luminous cyan twin line
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(upperPts[0].x, upperPts[0].y);
  for (let i = 1; i <= segs; i++) ctx.lineTo(upperPts[i].x, upperPts[i].y);
  ctx.stroke();

  // Second luminous cyan twin line
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.85)';
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.moveTo(lowerPts[0].x, lowerPts[0].y);
  for (let i = 1; i <= segs; i++) ctx.lineTo(lowerPts[i].x, lowerPts[i].y);
  ctx.stroke();
}

function buildCornerCurves(w, h) {
  const sX = Math.min(w * 0.34, 430);
  const sY = Math.min(h * 0.42, 340);
  const midX = w * 0.51;

  const rawStems = [
    {
      p0: { x: Math.min(w * 0.085, 118), y: Math.min(h * 0.13, 108) },
      p1: { x: w * 0.32, y: 18 },
      p2: { x: w * 0.68, y: 74 },
      p3: { x: w - Math.min(w * 0.08, 112), y: Math.min(h * 0.12, 102) },
      halfSpread: 2.6,
      spacing: 30,
      thornSize: 13,
      phase: 0
    },
    {
      p0: { x: -16, y: 18 },
      p1: { x: w * 0.38, y: 86 },
      p2: { x: w * 0.64, y: 10 },
      p3: { x: w + 16, y: 26 },
      halfSpread: 2.0,
      spacing: 32,
      thornSize: 11,
      phase: 1
    },
    {
      p0: { x: Math.min(w * 0.08, 110), y: h - Math.min(h * 0.12, 102) },
      p1: { x: w * 0.34, y: h - 22 },
      p2: { x: w * 0.66, y: h - 76 },
      p3: { x: w - Math.min(w * 0.09, 122), y: h - Math.min(h * 0.135, 112) },
      halfSpread: 2.6,
      spacing: 30,
      thornSize: 13,
      phase: 1
    },
    {
      p0: { x: -16, y: h - 24 },
      p1: { x: w * 0.36, y: h - 84 },
      p2: { x: w * 0.66, y: h - 14 },
      p3: { x: w + 16, y: h - 18 },
      halfSpread: 2.0,
      spacing: 32,
      thornSize: 11,
      phase: 0
    },
    {
      p0: { x: 24, y: -12 },
      p1: { x: 64, y: h * 0.34 },
      p2: { x: 14, y: h * 0.66 },
      p3: { x: 46, y: h + 14 },
      halfSpread: 2.4,
      spacing: 29,
      thornSize: 13,
      phase: 0
    },
    {
      p0: { x: Math.min(w * 0.085, 118), y: Math.min(h * 0.13, 108) },
      p1: { x: 14, y: h * 0.38 },
      p2: { x: 74, y: h * 0.62 },
      p3: { x: Math.min(w * 0.08, 110), y: h - Math.min(h * 0.12, 102) },
      halfSpread: 1.9,
      spacing: 33,
      thornSize: 11,
      phase: 1
    },
    {
      p0: { x: w - 24, y: -12 },
      p1: { x: w - 66, y: h * 0.35 },
      p2: { x: w - 16, y: h * 0.68 },
      p3: { x: w - 44, y: h + 14 },
      halfSpread: 2.4,
      spacing: 29,
      thornSize: 13,
      phase: 1
    },
    {
      p0: { x: w - Math.min(w * 0.08, 112), y: Math.min(h * 0.12, 102) },
      p1: { x: w - 16, y: h * 0.36 },
      p2: { x: w - 76, y: h * 0.64 },
      p3: { x: w - Math.min(w * 0.09, 122), y: h - Math.min(h * 0.135, 112) },
      halfSpread: 1.9,
      spacing: 33,
      thornSize: 11,
      phase: 0
    },
    {
      p0: { x: midX - 28, y: -10 },
      p1: { x: midX + 36, y: h * 0.34 },
      p2: { x: midX - 38, y: h * 0.66 },
      p3: { x: midX + 24, y: h + 12 },
      halfSpread: 2.1,
      spacing: 31,
      thornSize: 12,
      phase: 0
    },
    {
      p0: { x: midX + 26, y: -10 },
      p1: { x: midX - 34, y: h * 0.34 },
      p2: { x: midX + 36, y: h * 0.66 },
      p3: { x: midX - 22, y: h + 12 },
      halfSpread: 1.7,
      spacing: 34,
      thornSize: 10,
      phase: 1
    },
    {
      p0: { x: -16, y: 18 },
      p1: { x: sX * 0.32, y: 38 },
      p2: { x: sX * 0.56, y: sY * 0.54 },
      p3: { x: sX * 0.92, y: sY * 0.72 },
      halfSpread: 2.4,
      spacing: 29,
      thornSize: 12,
      phase: 0
    },
    {
      p0: { x: w + 16, y: 26 },
      p1: { x: w - sX * 0.32, y: 42 },
      p2: { x: w - sX * 0.55, y: sY * 0.52 },
      p3: { x: w - sX * 0.88, y: sY * 0.68 },
      halfSpread: 2.4,
      spacing: 29,
      thornSize: 12,
      phase: 1
    },
    {
      p0: { x: -16, y: h - 24 },
      p1: { x: sX * 0.32, y: h - 42 },
      p2: { x: sX * 0.52, y: h - sY * 0.48 },
      p3: { x: sX * 0.86, y: h - sY * 0.64 },
      halfSpread: 2.4,
      spacing: 29,
      thornSize: 12,
      phase: 1
    },
    {
      p0: { x: w + 16, y: h - 18 },
      p1: { x: w - sX * 0.3, y: h - 38 },
      p2: { x: w - sX * 0.56, y: h - sY * 0.58 },
      p3: { x: w - sX * 0.94, y: h - sY * 0.74 },
      halfSpread: 2.4,
      spacing: 29,
      thornSize: 12,
      phase: 0
    }
  ];

  const stems = rawStems.map((s) => ({
    ...s,
    thorns: buildSpacedThorns(s, s.spacing, s.thornSize, s.phase)
  }));

  const tlRose = { x: Math.min(w * 0.085, 118), y: Math.min(h * 0.13, 108), r: 62, seed: 0.2 };
  const trRose = { x: w - Math.min(w * 0.08, 112), y: Math.min(h * 0.12, 102), r: 52, seed: 2.3 };

  return {
    stems,
    roses: [
      tlRose,
      { x: Math.min(w * 0.175, 224), y: Math.min(h * 0.09, 74), r: 36, seed: 1.4 },
      trRose,
      { x: Math.min(w * 0.08, 110), y: h - Math.min(h * 0.12, 102), r: 50, seed: 3.1 },
      { x: w - Math.min(w * 0.09, 122), y: h - Math.min(h * 0.135, 112), r: 64, seed: 0.9 },
      { x: w - Math.min(w * 0.18, 232), y: h - Math.min(h * 0.09, 76), r: 38, seed: 2.0 }
    ],
    crowns: [
      { x: tlRose.x + 28, y: Math.max(36, tlRose.y - 56), scale: 0.88, tilt: 0.34 },
      { x: trRose.x - 24, y: Math.max(34, trRose.y - 50), scale: 0.76, tilt: -0.34 }
    ]
  };
}

export function initLoginBackdropCanvas() {
  const canvas = document.getElementById('abyssal-login-backdrop');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const offscreen = document.createElement('canvas');
  const offCtx = offscreen.getContext('2d');
  const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');

  let width = window.innerWidth || 1280;
  let height = window.innerHeight || 720;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let scene = buildCornerCurves(width, height);

  const renderStaticBuffer = () => {
    width = window.innerWidth || 1280;
    height = window.innerHeight || 720;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;

    scene = buildCornerCurves(width, height);

    offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    offCtx.clearRect(0, 0, width, height);

    offCtx.globalAlpha = 0.82;
    for (const stem of scene.stems) {
      drawDoubleCyanThornyVine(offCtx, stem);
    }

    offCtx.globalAlpha = 0.9;
    for (const rose of scene.roses) {
      drawFacetedBlueRose(offCtx, rose.x, rose.y, rose.r, rose.seed);
    }

    offCtx.globalAlpha = 0.94;
    for (const crown of scene.crowns) {
      drawGeometricCrown(offCtx, crown.x, crown.y, crown.scale, crown.tilt);
    }

    offCtx.globalAlpha = 1;
  };

  const paintFrame = (tSec = 0) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreen, 0, 0);

    if (reducedMotionMq.matches) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([28, 195]);
    ctx.lineDashOffset = -tSec * 70;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
    ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
    ctx.shadowBlur = 9;
    ctx.lineWidth = 1.9;

    for (const stem of scene.stems) {
      ctx.beginPath();
      ctx.moveTo(stem.p0.x, stem.p0.y);
      ctx.bezierCurveTo(stem.p1.x, stem.p1.y, stem.p2.x, stem.p2.y, stem.p3.x, stem.p3.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const shouldRun = () =>
    document.body.classList.contains('auth-locked') &&
    !document.hidden &&
    !reducedMotionMq.matches;

  const stopLoop = () => {
    if (backdropRafId) {
      cancelAnimationFrame(backdropRafId);
      backdropRafId = null;
    }
  };

  const tick = (nowMs) => {
    if (!shouldRun()) {
      backdropRafId = null;
      return;
    }
    paintFrame(nowMs * 0.001);
    backdropRafId = requestAnimationFrame(tick);
  };

  const syncState = () => {
    if (!document.body.classList.contains('auth-locked')) {
      stopLoop();
      return;
    }
    if (reducedMotionMq.matches) {
      stopLoop();
      paintFrame(0);
      return;
    }
    if (!document.hidden && !backdropRafId) {
      backdropRafId = requestAnimationFrame(tick);
    } else if (document.hidden) {
      stopLoop();
    }
  };

  renderStaticBuffer();
  paintFrame(0);
  syncState();

  window.addEventListener(
    'resize',
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        renderStaticBuffer();
        paintFrame(performance.now() * 0.001);
      }, 90);
    },
    { passive: true }
  );

  document.addEventListener('visibilitychange', syncState);
  reducedMotionMq.addEventListener?.('change', syncState);

  const bodyObserver = new MutationObserver(() => syncState());
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
