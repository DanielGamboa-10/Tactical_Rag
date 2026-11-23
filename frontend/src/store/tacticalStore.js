/* ==========================================================================
   Reactive Pub/Sub Store, Tactical Catalogs & Shared UI Helpers
   ========================================================================== */

import gsap from 'gsap';

const listeners = new Map();
let lastHudText = '';

export const state = {
  activeTab: 'assistant',
  modality: 'Futsal',
  formationIndex: 0,
  playStyle: 'Posesión & Juego de Posición',
  setPieceCategory: 'free', // 'free' | 'attack' | 'defense'
  setPieceIndex: 0,
  setPieceStep: 0, // 0 = initial setup, 1 = step 1, 2 = step 2, 3 = step 3
  isTv25DView: false,
  isStadium3DView: false,
  isHeatmapActive: false,
  isDrawModeActive: false,
  drawColor: 'cyan',
  isBoardExpanded: false,
  playbackTimers: [],
  motionBlurTimers: [],
  selectedFile: null,
  indexedDocs: [],
  isSendingChat: false,
  isUploadingPdf: false,
  // Tab 3: Tu Propia Plantilla
  squadModality: 'Fútbol 11',
  squadFormationIndex: 0,
  squadPlayers: [],
  top100Catalog: [],
  squadOptimization: null,
  selectedSquadPlayerId: null,
  pendingSwapBenchPlayerId: null,
  exportedBoardLineup: null
};

export const tacticalStore = {
  getState() {
    return state;
  },

  setState(partial, topic = 'state:change') {
    Object.assign(state, partial);
    this.emit(topic, state);
  },

  subscribe(topic, callback) {
    if (!listeners.has(topic)) {
      listeners.set(topic, new Set());
    }
    listeners.get(topic).add(callback);
    return () => listeners.get(topic)?.delete(callback);
  },

  emit(topic, payload = state) {
    const topicListeners = listeners.get(topic);
    if (topicListeners) {
      topicListeners.forEach((cb) => cb(payload));
    }
  }
};

// Shared DOM References
export const dom = {
  tabBtnAssistant: document.getElementById('tab-btn-assistant'),
  tabBtnBoard: document.getElementById('tab-btn-board'),
  tabBtnSquad: document.getElementById('tab-btn-squad'),
  viewAssistant: document.getElementById('view-assistant'),
  viewBoard: document.getElementById('view-board'),
  viewSquad: document.getElementById('view-squad'),
  backendStatusBtn: document.getElementById('backend-status-btn'),
  backendStatusText: document.getElementById('backend-status-text'),
  shutdownSystemBtn: document.getElementById('shutdown-system-btn'),
  headerModalityBadge: document.getElementById('header-modality-badge'),
  playersCountTag: document.getElementById('players-count-tag'),
  modalitySelector: document.getElementById('modality-selector'),
  sidebarFormationLabel: document.getElementById('sidebar-formation-label'),
  sidebarStyleLabel: document.getElementById('sidebar-style-label'),
  sidebarSquadLabel: document.getElementById('sidebar-squad-label'),
  sidebarSynergyValue: document.getElementById('sidebar-synergy-value'),
  sidebarSetpieceValue: document.getElementById('sidebar-setpiece-value'),
  sidebarCameraValue: document.getElementById('sidebar-camera-value'),
  goToBoardBtn: document.getElementById('go-to-board-btn'),
  goToSquadBtn: document.getElementById('go-to-squad-btn'),
  syncWikiBtn: document.getElementById('sync-wiki-btn'),
  boardModalityPills: document.getElementById('board-modality-pills'),
  formationSelect: document.getElementById('formation-select'),
  styleSelect: document.getElementById('style-select'),
  setpieceCategorySelect: document.getElementById('setpiece-category-select'),
  setpieceSelect: document.getElementById('setpiece-select'),
  boardPitchTitle: document.getElementById('board-pitch-title'),
  boardStyleBadge: document.getElementById('board-style-badge'),
  formationBadge: document.getElementById('formation-badge'),
  toggleExpandBoardBtn: document.getElementById('toggle-expand-board-btn'),
  toggle2dViewBtn: document.getElementById('toggle-2d-view-btn'),
  toggleTvViewBtn: document.getElementById('toggle-tv-view-btn'),
  toggleStadium3dBtn: document.getElementById('toggle-stadium-3d-btn'),
  toggleHeatmapBtn: document.getElementById('toggle-heatmap-btn'),
  heatmapOverlayLayer: document.getElementById('heatmap-overlay-layer'),
  toggleDrawBtn: document.getElementById('toggle-draw-btn'),
  clearDrawBtn: document.getElementById('clear-draw-btn'),
  freehandToolbar: document.getElementById('freehand-toolbar'),
  undoDrawBtn: document.getElementById('undo-draw-btn'),
  freehandDrawSvg: document.getElementById('freehand-draw-svg'),
  freehandPathsGroup: document.getElementById('freehand-paths-group'),
  squadSynergyTier: document.getElementById('squad-synergy-tier'),
  benchSwapHint: document.getElementById('bench-swap-hint'),
  stadium3dContainer: document.getElementById('stadium-3d-container'),
  boardLayout: document.querySelector('.board-layout'),
  tacticalPitch: document.getElementById('tactical-pitch'),
  hoverInfluenceLayer: document.getElementById('hover-influence-layer'),
  formationFullText: document.getElementById('formation-full-text'),
  toggleVariantBtn: document.getElementById('toggle-variant-btn'),
  setpiecePlaybackControls: document.getElementById('setpiece-playback-controls'),
  playSetpieceBtn: document.getElementById('play-setpiece-btn'),
  nextStepSetpieceBtn: document.getElementById('next-step-setpiece-btn'),
  resetSetpieceBtn: document.getElementById('reset-setpiece-btn'),
  setpieceLiveBanner: document.getElementById('setpiece-live-banner'),
  liveStepBadge: document.getElementById('live-step-badge'),
  liveStepText: document.getElementById('live-step-text'),
  pitchTokens: document.getElementById('pitch-tokens'),
  ballToken: document.getElementById('ball-token'),
  synergyLinks: document.getElementById('synergy-links'),
  setpieceOverlay: document.getElementById('setpiece-overlay'),
  tacticOverviewText: document.getElementById('tactic-overview-text'),
  referenceCoachCard: document.getElementById('reference-coach-card'),
  coachHoloGlareLayer: document.getElementById('coach-holo-glare-layer'),
  coachOriginBadge: document.getElementById('coach-origin-badge'),
  coachAvatarInitials: document.getElementById('coach-avatar-initials'),
  coachNameText: document.getElementById('coach-name-text'),
  coachNoteText: document.getElementById('coach-note-text'),
  setpieceStepsBox: document.getElementById('setpiece-steps-box'),
  setpieceTitleText: document.getElementById('setpiece-title-text'),
  setpieceStepsList: document.getElementById('setpiece-steps-list'),
  roleDefenseText: document.getElementById('role-defense-text'),
  roleMidfieldText: document.getElementById('role-midfield-text'),
  roleAttackText: document.getElementById('role-attack-text'),
  styleEffectDescription: document.getElementById('style-effect-description'),
  analyzeWithBotBtn: document.getElementById('analyze-with-bot-btn'),
  exportMatchPlanBoardBtn: document.getElementById('export-match-plan-board-btn'),
  exportPngBoardBtn: document.getElementById('export-png-board-btn'),
  exportMatchPlanSquadBtn: document.getElementById('export-match-plan-squad-btn'),
  exportPngSquadBtn: document.getElementById('export-png-squad-btn'),
  printableMatchPlan: document.getElementById('printable-match-plan'),
  balanceValAttack: document.getElementById('balance-val-attack'),
  balanceValCreation: document.getElementById('balance-val-creation'),
  balanceValDefense: document.getElementById('balance-val-defense'),
  balanceBarAttack: document.getElementById('balance-bar-attack'),
  balanceBarCreation: document.getElementById('balance-bar-creation'),
  balanceBarDefense: document.getElementById('balance-bar-defense'),
  // Tab 3 DOM References
  loadDemoSquadBtn: document.getElementById('load-demo-squad-btn'),
  clearSquadBtn: document.getElementById('clear-squad-btn'),
  addPlayerForm: document.getElementById('add-player-form'),
  playerNameInput: document.getElementById('player-name-input'),
  playerNumberInput: document.getElementById('player-number-input'),
  playerPosSelect: document.getElementById('player-pos-select'),
  playerFootSelect: document.getElementById('player-foot-select'),
  statPace: document.getElementById('stat-pace'),
  statPassing: document.getElementById('stat-passing'),
  statDribbling: document.getElementById('stat-dribbling'),
  statDefending: document.getElementById('stat-defending'),
  statShooting: document.getElementById('stat-shooting'),
  statVision: document.getElementById('stat-vision'),
  valPace: document.getElementById('val-pace'),
  valPassing: document.getElementById('val-passing'),
  valDribbling: document.getElementById('val-dribbling'),
  valDefending: document.getElementById('val-defending'),
  valShooting: document.getElementById('val-shooting'),
  valVision: document.getElementById('val-vision'),
  squadCountBadge: document.getElementById('squad-count-badge'),
  squadRosterList: document.getElementById('squad-roster-list'),
  squadModalitySelect: document.getElementById('squad-modality-select'),
  squadFormationSelect: document.getElementById('squad-formation-select'),
  squadStyleSelect: document.getElementById('squad-style-select'),
  generateIdealSquadBtn: document.getElementById('generate-ideal-squad-btn'),
  idealSquadBanner: document.getElementById('ideal-squad-banner'),
  idealBannerTitle: document.getElementById('ideal-banner-title'),
  idealBannerText: document.getElementById('ideal-banner-text'),
  idealBannerPartners: document.getElementById('ideal-banner-partners'),
  closeIdealBannerBtn: document.getElementById('close-ideal-banner-btn'),
  squadGlobalSynergy: document.getElementById('squad-global-synergy'),
  squadPitch: document.getElementById('squad-pitch'),
  squadPitchTokens: document.getElementById('squad-pitch-tokens'),
  squadSynergyLinks: document.getElementById('squad-synergy-links'),
  squadHoverInfluenceLayer: document.getElementById('squad-hover-influence-layer'),
  squadBenchSection: document.getElementById('squad-bench-section'),
  squadBenchList: document.getElementById('squad-bench-list'),
  benchCountBadge: document.getElementById('bench-count-badge'),
  resetLineupBtn: document.getElementById('reset-lineup-btn'),
  exportSquadToBoardBtn: document.getElementById('export-squad-to-board-btn'),
  askBotAboutSquadBtn: document.getElementById('ask-bot-about-squad-btn'),
  compSimilarityBadge: document.getElementById('comp-similarity-badge'),
  holographicPlayerCard: document.getElementById('holographic-player-card'),
  holoGlareLayer: document.getElementById('holo-glare-layer'),
  compPlayerNumber: document.getElementById('comp-player-number'),
  compPlayerName: document.getElementById('comp-player-name'),
  compPlayerMeta: document.getElementById('comp-player-meta'),
  compMirrorBadge: document.getElementById('comp-mirror-badge'),
  compCrackAvatar: document.getElementById('comp-crack-avatar'),
  compCrackInitials: document.getElementById('comp-crack-initials'),
  compCrackName: document.getElementById('comp-crack-name'),
  compCrackStyle: document.getElementById('comp-crack-style'),
  compCrackWiki: document.getElementById('comp-crack-wiki'),
  radarLegendUser: document.getElementById('radar-legend-user'),
  radarLegendCrack: document.getElementById('radar-legend-crack'),
  radarPolyUser: document.getElementById('radar-poly-user'),
  radarPolyCrack: document.getElementById('radar-poly-crack'),
  radarVerticesLayer: document.getElementById('radar-vertices-layer'),
  radarLblPace: document.getElementById('radar-lbl-pace'),
  radarLblPassing: document.getElementById('radar-lbl-passing'),
  radarLblDribbling: document.getElementById('radar-lbl-dribbling'),
  radarLblDefending: document.getElementById('radar-lbl-defending'),
  radarLblShooting: document.getElementById('radar-lbl-shooting'),
  radarLblVision: document.getElementById('radar-lbl-vision'),
  compWhyText: document.getElementById('comp-why-text'),
  compPotentiateText: document.getElementById('comp-potentiate-text'),
  compPartnersChips: document.getElementById('comp-partners-chips'),
  quickPrompts: document.getElementById('quick-prompts'),
  chatMessages: document.getElementById('chat-messages'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  inputModalityTag: document.getElementById('input-modality-tag'),
  sendChatBtn: document.getElementById('send-chat-btn'),
  clearChatBtn: document.getElementById('clear-chat-btn'),
  toastContainer: document.getElementById('toast-container')
};

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showToast(title, message, type = 'info') {
  if (!dom.toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-title">${escapeHtml(title)}</span>
    <span>${escapeHtml(message)}</span>
  `;
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

export function animateNumericCounter(el, targetValue, suffix = '%') {
  if (!el) return;
  const targetNum = Math.round(Number(targetValue) || 0);
  const currentMatch = String(el.textContent || '').match(/\d+/);
  const startNum = currentMatch ? Number(currentMatch[0]) : Math.max(50, targetNum - 12);

  if (startNum === targetNum) {
    el.textContent = `${targetNum}${suffix}`;
    return;
  }

  const counter = { val: startNum };
  gsap.to(counter, {
    val: targetNum,
    duration: 0.65,
    ease: 'power2.out',
    overwrite: 'auto',
    onUpdate: () => {
      el.textContent = `${Math.round(counter.val)}${suffix}`;
    }
  });
}

export function getPersonInitials(rawName) {
  const clean = String(rawName || '')
    .replace(/\(.*?\)/g, '')
    .replace(/["'“”‘’].*?["'“”‘’]/g, '')
    .split('/')[0]
    .split('·')[0]
    .trim();
  if (!clean) return 'DT';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function switchTab(tabName) {
  state.activeTab = tabName;
  const isAssistant = tabName === 'assistant';
  const isBoard = tabName === 'board';
  const isSquad = tabName === 'squad';

  dom.tabBtnAssistant.classList.toggle('active', isAssistant);
  dom.tabBtnAssistant.setAttribute('aria-selected', String(isAssistant));
  dom.tabBtnAssistant.setAttribute('tabindex', isAssistant ? '0' : '-1');
  dom.tabBtnBoard.classList.toggle('active', isBoard);
  dom.tabBtnBoard.setAttribute('aria-selected', String(isBoard));
  dom.tabBtnBoard.setAttribute('tabindex', isBoard ? '0' : '-1');
  if (dom.tabBtnSquad) {
    dom.tabBtnSquad.classList.toggle('active', isSquad);
    dom.tabBtnSquad.setAttribute('aria-selected', String(isSquad));
    dom.tabBtnSquad.setAttribute('tabindex', isSquad ? '0' : '-1');
  }

  dom.viewAssistant.classList.toggle('active-view', isAssistant);
  dom.viewAssistant.classList.toggle('hidden-view', !isAssistant);
  dom.viewBoard.classList.toggle('active-view', isBoard);
  dom.viewBoard.classList.toggle('hidden-view', !isBoard);
  if (dom.viewSquad) {
    dom.viewSquad.classList.toggle('active-view', isSquad);
    dom.viewSquad.classList.toggle('hidden-view', !isSquad);
  }

  const activeViewEl = isAssistant ? dom.viewAssistant : isBoard ? dom.viewBoard : dom.viewSquad;
  if (activeViewEl) {
    const cards = activeViewEl.querySelectorAll('.glass-card');
    gsap.fromTo(
      cards,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.35, stagger: 0.05, ease: 'power2.out', overwrite: 'auto' }
    );
  }

  tacticalStore.emit('tab:changed', tabName);
}

// Modifiers that dynamically shift player coordinates on the pitch by Play Style
export const PLAY_STYLE_MODIFIERS = {
  'Posesión & Juego de Posición': {
    shiftX: 8,
    spreadY: 1.08,
    effect: 'Adelanta ligeramente el bloque (+8m) y abre a los jugadores de banda para crear triángulos de pase constantes.',
    defenseAddon: 'Salir jugando limpio por abajo con apoyos cortos.',
    midfieldAddon: 'Ofrecer siempre dos líneas de pase libres y girar rápido.',
    attackAddon: 'Fijar marcas arriba y abrir la cancha para recibir entre líneas.'
  },
  'Presión Alta (Gegenpressing)': {
    shiftX: 28,
    spreadY: 0.94,
    effect: 'Sube todas las líneas hacia campo rival (+28m) y compacta los carriles para asfixiar la salida y robar cerca del arco.',
    defenseAddon: 'Achicar hacia mitad de cancha vigilando los balones largos a la espalda.',
    midfieldAddon: 'Saltar de inmediato sobre el receptor rival apenas pierde el control.',
    attackAddon: 'Iniciar la presión sobre los centrales y el arquero cerrando líneas de pase.'
  },
  'Bloque Bajo & Contragolpe': {
    shiftX: -26,
    spreadY: 0.82,
    effect: 'Repliega el equipo hacia campo propio (-26m) y junta las líneas por dentro para cerrar espacios y salir disparados tras robo.',
    defenseAddon: 'Proteger el área sin salir a destiempo y despejar o lanzar rápido al recuperar.',
    midfieldAddon: 'Cerrar pasillos internos delante de los defensas y lanzar el primer pase largo.',
    attackAddon: 'Quedar descolgados listos para atacar el espacio vacío a máxima velocidad.'
  },
  'Juego Directo & Vertical': {
    shiftX: 14,
    spreadY: 1.04,
    effect: 'Estira las líneas de ataque (+14m) buscando envíos largos al punta y ganar la segunda jugada en campo contrario.',
    defenseAddon: 'Buscar pases largos directos hacia los delanteros evitando riesgos atrás.',
    midfieldAddon: 'Atacar con todo la caída del balón (segunda jugada) cerca del punta.',
    attackAddon: 'Aguantar el balón de espaldas, peinar y atacar la espalda de la defensa.'
  },
  'Rotación Dinámica': {
    shiftX: 12,
    spreadY: 1.14,
    effect: 'Amplía la movilidad y apertura del equipo (+14% amplitud) intercambiando puestos entre líneas para desordenar marcas.',
    defenseAddon: 'Conducir para atraer marcas y permutar el puesto si un compañero sube.',
    midfieldAddon: 'Intercambiar alturas constantemente con extremos y laterales.',
    attackAddon: 'Salir de la zona para arrastrar centrales y dejarle el hueco al volante que llega.'
  }
};

// Complete Formation Catalog by Modality (30 Formations across 4 sports, viewBox 360x220)
export const FORMATIONS_BY_MODALITY = {
  'Futsal': [
    {
      code: '1-3-1 (Rombo)',
      overview: 'Esquema clásico con cierre fijo, dos alas abiertas y un pívot de referencia arriba.',
      defenseRole: 'El cierre (4) ordena la marca, cubre las subidas de las alas y asegura el primer pase.',
      midfieldRole: 'Las alas (7 y 10) abren toda la pista de 40x20m, encaran en 1v1 y hacen diagonales al segundo palo.',
      attackRole: 'El pívot (9) fija al cierre rival de espaldas para girar y rematar o descargar de cara.',
      players: [
        { num: '1', role: 'POR', x: 32, y: 110, gk: true },
        { num: '4', role: 'CIE', x: 115, y: 110 },
        { num: '7', role: 'ALA-I', x: 195, y: 45 },
        { num: '10', role: 'ALA-D', x: 195, y: 175 },
        { num: '9', role: 'PIV', x: 285, y: 110 }
      ],
      links: [[1, 2], [1, 3], [1, 4], [2, 4], [3, 4]]
    },
    {
      code: '1-2-2 (Cuadrado)',
      overview: 'Estructura equilibrada en dos bloques de dos jugadores ideal para presionar y salir con orden.',
      defenseRole: 'Dos jugadores en base (4 y 5) se reparten el ancho de la cancha y aseguran el equilibrio.',
      midfieldRole: 'Conexión paralela y diagonal constante entre la primera línea y los dos hombres de arriba.',
      attackRole: 'Dos atacantes (7 y 9) ocupan ambos pasillos ofensivos para tirar paredes y atacar la espalda.',
      players: [
        { num: '1', role: 'POR', x: 32, y: 110, gk: true },
        { num: '4', role: 'CIE-I', x: 132, y: 65 },
        { num: '5', role: 'CIE-D', x: 132, y: 155 },
        { num: '7', role: 'ALA-I', x: 262, y: 62 },
        { num: '9', role: 'PIV-D', x: 262, y: 158 }
      ],
      links: [[1, 2], [1, 3], [2, 4], [3, 4], [1, 4]]
    },
    {
      code: '1-4-0 (Sistema Plano)',
      overview: 'Los 4 jugadores de campo se paran en línea sin pívot fijo para rotar sin parar y vaciar la espalda rival.',
      defenseRole: 'Rotación circular continua: quien pasa la pelota corta hacia adelante y otro ocupa su espalda.',
      midfieldRole: 'Los cuatro jugadores alternan puestos en línea buscando sorprender con cortes a la espalda.',
      attackRole: 'Sin referencia fija para los defensas rivales; se ataca el espacio libre con pases al hueco.',
      players: [
        { num: '1', role: 'POR', x: 32, y: 110, gk: true },
        { num: '4', role: 'UNI-1', x: 175, y: 36 },
        { num: '6', role: 'UNI-2', x: 165, y: 86 },
        { num: '8', role: 'UNI-3', x: 165, y: 134 },
        { num: '10', role: 'UNI-4', x: 175, y: 184 }
      ],
      links: [[1, 2], [2, 3], [3, 4], [1, 3], [2, 4]]
    },
    {
      code: '1-1-2-1 (Pirámide)',
      overview: 'Variante con cierre retrasado, dos alas cerradas en el medio y un pívot profundo para proteger el carril central.',
      defenseRole: 'El cierre (4) actúa como libre detrás de la línea de volantes para cortar contragolpes.',
      midfieldRole: 'Dos interiores (7 y 8) cierran el centro de la pista y salen rápido en apoyo del pívot.',
      attackRole: 'El pívot (9) estira al rival y espera la llegada de segunda línea.',
      players: [
        { num: '1', role: 'POR', x: 32, y: 110, gk: true },
        { num: '4', role: 'CIE', x: 100, y: 110 },
        { num: '7', role: 'INT-I', x: 185, y: 68 },
        { num: '8', role: 'INT-D', x: 185, y: 152 },
        { num: '9', role: 'PIV', x: 288, y: 110 }
      ],
      links: [[1, 2], [1, 3], [2, 3], [2, 4], [3, 4]]
    },
    {
      code: '1-2-1-1 (Y Invertida)',
      overview: 'Doble cierre en la base, un ala-enganche centralizador y un pívot profundo para salidas seguras ante presión.',
      defenseRole: 'Doble base (4 y 5) que asegura superioridad 2v1 en salida desde el fondo.',
      midfieldRole: 'El conector central (10) recibe entre líneas y gira para habilitar al pívot.',
      attackRole: 'El pívot (9) fija en el borde del área esperando la pared vertical.',
      players: [
        { num: '1', role: 'POR', x: 32, y: 110, gk: true },
        { num: '4', role: 'CIE-I', x: 112, y: 66 },
        { num: '5', role: 'CIE-D', x: 112, y: 154 },
        { num: '10', role: 'ENG', x: 198, y: 110 },
        { num: '9', role: 'PIV', x: 292, y: 110 }
      ],
      links: [[1, 2], [1, 3], [2, 3], [3, 4]]
    },
    {
      code: '5-0 (Portero-Jugador)',
      overview: 'Superioridad 5 contra 4 en campo rival adelantando al arquero-jugador para remontar o controlar el balón.',
      defenseRole: 'El portero-jugador (1) y el cierre (4) mueven la pelota de lado a lado con máxima seguridad.',
      midfieldRole: 'Las alas abiertas hunden a la defensa rival contra su propia área.',
      attackRole: 'Dos jugadores en los postes buscan el pase filtrado al segundo palo para empujarla.',
      players: [
        { num: '1', role: 'PJ', x: 185, y: 65, gk: true },
        { num: '4', role: 'CIE', x: 185, y: 155 },
        { num: '7', role: 'ALA-I', x: 255, y: 34 },
        { num: '10', role: 'ALA-D', x: 255, y: 186 },
        { num: '9', role: 'PIV', x: 305, y: 110 }
      ],
      links: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [0, 4]]
    },
    {
      code: '1-3-1 (Presión Alta)',
      overview: 'Bloque adelantado en tres cuartos de pista para ahogar el saque rival y robar a 10 metros del arco.',
      defenseRole: 'El cierre (4) se para en mitad de cancha anticipando cualquier pelotazo largo al pívot rival.',
      midfieldRole: 'Las alas (7 y 10) cierran las bandas obligando al rival a jugar hacia la trampa central.',
      attackRole: 'El pívot (9) acosa al sacador e impide el cambio de orientación limpio.',
      players: [
        { num: '1', role: 'POR', x: 52, y: 110, gk: true },
        { num: '4', role: 'CIE', x: 175, y: 110 },
        { num: '7', role: 'ALA-I', x: 245, y: 50 },
        { num: '10', role: 'ALA-D', x: 245, y: 170 },
        { num: '9', role: 'PIV', x: 305, y: 110 }
      ],
      links: [[1, 2], [1, 3], [2, 4], [3, 4], [1, 4]]
    }
  ],
  'Fútbol 7': [
    {
      code: '1-2-3-1',
      overview: 'El sistema más equilibrado en Fútbol 7: dos centrales firmes, tres volantes con amplitud y un referente de área.',
      defenseRole: 'Dos centrales (2 y 4) cierran el carril interior y salen jugando con el mediocentro.',
      midfieldRole: 'El mediocentro (6) sostiene el equilibrio mientras los carrileros (7 y 11) desbordan por banda.',
      attackRole: 'El delantero centro (9) fija a los defensas y define los centros o paredes con los volantes.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '2', role: 'DFC-I', x: 105, y: 72 },
        { num: '4', role: 'DFC-D', x: 105, y: 148 },
        { num: '6', role: 'MCD', x: 185, y: 110 },
        { num: '7', role: 'CAR-I', x: 215, y: 42 },
        { num: '11', role: 'CAR-D', x: 215, y: 178 },
        { num: '9', role: 'DC', x: 292, y: 110 }
      ],
      links: [[1, 3], [2, 3], [3, 4], [3, 5], [3, 6], [4, 6], [5, 6]]
    },
    {
      code: '1-3-2-1 (Árbol)',
      overview: 'Seguridad defensiva con línea de tres atrás, doble volante creativo en el medio y un punta.',
      defenseRole: 'Líbero central (4) respaldado por dos laterales (3 y 2) que cierran bandas y pasan al ataque.',
      midfieldRole: 'Doble mediocentro (8 y 10) que maneja los tiempos, filtra pases y pisa el área rival.',
      attackRole: 'El 9 aguanta arriba y descarga hacia los dos volantes que llegan de frente.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '3', role: 'LAT-I', x: 108, y: 46 },
        { num: '4', role: 'LIB', x: 96, y: 110 },
        { num: '2', role: 'LAT-D', x: 108, y: 174 },
        { num: '8', role: 'MC-I', x: 202, y: 78 },
        { num: '10', role: 'MC-D', x: 202, y: 142 },
        { num: '9', role: 'DC', x: 295, y: 110 }
      ],
      links: [[2, 4], [2, 5], [1, 4], [3, 5], [4, 6], [5, 6]]
    },
    {
      code: '1-2-1-2-1 (Rombo)',
      overview: 'Escalonamiento en cuatro alturas para dominar el centro del campo con superioridad de pases cortos.',
      defenseRole: 'Dos zagueros (2 y 4) abiertos para iniciar la salida con el pivote.',
      midfieldRole: 'Un pivote (5) detrás de dos interiores ofensivos (8 y 10) que conectan todo el equipo.',
      attackRole: 'Delantero rápido (9) tirando diagonales constantes a los pases filtrados.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '2', role: 'DFC-I', x: 100, y: 72 },
        { num: '4', role: 'DFC-D', x: 100, y: 148 },
        { num: '5', role: 'PIV', x: 158, y: 110 },
        { num: '8', role: 'INT-I', x: 225, y: 60 },
        { num: '10', role: 'INT-D', x: 225, y: 160 },
        { num: '9', role: 'DC', x: 298, y: 110 }
      ],
      links: [[1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6]]
    },
    {
      code: '1-3-1-2',
      overview: 'Firmeza atrás con tres defensores, un enganche o mediocentro eje y dos delanteros peligrosos arriba.',
      defenseRole: 'Tres defensas (3, 4 y 2) que ocupan todo el ancho para frenar extremos rivales.',
      midfieldRole: 'Un mediocentro total (6) que distribuye rápido hacia la dupla ofensiva.',
      attackRole: 'Dos delanteros (7 y 9) que combinan entre sí y castigan en cada transición.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 106, y: 48 },
        { num: '4', role: 'DF-C', x: 96, y: 110 },
        { num: '2', role: 'DF-D', x: 106, y: 172 },
        { num: '6', role: 'MC', x: 188, y: 110 },
        { num: '7', role: 'DC-I', x: 278, y: 74 },
        { num: '9', role: 'DC-D', x: 278, y: 146 }
      ],
      links: [[1, 4], [2, 4], [3, 4], [4, 5], [4, 6], [5, 6]]
    },
    {
      code: '1-2-2-2',
      overview: 'Tres líneas de dos jugadores (caja táctica) muy vertical para atacar con cuatro hombres.',
      defenseRole: 'Pareja de centrales (2 y 4) rápida en los cruces a las bandas.',
      midfieldRole: 'Doble volante (6 y 8) que recupera y lanza de inmediato hacia los dos puntas.',
      attackRole: 'Dos puntas abiertos o cerrados (7 y 9) que atacan el área en paralelo.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '2', role: 'DFC-I', x: 105, y: 72 },
        { num: '4', role: 'DFC-D', x: 105, y: 148 },
        { num: '6', role: 'MC-I', x: 192, y: 68 },
        { num: '8', role: 'MC-D', x: 192, y: 152 },
        { num: '7', role: 'DC-I', x: 282, y: 72 },
        { num: '9', role: 'DC-D', x: 282, y: 148 }
      ],
      links: [[1, 3], [2, 4], [3, 4], [3, 5], [4, 6], [5, 6]]
    },
    {
      code: '1-3-3 (Ofensivo)',
      overview: 'Esquema directo de dos líneas de tres hombres para presionar arriba y atacar con amplitud máxima.',
      defenseRole: 'Línea de tres (3, 4 y 2) que achica hasta mitad de cancha y lanza rápido.',
      midfieldRole: 'Transición directa de los laterales hacia los extremos sin pausa en el medio.',
      attackRole: 'Tridente ofensivo (11, 9 y 7) ocupando todo el frente de ataque.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 118, y: 48 },
        { num: '4', role: 'LIB', x: 108, y: 110 },
        { num: '2', role: 'DF-D', x: 118, y: 172 },
        { num: '11', role: 'EXT-I', x: 265, y: 44 },
        { num: '9', role: 'DC', x: 288, y: 110 },
        { num: '7', role: 'EXT-D', x: 265, y: 176 }
      ],
      links: [[1, 4], [2, 5], [3, 6], [4, 5], [5, 6]]
    },
    {
      code: '1-4-1-1 (Bloque Bajo)',
      overview: 'Muralla defensiva de cuatro hombres atrás, un pivote barredor y un punta veloz para el contragolpe.',
      defenseRole: 'Cuatro defensores (3, 4, 5 y 2) que cierran toda la frontal del área.',
      midfieldRole: 'El pivote (6) tapona el carril central y lanza balones largos al espacio.',
      attackRole: 'Un delantero rápido (9) listo para ganar en velocidad a campo abierto.',
      players: [
        { num: '1', role: 'POR', x: 30, y: 110, gk: true },
        { num: '3', role: 'LI', x: 96, y: 38 },
        { num: '4', role: 'DFC-I', x: 88, y: 86 },
        { num: '5', role: 'DFC-D', x: 88, y: 134 },
        { num: '2', role: 'LD', x: 96, y: 182 },
        { num: '6', role: 'MCD', x: 168, y: 110 },
        { num: '9', role: 'DC', x: 285, y: 110 }
      ],
      links: [[2, 5], [3, 5], [1, 5], [4, 5], [5, 6]]
    }
  ],
  'Fútbol 9': [
    {
      code: '1-3-3-2',
      overview: 'Puente formativo ideal hacia Fútbol 11: línea de tres defensas, triángulo en el medio y dos delanteros.',
      defenseRole: 'Tres defensas (3, 4 y 2) que aseguran coberturas y salida limpia por los costados.',
      midfieldRole: 'Un pivote (5) más dos interiores/carrileros (8 y 10) que abastecen el ataque.',
      attackRole: 'Doble punta (7 y 9) para fijar centrales y tirar diagonales hacia las bandas.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 96, y: 50 },
        { num: '4', role: 'DF-C', x: 90, y: 110 },
        { num: '2', role: 'DF-D', x: 96, y: 170 },
        { num: '5', role: 'PIV', x: 175, y: 110 },
        { num: '8', role: 'INT-I', x: 198, y: 48 },
        { num: '10', role: 'INT-D', x: 198, y: 172 },
        { num: '7', role: 'DC-I', x: 285, y: 80 },
        { num: '9', role: 'DC-D', x: 285, y: 140 }
      ],
      links: [[2, 4], [4, 5], [4, 6], [5, 7], [6, 8], [7, 8]]
    },
    {
      code: '1-4-3-1',
      overview: 'Introduce la línea de cuatro defensas clásica de Fútbol 11 con tres volantes y un punta.',
      defenseRole: 'Dos centrales (4 y 5) y dos laterales (3 y 2) que aprenden a bascular en bloque.',
      midfieldRole: 'Tridente en el medio (6, 8 y 10) para adueñarse de la pelota y filtrar pases.',
      attackRole: 'Un delantero centro (9) que ataca los espacios y espera la subida de los interiores.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'LI', x: 98, y: 38 },
        { num: '4', role: 'DFC', x: 90, y: 86 },
        { num: '5', role: 'DFC', x: 90, y: 134 },
        { num: '2', role: 'LD', x: 98, y: 182 },
        { num: '8', role: 'INT-I', x: 195, y: 58 },
        { num: '6', role: 'PIV', x: 182, y: 110 },
        { num: '10', role: 'INT-D', x: 195, y: 162 },
        { num: '9', role: 'DC', x: 292, y: 110 }
      ],
      links: [[2, 6], [3, 6], [6, 5], [6, 7], [5, 8], [7, 8], [6, 8]]
    },
    {
      code: '1-3-4-1',
      overview: 'Superioridad total en la mitad de la cancha con cuatro volantes (doble pivote y dos extremos).',
      defenseRole: 'Tres defensas rápidos (3, 4 y 2) atentos a los cruces.',
      midfieldRole: 'Doble volante central (6 y 8) junto a dos extremos bien abiertos (7 y 11).',
      attackRole: 'Referente de área (9) abastecido por centros y pases interiores.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 96, y: 52 },
        { num: '4', role: 'DF-C', x: 90, y: 110 },
        { num: '2', role: 'DF-D', x: 96, y: 168 },
        { num: '6', role: 'MC-I', x: 178, y: 82 },
        { num: '8', role: 'MC-D', x: 178, y: 138 },
        { num: '7', role: 'EXT-I', x: 222, y: 36 },
        { num: '11', role: 'EXT-D', x: 222, y: 184 },
        { num: '9', role: 'DC', x: 298, y: 110 }
      ],
      links: [[4, 5], [4, 6], [5, 7], [6, 8], [7, 8]]
    },
    {
      code: '1-3-2-3',
      overview: 'Esquema ultra ofensivo con tridente de ataque para presionar alto la salida rival.',
      defenseRole: 'Tres defensores (3, 4 y 2) que sostienen la línea alta en mitad de cancha.',
      midfieldRole: 'Dos mediocentros (6 y 8) que recuperan tras pérdida y conectan con los tres de arriba.',
      attackRole: 'Dos extremos abiertos (7 y 11) y un 9 de área para presionar y definir.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 96, y: 52 },
        { num: '4', role: 'DF-C', x: 90, y: 110 },
        { num: '2', role: 'DF-D', x: 96, y: 168 },
        { num: '6', role: 'MC-I', x: 180, y: 80 },
        { num: '8', role: 'MC-D', x: 180, y: 140 },
        { num: '11', role: 'EI', x: 278, y: 44 },
        { num: '9', role: 'DC', x: 295, y: 110 },
        { num: '7', role: 'ED', x: 278, y: 176 }
      ],
      links: [[2, 4], [2, 5], [4, 6], [4, 7], [5, 7], [5, 8]]
    },
    {
      code: '1-4-2-2',
      overview: 'Estructura simétrica en pasillos interiores con línea de cuatro atrás, doble contención y dos atacantes.',
      defenseRole: 'Línea de cuatro (3, 4, 5 y 2) sólida que proyecta a los laterales por afuera.',
      midfieldRole: 'Doble pivote (6 y 8) que protege el centro y libera las bandas.',
      attackRole: 'Dos atacantes móviles (10 y 9) que tiran paredes por el centro.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'LI', x: 98, y: 38 },
        { num: '4', role: 'DFC', x: 90, y: 86 },
        { num: '5', role: 'DFC', x: 90, y: 134 },
        { num: '2', role: 'LD', x: 98, y: 182 },
        { num: '6', role: 'MCD', x: 185, y: 78 },
        { num: '8', role: 'MCD', x: 185, y: 142 },
        { num: '10', role: 'DC-I', x: 282, y: 76 },
        { num: '9', role: 'DC-D', x: 282, y: 144 }
      ],
      links: [[2, 5], [3, 6], [5, 6], [5, 7], [6, 8], [7, 8]]
    },
    {
      code: '1-3-5-0 (Falso 9)',
      overview: 'Población total del mediocampo con un Falso 9 que baja a recibir y dos extremos que atacan el espacio vacío.',
      defenseRole: 'Tres defensas (3, 4 y 2) con salida limpia por bajo.',
      midfieldRole: 'Pivote (6), dos interiores (8 y 10) y el Falso 9 (9) creando superioridad 4v2 en el medio.',
      attackRole: 'Los extremos (11 y 7) entran en diagonal al espacio que vacía el Falso 9.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'DF-I', x: 96, y: 52 },
        { num: '4', role: 'DF-C', x: 88, y: 110 },
        { num: '2', role: 'DF-D', x: 96, y: 168 },
        { num: '6', role: 'PIV', x: 158, y: 110 },
        { num: '8', role: 'INT-I', x: 202, y: 74 },
        { num: '10', role: 'INT-D', x: 202, y: 146 },
        { num: '11', role: 'EXT-I', x: 276, y: 38 },
        { num: '9', role: 'F9', x: 245, y: 110 }
      ],
      links: [[4, 5], [4, 6], [5, 8], [6, 8], [8, 7]]
    },
    {
      code: '1-4-1-3',
      overview: 'Línea de cuatro atrás protegida por un pivote ancla y tres hombres ofensivos arriba.',
      defenseRole: 'Cuatro defensores (3, 4, 5 y 2) bien escalonados.',
      midfieldRole: 'El pivote (6) barre delante de los centrales y conecta de primera con los tres de arriba.',
      attackRole: 'Dos extremos (11 y 7) y un punta (9) atacando de forma directa.',
      players: [
        { num: '1', role: 'POR', x: 28, y: 110, gk: true },
        { num: '3', role: 'LI', x: 96, y: 38 },
        { num: '4', role: 'DFC', x: 88, y: 86 },
        { num: '5', role: 'DFC', x: 88, y: 134 },
        { num: '2', role: 'LD', x: 96, y: 182 },
        { num: '6', role: 'MCD', x: 168, y: 110 },
        { num: '11', role: 'EI', x: 256, y: 46 },
        { num: '9', role: 'DC', x: 286, y: 110 },
        { num: '7', role: 'ED', x: 256, y: 174 }
      ],
      links: [[2, 5], [3, 5], [5, 6], [5, 7], [5, 8], [6, 7], [8, 7]]
    }
  ],
  'Fútbol 11': [
    {
      code: '1-4-3-3',
      overview: 'Ocupación completa de los 5 carriles con pivote posicional, dos interiores y tridente de ataque.',
      defenseRole: 'Dos centrales con buena salida (4 y 5) y laterales (3 y 2) que pasan al ataque en amplitud.',
      midfieldRole: 'Un volante central (6) que equilibra y dos interiores (8 y 10) que pisan zonas de remate.',
      attackRole: 'Dos extremos abiertos (11 y 7) en 1v1 y un 9 fijando a los centrales.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 95, y: 34 },
        { num: '4', role: 'DFC', x: 86, y: 84 },
        { num: '5', role: 'DFC', x: 86, y: 136 },
        { num: '2', role: 'LD', x: 95, y: 186 },
        { num: '6', role: 'PIV', x: 165, y: 110 },
        { num: '8', role: 'INT', x: 205, y: 68 },
        { num: '10', role: 'INT', x: 205, y: 152 },
        { num: '11', role: 'EI', x: 282, y: 42 },
        { num: '9', role: 'DC', x: 300, y: 110 },
        { num: '7', role: 'ED', x: 282, y: 178 }
      ],
      links: [[2, 5], [3, 5], [5, 6], [5, 7], [6, 8], [6, 9], [7, 10], [7, 9]]
    },
    {
      code: '1-4-2-3-1',
      overview: 'Seguridad con doble pivote delante de la defensa y un enganche libre detrás del 9.',
      defenseRole: 'Línea de cuatro respaldada siempre por dos volantes de contención.',
      midfieldRole: 'Doble pivote (6 y 8) que recupera y entrega limpio al enganche (10).',
      attackRole: 'Tres mediapuntas (11, 10 y 7) asociándose detrás del delantero centro (9).',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 94, y: 34 },
        { num: '4', role: 'DFC', x: 85, y: 84 },
        { num: '5', role: 'DFC', x: 85, y: 136 },
        { num: '2', role: 'LD', x: 94, y: 186 },
        { num: '6', role: 'MCD', x: 162, y: 82 },
        { num: '8', role: 'MCD', x: 162, y: 138 },
        { num: '11', role: 'EI', x: 235, y: 42 },
        { num: '10', role: 'MCO', x: 230, y: 110 },
        { num: '7', role: 'ED', x: 235, y: 178 },
        { num: '9', role: 'DC', x: 304, y: 110 }
      ],
      links: [[5, 6], [5, 8], [6, 8], [8, 7], [8, 9], [8, 10]]
    },
    {
      code: '1-3-5-2',
      overview: 'Tres centrales atrás, dos carrileros de recorrido completo y dupla de delanteros en ataque.',
      defenseRole: 'Tres centrales (3, 4 y 5) que sobran siempre contra un solo punta rival.',
      midfieldRole: 'Pivote (6), dos interiores (8 y 10) y dos carrileros (11 y 2) que hacen toda la banda.',
      attackRole: 'Dos delanteros (7 y 9) que tiran paredes y rematan los centros de los carrileros.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'DFC-I', x: 88, y: 58 },
        { num: '4', role: 'LIB', x: 82, y: 110 },
        { num: '5', role: 'DFC-D', x: 88, y: 162 },
        { num: '11', role: 'CAR-I', x: 188, y: 32 },
        { num: '6', role: 'PIV', x: 162, y: 110 },
        { num: '8', role: 'INT-I', x: 205, y: 78 },
        { num: '10', role: 'INT-D', x: 205, y: 142 },
        { num: '2', role: 'CAR-D', x: 188, y: 188 },
        { num: '7', role: 'DC-I', x: 294, y: 82 },
        { num: '9', role: 'DC-D', x: 294, y: 138 }
      ],
      links: [[2, 5], [5, 6], [5, 7], [4, 9], [8, 10], [6, 9], [7, 10]]
    },
    {
      code: '1-4-4-2 (Clásico)',
      overview: 'Dos líneas de cuatro muy ordenadas y compactas con dos delanteros arriba.',
      defenseRole: 'Línea de cuatro clásica (3, 4, 5 y 2) cerrando espacios a lo ancho.',
      midfieldRole: 'Doble volante central (6 y 8) y dos volantes por afuera (11 y 7) que hacen el ida y vuelta.',
      attackRole: 'Un delantero de área (9) acompañado por un segunda punta móvil (10).',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 92, y: 34 },
        { num: '4', role: 'DFC', x: 86, y: 84 },
        { num: '5', role: 'DFC', x: 86, y: 136 },
        { num: '2', role: 'LD', x: 92, y: 186 },
        { num: '11', role: 'MI', x: 192, y: 38 },
        { num: '6', role: 'MC', x: 182, y: 86 },
        { num: '8', role: 'MC', x: 182, y: 134 },
        { num: '7', role: 'MD', x: 192, y: 182 },
        { num: '10', role: 'SD', x: 286, y: 80 },
        { num: '9', role: 'DC', x: 294, y: 140 }
      ],
      links: [[6, 7], [5, 9], [6, 9], [7, 10], [8, 10], [9, 10]]
    },
    {
      code: '1-4-4-2 (Rombo)',
      overview: 'Dominio del carril central con un 5 de marca, dos interiores y un 10 clásico detrás de dos puntas.',
      defenseRole: 'Los laterales (3 y 2) suben constantemente para dar toda la amplitud por las bandas.',
      midfieldRole: 'Rombo en el medio: pivote (5), dos interiores (8 y 6) y enganche (10).',
      attackRole: 'Dos delanteros (7 y 9) que tiran diagonales desde el centro hacia afuera.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 96, y: 34 },
        { num: '4', role: 'DFC', x: 86, y: 84 },
        { num: '5', role: 'DFC', x: 86, y: 136 },
        { num: '2', role: 'LD', x: 96, y: 186 },
        { num: '6', role: 'PIV', x: 154, y: 110 },
        { num: '8', role: 'INT-I', x: 196, y: 66 },
        { num: '7', role: 'INT-D', x: 196, y: 154 },
        { num: '10', role: 'ENG', x: 238, y: 110 },
        { num: '11', role: 'DC-I', x: 296, y: 78 },
        { num: '9', role: 'DC-D', x: 296, y: 142 }
      ],
      links: [[5, 6], [5, 7], [6, 8], [7, 8], [8, 9], [8, 10]]
    },
    {
      code: '1-3-4-3',
      overview: 'Sistema ofensivo de alta presión con tres centrales, cuatro volantes en línea y tres atacantes.',
      defenseRole: 'Tres centrales rápidos (3, 4 y 5) para defender con campo abierto.',
      midfieldRole: 'Doble mediocentro (6 y 8) flanqueado por dos carrileros profundos (11 y 2).',
      attackRole: 'Tridente ofensivo (7, 9 y 10) que fija y presiona la salida rival.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'DFC-I', x: 88, y: 56 },
        { num: '4', role: 'LIB', x: 82, y: 110 },
        { num: '5', role: 'DFC-D', x: 88, y: 164 },
        { num: '11', role: 'CAR-I', x: 185, y: 34 },
        { num: '6', role: 'MC', x: 178, y: 86 },
        { num: '8', role: 'MC', x: 178, y: 134 },
        { num: '2', role: 'CAR-D', x: 185, y: 186 },
        { num: '10', role: 'EI', x: 278, y: 48 },
        { num: '9', role: 'DC', x: 298, y: 110 },
        { num: '7', role: 'ED', x: 278, y: 172 }
      ],
      links: [[5, 6], [4, 8], [5, 8], [5, 9], [6, 9], [6, 10], [7, 10]]
    },
    {
      code: '1-4-1-4-1',
      overview: 'Pivote único barriendo delante de la defensa y línea de cuatro volantes ofensivos detrás del 9.',
      defenseRole: 'Cuatro defensas respaldados por un mediocentro posicional (6) que nunca pierde la zona.',
      midfieldRole: 'Dos interiores (8 y 10) y dos extremos (11 y 7) alineados para presionar y llegar en oleada.',
      attackRole: 'El delantero centro (9) fija a los centrales y abre huecos para la llegada de los interiores.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 92, y: 34 },
        { num: '4', role: 'DFC', x: 86, y: 84 },
        { num: '5', role: 'DFC', x: 86, y: 136 },
        { num: '2', role: 'LD', x: 92, y: 186 },
        { num: '6', role: 'MCD', x: 150, y: 110 },
        { num: '11', role: 'MI', x: 218, y: 36 },
        { num: '8', role: 'INT-I', x: 212, y: 84 },
        { num: '10', role: 'INT-D', x: 212, y: 136 },
        { num: '7', role: 'MD', x: 218, y: 184 },
        { num: '9', role: 'DC', x: 298, y: 110 }
      ],
      links: [[5, 7], [5, 8], [7, 9], [8, 9], [6, 9], [9, 10]]
    },
    {
      code: '1-4-3-2-1 (Árbol de Navidad)',
      overview: 'Superioridad interior con tres volantes de contención/creación y dos mediapuntas cerrados detrás del 9.',
      defenseRole: 'Línea de cuatro donde los laterales (3 y 2) suben como carrileros por las bandas libres.',
      midfieldRole: 'Tridente central (6, 8 y 5) que blinda el medio y entrega a los dos enganches.',
      attackRole: 'Dos mediapuntas creativos (10 y 7) filtrando pases al delantero centro (9).',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 94, y: 34 },
        { num: '4', role: 'DFC', x: 86, y: 84 },
        { num: '5', role: 'DFC', x: 86, y: 136 },
        { num: '2', role: 'LD', x: 94, y: 186 },
        { num: '8', role: 'MC-I', x: 168, y: 66 },
        { num: '6', role: 'PIV', x: 160, y: 110 },
        { num: '14', role: 'MC-D', x: 168, y: 154 },
        { num: '10', role: 'MCO-I', x: 238, y: 80 },
        { num: '7', role: 'MCO-D', x: 238, y: 140 },
        { num: '9', role: 'DC', x: 300, y: 110 }
      ],
      links: [[6, 5], [6, 7], [5, 8], [7, 9], [8, 10], [9, 10]]
    },
    {
      code: '1-5-3-2 (Bloque Bajo)',
      overview: 'Cerrojo defensivo con línea de cinco atrás, tres volantes de contención y dos puntas rápidos para contragolpear.',
      defenseRole: 'Cinco defensores (3, 4, 5, 6 y 2) que blindan el área y cierran todos los pasillos.',
      midfieldRole: 'Tres volantes juntos (8, 14 y 10) que basculan y lanzan al espacio tras robo.',
      attackRole: 'Dos puntas veloces (7 y 9) listos para correr al contragolpe.',
      players: [
        { num: '1', role: 'POR', x: 26, y: 110, gk: true },
        { num: '3', role: 'LI', x: 86, y: 30 },
        { num: '4', role: 'DFC-I', x: 78, y: 70 },
        { num: '5', role: 'LIB', x: 74, y: 110 },
        { num: '6', role: 'DFC-D', x: 78, y: 150 },
        { num: '2', role: 'LD', x: 86, y: 190 },
        { num: '8', role: 'MC-I', x: 164, y: 68 },
        { num: '14', role: 'MCD', x: 156, y: 110 },
        { num: '10', role: 'MC-D', x: 164, y: 152 },
        { num: '7', role: 'DC-I', x: 276, y: 80 },
        { num: '9', role: 'DC-D', x: 276, y: 140 }
      ],
      links: [[3, 7], [6, 7], [7, 8], [6, 9], [8, 10], [9, 10]]
    }
  ]
};

export const FUTSAL_ATTACK_PLAYS = [
  {
    name: 'Tiro de Esquina (Arrastre al Primer Palo)',
    steps: [
      'El Ala (idx 2) se ubica en la esquina derecha junto al balón.',
      'El Pívot (idx 4) pica al primer palo arrastrando al cierre rival.',
      'El Ala opuesta (idx 3) entra al punto penal, recibe el pase raso y fusila al arco.'
    ],
    movements: [
      { playerIndex: 2, startX: 344, startY: 18, endX: 334, endY: 28 },
      { playerIndex: 4, startX: 282, startY: 112, endX: 326, endY: 66 },
      { playerIndex: 3, startX: 220, startY: 162, endX: 292, endY: 112 },
      { playerIndex: 1, startX: 175, startY: 110, endX: 215, endY: 110 }
    ],
    ballPath: [
      { x: 344, y: 18 },
      { x: 292, y: 112, type: 'pass' },
      { x: 348, y: 110, type: 'shot' }
    ],
    zones: [{ cx: 292, cy: 112, r: 16 }]
  },
  {
    name: 'Córner (Cortina al Segundo Palo)',
    steps: [
      'El Ala (idx 2) cobra el córner desde banda derecha.',
      'El Pívot (idx 4) bloquea en el centro del área para liberar el carril exterior.',
      'El Cierre (idx 1) llega desde atrás hacia la frontal, recibe de aire o raso y remata.'
    ],
    movements: [
      { playerIndex: 2, startX: 344, startY: 18, endX: 330, endY: 32 },
      { playerIndex: 4, startX: 295, startY: 98, endX: 315, endY: 82 },
      { playerIndex: 3, startX: 270, startY: 145, endX: 322, endY: 158 },
      { playerIndex: 1, startX: 165, startY: 110, endX: 258, endY: 115 }
    ],
    ballPath: [
      { x: 344, y: 18 },
      { x: 258, y: 115, type: 'pass' },
      { x: 348, y: 112, type: 'shot' }
    ],
    zones: [{ cx: 258, cy: 115, r: 17 }]
  },
  {
    name: 'Tiro Libre Frontal (Pared y Remate)',
    steps: [
      'El Cierre (idx 1) y el Ala (idx 2) se paran frente al balón en la frontal del área.',
      'El Pívot (idx 4) hace pantalla en el poste derecho de la barrera.',
      'El Cierre toca corto al Ala (idx 3) que entra por derecha y define cruzado.'
    ],
    movements: [
      { playerIndex: 1, startX: 245, startY: 108, endX: 240, endY: 108 },
      { playerIndex: 2, startX: 248, startY: 90, endX: 305, endY: 64 },
      { playerIndex: 4, startX: 286, startY: 108, endX: 318, endY: 94 },
      { playerIndex: 3, startX: 235, startY: 162, endX: 288, endY: 145 }
    ],
    ballPath: [
      { x: 245, y: 108 },
      { x: 288, y: 145, type: 'pass' },
      { x: 348, y: 104, type: 'shot' }
    ],
    zones: [{ cx: 288, cy: 145, r: 16 }]
  },
  {
    name: 'Tiro Libre Lateral (Centro Pasado)',
    steps: [
      'El Ala (idx 2) cobra la falta desde banda izquierda en tres cuartos.',
      'El Cierre (idx 1) amaga venir en apoyo corto para arrastrar una marca.',
      'Pase tenso al segundo palo donde el Pívot (idx 4) entra solo para empujarla.'
    ],
    movements: [
      { playerIndex: 2, startX: 252, startY: 26, endX: 256, endY: 32 },
      { playerIndex: 1, startX: 195, startY: 95, endX: 230, endY: 62 },
      { playerIndex: 3, startX: 265, startY: 120, endX: 310, endY: 102 },
      { playerIndex: 4, startX: 270, startY: 175, endX: 326, endY: 148 }
    ],
    ballPath: [
      { x: 252, y: 26 },
      { x: 326, y: 148, type: 'pass' },
      { x: 348, y: 114, type: 'shot' }
    ],
    zones: [{ cx: 326, cy: 148, r: 16 }]
  },
  {
    name: 'Saque de Banda Ofensivo (Triangulación)',
    steps: [
      'El Ala (idx 2) saca de banda hacia el Cierre (idx 1) en el eje central.',
      'El Pívot (idx 4) bloquea al defensor de banda y pica al área.',
      'El Cierre devuelve en pared profunda al Ala (idx 2) que corta hacia adentro y remata.'
    ],
    movements: [
      { playerIndex: 2, startX: 215, startY: 16, endX: 296, endY: 58 },
      { playerIndex: 1, startX: 185, startY: 92, endX: 222, endY: 76 },
      { playerIndex: 4, startX: 278, startY: 85, endX: 318, endY: 112 },
      { playerIndex: 3, startX: 210, startY: 168, endX: 295, endY: 156 }
    ],
    ballPath: [
      { x: 215, y: 16 },
      { x: 222, y: 76, type: 'pass' },
      { x: 296, y: 58, type: 'pass' },
      { x: 348, y: 108, type: 'shot' }
    ],
    zones: [{ cx: 296, cy: 58, r: 16 }]
  }
];

export const FUTSAL_DEFENSE_PLAYS = [
  {
    name: 'Defensa de Córner (Marcaje Mixto y Despeje)',
    steps: [
      'El Portero (1) y el Cierre (idx 1) cierran el primer palo y la línea de pase raso.',
      'Las Alas (idx 2 y 3) toman marcas individuales en el corazón del área.',
      'El Cierre anticipa el centro en el primer palo y lanza el contragolpe con el Pívot (idx 4).'
    ],
    movements: [
      { playerIndex: 0, startX: 22, startY: 102, endX: 24, endY: 106 },
      { playerIndex: 1, startX: 44, startY: 76, endX: 56, endY: 62 },
      { playerIndex: 2, startX: 62, startY: 105, endX: 74, endY: 96 },
      { playerIndex: 3, startX: 58, startY: 142, endX: 72, endY: 135 },
      { playerIndex: 4, startX: 115, startY: 115, endX: 215, endY: 110 }
    ],
    ballPath: [
      { x: 16, y: 18 },
      { x: 56, y: 62, type: 'pass' },
      { x: 215, y: 110, type: 'shot' }
    ],
    zones: [{ cx: 56, cy: 62, r: 16 }]
  },
  {
    name: 'Defensa de Falta Frontal (Barrera y Achique)',
    steps: [
      'Las dos Alas (idx 2 y 3) arman la barrera firme a 5 metros protegiendo el palo.',
      'El Cierre (idx 1) vigila el pase corto al segundo palo.',
      'Apenas el rival toca en corto, el Ala (idx 2) salta a bloquear el tiro y despeja a campo rival.'
    ],
    movements: [
      { playerIndex: 0, startX: 22, startY: 114, endX: 24, endY: 112 },
      { playerIndex: 2, startX: 78, startY: 102, endX: 104, endY: 96 },
      { playerIndex: 3, startX: 78, startY: 116, endX: 82, endY: 116 },
      { playerIndex: 1, startX: 54, startY: 145, endX: 76, endY: 138 },
      { playerIndex: 4, startX: 135, startY: 72, endX: 225, endY: 64 }
    ],
    ballPath: [
      { x: 112, y: 108 },
      { x: 104, y: 96, type: 'pass' },
      { x: 225, y: 64, type: 'shot' }
    ],
    zones: [{ cx: 104, cy: 96, r: 16 }]
  },
  {
    name: 'Presión en Salida Rival (Bloqueo de Líneas de Pase)',
    steps: [
      'El Pívot (idx 4) curva su carrera para tapar al central derecho y encerrar al sacador.',
      'Las Alas (idx 2 y 3) adelantan 15 metros para saltar sobre los pases de banda.',
      'El Ala izquierda (idx 2) intercepta el pase forzado y define directo al arco.'
    ],
    movements: [
      { playerIndex: 4, startX: 235, startY: 110, endX: 292, endY: 92 },
      { playerIndex: 2, startX: 195, startY: 55, endX: 264, endY: 48 },
      { playerIndex: 3, startX: 195, startY: 165, endX: 255, endY: 158 },
      { playerIndex: 1, startX: 135, startY: 110, endX: 195, endY: 105 }
    ],
    ballPath: [
      { x: 315, y: 78 },
      { x: 264, y: 48, type: 'pass' },
      { x: 348, y: 108, type: 'shot' }
    ],
    zones: [{ cx: 264, cy: 48, r: 16 }]
  }
];

export const FIELD_ATTACK_PLAYS = [
  {
    name: 'Tiro de Esquina (Arrastre al Primer Palo)',
    steps: [
      'El cobrador se ubica en el banderín de córner derecho junto al balón.',
      'El Delantero (9) ataca el primer palo arrastrando a la defensa.',
      'El segundo atacante entra de frente al punto penal, cabecea el centro y anota.'
    ],
    movements: [
      { playerIndex: -2, startX: 344, startY: 18, endX: 334, endY: 28 },
      { playerIndex: -1, startX: 282, startY: 118, endX: 326, endY: 72 },
      { playerIndex: -3, startX: 228, startY: 135, endX: 306, endY: 106 },
      { playerIndex: 1, startX: 205, startY: 78, endX: 278, endY: 88 }
    ],
    ballPath: [
      { x: 344, y: 18 },
      { x: 306, y: 106, type: 'pass' },
      { x: 348, y: 112, type: 'shot' }
    ],
    zones: [{ cx: 306, cy: 106, r: 17 }]
  },
  {
    name: 'Córner (Cortina al Segundo Palo)',
    steps: [
      'Cobro de esquina desde la derecha hacia la zona pasada del área.',
      'Dos jugadores bloquean y arrastran marcas hacia el primer palo.',
      'El defensor/interior entra por el segundo palo libre de marca para definir.'
    ],
    movements: [
      { playerIndex: -2, startX: 344, startY: 18, endX: 332, endY: 30 },
      { playerIndex: -1, startX: 292, startY: 96, endX: 325, endY: 68 },
      { playerIndex: -3, startX: 235, startY: 162, endX: 316, endY: 152 },
      { playerIndex: 1, startX: 210, startY: 110, endX: 268, endY: 112 }
    ],
    ballPath: [
      { x: 344, y: 18 },
      { x: 316, y: 152, type: 'pass' },
      { x: 348, y: 116, type: 'shot' }
    ],
    zones: [{ cx: 316, cy: 152, r: 17 }]
  },
  {
    name: 'Tiro Libre Frontal (Pared y Remate)',
    steps: [
      'Dos volantes se paran frente a la pelota en la frontal del área.',
      'El delantero pica al costado de la barrera habilitado.',
      'Toque corto filtrado al desmarque y remate cruzado de primera.'
    ],
    movements: [
      { playerIndex: -2, startX: 246, startY: 112, endX: 242, endY: 112 },
      { playerIndex: -3, startX: 248, startY: 92, endX: 304, endY: 72 },
      { playerIndex: -1, startX: 288, startY: 126, endX: 320, endY: 132 }
    ],
    ballPath: [
      { x: 246, y: 112 },
      { x: 304, y: 72, type: 'pass' },
      { x: 348, y: 106, type: 'shot' }
    ],
    zones: [{ cx: 304, cy: 72, r: 16 }]
  },
  {
    name: 'Tiro Libre Lateral (Centro Pasado)',
    steps: [
      'Tiro libre desde banda izquierda en tres cuartos de cancha.',
      'La línea de atacantes sostiene el fuera de juego en el borde del área.',
      'Centro pasado al segundo palo para bajarla al medio donde define el 9.'
    ],
    movements: [
      { playerIndex: -2, startX: 248, startY: 28, endX: 254, endY: 34 },
      { playerIndex: 1, startX: 245, startY: 145, endX: 318, endY: 154 },
      { playerIndex: -1, startX: 255, startY: 108, endX: 318, endY: 110 },
      { playerIndex: -3, startX: 248, startY: 75, endX: 308, endY: 78 }
    ],
    ballPath: [
      { x: 248, y: 28 },
      { x: 318, y: 154, type: 'pass' },
      { x: 318, y: 110, type: 'pass' },
      { x: 348, y: 110, type: 'shot' }
    ],
    zones: [{ cx: 318, cy: 110, r: 17 }]
  },
  {
    name: 'Saque de Banda Ofensivo (Triangulación)',
    steps: [
      'El jugador de banda saca hacia el delantero que viene en apoyo.',
      'El delantero aguanta de espaldas y descarga de cara al volante interior.',
      'El volante filtra al espacio para la diagonal del atacante que define.'
    ],
    movements: [
      { playerIndex: -2, startX: 262, startY: 16, endX: 320, endY: 54 },
      { playerIndex: -1, startX: 295, startY: 82, endX: 284, endY: 66 },
      { playerIndex: -3, startX: 222, startY: 92, endX: 252, endY: 82 }
    ],
    ballPath: [
      { x: 262, y: 16 },
      { x: 284, y: 66, type: 'pass' },
      { x: 252, y: 82, type: 'pass' },
      { x: 320, y: 54, type: 'pass' },
      { x: 348, y: 106, type: 'shot' }
    ],
    zones: [{ cx: 320, cy: 54, r: 16 }]
  }
];

export const FIELD_DEFENSE_PLAYS = [
  {
    name: 'Defensa de Córner (Marcaje Mixto y Despeje)',
    steps: [
      'Defensas posicionados en zona en el primer palo y punto penal.',
      'El central principal ataca la pelota en su punto más alto y despeja.',
      'El delantero descolgado recibe en mitad de cancha para iniciar la contra.'
    ],
    movements: [
      { playerIndex: 0, startX: 20, startY: 108, endX: 24, endY: 106 },
      { playerIndex: 1, startX: 42, startY: 78, endX: 54, endY: 66 },
      { playerIndex: 2, startX: 48, startY: 110, endX: 60, endY: 102 },
      { playerIndex: 3, startX: 46, startY: 142, endX: 58, endY: 136 },
      { playerIndex: -1, startX: 145, startY: 110, endX: 235, endY: 110 }
    ],
    ballPath: [
      { x: 16, y: 18 },
      { x: 54, y: 66, type: 'pass' },
      { x: 235, y: 110, type: 'shot' }
    ],
    zones: [{ cx: 54, cy: 66, r: 17 }]
  },
  {
    name: 'Defensa de Falta Frontal (Barrera y Achique)',
    steps: [
      'Los volantes conforman la barrera cubriendo el primer palo del arquero.',
      'La línea defensiva se mantiene en el borde del área grande lista para achicar.',
      'Al cobro rival, la barrera bloquea/despeja y todo el bloque achica hacia adelante.'
    ],
    movements: [
      { playerIndex: 0, startX: 22, startY: 114, endX: 24, endY: 112 },
      { playerIndex: 1, startX: 58, startY: 75, endX: 84, endY: 75 },
      { playerIndex: 2, startX: 58, startY: 112, endX: 84, endY: 112 },
      { playerIndex: 3, startX: 82, startY: 98, endX: 106, endY: 96 },
      { playerIndex: -1, startX: 155, startY: 110, endX: 240, endY: 95 }
    ],
    ballPath: [
      { x: 116, y: 104 },
      { x: 106, y: 96, type: 'pass' },
      { x: 240, y: 95, type: 'shot' }
    ],
    zones: [{ cx: 106, cy: 96, r: 16 }]
  },
  {
    name: 'Presión en Salida Rival (Bloqueo de Líneas de Pase)',
    steps: [
      'El delantero centro (9) presiona en arco cerrando el pase entre centrales.',
      'Los volantes/extremos saltan sobre el lateral receptor en banda.',
      'Robo en tres cuartos de cancha y pase directo de definición.'
    ],
    movements: [
      { playerIndex: -1, startX: 240, startY: 110, endX: 296, endY: 96 },
      { playerIndex: -2, startX: 210, startY: 52, endX: 272, endY: 46 },
      { playerIndex: -3, startX: 205, startY: 162, endX: 262, endY: 152 },
      { playerIndex: 1, startX: 125, startY: 85, endX: 172, endY: 85 }
    ],
    ballPath: [
      { x: 315, y: 72 },
      { x: 272, y: 46, type: 'pass' },
      { x: 296, y: 96, type: 'pass' },
      { x: 348, y: 110, type: 'shot' }
    ],
    zones: [{ cx: 272, cy: 46, r: 16 }]
  }
];

export const NATURAL_POSITIONS_FUTSAL = [
  { code: 'POR', label: 'POR · Portero' },
  { code: 'CIE', label: 'CIE · Cierre' },
  { code: 'ALA', label: 'ALA · Ala' },
  { code: 'PIV', label: 'PIV · Pívot' }
];

export const NATURAL_POSITIONS_FIELD = [
  { code: 'POR', label: 'POR · Portero' },
  { code: 'DFC', label: 'DFC · Defensa Central' },
  { code: 'LD', label: 'LD · Lateral / Carrilero Der.' },
  { code: 'LI', label: 'LI · Lateral / Carrilero Izq.' },
  { code: 'MCD', label: 'MCD · Pivote Defensivo' },
  { code: 'MC', label: 'MC · Volante Mixto / Interior' },
  { code: 'MCO', label: 'MCO · Enganche / Mediapunta' },
  { code: 'ED', label: 'ED · Extremo Derecho' },
  { code: 'EI', label: 'EI · Extremo Izquierdo' },
  { code: 'DC', label: 'DC · Delantero Centro' }
];

export function getSetPiecesForCurrentSelection() {
  if (state.setPieceCategory === 'free') {
    return [];
  }
  const isFutsal = state.modality === 'Futsal';
  if (state.setPieceCategory === 'attack') {
    return isFutsal ? FUTSAL_ATTACK_PLAYS : FIELD_ATTACK_PLAYS;
  }
  return isFutsal ? FUTSAL_DEFENSE_PLAYS : FIELD_DEFENSE_PLAYS;
}

export function getActiveFormationSetup() {
  const list = FORMATIONS_BY_MODALITY[state.modality] || FORMATIONS_BY_MODALITY['Futsal'];
  return list[state.formationIndex % list.length];
}

export function getActiveSetPiece() {
  const list = getSetPiecesForCurrentSelection();
  if (!list || list.length === 0) {
    return null;
  }
  return list[state.setPieceIndex % list.length];
}

export function getActiveSquadFormationSetup() {
  const list = FORMATIONS_BY_MODALITY[state.squadModality] || FORMATIONS_BY_MODALITY['Fútbol 11'];
  return list[state.squadFormationIndex % list.length];
}

export function resolveReferenceCoach(modality, formationCode, playStyle) {
  if (modality === 'Futsal') {
    if (formationCode.startsWith('1-4-0') || playStyle.includes('Rotación')) {
      return {
        name: 'Jesús Velasco / Marquinhos Xavier (Selección de Brasil)',
        badge: 'Referente Directo Futsal',
        isAdapted: false,
        note: 'Maestros del 1-4-0 con rotación continua de cuatro universales, cortes a la espalda y movilidad total sin pívot fijo.'
      };
    }
    if (formationCode.startsWith('5-0')) {
      return {
        name: 'Tino Pérez / Kaka (Especialistas en 5v4)',
        badge: 'Referente Directo Futsal',
        isAdapted: false,
        note: 'Referentes en circulación paciente con Portero-Jugador para hundir el rombo defensivo rival y definir en el segundo palo.'
      };
    }
    if (formationCode.startsWith('1-2-2') || playStyle.includes('Bloque Bajo')) {
      return {
        name: 'Jorge Braz (Selección de Portugal) / Diego Giustozzi',
        badge: 'Referente Directo Futsal',
        isAdapted: false,
        note: 'Campeones del mundo utilizando el cuadrado 1-2-2 con orden defensivo férreo, duelos 1v1 en ala y transiciones letales.'
      };
    }
    if (playStyle.includes('Presión Alta') || formationCode.includes('Presión Alta')) {
      return {
        name: 'Matías Lucuix (Selección Argentina) / Duda',
        badge: 'Referente Directo Futsal',
        isAdapted: false,
        note: 'Presión asfixiante en primera línea sobre el cierre rival y ayudas inmediatas para robar en cancha contraria.'
      };
    }
    return {
      name: 'Venancio López / Jesús Velasco (Escuela Española)',
      badge: 'Referente Directo Futsal',
      isAdapted: false,
      note: 'Referentes históricos del 1-3-1 en rombo conectando con el pívot de espaldas y llegada explosiva de las alas.'
    };
  }

  const isAdapted = modality === 'Fútbol 7' || modality === 'Fútbol 9';
  const badgeText = isAdapted
    ? 'Referente adaptado de Fútbol 11 / Futsal'
    : 'Referente Directo Fútbol 11';
  const adaptedPrefix = isAdapted
    ? `Idea táctica de Fútbol 11 adaptada a las dimensiones de ${modality}: `
    : '';

  if (formationCode.includes('1-5-3-2') || formationCode.includes('1-4-1-1') || playStyle.includes('Bloque Bajo')) {
    return {
      name: 'Diego "Cholo" Simeone / José Mourinho',
      badge: badgeText,
      isAdapted,
      note: `${adaptedPrefix}Bloque corto e impenetrable cerca de su área, ayudas solidarias por dentro y contragolpe vertical al espacio.`
    };
  }
  if (formationCode.includes('1-3-5-2') || (formationCode.includes('1-3-3-2') && !playStyle.includes('Posesión'))) {
    return {
      name: 'Simone Inzaghi (Inter) / Antonio Conte',
      badge: badgeText,
      isAdapted,
      note: `${adaptedPrefix}Salida limpia con tres centrales, carrileros profundos de banda a banda y dos delanteros que combinan de memoria.`
    };
  }
  if (formationCode.includes('1-3-4-3') || formationCode.includes('1-3-2-3') || formationCode.includes('1-3-3')) {
    return {
      name: 'Xabi Alonso (Leverkusen) / Thomas Tuchel',
      badge: badgeText,
      isAdapted,
      note: `${adaptedPrefix}Amplitud total con carrileros altos, doble pivote asociativo y presión inmediata tras pérdida en campo rival.`
    };
  }
  if (formationCode.includes('Rombo') || formationCode.includes('Árbol') || formationCode.includes('1-4-3-2-1') || formationCode.includes('1-4-2-3-1')) {
    return {
      name: 'Carlo Ancelotti / Zinedine Zidane',
      badge: badgeText,
      isAdapted,
      note: `${adaptedPrefix}Superioridad técnica por el carril central con mediapuntas libres, equilibrio del pivote y transiciones rápidas.`
    };
  }
  if (playStyle.includes('Presión Alta') || playStyle.includes('Directo')) {
    return {
      name: 'Jürgen Klopp / Hansi Flick',
      badge: badgeText,
      isAdapted,
      note: `${adaptedPrefix}Gegenpressing puro: línea defensiva adelantada, recuperación en menos de 5 segundos y ataques verticales.`
    };
  }
  return {
    name: 'Pep Guardiola / Luis Enrique',
    badge: badgeText,
    isAdapted,
    note: `${adaptedPrefix}Juego de posición, salida limpia desde el arquero, triángulos en las bandas y superioridad en el mediocampo.`
  };
}

export function updateContextBadges() {
  const setup = getActiveFormationSetup();
  const shortStyle = state.playStyle.split('(')[0].split('&')[0].trim();
  const synergyPct = state.squadOptimization?.globalSynergy;
  const synergyClause = synergyPct ? ` · Sinergia ${synergyPct}%` : '';
  const nextHudText = `${state.modality} · ${setup.code} · ${shortStyle}${synergyClause}`;

  if (dom.headerModalityBadge) {
    dom.headerModalityBadge.textContent = nextHudText;
    if (lastHudText && lastHudText !== nextHudText) {
      const pillEl = dom.headerModalityBadge.closest('.active-modality-pill') || dom.headerModalityBadge;
      gsap.fromTo(
        pillEl,
        { scale: 1.08 },
        { scale: 1, duration: 0.3, ease: 'back.out(2)', overwrite: 'auto' }
      );
    }
    lastHudText = nextHudText;
  }

  dom.inputModalityTag.textContent = `${state.modality} · ${setup.code.split(' ')[0]}`;
  dom.sidebarFormationLabel.textContent = setup.code;
  dom.sidebarStyleLabel.textContent = state.playStyle;
  if (dom.sidebarSquadLabel) {
    const count = state.squadPlayers.length;
    dom.sidebarSquadLabel.textContent = count > 0
      ? `${count} jugadores en PostgreSQL`
      : 'PostgreSQL + Top 100 Activa';
  }
  if (dom.sidebarSynergyValue) {
    dom.sidebarSynergyValue.textContent = synergyPct ? `${synergyPct}%` : 'Sin nómina';
  }
  if (dom.sidebarSetpieceValue) {
    const activePlay = getActiveSetPiece();
    dom.sidebarSetpieceValue.textContent = activePlay
      ? activePlay.name.split('—')[0].trim()
      : 'Juego libre';
  }
  if (dom.sidebarCameraValue) {
    dom.sidebarCameraValue.textContent = state.isStadium3DView
      ? 'Estadio 3D'
      : state.isTv25DView
        ? 'TV 2.5D'
        : '2D Cenital';
  }
  if (synergyPct && (dom.squadGlobalSynergy || dom.squadSynergyTier)) {
    const tierClass = synergyPct >= 85 ? 'synergy-high' : synergyPct >= 70 ? 'synergy-mid' : 'synergy-low';
    const tierText = synergyPct >= 85 ? 'Óptima' : synergyPct >= 70 ? 'Media' : 'Baja';
    [dom.squadGlobalSynergy, dom.squadSynergyTier].forEach((el) => {
      if (!el) return;
      el.classList.remove('synergy-high', 'synergy-mid', 'synergy-low');
      el.classList.add(tierClass);
    });
    if (dom.squadSynergyTier) {
      dom.squadSynergyTier.textContent = tierText;
    }
  }
}

export function isStrictNaturalPositionMatch(playerPos, slotRole) {
  const pos = String(playerPos || '').toUpperCase().trim();
  const slot = String(slotRole || '').toUpperCase().trim();
  if (pos === slot) return true;
  if (pos === 'POR') return slot === 'POR' || slot === 'PJ' || slot.includes('PORTERO');
  if (slot === 'POR' || slot === 'PJ' || slot.includes('PORTERO')) return false;

  switch (pos) {
    case 'CIE':
      return slot.startsWith('CIE') || slot.startsWith('UNI') || slot.startsWith('INT') || slot === 'FIXO';
    case 'ALA':
      return slot.startsWith('ALA') || slot.startsWith('INT') || slot.startsWith('ENG') || slot.startsWith('UNI') || slot.startsWith('CIE-') || slot.startsWith('PIV-');
    case 'PIV':
      return slot.startsWith('PIV') || slot.startsWith('UNI') || slot === 'ENG' || slot.includes('PÍVOT');
    case 'DFC':
      return slot.startsWith('DFC') || slot.startsWith('DF-') || slot === 'LIB';
    case 'LD':
      return slot === 'LD' || slot === 'LAT-D' || slot === 'CAR-D' || slot === 'DF-D' || slot === 'MD' || slot === 'CAD';
    case 'LI':
      return slot === 'LI' || slot === 'LAT-I' || slot === 'CAR-I' || slot === 'DF-I' || slot === 'MI' || slot === 'CAI';
    case 'MCD':
      return slot.startsWith('MCD') || slot === 'PIV' || slot.startsWith('MC') || slot.startsWith('INT');
    case 'MC':
      return slot.startsWith('MC') || slot.startsWith('INT') || slot === 'PIV';
    case 'MCO':
      return slot.startsWith('MCO') || slot === 'ENG' || slot.startsWith('INT') || slot.startsWith('MC') || slot === 'SD' || slot === 'F9';
    case 'ED':
      return slot === 'ED' || slot === 'EXT-D' || slot === 'MD' || slot === 'CAR-D' || slot === 'DC-D' || slot === 'SD';
    case 'EI':
      return slot === 'EI' || slot === 'EXT-I' || slot === 'MI' || slot === 'CAR-I' || slot === 'DC-I' || slot === 'SD';
    case 'DC':
      return slot.startsWith('DC') || slot === 'SD' || slot === 'F9' || slot === '9';
    default:
      return false;
  }
}
