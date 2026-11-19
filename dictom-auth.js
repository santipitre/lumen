/* ============================================================
   DICTOM AUTH — by SPITRELLA
   ============================================================
   Sistema de login + control de licencias para Dictom.
   Reusa el proyecto Supabase de Lumen.

   Dependencias en INFORMES_IA.html:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="dictom-auth.js"></script>

   API pública expuesta en window.DictomAuth:
     - init()                 → arranca el overlay de login al cargar
     - logout()               → cierra sesión
     - getCurrentUser()       → { id, username, nombre, rol, productos }
     - getLicencia()          → { vigente, plan, dias_restantes }
     - openAdminPanel()       → abre panel admin (sólo rol admin)
   ============================================================ */
(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────
  const SUPABASE_URL = 'https://erjdncsnomwymjiaslpx.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_5qeVvqQO26a70lAj8dMXhw_fL_Cdu-2';
  const SESSION_KEY = 'dictom_session';
  const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 horas

  // ── ESTADO ────────────────────────────────────────────────
  let currentUser = null;
  let currentLicencia = null;
  const DEVICE_KEY = 'dictom_equipo_id';

  // Identificador de ESTE navegador en ESTE equipo. El servidor sólo guarda su hash.
  function deviceId() {
    try {
      let d = localStorage.getItem(DEVICE_KEY);
      if (d && d.length >= 16) return d;
      d = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      localStorage.setItem(DEVICE_KEY, d);
      return d;
    } catch (e) {
      return 'sin-almacenamiento-' + Date.now();   // sin localStorage no se puede autorizar el equipo
    }
  }
  async function estadoAcceso() {
    const rows = await sbRpc('dictom_acceso_estado', { p_usuario_id: currentUser.id, p_device: deviceId() });
    return (rows && rows[0]) || null;
  }

  // ── HEADERS ───────────────────────────────────────────────
  function sbHeaders() {
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  async function sbRpc(fn, args) {
    // En Lumen: usa el token de la sesión (necesario para el panel admin); sin sesión, la anon key
    const hdrs = (typeof window.getSBHeaders === 'function') ? await window.getSBHeaders() : sbHeaders();
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify(args || {})
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.message || ('RPC error: ' + r.status));
    }
    return r.json();
  }

  // ── SESIÓN ────────────────────────────────────────────────
  function saveSession(user, licencia) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      user: user,
      licencia: licencia,
      ts: Date.now()
    }));
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (Date.now() - s.ts > SESSION_TIMEOUT_MS) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch (e) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // ── ESTILOS DEL OVERLAY ───────────────────────────────────
  function injectStyles() {
    if (document.getElementById('dictom-auth-styles')) return;
    const css = `
    .dictom-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: #0A0F14;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #F1F5F9;
      overflow-y: auto;
      padding: 24px;
    }
    .dictom-overlay.hidden { display: none; }

    .dictom-card {
      background: rgba(14, 21, 33, 0.95);
      border: 0.5px solid #1F2937;
      border-radius: 16px;
      padding: 40px 32px;
      width: 100%; max-width: 400px;
      backdrop-filter: blur(10px);
      animation: dictomFadeUp .4s ease;
    }
    @keyframes dictomFadeUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .dictom-logo {
      display: flex; flex-direction: column; align-items: center;
      gap: 14px; margin-bottom: 28px;
    }
    .dictom-logo svg { filter: drop-shadow(0 0 18px rgba(245,158,11,0.35)); }
    .dictom-wordmark {
      font-size: 26px; font-weight: 500; letter-spacing: 1px;
      color: #F1F5F9;
    }
    .dictom-wordmark .o { color: #F59E0B; }
    .dictom-sub {
      font-size: 11px; letter-spacing: 3px; color: #94A3B8;
      text-transform: uppercase;
    }

    .dictom-divider {
      width: 100px; height: 1px;
      background: linear-gradient(90deg, transparent, #F59E0B, transparent);
      margin: 0 auto 24px;
    }

    .dictom-field { margin-bottom: 14px; }
    .dictom-field label {
      display: block;
      font-size: 11px; letter-spacing: 1.5px;
      color: #94A3B8; text-transform: uppercase;
      margin-bottom: 6px;
    }
    .dictom-field input {
      width: 100%; box-sizing: border-box;
      background: #0E1521;
      border: 0.5px solid #1F2937;
      border-radius: 8px;
      padding: 11px 14px;
      font-size: 14px; color: #F1F5F9;
      font-family: inherit;
      outline: none;
      transition: border-color .2s, box-shadow .2s;
    }
    .dictom-field input:focus {
      border-color: #F59E0B;
      box-shadow: 0 0 0 3px rgba(245,158,11,0.15);
    }
    .dictom-field input::placeholder { color: #475569; }

    .dictom-btn-primary {
      width: 100%; box-sizing: border-box;
      margin-top: 10px;
      padding: 12px 20px;
      font-family: inherit; font-size: 13px;
      font-weight: 500; letter-spacing: 2px;
      text-transform: uppercase;
      color: #0A0F14;
      background: #F59E0B;
      border: none; border-radius: 8px;
      cursor: pointer;
      transition: background .2s, transform .1s;
    }
    .dictom-btn-primary:hover { background: #FCD34D; }
    .dictom-btn-primary:active { transform: scale(0.98); }
    .dictom-btn-primary:disabled {
      opacity: .5; cursor: not-allowed; transform: none;
    }

    .dictom-btn-ghost {
      background: transparent;
      border: 0.5px solid #1F2937;
      color: #94A3B8;
      padding: 10px 18px;
      border-radius: 8px;
      font-family: inherit; font-size: 12px;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all .2s;
    }
    .dictom-btn-ghost:hover { border-color: #F59E0B; color: #F59E0B; }

    .dictom-error {
      margin-top: 12px; padding: 10px 14px;
      background: rgba(239,68,68,0.1);
      border: 0.5px solid rgba(239,68,68,0.3);
      border-radius: 6px;
      color: #EF4444; font-size: 12px;
      display: none;
    }
    .dictom-error.visible { display: block; }

    /* Paywall */
    .dictom-paywall-icon {
      width: 64px; height: 64px;
      margin: 0 auto 16px;
      border-radius: 50%;
      background: rgba(239,68,68,0.1);
      border: 0.5px solid rgba(239,68,68,0.3);
      display: flex; align-items: center; justify-content: center;
      font-size: 28px;
    }
    .dictom-paywall-title {
      font-size: 18px; font-weight: 500;
      color: #F1F5F9; text-align: center;
      margin-bottom: 8px; letter-spacing: 0.5px;
    }
    .dictom-paywall-msg {
      font-size: 13px; color: #94A3B8;
      text-align: center; line-height: 1.6;
      margin-bottom: 24px;
    }

    /* Header session widget */
    .dictom-user-chip {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 5px 12px;
      background: rgba(245,158,11,0.08);
      border: 0.5px solid rgba(245,158,11,0.3);
      border-radius: 6px;
      font-size: 12px; color: #FCD34D;
      cursor: pointer;
      transition: background .2s;
    }
    .dictom-user-chip:hover { background: rgba(245,158,11,0.15); }
    .dictom-user-chip .dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #22C55E;
    }
    .dictom-user-chip.expiring .dot { background: #F59E0B; }

    /* Dropdown menú usuario */
    .dictom-user-menu {
      position: absolute; top: calc(100% + 4px); right: 0;
      background: #0E1521;
      border: 0.5px solid #1F2937;
      border-radius: 8px;
      padding: 8px;
      min-width: 220px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      z-index: 100;
      display: none;
    }
    .dictom-user-menu.open { display: block; }
    .dictom-user-menu button {
      display: block; width: 100%; text-align: left;
      padding: 8px 12px;
      background: transparent; border: none;
      color: #F1F5F9; font-size: 13px;
      font-family: inherit;
      cursor: pointer; border-radius: 4px;
      transition: background .15s;
    }
    .dictom-user-menu button:hover { background: rgba(245,158,11,0.1); color: #FCD34D; }
    .dictom-user-menu .menu-info {
      padding: 8px 12px; border-bottom: 0.5px solid #1F2937;
      margin-bottom: 4px;
    }
    .dictom-user-menu .menu-info .nm { font-size: 13px; color: #F1F5F9; font-weight: 500; }
    .dictom-user-menu .menu-info .rl { font-size: 11px; color: #94A3B8; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
    .dictom-user-menu .menu-info .lic { font-size: 11px; color: #94A3B8; margin-top: 4px; }
    .dictom-user-menu .menu-info .lic.green { color: #22C55E; }
    .dictom-user-menu .menu-info .lic.amber { color: #FCD34D; }
    .dictom-user-menu .menu-info .lic.red { color: #EF4444; }

    /* Admin panel */
    .dictom-admin-card { max-width: 1120px; }
    .dictom-admin-tablewrap { overflow-x: auto; }
    .dictom-admin-table .hor-txt { font-size: 12px; color: #CBD5E1; min-width: 150px; }
    .dictom-admin-table {
      width: 100%; border-collapse: collapse;
      font-size: 12px; margin-top: 16px;
    }
    .dictom-admin-table th {
      text-align: left;
      padding: 8px 10px;
      background: #0E1521;
      color: #94A3B8;
      font-weight: 500; letter-spacing: 1px;
      text-transform: uppercase; font-size: 10px;
      border-bottom: 0.5px solid #1F2937;
    }
    .dictom-admin-table td {
      padding: 10px;
      border-bottom: 0.5px solid #1F2937;
      color: #E2E8F0;
    }
    .dictom-admin-table tr:hover td { background: rgba(245,158,11,0.04); }
    .dictom-admin-table .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px; letter-spacing: 1px;
      text-transform: uppercase;
    }
    .dictom-admin-table .badge.ok { background: rgba(34,197,94,0.15); color: #22C55E; }
    .dictom-admin-table .badge.expired { background: rgba(239,68,68,0.15); color: #EF4444; }
    .dictom-admin-table .badge.trial { background: rgba(59,130,246,0.15); color: #60A5FA; }
    .dictom-admin-table .badge.pro { background: rgba(245,158,11,0.15); color: #FCD34D; }
    .dictom-admin-table .badge.unlimited { background: rgba(168,85,247,0.15); color: #C084FC; }

    .dictom-admin-row-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .dictom-admin-row-actions button {
      padding: 4px 10px; font-size: 11px;
      background: transparent; border: 0.5px solid #1F2937;
      border-radius: 4px; color: #94A3B8;
      cursor: pointer;
      font-family: inherit;
    }
    .dictom-admin-row-actions button:hover { border-color: #F59E0B; color: #F59E0B; }

    .dictom-admin-newuser {
      background: #0E1521; border: 0.5px solid #1F2937;
      border-radius: 8px; padding: 16px; margin-bottom: 16px;
    }
    .dictom-admin-newuser h3 { font-size: 13px; color: #FCD34D; margin: 0 0 12px; letter-spacing: 1px; text-transform: uppercase; }
    .dictom-admin-newuser .row { display: grid; grid-template-columns: 1.6fr 1fr auto; gap: 8px; }
    .hor-box { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-end; margin-top: 14px; }
    .hor-lbl { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #94A3B8; margin-bottom: 6px; }
    .hor-dias { display: flex; gap: 6px; }
    .hor-dias label { position: relative; cursor: pointer; }
    .hor-dias input { position: absolute; opacity: 0; pointer-events: none; }
    .hor-dias span { display: inline-flex; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 8px; border: 0.5px solid #1F2937; background: #0A0F14; color: #94A3B8; font-size: 13px; font-weight: 600; user-select: none; }
    .hor-dias input:checked + span { background: rgba(245,158,11,0.18); border-color: #F59E0B; color: #FCD34D; }
    .hor-dias input:focus-visible + span { outline: 2px solid #F59E0B; outline-offset: 2px; }
    .hor-hs { display: flex; gap: 8px; align-items: center; color: #94A3B8; font-size: 13px; }
    .hor-hs input { background: #0A0F14; border: 0.5px solid #1F2937; border-radius: 6px; padding: 7px 10px; color: #F1F5F9; font-family: inherit; font-size: 14px; color-scheme: dark; }
    .hor-ayuda { margin-top: 10px; font-size: 12px; color: #94A3B8; line-height: 1.5; }

    .dictom-version {
      position: fixed; bottom: 16px; left: 50%;
      transform: translateX(-50%);
      font-size: 10px; color: #475569;
      letter-spacing: 2px;
    }
    `;
    const style = document.createElement('style');
    style.id = 'dictom-auth-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── SVG LOGO ──────────────────────────────────────────────
  const LOGO_SVG = `
    <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="54" height="54" rx="13" fill="#0A0F14" stroke="#1F2937" stroke-width="0.8"/>
      <path d="M18 14 L18 46 L32 46 Q 46 46, 46 30 Q 46 14, 32 14 Z" fill="none" stroke="#F1F5F9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="33" cy="30" r="9" fill="none" stroke="#F59E0B" stroke-width="0.6" opacity="0.4"/>
      <circle cx="33" cy="30" r="4" fill="#F59E0B"/>
      <circle cx="33" cy="30" r="1.8" fill="#FEF3C7"/>
    </svg>`;

  // ── PANTALLA: LOGIN ──────────────────────────────────────
  function renderLoginScreen() {
    let overlay = document.getElementById('dictom-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'dictom-overlay';
    overlay.className = 'dictom-overlay';
    overlay.innerHTML = `
      <div class="dictom-card">
        <div class="dictom-logo">
          ${LOGO_SVG}
          <div style="text-align:center;">
            <div class="dictom-wordmark">DICT<span class="o">O</span>M</div>
            <div class="dictom-sub">by SPITRELLA</div>
          </div>
        </div>
        <div class="dictom-divider"></div>
        <form id="dictom-login-form" autocomplete="off">
          <div class="dictom-field">
            <label for="dictom-user">Usuario</label>
            <input type="text" id="dictom-user" placeholder="Ej: SPITRELLA" autocapitalize="characters" required />
          </div>
          <div class="dictom-field">
            <label for="dictom-pin">PIN</label>
            <input type="password" id="dictom-pin" placeholder="4-6 dígitos" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" required />
          </div>
          <button type="submit" class="dictom-btn-primary" id="dictom-submit">Ingresar</button>
          <div class="dictom-error" id="dictom-error"></div>
        </form>
      </div>
      <div class="dictom-version">DICTOM by SPITRELLA</div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('dictom-login-form').addEventListener('submit', handleLogin);
    setTimeout(() => document.getElementById('dictom-user').focus(), 100);
  }

  // ── PANTALLA: FUERA DE HORARIO ────────────────────────────
  function renderFueraDeHorario() {
    let overlay = document.getElementById('dictom-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'dictom-overlay';
    overlay.className = 'dictom-overlay';
    overlay.setAttribute('data-motivo', 'horario');
    const l = currentLicencia || {};
    overlay.innerHTML = `
      <div class="dictom-card">
        <div class="dictom-paywall-icon">⏰</div>
        <div class="dictom-paywall-title">Dictom no está habilitado en este horario</div>
        <div class="dictom-paywall-msg">
          Hola ${escapeHtml((currentUser && currentUser.nombre) || '')}.<br>
          Tu acceso a Dictom es: <b>${escapeHtml(fmtHorario(l.dias_semana, l.hora_desde, l.hora_hasta))}</b> (hora de Argentina).<br>
          Volvé a entrar dentro de ese horario, o pedile al administrador que lo cambie. Lo que ya tenés en pantalla no se borra.
        </div>
        <button class="dictom-btn-primary" type="button" onclick="location.href='app.html'">← Volver a Lumen</button>
        <div style="margin-top:14px; text-align:center;">
          <button class="dictom-btn-ghost" type="button" onclick="window.DictomAuth.logout()">← Cerrar sesión</button>
        </div>
      </div>
      <div class="dictom-version">DICTOM by SPITRELLA</div>
    `;
    document.body.appendChild(overlay);
  }

  function bloqueoCard(motivo, icono, titulo, htmlMsg) {
    let overlay = document.getElementById('dictom-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'dictom-overlay';
    overlay.className = 'dictom-overlay';
    overlay.setAttribute('data-motivo', motivo);
    overlay.innerHTML = `
      <div class="dictom-card">
        <div class="dictom-paywall-icon">${icono}</div>
        <div class="dictom-paywall-title">${titulo}</div>
        <div class="dictom-paywall-msg">${htmlMsg}</div>
        <button class="dictom-btn-primary" type="button" onclick="location.href='app.html'">← Volver a Lumen</button>
        <div style="margin-top:14px; text-align:center;">
          <button class="dictom-btn-ghost" type="button" onclick="window.DictomAuth.logout()">← Cerrar sesión</button>
        </div>
      </div>
      <div class="dictom-version">DICTOM by SPITRELLA</div>
    `;
    document.body.appendChild(overlay);
  }

  // Equipo no autorizado: se manda la solicitud al administrador y la pantalla se destraba sola cuando la aprueba.
  async function renderEquipoBloqueado() {
    let cod = (currentLicencia && currentLicencia.codigo_equipo) || '', est = 'pendiente', fallo = false;
    try {
      const r = await sbRpc('dictom_pedir_equipo', { p_device: deviceId(), p_navegador: (navigator.userAgent || '').slice(0, 200) });
      const x = Array.isArray(r) ? r[0] : r;
      if (x) { cod = x.codigo || cod; est = x.estado || est; }
    } catch (e) { fallo = true; }
    const nom = escapeHtml((currentUser && currentUser.nombre) || '');
    const codHtml = cod ? '<div style="margin:14px 0 4px; text-align:center;"><span style="display:inline-block; padding:8px 16px; border:0.5px solid #F59E0B; border-radius:8px; color:#FCD34D; letter-spacing:4px; font-size:20px; font-weight:600;">' + escapeHtml(cod) + '</span></div>' : '';
    const cuerpo = est === 'revocado'
      ? 'Hola ' + nom + '.<br>Este equipo fue dado de baja para usar Dictom. Si es un error, pedile al administrador que lo autorice de nuevo.' + codHtml
      : 'Hola ' + nom + '.<br>Dictom sólo funciona en los equipos que autoriza el administrador, y este todavía no lo está.' +
        (fallo ? '<br>No se pudo enviar la solicitud: revisá la conexión.' : '<br>La solicitud ya está enviada. Pasale este código al administrador: esta pantalla se actualiza sola cuando lo autorice.') + codHtml;
    bloqueoCard('equipo', '🖥️', 'Este equipo no está autorizado', cuerpo);
  }

  function renderRedBloqueada() {
    const ip = currentLicencia && currentLicencia.ip;
    bloqueoCard('red', '🌐', 'Dictom no está habilitado desde esta red',
      'Hola ' + escapeHtml((currentUser && currentUser.nombre) || '') + '.<br>Dictom sólo se puede usar desde las redes autorizadas por el administrador.' +
      (ip ? '<br>Tu conexión actual sale por la IP <b>' + escapeHtml(ip) + '</b>.' : '') +
      '<br>Si estás en tu puesto de trabajo y ves este cartel, avisale al administrador.');
  }

  function renderSinConexion() {
    bloqueoCard('conexion', '📡', 'No se pudo verificar tu acceso',
      'Dictom necesita confirmar con el servidor que tu usuario, este equipo y el horario están habilitados. Revisá la conexión: se reintenta solo.' +
      '<br><button class="dictom-btn-ghost" type="button" onclick="location.reload()" style="margin-top:12px;">Reintentar ahora</button>');
  }

  async function renderBloqueo(motivo) {
    if (motivo === 'horario') renderFueraDeHorario();
    else if (motivo === 'equipo') await renderEquipoBloqueado();
    else if (motivo === 'red') renderRedBloqueada();
    else renderSinConexion();
  }

  let ingresoHecho = false, vigilTimer = null, avisoCierreDe = null;

  function avisarBloqueo() {
    try { window.dispatchEvent(new CustomEvent('dictom-bloqueado')); } catch (e) {}
  }

  // Cada 20 s le pregunta a la base si sigue dentro del horario (manda la hora del servidor, no la del equipo).
  // Sin conexión usa la hora de Argentina calculada en el equipo con el último horario conocido.
  let tickEnCurso = false;
  function vigilarHorario() {
    if (vigilTimer) return;
    vigilTimer = setInterval(async function () {
      if (!currentUser || tickEnCurso) return;
      tickEnCurso = true;
      try {
        let srv = null;
        try {
          srv = await estadoAcceso();
          if (srv) currentLicencia = srv;
        } catch (e) { /* sin conexión: sigue con lo último que se sabe */ }
        if (srv && srv.vigente === false) {
          clearInterval(vigilTimer); vigilTimer = null;
          renderPaywall(currentUser.nombre);
          avisarBloqueo();
          return;
        }
        const ov = document.getElementById('dictom-overlay');
        const actual = ov ? ov.getAttribute('data-motivo') : null;
        let motivo;
        if (srv) motivo = srv.motivo || null;
        else {
          if (actual && actual !== 'horario') return;   // sin conexión no se levanta un bloqueo de equipo o red
          motivo = (currentLicencia && enHorarioLocal(currentLicencia)) ? null : (currentLicencia ? 'horario' : null);
        }
        if (motivo && motivo !== actual) { await renderBloqueo(motivo); avisarBloqueo(); return; }
        if (!motivo && actual) {
          if (!ingresoHecho) { location.reload(); return; }
          ov.remove();
          return;
        }
        if (!motivo) {
          const m = minutosParaCierre(currentLicencia);
          if (m !== null && m <= 5) {
            const clave = String(currentLicencia.hora_hasta) + '|' + new Date().toDateString();
            if (avisoCierreDe !== clave) {
              avisoCierreDe = clave;
              const msg = 'Tu horario de Dictom termina a las ' + currentLicencia.hora_hasta + ' (en ' + m + ' min). Copiá tu informe antes.';
              try { if (typeof window.toast === 'function') window.toast(msg, false); else avisarUI(msg, 'Se acaba tu horario'); } catch (e) {}
            }
          }
        }
      } finally { tickEnCurso = false; }
    }, 20000);
  }

  // ── PANTALLA: PAYWALL ─────────────────────────────────────
  function renderPaywall(nombre) {
    let overlay = document.getElementById('dictom-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'dictom-overlay';
    overlay.className = 'dictom-overlay';
    overlay.innerHTML = `
      <div class="dictom-card">
        <div class="dictom-paywall-icon">⚠️</div>
        <div class="dictom-paywall-title">Sin licencia vigente de Dictom</div>
        <div class="dictom-paywall-msg">
          Hola ${escapeHtml(nombre || '')}.<br>
          Tu usuario no tiene una licencia vigente de Dictom. Pedísela al administrador de Lumen.
        </div>
        <button class="dictom-btn-primary" type="button" onclick="location.href='app.html'">← Volver a Lumen</button>
        <div style="margin-top:14px; text-align:center;">
          <button class="dictom-btn-ghost" type="button" onclick="window.DictomAuth.logout()">
            ← Cerrar sesión
          </button>
        </div>
      </div>
      <div class="dictom-version">DICTOM by SPITRELLA</div>
    `;
    document.body.appendChild(overlay);
  }

  function hideOverlay() {
    const overlay = document.getElementById('dictom-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ── HANDLER LOGIN ─────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('dictom-submit');
    const errEl = document.getElementById('dictom-error');
    errEl.classList.remove('visible');
    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
      const username = document.getElementById('dictom-user').value.trim().toUpperCase();
      const pin = document.getElementById('dictom-pin').value.trim();
      if (!username || !pin) throw new Error('Completá usuario y PIN.');
      if (!/^\d{4,6}$/.test(pin)) throw new Error('El PIN debe ser de 4 a 6 dígitos.');

      // 1. Verificar credenciales
      const userRows = await sbRpc('verificar_pin_dictom', { p_username: username, p_pin: pin });
      if (!userRows || userRows.length === 0) {
        throw new Error('Usuario o PIN incorrecto, o no tenés acceso a Dictom.');
      }
      const user = userRows[0];

      // 2. Verificar licencia
      const licRows = await sbRpc('licencia_dictom_activa', { p_usuario_id: user.id });
      const lic = (licRows && licRows[0]) || { vigente: false, plan: null, dias_restantes: 0 };

      // 3. Guardar sesión SIEMPRE para poder mostrar paywall sin re-login
      currentUser = user;
      currentLicencia = lic;
      saveSession(user, lic);

      if (!lic.vigente) {
        renderPaywall(user.nombre);
        return;
      }

      // 4. Login OK → desbloquear app
      onLoginSuccess();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('visible');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  }

  // ── DESBLOQUEO ────────────────────────────────────────────
  function onLoginSuccess() {
    hideOverlay();
    document.body.style.overflow = '';
    injectHeaderChip();
    // Hook para que la app sepa que ya está logueada
    document.dispatchEvent(new CustomEvent('dictom:auth:ready', {
      detail: { user: currentUser, licencia: currentLicencia }
    }));
  }

  // ── HEADER CHIP (usuario + licencia) ──────────────────────
  function injectHeaderChip() {
    // Limpiar previo
    const old = document.getElementById('dictom-user-wrap');
    if (old) old.remove();

    // Buscar dónde insertar: junto al botón Configuración
    const settingsBtn = document.getElementById('btnSettings');
    if (!settingsBtn) {
      console.warn('[dictom-auth] No encontré btnSettings, omito chip de header');
      return;
    }
    const wrap = document.createElement('div');
    wrap.id = 'dictom-user-wrap';
    wrap.style.cssText = 'position:relative; margin-left:10px; display:inline-block;';

    const dias = currentLicencia ? (currentLicencia.dias_restantes || 0) : 0;
    const plan = currentLicencia ? currentLicencia.plan : '';
    const isExpiring = dias <= 7 && plan !== 'unlimited';
    const planLabel = plan === 'unlimited' ? 'Unlimited' : (plan === 'pro' ? 'Pro' : (plan === 'trial' ? 'Trial' : '—'));
    const licClass = plan === 'unlimited' ? 'green' : (isExpiring ? 'amber' : 'green');
    const licText = plan === 'unlimited' ? 'Licencia permanente' : (dias + ' días restantes · ' + planLabel);

    wrap.innerHTML = `
      <div class="dictom-user-chip ${isExpiring ? 'expiring' : ''}" id="dictom-chip">
        <span class="dot"></span>
        <span>${escapeHtml(currentUser.nombre || currentUser.username)}</span>
      </div>
      <div class="dictom-user-menu" id="dictom-menu">
        <div class="menu-info">
          <div class="nm">${escapeHtml(currentUser.nombre)}</div>
          <div class="rl">${escapeHtml(currentUser.rol)} · ${escapeHtml(currentUser.username)}</div>
          <div class="lic ${licClass}">${licText}</div>
        </div>
        ${currentUser.rol === 'admin' ? '<button id="dictom-menu-admin">Panel admin</button><button id="dictom-menu-uso">Uso de Dictom</button>' : ''}
        <button id="dictom-menu-lumen" onclick="location.href='app.html'">← Volver a Lumen</button>
        <button id="dictom-menu-logout">Cerrar sesión</button>
      </div>
    `;
    settingsBtn.parentNode.insertBefore(wrap, settingsBtn);

    const chip = document.getElementById('dictom-chip');
    const menu = document.getElementById('dictom-menu');
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));

    const logoutBtn = document.getElementById('dictom-menu-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const adminBtn = document.getElementById('dictom-menu-admin');
    if (adminBtn) adminBtn.addEventListener('click', openAdminPanel);
    const usoBtn = document.getElementById('dictom-menu-uso');
    if (usoBtn) usoBtn.addEventListener('click', openUsoPanel);
  }

  // ── ADMIN PANEL ───────────────────────────────────────────
  // ── HORARIO DE ACCESO ─────────────────────────────────────
  // dias: 1=lunes … 7=domingo (ISO). null = todos. Horas "HH:MM" en hora de Argentina; null = todo el día.
  // Si la hora de fin es menor que la de inicio la franja cruza la medianoche (el día habilitado es el del inicio).
  const TZ_AR = 'America/Argentina/Buenos_Aires';
  const DIAS_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const DIAS_ABREV = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  function horarioCampos(p, dias, desde, hasta) {
    const sel = (Array.isArray(dias) && dias.length) ? dias.map(Number) : [1, 2, 3, 4, 5, 6, 7];
    const chk = DIAS_CORTO.map(function (l, i) {
      return '<label title="' + DIAS_LARGO[i] + '"><input type="checkbox" class="' + p + '-dia" value="' + (i + 1) + '"' +
             (sel.indexOf(i + 1) >= 0 ? ' checked' : '') + ' aria-label="' + DIAS_LARGO[i] + '"><span>' + l + '</span></label>';
    }).join('');
    return '<div class="hor-box">' +
      '<div><div class="hor-lbl">Días habilitados</div><div class="hor-dias">' + chk + '</div></div>' +
      '<div><div class="hor-lbl">Horario (hora de Argentina)</div><div class="hor-hs"><span>de</span>' +
        '<input type="time" id="' + p + '-desde" value="' + escapeHtml(desde || '') + '"><span>a</span>' +
        '<input type="time" id="' + p + '-hasta" value="' + escapeHtml(hasta || '') + '"></div></div>' +
      '</div>' +
      '<div class="hor-ayuda">Sin horas = todo el día. Los 7 días tildados = sin restricción de días. ' +
      'Si la hora de fin es menor que la de inicio, la franja cruza la medianoche (ej. de 20:00 a 08:00).</div>';
  }

  function leerHorario(root, p) {
    const dias = Array.prototype.map.call(root.querySelectorAll('.' + p + '-dia:checked'), function (x) { return Number(x.value); });
    const d = (root.querySelector('#' + p + '-desde').value || '').trim();
    const h = (root.querySelector('#' + p + '-hasta').value || '').trim();
    if (!dias.length) throw new Error('Tildá al menos un día.');
    if ((d && !h) || (!d && h)) throw new Error('Cargá la hora de inicio y la de fin, o dejá las dos vacías.');
    if (d && d === h) throw new Error('La hora de inicio y la de fin no pueden ser iguales.');
    return { dias: dias.length === 7 ? null : dias, desde: d || null, hasta: h || null };
  }

  function fmtDias(dias) {
    const a = (Array.isArray(dias) ? dias.map(Number) : []).filter(function (x) { return x >= 1 && x <= 7; }).sort(function (x, y) { return x - y; });
    if (!a.length || a.length === 7) return 'Todos los días';
    const tramos = [];
    for (let i = 0; i < a.length;) {
      let j = i;
      while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
      tramos.push(j - i >= 2 ? DIAS_ABREV[a[i] - 1] + ' a ' + DIAS_ABREV[a[j] - 1]
                             : a.slice(i, j + 1).map(function (x) { return DIAS_ABREV[x - 1]; }).join(', '));
      i = j + 1;
    }
    return tramos.join(', ');
  }

  function fmtHorario(dias, desde, hasta) {
    const sinDias = !Array.isArray(dias) || !dias.length || dias.length === 7;
    if (sinDias && !desde) return 'Sin restricción';
    return fmtDias(dias) + ' · ' + (desde ? desde + ' a ' + hasta : 'todo el día');
  }

  function aMin(hhmm) { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }

  function partesAR(fecha) {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ_AR, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const o = {};
    f.formatToParts(fecha).forEach(function (x) { o[x.type] = x.value; });
    return { dow: { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[o.weekday], min: Number(o.hour) * 60 + Number(o.minute) };
  }

  // Mismo cálculo que dictom_en_horario() en la base. El administrador no tiene restricción.
  function enHorarioLocal(lic, fecha) {
    if (!lic || lic.exento) return true;
    const dias = (Array.isArray(lic.dias_semana) && lic.dias_semana.length) ? lic.dias_semana.map(Number) : null;
    const d = aMin(lic.hora_desde), h = aMin(lic.hora_hasta);
    if (!dias && d === null) return true;
    const p = partesAR(fecha || new Date());
    const prev = p.dow === 1 ? 7 : p.dow - 1;
    const okDia = function (x) { return !dias || dias.indexOf(x) >= 0; };
    if (d === null || h === null) return okDia(p.dow);
    if (d < h) return okDia(p.dow) && p.min >= d && p.min < h;
    return (okDia(p.dow) && p.min >= d) || (okDia(prev) && p.min < h);
  }

  function minutosParaCierre(lic, fecha) {
    const d = aMin(lic && lic.hora_desde), h = aMin(lic && lic.hora_hasta);
    if (!lic || lic.exento || d === null || h === null) return null;
    const p = partesAR(fecha || new Date());
    const m = d < h ? h - p.min : (p.min >= d ? 1440 - p.min + h : h - p.min);
    return m > 0 ? m : null;
  }

  function abrirHorarioModal(r, h) {
    return new Promise(function (resolve) {
      if (!r) { resolve(); return; }
      const ov = document.createElement('div');
      ov.className = 'dictom-overlay';
      ov.id = 'dictom-horario-overlay';
      ov.innerHTML =
        '<div class="dictom-card dictom-admin-card" style="max-width:660px;">' +
          '<div class="dictom-wordmark" style="font-size:18px;">Horario de acceso</div>' +
          '<div class="dictom-sub" style="margin:2px 0 6px;">' + escapeHtml(r.email || r.username) + '</div>' +
          horarioCampos('hor', h.dias_semana, h.hora_desde, h.hora_hasta) +
          '<div class="dictom-error" id="hor-error" style="margin-top:8px;"></div>' +
          '<div style="display:flex; gap:8px; justify-content:flex-end; margin-top:18px;">' +
            '<button class="dictom-btn-ghost" id="hor-cancel" type="button">Cancelar</button>' +
            '<button class="dictom-btn-primary" id="hor-save" type="button" style="margin:0; width:auto; padding:10px 20px;">Guardar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      const cerrar = function () { document.removeEventListener('keydown', onKey, true); ov.remove(); resolve(); };
      function onKey(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(); } }
      document.addEventListener('keydown', onKey, true);
      ov.querySelector('#hor-cancel').addEventListener('click', cerrar);
      ov.querySelector('#hor-save').addEventListener('click', async function () {
        const err = ov.querySelector('#hor-error');
        const btn = ov.querySelector('#hor-save');
        err.classList.remove('visible');
        try {
          const hh = leerHorario(ov, 'hor');
          btn.disabled = true;
          await sbRpc('dictom_fijar_horario', { p_usuario_id: r.id, p_dias: hh.dias, p_desde: hh.desde, p_hasta: hh.hasta });
          cerrar();
          await reloadAdminTable();
        } catch (ex) {
          err.textContent = ex.message;
          err.classList.add('visible');
          btn.disabled = false;
        }
      });
    });
  }

  async function openAdminPanel() {
    if (!currentUser || currentUser.rol !== 'admin') {
      avisarUI('Sólo admin puede acceder.', 'Acceso restringido');
      return;
    }

    // Cerrar menú
    const menu = document.getElementById('dictom-menu');
    if (menu) menu.classList.remove('open');

    let overlay = document.getElementById('dictom-admin-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'dictom-admin-overlay';
    overlay.className = 'dictom-overlay';
    overlay.innerHTML = `
      <div class="dictom-card dictom-admin-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div>
            <div class="dictom-wordmark" style="font-size:18px;">Panel Admin</div>
            <div class="dictom-sub" style="margin-top:2px;">Gestión de usuarios y licencias</div>
          </div>
          <button class="dictom-btn-ghost" id="dictom-admin-close">Cerrar</button>
        </div>
        <div class="dictom-admin-newuser">
          <h3>Dar acceso a Dictom con el correo institucional (trial 90 días)</h3>
          <div class="row">
            <input class="dictom-field" id="adm-email" type="email" autocomplete="off" placeholder="Correo institucional" title="nombre@fuesmen.edu.ar" style="background:#0A0F14; border:0.5px solid #1F2937; border-radius:6px; padding:8px 10px; color:#F1F5F9; font-family:inherit;">
            <input class="dictom-field" id="adm-nombre" placeholder="Nombre completo (si es nuevo)" style="background:#0A0F14; border:0.5px solid #1F2937; border-radius:6px; padding:8px 10px; color:#F1F5F9; font-family:inherit;">
            <button class="dictom-btn-primary" id="adm-create" style="margin:0; padding:8px 14px; font-size:11px; width:auto; white-space:nowrap;">Dar acceso</button>
          </div>
          ${horarioCampos('adm', null, '', '')}
          <div style="margin-top:8px; font-size:12px; color:#94A3B8;">Entra desde Lumen con «Entrar con Microsoft», usando ese mismo correo. No lleva PIN.</div>
          <div class="dictom-error" id="adm-error" style="margin-top:8px;"></div>
        </div>
        <div class="dictom-admin-tablewrap">
        <table class="dictom-admin-table">
          <thead>
            <tr>
              <th>Correo institucional</th><th>Nombre</th><th>Plan</th><th>Estado</th><th>Días</th><th>Horario de acceso</th><th>Último ingreso</th><th></th>
            </tr>
          </thead>
          <tbody id="adm-tbody">
            <tr><td colspan="8" style="text-align:center; color:#94A3B8;">Cargando...</td></tr>
          </tbody>
        </table>
        </div>

        <div class="dictom-admin-newuser" style="margin-top:20px;">
          <h3>Equipos</h3>
          <div class="hor-ayuda" style="margin:0 0 10px;">Dictom sólo abre en los equipos que autorices. Cuando alguien entra desde un equipo nuevo, aparece acá como «Pendiente» con un código: confirmá que es el puesto que esperabas y autorizalo. La autorización vale para ese navegador de esa PC (si borran los datos del navegador hay que autorizarlo de nuevo). Vos (administrador) no tenés restricción.</div>
          <div class="dictom-admin-tablewrap">
          <table class="dictom-admin-table">
            <thead><tr><th>Equipo</th><th>Código</th><th>Estado</th><th>Uso</th><th>Pidió</th><th>IP</th><th>Último uso</th><th></th></tr></thead>
            <tbody id="eq-tbody"><tr><td colspan="8" style="text-align:center; color:#94A3B8;">Cargando...</td></tr></tbody>
          </table>
          </div>
        </div>

        <div class="dictom-admin-newuser">
          <h3>Redes permitidas (IP)</h3>
          <div class="hor-ayuda" style="margin:0 0 10px;">Opcional. Si cargás alguna IP, Dictom sólo funciona desde esas conexiones (todas las PC del hospital comparten la misma IP pública, así que esto limita por lugar, no por máquina). Sin ninguna cargada no se controla la IP.</div>
          <div class="row" style="grid-template-columns:1fr 1fr auto auto;">
            <input id="red-ip" autocomplete="off" placeholder="IP, ej. 200.45.10.20" style="background:#0A0F14; border:0.5px solid #1F2937; border-radius:6px; padding:8px 10px; color:#F1F5F9; font-family:inherit;">
            <input id="red-et" autocomplete="off" placeholder="Nombre (ej. Hospital Italiano)" style="background:#0A0F14; border:0.5px solid #1F2937; border-radius:6px; padding:8px 10px; color:#F1F5F9; font-family:inherit;">
            <button class="dictom-btn-ghost" id="red-mia" type="button" style="white-space:nowrap;">Usar la IP desde la que estoy</button>
            <button class="dictom-btn-primary" id="red-add" type="button" style="margin:0; padding:8px 14px; font-size:11px; width:auto; white-space:nowrap;">Agregar</button>
          </div>
          <div class="dictom-error" id="red-error" style="margin-top:8px;"></div>
          <div class="dictom-admin-tablewrap" style="margin-top:8px;">
          <table class="dictom-admin-table">
            <thead><tr><th>IP / rango</th><th>Nombre</th><th>Cargada</th><th></th></tr></thead>
            <tbody id="red-tbody"><tr><td colspan="4" style="text-align:center; color:#94A3B8;">Cargando...</td></tr></tbody>
          </table>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('red-add').addEventListener('click', adminAgregarRed);
    document.getElementById('red-mia').addEventListener('click', adminMiIp);
    document.getElementById('dictom-admin-close').addEventListener('click', () => overlay.remove());
    document.getElementById('adm-create').addEventListener('click', adminCreateUser);
    await reloadAdminTable();
    await Promise.all([reloadAdminEquipos(), reloadAdminRedes()]);
  }

  let usuariosAdmin = [];

  function navCorto(ua) {
    const u = String(ua || '');
    const b = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'Navegador';
    const o = /Windows/.test(u) ? 'Windows' : /Mac OS/.test(u) ? 'Mac' : /Android/.test(u) ? 'Android' : /Linux/.test(u) ? 'Linux' : '';
    return b + (o ? ' · ' + o : '');
  }

  async function reloadAdminEquipos() {
    const tb = document.getElementById('eq-tbody');
    if (!tb) return;
    try {
      const rows = await sbRpc('dictom_equipos_listar', {});
      const porId = {};
      (rows || []).forEach(function (r) { porId[r.id] = r; });
      if (!rows || !rows.length) {
        tb.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#94A3B8;">Todavía ningún equipo pidió acceso.</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(function (r) {
        const badge = r.estado === 'autorizado' ? '<span class="badge ok">Autorizado</span>'
          : r.estado === 'pendiente' ? '<span class="badge pro">Pendiente</span>' : '<span class="badge expired">Revocado</span>';
        const uso = r.estado === 'autorizado' ? (r.usuario_nombre ? 'Sólo ' + escapeHtml(r.usuario_nombre) : 'Cualquier usuario con licencia') : '—';
        const acciones = (r.estado === 'autorizado'
          ? '<button data-eq="editar" data-id="' + r.id + '">Cambiar</button><button data-eq="revocar" data-id="' + r.id + '">Revocar</button>'
          : '<button data-eq="autorizar" data-id="' + r.id + '">Autorizar</button>' + (r.estado === 'pendiente' ? '<button data-eq="revocar" data-id="' + r.id + '">Rechazar</button>' : ''));
        return '<tr>' +
          '<td>' + (r.etiqueta ? escapeHtml(r.etiqueta) : '<span style="color:#94A3B8">Sin nombre</span>') + '<div style="font-size:11px; color:#94A3B8;">' + escapeHtml(navCorto(r.navegador)) + '</div></td>' +
          '<td><code>' + escapeHtml(r.codigo) + '</code></td><td>' + badge + '</td><td>' + uso + '</td>' +
          '<td>' + escapeHtml(r.solicitante || '') + '</td><td><code>' + escapeHtml(r.ip_ultima || '—') + '</code></td>' +
          '<td>' + (r.ultimo_uso ? escapeHtml(fmtFecha(r.ultimo_uso)) : '—') + '</td>' +
          '<td><div class="dictom-admin-row-actions">' + acciones + '</div></td></tr>';
      }).join('');
      tb.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          const id = btn.getAttribute('data-id'), act = btn.getAttribute('data-eq');
          try {
            if (act === 'revocar') {
              const r = porId[id] || {};
              const rechazo = r.estado === 'pendiente';
              if (!(await confirmarUI(rechazo ? '¿Rechazar la solicitud de este equipo?' : '¿Revocar este equipo? Dictom se bloquea ahí en menos de un minuto.',
                { titulo: rechazo ? 'Rechazar equipo' : 'Revocar equipo', aceptar: rechazo ? 'Rechazar' : 'Revocar', peligro: true }))) return;
              await sbRpc('dictom_equipo_resolver', { p_id: id, p_accion: 'revocar' });
            } else {
              const ok = await abrirEquipoModal(porId[id]);
              if (!ok) return;
            }
            await reloadAdminEquipos();
          } catch (e) { avisarUI('Error: ' + e.message, 'Error'); }
        });
      });
    } catch (e) {
      tb.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#EF4444;">Error: ' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  function abrirEquipoModal(r) {
    return new Promise(function (resolve) {
      if (!r) { resolve(false); return; }
      const ov = document.createElement('div');
      ov.className = 'dictom-overlay';
      ov.id = 'dictom-equipo-overlay';
      const inp = 'width:100%; box-sizing:border-box; background:#0A0F14; border:0.5px solid #1F2937; border-radius:6px; padding:9px 10px; color:#F1F5F9; font-family:inherit; font-size:14px;';
      const opts = ['<option value="">Cualquier usuario con licencia</option>'].concat((usuariosAdmin || []).map(function (u) {
        return '<option value="' + escapeHtml(u.id) + '"' + (u.id === r.usuario_id ? ' selected' : '') + '>' + escapeHtml(u.email || u.username) + ' — ' + escapeHtml(u.nombre || '') + '</option>';
      })).join('');
      ov.innerHTML =
        '<div class="dictom-card dictom-admin-card" style="max-width:560px;">' +
          '<div class="dictom-wordmark" style="font-size:18px;">Autorizar equipo</div>' +
          '<div class="dictom-sub" style="margin:2px 0 10px;">Código ' + escapeHtml(r.codigo) + ' · ' + escapeHtml(navCorto(r.navegador)) + ' · IP ' + escapeHtml(r.ip_ultima || '—') + '</div>' +
          '<div class="hor-lbl">Nombre del equipo</div>' +
          '<input id="eq-nombre" maxlength="80" autocomplete="off" placeholder="Ej: Sala TC 1" value="' + escapeHtml(r.etiqueta || '') + '" style="' + inp + '">' +
          '<div class="hor-lbl" style="margin-top:14px;">Quién puede usarlo</div>' +
          '<select id="eq-usuario" style="' + inp + '">' + opts + '</select>' +
          '<div class="dictom-error" id="eq-error" style="margin-top:8px;"></div>' +
          '<div style="display:flex; gap:8px; justify-content:flex-end; margin-top:18px;">' +
            '<button class="dictom-btn-ghost" id="eq-cancel" type="button">Cancelar</button>' +
            '<button class="dictom-btn-primary" id="eq-save" type="button" style="margin:0; width:auto; padding:10px 20px;">Autorizar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      const cerrar = function (v) { document.removeEventListener('keydown', onKey, true); ov.remove(); resolve(v); };
      function onKey(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(false); } }
      document.addEventListener('keydown', onKey, true);
      ov.querySelector('#eq-cancel').addEventListener('click', function () { cerrar(false); });
      setTimeout(function () { const i = ov.querySelector('#eq-nombre'); if (i) i.focus(); }, 50);
      ov.querySelector('#eq-save').addEventListener('click', async function () {
        const err = ov.querySelector('#eq-error'), btn = ov.querySelector('#eq-save');
        err.classList.remove('visible');
        const nombre = ov.querySelector('#eq-nombre').value.trim();
        if (nombre.length < 2) { err.textContent = 'Poné un nombre para el equipo (ej. Sala TC 1).'; err.classList.add('visible'); return; }
        try {
          btn.disabled = true;
          await sbRpc('dictom_equipo_resolver', { p_id: r.id, p_accion: 'autorizar', p_etiqueta: nombre, p_usuario_id: ov.querySelector('#eq-usuario').value || null });
          cerrar(true);
        } catch (ex) {
          err.textContent = ex.message; err.classList.add('visible'); btn.disabled = false;
        }
      });
    });
  }

  async function reloadAdminRedes() {
    const tb = document.getElementById('red-tbody');
    if (!tb) return;
    try {
      const rows = await sbRpc('dictom_redes_listar', {});
      if (!rows || !rows.length) {
        tb.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94A3B8;">Sin redes cargadas: no se controla la IP.</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(function (r) {
        return '<tr><td><code>' + escapeHtml(r.red) + '</code></td><td>' + escapeHtml(r.etiqueta || '') + '</td><td>' + escapeHtml(fmtFecha(r.creado_en)) +
          '</td><td><div class="dictom-admin-row-actions"><button data-id="' + r.id + '">Quitar</button></div></td></tr>';
      }).join('');
      tb.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          try {
            const unica = rows.length === 1;
            if (!(await confirmarUI(unica ? 'Es la última red cargada: si la quitás, Dictom deja de controlar la IP y vuelve a abrir desde cualquier conexión. ¿Quitarla?' : '¿Quitar esta red?',
              { titulo: 'Quitar red', aceptar: 'Quitar', peligro: true }))) return;
            await sbRpc('dictom_red_quitar', { p_id: btn.getAttribute('data-id') });
            await reloadAdminRedes();
          } catch (e) { avisarUI('Error: ' + e.message, 'Error'); }
        });
      });
    } catch (e) {
      tb.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#EF4444;">Error: ' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  async function adminMiIp() {
    const err = document.getElementById('red-error');
    err.classList.remove('visible');
    try {
      const ip = await sbRpc('dictom_mi_ip', {});
      const v = Array.isArray(ip) ? ip[0] : ip;
      if (!v) throw new Error('El servidor no pudo ver tu IP.');
      document.getElementById('red-ip').value = v;
    } catch (ex) { err.textContent = ex.message; err.classList.add('visible'); }
  }

  async function adminAgregarRed() {
    const ip = document.getElementById('red-ip').value.trim();
    const et = document.getElementById('red-et').value.trim();
    const err = document.getElementById('red-error');
    const btn = document.getElementById('red-add');
    err.classList.remove('visible');
    try {
      if (!ip) throw new Error('Cargá la IP (o usá «Usar la IP desde la que estoy»).');
      const hay = document.querySelectorAll('#red-tbody button').length;
      if (!hay && !(await confirmarUI('Al cargar la primera red, Dictom sólo va a funcionar desde las IP de esta lista (vos quedás exento como administrador). ¿Seguir?', { titulo: 'Limitar por red', aceptar: 'Limitar' }))) return;
      btn.disabled = true;
      await sbRpc('dictom_red_agregar', { p_red: ip, p_etiqueta: et });
      document.getElementById('red-ip').value = '';
      document.getElementById('red-et').value = '';
      await reloadAdminRedes();
    } catch (ex) { err.textContent = ex.message; err.classList.add('visible'); }
    finally { btn.disabled = false; }
  }

  async function reloadAdminTable() {
    const tbody = document.getElementById('adm-tbody');
    try {
      const [rows, hors] = await Promise.all([
        sbRpc('dictom_listar_usuarios', {}),
        sbRpc('dictom_horarios', {}).catch(function () { return []; })
      ]);
      const hmap = {}, porId = {};
      (hors || []).forEach(function (h) { hmap[h.usuario_id] = h; });
      (rows || []).forEach(function (r) { porId[r.id] = r; });
      usuariosAdmin = rows || [];
      if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#94A3B8;">Sin radiólogos cargados todavía.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => {
        const planBadge = r.plan ? `<span class="badge ${r.plan}">${r.plan}</span>` : '—';
        const stateBadge = r.vigente
          ? '<span class="badge ok">Vigente</span>'
          : '<span class="badge expired">Expirada</span>';
        const h = hmap[r.id] || {};
        const horTxt = r.rol === 'admin' ? 'Sin restricción (administrador)' : fmtHorario(h.dias_semana, h.hora_desde, h.hora_hasta);
        return `
          <tr>
            <td><code>${escapeHtml(r.email || r.username)}</code></td>
            <td>${escapeHtml(r.nombre)}</td>
            <td>${planBadge}</td>
            <td>${stateBadge}</td>
            <td>${r.dias_restantes || 0}</td>
            <td class="hor-txt">${escapeHtml(horTxt)}</td>
            <td>${r.ultimo_ingreso ? escapeHtml(fmtFecha(r.ultimo_ingreso)) : '<span style="color:#94A3B8">Todavía no entró</span>'}</td>
            <td><div class="dictom-admin-row-actions">
              <button data-act="horario" data-id="${r.id}">Horario</button>
              <button data-act="renew" data-id="${r.id}">+30d</button>
              <button data-act="renew365" data-id="${r.id}">+1 año</button>
              <button data-act="unlimited" data-id="${r.id}">∞</button>
              <button data-act="revoke" data-id="${r.id}">Revocar</button>
            </div></td>
          </tr>`;
      }).join('');

      tbody.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const act = btn.getAttribute('data-act');
          try {
            if (act === 'horario') {
              await abrirHorarioModal(porId[id], hmap[id] || {});
              return;
            } else if (act === 'renew') {
              await sbRpc('otorgar_licencia_dictom', { p_usuario_id: id, p_plan: 'pro', p_dias: 30, p_notas: 'Renovado +30d desde panel' });
            } else if (act === 'renew365') {
              await sbRpc('otorgar_licencia_dictom', { p_usuario_id: id, p_plan: 'pro', p_dias: 365, p_notas: 'Renovado +1 año desde panel' });
            } else if (act === 'unlimited') {
              await sbRpc('otorgar_licencia_dictom', { p_usuario_id: id, p_plan: 'unlimited', p_dias: 36500, p_notas: 'Licencia permanente' });
            } else if (act === 'revoke') {
              if (!(await confirmarUI('¿Revocar licencia?', { titulo: 'Revocar licencia', aceptar: 'Revocar', peligro: true }))) return;
              await sbRpc('revocar_licencia_dictom', { p_usuario_id: id });
            }
            await reloadAdminTable();
          } catch (e) {
            avisarUI('Error: ' + e.message, 'Error');
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#EF4444;">Error: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  async function adminCreateUser() {
    const e = document.getElementById('adm-email').value.trim().toLowerCase();
    const n = document.getElementById('adm-nombre').value.trim();
    const err = document.getElementById('adm-error');
    const btn = document.getElementById('adm-create');
    err.classList.remove('visible');
    try {
      if (!e) throw new Error('Cargá el correo institucional.');
      if (!/^[a-z0-9._%+-]+@fuesmen\.edu\.ar$/.test(e)) throw new Error('Tiene que ser el correo institucional (@fuesmen.edu.ar).');
      const hor = leerHorario(document, 'adm');
      btn.disabled = true;
      const r = await sbRpc('dictom_dar_acceso', {
        p_email: e, p_nombre: n, p_dias_trial: 90,
        p_dias_semana: hor.dias, p_hora_desde: hor.desde, p_hora_hasta: hor.hasta
      });
      const res = Array.isArray(r) ? r[0] : r;
      document.getElementById('adm-email').value = '';
      document.getElementById('adm-nombre').value = '';
      document.querySelectorAll('.adm-dia').forEach(function (c) { c.checked = true; });
      document.getElementById('adm-desde').value = '';
      document.getElementById('adm-hasta').value = '';
      await reloadAdminTable();
      avisarUI(
        (res && res.nuevo === false
          ? e + ' ya era usuario de Lumen: quedó con Dictom habilitado.'
          : 'Alta hecha para ' + e + '.') +
        ' Acceso: ' + fmtHorario(hor.dias, hor.desde, hor.hasta) + '.' +
        ' Tiene que entrar a Lumen con «Entrar con Microsoft» usando ese correo.',
        'Acceso otorgado');
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.add('visible');
    } finally {
      btn.disabled = false;
    }
  }

  // ── CARTELES (usan los de la página; si no están, los nativos) ─────────────
  function confirmarUI(msg, o) {
    return (typeof window.confirmar === 'function') ? window.confirmar(msg, o) : Promise.resolve(window.confirm(msg));
  }
  function avisarUI(msg, titulo) {
    if (typeof window.avisar === 'function') return window.avisar(msg, titulo);
    window.alert(msg);
    return Promise.resolve(true);
  }

  // ── REGISTRO DE USO ───────────────────────────────────────
  // Solo cuenta eventos (informe IA / normal / copiado / exportado / mini). Nunca manda texto clínico ni datos de pacientes.
  function registrarUso(evento, d) {
    if (!currentUser) return;
    d = d || {};
    const mods = Array.isArray(d.modalidades) ? d.modalidades.map(String).slice(0, 12) : [];
    const num = (v) => (typeof v === 'number' && isFinite(v)) ? Math.round(v) : null;
    sbRpc('dictom_registrar_uso', {
      p_evento: evento,
      p_modalidades: mods,
      p_proveedor: d.proveedor ? String(d.proveedor).slice(0, 20) : null,
      p_palabras: num(d.palabras),
      p_duracion_ms: num(d.duracion_ms)
    }).catch(function (e) {
      // La función no devuelve contenido: el error de "parsear vacío" no es un error real
      if (e && /JSON|Unexpected end/i.test(String(e.message))) return;
      console.warn('[dictom] uso no registrado:', e && e.message);
    });
  }

  // ── TABLERO DE USO (solo admin; la base lo exige con auth_es_admin) ──────────
  const TZ = 'America/Argentina/Buenos_Aires';
  let usoDias = 30;

  function fmtFecha(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) { return String(ts); }
  }
  function fmtDia(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? (m[3] + '/' + m[2]) : String(iso || '');
  }
  function haceCuanto(ts) {
    if (!ts) return '';
    const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 90) return 'hace un momento';
    const m = Math.round(s / 60);
    if (m < 60) return 'hace ' + m + ' min';
    const h = Math.round(m / 60);
    if (h < 36) return 'hace ' + h + ' h';
    return 'hace ' + Math.round(h / 24) + ' días';
  }

  function graficoDias(serie) {
    const W = 760, H = 200, pl = 34, pr = 8, pt = 10, pb = 28;
    const iw = W - pl - pr, ih = H - pt - pb;
    const max = Math.max(1, ...serie.map(x => x.ia + x.normal));
    const tope = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
    const bw = iw / serie.length;
    const ancho = Math.max(2, Math.min(26, bw * 0.7));
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const y = pt + ih - (ih * i / 4);
      g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" class="gl"/>' +
           '<text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end" class="ax">' + Math.round(tope * i / 4) + '</text>';
    }
    serie.forEach(function (x, i) {
      const bx = pl + bw * i + (bw - ancho) / 2;
      const hNo = ih * x.normal / tope, hIa = ih * x.ia / tope;
      const yNo = pt + ih - hNo, yIa = yNo - hIa;
      g += '<g><title>' + fmtDia(x.dia) + ': ' + x.ia + ' con IA, ' + x.normal + ' normal</title>' +
           (x.normal ? '<rect x="' + bx + '" y="' + yNo + '" width="' + ancho + '" height="' + hNo + '" rx="2" class="b-no"/>' : '') +
           (x.ia ? '<rect x="' + bx + '" y="' + yIa + '" width="' + ancho + '" height="' + hIa + '" rx="2" class="b-ia"/>' : '') +
           '<rect x="' + (pl + bw * i) + '" y="' + pt + '" width="' + bw + '" height="' + ih + '" fill="transparent"/></g>';
    });
    const paso = Math.max(1, Math.ceil(serie.length / 7));
    serie.forEach(function (x, i) {
      if (i % paso !== 0 && i !== serie.length - 1) return;
      g += '<text x="' + (pl + bw * i + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="ax">' + fmtDia(x.dia) + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="uso-svg" role="img" aria-label="Informes generados por día">' + g + '</svg>';
  }

  function injectUsoStyles() {
    if (document.getElementById('dictom-uso-styles')) return;
    const st = document.createElement('style');
    st.id = 'dictom-uso-styles';
    st.textContent = `
    .uso-card{box-sizing:border-box;width:100%;max-width:1000px;max-height:calc(100vh - 48px);overflow:auto;padding:24px;border-radius:18px;
      background:var(--z-elev,#0E1521);color:var(--z-ink,#E2E8F0);border:1px solid var(--z-line-strong,rgba(245,158,11,.4));
      font-family:var(--z-font,inherit);box-shadow:0 24px 60px rgba(0,0,0,.55)}
    .uso-top{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:16px}
    .uso-tit{font-size:22px;font-weight:800;margin:0}
    .uso-sub{font-size:13.5px;color:var(--z-ink3,#94A3B8);margin-top:4px}
    .uso-acc{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .uso-btn{font:inherit;font-size:14.5px;font-weight:700;min-height:40px;padding:8px 14px;border-radius:11px;cursor:pointer;
      border:1.5px solid var(--z-line-strong,rgba(245,158,11,.5));background:var(--z-card-hi,rgba(245,158,11,.12));color:var(--z-acc-ink,#FCD34D)}
    .uso-btn:hover{border-color:var(--z-acc,#F59E0B)}
    .uso-btn[aria-pressed="true"]{background:var(--z-acc,#F59E0B);color:#fff;border-color:transparent}
    .uso-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}
    .uso-kpi{padding:14px 16px;border-radius:14px;background:var(--z-card-hi,rgba(245,158,11,.1));border:1px solid var(--z-line,rgba(245,158,11,.25))}
    .uso-kpi .n{font-size:32px;font-weight:800;line-height:1.1}
    .uso-kpi .n.chico{font-size:19px;line-height:1.35}
    .uso-kpi .l{font-size:13px;color:var(--z-ink3,#94A3B8);margin-top:4px}
    .uso-mini{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
    .uso-chip{font-size:13.5px;padding:6px 12px;border-radius:999px;border:1px solid var(--z-line,rgba(245,158,11,.25));color:var(--z-ink,#E2E8F0)}
    .uso-chip b{font-weight:800}
    .uso-sec{margin:0 0 8px;font-size:15px;font-weight:800}
    .uso-box{padding:14px;border-radius:14px;border:1px solid var(--z-line,rgba(245,158,11,.25));margin-bottom:16px}
    .uso-svg{width:100%;height:auto;display:block}
    .uso-svg .gl{stroke:var(--z-line,rgba(148,163,184,.25));stroke-width:1}
    .uso-svg .ax{fill:var(--z-ink3,#94A3B8);font-size:11.5px}
    .uso-svg .b-ia{fill:var(--z-acc,#F59E0B)}
    .uso-svg .b-no{fill:var(--z-ink3,#94A3B8)}
    .uso-leyenda{display:flex;gap:16px;font-size:13px;color:var(--z-ink3,#94A3B8);margin-top:6px}
    .uso-leyenda i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}
    .uso-cols{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:16px}
    .uso-tabla{width:100%;border-collapse:collapse;font-size:14.5px}
    .uso-tabla th{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--z-ink3,#94A3B8);text-align:right;padding:6px 8px;border-bottom:1px solid var(--z-line,rgba(245,158,11,.25))}
    .uso-tabla th:first-child,.uso-tabla td:first-child{text-align:left}
    .uso-tabla td{padding:9px 8px;text-align:right;border-bottom:1px solid var(--z-line,rgba(245,158,11,.15))}
    .uso-tabla td small{display:block;color:var(--z-ink3,#94A3B8);font-size:12px}
    .uso-mod{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:14.5px}
    .uso-mod .nm{flex:0 0 96px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .uso-mod .bar{flex:1;height:12px;border-radius:6px;background:var(--z-card-hi,rgba(245,158,11,.12));overflow:hidden}
    .uso-mod .bar i{display:block;height:100%;background:var(--z-acc,#F59E0B);border-radius:6px}
    .uso-mod .ct{flex:0 0 34px;text-align:right;font-weight:800}
    .uso-vacio{padding:26px 8px;text-align:center;color:var(--z-ink3,#94A3B8);font-size:15px}
    .uso-nota{font-size:12.5px;color:var(--z-ink3,#94A3B8);margin-top:4px}
    @media (max-width:760px){.uso-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.uso-cols{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }

  function renderUso(box, r) {
    const nada = !r.primer_registro;
    let html = '';
    html += '<div class="uso-kpis">' +
      '<div class="uso-kpi"><div class="n">' + (r.informes || 0) + '</div><div class="l">Informes generados (últimos ' + r.dias + ' días)</div></div>' +
      '<div class="uso-kpi"><div class="n">' + (r.hoy || 0) + '</div><div class="l">Informes hoy</div></div>' +
      '<div class="uso-kpi"><div class="n chico">' + escapeHtml(fmtFecha(r.ultimo_informe)) + '</div><div class="l">Último informe' + (r.ultimo_informe ? ' · ' + escapeHtml(haceCuanto(r.ultimo_informe)) : '') + '</div></div>' +
      '<div class="uso-kpi"><div class="n">' + (r.usuarios_activos || 0) + '</div><div class="l">Usuarios activos</div></div>' +
      '</div>';
    html += '<div class="uso-mini">' +
      '<span class="uso-chip">Con IA <b>' + (r.ia || 0) + '</b></span>' +
      '<span class="uso-chip">Normal local <b>' + (r.normal || 0) + '</b></span>' +
      '<span class="uso-chip">Copiados <b>' + (r.copiados || 0) + '</b></span>' +
      '<span class="uso-chip">Exportados / impresos <b>' + (r.exportados || 0) + '</b></span>' +
      '<span class="uso-chip">Errores de IA <b>' + (r.errores_ia || 0) + '</b></span>' +
      '<span class="uso-chip">Mini abierta <b>' + (r.mini || 0) + '</b></span>' +
      '</div>';
    if (nada) {
      html += '<div class="uso-box"><div class="uso-vacio">Todavía no hay registros. El conteo empieza con el próximo informe que se genere en Dictom.</div></div>';
    } else {
      html += '<div class="uso-box"><h3 class="uso-sec">Informes por día</h3>' + graficoDias(r.por_dia || []) +
        '<div class="uso-leyenda"><span><i style="background:var(--z-acc,#F59E0B)"></i>Con IA</span><span><i style="background:var(--z-ink3,#94A3B8)"></i>Normal local</span></div></div>';
      const us = r.por_usuario || [];
      const mo = r.por_modalidad || [];
      const mx = Math.max(1, ...mo.map(m => m.informes));
      html += '<div class="uso-cols"><div class="uso-box"><h3 class="uso-sec">Por usuario</h3>' +
        (us.length ? '<table class="uso-tabla"><thead><tr><th>Usuario</th><th>Informes</th><th>IA</th><th>Normal</th><th>Copiados</th><th>Último uso</th></tr></thead><tbody>' +
          us.map(u => '<tr><td>' + escapeHtml(u.nombre) + '<small>' + escapeHtml(u.username) + '</small></td><td><b>' + u.informes + '</b></td><td>' + u.ia + '</td><td>' + u.normal + '</td><td>' + u.copiados + '</td><td>' + escapeHtml(fmtFecha(u.ultimo)) + '</td></tr>').join('') +
          '</tbody></table>' : '<div class="uso-vacio">Sin uso en este período.</div>') +
        '</div><div class="uso-box"><h3 class="uso-sec">Por modalidad</h3>' +
        (mo.length ? mo.map(m => '<div class="uso-mod"><span class="nm" title="' + escapeHtml(m.modalidad) + '">' + escapeHtml(m.modalidad) + '</span><span class="bar"><i style="width:' + Math.max(4, Math.round(100 * m.informes / mx)) + '%"></i></span><span class="ct">' + m.informes + '</span></div>').join('') : '<div class="uso-vacio">Sin datos.</div>') +
        '</div></div>';
    }
    html += '<div class="uso-nota">' + (r.primer_registro ? 'Hay registro desde el ' + escapeHtml(fmtFecha(r.primer_registro)) + '. Antes de esa fecha Dictom no guardaba nada de uso. ' : '') +
      'Solo se cuentan eventos: no se guarda texto clínico, ni datos de pacientes, ni el contenido de los informes. Horario de Argentina.</div>';
    box.innerHTML = html;
  }

  async function cargarUso(box, dias) {
    usoDias = dias;
    document.querySelectorAll('#dictom-uso-overlay [data-dias]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-dias')) === dias));
    });
    box.innerHTML = '<div class="uso-vacio">Cargando…</div>';
    try {
      const r = await sbRpc('dictom_uso_resumen', { p_dias: dias });
      renderUso(box, r || {});
    } catch (e) {
      const sinPermiso = /SIN_PERMISO|permission|42501/i.test(String(e.message));
      box.innerHTML = '<div class="uso-vacio" style="color:#FCA5A5">' + (sinPermiso ? 'Solo el administrador puede ver este tablero.' : 'No se pudo cargar: ' + escapeHtml(e.message)) + '</div>';
    }
  }

  async function openUsoPanel() {
    if (!currentUser || currentUser.rol !== 'admin') {
      avisarUI('Solo el administrador puede ver el uso de Dictom.', 'Acceso restringido');
      return;
    }
    const menu = document.getElementById('dictom-menu');
    if (menu) menu.classList.remove('open');
    injectStyles();
    injectUsoStyles();
    let overlay = document.getElementById('dictom-uso-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'dictom-uso-overlay';
    overlay.className = 'dictom-overlay';
    overlay.innerHTML =
      '<div class="uso-card" role="dialog" aria-modal="true" aria-labelledby="uso-tit">' +
        '<div class="uso-top"><div><h2 class="uso-tit" id="uso-tit">Uso de Dictom</h2>' +
        '<div class="uso-sub">Solo visible para administradores</div></div>' +
        '<div class="uso-acc">' +
          '<button class="uso-btn" data-dias="7" aria-pressed="false">7 días</button>' +
          '<button class="uso-btn" data-dias="30" aria-pressed="false">30 días</button>' +
          '<button class="uso-btn" data-dias="90" aria-pressed="false">90 días</button>' +
          '<button class="uso-btn" id="uso-refrescar" title="Volver a consultar">Actualizar</button>' +
          '<button class="uso-btn" id="uso-cerrar">Cerrar</button>' +
        '</div></div>' +
        '<div id="uso-cuerpo"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    const cuerpo = document.getElementById('uso-cuerpo');
    const cerrar = function () { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = function (e) { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', onKey, true);
    document.getElementById('uso-cerrar').addEventListener('click', cerrar);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) cerrar(); });
    document.getElementById('uso-refrescar').addEventListener('click', function () { cargarUso(cuerpo, usoDias); });
    overlay.querySelectorAll('[data-dias]').forEach(function (b) {
      b.addEventListener('click', function () { cargarUso(cuerpo, Number(b.getAttribute('data-dias'))); });
    });
    await cargarUso(cuerpo, usoDias);
  }

  // ── LOGOUT ────────────────────────────────────────────────
  function logout() {
    // Cierra la sesión de Lumen (es la misma) y vuelve al ingreso
    try { localStorage.removeItem('spcd_session'); localStorage.removeItem('spcd_operativo_session'); } catch (e) {}
    location.replace('app.html');
  }

  // ── HELPER ────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ── INIT ──────────────────────────────────────────────────
  // Dictom dentro de Lumen: no hay segundo login. Se usa la sesión de Lumen (spcd_session).
  function lumenSession() {
    try {
      const s = JSON.parse(localStorage.getItem('spcd_session'));
      if (s && s.user && s.user.id && typeof s.ts === 'number' && (Date.now() - s.ts) < SESSION_TIMEOUT_MS) return s.user;
    } catch (e) {}
    return null;
  }

  async function init() {
    injectStyles();
    document.body.style.overflow = 'hidden';
    const u = lumenSession();
    if (!u) { location.replace('app.html'); return; }   // sin sesión de Lumen: al ingreso
    currentUser = { id: u.id, username: u.username, nombre: u.nombre || u.username, rol: u.rol, productos: u.productos };
    let est = null;
    try { est = await estadoAcceso(); } catch (e) { est = null; }
    if (!est) {   // sin respuesta del servidor no se habilita nada
      renderSinConexion();
      vigilarHorario();
      return;
    }
    currentLicencia = est;
    if (!est.vigente) { renderPaywall(currentUser.nombre); return; }
    if (est.permitido === false) {
      await renderBloqueo(est.motivo);
      vigilarHorario();
      return;
    }
    ingresoHecho = true;
    onLoginSuccess();
    if (!currentLicencia.exento) vigilarHorario();
  }

  // ── API PÚBLICA ───────────────────────────────────────────
  window.DictomAuth = {
    init: init,
    logout: logout,
    getCurrentUser: () => currentUser,
    getLicencia: () => currentLicencia,
    openAdminPanel: openAdminPanel,
    openUsoPanel: openUsoPanel,
    registrarUso: registrarUso,
    _enHorario: enHorarioLocal,
    _fmtHorario: fmtHorario
  };

  // Auto-init al DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
