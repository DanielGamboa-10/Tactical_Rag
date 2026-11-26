/* ==========================================================================
   Tab 1 UI View: Asistente Táctico RAG & Header System Controls
   ========================================================================== */

import gsap from 'gsap';
import { api, getStoredAuthSession } from '../services/api.js';
import { isDemoSession, isDemoExhausted, syncDemoQuotaUI, showDemoLimitModal } from './authView.js';
import {
  state,
  dom,
  escapeHtml,
  showToast,
  switchTab,
  formatFormationLabel,
  triggerTacticalShockwave,
  getActiveFormationSetup
} from '../store/tacticalStore.js';
import {
  clearPlaybackTimers,
  renderTacticalPitch,
  playSetPieceAnimation
} from '../engine/pitchEngine.js';
import { populateFormationDropdown, populateSetPieceDropdown, syncFormationByCode } from './pitchView.js';

export async function checkBackendHealth() {
  dom.backendStatusBtn.className = 'status-badge checking';
  dom.backendStatusText.textContent = 'Conectando a :8000...';

  try {
    const data = await api.checkHealth();
    dom.backendStatusBtn.className = 'status-badge online';
    dom.backendStatusText.textContent = `${data.service || 'Spring Boot API'} · Online`;
  } catch (err) {
    dom.backendStatusBtn.className = 'status-badge offline';
    dom.backendStatusText.textContent = 'Backend 8000 Offline';
  }
}

export function setModality(newModality, playersTag = null) {
  clearPlaybackTimers();
  state.modality = newModality;
  state.formationIndex = 0;
  state.setPieceIndex = 0;
  state.setPieceStep = 0;

  dom.modalitySelector.querySelectorAll('.modality-btn').forEach((btn) => {
    const isMatch = btn.dataset.modality === newModality;
    btn.classList.toggle('active', isMatch);
    btn.setAttribute('aria-checked', String(isMatch));
    if (isMatch && !playersTag) {
      playersTag = btn.dataset.players;
    }
  });

  dom.boardModalityPills.querySelectorAll('.board-mod-pill').forEach((pill) => {
    const isPillMatch = pill.dataset.modality === newModality;
    pill.classList.toggle('active', isPillMatch);
    pill.setAttribute('aria-pressed', String(isPillMatch));
  });

  if (playersTag && dom.playersCountTag) {
    dom.playersCountTag.textContent = playersTag;
  }

  populateFormationDropdown();
  populateSetPieceDropdown();
  renderTacticalPitch(true);
  if (state.setPieceCategory !== 'free') {
    playSetPieceAnimation();
  }
}

function scrollToBottom() {
  if (!dom.chatMessages) return;
  requestAnimationFrame(() => {
    dom.chatMessages.scrollTo({
      top: dom.chatMessages.scrollHeight,
      behavior: 'smooth'
    });
  });
}

export function appendWelcomeMessage({ animate = true } = {}) {
  dom.chatMessages.innerHTML = '';
  const activeSetup = getActiveFormationSetup();
  appendAssistantMessage(
    {
      reply:
        'Bienvenido al módulo de análisis de **TacticalPlay RAG**.\n\n' +
        '* Consulta ajustes posicionales, superioridades por zona o variantes tácticas adaptadas a los perfiles registrados en **Gestión de Plantilla**.\n' +
        '* En **Pizarra Táctica** dispones de 30 sistemas estructurados, el **Modelo Táctico de Referencia** y secuencias de **Balón Parado** sincronizadas en 2D, 2.5D y Estadio 3D.',
      modality: state.modality,
      suggestedFormation: activeSetup.code,
      sources: ['Motor Vectorial pgvector + Wikipedia API']
    },
    { animate }
  );
}

function appendUserMessage(text, modality, formation, playStyle, { scroll = true } = {}) {
  const row = document.createElement('div');
  row.className = 'message-row user';
  row.innerHTML = `
    <div class="message-meta">
      <span>Entrenador</span>
      <span>·</span>
      <span>${escapeHtml(modality)} (${escapeHtml(formatFormationLabel(formation))} · ${escapeHtml(playStyle)})</span>
    </div>
    <div class="message-bubble">${escapeHtml(text)}</div>
  `;
  dom.chatMessages.appendChild(row);
  if (scroll) {
    scrollToBottom();
  }
}

function showTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.id = 'typing-row';
  row.innerHTML = `
    <div class="message-meta">
      <span>Entrenador IA</span>
      <span>·</span>
      <span>Preparando indicaciones de cancha...</span>
    </div>
    <div class="typing-indicator">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;
  dom.chatMessages.appendChild(row);
  scrollToBottom();
}

function removeTypingIndicator() {
  const existing = document.getElementById('typing-row');
  if (existing) existing.remove();
}

function formatMarkdownToHtml(rawText) {
  if (!rawText) return '';

  const lines = String(rawText).replace(/\r\n/g, '\n').split('\n');
  const htmlParts = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      htmlParts.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      htmlParts.push('</ol>');
      inOl = false;
    }
  };

  const formatInline = (text) => {
    let safe = escapeHtml(text);
    safe = safe.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/__(.+?)__/g, '<strong>$1</strong>');
    safe = safe.replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    safe = safe.replace(/\*\*/g, '');
    return safe;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeLists();
      continue;
    }

    const blockquoteMatch = line.match(/^&gt;\s?(.*)$/) || line.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      closeLists();
      htmlParts.push(`<blockquote class="chat-blockquote">${formatInline(blockquoteMatch[1])}</blockquote>`);
      continue;
    }

    const headingMatch = line.match(/^#{1,4}\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      htmlParts.push(`<h4 class="chat-heading">${formatInline(headingMatch[1])}</h4>`);
      continue;
    }

    const olMatch = line.match(/^\d+[.)]\s+(.*)$/);
    if (olMatch) {
      if (inUl) {
        htmlParts.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        htmlParts.push('<ol class="chat-list">');
        inOl = true;
      }
      htmlParts.push(`<li>${formatInline(olMatch[1])}</li>`);
      continue;
    }

    const ulMatch = line.match(/^[*•\-]\s+(.*)$/);
    if (ulMatch) {
      if (inOl) {
        htmlParts.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        htmlParts.push('<ul class="chat-list">');
        inUl = true;
      }
      htmlParts.push(`<li>${formatInline(ulMatch[1])}</li>`);
      continue;
    }

    closeLists();
    htmlParts.push(`<p class="chat-paragraph">${formatInline(line)}</p>`);
  }

  closeLists();
  return htmlParts.join('');
}

export function appendAssistantMessage(data, { animate = true } = {}) {
  const rawReply = data.reply || '';
  const formation = data.suggestedFormation || data.suggested_formation || getActiveFormationSetup().code;
  const sources = Array.isArray(data.sources) ? data.sources : [];

  // Elimina cualquier bloque legado de fragmentos crudos para mostrar solo análisis y citas limpias
  let mainAnalysis = rawReply;
  if (mainAnalysis.includes('Contexto documental recuperado de tus PDFs:')) {
    mainAnalysis = mainAnalysis.split('Contexto documental recuperado de tus PDFs:')[0].trim();
  }

  const formattedAnalysisHtml = formatMarkdownToHtml(mainAnalysis);
  const appliedSystemRaw = data.appliedSystem || data.recommendedSystem || '';
  const appliedShortLabel = appliedSystemRaw
    ? formatFormationLabel(appliedSystemRaw).split(' ')[0].trim()
    : '';
  const systemUpdatedBadgeHtml = appliedShortLabel
    ? `<span class="system-updated-badge" title="Sistema sincronizado automáticamente en toda la aplicación"><svg class="ui-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg><span>Sistema actualizado a: ${escapeHtml(appliedShortLabel)}</span></span>`
    : '';
  const retrievalModeRaw = data.retrieval_mode || data.retrievalMode || '';
  const retrievalBadgeMap = {
    hybrid: 'Híbrido pgvector + FTS',
    vector: 'Vectorial pgvector',
    lexical: 'Full-Text tsvector'
  };
  const retrievalBadgeHtml = retrievalBadgeMap[retrievalModeRaw]
    ? `<span class="retrieval-mode-tag">${escapeHtml(retrievalBadgeMap[retrievalModeRaw])}</span>`
    : '';
  const sourcesHtml = sources
    .map((src) => `<span class="source-chip">${escapeHtml(src)}</span>`)
    .join('');

  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.innerHTML = `
    <div class="message-meta">
      <span>Asistente RAG</span>
      <span>·</span>
      <span>${escapeHtml(data.modality || state.modality)}</span>
    </div>
    <div class="message-bubble">
      <div class="chat-formatted-content">${formattedAnalysisHtml}</div>
      <div class="message-footer-tags">
        <span class="formation-tag">Sistema: ${escapeHtml(formatFormationLabel(formation))}</span>
        ${retrievalBadgeHtml}
        ${sourcesHtml}
        <button
          type="button"
          class="copy-msg-btn"
          title="Copiar análisis táctico al portapapeles"
        >
          <svg class="ui-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span>Copiar</span>
        </button>
        ${systemUpdatedBadgeHtml}
        <button
          type="button"
          class="play-on-board-btn"
          title="Aplicar y animar este sistema en la Pizarra Táctica"
        >
          <svg class="ui-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Simular en Pizarra</span>
        </button>
      </div>
    </div>
  `;

  const copyMsgBtn = row.querySelector('.copy-msg-btn');
  if (copyMsgBtn) {
    copyMsgBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(mainAnalysis);
        const lbl = copyMsgBtn.querySelector('span');
        if (lbl) lbl.textContent = 'Copiado';
        setTimeout(() => {
          if (lbl) lbl.textContent = 'Copiar';
        }, 1600);
      } catch (_) {
        showToast('Portapapeles no disponible', 'Copia el texto manualmente desde el mensaje.', 'info');
      }
    });
  }

  const playOnBoardBtn = row.querySelector('.play-on-board-btn');
  if (playOnBoardBtn) {
    playOnBoardBtn.addEventListener('click', () => {
      reproduceAssistantTacticOnBoard(data.modality || state.modality, formation, rawReply);
    });
  }

  dom.chatMessages.appendChild(row);

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const progressiveEls = row.querySelectorAll(
    '.chat-heading, .chat-paragraph, .chat-list li, .message-footer-tags'
  );
  if (animate && !prefersReducedMotion && progressiveEls.length > 0) {
    gsap.fromTo(
      progressiveEls,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.34, stagger: 0.07, ease: 'power2.out' }
    );
  }

  if (animate) {
    scrollToBottom();
  }
}

function reproduceAssistantTacticOnBoard(targetModality, suggestedFormationCode, replyText = '') {
  clearPlaybackTimers();
  if (targetModality && targetModality !== state.modality) {
    setModality(targetModality);
  }

  // 1. Vincular formación sugerida si existe en el catálogo (acepta con o sin prefijo 1-)
  if (suggestedFormationCode) {
    syncFormationByCode(suggestedFormationCode, { animate: false });
  }

  // 2. Detectar si la respuesta menciona jugadas preparadas o estilos específicos
  const lower = String(replyText || '').toLowerCase();
  if (lower.includes('córner') || lower.includes('corner') || lower.includes('esquina')) {
    state.setPieceCategory = lower.includes('defensa') ? 'defense' : 'attack';
    state.setPieceIndex = 0;
  } else if (lower.includes('tiro libre') || lower.includes('falta frontal') || lower.includes('barrera')) {
    state.setPieceCategory = lower.includes('defensa') || lower.includes('barrera') ? 'defense' : 'attack';
    state.setPieceIndex = state.setPieceCategory === 'attack' ? 2 : 1;
  } else if (lower.includes('saque de banda')) {
    state.setPieceCategory = 'attack';
    state.setPieceIndex = 4;
  } else if (lower.includes('presión alta') || lower.includes('presión en salida') || lower.includes('gegenpressing')) {
    state.playStyle = 'Presión Alta (Gegenpressing)';
    state.setPieceCategory = 'defense';
    state.setPieceIndex = 2;
  } else if (lower.includes('contragolpe') || lower.includes('bloque bajo')) {
    state.playStyle = 'Bloque Bajo & Contragolpe';
    state.setPieceCategory = 'free';
  } else if (lower.includes('rotación') || lower.includes('movimientos en ataque')) {
    state.playStyle = 'Rotación Dinámica';
    state.setPieceCategory = 'free';
  }

  if (dom.styleSelect) {
    dom.styleSelect.value = state.playStyle;
  }
  if (dom.setpieceCategorySelect) {
    dom.setpieceCategorySelect.value = state.setPieceCategory;
  }
  populateSetPieceDropdown();

  switchTab('board');
  renderTacticalPitch(true);

  if (state.setPieceCategory !== 'free') {
    playSetPieceAnimation();
  }

  showToast(
    'Simulación Activa en Pizarra Táctica',
    `${state.modality} · ${formatFormationLabel(getActiveFormationSetup().code)} (${state.playStyle}) sincronizado con GSAP.`,
    'success'
  );
}

let suppressExhaustedFocusModalUntil = 0;

function promptExhaustedDemoUpgrade() {
  if (dom.chatInput) {
    dom.chatInput.value = '';
    dom.chatInput.blur();
  }
  showDemoLimitModal({ reason: 'quota' });
}

export async function sendChatMessage(messageText) {
  if (isDemoExhausted()) {
    promptExhaustedDemoUpgrade();
    return;
  }

  const cleanMessage = messageText.trim();
  if (!cleanMessage || state.isSendingChat) return;

  const isDemo = isDemoSession();
  const prevQuota = isDemo && state.demoQuota ? { ...state.demoQuota } : null;

  if (isDemo && prevQuota && prevQuota.remaining <= 0) {
    syncDemoQuotaUI(prevQuota);
    promptExhaustedDemoUpgrade();
    return;
  }

  const activeSetup = getActiveFormationSetup();
  state.isSendingChat = true;
  dom.sendChatBtn.disabled = true;
  dom.chatInput.value = '';

  // Descuento optimista inmediato en tiempo real en header y chat header al enviar
  if (isDemo && prevQuota) {
    syncDemoQuotaUI({
      used: prevQuota.used + 1,
      limit: prevQuota.limit,
      remaining: Math.max(0, prevQuota.remaining - 1)
    });
  }

  triggerTacticalShockwave(dom.sendChatBtn, dom.chatMessagesStage || dom.chatMessages?.parentElement);

  appendUserMessage(cleanMessage, state.modality, activeSetup.code, state.playStyle);
  showTypingIndicator();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const data = await api.askTacticalAssistant(
      {
        message: cleanMessage,
        modality: state.modality,
        formation: activeSetup.code,
        playStyle: state.playStyle,
        sessionId: state.activeChatSessionId || null
      },
      controller.signal
    );
    removeTypingIndicator();
    if (data.sessionId) {
      state.activeChatSessionId = data.sessionId;
    }
    const appliedSystem = data.appliedSystem || data.recommendedSystem;
    if (appliedSystem) {
      syncFormationByCode(appliedSystem, { animate: true });
    }
    const resLimit = data.maxQueries ?? data.demoQueriesLimit;
    if (isDemo && resLimit != null) {
      const used = Number(data.queriesUsed ?? data.demoQueriesUsed ?? 0);
      const limit = Number(resLimit);
      const remaining = Math.max(0, Number(data.remainingQueries ?? data.demoQueriesRemaining ?? limit - used));
      const serverQuota = { used, limit, remaining };
      syncDemoQuotaUI(serverQuota);
      if (serverQuota.remaining <= 0) {
        promptExhaustedDemoUpgrade();
      }
    }
    appendAssistantMessage(data);
    refreshChatSessionsList();
  } catch (err) {
    removeTypingIndicator();
    const rawMsg =
      err.name === 'AbortError'
        ? 'La consulta superó el tiempo límite de 20 segundos. Verifica que el backend esté activo.'
        : err.message;
    const msg = rawMsg.replace(/^(DEMO_QUERIES_EXHAUSTED|DEMO_LIMIT_REACHED):\s*/, '');
    if (
      isDemo &&
      (err.code === 'DEMO_QUERIES_EXHAUSTED' ||
        rawMsg.includes('DEMO_QUERIES_EXHAUSTED') ||
        rawMsg.includes('DEMO_LIMIT_REACHED') ||
        rawMsg.includes('15 consultas') ||
        err.status === 403 ||
        err.status === 429)
    ) {
      syncDemoQuotaUI({ used: 15, limit: 15, remaining: 0 });
      promptExhaustedDemoUpgrade();
      showToast('Cuota Demo Agotada (0/15)', msg, 'info');
      return;
    } else if (isDemo && prevQuota) {
      // Si falló por red/timeout antes de consumir cuota, restaurar el valor anterior
      syncDemoQuotaUI(prevQuota);
    }
    showToast('Error en el Asistente Táctico', msg, 'error');
  } finally {
    clearTimeout(timeoutId);
    state.isSendingChat = false;
    dom.sendChatBtn.disabled = false;
    if (!isDemoExhausted()) {
      dom.chatInput.focus();
    }
  }
}

export function initChatViewEvents() {
  // Top navigation tabs + Roving Tabindex (ArrowLeft / ArrowRight / Home / End)
  const tabBtns = [dom.tabBtnAssistant, dom.tabBtnBoard, dom.tabBtnSquad].filter(Boolean);
  dom.tabBtnAssistant.addEventListener('click', () => switchTab('assistant'));
  dom.tabBtnBoard.addEventListener('click', () => switchTab('board'));
  if (dom.tabBtnSquad) {
    dom.tabBtnSquad.addEventListener('click', () => switchTab('squad'));
  }
  tabBtns.forEach((tabBtn, idx) => {
    tabBtn.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      let nextIdx = idx;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabBtns.length;
      if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabBtns.length) % tabBtns.length;
      if (e.key === 'Home') nextIdx = 0;
      if (e.key === 'End') nextIdx = tabBtns.length - 1;
      const targetBtn = tabBtns[nextIdx];
      if (targetBtn?.dataset?.tab) {
        switchTab(targetBtn.dataset.tab);
        targetBtn.focus();
      }
    });
  });

  dom.goToBoardBtn.addEventListener('click', () => switchTab('board'));
  if (dom.goToSquadBtn) {
    dom.goToSquadBtn.addEventListener('click', () => switchTab('squad'));
  }

  // Health Check
  dom.backendStatusBtn.addEventListener('click', checkBackendHealth);

  // Clean System Shutdown (Native <dialog>.showModal)
  const shutdownDialog = document.getElementById('shutdown-confirm-dialog');
  const executeSystemShutdown = async () => {
    if (!dom.shutdownSystemBtn) return;
    dom.shutdownSystemBtn.disabled = true;
    dom.backendStatusBtn.className = 'status-badge offline';
    dom.backendStatusText.textContent = 'Apagando sistema...';

    try {
      await api.shutdownSystem();
    } catch (ignored) {}

    dom.backendStatusBtn.className = 'status-badge offline';
    dom.backendStatusText.textContent = 'Sistema apagado';
    showToast(
      'Sistema apagado',
      'Spring Boot, Vite y PostgreSQL (Docker) se han detenido limpiamente.',
      'info'
    );
  };

  if (shutdownDialog) {
    shutdownDialog.addEventListener('close', () => {
      const result = shutdownDialog.returnValue;
      shutdownDialog.returnValue = '';
      if (result === 'confirm') {
        executeSystemShutdown();
      }
    });
  }

  if (dom.shutdownSystemBtn) {
    dom.shutdownSystemBtn.addEventListener('click', () => {
      if (shutdownDialog && typeof shutdownDialog.showModal === 'function') {
        if (!shutdownDialog.open) {
          shutdownDialog.showModal();
        }
      } else {
        executeSystemShutdown();
      }
    });
  }

  // Modality buttons (Tab 1 sidebar)
  dom.modalitySelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.modality-btn');
    if (!btn) return;
    setModality(btn.dataset.modality, btn.dataset.players);
  });

  // Quick Prompt Chips
  dom.quickPrompts.addEventListener('click', (e) => {
    const chip = e.target.closest('.prompt-chip');
    if (!chip) return;
    if (isDemoExhausted()) {
      promptExhaustedDemoUpgrade();
      return;
    }
    sendChatMessage(chip.dataset.prompt);
  });

  // Evitar bucle al devolver foco desde <dialog> al input de chat
  dom.demoLimitDialog?.addEventListener('close', () => {
    suppressExhaustedFocusModalUntil = Date.now() + 350;
  });

  // Bloqueo interactivo al enfocar, hacer clic o intentar escribir con 0/15 consultas Demo
  dom.chatInput?.addEventListener('focus', () => {
    if (isDemoExhausted() && Date.now() > suppressExhaustedFocusModalUntil) {
      promptExhaustedDemoUpgrade();
    }
  });
  dom.chatInput?.addEventListener('click', () => {
    if (isDemoExhausted()) {
      promptExhaustedDemoUpgrade();
    }
  });
  dom.chatInput?.addEventListener('beforeinput', (e) => {
    if (isDemoExhausted()) {
      e.preventDefault();
      promptExhaustedDemoUpgrade();
    }
  });
  dom.chatInput?.addEventListener('input', () => {
    if (isDemoExhausted()) {
      promptExhaustedDemoUpgrade();
    }
  });

  // Chat Form Submit & IME safety
  dom.chatInput?.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (isDemoExhausted() && !['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
      e.preventDefault();
      promptExhaustedDemoUpgrade();
    }
  });

  dom.sendChatBtn?.addEventListener('click', (e) => {
    if (isDemoExhausted()) {
      e.preventDefault();
      promptExhaustedDemoUpgrade();
    }
  });

  dom.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isDemoExhausted()) {
      promptExhaustedDemoUpgrade();
      return;
    }
    if (!dom.chatInput.value.trim()) {
      dom.chatInput.reportValidity?.();
      return;
    }
    sendChatMessage(dom.chatInput.value);
  });

  // Nueva consulta / Limpiar vista actual sin borrar historial guardado en DB
  dom.clearChatBtn.addEventListener('click', startNewChatConsultation);
  if (dom.newChatSessionBtn) {
    dom.newChatSessionBtn.addEventListener('click', startNewChatConsultation);
  }

  dom.chatSessionsList?.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('[data-delete-session-id]');
    if (deleteBtn) {
      const sessionId = deleteBtn.dataset.deleteSessionId;
      deleteBtn.disabled = true;
      try {
        await api.deleteChatSession(sessionId);
        if (state.activeChatSessionId === sessionId) {
          startNewChatConsultation();
        }
        showToast('Conversación eliminada', 'Historial eliminado de tu perfil.', 'info');
        await refreshChatSessionsList();
      } catch (err) {
        deleteBtn.disabled = false;
        showToast('No se pudo eliminar', err.message, 'error');
      }
      return;
    }

    const selectBtn = e.target.closest('[data-select-session-id]');
    if (selectBtn) {
      const sessionId = selectBtn.dataset.selectSessionId;
      await loadChatSession(sessionId);
    }
  });

  // Expedientes PDF & Async OCR Pipeline
  initPdfUploadEvents();
}

function formatSessionDate(isoString) {
  if (!isoString) return 'Hoy';
  try {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(isoString));
  } catch {
    return 'Reciente';
  }
}

export function startNewChatConsultation() {
  state.activeChatSessionId = null;
  appendWelcomeMessage({ animate: false });
  renderChatSessionsList();
  if (!isDemoExhausted()) {
    dom.chatInput?.focus();
  }
}

function renderChatSessionsList() {
  if (!dom.chatSessionsList) return;
  const sessions = Array.isArray(state.chatSessions) ? state.chatSessions : [];

  if (dom.chatSessionsCountBadge) {
    dom.chatSessionsCountBadge.textContent = `${sessions.length} ${sessions.length === 1 ? 'chat' : 'chats'}`;
  }

  if (!getStoredAuthSession()?.token) {
    dom.chatSessionsList.innerHTML =
      '<p class="expedientes-empty">Inicia sesión para consultar tus conversaciones guardadas.</p>';
    return;
  }

  if (!sessions.length) {
    dom.chatSessionsList.innerHTML =
      '<p class="expedientes-empty">Aún no tienes conversaciones guardadas. Haz tu primera consulta arriba.</p>';
    return;
  }

  dom.chatSessionsList.innerHTML = sessions
    .map((session) => {
      const isActive = session.id === state.activeChatSessionId;
      const systemLabel = session.systemName ? ` · ${escapeHtml(session.systemName)}` : '';
      return `
        <div class="chat-session-item ${isActive ? 'active' : ''}" data-session-id="${escapeHtml(session.id)}">
          <button
            type="button"
            class="chat-session-select-btn"
            data-select-session-id="${escapeHtml(session.id)}"
            title="${escapeHtml(session.title)}"
          >
            <span class="chat-session-title">${escapeHtml(session.title)}</span>
            <span class="chat-session-meta">
              <span>${escapeHtml(session.modality)}${systemLabel}</span>
              <span>·</span>
              <span>${escapeHtml(formatSessionDate(session.updatedAt))}</span>
            </span>
          </button>
          <button
            type="button"
            class="chat-session-delete-btn"
            data-delete-session-id="${escapeHtml(session.id)}"
            title="Eliminar conversación"
            aria-label="Eliminar ${escapeHtml(session.title)}"
          >✕</button>
        </div>
      `;
    })
    .join('');
}

export async function refreshChatSessionsList() {
  if (!dom.chatSessionsList) return;
  if (!getStoredAuthSession()?.token) {
    state.chatSessions = [];
    renderChatSessionsList();
    return;
  }

  try {
    const items = await api.getChatSessions();
    state.chatSessions = Array.isArray(items) ? items : [];
    renderChatSessionsList();
  } catch {
    renderChatSessionsList();
  }
}

export async function loadChatSession(sessionId) {
  if (!sessionId) return;
  try {
    const payload = await api.getChatSessionMessages(sessionId);
    const session = payload?.session;
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    if (!session) return;

    state.activeChatSessionId = session.id;
    if (session.modality && session.modality !== state.modality) {
      setModality(session.modality);
    }

    const fallbackSetup = getActiveFormationSetup();
    const systemLabel = session.systemName || fallbackSetup.code;
    dom.chatMessages.innerHTML = '';

    if (!messages.length) {
      appendWelcomeMessage({ animate: false });
    } else {
      for (const msg of messages) {
        if (msg.role === 'user') {
          appendUserMessage(msg.content, session.modality, systemLabel, state.playStyle, { scroll: false });
        } else {
          appendAssistantMessage(
            {
              reply: msg.content,
              modality: session.modality,
              suggestedFormation: systemLabel,
              sources: Array.isArray(msg.sources) ? msg.sources : []
            },
            { animate: false }
          );
        }
      }
      scrollToBottom();
    }

    renderChatSessionsList();
  } catch (err) {
    showToast('No se pudo cargar el chat', err.message, 'error');
  }
}

const PROGRESS_BY_STATUS = {
  PENDING: 20,
  PROCESSING: 45,
  OCR_RUNNING: 65,
  INDEXING: 85,
  READY: 100,
  VERIFIED: 100
};

function statusLabelEs(exp) {
  switch (exp.status) {
    case 'READY':
    case 'VERIFIED':
      return 'Listo';
    case 'PROCESSING':
      return 'Extrayendo';
    case 'OCR_RUNNING':
      return 'OCR';
    case 'INDEXING':
      return 'Indexando';
    case 'FAILED':
      return 'Error';
    default:
      return 'En cola';
  }
}

export async function refreshExpedientesList() {
  if (!dom.expedientesList) return;
  if (!getStoredAuthSession()?.token) {
    state.indexedDocs = [];
    if (dom.expedientesCountBadge) {
      dom.expedientesCountBadge.textContent = '0 docs';
    }
    dom.expedientesList.innerHTML =
      '<p class="expedientes-empty">Inicia sesión para consultar tus expedientes PDF privados.</p>';
    return;
  }
  try {
    const items = await api.getExpedientes();
    state.indexedDocs = Array.isArray(items) ? items : [];
    if (dom.expedientesCountBadge) {
      dom.expedientesCountBadge.textContent = `${state.indexedDocs.length} docs`;
    }

    if (!state.indexedDocs.length) {
      dom.expedientesList.innerHTML =
        '<p class="expedientes-empty">Aún no has indexado PDFs privados en tu cuenta. Los artículos tácticos base ya están activos.</p>';
      return;
    }

    dom.expedientesList.innerHTML = state.indexedDocs
      .map((exp) => {
        const isReady = exp.status === 'READY' || exp.status === 'VERIFIED';
        const isFailed = exp.status === 'FAILED';
        const statusCls = isReady ? 'verified' : isFailed ? 'failed' : 'processing';
        const ocrTag = exp.ocrUsed ? ' · OCR' : '';
        const tempTag = exp.tempDeleted ? ' · Temp eliminado' : '';
        const modelTag = exp.embeddingModel ? ` · ${escapeHtml(exp.embeddingModel)}` : '';
        return `
          <div class="expediente-item" data-exp-id="${escapeHtml(exp.id)}">
            <div class="expediente-info">
              <span class="expediente-title" title="${escapeHtml(exp.originalFilename)}">${escapeHtml(exp.title || exp.originalFilename)}</span>
              <div class="expediente-meta">
                <span class="exp-status-pill ${statusCls}">${escapeHtml(statusLabelEs(exp))}</span>
                <span>${escapeHtml(exp.modality)}</span>
                <span>${Number(exp.chunksCount || 0)} frag.${ocrTag}${tempTag}${modelTag}</span>
              </div>
            </div>
            <button
              type="button"
              class="exp-delete-btn"
              data-delete-exp-id="${escapeHtml(exp.id)}"
              title="Eliminar expediente y sus vectores de PostgreSQL"
              aria-label="Eliminar ${escapeHtml(exp.title || exp.originalFilename)}"
            >✕</button>
          </div>
        `;
      })
      .join('');
  } catch (err) {
    dom.expedientesList.innerHTML =
      '<p class="expedientes-empty">Inicia sesión para consultar tus expedientes PDF privados.</p>';
  }
}

function initPdfUploadEvents() {
  if (!dom.pdfUploadForm) return;

  dom.pdfFileInput?.addEventListener('change', () => {
    const file = dom.pdfFileInput.files?.[0];
    state.selectedFile = file || null;
    if (dom.pdfFileLabel) {
      dom.pdfFileLabel.textContent = file
        ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
        : 'Seleccionar PDF táctico (.pdf, máx 25MB)';
    }
  });

  dom.expedientesList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-exp-id]');
    if (!btn) return;
    const expId = btn.dataset.deleteExpId;
    btn.disabled = true;
    try {
      await api.deleteExpediente(expId);
      showToast('Expediente eliminado', 'Documento y vectores eliminados de PostgreSQL.', 'info');
      await refreshExpedientesList();
    } catch (err) {
      btn.disabled = false;
      showToast('No se pudo eliminar', err.message, 'error');
    }
  });

  dom.pdfUploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = dom.pdfFileInput?.files?.[0];
    if (!file) {
      dom.pdfFileInput?.setAttribute('aria-invalid', 'true');
      showToast('Archivo requerido', 'Selecciona un archivo PDF táctico primero.', 'error');
      return;
    }

    dom.pdfFileInput.setAttribute('aria-invalid', 'false');
    state.isUploadingPdf = true;
    if (dom.uploadPdfBtn) dom.uploadPdfBtn.disabled = true;
    if (dom.pdfUploadProgress) {
      dom.pdfUploadProgress.hidden = false;
      dom.pdfUploadProgress.removeAttribute('value');
    }
    if (dom.pdfUploadStatusText) {
      dom.pdfUploadStatusText.textContent = `Validando firma PDF y enviando "${file.name}" al procesador asíncrono...`;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('modality', state.modality);
      if (dom.pdfTitleInput?.value?.trim()) {
        formData.append('title', dom.pdfTitleInput.value.trim());
      }
      formData.append('async', 'true');

      const uploadResp = await api.uploadPdfDocument(formData);
      const expedienteId = uploadResp.expediente_id;

      await refreshExpedientesList();

      if (dom.pdfUploadProgress) {
        dom.pdfUploadProgress.value = 25;
      }
      if (dom.pdfUploadStatusText) {
        dom.pdfUploadStatusText.textContent = uploadResp.message || 'Procesando extracción/OCR e indexación vectorial...';
      }

      await pollExpedienteUntilComplete(expedienteId, file.name);

      dom.pdfUploadForm.reset();
      if (dom.pdfFileLabel) {
        dom.pdfFileLabel.textContent = 'Seleccionar PDF táctico (.pdf, máx 25MB)';
      }
      await refreshExpedientesList();
    } catch (err) {
      if (dom.pdfUploadProgress) {
        dom.pdfUploadProgress.hidden = true;
      }
      if (dom.pdfUploadStatusText) {
        dom.pdfUploadStatusText.textContent = `Error: ${err.message}`;
      }
      showToast('Error al indexar PDF', err.message, 'error');
    } finally {
      state.isUploadingPdf = false;
      if (dom.uploadPdfBtn) dom.uploadPdfBtn.disabled = false;
    }
  });
}

async function pollExpedienteUntilComplete(expedienteId, filename) {
  if (!expedienteId) return;
  for (let attempt = 0; attempt < 90; attempt++) {
    await new Promise((r) => setTimeout(r, 700));
    const exp = await api.getExpediente(expedienteId);
    const pct = PROGRESS_BY_STATUS[exp.status] ?? 40;
    if (dom.pdfUploadProgress) {
      dom.pdfUploadProgress.value = pct;
    }
    if (exp.status === 'READY' || exp.status === 'VERIFIED') {
      if (dom.pdfUploadStatusText) {
        dom.pdfUploadStatusText.textContent =
          `Listo (verificado): "${filename}" (${exp.chunksCount} fragmentos, ${exp.pagesTotal} págs${exp.ocrUsed ? ', OCR' : ''}). Temporal eliminado.`;
      }
      showToast(
        'PDF Indexado y Verificado',
        `${exp.chunksCount} fragmentos listos en pgvector (${exp.embeddingModel || 'embeddings'}).`,
        'success'
      );
      return;
    }
    if (exp.status === 'FAILED') {
      throw new Error(exp.errorMessage || 'Fallo el procesamiento asíncrono del PDF.');
    }
    if (dom.pdfUploadStatusText) {
      dom.pdfUploadStatusText.textContent = `Estado (${statusLabelEs(exp)}) · ${exp.pagesTotal || '?'} págs...`;
    }
  }
  throw new Error('Tiempo de espera agotado verificando el procesamiento asíncrono.');
}
