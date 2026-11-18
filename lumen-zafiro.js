/* Lumen · estilo Zafiro Lumen (opt-in).
   Sin ?estilo=zafiro (o sin la preferencia guardada) este archivo no toca nada.
   - ?estilo=zafiro  → activa y recuerda (localStorage 'lumen-ui')
   - ?estilo=clasico → vuelve al estilo de siempre
   Solo se aplica fuera de la pantalla de ingreso (ahí queda la luciérnaga ámbar). */
(function () {
  'use strict';
  var KUI = 'lumen-ui', KT = 'lumen-ui-tema', KFX = 'lumen-ui-fx';
  var root = document.documentElement;

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) {}
    return null;
  }

  try {
    var q = new URLSearchParams(location.search).get('estilo');
    if (q === 'zafiro') ls(KUI, 'zafiro');
    else if (q === 'clasico') ls(KUI, null);
  } catch (e) {}

  var enabled = ls(KUI) === 'zafiro';
  if (!enabled) return;

  /* ---- Estado ---- */
  var tema = ls(KT);
  if (tema !== 'light' && tema !== 'dark') {
    tema = (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  /* Páginas de módulo que todavía no tienen tema claro lo declaran: <meta name="lumen-zafiro" content="oscuro"> */
  function soloOscuro() {
    var m = document.querySelector('meta[name="lumen-zafiro"]');
    return !!(m && m.getAttribute('content') === 'oscuro');
  }
  /* Páginas que manejan su propio tema (data-tema claro|oscuro), como Caja: <meta name="lumen-zafiro-tema" content="propio">.
     Zafiro no toca ese atributo y solo se enciende mientras la página está en su modo oscuro. */
  function temaPropio() {
    var m = document.querySelector('meta[name="lumen-zafiro-tema"]');
    return !!(m && m.getAttribute('content') === 'propio');
  }
  var fxPref = ls(KFX);
  function autoFx() {
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var cores = navigator.hardwareConcurrency || 8;
    var mem = navigator.deviceMemory || 8;
    return !(reduce || cores <= 4 || mem <= 4);
  }
  var fx = fxPref === 'on' ? true : fxPref === 'off' ? false : autoFx();

  var ctl = null, btnTema = null, btnFx = null, fontLoaded = false;

  function loadFont() {
    if (fontLoaded) return;
    fontLoaded = true;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap';
    document.head.appendChild(l);
  }

  var ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';

  function buildCtl() {
    if (ctl) return;
    ctl = document.createElement('div');
    ctl.className = 'zctl';
    ctl.setAttribute('role', 'group');
    ctl.setAttribute('aria-label', 'Estilo de la interfaz');
    ctl.hidden = true;

    btnTema = document.createElement('button');
    btnTema.type = 'button';
    btnTema.addEventListener('click', function () {
      tema = tema === 'light' ? 'dark' : 'light';
      ls(KT, tema);
      apply();
    });

    btnFx = document.createElement('button');
    btnFx.type = 'button';
    btnFx.setAttribute('role', 'switch');
    btnFx.innerHTML = '<span class="zsw" aria-hidden="true"></span><span class="zl">Efectos</span>';
    btnFx.addEventListener('click', function () {
      fx = !fx;
      ls(KFX, fx ? 'on' : 'off');
      apply();
    });

    var btnOld = document.createElement('button');
    btnOld.type = 'button';
    btnOld.setAttribute('aria-label', 'Volver al estilo clásico');
    btnOld.title = 'Volver al estilo clásico';
    btnOld.innerHTML = ICON_BACK + '<span class="zl">Clásico</span>';
    btnOld.addEventListener('click', function () {
      enabled = false;
      ls(KUI, null);
      /* En páginas de módulo el fondo animado clásico se arma al cargar: hay que recargar. */
      if (root.getAttribute('data-z-pagina') === 'modulo') {
        var u = new URL(location.href); u.searchParams.set('estilo', 'clasico'); location.replace(u.toString()); return;
      }
      apply();
      if (typeof window.showToast === 'function') {
        window.showToast('Estilo clásico. Para volver al nuevo: agregá ?estilo=zafiro a la dirección.', 'info');
      }
    });

    ctl.appendChild(btnTema);
    ctl.appendChild(btnFx);
    ctl.appendChild(btnOld);
    document.body.appendChild(ctl);
  }

  function paintCtl() {
    if (!ctl) return;
    btnTema.hidden = soloOscuro();
    var toLight = tema === 'dark';
    btnTema.innerHTML = (toLight ? ICON_SUN : ICON_MOON) + '<span class="zl">' + (toLight ? 'Claro' : 'Oscuro') + '</span>';
    btnTema.setAttribute('aria-label', toLight ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    btnTema.title = toLight ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    btnFx.setAttribute('aria-checked', fx ? 'true' : 'false');
    btnFx.title = fx ? 'Apagar efectos (más liviano)' : 'Encender efectos';
  }

  /* ---- Aplicar atributos según pantalla ---- */
  function pantalla() {
    var a = document.querySelector('.screen.active');
    return a ? a.id : '';
  }

  function apply() {
    var id = pantalla();
    var conPantallas = !!document.querySelector('.screen');
    var propio = temaPropio();
    var on = enabled && (conPantallas ? (id && id !== 'screen-login' && id !== 'screen-inicio') : true);
    if (propio && root.getAttribute('data-tema') !== 'oscuro') on = false;
    var temaVigente = soloOscuro() ? 'dark' : tema;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (on) {
      root.setAttribute('data-ui', 'zafiro');
      if (!propio) root.setAttribute('data-tema', temaVigente);
      root.setAttribute('data-fx', fx ? 'on' : 'off');
      if (!conPantallas) root.setAttribute('data-z-pagina', 'modulo');
      loadFont();
      buildCtl();
      paintCtl();
      if (ctl) ctl.hidden = false;
      if (meta) {
        if (!meta.hasAttribute('data-orig')) meta.setAttribute('data-orig', meta.getAttribute('content') || '');
        meta.setAttribute('content', temaVigente === 'light' ? '#DFE7F7' : '#070D1F');
      }
    } else {
      root.removeAttribute('data-ui');
      if (!propio) root.removeAttribute('data-tema');
      root.removeAttribute('data-fx');
      root.removeAttribute('data-z-pagina');
      if (ctl) ctl.hidden = true;
      if (meta && meta.hasAttribute('data-orig')) meta.setAttribute('content', meta.getAttribute('data-orig'));
    }
  }

  /* ---- Brillo que sigue al cursor (solo con efectos) ---- */
  var raf = 0, px = 0, py = 0, pt = null;
  document.addEventListener('pointermove', function (e) {
    if (root.getAttribute('data-fx') !== 'on' || e.pointerType === 'touch') return;
    var t = e.target && e.target.closest ? e.target.closest('.mod-fila,.sede-hero,.sede-btn,.upload-zone') : null;
    if (!t) return;
    pt = t; px = e.clientX; py = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var r = pt.getBoundingClientRect();
      pt.style.setProperty('--mx', (px - r.left) + 'px');
      pt.style.setProperty('--my', (py - r.top) + 'px');
    });
  }, { passive: true });

  /* ---- Buscador de módulos / sedes (Ctrl o ⌘ + K) ---- */
  var dlg = null, inp = null, lst = null, rows = [], act = 0, prevFocus = null;

  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function txt(el, sel) { var n = el.querySelector(sel); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; }

  function collect() {
    var id = pantalla(), out = [];
    var nodes, i, el;
    if (id === 'screen-roles') {
      nodes = document.querySelectorAll('#roles-grid .mod-fila:not(.inerte):not(.cab)');
      for (i = 0; i < nodes.length; i++) {
        el = nodes[i];
        out.push({ el: el, name: txt(el, '.mod-nombre').replace(/Solo lectura/i, '').trim(), sub: txt(el, '.mod-desc') });
      }
    } else if (id === 'screen-sedes') {
      nodes = document.querySelectorAll('#sedes-grid .sede-hero, #sedes-grid .sede-btn');
      for (i = 0; i < nodes.length; i++) {
        el = nodes[i];
        out.push({ el: el, name: txt(el, '.sede-hero-name') || txt(el, '.sede-name'), sub: txt(el, '.sede-hero-sub') || txt(el, '.sede-type') });
      }
    }
    return out;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var all = [];
  function draw() {
    var q = norm(inp.value.trim());
    rows = all.filter(function (r) { return !q || norm(r.name + ' ' + r.sub).indexOf(q) > -1; });
    if (act >= rows.length) act = 0;
    if (rows.length) {
      lst.innerHTML = rows.map(function (r, i) {
        return '<li role="option" id="zc-' + i + '" data-i="' + i + '" aria-selected="' + (i === act) + '">' + esc(r.name) + '<small>' + esc(r.sub) + '</small></li>';
      }).join('');
      inp.setAttribute('aria-activedescendant', 'zc-' + act);
    } else {
      lst.innerHTML = '<li class="zcmd-none" role="presentation">No hay coincidencias</li>';
      inp.removeAttribute('aria-activedescendant');
    }
  }

  function go(i) {
    var r = rows[i];
    if (!r) return;
    closeCmd(false);
    r.el.click();
  }

  function closeCmd(restore) {
    if (dlg && dlg.open) dlg.close();
    if (restore !== false && prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} }
  }

  function build() {
    if (dlg) return;
    dlg = document.createElement('dialog');
    dlg.className = 'zcmd';
    dlg.setAttribute('aria-label', 'Ir a un módulo');
    dlg.innerHTML = '<div class="zcmd-in"><input type="text" role="combobox" aria-expanded="true" aria-controls="zcl" aria-autocomplete="list" aria-label="Buscar módulo" placeholder="Buscar módulo…" autocomplete="off"><kbd>Esc</kbd></div><ul id="zcl" role="listbox"></ul>';
    document.body.appendChild(dlg);
    inp = dlg.querySelector('input');
    lst = dlg.querySelector('ul');
    inp.addEventListener('input', function () { act = 0; draw(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!rows.length) return;
        act = (act + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        draw();
        var o = document.getElementById('zc-' + act);
        if (o && o.scrollIntoView) o.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        go(act);
      }
    });
    lst.addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('li[data-i]') : null;
      if (li) go(+li.getAttribute('data-i'));
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeCmd(); });
  }

  function openCmd() {
    if (typeof HTMLDialogElement === 'undefined') return;
    all = collect();
    if (!all.length) return;
    build();
    prevFocus = document.activeElement;
    inp.value = ''; act = 0; draw();
    if (!dlg.open) dlg.showModal();
    inp.focus();
  }

  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || String(e.key).toLowerCase() !== 'k') return;
    if (root.getAttribute('data-ui') !== 'zafiro') return;
    e.preventDefault();
    if (dlg && dlg.open) closeCmd(); else openCmd();
  });

  /* ---- Arranque: seguir los cambios de pantalla ---- */
  function start() {
    var screens = document.querySelectorAll('.screen');
    var mo = new MutationObserver(apply);
    for (var i = 0; i < screens.length; i++) mo.observe(screens[i], { attributes: true, attributeFilter: ['class'] });
    if (temaPropio()) new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-tema'] });
    apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.lumenZafiro = { get activo() { return enabled; } };
})();
