// ==UserScript==
// @name         PAMI OME - Copiar datos con un clic
// @namespace    lumen.santipitre
// @version      3.4.0
// @description  1 clic en el N Turno de la conciliacion busca en FUESMEN + PAMI a la vez (PAMI SIEMPRE por Nro. Documento/DNI, en Prestaciones y Aceptacion). Ademas copiar N Orden/Beneficiario/DNI y Pegar en QR.
// @author       Santiago
// @include      https://santipitre.github.io/lumen/*
// @include      http*://his.fuesmen.edu.ar*/*
// @include      https://pe.pami.org.ar/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @downloadURL  https://santipitre.github.io/lumen/pami-ome.user.js
// @updateURL    https://santipitre.github.io/lumen/pami-ome.user.js
// ==/UserScript==

(function () {
  'use strict';

  var host = location.host;
  var isConc = host.indexOf('santipitre.github.io') > -1;
  var isFuesmen = host.indexOf('fuesmen.edu.ar') > -1;
  var isPami = host.indexOf('pe.pami.org.ar') > -1;
  var isTx = isPami && location.pathname.indexOf('transmision') > -1;   // Panel de prestaciones
  var isEf = isPami && location.pathname.indexOf('efector') > -1;       // Panel de aceptacion

  function norm(s) {
    return (s || '')
      .replace(/ /g, ' ')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  }
  function digits(s) { return (s || '').replace(/\D/g, ''); }

  /* ── Toast ── */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      var s = toastEl.style;
      s.position = 'fixed'; s.bottom = '52px'; s.left = '50%'; s.transform = 'translateX(-50%)';
      s.background = '#0c1420'; s.color = '#e6edf3'; s.border = '1px solid #10B981';
      s.borderRadius = '10px'; s.padding = '11px 18px'; s.fontSize = '14px';
      s.fontFamily = 'system-ui,sans-serif'; s.zIndex = '2147483647';
      s.boxShadow = '0 8px 30px rgba(0,0,0,.4)'; s.opacity = '0';
      s.transition = 'opacity .18s'; s.pointerEvents = 'none'; s.maxWidth = '80vw';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, 2200);
  }

  var badge = null;
  function setBadge(txt) {
    if (!badge) {
      badge = document.createElement('div');
      var s = badge.style;
      s.position = 'fixed'; s.bottom = '12px'; s.right = '12px';
      s.background = '#0c1420'; s.color = '#e6edf3'; s.border = '1px solid #f59e0b';
      s.borderRadius = '8px'; s.padding = '7px 12px'; s.fontSize = '12px';
      s.fontFamily = 'system-ui,sans-serif'; s.zIndex = '2147483647';
      s.boxShadow = '0 4px 16px rgba(0,0,0,.4)'; s.opacity = '.92';
      document.body.appendChild(badge);
    }
    badge.textContent = txt;
  }

  function flash(el, color) {
    if (!el) return;
    var prev = el.style.background;
    el.style.transition = 'background .15s';
    el.style.background = color || 'rgba(16,185,129,.35)';
    setTimeout(function () { el.style.background = prev || ''; }, 400);
  }

  function setVal(inp, v) {
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function waitFor(sel, cb, label) {
    var t = 0, iv = setInterval(function () {
      var el = document.querySelector(sel);
      if (el) { clearInterval(iv); cb(el); }
      else if ((t += 120) > 5000) { clearInterval(iv); toast('No encontre ' + (label || sel)); }
    }, 120);
  }

  /* ══════════ CANAL ENTRE PESTAÑAS (Tampermonkey GM) ══════════ */
  function enviarSalto(turno, afiliado, dni) {
    GM_setValue('lumen_jump', JSON.stringify({ turno: turno, afiliado: afiliado, dni: dni, ts: Date.now() }));
  }

  GM_addValueChangeListener('lumen_jump', function (name, oldv, newv) {
    var d;
    try { d = JSON.parse(newv); } catch (e) { return; }
    if (!d) return;
    if (isFuesmen && d.turno) buscarFuesmen(d.turno);
    if (isPami && (d.afiliado || d.dni)) rutaPami(d);
  });

  /* Siempre empezar por Prestaciones (transmision). Si la pestaña esta en efector, ir primero a transmision. */
  function rutaPami(d) {
    if (isTx) { buscarPami(d); return; }
    try { sessionStorage.setItem('lumen_pending', JSON.stringify({ afiliado: d.afiliado || '', dni: d.dni || '', ts: Date.now() })); } catch (e) {}
    toast('Voy a Prestaciones primero...');
    setTimeout(function () { location.href = 'https://pe.pami.org.ar/controllers/transmision.php'; }, 400);
  }
  /* En transmision: si venimos ruteados desde otra pagina, buscar aca */
  function consumirPending() {
    var raw; try { raw = sessionStorage.getItem('lumen_pending'); } catch (e) { return; }
    if (!raw) return;
    var d; try { d = JSON.parse(raw); } catch (e) { try { sessionStorage.removeItem('lumen_pending'); } catch (e2) {} return; }
    try { sessionStorage.removeItem('lumen_pending'); } catch (e) {}
    if (!d || Date.now() - (d.ts || 0) > 60000) return;
    buscarPami(d);
  }

  /* ── FUESMEN: rellenar N Turno y BUSCAR ── */
  function buscarFuesmen(turno) {
    waitFor('#_TURNOID', function (inp) {
      inp.focus();
      setVal(inp, turno);
      inp.dispatchEvent(new Event('blur', { bubbles: true }));
      setTimeout(function () {
        var btn = document.querySelector('input[name="BUTTON7"]');
        if (btn) { btn.click(); toast('FUESMEN: buscando turno ' + turno); }
        else {
          inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          toast('FUESMEN: enter en turno ' + turno);
        }
      }, 90);
    }, 'campo turno (#_TURNOID)');
  }

  /* ── PAMI: rellenar afiliado y BUSCAR ── */
  function botonPorTexto(root, txt) {
    var t = norm(txt);
    var cands = (root || document).querySelectorAll('input[type=submit],input[type=button],button,a');
    for (var i = 0; i < cands.length; i++) {
      var v = norm(cands[i].value || cands[i].textContent);
      if (v === t) return cands[i];
    }
    return null;
  }
  function botonBuscarPorTexto() { return botonPorTexto(document, 'BUSCAR'); }

  /* ── FUESMEN: modal "N° Referencia" → botón PEGAR (pega + ACEPTAR) ── */
  function decorarReferencia() {
    if (!isFuesmen) return;
    var cont = tightest(document.body, 'REFERENCIA', true);
    if (!cont || cont.dataset.pegarRefBound) return;
    var inp = cont.querySelector('input[type=text],input:not([type]),input[type=number]');
    if (!inp) return;
    cont.dataset.pegarRefBound = '1';
    var b = chip('⇩ Pegar N° Referencia', 'Pega el número y aprieta Aceptar', '#10B981', true);
    b.style.color = '#04120c'; b.style.display = 'block'; b.style.marginTop = '10px';
    b.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      function poner(v) {
        v = (v || '').trim();
        if (!v) { toast('Nada para pegar (copiá el N° con un botón de Lumen)'); return; }
        inp.focus(); setVal(inp, v); inp.dispatchEvent(new Event('blur', { bubbles: true }));
        setTimeout(function () {
          var acc = botonPorTexto(cont, 'ACEPTAR') || botonPorTexto(document, 'ACEPTAR');
          if (acc) { acc.click(); toast('Referencia ' + v + ' → Aceptar'); }
          else toast('No encontre el botón ACEPTAR');
        }, 120);
      }
      var guardado = ''; try { guardado = GM_getValue('lumen_clip', ''); } catch (e) {}
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (t) { poner(t && t.trim() ? t : guardado); }).catch(function () { poner(guardado); });
      } else { poner(guardado); }
    });
    if (inp.parentNode) inp.parentNode.insertBefore(b, inp.nextSibling);
  }

  /* Rellena tipo (1=Afiliado, 2=Documento) + numero y aprieta Buscar. Sirve en transmision y efector. */
  function fillBuscar(tipo, numero, etiqueta) {
    waitFor('select[name="tipo_afiliado"], input[name="n_afiliado"]', function () {
      var sel = document.querySelector('select[name="tipo_afiliado"]');
      var inp = document.querySelector('input[name="n_afiliado"]');
      if (!inp && sel) inp = inputCercano(sel.parentElement);
      if (sel) { sel.value = tipo; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      if (!inp) { toast('PAMI: no encontre el campo de numero'); return; }
      // Prestaciones arranca con Fecha turno desde/hasta = HOY -> ampliar a todo el año para no perder turnos
      if (isTx) {
        var y = new Date().getFullYear();
        var fd = document.getElementById('f_turno_desde') || document.querySelector('input[name="f_turno_desde"]');
        var fh = document.getElementById('f_turno_hasta') || document.querySelector('input[name="f_turno_hasta"]');
        if (fd) setVal(fd, '01/01/' + y);
        if (fh) setVal(fh, '31/12/' + y);
      }
      inp.focus();
      setVal(inp, numero);
      inp.dispatchEvent(new Event('blur', { bubbles: true }));
      setTimeout(function () {
        var btn = document.querySelector('input[name="buscar"]') || botonBuscarPorTexto();
        if (btn) { btn.click(); toast('PAMI: buscando ' + (etiqueta || '') + numero); }
        else toast('PAMI: no encontre boton Buscar');
      }, 140);
    }, 'campo afiliado/tipo');
  }

  function buscarPami(d) {
    var afil = (d && d.afiliado) || '', dni = (d && d.dni) || '';
    // SIEMPRE buscar por Nro. Documento (tipo 2) con el DNI, en Prestaciones y en Aceptacion.
    // Solo si la fila no trae DNI se cae al afiliado, para que el clic igual haga algo.
    var usarDni = !!dni;
    var tipo = usarDni ? '2' : '1';
    var numero = usarDni ? dni : afil;
    if (!numero) { toast('PAMI: fila sin DNI ni afiliado'); return; }
    // El afiliado se guarda igual para precargar el popup Generar QR (12+2), aunque busquemos por DNI
    if (afil) { try { sessionStorage.setItem('lumen_qr_afil', JSON.stringify({ d: afil, ts: Date.now() })); } catch (e) {} }
    // Si estamos en Prestaciones, dejamos marca para saltar a Aceptacion si no hay resultados (hereda tipo+numero)
    if (isTx) { try { sessionStorage.setItem('lumen_tx', JSON.stringify({ tipo: tipo, numero: numero, ts: Date.now() })); } catch (e) {} }
    fillBuscar(tipo, numero, usarDni ? 'DNI ' : 'afiliado ');
    if (isTx) setTimeout(chequearVacioTx, 1200);  // por si la busqueda es AJAX (sin recarga)
  }

  /* Si Prestaciones no arrojo resultados, guarda para efector y redirige la pestaña */
  function chequearVacioTx() {
    var raw; try { raw = sessionStorage.getItem('lumen_tx'); } catch (e) { return; }
    if (!raw) return;
    var d; try { d = JSON.parse(raw); } catch (e) { try { sessionStorage.removeItem('lumen_tx'); } catch (e2) {} return; }
    if (!d || Date.now() - (d.ts || 0) > 60000) { try { sessionStorage.removeItem('lumen_tx'); } catch (e) {} return; }
    var t = 0, iv = setInterval(function () {
      var vacio = norm(document.body.textContent).indexOf('NO ARROJO NINGUN RESULTADO') > -1;
      if (vacio) {
        clearInterval(iv);
        try { sessionStorage.removeItem('lumen_tx'); sessionStorage.setItem('lumen_ef', JSON.stringify({ tipo: d.tipo, numero: d.numero, ts: Date.now() })); } catch (e) {}
        toast('Sin resultados en Prestaciones -> voy a Aceptacion');
        setTimeout(function () { location.href = 'https://pe.pami.org.ar/controllers/efector.php'; }, 700);
      } else if ((t += 300) > 6000) {
        clearInterval(iv); try { sessionStorage.removeItem('lumen_tx'); } catch (e) {}   // hay resultados: nada que hacer
      }
    }, 300);
  }

  /* En efector: si venimos redirigidos, buscar el mismo numero */
  function consumirEfector() {
    var raw; try { raw = sessionStorage.getItem('lumen_ef'); } catch (e) { return; }
    if (!raw) return;
    var d; try { d = JSON.parse(raw); } catch (e) { try { sessionStorage.removeItem('lumen_ef'); } catch (e2) {} return; }
    try { sessionStorage.removeItem('lumen_ef'); } catch (e) {}
    if (!d || Date.now() - (d.ts || 0) > 60000) return;
    fillBuscar(d.tipo, d.numero, 'en Aceptacion ');
  }

  /* ══════════ EFECTOR: quien acepto cada orden (via fetch al JSON, SIN abrir el historial) ══════════ */
  /* Se marcan en ROJO solo las aceptadas por estos usuarios.
     2026-09-10: la lista salio del codigo porque este repo es PUBLICO. Vive en el
     almacenamiento de Tampermonkey (GM), no en el archivo. Vacia = no marca nada en rojo.
     Dos formas de cargarla, una sola vez:
       a) Tampermonkey -> este script -> pestana Almacenamiento -> clave
          lumen_target_users  con valor  ["NOMBRE APELLIDO","OTRO NOMBRE"]
       b) consola de DevTools en una pestana de PAMI:
          LumenOME.setUsuarios(['NOMBRE APELLIDO','OTRO NOMBRE'])
     LumenOME.usuarios() muestra la lista actual. */
  var TARGET_USERS = (function () {
    try { var v = GM_getValue('lumen_target_users', ''); if (v) return JSON.parse(v); } catch (e) {}
    return [];
  })();
  var HIST_URL = '/controllers/ajax/efectores_detalle.php';
  function esUsuarioObjetivo(nombre) {
    var n = norm(nombre);
    for (var i = 0; i < TARGET_USERS.length; i++) { if (n.indexOf(norm(TARGET_USERS[i])) > -1) return true; }
    return false;
  }
  function celdaPractica(tr) {
    var tb = tr.closest('table'); if (!tb) return null;
    var head = null, r;
    for (r = 0; r < tb.rows.length; r++) { if (tb.rows[r].querySelector('th')) { head = tb.rows[r]; break; } }
    if (!head) return null;
    var hs = [].map.call(head.cells, function (c) { return norm(c.textContent); });
    for (var j = 0; j < hs.length; j++) { if (hs[j].indexOf('PRACTICA') > -1) return tr.cells[j] || null; }
    return null;
  }
  function marcarFila(btn, nombre, cprof, fecha) {
    var tr = btn.closest('tr'); if (!tr) return;
    if (tr.querySelector('.lumen-user')) return;
    if (!esUsuarioObjetivo(nombre)) return;   // el resto se deja como esta (no se oculta)
    tr.style.background = 'rgba(220,53,69,.12)';
    [].forEach.call(tr.cells, function (c) { c.style.color = '#b02a37'; });
    var badge = document.createElement('span');
    badge.className = 'lumen-user';
    badge.textContent = '👤 ' + nombre + (fecha ? ' · ' + fecha : '');
    badge.title = (cprof ? cprof + ' - ' : '') + nombre + (fecha ? ' (aceptada ' + fecha + ')' : '');
    badge.style.cssText = 'margin-left:6px;font-size:11px;font-weight:800;color:#fff;background:#dc3545;border-radius:6px;padding:2px 7px;display:inline-block';
    var cell = celdaPractica(tr) || tr.cells[tr.cells.length - 1];
    cell.appendChild(badge);
  }
  function procesarHistorialFetch() {
    if (!isEf) return;
    var btns = [].slice.call(document.querySelectorAll('i.boton-historial')).filter(function (b) { return !b.dataset.lumenDone; });
    btns.forEach(function (b) {
      b.dataset.lumenDone = '1';
      var orden = b.getAttribute('data-orden') || '', bene = b.getAttribute('data-bene') || '',
          gp = b.getAttribute('data-gp') || '', estado = b.getAttribute('data-estado') || 'info';
      if (!orden) return;
      var body = 'orden=' + encodeURIComponent(orden) + '&estado=' + encodeURIComponent(estado) +
                 '&bene=' + encodeURIComponent(bene) + '&gp=' + encodeURIComponent(gp);
      fetch(HIST_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }, body: body, credentials: 'include' })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          var data; try { data = JSON.parse(t); } catch (e) { return; }
          var hist = (data && data.historial) || [];
          var acc = null;
          for (var i = 0; i < hist.length; i++) { if (/ACEPTAD/i.test(hist[i].estado || '')) { acc = hist[i]; break; } }
          if (!acc) return;
          var nombre = ((acc.nombre || '') + ' ' + (acc.apellido || '')).replace(/\s+/g, ' ').trim();
          // fecha del turno (recuadro Prescripcion > Fecha): prescripcion[].agenda[].f_agenda
          var fecha = '';
          var pres = (data && data.prescripcion) || [];
          for (var p = 0; p < pres.length && !fecha; p++) {
            var ag = (pres[p] && pres[p].agenda) || [];
            for (var a = 0; a < ag.length && !fecha; a++) { if (ag[a] && ag[a].f_agenda) fecha = String(ag[a].f_agenda).slice(0, 10); }
          }
          marcarFila(b, nombre, acc.c_profesional || '', fecha);
        })
        .catch(function () {});
    });
  }

  /* ══════════ CONCILIACION: 1 clic en N Turno dispara ambos ══════════ */
  function concCols(table) {
    var head = null, i;
    for (i = 0; i < table.rows.length; i++) { if (table.rows[i].querySelector('th')) { head = table.rows[i]; break; } }
    if (!head) return null;
    var hs = [].map.call(head.cells, function (c) { return norm(c.textContent); });
    var ti = -1, ai = -1, di = -1;
    for (i = 0; i < hs.length; i++) {
      if (ti < 0 && hs[i].indexOf('TURNO') > -1) ti = i;
      if (ai < 0 && hs[i].indexOf('AFILIADO') > -1) ai = i;
      if (di < 0 && hs[i].indexOf('DNI') > -1) di = i;
    }
    return { t: ti, a: ai, d: di };
  }

  function initConciliacion() {
    setBadge('Lumen: 1 clic en N Turno → busca en FUESMEN + PAMI');
    document.addEventListener('click', function (ev) {
      var cell = ev.target.closest ? ev.target.closest('td') : null;
      if (!cell) return;
      var table = cell.closest('table'); if (!table) return;
      var cols = concCols(table); if (!cols || cols.t < 0) return;
      if (cell.cellIndex !== cols.t) return;
      var row = cell.parentElement;
      var turno = digits(cell.textContent);
      var afil = (cols.a >= 0 && row.cells[cols.a]) ? digits(row.cells[cols.a].textContent) : '';
      var dni = (cols.d >= 0 && row.cells[cols.d]) ? digits(row.cells[cols.d].textContent) : '';
      if (!turno && !afil && !dni) return;
      enviarSalto(turno, afil, dni);
      flash(cell);
      toast('FUESMEN turno ' + (turno || '-') + (dni ? (' | PAMI DNI ' + dni) : (afil ? (' | PAMI afiliado ' + afil) : ' | (sin DNI/afil)')));
    }, true);
  }

  /* ══════════ PAMI: features de copiar/pegar (existentes) ══════════ */
  var TARGETS = [
    { label: 'N Orden',        match: function (t) { return t.indexOf('ORDEN') > -1 && t.indexOf('NRO') > -1; } },
    { label: 'N Beneficiario', match: function (t) { return t.indexOf('BENEFIC') > -1; } }
  ];
  function copiar(txt, label, flashEl) {
    try { GM_setValue('lumen_clip', String(txt)); } catch (e) {}   // para el Pegar de FUESMEN (http no lee portapapeles)
    function done() { toast('OK ' + label + ' copiado: ' + txt); flash(flashEl); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove(); done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(fallback);
    } else { fallback(); }
  }
  function decorarCelda(cell, label) {
    if (cell.dataset.copiarBound) return;
    cell.dataset.copiarBound = '1';
    cell.style.cursor = 'pointer'; cell.style.color = '#1d4ed8';
    cell.style.fontWeight = '600'; cell.style.textDecoration = 'underline dotted';
    cell.title = 'Clic para copiar ' + label;
    var ico = document.createElement('span'); ico.textContent = ' ⧉'; ico.style.opacity = '.7';
    cell.appendChild(ico);
    cell.addEventListener('mouseenter', function () { cell.style.background = 'rgba(245,158,11,.18)'; });
    cell.addEventListener('mouseleave', function () { cell.style.background = ''; });
    cell.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var val = (cell.textContent || '').replace(/ /g, ' ').replace(/⧉/g, '').trim();
      if (val) copiar(val, label, cell); else toast('Celda vacia');
    });
  }
  function procesarTabla(table) {
    var rows = table.rows; if (!rows || !rows.length) return;
    var headerRow = null, i;
    for (i = 0; i < rows.length; i++) { if (rows[i].querySelector('th')) { headerRow = rows[i]; break; } }
    if (!headerRow) headerRow = rows[0];
    var heads = [].map.call(headerRow.cells, function (c) { return norm(c.textContent); });
    var colIndex = TARGETS.map(function (t) {
      for (var j = 0; j < heads.length; j++) { if (t.match(heads[j])) return j; }
      return -1;
    });
    if (!colIndex.some(function (x) { return x >= 0; })) return;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r === headerRow || r.querySelector('th')) continue;
      colIndex.forEach(function (ci, k) {
        if (ci < 0 || ci >= r.cells.length) return;
        decorarCelda(r.cells[ci], TARGETS[k].label);
      });
    }
  }
  function chip(txt, title, bg, big) {
    var b = document.createElement('span'); b.textContent = txt;
    var s = b.style;
    s.cursor = 'pointer'; s.color = '#fff'; s.fontWeight = '700';
    s.userSelect = 'none'; s.verticalAlign = 'middle'; s.background = bg;
    s.borderRadius = '6px'; s.fontFamily = 'system-ui,sans-serif';
    if (big) { s.display = 'inline-block'; s.fontSize = '14px'; s.padding = '7px 14px'; s.margin = '8px 0'; }
    else { s.display = 'inline-block'; s.fontSize = '12px'; s.padding = '3px 8px'; s.marginLeft = '6px'; }
    b.title = title; return b;
  }
  function tightest(root, needle, requireInput) {
    var best = null, bc = Infinity, els = root.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (norm(el.textContent).indexOf(needle) === -1) continue;
      if (requireInput && !el.querySelector('input')) continue;
      var c = el.querySelectorAll('*').length;
      if (c < bc) { bc = c; best = el; }
    }
    return best;
  }
  var afilOk = false;
  function inputCercano(startEl) {
    var cont = startEl, hops = 0, inp = null;
    while (cont && hops < 4) {
      inp = cont.querySelector && cont.querySelector('input[type=text],input[type=number],input:not([type])');
      if (inp) return inp;
      cont = cont.parentElement; hops++;
    }
    return null;
  }
  function decorarCampoAfiliado() {
    if (afilOk) return;
    var input = null, selects = document.querySelectorAll('select');
    for (var i = 0; i < selects.length && !input; i++) {
      var opt = norm(selects[i].textContent);
      if (opt.indexOf('DOCUMENTO') > -1 || opt.indexOf('BENEFIC') > -1) input = inputCercano(selects[i].parentElement);
    }
    if (!input) {
      var all = document.querySelectorAll('div,td,label,span');
      for (var j = 0; j < all.length && !input; j++) {
        if (all[j].children.length === 0 && norm(all[j].textContent).indexOf('AFILIADO POR') > -1) input = inputCercano(all[j].parentElement);
      }
    }
    if (input && !input.dataset.copiarAfil) {
      input.dataset.copiarAfil = '1';
      var b = chip('⧉ copiar', 'Copiar DNI/Afiliado', '#1d4ed8', false);
      b.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var v = (input.value || '').trim();
        if (v) copiar(v, 'DNI/Afiliado', b); else toast('Campo vacio');
      });
      input.parentNode.insertBefore(b, input.nextSibling);
      afilOk = true;
    }
  }
  function decorarPopupQR() {
    var cont = tightest(document.body, 'GENERAR QR', true);
    if (!cont) return;
    if (cont.dataset.pegarBound) return;
    cont.dataset.pegarBound = '1';
    var b = chip('⇩ Pegar del portapapeles', 'Pega y separa los ultimos 2 digitos', '#10B981', true);
    b.style.color = '#04120c';
    b.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      if (!(navigator.clipboard && navigator.clipboard.readText)) { toast('El navegador no permite leer el portapapeles'); return; }
      navigator.clipboard.readText().then(function (txt) {
        var d = digits(txt);
        if (!d) { toast('Portapapeles vacio o sin numeros'); return; }
        var ins = [].slice.call(cont.querySelectorAll('input[type=text],input[type=number],input:not([type])'))
          .filter(function (x) { return x.offsetParent !== null; });
        if (!ins.length) { toast('No encontre el campo'); return; }
        if (ins.length >= 2) {
          var suf = ins[ins.length - 1], main = ins[0];
          var sufLen = (suf.maxLength && suf.maxLength > 0 && suf.maxLength < 5) ? suf.maxLength : 2;
          if (d.length > sufLen) { setVal(main, d.slice(0, d.length - sufLen)); setVal(suf, d.slice(d.length - sufLen)); }
          else setVal(main, d);
        } else setVal(ins[0], d);
        toast('Pegado: ' + d);
      }).catch(function () { toast('No pude leer el portapapeles (permiso denegado)'); });
    });
    var qrBtn = tightest(cont, 'GENERAR QR', false);
    if (qrBtn && qrBtn.parentNode) qrBtn.parentNode.insertBefore(b, qrBtn);
    else { var fi = cont.querySelector('input'); if (fi) fi.parentNode.insertBefore(b, fi.nextSibling); }
  }
  /* Precarga el afiliado recien buscado en el popup Generar QR (12+2), sobrevive la recarga via sessionStorage */
  function autofillQRIfPending() {
    var raw; try { raw = sessionStorage.getItem('lumen_qr_afil'); } catch (e) { return; }
    if (!raw) return;
    var obj; try { obj = JSON.parse(raw); } catch (e) { try { sessionStorage.removeItem('lumen_qr_afil'); } catch (e2) {} return; }
    if (!obj || !obj.d) return;
    if (Date.now() - (obj.ts || 0) > 600000) { try { sessionStorage.removeItem('lumen_qr_afil'); } catch (e) {} return; }
    var cont = tightest(document.body, 'GENERAR QR', true);
    if (!cont) return; // popup todavia no abierto
    var ins = [].slice.call(cont.querySelectorAll('input[type=text],input[type=number],input:not([type])'))
      .filter(function (x) { return x.offsetParent !== null; });
    if (!ins.length) return;
    var d = obj.d;
    if (ins.length >= 2) {
      var suf = ins[ins.length - 1], main = ins[0];
      var sufLen = (suf.maxLength && suf.maxLength > 0 && suf.maxLength < 5) ? suf.maxLength : 2;
      if (d.length > sufLen) { setVal(main, d.slice(0, d.length - sufLen)); setVal(suf, d.slice(d.length - sufLen)); }
      else setVal(main, d);
    } else setVal(ins[0], d);
    try { sessionStorage.removeItem('lumen_qr_afil'); } catch (e) {}
    toast('QR precargado: ' + d);
  }

  function escanearPami() {
    var tables = document.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) procesarTabla(tables[i]);
    decorarCampoAfiliado();
    decorarPopupQR();
    autofillQRIfPending();
    procesarHistorialFetch();   // marca en rojo quien acepto (via fetch JSON, sin abrir el historial)
  }

  /* ══════════ ARRANQUE por sitio ══════════ */
  if (isConc) {
    initConciliacion();
  } else if (isPami) {
    setBadge('Lumen PAMI: copiar + pegar + auto-buscar (' + (isEf ? 'Aceptacion' : 'Prestaciones') + ')');
    escanearPami();
    var obs = new MutationObserver(function () { clearTimeout(obs._t); obs._t = setTimeout(escanearPami, 200); });
    obs.observe(document.body, { childList: true, subtree: true });
    if (isTx) { consumirPending(); chequearVacioTx(); }   // ruteo entrante + fallback "sin resultados"
    if (isEf) consumirEfector();   // 2da opcion: venimos redirigidos desde Prestaciones
  } else if (isFuesmen) {
    setBadge('Lumen FUESMEN: auto-buscar por N Turno');
    decorarReferencia();
    var obsF = new MutationObserver(function () { clearTimeout(obsF._t); obsF._t = setTimeout(decorarReferencia, 200); });
    obsF.observe(document.body, { childList: true, subtree: true });
  }

  /* Config de la lista de usuarios a marcar en rojo (ver nota arriba). */
  try {
    var W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    W.LumenOME = W.LumenOME || {};
    W.LumenOME.setUsuarios = function (arr) {
      if (!Array.isArray(arr)) return 'Pasa un array: LumenOME.setUsuarios([\'NOMBRE APELLIDO\'])';
      GM_setValue('lumen_target_users', JSON.stringify(arr));
      TARGET_USERS = arr.slice();
      return 'Guardados ' + arr.length + '. Recarga la pagina.';
    };
    W.LumenOME.usuarios = function () { return TARGET_USERS.slice(); };
  } catch (e) {}
})();
