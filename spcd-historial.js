/* ============================================================
   spcd-historial.js · La flecha «atrás» vuelve a la pestaña anterior
   ------------------------------------------------------------
   Cada cambio de pestaña deja un paso en el historial del navegador
   (#pestaña en la URL). Así la flecha atrás del navegador (y los
   botones «← Atrás» que usan history.back) recorren las pestañas en
   orden antes de salir de la página, sin saltear pasos.

   Uso en una página:
     SpcdHistorial.pestanas({
       actual:  function () { return 'id-de-la-pestaña-activa'; },
       aplicar: function (id) { ...mostrar esa pestaña SIN volver a registrar... },
       validas: ['a', 'b', 'c']          // opcional: ids aceptados desde la URL
     });
     ...y cada vez que el usuario cambia de pestaña:
     SpcdHistorial.registrar(id);

   No se usa en páginas que ya manejan su propio hash (imagenes,
   cronograma) ni en operativo/personal (tienen su historial propio).
   ============================================================ */
(function () {
  'use strict';
  if (window.SpcdHistorial) return;

  var KEY = 'spcdPestana';
  var cfg = null;
  var aplicando = false;

  function hashActual() {
    try { return decodeURIComponent(String(location.hash || '').replace(/^#/, '')); } catch (e) { return ''; }
  }
  function valida(v) {
    if (!v) return false;
    if (cfg && cfg.validas && cfg.validas.indexOf(v) < 0) return false;
    return true;
  }
  function estadoCon(v) {
    var s = {};
    try { var st = history.state; if (st && typeof st === 'object') for (var k in st) s[k] = st[k]; } catch (e) {}
    s[KEY] = v;
    return s;
  }
  function url(v) { return location.pathname + location.search + '#' + encodeURIComponent(v); }

  function registrar(v) {
    if (aplicando || !cfg || !valida(v)) return;
    try {
      var st = history.state;
      if (st && st[KEY] === v) return;
      history.pushState(estadoCon(v), '', url(v));
    } catch (e) {}
  }

  /* clic real del usuario → paso nuevo; cambio hecho por la página (al cargar, filtros) → corrige el paso actual */
  function cambio(v) {
    var ev = window.event;
    if (ev && ev.isTrusted && (ev.type === 'click' || ev.type === 'keydown' || ev.type === 'pointerup')) { registrar(v); return; }
    if (aplicando || !cfg || !valida(v)) return;
    try { history.replaceState(estadoCon(v), '', url(v)); } catch (e) {}
  }

  function aplicar(v) {
    if (!cfg || !valida(v)) return;
    var hoy = null;
    try { hoy = cfg.actual(); } catch (e) {}
    if (hoy === v) return;
    aplicando = true;
    try { cfg.aplicar(v); } catch (e) { console.warn('[spcd-historial]', e); }
    finally { aplicando = false; }
  }

  function pestanas(c) {
    cfg = c;
    var inicial = null;
    try { inicial = cfg.actual(); } catch (e) {}
    /* si la URL trae la respuesta de Microsoft (#access_token / #error) no se toca: la lee Supabase */
    if (/access_token=|error_description=|[?&#]code=/.test(location.href)) {
      window.addEventListener('popstate', function (e) { var v = e.state && e.state[KEY]; if (valida(v)) aplicar(v); });
      return;
    }
    var desdeUrl = hashActual();
    if (valida(desdeUrl) && desdeUrl !== inicial) {
      aplicar(desdeUrl);
      inicial = desdeUrl;
    }
    /* el primer paso queda anotado, así «atrás» desde la 2.ª pestaña vuelve a esta */
    if (valida(inicial)) {
      try { history.replaceState(estadoCon(inicial), '', url(inicial)); } catch (e) {}
    }
    window.addEventListener('popstate', function (e) {
      var v = e.state && e.state[KEY];
      if (!valida(v)) v = valida(hashActual()) ? hashActual() : inicial;
      aplicar(v);
    });
  }

  /* «← Atrás» de las páginas: vuelve a donde estaba si vino de Lumen; si no, al destino fijo */
  function volver(destino) {
    try {
      var ref = document.referrer || '';
      if (ref && ref.indexOf(location.origin) === 0 && history.length > 1) { history.back(); return false; }
    } catch (e) {}
    location.href = destino || 'app.html?screen=roles';
    return false;
  }

  window.SpcdHistorial = { pestanas: pestanas, registrar: registrar, cambio: cambio, volver: volver };
})();
