/* ==========================================================================
   Stadium 3D WebGL Engine (Three.js + OrbitControls + GSAP)
   Next-Gen Night Stadium: LED Perimeter Boards, 4 Floodlight Towers with
   Volumetric Light Cones, Stadium Base Grid, Ultra-Crisp 512x160 Sprites,
   Dynamic Movement Tilt & 3-Beat Choreographed Set Pieces (Ghost Origin Ring +
   Ground Run Arrow -> Parabolic Ball Flight -> Smooth Broadcast Follow-Cam)
   ========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';
import {
  state,
  dom,
  getActiveFormationSetup,
  getActiveSetPiece
} from '../store/tacticalStore.js';
import { getTacticalLineRank, resolvePlayerIndex } from './pitchEngine.js';

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animationFrameId = null;
let resizeObserver = null;

let turfMesh = null;
let turfTexture = null;
let lastRenderedModality = null;
let pawnsGroup = null;
let linksGroup = null;
let ghostMarkersGroup = null;
let trailGroup = null;
let impactShockwavesGroup = null;
let ambientEnergyPoints = null;
let ambientEnergyVelocities = null;
let ambientEnergyTexture = null;
let ballAuraRing = null;
let ballMesh = null;
let ballShadowMesh = null;
let activeStepTimeline = null;
const pawnMap = new Map();

// Conversión del viewBox 2D (360 x 220) a coordenadas 3D (-36..+36 en X, -22..+22 en Z)
function toWorldX(x2d) {
  return (x2d - 180) * 0.2;
}

function toWorldZ(y2d) {
  return (y2d - 110) * 0.2;
}

function createPitchCanvasTexture(isFutsal) {
  const canvas = document.createElement('canvas');
  canvas.width = 1440;
  canvas.height = 880;
  const ctx = canvas.getContext('2d');

  if (isFutsal) {
    // Duela sintética profesional azul zafiro / cobalto profundo para Futsal
    const grad = ctx.createRadialGradient(720, 440, 80, 720, 440, 820);
    grad.addColorStop(0, '#0f2952');
    grad.addColorStop(0.6, '#091936');
    grad.addColorStop(1, '#040b1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Textura sutil de tablones de parqué azul/cian
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 2;
    for (let y = 0; y < canvas.height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  } else {
    // Césped Broadcast con franjas alternas de corte esmeralda / bosque profundo
    const stripeCount = 16;
    const stripeW = canvas.width / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#064e3b' : '#043927';
      ctx.fillRect(i * stripeW, 0, stripeW, canvas.height);
    }

    // Viñeteado perimetral suave
    const vig = ctx.createRadialGradient(720, 440, 220, 720, 440, 860);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(2, 8, 6, 0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Líneas reglamentarias iluminadas con brillo neón
  ctx.strokeStyle = isFutsal ? '#38bdf8' : '#6ee7b7';
  ctx.shadowColor = isFutsal ? '#0284c7' : '#10b981';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 6;

  // Banda exterior (10..350 -> 40..1400, 10..210 -> 40..840)
  ctx.strokeRect(40, 40, 1360, 800);

  // Línea central y círculo central
  ctx.beginPath();
  ctx.moveTo(720, 40);
  ctx.lineTo(720, 840);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(720, 440, 128, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = isFutsal ? '#bae6fd' : '#a7f3d0';
  ctx.beginPath();
  ctx.arc(720, 440, 11, 0, Math.PI * 2);
  ctx.fill();

  // Áreas reglamentarias (Arcos de 6m y marcas para Futsal vs Rectángulos y medialuna para Campo)
  if (isFutsal) {
    ctx.beginPath();
    ctx.ellipse(40, 440, 176, 216, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(1400, 440, 176, 216, 0, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.stroke();
    [184, 288, 1152, 1256].forEach((dotX) => {
      ctx.fillStyle = '#bae6fd';
      ctx.beginPath();
      ctx.arc(dotX, 440, 9, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    ctx.strokeRect(40, 208, 200, 464);
    ctx.strokeRect(40, 328, 72, 224);
    ctx.strokeRect(1200, 208, 200, 464);
    ctx.strokeRect(1328, 328, 72, 224);
    ctx.beginPath();
    ctx.arc(172, 440, 96, -0.78, 0.78);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(1268, 440, 96, Math.PI - 0.78, Math.PI + 0.78);
    ctx.stroke();
  }

  // Líneas guía de tercios tácticos punteadas
  ctx.save();
  ctx.setLineDash([14, 16]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = isFutsal ? 'rgba(56, 189, 248, 0.28)' : 'rgba(110, 231, 183, 0.25)';
  ctx.beginPath();
  ctx.moveTo(492, 40);
  ctx.lineTo(492, 840);
  ctx.moveTo(944, 40);
  ctx.lineTo(944, 840);
  ctx.stroke();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function buildGoal3D(xPos, facingSign) {
  const goalGroup = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.24,
    metalness: 0.5,
    roughness: 0.25
  });

  const goalWidth = 8.4;
  const goalHeight = 2.9;
  const goalDepth = 2.2 * facingSign;

  const postGeo = new THREE.CylinderGeometry(0.14, 0.14, goalHeight, 14);
  const leftPost = new THREE.Mesh(postGeo, postMat);
  leftPost.position.set(xPos, goalHeight / 2, -goalWidth / 2);
  leftPost.castShadow = true;

  const rightPost = new THREE.Mesh(postGeo, postMat);
  rightPost.position.set(xPos, goalHeight / 2, goalWidth / 2);
  rightPost.castShadow = true;

  const crossbarGeo = new THREE.CylinderGeometry(0.14, 0.14, goalWidth + 0.2, 14);
  const crossbar = new THREE.Mesh(crossbarGeo, postMat);
  crossbar.rotation.x = Math.PI / 2;
  crossbar.position.set(xPos, goalHeight, 0);
  crossbar.castShadow = true;

  // Malla translúcida de la portería
  const netGeo = new THREE.BoxGeometry(Math.abs(goalDepth), goalHeight, goalWidth);
  const netMat = new THREE.MeshBasicMaterial({
    color: 0x94a3b8,
    wireframe: true,
    transparent: true,
    opacity: 0.24
  });
  const netMesh = new THREE.Mesh(netGeo, netMat);
  netMesh.position.set(xPos + goalDepth / 2, goalHeight / 2, 0);

  goalGroup.add(leftPost, rightPost, crossbar, netMesh);
  return goalGroup;
}

/**
 * Construye vallas perimetrales LED oscuras con tira superior neón alrededor de la cancha
 */
function buildPerimeterLedBoards() {
  const boardsGroup = new THREE.Group();
  const boardBodyMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.45,
    metalness: 0.6
  });
  const neonCyanMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.92
  });
  const neonVioletMat = new THREE.MeshBasicMaterial({
    color: 0x2563eb,
    transparent: true,
    opacity: 0.9
  });

  // Vallas longitudinales (Norte y Sur: Z = -23.4 y Z = +23.4)
  [-23.4, 23.4].forEach((zPos, idx) => {
    const wallGeo = new THREE.BoxGeometry(73.6, 1.05, 0.32);
    const wallMesh = new THREE.Mesh(wallGeo, boardBodyMat);
    wallMesh.position.set(0, 0.52, zPos);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    boardsGroup.add(wallMesh);

    const stripGeo = new THREE.BoxGeometry(73.4, 0.14, 0.36);
    const stripMesh = new THREE.Mesh(stripGeo, idx === 0 ? neonCyanMat : neonVioletMat);
    stripMesh.position.set(0, 1.02, zPos);
    boardsGroup.add(stripMesh);
  });

  // Vallas de fondo divididas a los lados de cada portería (X = -37.4 y X = +37.4)
  [-37.4, 37.4].forEach((xPos) => {
    [-14.2, 14.2].forEach((zOffset, sideIdx) => {
      const segGeo = new THREE.BoxGeometry(0.32, 1.05, 16.4);
      const segMesh = new THREE.Mesh(segGeo, boardBodyMat);
      segMesh.position.set(xPos, 0.52, zOffset);
      segMesh.castShadow = true;
      boardsGroup.add(segMesh);

      const stripGeo = new THREE.BoxGeometry(0.36, 0.14, 16.2);
      const stripMesh = new THREE.Mesh(stripGeo, sideIdx === 0 ? neonVioletMat : neonCyanMat);
      stripMesh.position.set(xPos, 1.02, zOffset);
      boardsGroup.add(stripMesh);
    });
  });

  return boardsGroup;
}

/**
 * Construye las 4 torres de reflectores en las esquinas con SpotLight y conos de luz volumétrica
 */
function buildCornerFloodlightTowers() {
  const towersGroup = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.75,
    roughness: 0.3
  });
  const headFrameMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.8,
    roughness: 0.25
  });
  const lampEmissiveMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe
  });
  const haloSpriteMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const volumetricConeMat = new THREE.MeshBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.055,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const corners = [
    { x: -41, z: -26.5 },
    { x: 41, z: -26.5 },
    { x: -41, z: 26.5 },
    { x: 41, z: 26.5 }
  ];

  const towerHeight = 25;

  corners.forEach(({ x, z }) => {
    const tower = new THREE.Group();

    // Mástil principal
    const poleGeo = new THREE.CylinderGeometry(0.32, 0.55, towerHeight, 14);
    const poleMesh = new THREE.Mesh(poleGeo, poleMat);
    poleMesh.position.set(x, towerHeight / 2, z);
    tower.add(poleMesh);

    // Panel de reflectores en la cima orientado hacia el centro (0, 0, 0)
    const headGroup = new THREE.Group();
    headGroup.position.set(x, towerHeight, z);
    headGroup.lookAt(0, 2, 0);

    const frameGeo = new THREE.BoxGeometry(4.2, 2.1, 0.45);
    const frameMesh = new THREE.Mesh(frameGeo, headFrameMat);
    headGroup.add(frameMesh);

    const lampGeo = new THREE.PlaneGeometry(3.7, 1.65);
    const lampMesh = new THREE.Mesh(lampGeo, lampEmissiveMat);
    lampMesh.position.z = 0.25;
    headGroup.add(lampMesh);

    // Halo resplandeciente alrededor del panel LED de la torre
    const haloGeo = new THREE.RingGeometry(1.9, 3.3, 24);
    const haloMesh = new THREE.Mesh(haloGeo, haloSpriteMat);
    haloMesh.position.z = 0.22;
    headGroup.add(haloMesh);

    tower.add(headGroup);

    // Cono translúcido de luz volumétrica proyectado hacia la cancha
    const targetPoint = new THREE.Vector3(x * 0.22, 0, z * 0.22);
    const topPoint = new THREE.Vector3(x, towerHeight - 0.4, z);
    const beamDist = topPoint.distanceTo(targetPoint);
    const coneGeo = new THREE.ConeGeometry(13.5, beamDist, 24, 1, true);
    // Mover pivote del cono para que nazca en el reflector y se abra hacia el suelo
    coneGeo.translate(0, -beamDist / 2, 0);
    coneGeo.rotateX(-Math.PI / 2);

    const coneMesh = new THREE.Mesh(coneGeo, volumetricConeMat);
    coneMesh.position.copy(topPoint);
    coneMesh.lookAt(targetPoint);
    tower.add(coneMesh);

    // SpotLight real por esquina para brillo especular sobre fichas y césped
    const spot = new THREE.SpotLight(0xe0f2fe, 0.65, 115, Math.PI / 4.2, 0.55, 1);
    spot.position.copy(topPoint);
    spot.target.position.copy(targetPoint);
    tower.add(spot);
    tower.add(spot.target);

    towersGroup.add(tower);
  });

  return towersGroup;
}

/**
 * Etiqueta Sprite HD (512x160) ultra nítida con dorsal y nombre/rol (#7 · Lucas)
 */
function createPlayerLabelSprite(dorsal, roleText, isGk) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  // Sombra exterior suave de la cápsula
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;

  // Fondo cápsula holográfica de alto contraste
  const bgGrad = ctx.createLinearGradient(0, 16, 0, 144);
  if (isGk) {
    bgGrad.addColorStop(0, 'rgba(6, 95, 70, 0.96)');
    bgGrad.addColorStop(1, 'rgba(4, 47, 46, 0.96)');
  } else {
    bgGrad.addColorStop(0, 'rgba(23, 28, 48, 0.96)');
    bgGrad.addColorStop(1, 'rgba(12, 15, 29, 0.96)');
  }
  ctx.fillStyle = bgGrad;
  ctx.strokeStyle = isGk ? '#34d399' : '#38bdf8';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(18, 20, 476, 120, 56);
  ctx.fill();
  ctx.restore();
  ctx.stroke();

  // Dorsal destacado + nombre/rol con tipografía HD nítida
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 46px "Plus Jakarta Sans", "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cleanLabel = `#${dorsal} · ${roleText}`;
  ctx.fillText(cleanLabel.slice(0, 19), 256, 81);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  const spriteMat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(6.1, 1.9, 1);
  sprite.position.set(0, 3.25, 0);
  return sprite;
}

function buildHoloFootAura3D(isFeatured = false) {
  const auraGroup = new THREE.Group();
  auraGroup.position.y = 0.06;

  // Anillo interior fino de Metavision
  const innerGeo = new THREE.RingGeometry(1.36, 1.44, 40);
  innerGeo.rotateX(-Math.PI / 2);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  auraGroup.add(new THREE.Mesh(innerGeo, innerMat));

  // 4 arcos segmentados exteriores cian eléctrico (rotan en tiempo real)
  const segMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  for (let i = 0; i < 4; i++) {
    const startAngle = i * (Math.PI / 2) + 0.14;
    const arcGeo = new THREE.RingGeometry(1.56, 1.76, 14, 1, startAngle, Math.PI * 0.34);
    arcGeo.rotateX(-Math.PI / 2);
    auraGroup.add(new THREE.Mesh(arcGeo, segMat));
  }

  // 4 marcas cardinales luminosas de mira óptica
  const tickMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const tickGeo = new THREE.BoxGeometry(0.42, 0.03, 0.08);
  [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].forEach((angle) => {
    const tick = new THREE.Mesh(tickGeo, tickMat);
    const radius = 1.92;
    tick.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    tick.rotation.y = -angle;
    auraGroup.add(tick);
  });

  auraGroup.visible = Boolean(isFeatured);
  return auraGroup;
}

function createPlayerPawn3D(dorsal, roleText, isGk, isActor) {
  const group = new THREE.Group();

  // Anillo neón en la base sobre el césped
  const ringGeo = new THREE.RingGeometry(0.95, 1.34, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isActor ? 0x00f0ff : isGk ? 0x10b981 : 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.04;
  group.add(ringMesh);

  // Anillo holográfico Metavision giratorio bajo los pies del jugador destacado
  const holoAuraGroup = buildHoloFootAura3D(isActor);
  group.add(holoAuraGroup);

  // Sub-grupo del cuerpo físico que se inclina dinámicamente en la dirección de carrera
  const tiltBodyGroup = new THREE.Group();

  const bodyGeo = new THREE.CylinderGeometry(0.62, 0.9, 1.75, 24);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isGk ? 0x10b981 : isActor ? 0x0284c7 : 0x1d4ed8,
    emissive: isGk ? 0x059669 : isActor ? 0x00f0ff : 0x1e40af,
    emissiveIntensity: isActor ? 0.62 : 0.48,
    metalness: 0.35,
    roughness: 0.24
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.9;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  tiltBodyGroup.add(bodyMesh);

  // Esfera superior del peón
  const headGeo = new THREE.SphereGeometry(0.54, 20, 20);
  const headMesh = new THREE.Mesh(headGeo, bodyMat);
  headMesh.position.y = 2.02;
  headMesh.castShadow = true;
  tiltBodyGroup.add(headMesh);

  group.add(tiltBodyGroup);

  // Sprite flotante HD con dorsal y nombre
  const labelSprite = createPlayerLabelSprite(dorsal, roleText, isGk);
  group.add(labelSprite);

  group.userData = {
    dorsal,
    roleText,
    isGk,
    isActor,
    ringMat,
    holoAuraGroup,
    bodyMat,
    tiltBodyGroup,
    labelSprite
  };
  return group;
}

/**
 * Crea un anillo fantasma en la posición de origen + línea/flecha en el suelo hacia el destino
 */
function createGhostOriginAndRunArrow(startX, startZ, endX, endZ) {
  const markerGroup = new THREE.Group();

  // 1. Anillo fantasma pulsante donde inició el desmarque
  const ghostRingGeo = new THREE.RingGeometry(0.75, 1.18, 28);
  const ghostRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72
  });
  const ghostRing = new THREE.Mesh(ghostRingGeo, ghostRingMat);
  ghostRing.rotation.x = -Math.PI / 2;
  ghostRing.position.set(startX, 0.05, startZ);
  markerGroup.add(ghostRing);

  // Pulso sutil en el anillo fantasma
  gsap.fromTo(
    ghostRing.scale,
    { x: 0.85, y: 0.85, z: 1 },
    {
      x: 1.16,
      y: 1.16,
      z: 1,
      duration: 0.75,
      repeat: 2,
      yoyo: true,
      ease: 'sine.inOut'
    }
  );

  // 2. Línea luminosa al ras del suelo + punta de flecha indicando la carrera
  const dist = Math.hypot(endX - startX, endZ - startZ);
  if (dist > 0.8) {
    const pts = [
      new THREE.Vector3(startX, 0.06, startZ),
      new THREE.Vector3(endX, 0.06, endZ)
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.82
    });
    markerGroup.add(new THREE.Line(lineGeo, lineMat));

    // Punta de flecha cónica a ras de césped orientada hacia el destino
    const arrowGeo = new THREE.ConeGeometry(0.45, 1.1, 14);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9
    });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.position.set(endX, 0.08, endZ);
    arrowMesh.lookAt(endX + (endX - startX), 0.08, endZ + (endZ - startZ));
    markerGroup.add(arrowMesh);
  }

  return markerGroup;
}

function buildAmbientEnergyParticles3D() {
  const particleCanvas = document.createElement('canvas');
  particleCanvas.width = 64;
  particleCanvas.height = 64;
  const pCtx = particleCanvas.getContext('2d');
  const grad = pCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(224, 242, 254, 1)');
  grad.addColorStop(0.32, 'rgba(0, 240, 255, 0.85)');
  grad.addColorStop(0.68, 'rgba(29, 78, 216, 0.35)');
  grad.addColorStop(1, 'rgba(29, 78, 216, 0)');
  pCtx.fillStyle = grad;
  pCtx.fillRect(0, 0, 64, 64);

  ambientEnergyTexture = new THREE.CanvasTexture(particleCanvas);
  ambientEnergyTexture.needsUpdate = true;

  const count = 96;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const meta = [];
  const cyanCol = new THREE.Color(0x00f0ff);
  const cobaltCol = new THREE.Color(0x38bdf8);
  const deepBlueCol = new THREE.Color(0x2563eb);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 76;
    positions[i * 3 + 1] = 0.4 + Math.random() * 9.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 48;

    const paletteCol = i % 3 === 0 ? cyanCol : i % 3 === 1 ? cobaltCol : deepBlueCol;
    colors[i * 3] = paletteCol.r;
    colors[i * 3 + 1] = paletteCol.g;
    colors[i * 3 + 2] = paletteCol.b;

    meta.push({
      vy: 0.008 + Math.random() * 0.016,
      phase: Math.random() * Math.PI * 2,
      sway: 0.005 + Math.random() * 0.007
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.65,
    map: ambientEnergyTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  ambientEnergyVelocities = meta;
  return new THREE.Points(geo, mat);
}

function initStadium3DScene() {
  const container = dom.stadium3dContainer;
  if (!container) return;

  const width = container.clientWidth || 720;
  const height = container.clientHeight || 430;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060811);
  scene.fog = new THREE.FogExp2(0x060811, 0.0055);

  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 360);
  camera.position.set(0, 39, 50);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;

  container.replaceChildren(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2.12;
  controls.minDistance = 16;
  controls.maxDistance = 98;
  controls.target.set(0, 0, 0);

  // Iluminación de estadio nocturno
  const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.74);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x064e3b, 0.58);
  scene.add(hemiLight);

  const floodLight1 = new THREE.DirectionalLight(0xf8fafc, 1.45);
  floodLight1.position.set(34, 48, 28);
  floodLight1.castShadow = true;
  floodLight1.shadow.mapSize.width = 1024;
  floodLight1.shadow.mapSize.height = 1024;
  floodLight1.shadow.camera.near = 10;
  floodLight1.shadow.camera.far = 135;
  floodLight1.shadow.camera.left = -44;
  floodLight1.shadow.camera.right = 44;
  floodLight1.shadow.camera.top = 28;
  floodLight1.shadow.camera.bottom = -28;
  scene.add(floodLight1);

  const floodLight2 = new THREE.DirectionalLight(0x38bdf8, 0.65);
  floodLight2.position.set(-36, 42, -26);
  scene.add(floodLight2);

  // Plataforma arquitectónica base del estadio + Cuadrícula táctica sutil
  const surroundGeo = new THREE.BoxGeometry(128, 0.8, 86);
  const surroundMat = new THREE.MeshStandardMaterial({
    color: 0x080b16,
    roughness: 0.88,
    metalness: 0.18
  });
  const surroundMesh = new THREE.Mesh(surroundGeo, surroundMat);
  surroundMesh.position.y = -0.44;
  surroundMesh.receiveShadow = true;
  scene.add(surroundMesh);

  const stadiumGrid = new THREE.GridHelper(126, 36, 0x38bdf8, 0x1e1b4b);
  stadiumGrid.position.y = -0.03;
  if (Array.isArray(stadiumGrid.material)) {
    stadiumGrid.material.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.16;
    });
  } else {
    stadiumGrid.material.transparent = true;
    stadiumGrid.material.opacity = 0.16;
  }
  scene.add(stadiumGrid);

  // Superficie de juego 3D (72m x 44m proporcional a 360x220)
  const isFutsal = state.modality === 'Futsal';
  turfTexture = createPitchCanvasTexture(isFutsal);
  lastRenderedModality = state.modality;

  const turfGeo = new THREE.PlaneGeometry(72, 44);
  const turfMat = new THREE.MeshStandardMaterial({
    map: turfTexture,
    roughness: isFutsal ? 0.35 : 0.78,
    metalness: isFutsal ? 0.18 : 0.05
  });
  turfMesh = new THREE.Mesh(turfGeo, turfMat);
  turfMesh.rotation.x = -Math.PI / 2;
  turfMesh.receiveShadow = true;
  scene.add(turfMesh);

  // Porterías 3D, Vallas LED perimetrales y 4 Torres de Reflectores con luz volumétrica
  scene.add(buildGoal3D(-34, -1));
  scene.add(buildGoal3D(34, 1));
  scene.add(buildPerimeterLedBoards());
  scene.add(buildCornerFloodlightTowers());

  // Partículas azules flotantes de energía Metavision sobre el césped nocturno
  ambientEnergyPoints = buildAmbientEnergyParticles3D();
  scene.add(ambientEnergyPoints);

  // Grupos dinámicos de peones, marcadores fantasma, estelas Kaiser Impact y ondas de impacto
  pawnsGroup = new THREE.Group();
  linksGroup = new THREE.Group();
  ghostMarkersGroup = new THREE.Group();
  trailGroup = new THREE.Group();
  impactShockwavesGroup = new THREE.Group();
  scene.add(linksGroup, ghostMarkersGroup, trailGroup, impactShockwavesGroup, pawnsGroup);

  // Balón 3D + Anillo de aura Kaiser Impact + Sombra proyectada en el suelo
  const ballGeo = new THREE.SphereGeometry(0.56, 24, 24);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0x00f0ff,
    emissiveIntensity: 0.38,
    roughness: 0.2,
    metalness: 0.26
  });
  ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.position.set(0, 0.56, 0);
  ballMesh.castShadow = true;
  ballMesh.visible = false;
  scene.add(ballMesh);

  const auraRingGeo = new THREE.RingGeometry(0.74, 1.04, 24);
  const auraRingMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  ballAuraRing = new THREE.Mesh(auraRingGeo, auraRingMat);
  ballAuraRing.visible = false;
  scene.add(ballAuraRing);

  const shadowGeo = new THREE.CircleGeometry(0.68, 24);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.55
  });
  ballShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  ballShadowMesh.rotation.x = -Math.PI / 2;
  ballShadowMesh.position.set(0, 0.03, 0);
  ballShadowMesh.visible = false;
  scene.add(ballShadowMesh);

  // ResizeObserver para adaptar WebGL automáticamente al expandir/redimensionar
  resizeObserver = new ResizeObserver(() => {
    if (!renderer || !camera || !dom.stadium3dContainer) return;
    const w = dom.stadium3dContainer.clientWidth || 720;
    const h = dom.stadium3dContainer.clientHeight || 430;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resizeObserver.observe(container);

  const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frameTick = 0;

  const renderLoop = () => {
    animationFrameId = requestAnimationFrame(renderLoop);
    if (document.hidden) return;

    if (!reducedMotionMq.matches) {
      frameTick += 0.016;
      // Girar anillos holográficos bajo los pies del jugador destacado
      pawnMap.forEach((pawn) => {
        const aura = pawn.userData?.holoAuraGroup;
        if (aura && aura.visible) {
          aura.rotation.y += 0.018;
        }
      });

      // Flotación suave de partículas azules sobre el estadio nocturno
      if (ambientEnergyPoints && ambientEnergyVelocities) {
        const posAttr = ambientEnergyPoints.geometry.getAttribute('position');
        const arr = posAttr.array;
        for (let i = 0; i < ambientEnergyVelocities.length; i++) {
          const m = ambientEnergyVelocities[i];
          const pyIdx = i * 3 + 1;
          const pxIdx = i * 3;
          arr[pyIdx] += m.vy;
          arr[pxIdx] += Math.sin(frameTick + m.phase) * m.sway;
          if (arr[pyIdx] > 10.2) {
            arr[pyIdx] = 0.35;
          }
        }
        posAttr.needsUpdate = true;
      }

      if (ballAuraRing && ballAuraRing.visible && camera) {
        ballAuraRing.lookAt(camera.position);
        ballAuraRing.rotation.z += 0.08;
      }
    }

    if (controls) controls.update();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  };
  renderLoop();
}

/**
 * Inclina dinámicamente el cuerpo de la ficha hacia su vector de movimiento y la desplaza con fluidez
 */
function movePawnWithDynamicTilt(pawn, targetX, targetZ, duration, delay, easeName) {
  const prevX = pawn.position.x;
  const prevZ = pawn.position.z;
  const dx = targetX - prevX;
  const dz = targetZ - prevZ;
  const moveDist = Math.hypot(dx, dz);

  const tiltBody = pawn.userData?.tiltBodyGroup;
  if (tiltBody && moveDist > 0.6) {
    const maxTilt = 0.24;
    const normX = dx / moveDist;
    const normZ = dz / moveDist;
    const tiltZ = -normX * Math.min(maxTilt, moveDist * 0.035);
    const tiltX = normZ * Math.min(maxTilt, moveDist * 0.035);

    gsap.to(tiltBody.rotation, {
      x: tiltX,
      z: tiltZ,
      duration: duration * 0.35,
      delay,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(tiltBody.rotation, {
          x: 0,
          z: 0,
          duration: duration * 0.65,
          ease: 'elastic.out(1, 0.6)'
        });
      }
    });
  }

  gsap.to(pawn.position, {
    x: targetX,
    y: 0,
    z: targetZ,
    duration,
    delay,
    ease: easeName,
    overwrite: 'auto'
  });
}

export function syncStadium3DScene(adjustedCoords = [], activeSetPiece = null) {
  if (!state.isStadium3DView || !scene || !pawnsGroup) return;

  // 1. Actualizar textura de césped o duela si cambió la modalidad
  if (lastRenderedModality !== state.modality && turfMesh) {
    const isFutsal = state.modality === 'Futsal';
    if (turfTexture) turfTexture.dispose();
    turfTexture = createPitchCanvasTexture(isFutsal);
    turfMesh.material.map = turfTexture;
    turfMesh.material.roughness = isFutsal ? 0.35 : 0.78;
    turfMesh.material.needsUpdate = true;
    lastRenderedModality = state.modality;
  }

  const activeSetup = getActiveFormationSetup();
  const coords =
    adjustedCoords.length > 0
      ? adjustedCoords
      : activeSetup.players.map((p) => ({ ...p, adjX: p.x, adjY: p.y, isActor: false }));

  const hasExportedLineup =
    state.exportedBoardLineup &&
    state.exportedBoardLineup.modality === state.modality &&
    state.exportedBoardLineup.formationIndex === state.formationIndex &&
    Array.isArray(state.exportedBoardLineup.starters);

  // Eliminar peones sobrantes si cambió de Fútbol 11 a Futsal
  while (pawnMap.size > coords.length) {
    const removeIdx = pawnMap.size - 1;
    const oldPawn = pawnMap.get(removeIdx);
    if (oldPawn) {
      pawnsGroup.remove(oldPawn);
    }
    pawnMap.delete(removeIdx);
  }

  if (ghostMarkersGroup) {
    ghostMarkersGroup.clear();
  }

  // Mapa de movimientos de jugada preparada para dibujar anillos fantasma de desmarque
  const actorOriginMap = new Map();
  if (activeSetPiece && Array.isArray(activeSetPiece.movements)) {
    activeSetPiece.movements.forEach((mv) => {
      const resolvedIdx = resolvePlayerIndex(mv.playerIndex, activeSetup.players.length);
      actorOriginMap.set(resolvedIdx, mv);
    });
  }

  // Jugador destacado para el anillo holográfico cian en Juego Libre si no hay actor activo de jugada
  const hasAnyActor = coords.some((c) => Boolean(c.isActor));
  let fallbackFeaturedIdx = -1;
  if (!hasAnyActor && coords.length > 0) {
    fallbackFeaturedIdx = coords.findIndex(
      (c) =>
        Number(c.num) === 10 ||
        /ENG|MCO|PIV|ALA|DEL/i.test(String(c.role || ''))
    );
    if (fallbackFeaturedIdx < 0) {
      fallbackFeaturedIdx = Math.max(0, Math.floor(coords.length / 2));
    }
  }

  coords.forEach((p, idx) => {
    const exportedSlot = hasExportedLineup ? state.exportedBoardLineup.starters[idx] : null;
    const hasExportedPlayer = Boolean(exportedSlot && exportedSlot.assigned && exportedSlot.playerId);
    const dorsal = hasExportedPlayer ? String(exportedSlot.jerseyNumber) : String(p.num);
    const roleLabel = hasExportedPlayer
      ? `${exportedSlot.name.split(' ')[0]} (${p.role})`
      : p.role;
    const isHighlighted = Boolean(p.isActor) || idx === fallbackFeaturedIdx;

    const wx = toWorldX(p.adjX ?? p.x);
    const wz = toWorldZ(p.adjY ?? p.y);
    const lineRank = getTacticalLineRank(p);

    let pawn = pawnMap.get(idx);
    if (!pawn) {
      pawn = createPlayerPawn3D(dorsal, roleLabel, Boolean(p.gk), isHighlighted);
      pawn.position.set(wx, 0, wz);
      pawnsGroup.add(pawn);
      pawnMap.set(idx, pawn);
    } else if (
      pawn.userData.dorsal !== dorsal ||
      pawn.userData.roleText !== roleLabel ||
      pawn.userData.isGk !== Boolean(p.gk)
    ) {
      const prevPos = pawn.position.clone();
      pawnsGroup.remove(pawn);
      pawn = createPlayerPawn3D(dorsal, roleLabel, Boolean(p.gk), isHighlighted);
      pawn.position.copy(prevPos);
      pawnsGroup.add(pawn);
      pawnMap.set(idx, pawn);
    } else {
      pawn.userData.isActor = isHighlighted;
      if (pawn.userData.holoAuraGroup) {
        pawn.userData.holoAuraGroup.visible = isHighlighted;
      }
      if (pawn.userData.ringMat) {
        pawn.userData.ringMat.color.setHex(
          isHighlighted ? 0x00f0ff : Boolean(p.gk) ? 0x10b981 : 0x38bdf8
        );
      }
      if (pawn.userData.bodyMat) {
        pawn.userData.bodyMat.emissive.setHex(
          Boolean(p.gk) ? 0x059669 : isHighlighted ? 0x00f0ff : 0x1e40af
        );
        pawn.userData.bodyMat.emissiveIntensity = isHighlighted ? 0.64 : 0.48;
      }
    }

    // Si es un actor de jugada preparada en desmarque (Paso >= 2), mostrar anillo fantasma en su origen y flecha
    const mv = actorOriginMap.get(idx);
    if (mv && state.setPieceStep >= 2 && ghostMarkersGroup) {
      const startWX = toWorldX(mv.startX);
      const startWZ = toWorldZ(mv.startY);
      const ghostMarker = createGhostOriginAndRunArrow(startWX, startWZ, wx, wz);
      ghostMarkersGroup.add(ghostMarker);
    }

    // En jugadas preparadas, Tiempo 1: el desmarque del receptor arranca de inmediato (delay 0)
    const moveDuration = activeSetPiece ? 0.86 : 0.88;
    const moveDelay = activeSetPiece ? 0 : lineRank * 0.06;
    const moveEase = activeSetPiece ? 'power2.out' : 'back.out(1.45)';

    movePawnWithDynamicTilt(pawn, wx, wz, moveDuration, moveDelay, moveEase);
  });

  // 2. Dibujar líneas de sinergia cuando está en Juego Libre
  linksGroup.clear();
  if (!activeSetPiece) {
    if (ballMesh) ballMesh.visible = false;
    if (ballAuraRing) ballAuraRing.visible = false;
    if (ballShadowMesh) ballShadowMesh.visible = false;
    if (trailGroup) trailGroup.clear();

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.48
    });

    (activeSetup.links || []).forEach(([fromIdx, toIdx]) => {
      const p1 = coords[fromIdx];
      const p2 = coords[toIdx];
      if (!p1 || !p2) return;
      const pts = [
        new THREE.Vector3(toWorldX(p1.adjX ?? p1.x), 0.08, toWorldZ(p1.adjY ?? p1.y)),
        new THREE.Vector3(toWorldX(p2.adjX ?? p2.x), 0.08, toWorldZ(p2.adjY ?? p2.y))
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      linksGroup.add(new THREE.Line(geo, lineMat));
    });
  }
}

/**
 * Destello radial cian eléctrico en el punto de llegada del balón (Kaiser Impact 3D)
 */
function spawnImpactFlash3D(x, z, isShot = false) {
  if (!impactShockwavesGroup) return;

  const flashContainer = new THREE.Group();
  flashContainer.position.set(x, 0.1, z);

  const ringGeo = new THREE.RingGeometry(0.45, 0.98, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  flashContainer.add(ringMesh);

  const coreGeo = new THREE.SphereGeometry(isShot ? 0.82 : 0.56, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.y = 0.42;
  flashContainer.add(coreMesh);

  impactShockwavesGroup.add(flashContainer);

  gsap.to(ringMesh.scale, {
    x: isShot ? 5.2 : 3.9,
    y: 1,
    z: isShot ? 5.2 : 3.9,
    duration: 0.56,
    ease: 'power2.out'
  });
  gsap.to(ringMat, {
    opacity: 0,
    duration: 0.56,
    ease: 'power2.out'
  });
  gsap.to(coreMesh.scale, {
    x: 2.4,
    y: 2.4,
    z: 2.4,
    duration: 0.36,
    ease: 'power2.out'
  });
  gsap.to(coreMat, {
    opacity: 0,
    duration: 0.38,
    ease: 'power2.out',
    onComplete: () => {
      impactShockwavesGroup?.remove(flashContainer);
      ringGeo.dispose();
      ringMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
    }
  });
}

/**
 * Secuencia coreografiada en 3 tiempos con GSAP Timeline por cada paso de jugada preparada:
 * 1) Desmarque previo del receptor con anillo fantasma en origen (0.0s -> 0.24s)
 * 2) Salida del pase/remate Kaiser Impact (estela cian eléctrico 3D + núcleo blanco + destello radial al llegar)
 * 3) Encuadre Follow-Cam suave y continuo sin tirones bruscos
 */
export function animateBall3DParabolic(fromPt2D, toPt2D, isElevatedPass = true, isShot = false) {
  if (!state.isStadium3DView || !scene || !ballMesh || !ballShadowMesh) return;

  if (activeStepTimeline) {
    activeStepTimeline.kill();
    activeStepTimeline = null;
  }

  const x1 = toWorldX(fromPt2D.x);
  const z1 = toWorldZ(fromPt2D.y);
  const x2 = toWorldX(toPt2D.x);
  const z2 = toWorldZ(toPt2D.y);
  const dist = Math.hypot(x2 - x1, z2 - z1);

  ballMesh.visible = true;
  ballShadowMesh.visible = true;
  if (ballAuraRing) ballAuraRing.visible = false;

  // Paso 1: Cobrador perfilado junto al balón antes del envío
  if (dist < 0.5) {
    ballMesh.position.set(x1, 0.56, z1);
    ballShadowMesh.position.set(x1, 0.03, z1);
    ballShadowMesh.scale.set(1, 1, 1);

    if (controls) {
      gsap.to(controls.target, {
        x: x1 * 0.3,
        y: 0,
        z: z1 * 0.3,
        duration: 0.95,
        ease: 'sine.inOut',
        overwrite: 'auto'
      });
    }
    return;
  }

  // Altura máxima de la parábola 3D
  const peakY = isShot
    ? Math.min(3.5, 1.25 + dist * 0.11)
    : isElevatedPass
      ? Math.min(6.6, 2.3 + dist * 0.18)
      : 1.15;

  // Estela parabólica 3D luminosa "Kaiser Impact" (#00f0ff + núcleo blanco plasma)
  if (trailGroup) {
    trailGroup.clear();
  }
  const midX = (x1 + x2) / 2;
  const midZ = (z1 + z2) / 2;
  const curve3D = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(x1, 0.56, z1),
    new THREE.Vector3(midX, peakY + 0.85, midZ),
    new THREE.Vector3(x2, 0.56, z2)
  );

  const outerGeo = new THREE.TubeGeometry(curve3D, 44, isShot ? 0.19 : 0.13, 8, false);
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const coreGeo = new THREE.TubeGeometry(curve3D, 44, isShot ? 0.068 : 0.045, 6, false);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  if (trailGroup) {
    trailGroup.add(new THREE.Mesh(outerGeo, outerMat), new THREE.Mesh(coreGeo, coreMat));
  }

  // Posicionar balón en el punto de salida mientras el receptor inicia su desmarque (Tiempo 1)
  ballMesh.position.set(x1, 0.56, z1);
  ballShadowMesh.position.set(x1, 0.03, z1);

  const flightProxy = { t: 0 };
  activeStepTimeline = gsap.timeline();

  // Tiempo 2 (t = 0.22s): El balón sale con rastro Kaiser Impact y destello radial en recepción
  activeStepTimeline.to(
    [outerMat, coreMat],
    {
      opacity: (i) => (i === 0 ? 0.78 : 0.96),
      duration: 0.24,
      ease: 'sine.out'
    },
    0.2
  );

  activeStepTimeline.to(
    flightProxy,
    {
      t: 1,
      duration: 1.05,
      ease: 'power2.inOut',
      onStart: () => {
        if (ballAuraRing) ballAuraRing.visible = true;
      },
      onUpdate: () => {
        const t = flightProxy.t;
        const bx = x1 + (x2 - x1) * t;
        const bz = z1 + (z2 - z1) * t;
        const by = 0.56 + 4 * peakY * t * (1 - t);

        ballMesh.position.set(bx, by, bz);
        ballMesh.rotation.x += 0.2;
        ballMesh.rotation.z -= 0.16;

        if (ballAuraRing) {
          ballAuraRing.position.set(bx, by, bz);
        }

        ballShadowMesh.position.set(bx, 0.03, bz);
        const shadowScale = Math.max(0.42, 1 - (by - 0.56) / (peakY * 2.1));
        ballShadowMesh.scale.set(shadowScale, shadowScale, 1);
      },
      onComplete: () => {
        if (ballAuraRing) ballAuraRing.visible = false;
        spawnImpactFlash3D(x2, z2, isShot);
      }
    },
    0.22
  );

  // Tiempo 3: Follow-Cam suave sin tirones bruscos que acompaña la jugada
  if (controls) {
    activeStepTimeline.to(
      controls.target,
      {
        x: x2 * 0.36,
        y: 0.35,
        z: z2 * 0.36,
        duration: 1.25,
        ease: 'sine.inOut'
      },
      0.12
    );

    if (isShot) {
      activeStepTimeline.to(
        controls.target,
        {
          x: 0,
          y: 0,
          z: 0,
          duration: 1.35,
          ease: 'sine.inOut'
        },
        1.85
      );
    }
  }
}

export function disposeStadium3D() {
  if (activeStepTimeline) {
    activeStepTimeline.kill();
    activeStepTimeline = null;
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  pawnMap.clear();
  if (ambientEnergyPoints) {
    ambientEnergyPoints.geometry.dispose();
    ambientEnergyPoints.material.dispose();
    ambientEnergyPoints = null;
  }
  ambientEnergyVelocities = null;
  if (ambientEnergyTexture) {
    ambientEnergyTexture.dispose();
    ambientEnergyTexture = null;
  }
  if (ballAuraRing) {
    ballAuraRing.geometry.dispose();
    ballAuraRing.material.dispose();
    ballAuraRing = null;
  }
  if (trailGroup) trailGroup.clear();
  if (impactShockwavesGroup) impactShockwavesGroup.clear();
  if (turfTexture) {
    turfTexture.dispose();
    turfTexture = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  scene = null;
  camera = null;
  controls = null;
  if (dom.stadium3dContainer) {
    dom.stadium3dContainer.replaceChildren();
  }
}

export function toggleStadium3DView(forceState = null, currentBoardCoords = []) {
  state.isStadium3DView =
    typeof forceState === 'boolean' ? forceState : !state.isStadium3DView;
  const active = state.isStadium3DView;

  if (dom.toggleStadium3dBtn) {
    dom.toggleStadium3dBtn.classList.toggle('active', active);
    dom.toggleStadium3dBtn.setAttribute('aria-pressed', String(active));
  }
  if (dom.toggle2dViewBtn) {
    const is2d = !active && !state.isTv25DView;
    dom.toggle2dViewBtn.classList.toggle('active', is2d);
    dom.toggle2dViewBtn.setAttribute('aria-pressed', String(is2d));
  }

  // En Estadio 3D las capas 2D (Mapa de Calor y Trazado libre) no aplican sobre WebGL;
  // usamos aria-disabled="true" para mantener foco por teclado con aviso claro.
  [dom.toggleHeatmapBtn, dom.toggleDrawBtn].forEach((toolBtn) => {
    if (!toolBtn) return;
    toolBtn.classList.toggle('tool-disabled-3d', active);
    if (active) {
      toolBtn.setAttribute('aria-disabled', 'true');
    } else {
      toolBtn.removeAttribute('aria-disabled');
    }
  });
  if (active && state.isDrawModeActive && dom.freehandDrawSvg) {
    dom.freehandDrawSvg.classList.remove('drawing-enabled');
  } else if (!active && state.isDrawModeActive && dom.freehandDrawSvg) {
    dom.freehandDrawSvg.classList.add('drawing-enabled');
  }

  if (dom.tacticalPitch) {
    dom.tacticalPitch.classList.toggle('stadium-3d-active', active);
  }

  if (dom.stadium3dContainer) {
    dom.stadium3dContainer.classList.toggle('hidden', !active);
  }

  if (active) {
    if (dom.tacticalPitch) {
      gsap.to(dom.tacticalPitch, {
        rotateX: 0,
        scale: 1,
        duration: 0.35,
        ease: 'power2.out'
      });
    }
    initStadium3DScene();
    syncStadium3DScene(currentBoardCoords, getActiveSetPiece());
  } else {
    disposeStadium3D();
    if (state.isTv25DView && dom.tacticalPitch) {
      gsap.to(dom.tacticalPitch, {
        rotateX: 28,
        scale: 0.96,
        transformPerspective: 1200,
        transformOrigin: '50% 62%',
        duration: 0.55,
        ease: 'power3.out'
      });
    }
  }
}
