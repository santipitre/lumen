/* ============================================================
   Lumen CHATBOT v2 — Asistente Inteligente
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
    /* Lanzador: cerebro neuronal flotante + globo de diálogo (2026-11-10) */
    #spcd-cb-btn {
      position: fixed; bottom: 22px; right: 22px; z-index: 9998;
      width: 64px; height: 64px; padding: 0; border: none; background: transparent; cursor: pointer;
      display: none; color: #0F172A;
      animation: cbFloat 4.2s ease-in-out infinite;
    }
    #spcd-cb-btn.visible { display: block; }
    #spcd-cb-btn .cb-orb {
      position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: #04080C;
      border: 1px solid rgba(45,212,191,.38);
      box-shadow: 0 0 0 3px rgba(45,212,191,.06), 0 14px 32px rgba(0,0,0,.55), inset 0 0 18px rgba(45,212,191,.10);
      transition: border-color .2s, box-shadow .2s;
    }
    #spcd-cb-btn .cb-orb video { width: 100%; height: 100%; object-fit: cover; display: block; transform: scale(1.06); }
    #spcd-cb-btn:hover .cb-orb { border-color: rgba(94,234,212,.75); box-shadow: 0 0 0 4px rgba(45,212,191,.12), 0 16px 36px rgba(0,0,0,.6), inset 0 0 22px rgba(45,212,191,.16); }
    #spcd-cb-btn:focus-visible { outline: 2px solid #5EEAD4; outline-offset: 4px; border-radius: 50%; }
    #spcd-cb-btn::before {
      content: ""; position: absolute; inset: -6px; border-radius: 50%; border: 1px solid rgba(45,212,191,.4);
      animation: cbPulse 3.2s ease-out infinite; pointer-events: none;
    }
    #spcd-cb-btn::after {
      content: ""; position: absolute; left: 50%; bottom: -14px; width: 46px; height: 9px; margin-left: -23px; border-radius: 50%;
      background: radial-gradient(ellipse, rgba(45,212,191,.28), rgba(0,0,0,0) 70%); animation: cbShadow 4.2s ease-in-out infinite; pointer-events: none;
    }
    #spcd-cb-btn .cb-chip {
      position: absolute; left: -10px; top: -8px; height: 22px; padding: 0 7px; border-radius: 11px 11px 11px 3px;
      display: flex; align-items: center; gap: 3px; background: rgba(8,18,26,.95); border: 1px solid rgba(45,212,191,.45);
      box-shadow: 0 4px 12px rgba(0,0,0,.45); transition: opacity .3s;
    }
    #spcd-cb-btn .cb-chip i, #spcd-cb-hint .cb-hint-dots i { width: 4px; height: 4px; border-radius: 50%; background: #5EEAD4; display: block; animation: cbDot 1.2s ease-in-out infinite; }
    #spcd-cb-btn .cb-chip i:nth-child(2), #spcd-cb-hint .cb-hint-dots i:nth-child(2) { animation-delay: .15s; }
    #spcd-cb-btn .cb-chip i:nth-child(3), #spcd-cb-hint .cb-hint-dots i:nth-child(3) { animation-delay: .3s; }
    #spcd-cb-btn.hint-on .cb-chip, #spcd-cb-btn.win-open .cb-chip { opacity: 0; }
    #spcd-cb-btn .cb-dot {
      position: absolute; top: 2px; right: 2px; z-index: 2;
      width: 12px; height: 12px; border-radius: 50%;
      background: #EF4444; border: 2px solid #0F172A;
      display: none;
    }
    #spcd-cb-btn.has-unread .cb-dot { display: block; }
    #spcd-cb-hint {
      position: fixed; right: 100px; bottom: 34px; z-index: 9998; width: 236px; padding: 12px 14px;
      border-radius: 14px 14px 4px 14px; cursor: pointer; display: none;
      background: linear-gradient(180deg, rgba(12,26,36,.96), rgba(7,15,22,.96)); border: 1px solid rgba(45,212,191,.38);
      box-shadow: 0 16px 40px rgba(0,0,0,.5); color: #E2E8F0; font-family: 'Inter', system-ui, sans-serif;
      transform-origin: 100% 100%;
    }
    #spcd-cb-hint.show { display: block; animation: cbHintIn .45s cubic-bezier(.2,.8,.2,1) both; }
    #spcd-cb-hint.hide { display: block; animation: cbHintOut .3s ease-in both; }
    #spcd-cb-hint::after { content: ""; position: absolute; right: -6px; bottom: 14px; width: 10px; height: 10px; transform: rotate(45deg);
      background: #08121A; border-right: 1px solid rgba(45,212,191,.38); border-top: 1px solid rgba(45,212,191,.38); }
    #spcd-cb-hint .cb-hint-head { display: flex; align-items: center; gap: 8px; font: 600 10.5px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: .16em; color: #5EEAD4; text-transform: uppercase; }
    #spcd-cb-hint .cb-hint-head b { width: 7px; height: 7px; border-radius: 50%; background: #2DD4BF; box-shadow: 0 0 8px #2DD4BF; }
    #spcd-cb-hint .cb-hint-text { margin-top: 7px; font-size: 14px; line-height: 1.4; min-height: 20px; color: #F1F5F9; }
    #spcd-cb-hint .cb-hint-text .cur { display: inline-block; width: 2px; height: 15px; margin-left: 2px; vertical-align: -2px; background: #F59E0B; animation: cbBlink 1s steps(2) infinite; }
    #spcd-cb-hint .cb-hint-dots { display: flex; gap: 4px; margin-top: 9px; height: 6px; }
    #spcd-cb-hint .cb-hint-dots i { width: 6px; height: 6px; }
    #spcd-cb-hint .cb-hint-cta { margin-top: 8px; font-size: 12px; color: #94A3B8; }
    #spcd-cb-hint .cb-hint-cta span { color: #FBBF24; }
    @keyframes cbFloat { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-7px) rotate(1deg); } }
    @keyframes cbShadow { 0%,100% { transform: translateY(0) scale(1); opacity: .65; } 50% { transform: translateY(7px) scale(.75); opacity: .35; } }
    @keyframes cbPulse { 0% { transform: scale(1); opacity: .6; } 100% { transform: scale(1.35); opacity: 0; } }
    @keyframes cbDot { 0%,100% { opacity: .35; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
    @keyframes cbHintIn { from { opacity: 0; transform: translate(14px,6px) scale(.92); } to { opacity: 1; transform: none; } }
    @keyframes cbHintOut { to { opacity: 0; transform: translate(8px,4px) scale(.92); } }
    @keyframes cbBlink { to { visibility: hidden; } }
    @media (prefers-reduced-motion: reduce) { #spcd-cb-btn, #spcd-cb-btn::before, #spcd-cb-btn::after { animation: none; } }

    #spcd-cb-win {
      position: fixed; bottom: 100px; right: 20px; z-index: 9999;
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
    .cb-kb-acc { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; white-space:normal; }
    .cb-kb-acc .cb-chip { text-decoration:none; }
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
      #spcd-cb-btn { bottom: 16px; right: 16px; width: 58px; height: 58px; }
      #spcd-cb-hint { right: 86px; bottom: 26px; width: 200px; }
      #spcd-cb-hint .cb-hint-text { font-size: 13px; }
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
    <button id="spcd-cb-btn" title="Asistente Lumen" aria-label="Abrir asistente Lumen">
      <span class="cb-orb"><video src="lumen-cerebro.mp4?v=20261110" poster="lumen-cerebro.jpg?v=20261110" muted loop autoplay playsinline aria-hidden="true"></video></span>
      <span class="cb-chip" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="cb-dot"></span>
    </button>
    <div id="spcd-cb-hint" aria-hidden="true">
      <div class="cb-hint-head"><b></b>Asistente Lumen</div>
      <div class="cb-hint-text"></div>
      <div class="cb-hint-dots"><i></i><i></i><i></i></div>
      <div class="cb-hint-cta">Escribime una consulta <span>&rarr;</span></div>
    </div>
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
          <button class="cb-close" id="spcd-cb-close" aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="cb-messages" id="spcd-cb-msgs"></div>
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

  /* Servicio -> grupo del Semáforo (mismos 6 que medico.js). Servicio vacío = «Sin servicio»; uno no reconocido = OTROS. No usa nombres de médico. */
  const SERVICIO_GRUPOS = {
    'RAYOS X': 'RAYOS X', 'ECOGRAFIA': 'ECOGRAFÍA / DOPPLER', 'ECOGRAFIA DOPPLER': 'ECOGRAFÍA / DOPPLER',
    'TOMOGRAFIA': 'TOMOGRAFÍA', 'RESONANCIA MAGNETICA': 'RESONANCIA MAGNÉTICA', 'CAMARA GAMMA': 'CÁMARA GAMMA'
  };
  function servicioDe(r) {
    const s = String((r && r['Servicio']) || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (!s) return 'Sin servicio';
    return Object.prototype.hasOwnProperty.call(SERVICIO_GRUPOS, s) ? SERVICIO_GRUPOS[s] : 'OTROS';
  }

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
  /* Fase 8 (N-A1 fuera de medico.html): mismo criterio que puedeVerRankingMedicos() y recortarSinPermiso() de medico.js.
     Sólo ven los nombres de médico (Médico Informante / Informante Sugerido) quienes tienen el módulo médico en 'edit' o 'admin'.
     Falla cerrado: sin sesión, sesión vencida (8 h), solicitante forzado, sin permiso del módulo o con un valor desconocido = sin nombres. Guard de cliente: disuasivo, no una garantía. */
  const SPCD_COLUMNAS_CON_PERMISO_MEDICO = ['Médico Informante', 'Informante Sugerido'];
  const SPCD_AVISO_SIN_PERMISO_MEDICOS = '🔒 El ranking por médico requiere permiso de edición del módulo Médico.';
  function spcdPuedeVerNombresMedicos() {
    try {
      const DEFAULTS = { admin:{admin:'edit',tecnico:'edit',medico:'edit',operativo:'admin'}, consultor:{admin:'view',tecnico:'view',medico:'view',operativo:'view'}, mixto:{medico:'edit',operativo:'admin'}, solicitante:{operativo:'pedidos'} };
      const s = JSON.parse(localStorage.getItem('spcd_session'));
      if (!s || !s.ts || Date.now() - s.ts >= 8*60*60*1000) return false;
      if (s.user.rol === 'solicitante') return false;
      const pm = (s.user.permisos && s.user.permisos.modulos) ? s.user.permisos.modulos : (DEFAULTS[s.user.rol] || {});
      return pm.medico === 'edit' || pm.medico === 'admin';
    } catch (e) { return false; }
  }
  /* Devuelve copias sin las dos columnas (no toca spcd_data_full ni las filas de origen); con permiso devuelve las mismas filas. */
  function spcdRecortarNombresMedicos(rows) {
    if (!Array.isArray(rows) || spcdPuedeVerNombresMedicos()) return rows;
    return rows.map(r => {
      const c = Object.assign({}, r);
      SPCD_COLUMNAS_CON_PERMISO_MEDICO.forEach(k => { delete c[k]; });
      return c;
    });
  }

  async function loadData() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('data', 'readonly');
        const req = tx.objectStore('data').get('spcd_data_full');
        req.onsuccess = () => resolve(spcdRecortarNombresMedicos(req.result || null));
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
    { id: 'top_pendientes',   keys: ['quien tiene mas pendientes','medico con mas pendientes','medicos con mas pendientes','pendientes por medico','medicos con mas atrasos'] },
    { id: 'pendientes_servicio', keys: ['top pendientes','ranking pendientes','ranking de pendientes','pendientes por servicio','pendientes por modalidad','servicios con mas pendientes'] },
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
    /* Rankings: van ANTES de «pendientes» / «con informe», que si no los capturan. Los que nombran médicos, primero. */
    if (/\b(medicos?|quienes?)\b.*\b(pendientes?|atrasos?)\b/.test(text) || /\b(pendientes?|atrasos?)\s+por\s+medicos?\b/.test(text)) {
      return 'top_pendientes';
    }
    /* «Top pendientes» a secas = pendientes por servicio (no usa nombres de médico: los pendientes no tienen informante). */
    if (/\b(top|ranking)\b.*\b(pendientes?|atrasos?)\b/.test(text) || /\b(pendientes?|atrasos?)\s+por\s+(servicios?|modalidad(es)?|areas?)\b/.test(text) ||
        /\b(servicios?|modalidad(es)?)\b.*\b(pendientes?|atrasos?)\b/.test(text)) {
      return 'pendientes_servicio';
    }
    if (/\b(top|ranking)\b.*\bmedicos\b/.test(text)) {
      return 'top_medicos';
    }
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
        return `Puedo responder:\n\n<strong>📚 Procesos</strong>\nPreguntame cómo se hace algo: <em>"¿cómo se calcula el efectivo en caja?"</em>\nVer todo en <a href="conocimiento.html">Base de procesos</a>\n\n<strong>📊 Consultas dinámicas</strong>\n• "cuántas resonancias en abril"\n• "TC de cerebro este mes"\n• "ecografías de SPITRELLA"\n\n<strong>📈 Métricas y rankings</strong>\n• Sin informe · Con informe · Ausentes\n• Top médicos · Top equipos · Top prestaciones\n• Errores: derivantes · coseguros · trámites\n\n<strong>⏱ Filtros de período</strong>\nAgregá: hoy · ayer · esta semana · mes pasado · enero a diciembre\n<em>Ej: "sin informe en marzo"</em>\n\n<strong>👤 Filtros por operador</strong>\nNombrá al operador: SPITRELLA · JAVILA · JMONICA · ZABRAHAM · ITORRES\n\n<strong>📥 Exportar a Excel</strong>\nDecime "dame el excel de..." y te lo genero al instante.\n\n<strong>🧠 Aprendo de tus consultas</strong>\nLas preguntas frecuentes aparecen como sugerencias.`;
      case 'que_es':
        return `<strong>Lumen by SPITRELLA</strong> es la plataforma de control interno del Hospital Italiano de Mendoza.\n\n4 módulos:\n• <strong>Médico</strong> — Informes pendientes y tiempos\n• <strong>Técnico</strong> — Estudios realizados y equipos\n• <strong>Administrativo</strong> — Derivantes, coberturas y afiliados\n• <strong>Operativo</strong> — Stock, insumos y pedidos`;
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
        if (!spcdPuedeVerNombresMedicos()) return { text: badges + SPCD_AVISO_SIN_PERMISO_MEDICOS, exportable: false };
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
        if (!spcdPuedeVerNombresMedicos()) return { text: badges + SPCD_AVISO_SIN_PERMISO_MEDICOS, exportable: false };
        const pen = rea.filter(sinInforme);
        const by = {};
        pen.forEach(r => { const m = r['Médico Informante']; if (medicoValido(m)) by[m] = (by[m]||0) + 1; });
        const top = Object.entries(by).sort((a,b) => b[1]-a[1]).slice(0,5);
        if (!top.length) return { text: badges + (pen.length ? `Hay ${fmt(pen.length)} estudios sin informe, pero ninguno tiene médico informante asignado: no se puede armar el ranking por médico. Probá «top pendientes» para verlos por servicio.` : '¡No hay pendientes! 🎉'), exportable: false };
        return { text: badges + `<strong>Top médicos con más pendientes:</strong>\n` +
          top.map((t,i) => `${i+1}. ${t[0]} — <strong>${fmt(t[1])}</strong>`).join('\n'), exportable: true, metricId, periodId, filters };
      }

      case 'pendientes_servicio': {
        const pen = rea.filter(sinInforme);
        if (!pen.length) return { text: badges + '¡No hay pendientes! 🎉', exportable: false };
        const by = Object.create(null);
        pen.forEach(r => { const s = servicioDe(r); by[s] = (by[s]||0) + 1; });
        const lista = Object.entries(by).sort((a,b) => b[1]-a[1]);
        return { text: badges + `<strong>Pendientes por servicio</strong> (${fmt(pen.length)} sin informe):\n` +
          lista.map((t,i) => `${i+1}. ${t[0]} — <strong>${fmt(t[1])}</strong> (${pct(t[1], pen.length)})`).join('\n'), exportable: true, metricId, periodId, filters };
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
      s.integrity = 'sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz'; s.crossOrigin = 'anonymous';
      s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
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
        s.src = 'spcd-excel-template.js?v=54552c64'; /* hash de spcd-excel-template.js: actualizar si cambia la plantilla */
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
    const RED='C62828', AMBER='8A5A00', GREEN='0B7A4B'; /* legibles sobre fondo claro (plantilla Zafiro claro) */

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
        if (!spcdPuedeVerNombresMedicos()) return SPCD_AVISO_SIN_PERMISO_MEDICOS;
        const con = rea.filter(tieneInforme);
        const by = {}; con.forEach(r => { const m = r['Médico Informante']; if (medicoValido(m)) by[m] = (by[m]||0) + 1; });
        const total = Object.values(by).reduce((s,v) => s+v, 0);
        const entries = Object.entries(by).sort((a,b) => b[1]-a[1]);
        spec = { rows: entries.map(([m,n],i) => ({ '#': i+1, 'Médico': m, 'Cantidad': n, 'Porcentaje': total ? ((n/total)*100).toFixed(1)+'%' : '—' })), schema: { keys: ['#','Médico','Cantidad','Porcentaje'], short: ['#','Médico Informante','Cantidad','%'], widths: [4,36,12,12] }, reportTitle: 'INFORME MÉDICO — RANKING', infoTitle: 'Top médicos por informes', filePrefix: 'SPCD_Medico_TopMedicos', descripcion: 'ranking de médicos' };
        break;
      }
      case 'top_pendientes': {
        if (!spcdPuedeVerNombresMedicos()) return SPCD_AVISO_SIN_PERMISO_MEDICOS;
        const pen = rea.filter(sinInforme);
        const by = {}; pen.forEach(r => { const m = r['Médico Informante']; if (medicoValido(m)) by[m] = (by[m]||0) + 1; });
        const entries = Object.entries(by).sort((a,b) => b[1]-a[1]);
        const total = entries.reduce((s,e) => s+e[1], 0);
        spec = { rows: entries.map(([m,n],i) => ({ '#': i+1, 'Médico': m, 'Pendientes': n, 'Porcentaje': total ? ((n/total)*100).toFixed(1)+'%' : '—' })), schema: { keys: ['#','Médico','Pendientes','Porcentaje'], short: ['#','Médico Informante','Pendientes','%'], widths: [4,36,12,12] }, reportTitle: 'INFORME MÉDICO — PENDIENTES', infoTitle: 'Top médicos con pendientes', filePrefix: 'SPCD_Medico_TopPendientes', descripcion: 'médicos con pendientes', cellColorFn: (col) => col === 'Pendientes' ? AMBER : null };
        break;
      }
      case 'pendientes_servicio': {
        const pen = rea.filter(sinInforme);
        const by = Object.create(null); pen.forEach(r => { const s = servicioDe(r); by[s] = (by[s]||0) + 1; });
        const entries = Object.entries(by).sort((a,b) => b[1]-a[1]);
        spec = { rows: entries.map(([s,n],i) => ({ '#': i+1, 'Servicio': s, 'Pendientes': n, 'Porcentaje': pen.length ? ((n/pen.length)*100).toFixed(1)+'%' : '—' })), schema: { keys: ['#','Servicio','Pendientes','Porcentaje'], short: ['#','Servicio','Pendientes','%'], widths: [4,28,12,12] }, reportTitle: 'INFORME MÉDICO — PENDIENTES POR SERVICIO', infoTitle: 'Pendientes por servicio', filePrefix: 'SPCD_Medico_PendientesServicio', descripcion: 'pendientes por servicio', cellColorFn: (col) => col === 'Pendientes' ? AMBER : null };
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

  /* 27/11/2026: se sacó el módulo de IA que llamaba a Gemini 1.5 desde el navegador (modelo retirado, clave en localStorage).
     Se borran los restos locales de la clave y de la auditoría. Las consultas de procesos siguen por kb-preguntar (servidor). */
  try { localStorage.removeItem('spcd_ai_gemini_key'); localStorage.removeItem('spcd_ai_audit_log'); } catch (e) {}


  /* ============================================================
     HANDLER PRINCIPAL v2
     ============================================================ */
  // Store last response for download
  let _lastResult = null;

  /* ===============================================================
     BASE DE CONOCIMIENTO DE PROCESOS (2026-11-10)
     Preguntas de "cómo se hace" → Edge Function kb-preguntar (Supabase),
     que busca en el contenido APROBADO y redacta con Gemini.
     Sin datos de pacientes. La clave de Gemini vive en el servidor.
     ============================================================ */
  const KB_SB_URL = 'https://erjdncsnomwymjiaslpx.supabase.co';
  const KB_SB_KEY = 'sb_publishable_5qeVvqQO26a70lAj8dMXhw_fL_Cdu-2';
  const KB_STORE  = 'spcd_supabase_auth';

  async function kbToken() {
    try {
      if (window.sbAuth && window.sbAuth.auth) {
        const { data } = await window.sbAuth.auth.getSession();
        if (data && data.session && data.session.access_token) return data.session.access_token;
      }
    } catch (e) {}
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KB_STORE) || 'null'); } catch (e) {}
    if (!s || !s.access_token) return null;
    const vence = (s.expires_at || 0) * 1000;
    if (vence - Date.now() > 60 * 1000) return s.access_token;
    if (!s.refresh_token) return null;
    try {
      const r = await fetch(KB_SB_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'apikey': KB_SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      if (!r.ok) return null;
      const n = await r.json();
      if (!n.access_token) return null;
      if (!n.expires_at && n.expires_in) n.expires_at = Math.floor(Date.now() / 1000) + n.expires_in;
      try { localStorage.setItem(KB_STORE, JSON.stringify(Object.assign({}, s, n))); } catch (e) {}
      return n.access_token;
    } catch (e) { return null; }
  }

  const KB_ABRE = /^(como|que hago|que hay que|que tengo que|que pasa si|que pasa cuando|por que|porque|donde|quien|quienes|cuando se|cual es el procedimiento|cual es el circuito|que significa|se puede|hay que|es obligatorio|procedimiento|proceso|instructivo)\b/;
  function kbEsPregunta(tNorm) {
    if (!tNorm) return false;
    if (/^(proceso|procesos|procedimiento)\s*:/.test(tNorm)) return true;
    return KB_ABRE.test(tNorm);
  }

  function kbFormatear(txt) {
    let h = escapeHtml(String(txt || '').trim());
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/^\s*[\*\-]\s+/gm, '• ');
    h = h.replace(/\n{3,}/g, '\n\n');
    return h;
  }

  async function kbResponder(text) {
    const pregunta = String(text || '').replace(/^\s*(procesos?|procedimiento)\s*:\s*/i, '');
    const tok = await kbToken();
    if (!tok) return null; // sin sesión de Supabase: el motor clásico sigue como siempre
    let d = null;
    try {
      const r = await fetch(KB_SB_URL + '/functions/v1/kb-preguntar', {
        method: 'POST',
        headers: { 'apikey': KB_SB_KEY, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta, pagina: PAGE })
      });
      if (r.status === 429) return { text: '⏳ Llegaste al tope de consultas de procesos por esta hora. Probá más tarde.', exportable: false };
      if (r.status === 401) return null;
      d = await r.json();
    } catch (e) { return null; }
    if (!d || !d.ok) return null;

    const q = encodeURIComponent(pregunta.slice(0, 200));
    let h = '📚 ' + kbFormatear(d.respuesta);
    if (d.fuentes && d.fuentes.length) {
      h += '\n\n<em>Fuente: ' + d.fuentes.map(f =>
        `<a href="conocimiento.html#e${Number(f.id)}">${escapeHtml(f.titulo)}</a>`).join(' · ') + '</em>';
    }
    if (d.aviso === 'RATE_LIMIT') h += '\n<em>(La IA llegó a su límite por un rato: te muestro el texto tal cual está cargado.)</em>';
    const cid = Number(d.consulta_id) || 0;
    if (d.encontrado) {
      h += `\n<span class="cb-kb-acc">${cid ? `<button class="cb-chip" data-kb-voto="1" data-kb-id="${cid}">👍 Sirvió</button><button class="cb-chip" data-kb-voto="0" data-kb-id="${cid}">👎 No sirvió</button>` : ''}<a class="cb-chip" href="conocimiento.html?proponer=1&q=${q}">✏️ Corregir</a></span>`;
    } else {
      h += `\n<span class="cb-kb-acc"><a class="cb-chip" href="conocimiento.html?proponer=1&q=${q}">➕ Proponer cómo se hace</a></span>`;
    }
    return { text: h, exportable: false };
  }

  msgsEl.addEventListener('click', async (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-kb-voto]');
    if (!b) return;
    const cont = b.parentElement;
    const util = b.getAttribute('data-kb-voto') === '1';
    const id = Number(b.getAttribute('data-kb-id'));
    cont.querySelectorAll('[data-kb-voto]').forEach(x => x.disabled = true);
    try {
      const tok = await kbToken();
      if (tok) await fetch(KB_SB_URL + '/rest/v1/rpc/kb_calificar', {
        method: 'POST',
        headers: { 'apikey': KB_SB_KEY, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_id: id, p_util: util })
      });
    } catch (e) {}
    b.textContent = util ? '👍 ¡Gracias!' : '👎 Anotado';
  });

  async function handleQuery(text) {
    const q = parseQuery(text);
    if (q.empty) return { text: `Escribí una pregunta 🙂`, exportable: false };

    // ═══ PROCESOS: preguntas de "cómo se hace" → base de conocimiento ═══
    if (kbEsPregunta(normalize(text)) && !isExportIntent(normalize(text))) {
      const kb = await kbResponder(text);
      if (kb) return kb;
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
    { const kb = await kbResponder(text); if (kb && kb.text && kb.text.indexOf('Todavía no tengo cargado') === -1) return kb; }
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
      ].filter(c => spcdPuedeVerNombresMedicos() || !/^top medicos$/.test(c.q));
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
    chips.push({ label: '📚 Procesos', q: 'cómo uso el asistente para procesos' });
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
    btn.classList.toggle('win-open', open);
    if (open) hideHint(true);
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

  /* Globo de diálogo del lanzador: saluda una vez por sesión y reaparece al pasar el mouse */
  const hintEl = document.getElementById('spcd-cb-hint');
  const HINT_MSG = '¿En qué te ayudo hoy?';
  let hintTimers = [];
  function clearHint() { hintTimers.forEach(clearTimeout); hintTimers = []; }
  function hideHint(now) {
    clearHint();
    if (!hintEl.classList.contains('show')) return;
    btn.classList.remove('hint-on');
    if (now) { hintEl.className = ''; return; }
    hintEl.className = 'hide';
    hintTimers.push(setTimeout(() => { hintEl.className = ''; }, 320));
  }
  function showHint(typing, ms) {
    if (win.classList.contains('open') || !btn.classList.contains('visible')) return;
    clearHint();
    const txt = hintEl.querySelector('.cb-hint-text'), dots = hintEl.querySelector('.cb-hint-dots'), cta = hintEl.querySelector('.cb-hint-cta');
    hintEl.className = 'show'; btn.classList.add('hint-on');
    if (typing) {
      txt.style.display = 'none'; dots.style.display = 'flex'; cta.style.opacity = '0';
      hintTimers.push(setTimeout(() => {
        dots.style.display = 'none'; txt.style.display = 'block';
        let i = 0;
        const step = () => { i++; txt.innerHTML = HINT_MSG.slice(0, i) + '<span class="cur"></span>'; if (i < HINT_MSG.length) hintTimers.push(setTimeout(step, 45)); else cta.style.opacity = '1'; };
        step();
      }, 1100));
    } else {
      dots.style.display = 'none'; txt.style.display = 'block'; txt.innerHTML = HINT_MSG + '<span class="cur"></span>'; cta.style.opacity = '1';
    }
    hintTimers.push(setTimeout(() => hideHint(false), ms));
  }
  hintEl.addEventListener('click', () => toggle(true));
  btn.addEventListener('mouseenter', () => { if (!hintEl.classList.contains('show')) showHint(false, 5000); });
  let hintSaludo = false;
  function saludoInicial() {
    if (hintSaludo || !btn.classList.contains('visible')) return;
    hintSaludo = true;
    let visto = false; try { visto = sessionStorage.getItem('lumen_cb_saludo') === '1'; sessionStorage.setItem('lumen_cb_saludo', '1'); } catch (e) {}
    if (!visto) setTimeout(() => showHint(true, 9500), 1200);
  }
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
    if (ok) saludoInicial(); else hideHint(true);
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
