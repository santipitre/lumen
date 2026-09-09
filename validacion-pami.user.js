// ==UserScript==
// @name         Lumen · Validación PAMI
// @namespace    https://santipitre.github.io/lumen/
// @version      2.3.0
// @description  Recibe la orden desde Lumen, busca en el Panel de prestaciones, y lee el ícono de ACCIONES: si ya dice "Prestación validada" la marca sola en Lumen; si dice "Validar prestación" deja el afiliado copiado para la Credencial Provisoria.
// @author       Pyralis / Lumen
// @match        https://pe.pami.org.ar/*
// @match        http://pe.pami.org.ar/*
// @match        https://santipitre.github.io/lumen/*
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// @noframes
// @downloadURL  https://santipitre.github.io/lumen/validacion-pami.user.js
// @updateURL    https://santipitre.github.io/lumen/validacion-pami.user.js
// ==/UserScript==

/*
  VERIFICADO EN VIVO 09/09/2026 sobre pe.pami.org.ar:

  - El trabajo NO es en efector.php (Panel de Aceptación, paso anterior que hace
    otra persona) sino en transmision.php (Panel de prestaciones) → VALIDAR PRESTACIÓN.
  - Campos de fecha: #f_turno_desde / #f_turno_hasta (name == id). Hay que VACIARLOS.
  - Buscar sin nro. de orden y sin fechas CUELGA PAMI (dos timeouts de 45 s medidos).
    Por eso ejecutar() aborta si no hay orden.
  - Hay VARIOS input[name="buscar"] en la misma página. En transmision.php los otros
    son "Trasmisión masiva" y "Exportar"; en efector.php, "Exportar a excel".
    NUNCA seleccionar por name solo → se filtra por value === "Buscar".
  - ACCIONES, markup real:
      ya validada  → <i class="... fas fa-check" disabled
                        data-original-title="Prestación validada - COD: Fecha: 07/09/2026 10:14:59">
      falta validar→ <i class="... btn-success fas fa-check validar"
                        data-original-title="Validar prestación">
      además       → <i class="... fa-arrow-right transmitir" data-validada="S|N">
*/

(function () {
  'use strict';

  var LUMEN_ORIGIN = 'https://santipitre.github.io';
  var LAST_KEY     = 'lumen_val_last';   // distinto del bus de PAMI OME v3.3
  var BUS_KEY      = 'lumen_val_bus';    // puente Tampermonkey PAMI -> Lumen

  /* ─── EL PUENTE ───────────────────────────────────────────
     El mismo userscript corre en la pagina de Lumen. El almacenamiento de
     Tampermonkey (GM_setValue) es compartido entre pestanas y entre dominios,
     asi que PAMI escribe ahi el resultado y esta mitad lo reenvia a la pagina
     como un message same-origin. Ventaja sobre el postMessage por opener:
     funciona aunque el popup lo haya bloqueado el navegador, aunque abras PAMI
     a mano, y aunque recargues cualquiera de las dos pestanas.            */
  if (location.hostname === 'santipitre.github.io') {
    var reenviar = function (v) {
      if (!v || !v.orden) return;
      window.postMessage({
        src: 'lumen-bridge', accion: 'estado',
        orden: v.orden, estado: v.estado, siguiente: !!v.siguiente
      }, location.origin);
    };
    try {
      GM_addValueChangeListener(BUS_KEY, function (k, viejo, nuevo) { reenviar(nuevo); });
    } catch (e) {}
    // Encender el "modo automatico" apenas carga: asi se ve que esta instalado.
    setTimeout(function () {
      window.postMessage({ src: 'lumen-bridge', accion: 'puente' }, location.origin);
    }, 400);
    return;
  }

  /* ─── helpers ─────────────────────────────────────────── */

  function setNativeValue(el, value) {
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (setter && setter.set) setter.set.call(el, value);
    else el.value = value;
    ['input', 'change', 'blur', 'keyup'].forEach(function (t) {
      el.dispatchEvent(new Event(t, { bubbles: true }));
    });
  }

  function copiar(txt) {
    try { GM_setClipboard(txt, 'text'); return true; }
    catch (e) {
      try { navigator.clipboard.writeText(txt); return true; } catch (e2) { return false; }
    }
  }

  function avisar(msg) {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(Object.assign({ src: 'lumen-pami-us' }, msg), LUMEN_ORIGIN);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ─── localizar los controles del buscador ────────────── */

  function campoOrden() {
    return document.querySelector('input[name="n_orden"]');
  }

  // Panel de prestaciones primero; efector.php como respaldo.
  function camposFecha() {
    var td = document.getElementById('f_turno_desde');
    var th = document.getElementById('f_turno_hasta');
    if (td && th) return { tipo: 'turno', desde: td, hasta: th };
    var ed = document.getElementById('f_emision_desde');
    var eh = document.getElementById('f_emision_hasta');
    if (ed && eh) return { tipo: 'emision', desde: ed, hasta: eh };
    return null;
  }

  // NUNCA por name solo: los vecinos son Exportar y Trasmisión masiva.
  function botonBuscar() {
    var subs = [].slice.call(document.querySelectorAll('input[type="submit"][name="buscar"]'));
    for (var i = 0; i < subs.length; i++) {
      if (/^buscar$/i.test((subs[i].value || '').trim())) return subs[i];
    }
    return document.getElementById('filtrar') || null;
  }

  /* PAMI RECUERDA LOS FILTROS ENTRE BUSQUEDAS. Si queda pegado un c_validada, un
     n_bate (boca de atencion), una practica, etc., la busqueda por nro. de orden
     vuelve VACIA y parece que la orden no existe. Santiago pidio explicitamente
     limpiar c_validada y n_bate; se limpia TODO el formulario menos n_orden, porque
     el mismo problema lo causa cualquiera de los otros campos. Equivale a apretar
     "Limpiar" y tipear solo la orden. */
  function limpiarFiltros(inOrden) {
    var form = inOrden.form || document;
    var els  = [].slice.call(form.querySelectorAll('input, select'));
    els.forEach(function (el) {
      if (el === inOrden) return;
      if (el.name === 'registros_por_pagina') return;   // paginado, no es filtro
      var t = (el.type || '').toLowerCase();
      if (t === 'submit' || t === 'button' || t === 'hidden') return;

      if (t === 'checkbox' || t === 'radio') {          // aceptadas_por_mi, urgentes, vigentes
        if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
        return;
      }
      if (el.tagName === 'SELECT') {                    // c_validada, n_bate, transmitida, documentacion, modalidad_turno
        var vacia = false;
        for (var i = 0; i < el.options.length; i++) {
          if (el.options[i].value === '') { vacia = true; break; }
        }
        // tipo_afiliado no tiene opcion vacia: se deja como esta (no filtra si n_afiliado quedo vacio)
        if (vacia && el.value !== '') { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); }
        return;
      }
      if (el.value !== '') setNativeValue(el, '');      // n_afiliado, practica, y las fechas
    });
  }

  /* ─── ejecutar el job que mandó Lumen ─────────────────── */

  function ejecutar(p) {
    // Guarda dura: sin nro. de orden la búsqueda sin fechas cuelga el portal.
    if (!p.orden) { panel(p, 'err', 'Lumen no mandó nro. de orden. No busco: sin orden y sin fechas, PAMI se cuelga.'); return; }

    var inOrden = campoOrden();
    if (!inOrden) {
      panel(p, 'err', 'No encontré el buscador. ¿Estás en el <b>Panel de prestaciones</b> y logueado?');
      avisar({ accion: 'error', msg: 'no encontré input[name=n_orden]' });
      return;
    }

    limpiarFiltros(inOrden);          // c_validada, n_bate y todo lo demas a "---"
    setNativeValue(inOrden, p.orden);

    var f = camposFecha();
    if (f && p.fechas !== 'none') {
      setNativeValue(f.desde, '');
      setNativeValue(f.hasta, '');
      if (f.tipo !== 'turno') {
        sessionStorage.setItem('lumen_warn_' + p.t, 'Esta página no tiene «Fecha turno»: vacié las de emisión.');
      }
    }

    sessionStorage.setItem('lumen_done_' + p.t, '1');
    sessionStorage.setItem(LAST_KEY, JSON.stringify(p));

    var btn = botonBuscar();
    if (!btn) { panel(p, 'err', 'Completé los campos pero no encontré el botón <b>Buscar</b>. Apretalo vos.'); return; }
    setTimeout(function () { btn.click(); }, 120);
  }

  /* ─── leer el resultado ───────────────────────────────── */

  function filaDe(orden) {
    var trs = [].slice.call(document.querySelectorAll('table tbody tr'));
    var d = String(orden).replace(/\D/g, '');
    for (var i = 0; i < trs.length; i++) {
      var c0 = (trs[i].cells[0] ? trs[i].cells[0].textContent : '').replace(/\D/g, '');
      if (c0 && c0.indexOf(d) !== -1) return trs[i];
    }
    return null;
  }

  function titulo(el) {
    return (el.getAttribute('data-original-title') || el.getAttribute('title') || '').trim();
  }

  // 'validada' | 'falta' | 'no-aparece' | 'raro'
  function analizarFila(tr) {
    if (!tr) return { caso: 'no-aparece' };

    var falta = tr.querySelector('i.validar');
    if (falta) return { caso: 'falta', detalle: titulo(falta) };

    var iconos = [].slice.call(tr.querySelectorAll('i'));
    for (var i = 0; i < iconos.length; i++) {
      var t = titulo(iconos[i]);
      if (/prestaci[oó]n validada/i.test(t)) {
        var trans = tr.querySelector('i.transmitir');
        return {
          caso: 'validada',
          detalle: t,
          fecha: (t.match(/(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}:\d{2})?)/) || [])[1] || '',
          transmitida: trans ? (trans.getAttribute('data-validada') || '') : ''
        };
      }
    }
    return { caso: 'raro' };
  }

  /* ─── panel flotante ──────────────────────────────────── */

  var COLORES = {
    falta:    ['#B45309', '#F59E0B', '#1a1206'],
    validada: ['#047857', '#10B981', '#04160f'],
    err:      ['#991B1B', '#EF4444', '#1a0808']
  };

  function panel(p, caso, aviso, info) {
    var prev = document.getElementById('lumen-panel');
    if (prev) prev.remove();
    info = info || {};
    var col = COLORES[caso] || COLORES.falta;

    var cuerpo;
    if (caso === 'validada') {
      cuerpo =
        '<div class="lp-ok-big">✓ Prestación ya validada</div>' +
        (info.fecha ? '<div class="lp-sub2">' + esc(info.fecha) + '</div>' : '') +
        '<div class="lp-tip">Se marca sola en Lumen con tilde verde.</div>';
    } else if (caso === 'falta') {
      cuerpo =
        '<div class="lp-lbl">Afiliado / GP — click para copiar</div>' +
        '<div class="lp-ben">' +
          '<button class="lp-b1" id="lp-cb">' + esc(p.benBase) + '</button>' +
          '<button class="lp-b2" id="lp-cd">' + esc(p.benDv) + '</button>' +
        '</div>' +
        '<div class="lp-tip">Falta validar. El número largo ya está en el portapapeles: abrí ' +
        '<b>PAMI: Credencial Provisoria</b>, pegalo (los 2 dígitos van en el cuadro chico) y dale ' +
        '<b>GENERAR QR</b>. Escaneá el QR con el celular y volvé acá.</div>';
    } else {
      cuerpo = '<div class="lp-tip">Revisá a mano y marcá en Lumen.</div>';
    }

    var box = document.createElement('div');
    box.id = 'lumen-panel';
    box.innerHTML =
      '<style>' +
      '#lumen-panel{position:fixed;top:14px;right:14px;z-index:2147483000;width:306px;' +
      'font-family:Inter,system-ui,Segoe UI,sans-serif;background:#0E1521;color:#F1F5F9;' +
      'border:1px solid rgba(148,163,184,.35);border-radius:13px;box-shadow:0 14px 44px rgba(0,0,0,.6);' +
      'overflow:hidden;font-size:13px}' +
      '#lumen-panel .lp-h{display:flex;align-items:center;gap:8px;padding:9px 13px;' +
      'background:linear-gradient(135deg,' + col[0] + ',' + col[1] + ');color:' + col[2] + ';font-weight:800;' +
      'letter-spacing:1.4px;font-size:11px;text-transform:uppercase}' +
      '#lumen-panel .lp-x{margin-left:auto;cursor:pointer;font-size:15px;line-height:1;opacity:.75}' +
      '#lumen-panel .lp-b{padding:13px}' +
      '#lumen-panel .lp-nom{font-weight:700;font-size:14px;margin-bottom:2px;line-height:1.3}' +
      '#lumen-panel .lp-sub{color:#94A3B8;font-size:11.5px;margin-bottom:11px;font-family:ui-monospace,Menlo,monospace}' +
      '#lumen-panel .lp-sub2{color:#94A3B8;font-size:11.5px;margin-bottom:9px;font-family:ui-monospace,Menlo,monospace}' +
      '#lumen-panel .lp-ok-big{font-size:15px;font-weight:800;color:#6ee7b7;margin-bottom:3px}' +
      '#lumen-panel .lp-lbl{font-size:9.5px;letter-spacing:1.4px;text-transform:uppercase;color:#94A3B8;margin-bottom:5px}' +
      '#lumen-panel .lp-ben{display:flex;gap:7px;margin-bottom:11px}' +
      '#lumen-panel .lp-ben button{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700;' +
      'background:#1A2332;border:1px solid rgba(148,163,184,.2);color:#67E8F9;border-radius:8px;' +
      'padding:9px 6px;cursor:pointer}' +
      '#lumen-panel .lp-ben button:hover{border-color:#F59E0B;color:#FCD34D}' +
      '#lumen-panel .lp-ben .lp-b1{flex:1}' +
      '#lumen-panel .lp-ben .lp-b2{width:56px;color:#FBBF24}' +
      '#lumen-panel .lp-acts{display:flex;gap:7px;margin-top:4px}' +
      '#lumen-panel .lp-acts button{flex:1;border-radius:8px;padding:9px 4px;cursor:pointer;' +
      'font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;border:1px solid}' +
      '#lumen-panel .lp-ok{background:rgba(16,185,129,.16);border-color:rgba(16,185,129,.5);color:#6ee7b7}' +
      '#lumen-panel .lp-no{background:rgba(248,113,113,.14);border-color:rgba(248,113,113,.45);color:#fca5a5}' +
      '#lumen-panel .lp-sk{background:rgba(148,163,184,.1);border-color:rgba(148,163,184,.25);color:#94A3B8}' +
      '#lumen-panel .lp-nx{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:#94A3B8}' +
      '#lumen-panel .lp-msg{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.35);' +
      'color:#FCD34D;border-radius:8px;padding:8px 10px;font-size:11.5px;margin-bottom:11px;line-height:1.45}' +
      '#lumen-panel .lp-tip{margin-top:8px;font-size:10.5px;color:#8FA0B5;line-height:1.5}' +
      '</style>' +
      '<div class="lp-h">Lumen · Validación<span class="lp-x" id="lp-x">✕</span></div>' +
      '<div class="lp-b">' +
        (aviso ? '<div class="lp-msg">' + aviso + '</div>' : '') +
        '<div class="lp-nom">' + esc(p.nombre || '') + '</div>' +
        '<div class="lp-sub">Orden ' + esc(p.orden) + (p.turno ? ' · ' + esc(p.turno) : '') + '</div>' +
        cuerpo +
        '<div class="lp-acts">' +
          '<button class="lp-ok" id="lp-ok">✓ Validada</button>' +
          '<button class="lp-no" id="lp-no">✗ Rechazada</button>' +
          '<button class="lp-sk" id="lp-sk">Saltar</button>' +
        '</div>' +
        '<label class="lp-nx"><input type="checkbox" id="lp-nx"' +
          (localStorage.getItem('lumen_auto_next') === '0' ? '' : ' checked') +
          '/> Ir a la siguiente orden al marcar</label>' +
      '</div>';

    document.body.appendChild(box);

    var next   = function () { var c = document.getElementById('lp-nx'); return !c || c.checked; };
    var marcar = function (estado) {
      localStorage.setItem('lumen_auto_next', next() ? '1' : '0');
      var msg = { accion: 'estado', orden: p.orden, estado: estado, siguiente: next() };
      var porOpener = avisar(msg);
      var porBus    = false;
      try { GM_setValue(BUS_KEY, { orden: p.orden, estado: estado, siguiente: next(), t: Date.now() }); porBus = true; }
      catch (e) {}
      if (!porOpener && !porBus) {
        alert('No pude avisarle a Lumen por ningún camino. Marcá la orden a mano.');
      }
      box.remove();
    };

    document.getElementById('lp-x').onclick  = function () { box.remove(); };
    document.getElementById('lp-ok').onclick = function () { marcar('validada'); };
    document.getElementById('lp-no').onclick = function () { marcar('rechazada'); };
    document.getElementById('lp-sk').onclick = function () {
      localStorage.setItem('lumen_auto_next', next() ? '1' : '0');
      avisar({ accion: 'estado', orden: p.orden, estado: 'pendiente', siguiente: next() });
      box.remove();
    };
    var cb = document.getElementById('lp-cb'), cd = document.getElementById('lp-cd');
    if (cb) cb.onclick = function () { copiar(p.benBase); flash(this); };
    if (cd) cd.onclick = function () { copiar(p.benDv);  flash(this); };

    return { marcar: marcar, autoNext: next };
  }

  function flash(btn) {
    var t = btn.textContent;
    btn.textContent = '✓ copiado';
    setTimeout(function () { btn.textContent = t; }, 900);
  }

  /* ─── volver del submit: clasificar y actuar ──────────── */

  function alVolver(p, auto) {
    var r = analizarFila(filaDe(p.orden));
    var warn = sessionStorage.getItem('lumen_warn_' + p.t) || '';

    if (r.caso === 'validada') {
      // Paso 5.1 del circuito: ya está, se marca sola en Lumen.
      var api = panel(p, 'validada', warn, r);
      // Sólo se marca sola si la búsqueda la disparó este job. Si la tabla es la que
      // PAMI restauró de la búsqueda anterior (recarga, volver a la pestaña), se
      // muestra el panel y decide Santiago.
      if (auto) setTimeout(function () { api.marcar('validada'); }, 1400);
      return;
    }
    if (r.caso === 'falta') {
      // Paso 5.2: hay que validar con la Credencial Provisoria + QR.
      copiar(p.benBase);
      panel(p, 'falta', warn, r);
      return;
    }
    if (r.caso === 'no-aparece') {
      panel(p, 'err', warn || 'La búsqueda no trajo esta orden en el Panel de prestaciones.', r);
      return;
    }
    panel(p, 'err', warn || 'La fila apareció pero no reconocí el ícono de ACCIONES.', r);
  }

  /* ─── arranque / hashchange ───────────────────────────── */

  function leerPayload() {
    var m = location.hash.match(/[#&]lumen=([^&]+)/);
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; }
  }

  function arrancar() {
    var p = leerPayload();
    if (p && p.orden) {
      if (!sessionStorage.getItem('lumen_done_' + p.t)) { ejecutar(p); return; }
      alVolver(p, true);
      return;
    }
    var last = sessionStorage.getItem(LAST_KEY);
    if (last) { try { var q = JSON.parse(last); if (filaDe(q.orden)) alVolver(q, false); } catch (e) {} }
  }

  window.addEventListener('hashchange', function () {
    var p = leerPayload();
    if (p && p.orden && !sessionStorage.getItem('lumen_done_' + p.t)) ejecutar(p);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
