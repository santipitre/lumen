/* ============================================================
   spcd-sesion-barra.js · Barra de sesión + cierre por inactividad
   ------------------------------------------------------------
   - Franja fija abajo con el usuario de la sesión abierta
     ("Sesión: SPITRELLA · Santiago Pitrella") y botón "Salir".
     Sirve para saber de quién es una sesión que quedó abierta.
   - Cierra la sesión sola tras INACTIVIDAD_MIN minutos sin que
     nadie toque la pantalla (clic, tecla, toque, scroll). Avisa
     en la barra durante el último minuto y medio.
   - Lee la sesión que ya guardan las páginas (localStorage
     'spcd_session' = { user, ts }). No la modifica, solo la borra
     al cerrar. No se muestra dentro de iframes (embed).
   Para cambiar el plazo de inactividad: la constante de abajo.
   ============================================================ */
(function () {
  'use strict';
  if (window.__spcdSesionBarra) return;
  window.__spcdSesionBarra = true;
  try { if (window.top !== window.self) return; } catch (e) { return; }
  if (/(^|[?&])embed=1(&|$)/.test(location.search)) return;

  var INACTIVIDAD_MIN = 45;                 /* ← plazo de inactividad (minutos) */
  var AVISO_SEG       = 90;                 /* avisa durante el último minuto y medio */
  var KEY_SESION      = 'spcd_session';
  var KEY_OLD         = 'spcd_operativo_session';
  var KEY_ACTIV       = 'spcd_actividad';
  var KEY_AUTH        = 'spcd_supabase_auth';
  var TIMEOUT_SESION  = 8 * 60 * 60 * 1000; /* igual que el resto de la app */
  var INACT_MS        = INACTIVIDAD_MIN * 60 * 1000;
  var DESTINO         = 'app.html';

  var barra = null, estilo = null, ultimaFirma = null, ultimoPing = 0;

  function leer() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY_SESION));
      if (s && s.user && s.user.username && typeof s.ts === 'number') return s;
    } catch (e) {}
    return null;
  }
  function actividad() {
    try { return parseInt(localStorage.getItem(KEY_ACTIV), 10) || 0; } catch (e) { return 0; }
  }
  function ping(fuerza) {
    var ahora = Date.now();
    if (!fuerza && ahora - ultimoPing < 15000) return;
    ultimoPing = ahora;
    try { localStorage.setItem(KEY_ACTIV, String(ahora)); } catch (e) {}
  }
  function hhmm(ms) {
    var d = new Date(ms);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function capital(t) { t = String(t || ''); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }

  var cerrando = false;
  function cerrar(motivo) {
    if (cerrando) return;
    cerrando = true;
    try { localStorage.removeItem(KEY_SESION); localStorage.removeItem(KEY_OLD); localStorage.removeItem(KEY_ACTIV); } catch (e) {}
    var fin = function () {
      try { localStorage.removeItem(KEY_AUTH); } catch (e) {}
      location.replace(DESTINO);
    };
    try {
      if (window.sbAuth && window.sbAuth.auth) {
        /* scope 'local': solo este navegador, no saca al usuario de sus otros dispositivos */
        Promise.resolve(window.sbAuth.auth.signOut({ scope: 'local' })).then(fin, fin);
        setTimeout(fin, 1500);
        return;
      }
    } catch (e) {}
    fin();
  }

  function css() {
    if (estilo) return;
    estilo = document.createElement('style');
    estilo.id = 'spcd-sb-css';
    estilo.textContent =
      '#spcd-sb{position:fixed;left:0;right:0;bottom:0;z-index:80;height:28px;box-sizing:border-box;' +
      'padding:0 12px env(safe-area-inset-bottom,0);display:flex;align-items:center;gap:8px;' +
      'background:#0E1521;border-top:1px solid #1F2937;color:#94A3B8;font:12px/1 system-ui,-apple-system,Segoe UI,sans-serif;' +
      'white-space:nowrap;overflow:hidden}' +
      '#spcd-sb .sb-dot{width:7px;height:7px;border-radius:50%;background:#10B981;flex:none}' +
      '#spcd-sb b{color:#F1F5F9;font-weight:600;letter-spacing:.04em}' +
      '#spcd-sb .sb-sep{opacity:.4}' +
      '#spcd-sb .sb-nom{overflow:hidden;text-overflow:ellipsis;min-width:0}' +
      '#spcd-sb .sb-sp{flex:1}' +
      '#spcd-sb .sb-ext{display:none}' +
      '#spcd-sb button{flex:none;font:inherit;font-size:11px;color:#FBBF24;background:transparent;border:1px solid #1F2937;' +
      'border-radius:6px;padding:3px 9px;cursor:pointer}' +
      '#spcd-sb button:hover{border-color:#FBBF24}' +
      '#spcd-sb.sb-aviso{background:#3B2A06;border-top-color:#FBBF24;color:#FDE68A}' +
      '#spcd-sb.sb-aviso .sb-dot{background:#FBBF24}' +
      '@media (min-width:700px){#spcd-sb .sb-ext{display:inline}}' +
      /* sube lo que vive pegado abajo para que no quede tapado */
      'body.spcd-con-barra{padding-bottom:calc(28px + env(safe-area-inset-bottom,0px))}' +
      'body.spcd-con-barra #spcd-cb-btn,body.spcd-con-barra #ss-fab,body.spcd-con-barra .btn-logout,body.spcd-con-barra .version-tag{bottom:48px!important}' +
      'body.spcd-con-barra #spcd-cb-win{bottom:116px!important}' +
      '@media (max-width:480px){body.spcd-con-barra #spcd-cb-win{bottom:108px!important;height:calc(100vh - 128px)!important}}';
    (document.head || document.documentElement).appendChild(estilo);
  }

  function crear(s) {
    css();
    barra = document.createElement('div');
    barra.id = 'spcd-sb';
    barra.setAttribute('role', 'status');
    barra.innerHTML =
      '<span class="sb-dot"></span><span class="sb-lbl">Sesión:</span><b class="sb-user"></b>' +
      '<span class="sb-sep">·</span><span class="sb-nom"></span>' +
      '<span class="sb-ext"><span class="sb-sep">·</span> <span class="sb-rol"></span> <span class="sb-sep">·</span> <span class="sb-ini"></span></span>' +
      '<span class="sb-sp"></span><span class="sb-info"></span>' +
      '<button type="button" class="sb-salir">Salir</button>';
    barra.querySelector('.sb-salir').addEventListener('click', function () { cerrar('manual'); });
    (document.body || document.documentElement).appendChild(barra);
    document.body && document.body.classList.add('spcd-con-barra');
  }

  function pintar(s) {
    var u = s.user, nombre = u.nombre || '';
    if (nombre && String(nombre).toUpperCase() === String(u.username).toUpperCase()) nombre = '';
    barra.querySelector('.sb-user').textContent = String(u.username).toUpperCase();
    barra.querySelector('.sb-nom').textContent = nombre;
    barra.querySelector('.sb-sep').style.display = nombre ? '' : 'none';
    barra.querySelector('.sb-nom').style.display = nombre ? '' : 'none';
    barra.querySelector('.sb-rol').textContent = capital(u.rol);
    barra.querySelector('.sb-ini').textContent = 'ingresó ' + hhmm(s.ts);
    barra.title = 'Sesión abierta de ' + u.username + (u.nombre ? ' (' + u.nombre + ')' : '') +
      ' · vence ' + hhmm(s.ts + TIMEOUT_SESION) + ' o tras ' + INACTIVIDAD_MIN + ' min sin actividad';
  }

  function quitar() {
    if (barra && barra.parentNode) barra.parentNode.removeChild(barra);
    barra = null; ultimaFirma = null;
    if (document.body) document.body.classList.remove('spcd-con-barra');
  }

  function sincronizar() {
    var s = leer();
    if (!s) { quitar(); return; }
    var ahora = Date.now();
    /* vencimientos */
    if (ahora - s.ts >= TIMEOUT_SESION) { cerrar('vencida'); return; }
    var ultimo = Math.max(actividad(), s.ts);
    var inactivo = ahora - ultimo;
    if (inactivo >= INACT_MS) { cerrar('inactividad'); return; }
    /* dibujo (solo si cambió la sesión) */
    var firma = s.user.username + '|' + s.ts + '|' + (s.user.nombre || '') + '|' + (s.user.rol || '');
    if (!barra || !document.getElementById('spcd-sb')) {
      if (!document.body) return;
      crear(s); ultimaFirma = null;
    }
    if (firma !== ultimaFirma) { pintar(s); ultimaFirma = firma; }
    /* aviso del último minuto y medio */
    var resta = Math.ceil((INACT_MS - inactivo) / 1000);
    var info = barra.querySelector('.sb-info');
    if (resta <= AVISO_SEG) {
      barra.classList.add('sb-aviso');
      barra.querySelector('.sb-lbl').textContent = 'Sesión:';
      info.textContent = 'Se cierra por inactividad en ' + Math.floor(resta / 60) + ':' + ('0' + (resta % 60)).slice(-2) + ' · tocá la pantalla para seguir';
    } else {
      barra.classList.remove('sb-aviso');
      info.textContent = '';
    }
  }

  /* actividad real del usuario (no cuenta mover el mouse: un roce no mantiene viva una sesión abandonada) */
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) {
    window.addEventListener(ev, function () { if (leer()) { var av = !!(barra && barra.classList.contains('sb-aviso')); ping(av); if (av) sincronizar(); } }, { passive: true, capture: true });
  });
  window.addEventListener('scroll', function () { if (leer()) ping(false); }, { passive: true, capture: true });

  /* cambios de sesión en otra pestaña */
  window.addEventListener('storage', function (e) { if (e.key === KEY_SESION || e.key === KEY_ACTIV || e.key === null) sincronizar(); });
  /* cambios de sesión en esta misma pestaña (login/logout sin recargar) */
  try {
    var set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k) {
      var r = set.apply(this, arguments);
      if (k === KEY_SESION && this === window.localStorage) { ping(true); setTimeout(sincronizar, 0); }
      return r;
    };
    Storage.prototype.removeItem = function (k) {
      var r = rem.apply(this, arguments);
      if (k === KEY_SESION && this === window.localStorage) setTimeout(sincronizar, 0);
      return r;
    };
  } catch (e) {}
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sincronizar(); });
  window.addEventListener('pageshow', sincronizar);
  window.addEventListener('focus', sincronizar);

  function iniciar() {
    var s = leer();
    if (s && !actividad()) ping(true);  /* sesión existente sin marca: cuenta desde ahora */
    sincronizar();
    setInterval(sincronizar, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  /* para pruebas */
  window.__spcdSesionBarraTest = { sincronizar: sincronizar, INACT_MS: INACT_MS };
})();
