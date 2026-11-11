/* ============================================================
   DICTOM AUTH — by Pyralis
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
    .dictom-admin-card { max-width: 720px; }
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

    .dictom-admin-row-actions { display: flex; gap: 6px; }
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
    .dictom-admin-newuser .row { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; }

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
            <div class="dictom-wordmark">Dict<span class="o">o</span>m</div>
            <div class="dictom-sub">by Pyralis</div>
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
      <div class="dictom-version">DICTOM · v1.0 · 2026</div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('dictom-login-form').addEventListener('submit', handleLogin);
    setTimeout(() => document.getElementById('dictom-user').focus(), 100);
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
      <div class="dictom-version">DICTOM · v1.0 · 2026</div>
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
        ${currentUser.rol === 'admin' ? '<button id="dictom-menu-admin">Panel admin</button>' : ''}
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
  }

  // ── ADMIN PANEL ───────────────────────────────────────────
  async function openAdminPanel() {
    if (!currentUser || currentUser.rol !== 'admin') {
      alert('Sólo admin puede acceder.');
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
          <h3>Crear nuevo radiólogo (trial 90 días)</h3>
          <div class="row">
            <input class="dictom-field" id="adm-username" placeholder="Usuario (ej: JDOE)" style="background:#0A0F14; border:0.5px solid #1F2937; border-radius:6px; padding:8px 10px; color:#F1F5F9; font-family:inherit;">
            <input class="dictom-field" id="adm-pin" placeholder="PIN 4-6 dígitos" inputmode="numeric" maxlength="6" style="background:#0A0F14; border:0.5px solid #1F2937; border-radius:6px; padding:8px 10px; color:#F1F5F9; font-family:inherit;">
            <input class="dictom-field" id="adm-nombre" placeholder="Nombre completo" style="background:#0A0F14; border:0.5px solid #1F2937; border-radius:6px; padding:8px 10px; color:#F1F5F9; font-family:inherit;">
            <button class="dictom-btn-primary" id="adm-create" style="margin:0; padding:8px 14px; font-size:11px;">Crear</button>
          </div>
          <div class="dictom-error" id="adm-error" style="margin-top:8px;"></div>
        </div>
        <table class="dictom-admin-table">
          <thead>
            <tr>
              <th>Usuario</th><th>Nombre</th><th>Plan</th><th>Estado</th><th>Días</th><th></th>
            </tr>
          </thead>
          <tbody id="adm-tbody">
            <tr><td colspan="6" style="text-align:center; color:#94A3B8;">Cargando...</td></tr>
          </tbody>
        </table>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('dictom-admin-close').addEventListener('click', () => overlay.remove());
    document.getElementById('adm-create').addEventListener('click', adminCreateUser);
    await reloadAdminTable();
  }

  async function reloadAdminTable() {
    const tbody = document.getElementById('adm-tbody');
    try {
      const rows = await sbRpc('listar_usuarios_dictom', {});
      if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94A3B8;">Sin radiólogos cargados todavía.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => {
        const planBadge = r.plan ? `<span class="badge ${r.plan}">${r.plan}</span>` : '—';
        const stateBadge = r.vigente
          ? '<span class="badge ok">Vigente</span>'
          : '<span class="badge expired">Expirada</span>';
        return `
          <tr>
            <td><code>${escapeHtml(r.username)}</code></td>
            <td>${escapeHtml(r.nombre)}</td>
            <td>${planBadge}</td>
            <td>${stateBadge}</td>
            <td>${r.dias_restantes || 0}</td>
            <td class="dictom-admin-row-actions">
              <button data-act="renew" data-id="${r.id}">+30d</button>
              <button data-act="renew365" data-id="${r.id}">+1 año</button>
              <button data-act="unlimited" data-id="${r.id}">∞</button>
              <button data-act="revoke" data-id="${r.id}">Revocar</button>
            </td>
          </tr>`;
      }).join('');

      tbody.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const act = btn.getAttribute('data-act');
          try {
            if (act === 'renew') {
              await sbRpc('otorgar_licencia_dictom', { p_usuario_id: id, p_plan: 'pro', p_dias: 30, p_notas: 'Renovado +30d desde panel' });
            } else if (act === 'renew365') {
              await sbRpc('otorgar_licencia_dictom', { p_usuario_id: id, p_plan: 'pro', p_dias: 365, p_notas: 'Renovado +1 año desde panel' });
            } else if (act === 'unlimited') {
              await sbRpc('otorgar_licencia_dictom', { p_usuario_id: id, p_plan: 'unlimited', p_dias: 36500, p_notas: 'Licencia permanente' });
            } else if (act === 'revoke') {
              if (!confirm('¿Revocar licencia?')) return;
              await sbRpc('revocar_licencia_dictom', { p_usuario_id: id });
            }
            await reloadAdminTable();
          } catch (e) {
            alert('Error: ' + e.message);
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#EF4444;">Error: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  async function adminCreateUser() {
    const u = document.getElementById('adm-username').value.trim().toUpperCase();
    const p = document.getElementById('adm-pin').value.trim();
    const n = document.getElementById('adm-nombre').value.trim();
    const err = document.getElementById('adm-error');
    err.classList.remove('visible');
    try {
      if (!u || !p || !n) throw new Error('Completá todos los campos.');
      if (!/^\d{4,6}$/.test(p)) throw new Error('PIN debe ser 4-6 dígitos.');
      await sbRpc('crear_usuario_dictom', {
        p_username: u, p_pin: p, p_nombre: n, p_dias_trial: 90
      });
      document.getElementById('adm-username').value = '';
      document.getElementById('adm-pin').value = '';
      document.getElementById('adm-nombre').value = '';
      await reloadAdminTable();
    } catch (e) {
      err.textContent = e.message;
      err.classList.add('visible');
    }
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
    try {
      const licRows = await sbRpc('licencia_dictom_activa', { p_usuario_id: u.id });
      currentLicencia = (licRows && licRows[0]) || { vigente: false, plan: null, dias_restantes: 0 };
    } catch (e) {
      currentLicencia = { vigente: false, plan: null, dias_restantes: 0 };   // sin conexión: no se habilita
    }
    if (!currentLicencia.vigente) { renderPaywall(currentUser.nombre); return; }
    onLoginSuccess();
  }

  // ── API PÚBLICA ───────────────────────────────────────────
  window.DictomAuth = {
    init: init,
    logout: logout,
    getCurrentUser: () => currentUser,
    getLicencia: () => currentLicencia,
    openAdminPanel: openAdminPanel
  };

  // Auto-init al DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
