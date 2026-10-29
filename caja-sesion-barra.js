/* ============================================================
   caja-sesion-barra.js · Barra de sesión + cierre por inactividad (Caja)
   ------------------------------------------------------------
   caja.html tiene login propio (mail + código) y su sesión de Supabase
   Auth se renueva sola: sin esto, una Caja abierta no vence nunca.
   - Franja fija abajo con el usuario de la sesión ("Sesión: SPITRELLA ·
     Santiago Pitrella") y botón "Salir" (usa cerrarSesion() de caja-app.js).
   - Cierra la sesión sola tras INACTIVIDAD_MIN minutos sin que nadie toque
     la pantalla. Avisa en la barra durante el último minuto y medio.
   - Solo se muestra cuando el login de Caja ya pasó (USUARIO cargado y
     la compuerta levantada). No toca nada de caja-app.js.
   Para cambiar el plazo: la constante de abajo.
   ============================================================ */
(function () {
  'use strict';
  if (window.__cajaSesionBarra) return;
  window.__cajaSesionBarra = true;
  try { if (window.top !== window.self) return; } catch (e) { return; }

  var INACTIVIDAD_MIN = 45;                 /* ← plazo de inactividad (minutos) */
  var AVISO_SEG       = 90;
  var KEY_ACTIV       = 'spcd_actividad_caja';
  var INACT_MS        = INACTIVIDAD_MIN * 60 * 1000;

  var barra = null, ultimaFirma = null, ultimoPing = 0, cerrando = false, yaActiva = false;

  function usuario() {
    try { return (typeof USUARIO !== 'undefined' && USUARIO && USUARIO.username) ? USUARIO : null; } catch (e) { return null; }
  }
  function activa() {
    return !!usuario() && document.body && !document.body.classList.contains('gated');
  }
  function leerActiv() { try { return parseInt(localStorage.getItem(KEY_ACTIV), 10) || 0; } catch (e) { return 0; } }
  function ping(fuerza) {
    var ahora = Date.now();
    if (!fuerza && ahora - ultimoPing < 15000) return;
    ultimoPing = ahora;
    try { localStorage.setItem(KEY_ACTIV, String(ahora)); } catch (e) {}
  }
  function capital(t) { t = String(t || ''); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }

  function css() {
    if (document.getElementById('caja-sb-css')) return;
    var s = document.createElement('style');
    s.id = 'caja-sb-css';
    s.textContent =
      '#caja-sb{position:fixed;left:0;right:0;bottom:0;z-index:80;height:28px;box-sizing:border-box;padding:0 14px;' +
      'display:flex;align-items:center;gap:8px;background:var(--panel,#FFFDF7);border-top:1px solid var(--linea,#E7E0D2);' +
      'color:var(--ink-2,#665D50);font:12px/1 system-ui,-apple-system,Segoe UI,sans-serif;white-space:nowrap;overflow:hidden}' +
      '#caja-sb .sb-dot{width:7px;height:7px;border-radius:50%;background:var(--efectivo,#2E775C);flex:none}' +
      '#caja-sb b{color:var(--ink,#2E2A24);font-weight:700;letter-spacing:.04em}' +
      '#caja-sb .sb-sep{opacity:.45}#caja-sb .sb-nom{overflow:hidden;text-overflow:ellipsis;min-width:0}' +
      '#caja-sb .sb-sp{flex:1}#caja-sb .sb-ext{display:none}' +
      '#caja-sb button{flex:none;font:inherit;font-size:11px;font-weight:600;color:var(--oro,#7A5E12);background:transparent;' +
      'border:1px solid var(--linea,#E7E0D2);border-radius:6px;padding:3px 9px;cursor:pointer}' +
      '#caja-sb button:hover{border-color:var(--oro,#7A5E12)}' +
      '#caja-sb.sb-aviso{background:var(--aviso-bg,#FEEACC);border-top-color:var(--aviso-soft,#E6B463);color:var(--aviso,#896421)}' +
      '#caja-sb.sb-aviso .sb-dot{background:var(--aviso-soft,#E6B463)}' +
      '@media (min-width:700px){#caja-sb .sb-ext{display:inline}}' +
      'body.caja-con-barra{padding-bottom:28px}body.caja-con-barra #toast{bottom:44px}';
    (document.head || document.documentElement).appendChild(s);
  }

  function crear() {
    css();
    barra = document.createElement('div');
    barra.id = 'caja-sb';
    barra.setAttribute('role', 'status');
    barra.innerHTML =
      '<span class="sb-dot"></span><span>Sesión:</span><b class="sb-user"></b>' +
      '<span class="sb-sep">·</span><span class="sb-nom"></span>' +
      '<span class="sb-ext"><span class="sb-sep">·</span> <span class="sb-rol"></span></span>' +
      '<span class="sb-sp"></span><span class="sb-info"></span><button type="button" class="sb-salir">Salir</button>';
    barra.querySelector('.sb-salir').addEventListener('click', salir);
    document.body.appendChild(barra);
    document.body.classList.add('caja-con-barra');
  }
  function quitar() {
    if (barra && barra.parentNode) barra.parentNode.removeChild(barra);
    barra = null; ultimaFirma = null;
    if (document.body) document.body.classList.remove('caja-con-barra');
  }
  function salir() {
    if (cerrando) return;
    cerrando = true;
    try { localStorage.removeItem(KEY_ACTIV); } catch (e) {}
    try { if (typeof cerrarSesion === 'function') { cerrarSesion(); return; } } catch (e) {}
    location.href = location.pathname;
  }

  function sincronizar() {
    if (cerrando) return;
    if (!activa()) { yaActiva = false; quitar(); return; }
    var u = usuario(), ahora = Date.now();
    if (!yaActiva) { yaActiva = true; ping(true); }   /* recién entró (o recargó): cuenta como actividad */
    var ultimo = leerActiv() || ahora;
    var inactivo = ahora - ultimo;
    if (inactivo >= INACT_MS) { salir(); return; }
    if (!barra || !document.getElementById('caja-sb')) { crear(); ultimaFirma = null; }
    var firma = u.username + '|' + (u.nombre || '') + '|' + (u.rol || '');
    if (firma !== ultimaFirma) {
      var nombre = u.nombre || '';
      if (String(nombre).toUpperCase() === String(u.username).toUpperCase()) nombre = '';
      barra.querySelector('.sb-user').textContent = String(u.username).toUpperCase();
      barra.querySelector('.sb-nom').textContent = nombre;
      barra.querySelector('.sb-nom').style.display = nombre ? '' : 'none';
      barra.querySelector('.sb-sep').style.display = nombre ? '' : 'none';
      barra.querySelector('.sb-rol').textContent = capital(u.rol);
      barra.title = 'Sesión de Caja abierta de ' + u.username + ' · se cierra tras ' + INACTIVIDAD_MIN + ' min sin actividad';
      ultimaFirma = firma;
    }
    var resta = Math.ceil((INACT_MS - inactivo) / 1000), info = barra.querySelector('.sb-info');
    if (resta <= AVISO_SEG) {
      barra.classList.add('sb-aviso');
      info.textContent = 'Se cierra por inactividad en ' + Math.floor(resta / 60) + ':' + ('0' + (resta % 60)).slice(-2) + ' · tocá la pantalla para seguir';
    } else { barra.classList.remove('sb-aviso'); info.textContent = ''; }
  }

  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) {
    window.addEventListener(ev, function () { if (activa()) { var av = !!(barra && barra.classList.contains('sb-aviso')); ping(av); if (av) sincronizar(); } }, { passive: true, capture: true });
  });
  window.addEventListener('scroll', function () { if (activa()) ping(false); }, { passive: true, capture: true });
  window.addEventListener('storage', function (e) { if (e.key === KEY_ACTIV) sincronizar(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sincronizar(); });
  window.addEventListener('pageshow', sincronizar);

  function iniciar() { sincronizar(); setInterval(sincronizar, 1000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  window.__cajaSesionBarraTest = { sincronizar: sincronizar, INACT_MS: INACT_MS };
})();
