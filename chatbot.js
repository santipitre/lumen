/* ============================================================
   SP·CD CHATBOT v2 — Asistente Inteligente
   Motor de consultas dinámicas con:
   - Filtros por columna: Consola, Aseguradora, Operador, Prestación
   - Meses por nombre: "en abril", "de marzo", "enero a junio"
   - Descarga Excel automática tras cada respuesta estadística
   - Trámites incompletos como métrica
   - Memoria de consultas (localStorage)
   - Acceso basado en permisos (admin, solicitante, mixto, consultor)
   - Mismas fórmulas que los módulos (REA, excl. médicos, excl. prestaciones)
   ============================================================ */
(function() {
  if (window.__SPCD_CHATBOT_LOADED__) return;
  window.__SPCD_CHATBOT_LOADED__ = true;

  /* ---------- AUTH CHECK — helper para saber si hay sesión activa ---------- */
  // (El chatbot se construye siempre, pero se mantiene oculto hasta detectar sesión.
  //  Así el login y el chatbot pueden coexistir sin recargar la página.)
  const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 horas
  function hasActiveSession() {
    try {
      const s = JSON.parse(localStorage.getItem('spcd_session') || 'null');
      if (!s || !s.user || !s.ts) return false;
      if (Date.now() - s.ts >= SESSION_TIMEOUT_MS) return false;
      return true;
    } catch(e) { return false; }
  }

  /* ---------- ESTILOS ---------- */
  const css = `
    #spcd-cb-btn {
      position: fixed; bottom: 20px; right: 20px; z-index: 9998;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #22DBAE, #3B82F6);
      border: none; cursor: pointer;
      display: none; align-items: center; justify-content: center;
      box-shadow: 0 8px 30px rgba(34,219,174,.4);
      transition: transform .25s, box-shadow .25s;
      color: #0F172A;
    }
    #spcd-cb-btn.visible { display: flex; }
    #spcd-cb-btn:hover { transform: translateY(-3px) scale(1.05); box-shadow: 0 12px 40px rgba(34,219,174,.55); }
    #spcd-cb-btn svg { width: 26px; height: 26px; }
    #spcd-cb-btn .cb-dot {
      position: absolute; top: 8px; right: 10px;
      width: 10px; height: 10px; border-radius: 50%;
      background: #EF4444; border: 2px solid #0F172A;
      display: none;
    }
    #spcd-cb-btn.has-unread .cb-dot { display: block; }

    #spcd-cb-win {
      position: fixed; bottom: 88px; right: 20px; z-index: 9999;
      width: 400px; max-width: calc(100vw - 40px);
      height: 600px; max-height: calc(100vh - 120px);
      background: #0F172A;
      border: 1px solid rgba(34,219,174,.3);
      border-radius: 16px;
      display: none; flex-direction: column;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,.5);
      font-family: 'Inter', sans-serif;
      color: #E2E8F0;
      animation: cbSlide .25s ease;
    }
    #spcd-cb-win.open { display: flex; }

    @keyframes cbSlide {
      from { opacity: 0; transform: translateY(20px) scale(.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .cb-header {
      padding: 14px 16px;
      background: linear-gradient(135deg, rgba(30,58,138,.6), rgba(10,15,20,.9));
      border-bottom: 1px solid rgba(34,219,174,.2);
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0;
    }
    .cb-header-left { display: flex; align-items: center; gap: 10px; }
    .cb-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, #22DBAE, #3B82F6);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Rajdhani', sans-serif; font-weight: 700;
      font-size: 14px; color: #0F172A;
      box-shadow: 0 0 12px rgba(34,219,174,.3);
    }
    .cb-title {
      font-family: 'Rajdhani', sans-serif;
      font-size: 15px; font-weight: 700; letter-spacing: 2px;
      color: #E2E8F0;
    }
    .cb-subtitle {
      font-size: 9px; letter-spacing: 1px; color: #64748B;
      text-transform: uppercase; margin-top: 1px;
    }
    .cb-status {
      font-size: 10px; letter-spacing: 1.5px;
      color: #22DBAE; text-transform: uppercase;
      display: flex; align-items: center; gap: 5px;
      margin-top: -1px;
    }
    .cb-status::before {
      content: ''; width: 6px; height: 6px; border-radius: 50%;
      background: #55e78B; display: inline-block;
      animation: cbPulse 2s infinite;
    }
    @keyframes cbPulse {
      0%,100% { opacity: 1; } 50% { opacity: .4; }
    }
    .cb-close {
      background: transparent; border: none; color: #94A3B8;
      cursor: pointer; padding: 6px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      transition: all .2s;
    }
    .cb-close:hover { background: rgba(239,68,68,.15); color: #EF4444; }

    .cb-messages {
      flex: 1; overflow-y: auto;
      padding: 16px; display: flex; flex-direction: column; gap: 12px;
      scroll-behavior: smooth;
    }
    .cb-messages::-webkit-scrollbar { width: 4px; }
    .cb-messages::-webkit-scrollbar-thumb { background: rgba(34,219,174,.2); border-radius: 2px; }

    .cb-msg { display: flex; gap: 8px; align-items: flex-end; max-width: 92%; }
    .cb-msg.bot { align-self: flex-start; }
    .cb-msg.user { align-self: flex-end; flex-direction: row-reverse; }

    .cb-msg-avatar {
      width: 26px; height: 26px; border-radius: 50%;
      flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Rajdhani', sans-serif; font-weight: 700;
      font-size: 10px;
    }
    .cb-msg.bot .cb-msg-avatar {
      background: linear-gradient(135deg, #22DBAE, #3B82F6);
      color: #0F172A;
    }
    .cb-msg.user .cb-msg-avatar {
      background: rgba(59,130,246,.2);
      color: #3B82F6;
      border: 1px solid rgba(59,130,246,.3);
    }

    .cb-msg-bubble {
      padding: 10px 14px; border-radius: 14px;
      font-size: 13px; line-height: 1.5;
      word-wrap: break-word; white-space: pre-wrap;
    }
    .cb-msg.bot .cb-msg-bubble {
      background: rgba(30,58,138,.35);
      border: 1px solid rgba(34,219,174,.15);
      border-bottom-left-radius: 4px;
      color: #E2E8F0;
    }
    .cb-msg.user .cb-msg-bubble {
      background: rgba(59,130,246,.2);
      border: 1px solid rgba(59,130,246,.3);
      border-bottom-right-radius: 4px;
      color: #E2E8F0;
    }
    .cb-msg-bubble strong { color: #22DBAE; font-weight: 600; }
    .cb-msg-bubble em { color: #94A3B8; font-style: normal; font-size: 11px; }
    .cb-msg-bubble a {
      color: #3B82F6; text-decoration: underline;
      text-decoration-color: rgba(59,130,246,.4);
    }
    .cb-msg-bubble a:hover { color: #22DBAE; }
    .cb-period-badge {
      display: inline-block;
      padding: 2px 8px; border-radius: 10px;
      background: rgba(34,219,174,.15);
      border: 1px solid rgba(34,219,174,.3);
      color: #22DBAE;
      font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
      margin-bottom: 6px;
    }
    .cb-filter-badge {
      display: inline-block;
      padding: 2px 8px; border-radius: 10px;
      background: rgba(59,130,246,.15);
      border: 1px solid rgba(59,130,246,.3);
      color: #3B82F6;
      font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
      margin-bottom: 4px; margin-right: 4px;
    }

    .cb-dl-btn {
      display: inline-flex; align-items: center; gap: 6px;
      margin-top: 8px; padding: 6px 14px; border-radius: 10px;
      background: rgba(34,219,174,.12);
      border: 1px solid rgba(34,219,174,.3);
      color: #22DBAE; font-size: 11px; font-weight: 600;
      cursor: pointer; transition: all .2s;
      font-family: 'Inter', sans-serif;
    }
    .cb-dl-btn:hover { background: rgba(34,219,174,.25); border-color: #22DBAE; }
    .cb-dl-btn svg { width: 14px; height: 14px; }

    .cb-typing { display: inline-flex; gap: 4px; padding: 4px 2px; }
    .cb-typing span {
      width: 6px; height: 6px; border-radius: 50%;
      background: #22DBAE; opacity: .5;
      animation: cbTyping 1.2s infinite;
    }
    .cb-typing span:nth-child(2) { animation-delay: .15s; }
    .cb-typing span:nth-child(3) { animation-delay: .3s; }
    @keyframes cbTyping {
      0%,60%,100% { transform: translateY(0); opacity: .5; }
      30% { transform: translateY(-4px); opacity: 1; }
    }

    .cb-quick {
      padding: 0 16px 8px; display: flex; gap: 6px; flex-wrap: wrap;
      flex-shrink: 0;
    }
    .cb-chip {
      padding: 6px 12px; border-radius: 14px;
      background: rgba(34,219,174,.08);
      border: 1px solid rgba(34,219,174,.25);
      color: #22DBAE; font-size: 11px; cursor: pointer;
      font-family: 'Inter', sans-serif;
      transition: all .2s; white-space: nowrap;
    }
    .cb-chip:hover { background: rgba(34,219,174,.18); border-color: #22DBAE; }

    .cb-suggest {
      padding: 4px 16px 6px; display: flex; gap: 4px; flex-wrap: wrap;
      flex-shrink: 0;
    }
    .cb-suggest-chip {
      padding: 4px 10px; border-radius: 10px;
      background: rgba(251,191,36,.08);
      border: 1px solid rgba(251,191,36,.2);
      color: #FBBF24; font-size: 10px; cursor: pointer;
      font-family: 'Inter', sans-serif;
      transition: all .2s; white-space: nowrap;
    }
    .cb-suggest-chip:hover { background: rgba(251,191,36,.18); border-color: #FBBF24; }

    .cb-input-wrap {
      padding: 12px 16px 16px;
      border-top: 1px solid rgba(34,219,174,.15);
      display: flex; gap: 8px; align-items: flex-end;
      flex-shrink: 0;
      background: rgba(10,15,20,.5);
    }
    .cb-input {
      flex: 1; background: rgba(30,58,138,.3);
      border: 1px solid rgba(34,219,174,.2);
      border-radius: 18px;
      padding: 10px 14px;
      color: #E2E8F0; font-size: 13px;
      font-family: 'Inter', sans-serif;
      outline: none; resize: none;
      max-height: 100px; min-height: 38px;
      line-height: 1.4;
      transition: border-color .2s;
    }
    .cb-input:focus { border-color: #22DBAE; }
    .cb-input::placeholder { color: #64748B; }

    .cb-send {
      width: 38px; height: 38px; border-radius: 50%;
      background: linear-gradient(135deg, #22DBAE, #3B82F6);
      border: none; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      color: #0F172A; transition: transform .15s;
    }
    .cb-send:hover { transform: scale(1.08); }
    .cb-send:disabled { opacity: .4; cursor: not-allowed; transform: none; }
    .cb-send svg { width: 18px; height: 18px; }

    @media (max-width: 480px) {
      #spcd-cb-win {
        bottom: 80px; right: 10px; left: 10px;
        width: auto; height: calc(100vh - 100px);
      }
      #spcd-cb-btn { bottom: 16px; right: 16px; }
    }

    /* ═══ AI MODULE (admin) ═══ */
    .cb-hdr-actions { display:flex; align-items:center; gap:4px; }
    .cb-icon-btn {
      width: 32px; height: 32px; border-radius: 8px;
      background: transparent; border: none; cursor: pointer;
      color: #94A3B8; display: flex; align-items: center; justify-content: center;
      transition: all .15s;
    }
    .cb-icon-btn:hover { background: rgba(34,219,174,.12); color: #22DBAE; }
    .cb-icon-btn.active { color: #22DBAE; background: rgba(34,219,174,.15); }
    .cb-icon-btn svg { width: 16px; height: 16px; }
    .cb-icon-btn.ai-on::after {
      content:''; position:absolute; margin-left:22px; margin-top:-14px;
      width:8px; height:8px; border-radius:50%; background:#22DBAE;
      box-shadow:0 0 6px #22DBAE;
    }

    .cb-modal-overlay {
      position: fixed; inset: 0; background: rgba(10,15,20,.75);
      backdrop-filter: blur(6px); z-index: 10000;
      display: none; align-items: center; justify-content: center;
      padding: 20px;
    }
    .cb-modal-overlay.open { display: flex; }
    .cb-modal {
      background: #0F172A; border: 1px solid rgba(34,219,174,.3);
      border-radius: 14px; padding: 24px;
      width: 100%; max-width: 520px; max-height: 86vh; overflow: auto;
      color: #E2E8F0; font-family: 'Inter', sans-serif;
      box-shadow: 0 30px 80px rgba(0,0,0,.6);
    }
    .cb-modal h3 {
      margin: 0 0 6px; font-family: 'Rajdhani', sans-serif;
      font-size: 18px; letter-spacing: 2px; color: #22DBAE;
    }
    .cb-modal .cb-modal-sub {
      font-size: 12px; color: #94A3B8; margin-bottom: 16px;
    }
    .cb-modal label {
      display: block; font-size: 11px; letter-spacing: 1.5px;
      color: #64748B; text-transform: uppercase; margin: 14px 0 6px;
    }
    .cb-modal input[type=text], .cb-modal input[type=password] {
      width: 100%; box-sizing: border-box;
      background: rgba(10,15,20,.7); border: 1px solid rgba(30,58,138,.4);
      border-radius: 8px; padding: 10px 12px;
      color: #E2E8F0; font-family: 'Roboto Mono', monospace; font-size: 12px;
    }
    .cb-modal input:focus { outline: none; border-color: #22DBAE; }
    .cb-modal .cb-warn {
      background: rgba(251,191,36,.08); border-left: 3px solid #fbbf24;
      padding: 10px 12px; border-radius: 6px; font-size: 11px;
      color: #fcd34d; margin-top: 14px; line-height: 1.6;
    }
    .cb-modal .cb-info {
      background: rgba(34,219,174,.08); border-left: 3px solid #22DBAE;
      padding: 10px 12px; border-radius: 6px; font-size: 11px;
      color: #a7f3d0; margin-top: 10px; line-height: 1.6;
    }
    .cb-modal .cb-modal-actions {
      display: flex; gap: 8px; margin-top: 18px; justify-content: flex-end; flex-wrap: wrap;
    }
    .cb-modal .btn-primary, .cb-modal .btn-secondary, .cb-modal .btn-danger {
      padding: 9px 16px; border-radius: 7px; font-size: 12px; font-weight: 600;
      letter-spacing: 1px; cursor: pointer; transition: all .15s;
      font-family: 'Inter', sans-serif;
    }
    .cb-modal .btn-primary {
      background: linear-gradient(135deg, #22DBAE, #3B82F6); color: #0F172A;
      border: none;
    }
    .cb-modal .btn-secondary {
      background: transparent; color: #94A3B8;
      border: 1px solid rgba(30,58,138,.4);
    }
    .cb-modal .btn-danger {
      background: transparent; color: #f87171;
      border: 1px solid rgba(248,113,113,.4);
    }
    .cb-modal .btn-primary:hover { opacity: .9; }
    .cb-modal .btn-secondary:hover { border-color: #22DBAE; color: #22DBAE; }
    .cb-modal .btn-danger:hover { background: rgba(248,113,113,.12); }

    .cb-audit-row {
      border-bottom: 1px solid rgba(30,58,138,.25);
      padding: 10px 0; font-size: 11px;
    }
    .cb-audit-row .cb-audit-ts { color: #64748B; font-family: monospace; }
    .cb-audit-row .cb-audit-q { color: #E2E8F0; margin: 4px 0; }
    .cb-audit-row .cb-audit-sent { color: #94A3B8; background: rgba(10,15,20,.6); padding: 6px 8px; border-radius: 4px; font-family: monospace; font-size: 10px; white-space: pre-wrap; word-break: break-all; }
    .cb-audit-row .cb-audit-ok { color: #22DBAE; font-weight: 600; }
    .cb-audit-row .cb-audit-err { color: #f87171; font-weight: 600; }

    .cb-ai-toggle {
      display: flex; align-items: center; gap: 8px; padding: 6px 10px;
      background: rgba(34,219,174,.06); border: 1px dashed rgba(34,219,174,.3);
      border-radius: 6px; margin: 6px 12px; font-size: 11px; color: #94A3B8;
      cursor: pointer; user-select: none;
    }
    .cb-ai-toggle input { accent-color: #22DBAE; }
    .cb-ai-toggle.on { background: rgba(34,219,174,.15); color: #22DBAE; border-style: solid; }

    .cb-ai-thinking { font-style: italic; color: #64748B; font-size: 11px; padding: 4px 0; }
    .cb-ai-chip {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      background: rgba(34,219,174,.15); color: #22DBAE;
      font-size: 10px; letter-spacing: 1px; font-weight: 600;
      margin-right: 6px;
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- HTML ---------- */
  const html = `
    <button id="spcd-cb-btn" title="Asistente Lumen" aria-label="Abrir asistente">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
      <span class="cb-dot"></span>
    </button>
    <div id="spcd-cb-win" role="dialog" aria-label="Asistente Lumen">
      <div class="cb-header">
        <div class="cb-header-left">
          <div class="cb-avatar" style="display:flex; align-items:center; justify-content:center;"><svg width="22" height="22" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="54" height="54" rx="13" fill="#0A0F14" stroke="#1F2937" stroke-width="0.8"/><path d="M16 14 L16 46 L44 46" fill="none" stroke="#F1F5F9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="38" cy="22" r="9" fill="none" stroke="#F59E0B" stroke-width="0.6" opacity="0.4"/><circle cx="38" cy="22" r="4" fill="#F59E0B"/><circle cx="38" cy="22" r="1.8" fill="#FEF3C7"/></svg></div>
          <div>
            <div class="cb-title">ASISTENTE LUMEN</div>
            <div class="cb-status">En línea</div>
          </div>
        </div>
        <div class="cb-hdr-actions">
          <button class="cb-icon-btn" id="spcd-cb-ai-cfg" title="Configurar IA" style="display:none; position:relative;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button class="cb-icon-btn" id="spcd-cb-ai-audit" title="Ver auditor&iacute;a de IA" style="display:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 21l-4.35-4.35"/><circle cx="11" cy="11" r="8"/>
            </svg>
          </button>
          <button class="cb-close" id="spcd-cb-close" aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="cb-messages" id="spcd-cb-msgs"></div>
      <label class="cb-ai-toggle" id="spcd-cb-ai-enrich" title="Al activar, solo se env&iacute;an agregados (counts, %) a Gemini para respuestas m&aacute;s naturales. Nunca datos de pacientes." style="display:none;">
        <input type="checkbox" id="spcd-cb-ai-enrich-chk"/>
        <span>🔓 Enriquecer respuesta con IA (solo env&iacute;a agregados an&oacute;nimos)</span>
      </label>
      <div class="cb-suggest" id="spcd-cb-suggest"></div>
      <div class="cb-quick" id="spcd-cb-quick"></div>
      <div class="cb-input-wrap">
        <textarea class="cb-input" id="spcd-cb-input" rows="1" placeholder="Ej: cuántas resonancias en abril"></textarea>
        <button class="cb-send" id="spcd-cb-send" aria-label="Enviar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- AI Config Modal -->
    <div class="cb-modal-overlay" id="spcd-cb-ai-cfg-overlay">
      <div class="cb-modal">
        <h3>⚙️ CONFIGURACI&Oacute;N DE IA</h3>
        <div class="cb-modal-sub">Conect&aacute; el asistente con Google Gemini Flash (gratis) para entender consultas en lenguaje natural.</div>

        <label>API Key de Google AI Studio</label>
        <input type="password" id="spcd-cb-ai-key-input" placeholder="AIza…" autocomplete="off" spellcheck="false"/>
        <div style="font-size:11px; color:#64748B; margin-top:6px;">
          Obten&eacute; tu key gratis en
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" style="color:#22DBAE; text-decoration:none;">aistudio.google.com/app/apikey</a>
        </div>

        <div class="cb-warn">
          <b>Privacidad:</b> tu API key se guarda solo en este navegador (localStorage).
          Por defecto, a Gemini viaja &uacute;nicamente el <b>esquema de datos + tu pregunta</b>.
          Los datos de pacientes (nombres, DNI, afiliados) NUNCA salen del navegador.
        </div>

        <div class="cb-info">
          <b>Free tier de Gemini Flash:</b> 15 requests/min, 1M tokens/d&iacute;a, 1500 req/d&iacute;a. Suficiente para uso interno del hospital.
        </div>

        <div class="cb-info" style="border-left-color:#3B82F6; background:rgba(59,130,246,.08); color:#bfdbfe;">
          <b>Alcance actual:</b> la IA procesa consultas <b>solo en el m&oacute;dulo Admin</b>. Desde otros m&oacute;dulos pod&eacute;s configurar la key pero el asistente sigue funcionando con el motor b&aacute;sico.
        </div>

        <div class="cb-modal-actions">
          <button class="btn-danger" id="spcd-cb-ai-key-clear">Borrar key</button>
          <button class="btn-secondary" id="spcd-cb-ai-cfg-cancel">Cancelar</button>
          <button class="btn-primary" id="spcd-cb-ai-key-save">Guardar</button>
        </div>
      </div>
    </div>

    <!-- AI Audit Modal -->
    <div class="cb-modal-overlay" id="spcd-cb-ai-audit-overlay">
      <div class="cb-modal" style="max-width:640px;">
        <h3>🔍 AUDITOR&Iacute;A DE IA</h3>
        <div class="cb-modal-sub">&Uacute;ltimas requests enviadas a Gemini. Se guardan localmente (no viajan a ning&uacute;n servidor).</div>
        <div id="spcd-cb-ai-audit-list" style="margin-top:12px;"></div>
        <div class="cb-modal-actions">
          <button class="btn-danger" id="spcd-cb-ai-audit-clear">Limpiar historial</button>
          <button class="btn-secondary" id="spcd-cb-ai-audit-close">Cerrar</button>
        </div>
      </div>
    </div>
  `;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  /* ---------- REFERENCIAS UI ---------- */
  const btn      = document.getElementById('spcd-cb-btn');
  const win      = document.getElementById('spcd-cb-win');
  const closeBtn = document.getElementById('spcd-cb-close');
  const msgsEl   = document.getElementById('spcd-cb-msgs');
  const quickEl  = document.getElementById('spcd-cb-quick');
  const suggestEl= document.getElementById('spcd-cb-suggest');
  const inputEl  = document.getElementById('spcd-cb-input');
  const sendBtn  = document.getElementById('spcd-cb-send');

  /* ---------- ESTADO ---------- */
  const PAGE = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const SEDE = localStorage.getItem('spcd_sede') || '';
  const UPLOAD_DATE = localStorage.getItem('spcd_upload_date') || '';

  /* ---------- PERMISOS ---------- */
  function getCurrentUser() {
    try {
      const u = JSON.parse(localStorage.getItem('spcd_user') || '{}');
      return { username: u.username || '', rol: u.rol || '' };
    } catch { return { username: '', rol: '' }; }
  }

  /* ============================================================
     FÓRMULAS CENTRALIZADAS (alineadas con los módulos)
     ============================================================ */
  function esRealizado(r) {
    return String(r['Estado'] || '').trim().toUpperCase() === 'REA';
  }
  function tieneInforme(r) {
    return String(r['Informe'] || '').trim() !== '';
  }
  function sinInforme(r) { return !tieneInforme(r); }

  const MEDICOS_EXCLUIDOS = new Set(['ADMINVM', 'DALONSO']);
  function medicoValido(m) {
    return m && !MEDICOS_EXCLUIDOS.has(String(m).trim().toUpperCase());
  }

  const PREST_EXCLUIDAS = ['PERFUSION Y DIF. RM DINAMICA','MATERIAL','SET DE BOMBA',
    'COSEGURO','RADIOFARMACO','TC DESARROLLO 3D','NC/ND','AGUJAS','NOTA','REGION','ADICIONAL'];
  function prestacionValida(p) {
    if (!p) return true;
    const up = String(p).toUpperCase();
    return !PREST_EXCLUIDAS.some(ex => up.startsWith(ex));
  }

  // KPIs de admin
  function errorDerivante(r) {
    const d = (r['Derivante'] || '').trim().toUpperCase();
    return !d || d === 'A CONFIRMAR';
  }
  function errorCoseguro(r) {
    const idAseg = String(r['ID Aseguradora'] || '').trim();
    const cuenta = (r['Cuenta'] || '').trim().toUpperCase();
    const prest  = (r['Prestación'] || r['Prestacion'] || '').trim().toUpperCase();
    const neto   = parseFloat(r['Neto Unitario'] || 0);
    return idAseg === '1665' && cuenta.includes('OSEP') && prest === 'COSEGURO' && neto === 0;
  }
  function errorInstDerivante(r) {
    const inst = (r['Inst Derivante'] || '').trim().toUpperCase();
    const op   = (r['Operador'] || '').trim().toUpperCase();
    return inst === 'FUESMEN' && op !== '';
  }
  function esErrorTramiteIncompleto(r) {
    const aseg = (r['Aseguradora']||'').trim().toUpperCase();
    if (aseg === 'PARTICULAR') {
      const factura = String(r['N° Factura'] ?? r['Nº Factura'] ?? r['N Factura'] ?? '').trim();
      return factura === '0';
    } else {
      const orden = String(r['N° Orden'] ?? r['Nº Orden'] ?? r['N Orden'] ?? '').trim();
      return orden === '0';
    }
  }
  function esErrorReferencia(r) {
    const ref = String(r['N° Referencia'] ?? r['Nº Referencia'] ?? r['N Referencia'] ?? '').trim();
    return ref === '' || ref === '0';
  }
  function esErrorCobertura(r) {
    const tc = (r['Tipo Cobertura']||'').trim().toUpperCase();
    return !tc || tc === 'SIN DATOS' || tc === 'NINGUNO';
  }

  /* ============================================================
     FECHAS Y PERÍODOS
     ============================================================ */
  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }

  const MESES = {
    enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5,
    julio:6, agosto:7, septiembre:8, setiembre:8, octubre:9, noviembre:10, diciembre:11
  };

  function getPeriodRange(periodId) {
    const now = new Date(); now.setHours(0,0,0,0);
    let start, end = new Date(now); end.setHours(23,59,59,999);

    switch(periodId) {
      case 'hoy':
        start = new Date(now);
        break;
      case 'ayer':
        start = new Date(now); start.setDate(now.getDate() - 1);
        end   = new Date(start); end.setHours(23,59,59,999);
        break;
      case 'semana': {
        const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
        start = new Date(now); start.setDate(now.getDate() - dow);
        break;
      }
      case 'semana_pasada':
        start = new Date(now); start.setDate(now.getDate() - 7);
        end   = new Date(now); end.setHours(23,59,59,999);
        break;
      case 'mes':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'mes_pasado':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'año':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        // Named month: "month_3" = April (0-indexed)
        if (typeof periodId === 'string' && periodId.startsWith('month_')) {
          const m = parseInt(periodId.split('_')[1]);
          const y = now.getFullYear();
          // If the month is in the future, use last year
          const useYear = m > now.getMonth() ? y - 1 : y;
          start = new Date(useYear, m, 1);
          end = new Date(useYear, m + 1, 0, 23, 59, 59, 999);
          return { start, end, label: start.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) };
        }
        return null;
    }
    return { start, end, label: periodLabel(periodId) };
  }

  function periodLabel(id) {
    return {
      hoy: 'Hoy',
      ayer: 'Ayer',
      semana: 'Esta semana',
      semana_pasada: 'Últimos 7 días',
      mes: 'Este mes',
      mes_pasado: 'Mes pasado',
      año: 'Este año',
    }[id] || id;
  }

  function filterByPeriod(data, periodId) {
    if (!periodId) return data;
    const r = getPeriodRange(periodId);
    if (!r) return data;
    return data.filter(row => {
      const d = parseDate(row['Turno Fecha']);
      return d && d >= r.start && d <= r.end;
    });
  }

  /* ============================================================
     ACCESO A DATOS (IndexedDB)
     ============================================================ */
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('spcd_storage', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('data');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function loadData() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('data', 'readonly');
        const req = tx.objectStore('data').get('spcd_data_full');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch(e) { return null; }
  }

  /* ============================================================
     MEMORIA — aprende de consultas frecuentes
     ============================================================ */
  const MEMORY_KEY = 'spcd_cb_memory';
  function loadMemory() {
    try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || '{"queries":[],"freq":{}}'); }
    catch { return { queries: [], freq: {} }; }
  }
  function saveMemory(mem) {
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(mem)); } catch {}
  }
  function recordQuery(text) {
    const mem = loadMemory();
    const key = normalize(text);
    if (!key) return;
    mem.freq[key] = (mem.freq[key] || 0) + 1;
    mem.queries.push({ q: text, ts: Date.now() });
    // Keep last 100 queries
    if (mem.queries.length > 100) mem.queries = mem.queries.slice(-100);
    saveMemory(mem);
    updateSuggestions();
  }
  function getTopQueries(n = 3) {
    const mem = loadMemory();
    return Object.entries(mem.freq)
      .filter(([,c]) => c >= 2) // at least asked twice
      .sort((a,b) => b[1] - a[1])
      .slice(0, n)
      .map(([q]) => q);
  }
  function updateSuggestions() {
    const tops = getTopQueries(4);
    suggestEl.innerHTML = '';
    if (!tops.length) return;
    tops.forEach(q => {
      const b = document.createElement('button');
      b.className = 'cb-suggest-chip';
      b.textContent = q.length > 30 ? q.slice(0, 28) + '…' : q;
      b.title = q;
      b.onclick = () => { inputEl.value = q; send(); };
      suggestEl.appendChild(b);
    });
  }

  /* ============================================================
     NLP v2: MÉTRICA + PERÍODO + FILTROS DINÁMICOS + FAQ
     ============================================================ */
  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!.,;:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // FAQ
  const FAQ_INTENTS = [
    { id: 'saludo', keys: ['hola','buenas','buen dia','buenos dias','buenas tardes','buenas noches','hey','que tal','como estas'] },
    { id: 'gracias', keys: ['gracias','muchas gracias','ok gracias','dale gracias'] },
    { id: 'despedida', keys: ['chau','adios','hasta luego','nos vemos','bye'] },
    { id: 'ayuda', keys: ['ayuda','help','que podes hacer','que sabes','que haces','opciones','menu'] },
    { id: 'que_es', keys: ['que es sp','que es control data','que es esto','que es la app','para que sirve','de que se trata'] },
    { id: 'cargar_excel', keys: ['como cargo','como subo','como cargar','subir excel','cargar excel','subir archivo','cargar archivo','cargar datos','subir datos'] },
    { id: 'recargar', keys: ['recargar datos','actualizar datos','nuevo excel','reemplazar excel','cambiar excel'] },
    { id: 'no_veo_datos', keys: ['no veo datos','no aparecen datos','no hay datos','esta vacio','no carga','no muestra'] },
    { id: 'exportar', keys: ['exportar','bajar excel','descargar excel','exportar a excel','como exporto'] },
    { id: 'cambiar_modulo', keys: ['cambiar modulo','otro modulo','volver a modulos','cambiar rol','cambiar area'] },
    { id: 'cambiar_sede', keys: ['cambiar sede','otra sede','elegir sede'] },
    { id: 'modulo_medico', keys: ['modulo medico','que hace medico'] },
    { id: 'modulo_tecnico', keys: ['modulo tecnico','que hace tecnico'] },
    { id: 'modulo_admin', keys: ['modulo admin','modulo administrativo','que hace admin'] },
    { id: 'modulo_operativo', keys: ['modulo operativo','que hace operativo'] },
    { id: 'q_fecha_carga', keys: ['cuando cargue','ultima carga','fecha de carga','fecha actualizacion','ultima actualizacion'] },
    { id: 'q_sede_actual', keys: ['que sede','sede actual','cual sede','que sede tengo'] },
  ];

  // Métricas — Ahora con trámites incompletos
  const METRICS = [
    { id: 'total_reg',    keys: ['cuantos registros','total registros','registros cargados','total datos','cantidad de datos','cuantos datos','cuantos hay en total'] },
    { id: 'total_rea',    keys: ['cuantos estudios','total estudios','cuantos turnos realizados','total realizados','turnos realizados','estudios realizados'] },
    { id: 'total_aus',    keys: ['cuantos ausentes','ausentes','no asistieron','aus total','total ausentes','no vinieron'] },
    { id: 'con_informe',  keys: ['cuantos con informe','con informe','estudios con informe','informes cargados','informes hechos'] },
    { id: 'sin_informe',  keys: ['cuantos sin informe','sin informe','estudios sin informe','informes pendientes','pendientes','no informados','sin informar','faltan informar'] },
    { id: 'top_medicos',      keys: ['top medicos','ranking medicos','quien informa mas','mejores medicos','medicos con mas informes','mas informes'] },
    { id: 'top_pendientes',   keys: ['top pendientes','quien tiene mas pendientes','medico con mas pendientes','ranking pendientes','medicos con mas atrasos'] },
    { id: 'tiempo_prom',  keys: ['tiempo promedio','tiempo prom','promedio informe','dias promedio','cuanto tarda','tiempo de informe'] },
    { id: 'top_equipos',     keys: ['top equipos','equipos mas usados','cuantos por equipo','ranking equipos','estudios por equipo','que equipo hace mas'] },
    { id: 'equipos_activos', keys: ['cuantos equipos','equipos activos','equipos distintos'] },
    { id: 'prom_diario',     keys: ['promedio diario','prom diario','estudios diarios','estudios por dia'] },
    { id: 'err_derivantes',  keys: ['derivantes con error','errores de derivantes','derivantes mal','a confirmar','sin derivante'] },
    { id: 'err_coseguros',   keys: ['coseguros con error','errores de coseguros','coseguros mal','osep coseguro','coseguros cero'] },
    { id: 'err_instderiv',   keys: ['inst derivante error','errores inst derivante','fuesmen derivante','institucion derivante error'] },
    { id: 'err_tramites',    keys: ['tramites incompletos','tramites mal','sin factura','sin orden','tramite incompleto','factura cero','orden cero'] },
    { id: 'err_referencia',  keys: ['sin referencia','referencia error','sin numero referencia','sin nro referencia','error referencia'] },
    { id: 'err_cobertura',   keys: ['cobertura error','tipo cobertura error','sin cobertura','cobertura mal'] },
    { id: 'aseguradoras',    keys: ['cuantas aseguradoras','aseguradoras distintas','obras sociales distintas','obras sociales activas'] },
    { id: 'top_prestaciones',keys: ['top prestaciones','prestaciones mas hechas','ranking prestaciones','que prestacion','estudios mas pedidos'] },
    { id: 'top_coberturas',  keys: ['top coberturas','coberturas mas usadas','obras sociales mas','tipo de cobertura mas'] },
    { id: 'total_errores',   keys: ['total errores','cuantos errores','errores totales','resumen errores','todos los errores'] },
  ];

  const PERIODS = [
    { id: 'hoy',          keys: ['hoy','del dia','dia de hoy'] },
    { id: 'ayer',         keys: ['ayer','del ayer','dia de ayer'] },
    { id: 'semana',       keys: ['esta semana','la semana','semana actual','en la semana'] },
    { id: 'semana_pasada',keys: ['semana pasada','ultima semana','ultimos 7 dias','7 dias','hace una semana'] },
    { id: 'mes',          keys: ['este mes','mes actual','del mes','en el mes','este mes actual'] },
    { id: 'mes_pasado',   keys: ['mes pasado','ultimo mes','ultimos 30 dias','30 dias','hace un mes'] },
    { id: 'año',          keys: ['este año','año actual','del año','en el año','anual'] },
  ];

  function matchBest(text, list) {
    let best = null, score = 0;
    for (const it of list) {
      for (const k of it.keys) {
        const kn = normalize(k);
        if (text === kn)        { return it.id; }
        if (text.includes(kn))  {
          if (kn.length > score) { score = kn.length; best = it.id; }
        }
      }
    }
    return best;
  }

  function matchMetricSpecial(text) {
    if (/\bsin\s+info?rme?s?\b/.test(text) || /\bpendientes?\b/.test(text) ||
        /\bno\s+informad[oa]s?\b/.test(text) || /\bfaltan?\s+informar\b/.test(text) ||
        /\bsin\s+informar\b/.test(text) || /\bfaltan?\s+informes?\b/.test(text)) {
      return 'sin_informe';
    }
    if (/\bcon\s+info?rme?s?\b/.test(text) || /\binformes?\s+(hechos?|cargados?|realizados?|listos?)\b/.test(text) ||
        /\bya\s+informad[oa]s?\b/.test(text)) {
      return 'con_informe';
    }
    if (/\bausentes?\b/.test(text) || /\bno\s+(vinieron|asistieron)\b/.test(text)) {
      return 'total_aus';
    }
    if (/\btramites?\s+incomplet[oa]s?\b/.test(text) || /\bsin\s+factura\b/.test(text) || /\bsin\s+orden\b/.test(text)) {
      return 'err_tramites';
    }
    if (/\berrores?\s+de\s+derivantes?\b/.test(text) || /\bderivantes?\s+(con|de)?\s*errores?\b/.test(text) ||
        /\bsin\s+derivante\b/.test(text) || /\ba\s+confirmar\b/.test(text)) {
      return 'err_derivantes';
    }
    if (/\berrores?\s+de\s+coseguros?\b/.test(text) || /\bcoseguros?\s+(con|de)?\s*errores?\b/.test(text) ||
        /\bcoseguros?\s+(mal|cero)\b/.test(text)) {
      return 'err_coseguros';
    }
    return null;
  }

  /* Detectar mes por nombre: "en abril", "de marzo", "en enero" */
  function detectNamedMonth(text) {
    for (const [name, idx] of Object.entries(MESES)) {
      // "en abril", "de abril", "abril", "del mes de abril"
      const re = new RegExp('\\b(en|de|del mes de|para)?\\s*' + name + '\\b');
      if (re.test(text)) return 'month_' + idx;
    }
    return null;
  }

  /* Detectar filtros dinámicos por columna */
  function detectDynamicFilters(text) {
    const filters = {};

    // Operador: "de spitrella", "operador javila", etc.
    const ops = ['SPITRELLA','JAVILA','JMONICA','ZABRAHAM','ITORRES'];
    for (const op of ops) {
      if (text.includes(op.toLowerCase())) {
        filters.operador = op;
        break;
      }
    }

    // Consola/equipo: se detecta dinámicamente al tener datos
    // Aseguradora: se detecta dinámicamente al tener datos

    return filters;
  }

  /* Detectar consulta dinámica de conteo por valor de columna.
     Patrones: "cuántas resonancias", "cuántos TC de cerebro",
     "cantidad de ecografías", "estudios de RM" */
  function detectDynamicCount(text) {
    // Remove known period/filter words to isolate the search term
    let cleaned = text
      .replace(/\b(cuant[oa]s?|cuantas|cuantos|cantidad\s+de|total\s+de|dame|quiero|estudios\s+de|numero\s+de)\b/g, '')
      .replace(/\b(hoy|ayer|esta\s+semana|semana\s+pasada|este\s+mes|mes\s+pasado|este\s+ano|en|de|del|la|el|los|las|por|que|se|hicieron|hizo|hay|hubo|fueron|realizaron|realizado|realizadas|realizados|hicieron)\b/g, '');
    // Remove month names
    for (const m of Object.keys(MESES)) {
      cleaned = cleaned.replace(new RegExp('\\b' + m + '\\b', 'g'), '');
    }
    // Remove operator names
    const ops = ['spitrella','javila','jmonica','zabraham','itorres'];
    for (const op of ops) cleaned = cleaned.replace(new RegExp('\\b' + op + '\\b', 'g'), '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    if (cleaned.length >= 2) return cleaned;
    return null;
  }

  function parseQuery(text) {
    const t = normalize(text);
    if (!t) return { empty: true };

    const special = matchMetricSpecial(t);
    const namedMonth = detectNamedMonth(t);
    const dynFilters = detectDynamicFilters(t);

    // Standard period detection (named month takes priority if found)
    const stdPeriod = matchBest(t, PERIODS);
    const period = namedMonth || stdPeriod;

    // Dynamic count detection (e.g., "cuántas resonancias en abril")
    const dynSearch = detectDynamicCount(t);

    return {
      raw: text,
      faq: matchBest(t, FAQ_INTENTS),
      metric: special || matchBest(t, METRICS),
      period: period,
      filters: dynFilters,
      dynSearch: dynSearch,
    };
  }

  /* ============================================================
     FORMATEO
     ============================================================ */
  function fmt(n) { return Number(n).toLocaleString('es-AR'); }
  function pct(n, total) { return total ? ((n/total)*100).toFixed(1) + '%' : '—'; }
  function link(href, label) { return `<a href="${href}">${label}</a>`; }
  function badge(label) { return `<span class="cb-period-badge">${label}</span>\n`; }
  function filterBadge(label) { return `<span class="cb-filter-badge">${label}</span>`; }

  /* ============================================================
     RESPUESTAS FAQ
     ============================================================ */
  function respondFAQ(id) {
    switch(id) {
      case 'saludo':
        return `¡Hola! 👋 Soy el asistente inteligente de Lumen.\nPodés preguntarme lo que quieras sobre los datos.\n\n<strong>Ejemplos:</strong>\n• "cuántas resonancias en abril"\n• "errores de SPITRELLA este mes"\n• "top equipos esta semana"\n• "dame el excel de sin informe"\n\nTocá los chips de abajo para empezar.`;
      case 'gracias':   return '¡De nada! Cualquier cosa que necesites, me preguntás.';
      case 'despedida': return '¡Hasta luego! 👋 Acá estoy cuando me necesites.';
      case 'ayuda':
        return `Puedo responder:\n\n<strong>📊 Consultas dinámicas</strong>\n• "cuántas resonancias en abril"\n• "TC de cerebro este mes"\n• "ecografías de SPITRELLA"\n\n<strong>📈 Métricas y rankings</strong>\n• Sin informe · Con informe · Ausentes\n• Top médicos · Top equipos · Top prestaciones\n• Errores: derivantes · coseguros · trámites\n\n<strong>⏱ Filtros de período</strong>\nAgregá: hoy · ayer · esta semana · mes pasado · enero a diciembre\n<em>Ej: "sin informe en marzo"</em>\n\n<strong>👤 Filtros por operador</strong>\nNombrá al operador: SPITRELLA · JAVILA · JMONICA · ZABRAHAM · ITORRES\n\n<strong>📥 Exportar a Excel</strong>\nDecime "dame el excel de..." y te lo genero al instante.\n\n<strong>🧠 Aprendo de tus consultas</strong>\nLas preguntas frecuentes aparecen como sugerencias.`;
      case 'que_es':
        return `<strong>SP Control Data</strong> es la plataforma de control interno del Hospital Italiano de Mendoza.\n\n4 módulos:\n• <strong>Médico</strong> — Informes pendientes y tiempos\n• <strong>Técnico</strong> — Estudios realizados y equipos\n• <strong>Administrativo</strong> — Derivantes, coberturas y afiliados\n• <strong>Operativo</strong> — Stock, insumos y pedidos`;
      case 'cargar_excel':
        return `1. Andá a ${link('index.html','Inicio')} → <strong>Iniciar</strong>\n2. Elegí la sede\n3. En la zona <em>"Cargar archivo Excel"</em>, arrastrá o hacé click\n4. Listo: ya podés entrar a cualquier módulo`;
      case 'recargar':
        return `Volvé a ${link('index.html','Sedes')} → aparece <strong>🔄 Recargar datos</strong> debajo del archivo cargado. Subí el nuevo Excel — reemplaza el anterior.`;
      case 'no_veo_datos':
        return `Revisá:\n• ¿Cargaste el Excel? (${link('index.html','Ir a Inicio')})\n• ¿La sede es la correcta?\n• ¿El archivo tiene los campos esperados (Estado, Turno Fecha, Informe, etc.)?`;
      case 'exportar':
        return `Tenés 2 formas de exportar:\n\n<strong>1) Desde el chat (rápido)</strong>\nPedime el archivo directo:\n• <em>"dame el excel de sin informe"</em>\n• <em>"exportá resonancias en abril"</em>\n• <em>"bajame errores de SPITRELLA"</em>\n\n<strong>2) Desde los módulos</strong>\nCada tabla tiene botón <strong>Exportar Excel</strong>.`;
      case 'cambiar_modulo':
        return `Tocá <strong>VOLVER</strong> o ${link('index.html?screen=roles','Área de Trabajo')}.`;
      case 'cambiar_sede':
        return `Tocá <strong>Lumen</strong> → Iniciar → elegí otra sede.\n${link('index.html','Inicio')}`;
      case 'modulo_medico':
        return `<strong>Módulo Médico</strong> — ${link('medico.html','Abrir')}\n• Informes realizados y pendientes\n• Tiempo promedio de informe\n• Ranking por médico informante`;
      case 'modulo_tecnico':
        return `<strong>Módulo Técnico</strong> — ${link('tecnico.html','Abrir')}\n• Estudios realizados por equipo\n• Promedio diario · equipos activos\n• Sin informe`;
      case 'modulo_admin':
        return `<strong>Módulo Administrativo</strong> — ${link('admin.html','Abrir')}\n• Derivantes con error · Coseguros\n• Trámites incompletos · Cobertura\n• Aseguradoras · Rankings`;
      case 'modulo_operativo':
        return `<strong>Módulo Operativo</strong> — ${link('operativo.html','Abrir')}\n• Stock Medicación · Insumos · Pedidos\n• Entradas y movimientos de stock`;
      case 'q_fecha_carga':
        return UPLOAD_DATE
          ? `Última carga: <strong>${UPLOAD_DATE}</strong>.`
          : `No hay Excel cargado. ${link('index.html','Cargar')}.`;
      case 'q_sede_actual':
        return SEDE
          ? `Sede activa: <strong>${SEDE.toUpperCase()}</strong>.`
          : `No elegiste sede. ${link('index.html','Ir a Inicio')}.`;
    }
    return null;
  }

  /* ============================================================
     APLICAR FILTROS DINÁMICOS A LOS DATOS
     ============================================================ */
  function applyDynFilters(data, filters) {
    let result = data;
    if (filters.operador) {
      result = result.filter(r => (r['Operador']||'').trim().toUpperCase() === filters.operador);
    }
    if (filters.consola) {
      result = result.filter(r => {
        const c = (r['Consola']||r['Equipo']||'').trim().toUpperCase();
        return c.includes(filters.consola.toUpperCase());
      });
    }
    if (filters.aseguradora) {
      result = result.filter(r => {
        const a = (r['Aseguradora']||'').trim().toUpperCase();
        return a.includes(filters.aseguradora.toUpperCase());
      });
    }
    return result;
  }

  function filterBadges(filters, periodId) {
    let html = '';
    if (periodId) {
      const pr = getPeriodRange(periodId);
      if (pr) html += badge(pr.label);
    }
    if (filters.operador) html += filterBadge('Operador: ' + filters.operador) + ' ';
    if (filters.consola) html += filterBadge('Consola: ' + filters.consola) + ' ';
    if (filters.aseguradora) html += filterBadge('Aseg: ' + filters.aseguradora) + ' ';
    if (html) html += '\n';
    return html;
  }

  /* ============================================================
     RESPUESTAS DE DATOS — con filtros dinámicos
     ============================================================ */
  async function respondMetric(metricId, periodId, filters = {}) {
    const data = await loadData();
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { text: `Para responder eso necesito que cargues un Excel primero.\n${link('index.html','Ir a cargar datos')}`, exportable: false };
    }

    const badges = filterBadges(filters, periodId);
    let dataFiltered = filterByPeriod(data, periodId);
    dataFiltered = applyDynFilters(dataFiltered, filters);

    if (dataFiltered.length === 0) {
      return { text: badges + `No encontré registros con esos filtros.`, exportable: false };
    }

    const rea = dataFiltered.filter(esRealizado);

    switch(metricId) {
      case 'total_reg':
        return { text: badges + `Total de registros: <strong>${fmt(dataFiltered.length)}</strong>.\n<em>Incluye todos los estados (REA, AUS, etc.)</em>`, exportable: true, metricId, periodId, filters };

      case 'total_rea':
        return { text: badges + `Estudios realizados (REA): <strong>${fmt(rea.length)}</strong> (${pct(rea.length, dataFiltered.length)} del total).`, exportable: true, metricId, periodId, filters };

      case 'total_aus': {
        const n = dataFiltered.filter(r => String(r['Estado']||'').trim().toUpperCase() === 'AUS').length;
        return { text: badges + `Ausentes (AUS): <strong>${fmt(n)}</strong> (${pct(n, dataFiltered.length)} del total).`, exportable: true, metricId, periodId, filters };
      }

      case 'con_informe': {
        const n = rea.filter(tieneInforme).length;
        return { text: badges + `Con informe cargado: <strong>${fmt(n)}</strong> (${pct(n, rea.length)} de ${fmt(rea.length)} realizados).`, exportable: true, metricId, periodId, filters };
      }

      case 'sin_informe': {
        const n = rea.filter(sinInforme).length;
        return { text: badges + `Sin informe cargado: <strong>${fmt(n)}</strong> (${pct(n, rea.length)} de ${fmt(rea.length)} realizados).\n${link('medico.html','Ver detalle en Módulo Médico')}`, exportable: true, metricId, periodId, filters };
      }

      case 'top_medicos': {
        const con = rea.filter(tieneInforme);
        const by = {};
        con.forEach(r => { const m = r['Médico Informante']; if (medicoValido(m)) by[m] = (by[m]||0) + 1; });
        const top = Object.entries(by).sort((a,b) => b[1]-a[1]).slice(0,5);
        if (!top.length) return { text: badges + 'No encontré médicos con informes.', exportable: false };
        const total = top.reduce((s,t) => s+t[1], 0);
        return { text: badges + `<strong>Top médicos (con informe):</strong>\n` +
          top.map((t,i) => `${i+1}. ${t[0]} — <strong>${fmt(t[1])}</strong> (${pct(t[1], total)})`).join('\n'), exportable: true, metricId, periodId, filters };
      }

      case 'top_pendientes': {
        const pen = rea.filter(sinInforme);
        const by = {};
        pen.forEach(r => { const m = r['Médico Informante']; if (medicoValido(m)) by[m] = (by[m]||0) + 1; });
        const top = Object.entries(by).sort((a,b) => b[1]-a[1]).slice(0,5);
        if (!top.length) return { text: badges + '¡No hay pendientes! 🎉', exportable: false };
        return { text: badges + `<strong>Top médicos con más pendientes:</strong>\n` +
          top.map((t,i) => `${i+1}. ${t[0]} — <strong>${fmt(t[1])}</strong>`).join('\n'), exportable: true, metricId, periodId, filters };
      }

      case 'tiempo_prom': {
        const con = rea.filter(tieneInforme);
        const diffs = [];
        con.forEach(r => {
          const f1 = parseDate(r['Turno Fecha']);
          const f2 = parseDate(r['Fecha Informe']);
          if (f1 && f2) { const d = Math.floor((f2 - f1) / 86400000); if (d >= 0 && d < 365) diffs.push(d); }
        });
        if (!diffs.length) return { text: badges + 'No pude calcular tiempo promedio (faltan fechas de informe).', exportable: false };
        const prom = diffs.reduce((a,b) => a+b, 0) / diffs.length;
        return { text: badges + `Tiempo promedio de informe: <strong>${prom.toFixed(1)} días</strong> (sobre ${fmt(diffs.length)} informes).`, exportable: false };
      }

      case 'top_equipos': {
        const by = {};
        rea.forEach(r => { const e = r['Equipo']; if (e) by[e] = (by[e]||0) + 1; });
        const top = Object.entries(by).sort((a,b) => b[1]-a[1]).slice(0,5);
        if (!top.length) return { text: badges + 'No encontré datos de equipos.', exportable: false };
        return { text: badges + `<strong>Top equipos por estudios:</strong>\n` +
          top.map((t,i) => `${i+1}. ${t[0]} — <strong>${fmt(t[1])}</strong> (${pct(t[1], rea.length)})`).join('\n'), exportable: true, metricId, periodId, filters };
      }

      case 'equipos_activos': {
        const set = new Set(rea.map(r => r['Equipo']).filter(Boolean));
        return { text: badges + `Equipos activos: <strong>${set.size}</strong>.\n<em>${[...set].slice(0,5).join(', ') || '—'}</em>`, exportable: true, metricId, periodId, filters };
      }

      case 'prom_diario': {
        const byDay = {};
        rea.forEach(r => { const d = parseDate(r['Turno Fecha']); if (!d) return; byDay[d.toISOString().slice(0,10)] = (byDay[d.toISOString().slice(0,10)]||0) + 1; });
        const dias = Object.keys(byDay).length;
        const prom = dias ? (rea.length / dias).toFixed(1) : 0;
        return { text: badges + `Promedio diario: <strong>${prom}</strong> estudios/día (en ${dias} días con actividad).`, exportable: false };
      }

      case 'err_derivantes': {
        const errs = rea.filter(errorDerivante);
        return { text: badges + `Derivantes con error: <strong>${fmt(errs.length)}</strong> (${pct(errs.length, rea.length)} de REA).\n<em>Criterio: Derivante vacío o = A CONFIRMAR</em>\n${link('admin.html','Ver en Admin')}`, exportable: true, metricId, periodId, filters };
      }

      case 'err_coseguros': {
        const errs = rea.filter(errorCoseguro);
        return { text: badges + `Coseguros con error: <strong>${fmt(errs.length)}</strong> (${pct(errs.length, rea.length)} de REA).\n<em>Criterio: ID 1665 + OSEP + COSEGURO + Neto=0</em>\n${link('admin.html','Ver en Admin')}`, exportable: true, metricId, periodId, filters };
      }

      case 'err_instderiv': {
        const errs = rea.filter(errorInstDerivante);
        return { text: badges + `Inst. Derivante con error: <strong>${fmt(errs.length)}</strong>.\n${link('admin.html','Ver en Admin')}`, exportable: true, metricId, periodId, filters };
      }

      case 'err_tramites': {
        const errs = rea.filter(esErrorTramiteIncompleto);
        const partSinFact = errs.filter(r => (r['Aseguradora']||'').trim().toUpperCase() === 'PARTICULAR').length;
        const osSinOrden = errs.length - partSinFact;
        return { text: badges + `Trámites incompletos: <strong>${fmt(errs.length)}</strong> (${pct(errs.length, rea.length)} de REA).\n<em>Part. sin factura: ${fmt(partSinFact)} · O.S. sin orden: ${fmt(osSinOrden)}</em>\n${link('admin.html','Ver en Admin')}`, exportable: true, metricId, periodId, filters };
      }

      case 'err_referencia': {
        const errs = rea.filter(esErrorReferencia);
        return { text: badges + `Sin N° Referencia: <strong>${fmt(errs.length)}</strong> (${pct(errs.length, rea.length)} de REA).\n${link('admin.html','Ver en Admin')}`, exportable: true, metricId, periodId, filters };
      }

      case 'err_cobertura': {
        const errs = rea.filter(esErrorCobertura);
        return { text: badges + `Tipo Cobertura con error: <strong>${fmt(errs.length)}</strong> (${pct(errs.length, rea.length)} de REA).\n${link('admin.html','Ver en Admin')}`, exportable: true, metricId, periodId, filters };
      }

      case 'total_errores': {
        const e1 = rea.filter(errorDerivante).length;
        const e2 = rea.filter(errorCoseguro).length;
        const e3 = rea.filter(errorInstDerivante).length;
        const e4 = rea.filter(esErrorTramiteIncompleto).length;
        const e5 = rea.filter(esErrorReferencia).length;
        const e6 = rea.filter(esErrorCobertura).length;
        const total = e1+e2+e3+e4+e5+e6;
        return { text: badges + `<strong>Resumen de errores</strong> (sobre ${fmt(rea.length)} REA):\n` +
          `• Derivantes: <strong>${fmt(e1)}</strong>\n• Coseguros: <strong>${fmt(e2)}</strong>\n• Inst. Derivante: <strong>${fmt(e3)}</strong>\n• Trámites incompletos: <strong>${fmt(e4)}</strong>\n• Sin referencia: <strong>${fmt(e5)}</strong>\n• Tipo cobertura: <strong>${fmt(e6)}</strong>\n\n<strong>Total: ${fmt(total)}</strong>`,
          exportable: false };
      }

      case 'aseguradoras': {
        const set = new Set(rea.map(r => r['Aseguradora']).filter(Boolean));
        return { text: badges + `Aseguradoras distintas: <strong>${set.size}</strong>.\n<em>${[...set].slice(0,4).join(', ') || '—'}</em>`, exportable: true, metricId, periodId, filters };
      }

      case 'top_prestaciones': {
        const by = {};
        rea.forEach(r => { const p = r['Prestación'] || r['Prestacion']; if (prestacionValida(p)) by[p] = (by[p]||0) + 1; });
        const top = Object.entries(by).sort((a,b) => b[1]-a[1]).slice(0,5);
        if (!top.length) return { text: badges + 'No encontré prestaciones válidas.', exportable: false };
        return { text: badges + `<strong>Top prestaciones:</strong>\n` +
          top.map((t,i) => `${i+1}. ${t[0]} — <strong>${fmt(t[1])}</strong> (${pct(t[1], rea.length)})`).join('\n') +
          `\n<em>Excluye MATERIAL, COSEGURO, NOTA, etc.</em>`, exportable: true, metricId, periodId, filters };
      }

      case 'top_coberturas': {
        const by = {};
        rea.forEach(r => { const c = r['Tipo Cobertura'] || 'Sin datos'; by[c] = (by[c]||0) + 1; });
        const top = Object.entries(by).sort((a,b) => b[1]-a[1]).slice(0,5);
        if (!top.length) return { text: badges + 'No encontré datos de cobertura.', exportable: false };
        return { text: badges + `<strong>Top tipos de cobertura:</strong>\n` +
          top.map((t,i) => `${i+1}. ${t[0]} — <strong>${fmt(t[1])}</strong> (${pct(t[1], rea.length)})`).join('\n'), exportable: true, metricId, periodId, filters };
      }
    }

    return null;
  }

  /* ============================================================
     CONSULTA DINÁMICA — busca en Consola/Prestación/etc.
     ============================================================ */
  /* ========= DICCIONARIO DE VARIANTES DE ESTUDIOS (compartido con motor AI) =========
     Mapea lenguaje natural a abbr canónico + regla de exclusión por tipo.
     Patrón de match: Prestación empieza con "ABBR " / "ABBR-" / exacto "ABBR". */
  const STUDY_VARIANTS = {
    // Tomografía
    'TC':{abbr:'TC',exclude:'RADIO'}, 'TAC':{abbr:'TC',exclude:'RADIO'},
    'TOMO':{abbr:'TC',exclude:'RADIO'}, 'TOMOS':{abbr:'TC',exclude:'RADIO'},
    'TOMOGRAFIA':{abbr:'TC',exclude:'RADIO'}, 'TOMOGRAFIAS':{abbr:'TC',exclude:'RADIO'},
    'TOMOGRAFIA COMPUTADA':{abbr:'TC',exclude:'RADIO'},
    'TOMOGRAFIA COMPUTARIZADA':{abbr:'TC',exclude:'RADIO'},
    // Resonancia
    'RM':{abbr:'RM'}, 'RMN':{abbr:'RM'},
    'RESO':{abbr:'RM'}, 'RESOS':{abbr:'RM'},
    'RESONANCIA':{abbr:'RM'}, 'RESONANCIAS':{abbr:'RM'},
    'RESONANCIA MAGNETICA':{abbr:'RM'},
    'RESONANCIA NUCLEAR':{abbr:'RM'},
    // Radiografía
    'RX':{abbr:'RX'},
    'RADIOGRAFIA':{abbr:'RX'}, 'RADIOGRAFIAS':{abbr:'RX'},
    'PLACA':{abbr:'RX'}, 'PLACAS':{abbr:'RX'},
    // Ecografía (EXCLUYE ecodoppler)
    'ECO':{abbr:'ECO',exclude:'ECODOPPLER'},
    'ECOS':{abbr:'ECO',exclude:'ECODOPPLER'},
    'ECOGRAFIA':{abbr:'ECO',exclude:'ECODOPPLER'},
    'ECOGRAFIAS':{abbr:'ECO',exclude:'ECODOPPLER'},
    // Ecodoppler (separado de eco)
    'ECODOPPLER':{abbr:'ECODOPPLER'}, 'ECODOPPLERS':{abbr:'ECODOPPLER'},
    'ECO DOPPLER':{abbr:'ECODOPPLER'}, 'ECOS DOPPLER':{abbr:'ECODOPPLER'},
    'DOPPLER':{abbr:'ECODOPPLER'}, 'DOPPLERS':{abbr:'ECODOPPLER'}
  };
  function stripAccentsChat(s) {
    return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function lookupStudyVariant(rawTerm) {
    const norm = stripAccentsChat(String(rawTerm||'')).toUpperCase().replace(/\s+/g,' ').trim();
    if (!norm) return null;
    // 1) Match exacto
    if (STUDY_VARIANTS[norm]) return STUDY_VARIANTS[norm];
    // 2) Match exacto sin "s" final (plural→singular)
    if (norm.endsWith('S') && STUDY_VARIANTS[norm.slice(0,-1)]) return STUDY_VARIANTS[norm.slice(0,-1)];
    // 3) Match de bigramas ("ECO DOPPLER", "TOMOGRAFIA COMPUTADA", "RESONANCIA MAGNETICA")
    const words = norm.split(' ').filter(Boolean);
    for (let i = 0; i < words.length - 1; i++) {
      const bi = words[i] + ' ' + words[i+1];
      if (STUDY_VARIANTS[bi]) return STUDY_VARIANTS[bi];
    }
    // 4) Match de palabra suelta (ej: "cuantas ecografias" → busca "ECOGRAFIAS")
    for (const w of words) {
      if (STUDY_VARIANTS[w]) return STUDY_VARIANTS[w];
      if (w.endsWith('S') && STUDY_VARIANTS[w.slice(0,-1)]) return STUDY_VARIANTS[w.slice(0,-1)];
    }
    return null;
  }
  function prestacionMatchesStudy(prRaw, map) {
    if (!map || !map.abbr) return false;
    const pr = stripAccentsChat(String(prRaw||'').toUpperCase().trim());
    if (!pr) return false;
    if (map.exclude && pr.startsWith(map.exclude)) return false;
    if (pr === map.abbr) return true;
    if (pr.startsWith(map.abbr + ' ')) return true;
    if (pr.startsWith(map.abbr + '-')) return true;
    if (map.abbr === 'ECODOPPLER' && pr.startsWith('ECODOPPLER')) return true;
    return false;
  }

  /* ============================================================
     DETECCIÓN DINÁMICA DE EQUIPO/CONSOLA
     Construye vocabulario desde Consola+Equipo de los datos reales
     y matchea palabras ≥5 letras del término del usuario
     ============================================================ */
  let _equipVocabCache = null;
  function buildEquipmentVocab(data) {
    if (_equipVocabCache) return _equipVocabCache;
    const vocab = new Map(); // palabra → nombre completo del equipo
    const studyBlock = new Set(Object.keys(STUDY_VARIANTS)
      .concat(['SPITRELLA','JAVILA','JMONICA','ZABRAHAM','ITORRES','OTROS']));
    const generic = new Set(['HOSPITAL','ITALIANO','FUESMEN','CENTRAL','SEDE','SALA','PLANTA','BLANCO','NEGRO']);
    for (const r of (data||[])) {
      const c = (r['Consola']||'').toString().trim().toUpperCase();
      const e = (r['Equipo']||'').toString().trim().toUpperCase();
      [c, e].forEach(fullName => {
        if (!fullName) return;
        const clean = stripAccentsChat(fullName);
        const parts = clean.split(/[^A-Z0-9]+/).filter(w => w.length >= 5);
        for (const p of parts) {
          if (studyBlock.has(p)) continue; // evitar conflictos con tipos de estudio/operadores
          if (generic.has(p)) continue;     // evitar palabras demasiado genéricas
          if (!vocab.has(p)) vocab.set(p, fullName);
        }
      });
    }
    _equipVocabCache = vocab;
    return vocab;
  }
  function detectEquipmentInTerm(rawTerm, data) {
    const vocab = buildEquipmentVocab(data);
    if (!vocab.size) return { cleanedTerm: rawTerm, detectedEquipment: null, equipmentMatchWord: null };
    const normTerm = stripAccentsChat(String(rawTerm||'')).toUpperCase();
    const termWords = normTerm.split(/[^A-Z0-9]+/).filter(w => w.length >= 5);
    for (const tw of termWords) {
      if (vocab.has(tw)) {
        const cleaned = String(rawTerm||'').replace(new RegExp('\\b' + tw + '\\b','gi'),'').replace(/\s+/g,' ').trim();
        return { cleanedTerm: cleaned, detectedEquipment: vocab.get(tw), equipmentMatchWord: tw };
      }
    }
    return { cleanedTerm: rawTerm, detectedEquipment: null, equipmentMatchWord: null };
  }

  async function respondDynamic(searchTerm, periodId, filters = {}) {
    const data = await loadData();
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { text: `Para responder eso necesito que cargues un Excel primero.\n${link('index.html','Ir a cargar datos')}`, exportable: false };
    }

    // Detectar si el término menciona un equipo/consola específico de los datos
    const eqDet = detectEquipmentInTerm(searchTerm, data);
    if (eqDet.detectedEquipment && !filters.consola) {
      filters = { ...filters, consola: eqDet.detectedEquipment };
      searchTerm = eqDet.cleanedTerm || searchTerm;
    }

    const badges = filterBadges(filters, periodId);
    let dataFiltered = filterByPeriod(data, periodId);
    dataFiltered = applyDynFilters(dataFiltered, filters);
    const rea = dataFiltered.filter(esRealizado);

    if (rea.length === 0) {
      return { text: badges + `No encontré registros realizados con esos filtros.`, exportable: false };
    }

    const term = searchTerm.toUpperCase();
    // ¿Es un tipo de estudio conocido? (ecografías, TC, RM, etc.)
    const studyMap = lookupStudyVariant(searchTerm);

    // Search in Consola, Prestación, Equipo columns
    const matched = rea.filter(r => {
      // Si es un tipo de estudio conocido → match por prefijo canónico de Prestación (seguro, aplica exclusiones)
      if (studyMap) return prestacionMatchesStudy(r['Prestación']||r['Prestacion'], studyMap);
      // Fallback: búsqueda libre tipo substring
      const consola = (r['Consola']||'').toUpperCase();
      const prest = (r['Prestación']||r['Prestacion']||'').toUpperCase();
      const equipo = (r['Equipo']||'').toUpperCase();
      const aseg = (r['Aseguradora']||'').toUpperCase();
      return consola.includes(term) || prest.includes(term) || equipo.includes(term) || aseg.includes(term);
    });

    if (matched.length === 0) {
      // Try fuzzy: split term and check if all words appear somewhere
      const words = term.split(/\s+/).filter(w => w.length >= 2);
      if (words.length > 0) {
        const fuzzyMatched = rea.filter(r => {
          const hay = [r['Consola'],r['Prestación'],r['Prestacion'],r['Equipo'],r['Aseguradora']]
            .map(v => (v||'').toUpperCase()).join(' ');
          return words.every(w => hay.includes(w));
        });
        if (fuzzyMatched.length > 0) {
          // Count unique turnos
          const turnos = new Set(fuzzyMatched.map(r => r['Turno N°']).filter(Boolean));
          const count = turnos.size || fuzzyMatched.length;

          // Group by what matched for context
          const byConsola = {};
          fuzzyMatched.forEach(r => {
            const c = r['Consola'] || r['Equipo'] || 'Sin equipo';
            byConsola[c] = (byConsola[c]||0) + 1;
          });
          const topConsola = Object.entries(byConsola).sort((a,b) => b[1]-a[1]).slice(0,3);

          return {
            text: badges + `Encontré <strong>${fmt(count)} turnos</strong> que coinciden con "<strong>${searchTerm}</strong>".\n` +
              (topConsola.length > 1 ? `\n<em>Por equipo:</em>\n${topConsola.map(([c,n]) => `• ${c}: ${fmt(n)}`).join('\n')}` : '') +
              `\n<em>De ${fmt(rea.length)} estudios REA en total.</em>`,
            exportable: true,
            dynRows: fuzzyMatched,
            searchTerm
          };
        }
      }
      return { text: badges + `No encontré resultados para "<strong>${searchTerm}</strong>" en los datos.\n<em>Busqué en: Consola, Prestación, Equipo, Aseguradora</em>`, exportable: false };
    }

    // Count unique turnos
    const turnos = new Set(matched.map(r => r['Turno N°']).filter(Boolean));
    const count = turnos.size || matched.length;

    // Group by consola for more detail
    const byConsola = {};
    matched.forEach(r => {
      const c = r['Consola'] || r['Equipo'] || 'Sin equipo';
      byConsola[c] = (byConsola[c]||0) + 1;
    });
    const topConsola = Object.entries(byConsola).sort((a,b) => b[1]-a[1]).slice(0,5);

    return {
      text: badges + `Encontré <strong>${fmt(count)} turnos</strong> de "<strong>${searchTerm}</strong>".\n` +
        (topConsola.length > 1 ? `\n<em>Por equipo/consola:</em>\n${topConsola.map(([c,n]) => `• ${c}: ${fmt(n)}`).join('\n')}` : '') +
        `\n<em>De ${fmt(rea.length)} estudios REA en total (${pct(count, rea.length)}).</em>`,
      exportable: true,
      dynRows: matched,
      searchTerm
    };
  }

  /* ============================================================
     EXPORTAR A EXCEL — MISMO FORMATO QUE LOS MÓDULOS
     ============================================================ */
  function ensureExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
      s.onload  = () => resolve(window.ExcelJS);
      s.onerror = () => reject(new Error('No se pudo cargar librería Excel'));
      document.head.appendChild(s);
    });
  }

  function generateLogoPNG() {
    const c = document.createElement('canvas');
    c.width = 480; c.height = 100;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0F172A'; ctx.fillRect(0,0,c.width,c.height);
    const cx = 50, cy = 50, r = 34;
    const glow = ctx.createRadialGradient(cx,cy,r-2,cx,cy,r+12);
    glow.addColorStop(0,'rgba(59,130,246,.25)'); glow.addColorStop(1,'rgba(59,130,246,0)');
    ctx.fillStyle = glow; ctx.fillRect(cx-r-14,cy-r-14,(r+14)*2,(r+14)*2);
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.strokeStyle = '#3B82F6'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,r-5,0,Math.PI*2);
    ctx.strokeStyle = 'rgba(59,130,246,.3)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,r-6,0,Math.PI*2);
    const innerFill = ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r);
    innerFill.addColorStop(0,'#1E3A8A'); innerFill.addColorStop(1,'#0F172A');
    ctx.fillStyle = innerFill; ctx.fill();
    ctx.beginPath(); ctx.arc(cx,cy,r,-1.2,0.3);
    ctx.strokeStyle = '#22DBAE'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,r,2.0,3.2);
    ctx.strokeStyle = '#3B82F6'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke();
    [[-1.2,'#22DBAE',3],[0.3,'#3B82F6',2.5],[-Math.PI/2,'#22DBAE',2.5],[2.0,'#3B82F6',2],[3.2,'#22DBAE',1.8]].forEach(([a,col,sz]) => {
      ctx.beginPath(); ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,sz,0,Math.PI*2); ctx.fillStyle=col; ctx.fill();
    });
    [[-1.2,10,'#22DBAE'],[0.3,8,'#3B82F6'],[-Math.PI/2,8,'#22DBAE']].forEach(([a,len,col]) => {
      ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r); ctx.lineTo(cx+Math.cos(a)*(r+len),cy+Math.sin(a)*(r+len));
      ctx.strokeStyle=col; ctx.lineWidth=0.8; ctx.globalAlpha=0.6; ctx.stroke(); ctx.globalAlpha=1;
    });
    [[cx+r+12,cy-8,1,'#22DBAE',0.5],[cx+r+6,cy+14,0.8,'#3B82F6',0.4],[cx-r-8,cy-12,0.8,'#3B82F6',0.4]].forEach(([x,y,sz,col,a]) => {
      ctx.beginPath(); ctx.arc(x,y,sz,0,Math.PI*2); ctx.fillStyle=col; ctx.globalAlpha=a; ctx.fill(); ctx.globalAlpha=1;
    });
    const spGrad = ctx.createLinearGradient(cx-14,cy-12,cx+14,cy+12);
    spGrad.addColorStop(0,'#B8D4F0'); spGrad.addColorStop(1,'#3B82F6');
    ctx.font = 'bold 32px Rajdhani, Calibri, Arial'; ctx.fillStyle = spGrad;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SP',cx,cy+1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 28px Rajdhani, Calibri, Arial';
    ctx.fillStyle = '#B8D4F0'; ctx.fillText('CONTROL',100,40);
    ctx.fillStyle = '#3B82F6'; ctx.fillText('DATA',100,68);
    ctx.beginPath(); ctx.moveTo(100,48); ctx.lineTo(260,48);
    ctx.strokeStyle = 'rgba(59,130,246,.2)'; ctx.lineWidth = 0.5; ctx.stroke();
    return c.toDataURL('image/png').split(',')[1];
  }

  function deduplicarPorTurno(rows) {
    const seen = new Set();
    return rows.filter(r => {
      const t = r['Turno N°'];
      if (!t || t==='') return true;
      if (seen.has(t)) return false;
      seen.add(t); return true;
    });
  }

  async function buildSpcdWorkbook(dataRows, cols, shortH, colW, opts) {
    /* Migrado a SpcdExcel template (Bloomberg/Fintech style) — abril 2026 */
    if (!window.SpcdExcel) {
      /* fallback: si por algún motivo no está cargado el template, lo cargamos al vuelo */
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'spcd-excel-template.js?v=1';
        s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar spcd-excel-template.js'));
        document.head.appendChild(s);
      });
    }
    await window.SpcdExcel.ready();

    const subtitle = opts.reportTitle || 'INFORME SPCD';
    const { wb, ws } = window.SpcdExcel.createBook({ subtitle, sheetName:'Detalle' });

    /* KPIs simples — total de registros + cantidad de columnas + tipo */
    const totRegs = dataRows.length;

    const h = window.SpcdExcel.buildHeader(ws, {
      subtitle,
      totalCols: cols.length,
      meta:{
        modulo:  (opts.modulo || 'CHATBOT').toUpperCase(),
        sede:    window.SpcdExcel.getCurrentSede(),
        usuario: window.SpcdExcel.getCurrentUser(),
        registros: totRegs,
        extra:    opts.infoTitle ? opts.infoTitle.toUpperCase() : null
      }
    });

    /* KPIs si vienen, si no algo simple */
    const kpis = opts.kpis || [
      { label:'Registros',  value: totRegs.toLocaleString('es-AR'), tone:'cyan' },
      { label:'Columnas',   value: cols.length, tone:'silver' },
      { label:'Tipo',       value: (opts.infoTitle || 'Detalle').toUpperCase(), tone:'emerald' }
    ];
    const k = window.SpcdExcel.buildKPIs(ws, kpis, { startRow: h.nextRow, totalCols: cols.length });

    const sec = window.SpcdExcel.buildSection(ws, { startRow: k.nextRow, totalCols: cols.length, title: (opts.infoTitle || 'DATOS').toUpperCase() });

    const t = window.SpcdExcel.buildTable(ws, {
      columns: shortH,
      widths:  colW,
      rows:    dataRows.map(r => cols.map(c => r[c])),
      startRow: sec.nextRow,
      totalCols: cols.length,
      formatter: (cell, v, rowDataArr, idx, ci, shortName) => {
        const c = cols[ci];
        const r = dataRows[idx];
        if (typeof v === 'number') window.SpcdExcel.Fmt.center(cell);
        if (opts.cellColorFn) {
          const argb = opts.cellColorFn(c, v, r);
          if (argb) {
            /* el cellColorFn devuelve hex o argb (8 chars). Lo tomamos como argb completo. */
            const norm = (argb.length === 8 ? argb : ('FF' + argb)).toUpperCase();
            cell.font = { ...(cell.font||{}), color:{ argb: norm }, bold:true };
          }
        }
        if (c === 'Coseguro' || c === 'Neto Unitario') window.SpcdExcel.Fmt.money(cell);
      }
    });

    const tot = window.SpcdExcel.buildTotals(ws, {
      startRow: t.nextRow,
      totalCols: cols.length,
      items: [{ label:'Registros', value: totRegs.toLocaleString('es-AR') }]
    });
    window.SpcdExcel.buildFooter(ws, { startRow: tot.nextRow, totalCols: cols.length, hash: h.hash });

    await window.SpcdExcel.exportAndShare(wb, opts.fileName, null);
  }

  function isExportIntent(text) {
    return /\bexport(ar|a|ame|alo|en|eme)\b/.test(text) ||
           /\bdescarg(ar|a|ame|alo|en|ueme)\b/.test(text) ||
           /\bbaj(ar|a|ame|alo|en|eme)\b/.test(text) ||
           /\bxlsx\b/.test(text) ||
           /\b(dame|quiero|generame|genera|pasame|necesito|hazme|hacme|armame|arma)\b.*\b(excel|xlsx|planilla|archivo|reporte|listado)\b/.test(text) ||
           /\b(excel|xlsx|planilla|listado)\s+(de|con|para|sobre)\b/.test(text) ||
           /\ben\s+(excel|xlsx|planilla)\b/.test(text);
  }

  const COLS_MEDICO = {
    keys:   ['Turno Fecha','Turno N°','Paciente','Documento','Prestación','Equipo','Médico Informante','Informe','Días Pendiente'],
    short:  ['Fecha','Turno N°','Paciente','DNI','Prestación','Equipo','Médico','Informe','Días'],
    widths: [10,10,22,12,28,14,18,10,6],
  };
  const COLS_TECNICO = {
    keys:   ['Turno Fecha','Turno N°','Paciente','Documento','Prestación','Equipo','Estado','Duración'],
    short:  ['Fecha','T.N°','Paciente','DNI','Prestación','Equipo','Est','Duración'],
    widths: [10,6,22,12,28,16,6,10],
  };
  const COLS_ADMIN = {
    keys:   ['Turno Fecha','Turno N°','Paciente','Documento','Nº Afiliado','Aseguradora','Tipo Cobertura',
             'Derivante','Inst Derivante','Operador','Prestación','Coseguro','ID Aseguradora','Cuenta','Neto Unitario','Estado'],
    short:  ['Fecha','T.N°','Paciente','DNI','Afiliad','Aseguradora','Cobertura',
             'Derivante','Inst.Deriv','Operador','Prestación','Coseg$','ID Aseg','Cuenta','Neto$','Est'],
    widths: [10,6,22,12,10,16,12,18,16,12,24,8,8,14,8,5],
  };
  const COLS_DYNAMIC = {
    keys:   ['Turno Fecha','Turno N°','Paciente','Documento','Prestación','Consola','Equipo','Aseguradora','Operador','Estado'],
    short:  ['Fecha','T.N°','Paciente','DNI','Prestación','Consola','Equipo','Aseguradora','Operador','Est'],
    widths: [10,6,22,12,28,16,16,16,12,5],
  };

  /* Exportar una consulta dinámica */
  async function exportDynamic(rows, searchTerm, periodId) {
    if (!rows || rows.length === 0) return `No hay registros para exportar.`;
    try {
      const pr = periodId ? getPeriodRange(periodId) : null;
      const periodSuffix = pr ? `_${pr.label.replace(/\s+/g,'_')}` : '';
      const today = new Date().toISOString().slice(0,10);
      const safeTerm = searchTerm.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
      const fullName = `SPCD_Consulta_${safeTerm}${periodSuffix}_${today}.xlsx`;

      const deduped = deduplicarPorTurno(rows);
      await buildSpcdWorkbook(
        deduped.map(r => ({...r})),
        COLS_DYNAMIC.keys,
        COLS_DYNAMIC.short,
        COLS_DYNAMIC.widths,
        {
          reportTitle: `CONSULTA — ${searchTerm.toUpperCase()}`,
          infoTitle: searchTerm,
          fileName: fullName,
        }
      );
      return `📥 <strong>Excel generado</strong>\n• Búsqueda: ${searchTerm}\n• Registros: <strong>${fmt(deduped.length)}</strong>\n• Archivo: <strong>${fullName}</strong>`;
    } catch(e) {
      return `❌ Error al generar el archivo: ${e.message || e}`;
    }
  }

  async function exportMetric(metricId, periodId, filters = {}) {
    const data = await loadData();
    if (!data || !Array.isArray(data) || data.length === 0) {
      return `Para exportar necesito que cargues un Excel primero.\n${link('index.html','Ir a cargar datos')}`;
    }

    const pr = periodId ? getPeriodRange(periodId) : null;
    const periodBadge  = pr ? badge(pr.label) : '';
    const periodSuffix = pr ? `_${pr.label.replace(/\s+/g,'_')}` : '';
    let filtered = filterByPeriod(data, periodId);
    filtered = applyDynFilters(filtered, filters);
    const rea      = filtered.filter(esRealizado);

    let spec = null;
    const hoy = new Date();
    const RED='F87171', AMBER='FBBF24', GREEN='55E78B';

    switch(metricId) {
      case 'total_reg':
        spec = { rows: deduplicarPorTurno(filtered), schema: COLS_TECNICO, reportTitle: 'INFORME — TODOS LOS REGISTROS', infoTitle: 'Registros completos', filePrefix: 'SPCD_Registros', descripcion: 'todos los registros' };
        break;
      case 'total_rea':
        spec = { rows: deduplicarPorTurno(rea), schema: COLS_TECNICO, reportTitle: 'INFORME TÉCNICO', infoTitle: 'Estudios realizados', filePrefix: 'SPCD_Tecnico_Realizados', descripcion: 'estudios realizados' };
        break;
      case 'total_aus':
        spec = { rows: deduplicarPorTurno(filtered.filter(r => String(r['Estado']||'').trim().toUpperCase() === 'AUS')), schema: COLS_TECNICO, reportTitle: 'INFORME TÉCNICO', infoTitle: 'Ausentes', filePrefix: 'SPCD_Tecnico_Ausentes', descripcion: 'ausentes' };
        break;
      case 'sin_informe':
        spec = { rows: deduplicarPorTurno(rea.filter(sinInforme)).map(r => { const f = parseDate(r['Turno Fecha']); const dias = f ? Math.floor((hoy - f) / 86400000) : null; return { ...r, 'Informe': r['Informe'] || 'Sin I/F', 'Días Pendiente': dias !== null ? dias : '' }; }), schema: COLS_MEDICO, reportTitle: 'INFORME MÉDICO', infoTitle: 'Sin informe', filePrefix: 'SPCD_Medico_SinInforme', descripcion: 'estudios sin informe', cellColorFn: (col, val) => { if (col === 'Informe') return RED; if (col === 'Días Pendiente' && typeof val === 'number') { return val >= 7 ? RED : val >= 4 ? AMBER : GREEN; } return null; } };
        break;
      case 'con_informe':
        spec = { rows: deduplicarPorTurno(rea.filter(tieneInforme)).map(r => ({ ...r, 'Informe': 'I/F', 'Días Pendiente': '' })), schema: COLS_MEDICO, reportTitle: 'INFORME MÉDICO', infoTitle: 'Con informe', filePrefix: 'SPCD_Medico_ConInforme', descripcion: 'estudios con informe' };
        break;
      case 'err_derivantes':
        spec = { rows: deduplicarPorTurno(rea.filter(errorDerivante)), schema: COLS_ADMIN, reportTitle: 'INFORME ADMINISTRATIVO', infoTitle: 'Derivantes con error', filePrefix: 'SPCD_Admin_ErrDerivantes', descripcion: 'derivantes con error', cellColorFn: (col) => col === 'Derivante' ? RED : null };
        break;
      case 'err_coseguros':
        spec = { rows: deduplicarPorTurno(rea.filter(errorCoseguro)), schema: COLS_ADMIN, reportTitle: 'INFORME ADMINISTRATIVO', infoTitle: 'Coseguros con error', filePrefix: 'SPCD_Admin_ErrCoseguros', descripcion: 'coseguros con error', cellColorFn: (col) => (col === 'Coseguro' || col === 'Neto Unitario') ? RED : null };
        break;
      case 'err_instderiv':
        spec = { rows: deduplicarPorTurno(rea.filter(errorInstDerivante)), schema: COLS_ADMIN, reportTitle: 'INFORME ADMINISTRATIVO', infoTitle: 'Inst. Derivante con error', filePrefix: 'SPCD_Admin_ErrInstDeriv', descripcion: 'inst. derivante con error', cellColorFn: (col) => col === 'Inst Derivante' ? RED : null };
        break;
      case 'err_tramites':
        spec = { rows: deduplicarPorTurno(rea.filter(esErrorTramiteIncompleto)), schema: COLS_ADMIN, reportTitle: 'INFORME ADMINISTRATIVO', infoTitle: 'Trámites incompletos', filePrefix: 'SPCD_Admin_Tramites', descripcion: 'trámites incompletos', cellColorFn: (col, val, r) => { const aseg = (r['Aseguradora']||'').trim().toUpperCase(); if (aseg === 'PARTICULAR' && col === 'N° Factura') return RED; if (aseg !== 'PARTICULAR' && col === 'N° Orden') return RED; return null; } };
        break;
      case 'err_referencia':
        spec = { rows: deduplicarPorTurno(rea.filter(esErrorReferencia)), schema: COLS_ADMIN, reportTitle: 'INFORME ADMINISTRATIVO', infoTitle: 'Sin N° Referencia', filePrefix: 'SPCD_Admin_SinReferencia', descripcion: 'sin referencia' };
        break;
      case 'err_cobertura':
        spec = { rows: deduplicarPorTurno(rea.filter(esErrorCobertura)), schema: COLS_ADMIN, reportTitle: 'INFORME ADMINISTRATIVO', infoTitle: 'Tipo Cobertura con error', filePrefix: 'SPCD_Admin_ErrCobertura', descripcion: 'tipo cobertura con error' };
        break;
      case 'top_medicos': {
        const con = rea.filter(tieneInforme);
        const by = {}; con.forEach(r => { const m = r['Médico Informante']; if (medicoValido(m)) by[m] = (by[m]||0) + 1; });
        const total = Object.values(by).reduce((s,v) => s+v, 0);
        const entries = Object.entries(by).sort((a,b) => b[1]-a[1]);
        spec = { rows: entries.map(([m,n],i) => ({ '#': i+1, 'Médico': m, 'Cantidad': n, 'Porcentaje': total ? ((n/total)*100).toFixed(1)+'%' : '—' })), schema: { keys: ['#','Médico','Cantidad','Porcentaje'], short: ['#','Médico Informante','Cantidad','%'], widths: [4,36,12,12] }, reportTitle: 'INFORME MÉDICO — RANKING', infoTitle: 'Top médicos por informes', filePrefix: 'SPCD_Medico_TopMedicos', descripcion: 'ranking de médicos' };
        break;
      }
      case 'top_pendientes': {
        const pen = rea.filter(sinInforme);
        const by = {}; pen.forEach(r => { const m = r['Médico Informante']; if (medicoValido(m)) by[m] = (by[m]||0) + 1; });
        const entries = Object.entries(by).sort((a,b) => b[1]-a[1]);
        const total = entries.reduce((s,e) => s+e[1], 0);
        spec = { rows: entries.map(([m,n],i) => ({ '#': i+1, 'Médico': m, 'Pendientes': n, 'Porcentaje': total ? ((n/total)*100).toFixed(1)+'%' : '—' })), schema: { keys: ['#','Médico','Pendientes','Porcentaje'], short: ['#','Médico Informante','Pendientes','%'], widths: [4,36,12,12] }, reportTitle: 'INFORME MÉDICO — PENDIENTES', infoTitle: 'Top médicos con pendientes', filePrefix: 'SPCD_Medico_TopPendientes', descripcion: 'médicos con pendientes', cellColorFn: (col) => col === 'Pendientes' ? AMBER : null };
        break;
      }
      case 'top_equipos': {
        const by = {}; rea.forEach(r => { const e = r['Equipo']; if (e) by[e] = (by[e]||0) + 1; });
        const entries = Object.entries(by).sort((a,b) => b[1]-a[1]);
        spec = { rows: entries.map(([e,n],i) => ({ '#': i+1, 'Equipo': e, 'Cantidad': n, 'Porcentaje': rea.length ? ((n/rea.length)*100).toFixed(1)+'%' : '—' })), schema: { keys: ['#','Equipo','Cantidad','Porcentaje'], short: ['#','Equipo','Cantidad','%'], widths: [4,28,12,12] }, reportTitle: 'INFORME TÉCNICO — RANKING', infoTitle: 'Top equipos', filePrefix: 'SPCD_Tecnico_TopEquipos', descripcion: 'ranking de equipos' };
        break;
      }
      case 'top_prestaciones': {
        const by = {}; rea.forEach(r => { const p = r['Prestación'] || r['Prestacion']; if (prestacionValida(p)) by[p] = (by[p]||0) + 1; });
        const entries = Object.entries(by).sort((a,b) => b[1]-a[1]);
        spec = { rows: entries.map(([p,n],i) => ({ '#': i+1, 'Prestación': p, 'Cantidad': n, 'Porcentaje': rea.length ? ((n/rea.length)*100).toFixed(1)+'%' : '—' })), schema: { keys: ['#','Prestación','Cantidad','Porcentaje'], short: ['#','Prestación','Cantidad','%'], widths: [4,42,12,12] }, reportTitle: 'INFORME — RANKING DE PRESTACIONES', infoTitle: 'Top prestaciones', filePrefix: 'SPCD_TopPrestaciones', descripcion: 'ranking de prestaciones' };
        break;
      }
      case 'top_coberturas': {
        const by = {}; rea.forEach(r => { const c = r['Tipo Cobertura'] || 'Sin datos'; by[c] = (by[c]||0) + 1; });
        const entries = Object.entries(by).sort((a,b) => b[1]-a[1]);
        spec = { rows: entries.map(([c,n],i) => ({ '#': i+1, 'Cobertura': c, 'Cantidad': n, 'Porcentaje': rea.length ? ((n/rea.length)*100).toFixed(1)+'%' : '—' })), schema: { keys: ['#','Cobertura','Cantidad','Porcentaje'], short: ['#','Tipo Cobertura','Cantidad','%'], widths: [4,30,12,12] }, reportTitle: 'INFORME ADMINISTRATIVO — COBERTURAS', infoTitle: 'Top coberturas', filePrefix: 'SPCD_Admin_TopCoberturas', descripcion: 'ranking de coberturas' };
        break;
      }
      case 'aseguradoras': {
        const by = {}; rea.forEach(r => { const a = r['Aseguradora']; if (a) by[a] = (by[a]||0) + 1; });
        const entries = Object.entries(by).sort((a,b) => b[1]-a[1]);
        spec = { rows: entries.map(([a,n],i) => ({ '#': i+1, 'Aseguradora': a, 'Estudios': n })), schema: { keys: ['#','Aseguradora','Estudios'], short: ['#','Aseguradora','Estudios'], widths: [4,38,12] }, reportTitle: 'INFORME ADMINISTRATIVO — ASEGURADORAS', infoTitle: 'Aseguradoras activas', filePrefix: 'SPCD_Admin_Aseguradoras', descripcion: 'aseguradoras' };
        break;
      }
      case 'equipos_activos': {
        const by = {}; rea.forEach(r => { const e = r['Equipo']; if (e) by[e] = (by[e]||0) + 1; });
        const entries = Object.entries(by).sort((a,b) => b[1]-a[1]);
        spec = { rows: entries.map(([e,n],i) => ({ '#': i+1, 'Equipo': e, 'Estudios': n })), schema: { keys: ['#','Equipo','Estudios'], short: ['#','Equipo','Estudios'], widths: [4,30,12] }, reportTitle: 'INFORME TÉCNICO — EQUIPOS', infoTitle: 'Equipos activos', filePrefix: 'SPCD_Tecnico_Equipos', descripcion: 'equipos activos' };
        break;
      }
      default:
        return periodBadge + `No tengo exportación para esa métrica todavía.\nProbá: <em>"dame el excel de sin informe"</em>`;
    }

    if (!spec.rows || spec.rows.length === 0) {
      return periodBadge + `No hay registros de ${spec.descripcion} para exportar.`;
    }

    try {
      const today = new Date().toISOString().slice(0,10);
      const opSuffix = filters.operador ? `_${filters.operador}` : '';
      const fullName = `${spec.filePrefix}${opSuffix}${periodSuffix}_${today}.xlsx`;
      await buildSpcdWorkbook(
        spec.rows.map(r => ({...r})),
        spec.schema.keys, spec.schema.short, spec.schema.widths,
        { reportTitle: spec.reportTitle, infoTitle: spec.infoTitle, fileName: fullName, cellColorFn: spec.cellColorFn }
      );
      return periodBadge +
        `📥 <strong>Excel generado</strong>\n• Contenido: ${spec.descripcion}\n• Registros: <strong>${fmt(spec.rows.length)}</strong>\n• Archivo: <strong>${fullName}</strong>\n<em>Formato oficial Lumen — revisá tu carpeta de descargas.</em>`;
    } catch(e) {
      console.error('[SPCD-CB] export error:', e);
      return `❌ Error al generar el archivo: ${e.message || e}`;
    }
  }

  /* ============================================================
     ═══════════════════════════════════════════════════════════
     SPCD AI MODULE — Gemini Flash integration (solo admin)
     Privacy-preserving: datos NUNCA salen del browser
     ═══════════════════════════════════════════════════════════
     ============================================================ */
  const AI = (function() {
    const LS_KEY_API   = 'spcd_ai_gemini_key';
    const LS_KEY_AUDIT = 'spcd_ai_audit_log';
    const MODEL        = 'gemini-1.5-flash-latest';
    const API_URL      = m => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
    const MIN_INTERVAL = 2000;   // 1 req cada 2s como máximo
    const MAX_AUDIT    = 30;     // últimas 30 requests
    const REQ_TIMEOUT  = 20000;  // 20s timeout por request

    let _lastCallTs = 0;

    /* ===== API KEY MGMT ===== */
    function getKey() { return localStorage.getItem(LS_KEY_API) || ''; }
    function setKey(k) { localStorage.setItem(LS_KEY_API, k||''); }
    function clearKey() { localStorage.removeItem(LS_KEY_API); }
    function hasKey() { return !!getKey(); }
    function maskKey(k) {
      if (!k) return '(sin configurar)';
      return k.slice(0,4) + '••••••••' + k.slice(-4);
    }

    /* ===== SANITIZER — bloqueo de PII outbound ===== */
    // Regex: DNI argentino (7-8 dígitos), N° afiliado (10-17 dígitos), apellido-mayúsculas (patrón ROJAS, AMADEO)
    const PII_PATTERNS = [
      { name: 'DNI-like', re: /\b\d{7,8}\b/g },
      { name: 'Afiliado-largo', re: /\b\d{10,}\b/g },
      { name: 'Telefono', re: /\b\+?54\s?9?\s?\d{2,4}[\s\-]?\d{6,8}\b/g },
      { name: 'Email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g }
    ];
    function sanitizeOutbound(text) {
      if (!text) return { clean: text, blocked: [] };
      let clean = String(text);
      const blocked = [];
      PII_PATTERNS.forEach(p => {
        const matches = clean.match(p.re);
        if (matches) {
          blocked.push({ pattern: p.name, count: matches.length });
          clean = clean.replace(p.re, '[REDACTADO]');
        }
      });
      return { clean, blocked };
    }

    /* ===== SCHEMA — data dictionary ===== */
    const SCHEMA_DESC = `
Lumen by Pyralis — módulo de operaciones clínicas del Hospital Italiano de Mendoza (ex SPCD).

ENTIDAD: Turnos de estudios médicos.
COLUMNAS DE INTERÉS (no enviamos datos reales, sólo el esquema):
- "Turno Fecha" (fecha): fecha del turno
- "Operador" (texto): operador administrativo. Principales = SPITRELLA, JAVILA, JMONICA, ZABRAHAM, ITORRES. Otros = OTROS.
- "Aseguradora" (texto): obra social / cobertura
- "Tipo Cobertura" (texto): OBL, OPT, PART, etc.
- "Prestación" (texto): tipo de estudio (RM, TC, RX, ECO, etc.)
- "Derivante" (texto): médico derivante
- "Institución Deriv." (texto)
- "Estado": REA (realizado), AUS (ausente), SUS (suspendido)
- "Coseguro" (número): monto
- "Neto Unitario" (número): monto

MÉTRICAS DERIVADAS (claves canónicas):
- total_rea: cantidad de estudios realizados (Estado=REA)
- total_aus: ausentes
- total_errores: suma de los 7 tipos de error abajo
- err_instderiv, err_sinderiv, err_coseg, err_sinref, err_tramites, err_cob, err_fuera
- prom_diario, promedio_mensual, tiempo_prom_informe

INTENTS VÁLIDOS (devolver exactamente uno):
- count: cantidad de algo
- list: lista de items (top-N)
- search: búsqueda de un paciente/turno (se ejecuta local, no aquí)
- compare: comparar dos entidades (2 operadores, 2 períodos)
- trend: evolución temporal mensual
- rank: ranking top-N
- analyze: pedir análisis/insight (ej. "qué operador empeoró")
- report: generar informe en Excel
- chart: mostrar gráfico del dashboard
- faq: pregunta general sobre el sistema
- unknown: no estás seguro

FORMATO DE RESPUESTA: JSON con este shape exacto:
{
  "intent": <uno de los de arriba>,
  "metric": <clave canónica o null>,
  "filters": {
    "operador": <SPITRELLA|JAVILA|JMONICA|ZABRAHAM|ITORRES|OTROS|null>,
    "aseguradora": <texto libre o null>,
    "prestacion": <texto libre o null>,
    "mes_desde": <YYYY-MM o null>,
    "mes_hasta": <YYYY-MM o null>,
    "estado": <REA|AUS|SUS|null>,
    "tipo_error": <null o clave err_*>
  },
  "groupBy": <"operador"|"aseguradora"|"mes"|"prestacion"|null>,
  "topN": <número o null>,
  "output": <"text"|"table"|"excel">,
  "searchTerm": <null o string para intent search>,
  "explanation": <frase corta en español de lo que entendiste>
}

REGLAS DE NEGOCIO — traducir tipo de estudio a abbr canónico:
- Tomografía / TC / TAC / tomografías computadas → filters.prestacion = "TC". (La app excluye automáticamente las prestaciones RADIO* que son radiofármacos.)
- Resonancia / RM / RMN / resonancia magnética / resonancias → filters.prestacion = "RM".
- Radiografía / RX / placa / placas → filters.prestacion = "RX".
- Ecografía / eco / ecografías → filters.prestacion = "ECO". (La app excluye ECODOPPLER*.)
- Ecodoppler / eco doppler / doppler → filters.prestacion = "ECODOPPLER".
- Si la pregunta es sobre CANTIDAD de un tipo de estudio (cuántas X, total X, X realizadas), asumir filters.estado = "REA".
- SIEMPRE usar el abbr canónico (TC, RM, RX, ECO, ECODOPPLER). No devolver "RESONANCIA", "TOMOGRAFIA", etc.

REGLAS ESTRICTAS:
1. NUNCA devuelvas datos de pacientes en el JSON.
2. Si la pregunta menciona un DNI o nombre completo, usa intent "search" y deja searchTerm con el término tal cual, SIN incluirlo en explanation.
3. Meses en español → YYYY-MM. Si no se especifica año, usar 2026.
4. Si no estás seguro, intent: "unknown".
5. Respondé SOLO JSON, sin texto adicional.`.trim();

    /* ===== RATE LIMIT ===== */
    async function throttle() {
      const wait = _lastCallTs + MIN_INTERVAL - Date.now();
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      _lastCallTs = Date.now();
    }

    /* ===== GEMINI CLIENT ===== */
    async function callGemini(userMessage, systemInstruction) {
      const key = getKey();
      if (!key) throw new Error('NO_API_KEY');
      await throttle();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT);

      const body = {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 800
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',      threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',threshold: 'BLOCK_ONLY_HIGH' }
        ]
      };

      let res;
      try {
        res = await fetch(API_URL(MODEL) + '?key=' + encodeURIComponent(key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('TIMEOUT');
        throw new Error('NETWORK:' + e.message);
      }
      clearTimeout(timer);

      if (!res.ok) {
        const txt = await res.text().catch(()=>'');
        if (res.status === 400 && /API_KEY/i.test(txt)) throw new Error('BAD_API_KEY');
        if (res.status === 429) throw new Error('RATE_LIMIT');
        throw new Error('HTTP_' + res.status + ':' + txt.slice(0,200));
      }
      const json = await res.json();
      const cand = json.candidates && json.candidates[0];
      const txt = cand && cand.content && cand.content.parts && cand.content.parts[0] && cand.content.parts[0].text;
      if (!txt) throw new Error('EMPTY_RESPONSE');
      return txt;
    }

    /* ===== VALIDACIÓN JSON ===== */
    const VALID_INTENTS = ['count','list','search','compare','trend','rank','analyze','report','chart','faq','unknown'];
    const VALID_OPS     = ['SPITRELLA','JAVILA','JMONICA','ZABRAHAM','ITORRES','OTROS'];
    const VALID_ESTADOS = ['REA','AUS','SUS'];
    const VALID_GROUPBY = ['operador','aseguradora','mes','prestacion'];
    const VALID_OUTPUT  = ['text','table','excel'];

    function validateQuery(q) {
      if (!q || typeof q !== 'object') return 'no es objeto';
      if (!VALID_INTENTS.includes(q.intent)) return 'intent inválido';
      q.filters = q.filters || {};
      if (q.filters.operador && !VALID_OPS.includes(q.filters.operador)) q.filters.operador = null;
      if (q.filters.estado && !VALID_ESTADOS.includes(q.filters.estado)) q.filters.estado = null;
      if (q.groupBy && !VALID_GROUPBY.includes(q.groupBy)) q.groupBy = null;
      if (q.output && !VALID_OUTPUT.includes(q.output)) q.output = 'text';
      if (!q.output) q.output = 'text';
      if (q.topN != null && (typeof q.topN !== 'number' || q.topN < 1 || q.topN > 50)) q.topN = 10;
      if (q.filters.mes_desde && !/^\d{4}-\d{2}$/.test(q.filters.mes_desde)) q.filters.mes_desde = null;
      if (q.filters.mes_hasta && !/^\d{4}-\d{2}$/.test(q.filters.mes_hasta)) q.filters.mes_hasta = null;
      return null; // ok
    }

    /* ===== AUDIT LOG ===== */
    function audit(entry) {
      try {
        const list = JSON.parse(localStorage.getItem(LS_KEY_AUDIT) || '[]');
        list.unshift({ ts: Date.now(), ...entry });
        while (list.length > MAX_AUDIT) list.pop();
        localStorage.setItem(LS_KEY_AUDIT, JSON.stringify(list));
      } catch(e) { /* silencioso */ }
    }
    function getAudit() {
      try { return JSON.parse(localStorage.getItem(LS_KEY_AUDIT) || '[]'); }
      catch { return []; }
    }
    function clearAudit() { localStorage.removeItem(LS_KEY_AUDIT); }

    /* ===== TRADUCTOR NL → JSON ===== */
    async function translateQuery(userText) {
      const { clean, blocked } = sanitizeOutbound(userText);
      const auditEntry = {
        userText, sentText: clean, blocked,
        ok: false, response: null, intent: null, error: null
      };

      try {
        const raw = await callGemini(clean, SCHEMA_DESC);
        auditEntry.response = raw.slice(0, 500);
        let parsed;
        try { parsed = JSON.parse(raw); }
        catch(e) {
          // intentar extraer JSON de una fence
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) { try { parsed = JSON.parse(m[0]); } catch(e2) {} }
        }
        if (!parsed) throw new Error('PARSE_FAIL');
        const err = validateQuery(parsed);
        if (err) throw new Error('VALIDATE:' + err);
        auditEntry.ok = true;
        auditEntry.intent = parsed.intent;
        audit(auditEntry);
        return parsed;
      } catch(e) {
        auditEntry.error = e.message || String(e);
        audit(auditEntry);
        throw e;
      }
    }

    /* ===== HELPERS DE ACCESO A DATA ===== */
    // Usa loadData() del chatbot (IndexedDB) — datos nunca dejan el browser
    async function getDataset() {
      try {
        const data = await loadData();
        return Array.isArray(data) ? data : [];
      } catch { return []; }
    }

    function opOf(r) {
      const op = (r['Operador']||'').trim().toUpperCase();
      return VALID_OPS.slice(0,5).includes(op) ? op : 'OTROS';
    }
    function toDate(v) {
      if (!v) return null;
      if (v instanceof Date) return isNaN(v)?null:v;
      const d = new Date(v); return isNaN(d)?null:d;
    }
    function monthKey(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
    function monthLabel(k) {
      const [y,m] = k.split('-');
      const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      return meses[parseInt(m,10)-1] + " '" + y.slice(2);
    }

    // Error-type predicates (alineados con admin.html)
    function esErrorInstDerivante(r) {
      const pr = (r['Prestación']||r['Prestacion']||'').trim().toUpperCase();
      const inst = (r['Institución Deriv.']||r['Institucion Deriv.']||r['Inst Derivante']||'').trim().toUpperCase();
      const aseg = (r['Aseguradora']||'').trim().toUpperCase();
      return aseg.includes('FUESMEN') && !inst;
    }
    function esErrorSinDerivante(r) {
      const d = (r['Derivante']||'').trim().toUpperCase();
      return !d || d === 'A CONFIRMAR';
    }
    function esErrorCoseguros(r) {
      const id = String(r['ID Aseguradora']||'').trim();
      const cu = (r['Cuenta']||'').trim().toUpperCase();
      const pr = (r['Prestación']||r['Prestacion']||'').trim().toUpperCase();
      const ne = parseFloat(r['Neto Unitario']||0);
      return id==='1665' && cu.includes('OSEP') && pr==='COSEGURO' && ne===0;
    }
    function esErrorReferencia(r) {
      const id = String(r['ID Aseguradora']||'').trim();
      const ref = String(r['Nº Referencia']||r['N° Referencia']||r['Nro Referencia']||'').trim();
      return (id === '3075' || id === '1665') && !ref;
    }
    function esErrorTramiteIncompleto(r) {
      const aseg = (r['Aseguradora']||'').trim().toUpperCase();
      if (aseg === 'PARTICULAR') {
        return String(r['N° Factura']||r['Nro Factura']||'0').trim() === '0';
      }
      return String(r['N° Orden']||r['Nro Orden']||'0').trim() === '0';
    }
    function esErrorCobertura(r) {
      const tc = (r['Tipo Cobertura']||'').trim().toUpperCase();
      return !tc || tc === 'INDEFINIDA';
    }
    function esErrorFueraFechaFact(r) {
      const id = String(r['ID Aseguradora']||'').trim();
      if (id !== '3075' && id !== '1665') return false;
      const t = toDate(r['Turno Fecha']);
      const f = toDate(r['F/ Facturación']||r['F/Facturación']||r['F/ Facturacion']||r['F/Facturacion']);
      if (!t || !f) return !!t;
      return t.getMonth() !== f.getMonth() || t.getFullYear() !== f.getFullYear();
    }
    const ERR_MAP = {
      err_instderiv: { label:'Institución Derivante', fn:esErrorInstDerivante },
      err_sinderiv:  { label:'Sin Derivante',          fn:esErrorSinDerivante },
      err_coseg:     { label:'Coseguros OSEP',         fn:esErrorCoseguros },
      err_sinref:    { label:'Sin Referencia',         fn:esErrorReferencia },
      err_tramites:  { label:'Trámites Incompletos',   fn:esErrorTramiteIncompleto },
      err_cob:       { label:'Tipo Cobertura',         fn:esErrorCobertura },
      err_fuera:     { label:'Fuera Fecha Facturación',fn:esErrorFueraFechaFact }
    };
    function esCualquierError(r) {
      return Object.values(ERR_MAP).some(e => e.fn(r));
    }

    /* ===== SINÓNIMOS DE PRESTACIÓN ===== */
    // Normaliza cualquier variante al abbr canónico del sistema
    const PRESTACION_SYNONYMS = {
      // Tomografía
      'TC':'TC', 'TAC':'TC', 'TOMO':'TC', 'TOMOGRAFIA':'TC', 'TOMOGRAFIAS':'TC',
      'TOMOGRAFIA COMPUTADA':'TC', 'TOMOGRAFIA COMPUTARIZADA':'TC',
      // Resonancia
      'RM':'RM', 'RMN':'RM', 'RESO':'RM', 'RESONANCIA':'RM', 'RESONANCIAS':'RM',
      'RESONANCIA MAGNETICA':'RM', 'RESONANCIA NUCLEAR':'RM',
      // Radiografía
      'RX':'RX', 'RADIOGRAFIA':'RX', 'RADIOGRAFIAS':'RX', 'PLACA':'RX', 'PLACAS':'RX',
      // Ecografía
      'ECO':'ECO', 'ECOGRAFIA':'ECO', 'ECOGRAFIAS':'ECO',
      // Ecodoppler (separado de eco)
      'ECODOPPLER':'ECODOPPLER', 'ECO DOPPLER':'ECODOPPLER', 'DOPPLER':'ECODOPPLER',
      'ECODOPPLERS':'ECODOPPLER', 'ECOS DOPPLER':'ECODOPPLER'
    };
    const ABBR_STUDY_TYPES = ['TC','RM','RX','ECO','ECODOPPLER'];

    function stripAccents(s) {
      return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    }
    function normalizePrestacionFilter(raw) {
      const n = stripAccents(String(raw||'').toUpperCase().trim()).replace(/\s+/g,' ');
      return PRESTACION_SYNONYMS[n] || n;
    }
    function prestacionMatches(prRaw, needleRaw) {
      const pr = stripAccents(String(prRaw||'').toUpperCase().trim());
      const needle = normalizePrestacionFilter(needleRaw);
      if (!pr || !needle) return false;

      // Para abbrs conocidos (TC, RM, RX, ECO, ECODOPPLER) → match por palabra al inicio
      if (ABBR_STUDY_TYPES.includes(needle)) {
        // Exclusiones por regla de negocio:
        if (needle === 'TC' && pr.startsWith('RADIO')) return false;
        if (needle === 'ECO' && pr.startsWith('ECODOPPLER')) return false; // ECO no incluye ecodopplers
        // Match: exacto, seguido de espacio, o guión
        return pr === needle
            || pr.startsWith(needle + ' ')
            || pr.startsWith(needle + '-')
            || (needle === 'ECODOPPLER' && pr.startsWith('ECODOPPLER'));
      }
      // Cualquier otro término → includes libre
      return pr.includes(needle);
    }

    /* ===== FILTROS BÁSICOS ===== */
    function applyFilters(data, f) {
      f = f || {};
      return data.filter(r => {
        if (f.estado && String(r['Estado']||'').toUpperCase() !== f.estado) return false;
        if (f.operador && opOf(r) !== f.operador) return false;
        if (f.aseguradora && !stripAccents((r['Aseguradora']||'').toUpperCase()).includes(stripAccents(f.aseguradora.toUpperCase()))) return false;
        if (f.prestacion) {
          const pr = r['Prestación'] || r['Prestacion'] || '';
          if (!prestacionMatches(pr, f.prestacion)) return false;
        }
        if (f.mes_desde || f.mes_hasta) {
          const d = toDate(r['Turno Fecha']); if (!d) return false;
          const k = monthKey(d);
          if (f.mes_desde && k < f.mes_desde) return false;
          if (f.mes_hasta && k > f.mes_hasta) return false;
        }
        if (f.tipo_error && ERR_MAP[f.tipo_error] && !ERR_MAP[f.tipo_error].fn(r)) return false;
        return true;
      });
    }

    /* ===== EJECUTORES POR INTENT ===== */
    async function execCount(q) {
      let data = await getDataset();
      if (!data.length) return { text: '⚠️ No hay datos cargados. Cargá primero un Excel desde Inicio.' };
      // Si pregunta por estudios (metric conocida o prestación específica), asumir Estado=REA (estudios realizados)
      const preguntaSobreEstudios = q.metric === 'total_rea' || q.metric === 'con_informe' || q.metric === 'sin_informe' || !!q.filters.prestacion;
      if (!q.filters.estado && preguntaSobreEstudios) {
        q.filters.estado = 'REA';
      }
      const filtered = applyFilters(data, q.filters);
      let count, label = q.explanation || 'registros';
      if (q.filters.tipo_error) {
        count = filtered.length;
        label = ERR_MAP[q.filters.tipo_error].label + ' (errores)';
      } else if (q.metric === 'total_errores') {
        count = filtered.filter(r => r['Estado']==='REA' && esCualquierError(r)).length;
        label = 'errores totales';
      } else if (q.metric === 'sin_informe') {
        count = filtered.filter(r => r['Estado']==='REA' && !String(r['Informe']||'').trim()).length;
        label = 'estudios sin informe';
      } else if (q.metric === 'con_informe') {
        count = filtered.filter(r => r['Estado']==='REA' && String(r['Informe']||'').trim()).length;
        label = 'estudios con informe';
      } else {
        count = filtered.length;
      }
      const ctx = buildContextAggregates(data, q, count);
      const periodo = describePeriod(q.filters);
      let text = `<span class="cb-ai-chip">IA</span> ${label}: <b>${count.toLocaleString('es-AR')}</b>${periodo?' '+periodo:''}.`;
      if (ctx.shareText) text += `\n\n${ctx.shareText}`;
      if (ctx.trendText) text += `\n${ctx.trendText}`;
      return { text, aggregates: ctx.agg };
    }

    async function execList(q) {
      const data = await getDataset();
      if (!data.length) return { text: '⚠️ Sin datos cargados.' };
      const filtered = applyFilters(data, q.filters);
      const top = q.topN || 10;
      if (q.groupBy === 'operador') {
        const byOp = {};
        filtered.forEach(r => { const o = opOf(r); byOp[o] = (byOp[o]||0)+1; });
        const rows = Object.entries(byOp).sort((a,b)=>b[1]-a[1]).slice(0, top);
        return { text: `<span class="cb-ai-chip">IA</span> Ranking por operador:\n\n` + rows.map((r,i)=>`${i+1}. <b>${r[0]}</b>: ${r[1].toLocaleString('es-AR')}`).join('\n') };
      }
      if (q.groupBy === 'aseguradora') {
        const by = {};
        filtered.forEach(r => { const k = (r['Aseguradora']||'—').trim(); by[k] = (by[k]||0)+1; });
        const rows = Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0, top);
        return { text: `<span class="cb-ai-chip">IA</span> Top aseguradoras:\n\n` + rows.map((r,i)=>`${i+1}. <b>${r[0]}</b>: ${r[1].toLocaleString('es-AR')}`).join('\n') };
      }
      if (q.groupBy === 'prestacion') {
        const by = {};
        filtered.forEach(r => { const k = (r['Prestación']||r['Prestacion']||'—').trim(); by[k] = (by[k]||0)+1; });
        const rows = Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0, top);
        return { text: `<span class="cb-ai-chip">IA</span> Top prestaciones:\n\n` + rows.map((r,i)=>`${i+1}. <b>${r[0]}</b>: ${r[1].toLocaleString('es-AR')}`).join('\n') };
      }
      // Default: total
      return { text: `<span class="cb-ai-chip">IA</span> ${filtered.length.toLocaleString('es-AR')} registros${describePeriod(q.filters)?' '+describePeriod(q.filters):''}.` };
    }

    async function execTrend(q) {
      const data = await getDataset();
      if (!data.length) return { text: '⚠️ Sin datos cargados.' };
      const base = applyFilters(data, q.filters);
      const byMonth = {};
      base.forEach(r => {
        if (q.metric === 'total_errores' && !(r['Estado']==='REA' && esCualquierError(r))) return;
        if (q.filters.tipo_error && ERR_MAP[q.filters.tipo_error] && !ERR_MAP[q.filters.tipo_error].fn(r)) return;
        const d = toDate(r['Turno Fecha']); if (!d) return;
        const k = monthKey(d);
        byMonth[k] = (byMonth[k]||0)+1;
      });
      const keys = Object.keys(byMonth).sort();
      if (!keys.length) return { text: '<span class="cb-ai-chip">IA</span> No hay datos en el rango elegido.' };
      let out = `<span class="cb-ai-chip">IA</span> Evolución mensual${q.filters.operador?' de '+q.filters.operador:''}:\n\n`;
      out += keys.map(k => `• <b>${monthLabel(k)}</b>: ${byMonth[k].toLocaleString('es-AR')}`).join('\n');
      const first = byMonth[keys[0]], last = byMonth[keys[keys.length-1]];
      if (keys.length > 1) {
        const diff = last - first;
        const pct = first ? ((diff/first)*100).toFixed(1) : 0;
        const arr = diff<0?'▼':diff>0?'▲':'·';
        out += `\n\n<b>Tendencia:</b> ${arr} ${diff>=0?'+':''}${diff} (${diff>=0?'+':''}${pct}%) de ${monthLabel(keys[0])} a ${monthLabel(keys[keys.length-1])}.`;
      }
      return { text: out, aggregates: { byMonth, keys, first, last } };
    }

    async function execCompare(q) {
      return execTrend(q); // para MVP, equivalente. Se puede refinar.
    }

    async function execRank(q) {
      q.groupBy = q.groupBy || 'operador';
      return execList(q);
    }

    async function execAnalyze(q) {
      const data = await getDataset();
      if (!data.length) return { text: '⚠️ Sin datos cargados.' };
      const base = data.filter(r => r['Estado']==='REA');
      const ops = VALID_OPS;
      const analisis = ops.map(op => {
        const rows = base.filter(r => opOf(r) === op);
        const errs = rows.filter(esCualquierError).length;
        // tendencia simple: split en dos mitades por fecha
        const fechas = rows.map(r => toDate(r['Turno Fecha'])).filter(Boolean).sort((a,b)=>a-b);
        if (!fechas.length) return { op, errs, tendencia: 0 };
        const midDate = fechas[Math.floor(fechas.length/2)];
        const primMitad = rows.filter(r => { const d = toDate(r['Turno Fecha']); return d && d < midDate && esCualquierError(r); }).length;
        const segMitad  = rows.filter(r => { const d = toDate(r['Turno Fecha']); return d && d >= midDate && esCualquierError(r); }).length;
        const tendencia = primMitad ? ((segMitad - primMitad)/primMitad)*100 : 0;
        return { op, errs, tendencia: +tendencia.toFixed(1) };
      }).filter(a => a.errs > 0).sort((a,b) => b.tendencia - a.tendencia);

      let out = `<span class="cb-ai-chip">IA</span> <b>Análisis operativo:</b>\n\n`;
      const peor = analisis[0];
      const mejor = analisis[analisis.length-1];
      if (peor && peor.tendencia > 10) {
        out += `⚠️ <b>${peor.op}</b> necesita atención: tendencia ${peor.tendencia>=0?'+':''}${peor.tendencia}% (empeoramiento).\n`;
      }
      if (mejor && mejor.tendencia < -10) {
        out += `✅ <b>${mejor.op}</b> muestra mejora sostenida: ${mejor.tendencia}%.\n`;
      }
      out += '\n<b>Detalle:</b>\n';
      out += analisis.map(a => `• ${a.op}: ${a.errs} errores (tendencia: ${a.tendencia>=0?'+':''}${a.tendencia}%)`).join('\n');
      return { text: out };
    }

    async function execSearch(q) {
      const data = await getDataset();
      if (!data.length) return { text: '⚠️ Sin datos cargados.' };
      const term = (q.searchTerm || '').trim();
      if (!term) return { text: 'No entendí qué buscar. Probá: "buscame el turno de [nombre]" o "turnos del DNI 12345678".' };
      const tNorm = term.toUpperCase();
      const matches = data.filter(r => {
        const hay = `${r['Paciente']||''} ${r['Documento']||''} ${r['Nº Afiliado']||''}`.toUpperCase();
        return hay.includes(tNorm);
      }).slice(0, 20);
      if (!matches.length) return { text: `<span class="cb-ai-chip">IA</span> No encontré turnos que coincidan con "${term}".` };
      let out = `<span class="cb-ai-chip">IA</span> Encontré ${matches.length} turno${matches.length>1?'s':''} (máx. 20):\n\n`;
      out += matches.map((r,i) => {
        const f = toDate(r['Turno Fecha']);
        const fstr = f ? f.toLocaleDateString('es-AR') : '—';
        return `${i+1}. <b>${r['Paciente']||'—'}</b> — ${fstr} — ${r['Prestación']||r['Prestacion']||'—'} (${r['Estado']||'—'})`;
      }).join('\n');
      return { text: out };
    }

    async function execReport(q) {
      // Dispara exportExcel existente de admin con filtros AI
      try {
        // Si admin.html expone exportExcelByOperador, usarlo
        if (q.filters.operador && typeof window.exportExcelByOperador === 'function') {
          await window.exportExcelByOperador(q.filters.operador);
          return { text: `<span class="cb-ai-chip">IA</span> Generando Excel del operador <b>${q.filters.operador}</b> con el formato corporativo...` };
        }
        if (typeof window.exportExcel === 'function') {
          await window.exportExcel();
          return { text: `<span class="cb-ai-chip">IA</span> Generando Excel con el formato corporativo...` };
        }
      } catch(e) {}
      return { text: `<span class="cb-ai-chip">IA</span> Para generar el informe, abrí el detalle del KPI correspondiente y usá "Exportar Excel". (Integración directa con AI pendiente en este contexto.)` };
    }

    async function execChart(q) {
      const id = q.filters.operador
        ? 'chart-operadores-section'
        : (q.metric === 'total_errores' ? 'chart-comparativo-section' : 'chart-operadores-section');
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return { text: `<span class="cb-ai-chip">IA</span> Mostrando el gráfico correspondiente 👇` };
      }
      return { text: `<span class="cb-ai-chip">IA</span> No encontré ese gráfico en esta vista.` };
    }

    /* ===== CONTEXT AGGREGATES (para Fase 2) ===== */
    function buildContextAggregates(data, q, currentCount) {
      const agg = { count: currentCount };
      let shareText = '', trendText = '';
      if (q.filters.operador) {
        const total = applyFilters(data, { ...q.filters, operador:null }).length || 1;
        const share = ((currentCount/total)*100).toFixed(1);
        agg.totalEquipo = total;
        agg.sharePct = +share;
        shareText = `📊 Representa el <b>${share}%</b> del total del equipo (${total.toLocaleString('es-AR')}).`;
      }
      return { agg, shareText, trendText };
    }

    function describePeriod(f) {
      if (!f) return '';
      if (f.mes_desde && f.mes_hasta && f.mes_desde === f.mes_hasta) return 'en ' + monthLabel(f.mes_desde);
      if (f.mes_desde && f.mes_hasta) return `entre ${monthLabel(f.mes_desde)} y ${monthLabel(f.mes_hasta)}`;
      if (f.mes_desde) return 'desde ' + monthLabel(f.mes_desde);
      if (f.mes_hasta) return 'hasta ' + monthLabel(f.mes_hasta);
      return '';
    }

    /* ===== FASE 2: ENRIQUECER PROSA ===== */
    async function enrichResponse(userQuery, templateAnswer, aggregates) {
      if (!aggregates) return templateAnswer;
      const prompt = `Pregunta del usuario: "${userQuery}"
Datos agregados (anónimos): ${JSON.stringify(aggregates)}
Respuesta base generada por el sistema: "${templateAnswer.replace(/<[^>]+>/g,'')}"

Reescribí la respuesta de forma natural y profesional en español, manteniendo los números exactos. NO inventes datos. Máximo 3 frases. Sin HTML.`;
      try {
        const richer = await callGemini(prompt, 'Sos un analista administrativo del Hospital Italiano. Respondé en español natural, breve, profesional. Respetá los números que te paso.');
        return `<span class="cb-ai-chip">IA ✨</span> ${richer.trim()}`;
      } catch {
        return templateAnswer;
      }
    }

    /* ===== ENTRY POINT ===== */
    async function process(userText, opts) {
      opts = opts || {};
      if (!hasKey()) throw new Error('NO_API_KEY');
      const q = await translateQuery(userText);
      if (q.intent === 'unknown') return null; // caer a keyword engine

      let result;
      switch (q.intent) {
        case 'count':   result = await execCount(q); break;
        case 'list':    result = await execList(q); break;
        case 'search':  result = await execSearch(q); break;
        case 'compare': result = await execCompare(q); break;
        case 'trend':   result = await execTrend(q); break;
        case 'rank':    result = await execRank(q); break;
        case 'analyze': result = await execAnalyze(q); break;
        case 'report':  result = await execReport(q); break;
        case 'chart':   result = await execChart(q); break;
        case 'faq':     return null; // dejar al motor FAQ
        default:        return null;
      }
      if (!result) return null;

      // Fase 2: enriquecer solo si usuario optó
      if (opts.enrich && result.aggregates) {
        result.text = await enrichResponse(userText, result.text, result.aggregates);
      }
      return result;
    }

    return {
      hasKey, getKey, setKey, clearKey, maskKey,
      process, translateQuery,
      getAudit, clearAudit,
      SCHEMA_DESC
    };
  })();

  /* ═══ UI WIRING DEL MÓDULO AI (config disponible en toda la app; procesamiento IA solo en admin) ═══ */
  (function wireAIUI() {
    const cfgBtn    = document.getElementById('spcd-cb-ai-cfg');
    const auditBtn  = document.getElementById('spcd-cb-ai-audit');
    const enrichEl  = document.getElementById('spcd-cb-ai-enrich');
    const enrichChk = document.getElementById('spcd-cb-ai-enrich-chk');
    const cfgOverlay   = document.getElementById('spcd-cb-ai-cfg-overlay');
    const auditOverlay = document.getElementById('spcd-cb-ai-audit-overlay');
    const keyInput  = document.getElementById('spcd-cb-ai-key-input');
    if (!cfgBtn) return;

    // Config + auditoría visibles en todas las páginas (para que el usuario pueda gestionar la key desde cualquier lado).
    cfgBtn.style.display = 'flex';
    auditBtn.style.display = 'flex';
    // Toggle de enriquecimiento solo tiene sentido donde la IA procesa (admin).
    if (PAGE === 'admin.html') enrichEl.style.display = 'flex';
    refreshCfgBtn();

    function refreshCfgBtn() {
      const hasK = AI.hasKey();
      const isAdmin = PAGE === 'admin.html';
      if (hasK) { cfgBtn.classList.add('ai-on'); }
      else { cfgBtn.classList.remove('ai-on'); }
      // Actualizar subtítulo del chatbot según estado
      const subEl = document.querySelector('.cb-status');
      if (subEl) {
        if (!isAdmin) subEl.textContent = 'En línea · IA solo en Admin';
        else if (hasK) subEl.textContent = 'En línea · IA lista ✨';
        else subEl.textContent = 'En línea · IA no configurada';
      }
      cfgBtn.title = hasK ? ('IA activada — ' + AI.maskKey(AI.getKey())) : 'Configurar IA (desactivada)';
    }

    cfgBtn.addEventListener('click', () => {
      keyInput.value = AI.getKey();
      cfgOverlay.classList.add('open');
    });
    document.getElementById('spcd-cb-ai-cfg-cancel').addEventListener('click', () => cfgOverlay.classList.remove('open'));
    document.getElementById('spcd-cb-ai-key-save').addEventListener('click', () => {
      const k = (keyInput.value||'').trim();
      AI.setKey(k);
      cfgOverlay.classList.remove('open');
      refreshCfgBtn();
    });
    document.getElementById('spcd-cb-ai-key-clear').addEventListener('click', () => {
      if (confirm('¿Borrar la API key?')) { AI.clearKey(); keyInput.value=''; refreshCfgBtn(); }
    });

    auditBtn.addEventListener('click', () => {
      const list = AI.getAudit();
      const html = list.length ? list.map(e => {
        const d = new Date(e.ts).toLocaleString('es-AR');
        const statusHtml = e.ok ? `<span class="cb-audit-ok">✓ ${e.intent || 'ok'}</span>`
                                : `<span class="cb-audit-err">✗ ${e.error || 'error'}</span>`;
        const blockedHtml = (e.blocked && e.blocked.length)
          ? `<div style="color:#fbbf24; font-size:10px; margin-top:4px;">🛡 ${e.blocked.map(b=>`${b.pattern}×${b.count}`).join(', ')} redactados</div>`
          : '';
        return `<div class="cb-audit-row">
          <div class="cb-audit-ts">${d} — ${statusHtml}</div>
          <div class="cb-audit-q"><b>Pregunta:</b> ${(e.userText||'').slice(0,200)}</div>
          <div class="cb-audit-sent"><b>Enviado:</b> ${(e.sentText||'').slice(0,300)}</div>
          ${blockedHtml}
        </div>`;
      }).join('') : '<div style="color:#64748B; padding:20px; text-align:center;">Sin registros todavía.</div>';
      document.getElementById('spcd-cb-ai-audit-list').innerHTML = html;
      auditOverlay.classList.add('open');
    });
    document.getElementById('spcd-cb-ai-audit-close').addEventListener('click', () => auditOverlay.classList.remove('open'));
    document.getElementById('spcd-cb-ai-audit-clear').addEventListener('click', () => {
      if (confirm('¿Limpiar historial de auditoría?')) { AI.clearAudit(); auditOverlay.classList.remove('open'); }
    });

    enrichChk.addEventListener('change', () => {
      enrichEl.classList.toggle('on', enrichChk.checked);
    });

    // Cerrar con Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        cfgOverlay.classList.remove('open');
        auditOverlay.classList.remove('open');
      }
    });

    // Exponer para consulta desde handleQuery
    window.__SPCD_AI = AI;
    window.__SPCD_AI_SHOULD_ENRICH = () => !!enrichChk.checked;
  })();

  /* ============================================================
     HANDLER PRINCIPAL v2
     ============================================================ */
  // Store last response for download
  let _lastResult = null;

  async function handleQuery(text) {
    const q = parseQuery(text);
    if (q.empty) return { text: `Escribí una pregunta 🙂`, exportable: false };

    // ═══ AI-FIRST (solo admin, si hay API key y no es un saludo/FAQ obvio) ═══
    // Log de skip: si alguna condición falla, queda registrado en el audit para diagnóstico
    function logSkip(reason) {
      try {
        const KEY = 'spcd_ai_audit_log';
        const list = JSON.parse(localStorage.getItem(KEY) || '[]');
        list.unshift({ ts: Date.now(), userText: text, sentText: '—', blocked: [], ok:false, response:null, intent:null, error:'[SKIP] ' + reason });
        while (list.length > 30) list.pop();
        localStorage.setItem(KEY, JSON.stringify(list));
      } catch(e) {}
    }

    if (PAGE !== 'admin.html') {
      logSkip('Módulo no es admin (PAGE=' + PAGE + ')');
    } else if (!window.__SPCD_AI) {
      logSkip('Módulo AI no inicializado (window.__SPCD_AI undefined — probable caché JS vieja)');
    } else if (!window.__SPCD_AI.hasKey()) {
      logSkip('Sin API key guardada (configurá en ⚙️)');
    } else if (q.faq) {
      logSkip('Detectado como FAQ (ej: hola/ayuda/gracias) → no se usa IA para ahorrar tokens');
    } else {
      try {
        const enrich = window.__SPCD_AI_SHOULD_ENRICH && window.__SPCD_AI_SHOULD_ENRICH();
        const aiResp = await window.__SPCD_AI.process(text, { enrich });
        if (aiResp && aiResp.text) {
          return { text: aiResp.text, exportable: false };
        }
        // Si process devuelve null (intent unknown), cae al motor keywords abajo
      } catch (e) {
        // Errores no-fatales → caer a fallback silenciosamente
        if (e && e.message === 'BAD_API_KEY') {
          return { text: '⚠️ La API key de Gemini es inválida. Configurala de nuevo en ⚙️ (arriba del chat).', exportable:false };
        }
        if (e && e.message === 'RATE_LIMIT') {
          return { text: '⏳ Llegaste al límite del free tier de Gemini por este minuto. Probá en unos segundos o seguí usando el motor básico.', exportable:false };
        }
        // timeout, network, parse → fall-through al motor clásico
      }
    }

    const tNorm = normalize(text);
    const wantsExport = isExportIntent(tNorm);

    // Check permissions for admin-only metrics
    const user = getCurrentUser();
    const adminMetrics = ['err_derivantes','err_coseguros','err_instderiv','err_tramites','err_referencia','err_cobertura','total_errores'];
    if (q.metric && adminMetrics.includes(q.metric)) {
      if (user.rol && user.rol !== 'admin' && user.rol !== 'mixto' && user.rol !== 'consultor') {
        return { text: `⚠️ No tenés permisos para ver métricas de errores administrativos.\nTu rol actual: <strong>${user.rol}</strong>.`, exportable: false };
      }
    }

    // EXPORT INTENT
    if (wantsExport) {
      // Dynamic search export
      if (q.dynSearch && !q.metric) {
        const dynResult = await respondDynamic(q.dynSearch, q.period, q.filters);
        if (dynResult.dynRows && dynResult.dynRows.length > 0) {
          const exportMsg = await exportDynamic(dynResult.dynRows, q.dynSearch, q.period);
          return { text: exportMsg, exportable: false };
        }
        return { text: dynResult.text, exportable: false };
      }
      if (q.metric) {
        const msg = await exportMetric(q.metric, q.period, q.filters);
        return { text: msg, exportable: false };
      }
      if (q.period) {
        const msg = await exportMetric('total_rea', q.period, q.filters);
        return { text: msg, exportable: false };
      }
      return { text: `¿Qué datos querés exportar? Probá con:\n• <em>"dame el excel de sin informe"</em>\n• <em>"exportá resonancias en abril"</em>\n• <em>"bajame errores de coseguros"</em>`, exportable: false };
    }

    // METRIC
    if (q.metric) {
      const resp = await respondMetric(q.metric, q.period, q.filters);
      if (resp) return resp;
    }

    // DYNAMIC SEARCH (e.g., "cuántas resonancias en abril")
    if (q.dynSearch) {
      const resp = await respondDynamic(q.dynSearch, q.period, q.filters);
      if (resp) return resp;
    }

    // PERIOD-only → total studies
    if (q.period && !q.metric && !q.dynSearch) {
      const resp = await respondMetric('total_rea', q.period, q.filters);
      if (resp) return resp;
    }

    // FAQ
    if (q.faq) {
      const resp = respondFAQ(q.faq);
      if (resp) return { text: resp, exportable: false };
    }

    // FALLBACK — suggest based on what they typed
    return { text: `No estoy seguro de haberte entendido 🤔\nProbá con algo como:\n• "cuántas resonancias en abril"\n• "sin informe este mes"\n• "errores de SPITRELLA"\n• "dame el excel de sin informe"\n• "ayuda"`, exportable: false };
  }

  /* ============================================================
     CHIPS CONTEXTUALES — basados en permisos
     ============================================================ */
  function buildQuickChips() {
    const user = getCurrentUser();
    const isAdmin = !user.rol || user.rol === 'admin' || user.rol === 'mixto' || user.rol === 'consultor';

    let chips = [];
    if (PAGE === 'index.html' || PAGE === '') {
      chips = [
        { label: 'Ayuda', q: 'ayuda' },
        { label: 'Total estudios', q: 'cuantos estudios' },
        { label: 'Sin informe este mes', q: 'sin informe este mes' },
        { label: '📥 Excel sin informe', q: 'dame el excel de sin informe' },
      ];
      if (isAdmin) chips.push({ label: 'Errores admin', q: 'total errores este mes' });
    } else if (PAGE === 'medico.html') {
      chips = [
        { label: 'Sin informe', q: 'cuantos sin informe' },
        { label: 'Esta semana', q: 'sin informe esta semana' },
        { label: 'Top médicos', q: 'top medicos' },
        { label: 'Top pendientes', q: 'top pendientes' },
        { label: '📥 Excel pendientes', q: 'dame el excel de pendientes' },
      ];
    } else if (PAGE === 'tecnico.html') {
      chips = [
        { label: 'Top equipos', q: 'top equipos' },
        { label: 'Prom. diario', q: 'promedio diario' },
        { label: 'Estudios hoy', q: 'cuantos estudios hoy' },
        { label: 'Resonancias este mes', q: 'resonancias este mes' },
        { label: '📥 Excel top equipos', q: 'dame el excel de top equipos' },
      ];
    } else if (PAGE === 'admin.html') {
      chips = [
        { label: 'Err. derivantes', q: 'derivantes con error' },
        { label: 'Trám. incompletos', q: 'tramites incompletos' },
        { label: 'Err. coseguros', q: 'coseguros con error' },
        { label: 'Total errores', q: 'total errores este mes' },
        { label: '📥 Excel derivantes', q: 'dame el excel de errores de derivantes' },
      ];
    } else if (PAGE === 'operativo.html') {
      chips = [
        { label: '¿Qué es este módulo?', q: 'modulo operativo' },
        { label: 'Ayuda', q: 'ayuda' },
      ];
    }
    quickEl.innerHTML = '';
    chips.forEach(c => {
      const b = document.createElement('button');
      b.className = 'cb-chip';
      b.textContent = c.label;
      b.onclick = () => { inputEl.value = c.q; send(); };
      quickEl.appendChild(b);
    });
  }

  /* ============================================================
     UI
     ============================================================ */
  function addMsg(role, htmlContent) {
    const m = document.createElement('div');
    m.className = 'cb-msg ' + role;
    m.innerHTML = `
      <div class="cb-msg-avatar">${role === 'bot' ? 'SP' : 'Yo'}</div>
      <div class="cb-msg-bubble">${htmlContent}</div>
    `;
    msgsEl.appendChild(m);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function addMsgWithDownload(htmlContent, downloadFn) {
    const m = document.createElement('div');
    m.className = 'cb-msg bot';
    const dlBtnHtml = `<button class="cb-dl-btn" id="cb-dl-${Date.now()}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Descargar Excel
    </button>`;
    m.innerHTML = `
      <div class="cb-msg-avatar">SP</div>
      <div class="cb-msg-bubble">${htmlContent}\n${dlBtnHtml}</div>
    `;
    msgsEl.appendChild(m);
    msgsEl.scrollTop = msgsEl.scrollHeight;

    // Attach click handler
    const dlBtn = m.querySelector('.cb-dl-btn');
    if (dlBtn && downloadFn) {
      dlBtn.addEventListener('click', async () => {
        dlBtn.disabled = true;
        dlBtn.innerHTML = '<em>Generando...</em>';
        try {
          await downloadFn();
          dlBtn.innerHTML = '✓ Descargado';
          dlBtn.style.borderColor = '#55e78B';
          dlBtn.style.color = '#55e78B';
        } catch(e) {
          dlBtn.innerHTML = '❌ Error';
          console.error(e);
        }
      });
    }
  }

  function addTyping() {
    const m = document.createElement('div');
    m.className = 'cb-msg bot';
    m.id = 'spcd-cb-typing';
    m.innerHTML = `
      <div class="cb-msg-avatar">SP</div>
      <div class="cb-msg-bubble"><span class="cb-typing"><span></span><span></span><span></span></span></div>
    `;
    msgsEl.appendChild(m);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function removeTyping() {
    const t = document.getElementById('spcd-cb-typing');
    if (t) t.remove();
  }

  function toggle(force) {
    const open = typeof force === 'boolean' ? force : !win.classList.contains('open');
    win.classList.toggle('open', open);
    btn.classList.remove('has-unread');
    if (open) {
      setTimeout(() => inputEl.focus(), 100);
      if (!msgsEl.children.length) greet();
    }
  }

  function greet() {
    const pageNames = {
      'index.html': 'la pantalla de inicio',
      '': 'la pantalla de inicio',
      'medico.html': 'el Módulo Médico',
      'tecnico.html': 'el Módulo Técnico',
      'admin.html': 'el Módulo Administrativo',
      'operativo.html': 'el Módulo Operativo',
    };
    const where = pageNames[PAGE] || 'Lumen';
    const user = getCurrentUser();
    const greeting = user.username ? `¡Hola <strong>${user.username}</strong>! 👋` : '¡Hola! 👋';

    addMsg('bot', `${greeting} Soy el asistente inteligente de Lumen. Estás en <strong>${where}</strong>.\n\nPreguntame lo que quieras:\n• "cuántas resonancias en abril"\n• "sin informe de SPITRELLA esta semana"\n• "top equipos este mes"\n\n📥 <strong>Exporto a Excel al instante</strong>\n<em>"dame el excel de sin informe este mes"</em>\n\n🧠 <strong>Aprendo de tus consultas</strong>\n<em>Las preguntas frecuentes aparecen como sugerencias.</em>`);
  }

  async function send() {
    const text = inputEl.value.trim();
    if (!text) return;
    addMsg('user', escapeHtml(text));
    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;
    addTyping();

    // Record query for learning
    recordQuery(text);

    setTimeout(async () => {
      try {
        const result = await handleQuery(text);
        removeTyping();

        if (result.exportable) {
          // Show message with download button
          const downloadFn = async () => {
            if (result.dynRows) {
              await exportDynamic(result.dynRows, result.searchTerm, result.periodId);
            } else if (result.metricId) {
              await exportMetric(result.metricId, result.periodId, result.filters || {});
            }
          };
          addMsgWithDownload(result.text, downloadFn);
        } else {
          addMsg('bot', result.text || result);
        }
      } catch(err) {
        removeTyping();
        addMsg('bot', '❌ Ups, algo salió mal procesando tu pregunta. Probá reformulándola.');
        console.error('[SPCD-CB] error:', err);
      }
      sendBtn.disabled = false;
    }, 380);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
    }[c]));
  }

  /* ============================================================
     EVENTOS
     ============================================================ */
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
  });
  btn.addEventListener('click', () => toggle());
  closeBtn.addEventListener('click', () => toggle(false));
  sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && win.classList.contains('open')) toggle(false);
  });

  /* ============================================================
     INIT
     ============================================================ */
  buildQuickChips();
  updateSuggestions();

  /* ============================================================
     SESSION GATE — muestra/oculta el botón según haya sesión activa
     ============================================================ */
  function updateBtnVisibility() {
    const ok = hasActiveSession();
    btn.classList.toggle('visible', ok);
    // Si la sesión caducó con el chat abierto, cerrarlo
    if (!ok && win.classList.contains('open')) toggle(false);
  }
  updateBtnVisibility();
  // Poll cada 2s para detectar login/logout en la misma pestaña
  setInterval(updateBtnVisibility, 2000);
  // Reacción inmediata a cambios de localStorage en otras pestañas
  window.addEventListener('storage', e => {
    if (e.key === 'spcd_session' || e.key === null) updateBtnVisibility();
  });
})();
