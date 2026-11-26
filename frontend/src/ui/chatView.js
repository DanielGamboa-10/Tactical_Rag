/* ==========================================================================
   Tab 1 UI View: Asistente Táctico RAG & Header System Controls
   ========================================================================== */

import gsap from 'gsap';
import { api } from '../services/api.js';
import {
  state,
  dom,
  escapeHtml,
  showToast,
  switchTab,
  triggerKaiserImpactShockwave,
  FORMATIONS_BY_MODALITY,
  getActiveFormationSetup
} from '../store/tacticalStore.js';
import {
  clearPlaybackTimers,
  renderTacticalPitch,
  playSetPieceAnimation
} from '../engine/pitchEngine.js';
import { populateFormationDropdown, populateSetPieceDropdown } from './pitchView.js';

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

export async function syncWikipediaKnowledge() {
  if (!dom.syncWikiBtn) return;
  dom.syncWikiBtn.disabled = true;
  dom.syncWikiBtn.textContent = 'Sincronizando...';

  try {
    const data = await api.syncWikipediaKnowledge();
    const count = data.chunksSaved ?? data.chunksInDatabase ?? 0;
    showToast(
      'Base Vectorial Actualizada',
      `Se indexaron ${count} fragmentos tácticos en PostgreSQL + pgvector.`,
      'success'
    );
  } catch (err) {
    showToast('Error de Sincronización', err.message, 'error');
  } finally {
    dom.syncWikiBtn.disabled = false;
    dom.syncWikiBtn.innerHTML = `
      <svg class="ui-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 16h5v5" />
      </svg>
      <span>Sincronizar Base Vectorial</span>
    `;
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
    if (isMatch && !playersTag) {
      playersTag = btn.dataset.players;
    }
  });

  dom.boardModalityPills.querySelectorAll('.board-mod-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.modality === newModality);
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
  dom.chatMessages.scrollTo({
    top: dom.chatMessages.scrollHeight,
    behavior: 'smooth'
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

function appendUserMessage(text, modality, formation, playStyle) {
  const row = document.createElement('div');
  row.className = 'message-row user';
  row.innerHTML = `
    <div class="message-meta">
      <span>Entrenador</span>
      <span>·</span>
      <span>${escapeHtml(modality)} (${escapeHtml(formation)} · ${escapeHtml(playStyle)})</span>
    </div>
    <div class="message-bubble">${escapeHtml(text)}</div>
  `;
  dom.chatMessages.appendChild(row);
  scrollToBottom();
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

  const marker = 'Contexto documental recuperado de tus PDFs:';
  let mainAnalysis = rawReply;
  let ragContextBlockHtml = '';

  if (rawReply.includes(marker)) {
    const parts = rawReply.split(marker);
    mainAnalysis = parts[0].trim();
    const snippetsRaw = parts[1].trim();
    const snippetLines = snippetsRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    ragContextBlockHtml = `
      <div class="rag-context-block">
        <div class="rag-context-title">Contexto Documental Recuperado (PostgreSQL + pgvector)</div>
        ${snippetLines.map((line) => `<div class="rag-snippet-item">${escapeHtml(line)}</div>`).join('')}
      </div>
    `;
  }

  const formattedAnalysisHtml = formatMarkdownToHtml(mainAnalysis);
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
      ${ragContextBlockHtml}
      <div class="message-footer-tags">
        <span class="formation-tag">Sistema: ${escapeHtml(formation)}</span>
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
    '.chat-heading, .chat-paragraph, .chat-list li, .rag-context-block, .message-footer-tags'
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

  // 1. Vincular formación sugerida si existe en el catálogo
  const formations = FORMATIONS_BY_MODALITY[state.modality] || [];
  if (suggestedFormationCode) {
    const cleanCode = suggestedFormationCode.split(' ')[0].trim();
    const foundIdx = formations.findIndex(
      (f) => f.code === suggestedFormationCode || f.code.startsWith(cleanCode)
    );
    if (foundIdx !== -1) {
      state.formationIndex = foundIdx;
      populateFormationDropdown();
    }
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
    `${state.modality} · ${getActiveFormationSetup().code} (${state.playStyle}) sincronizado con GSAP.`,
    'success'
  );
}

export async function sendChatMessage(messageText) {
  const cleanMessage = messageText.trim();
  if (!cleanMessage || state.isSendingChat) return;

  const activeSetup = getActiveFormationSetup();
  state.isSendingChat = true;
  dom.sendChatBtn.disabled = true;
  dom.chatInput.value = '';

  triggerKaiserImpactShockwave(dom.sendChatBtn, dom.chatMessagesStage || dom.chatMessages?.parentElement);

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
        playStyle: state.playStyle
      },
      controller.signal
    );
    removeTypingIndicator();
    appendAssistantMessage(data);
  } catch (err) {
    removeTypingIndicator();
    const msg =
      err.name === 'AbortError'
        ? 'La consulta superó el tiempo límite de 20 segundos. Verifica que el backend esté activo.'
        : err.message;
    showToast('Error en el Asistente Táctico', msg, 'error');
  } finally {
    clearTimeout(timeoutId);
    state.isSendingChat = false;
    dom.sendChatBtn.disabled = false;
    dom.chatInput.focus();
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

  // Sidebar Quick Scenarios (Tab 1)
  document.querySelectorAll('.scenario-mini-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.scenarioPrompt) {
        sendChatMessage(btn.dataset.scenarioPrompt);
      }
    });
  });

  dom.goToBoardBtn.addEventListener('click', () => switchTab('board'));
  if (dom.goToSquadBtn) {
    dom.goToSquadBtn.addEventListener('click', () => switchTab('squad'));
  }

  // Health & Wikipedia Sync
  dom.backendStatusBtn.addEventListener('click', checkBackendHealth);
  if (dom.syncWikiBtn) {
    dom.syncWikiBtn.addEventListener('click', syncWikipediaKnowledge);
  }

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
    sendChatMessage(chip.dataset.prompt);
  });

  // Chat Form Submit
  dom.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendChatMessage(dom.chatInput.value);
  });

  // Clear Chat
  dom.clearChatBtn.addEventListener('click', appendWelcomeMessage);
}
