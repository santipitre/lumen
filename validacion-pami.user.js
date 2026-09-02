// ==UserScript==
// @name         Lumen · Validación PAMI
// @namespace    https://santipitre.github.io/lumen/
// @version      1.0.1
// @description  Recibe la orden desde Lumen, completa el buscador de PAMI (nro. de orden + rango de fecha de emisión), busca, y deja el nro. de beneficio partido y copiado para la credencial provisoria.
// @author       Pyralis / Lumen
// @match        https://po.pami.org.ar/*
// @match        http://po.pami.org.ar/*
// @match        https://pe.pami.org.ar/*
// @match        http://pe.pami.org.ar/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @noframes
// @downloadURL  https://santipitre.github.io/lumen/validacion-pami.user.js
// @updateURL    https://santipitre.github.io/lumen/validacion-pami.user.js
// ==/UserScript==

(function () {
  'use strict';

  var LUMEN_ORIGIN = 'https://santipitre.github.io';
  var EXT_ID       = 'egabgimjhhpgihnclanjpkjkogcfjaho'; // Pami: Credencial Provisoria
  var LAST_KEY     = 'lumen_val_last';   // distinto del bus de PAMI OME v3.3

  /* ─── helpers ─────────────────────────────────────────── */

  function setNativeValue(el, value) {
    var proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, value);
    else el.value = value;
    ['input', 'change', 'blur', 'keyup'].forEach(function (t) {
      el.dispatchEvent(new Event(t, { bubbles: true }));
    });
  }

  function toISO(ddmmyyyy) {
    var m = String(ddmmyyyy || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
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

  /* ─── localizar los campos del buscador ───────────────── */

  function campoOrden() {
    return document.querySelector('input[name="n_orden"]')
        || document.querySelector('input[name*="orden" i]');
  }

  function botonBuscar() {
    return document.querySelector('input[name="buscar"]')
        || document.querySelector('input[type="submit"][value*="uscar" i]')
        || document.querySelector('button[type="submit"]');
  }

  // Los dos campos de "Fecha emisión desde / hasta". Los nombres reales no están
  // documentados, así que se buscan por nombre/id/placeholder y, si no,
  // por cualquier input cuyo valor tenga forma dd/mm/aaaa, en orden de aparición.
  function camposFecha() {
    var inputs = [].slice.call(document.querySelectorAll('input'));
    var re = /(desde|hasta|emision|emisión|fecha)/i;

    var porNombre = inputs.filter(function (i) {
      var s = (i.name || '') + ' ' + (i.id || '') + ' ' + (i.placeholder || '');
      return re.test(s) && i.type !== 'hidden' && i.type !== 'submit';
    });

    var pick = porNombre.length >= 2 ? porNombre : inputs.filter(function (i) {
      return i.type === 'date' || /^\d{2}\/\d{2}\/\d{4}$/.test(i.value || '');
    });

    var desde = pick.find(function (i) {
      return /desde|from/i.test((i.name || '') + (i.id || '') + (i.placeholder || ''));
    }) || pick[0];
    var hasta = pick.find(function (i) {
      return /hasta|to\b/i.test((i.name || '') + (i.id || '') + (i.placeholder || ''));
    }) || pick.filter(function (i) { return i !== desde; })[0];

    return { desde: desde, hasta: hasta };
  }

  function ponerFecha(el, ddmmyyyy) {
    if (!el || !ddmmyyyy) return false;
    setNativeValue(el, el.type === 'date' ? toISO(ddmmyyyy) : ddmmyyyy);
    return true;
  }

  /* ─── ejecutar el job que mandó Lumen ─────────────────── */

  function ejecutar(p) {
    var inOrden = campoOrden();
    if (!inOrden) {
      panel(p, 'No encontré el buscador de órdenes. ¿Estás logueado en el Panel de Aceptación?');
      avisar({ accion: 'error', msg: 'no encontré el campo n_orden' });
      return;
    }

    setNativeValue(inOrden, p.orden);

    var f = camposFecha();
    var fechasOK = false;
    if (p.desde && p.hasta) {
      var a = ponerFecha(f.desde, p.desde);
      var b = ponerFecha(f.hasta, p.hasta);
      fechasOK = a && b;
    }

    sessionStorage.setItem('lumen_done_' + p.t, '1');
    sessionStorage.setItem(LAST_KEY, JSON.stringify(p));

    var btn = botonBuscar();
    if (!btn) {
      panel(p, 'Completé los campos pero no encontré el botón Buscar. Apretalo vos.');
      return;
    }
    if (p.desde && !fechasOK) {
      sessionStorage.setItem('lumen_warn_' + p.t, 'No pude ubicar los campos de fecha — se buscó solo por nro. de orden.');
    }
    setTimeout(function () { btn.click(); }, 120);
  }

  /* ─── panel flotante ──────────────────────────────────── */

  function panel(p, aviso) {
    var prev = document.getElementById('lumen-panel');
    if (prev) prev.remove();

    var box = document.createElement('div');
    box.id = 'lumen-panel';
    box.innerHTML =
      '<style>' +
      '#lumen-panel{position:fixed;top:14px;right:14px;z-index:2147483000;width:302px;' +
      'font-family:Inter,system-ui,Segoe UI,sans-serif;background:#0E1521;color:#F1F5F9;' +
      'border:1px solid rgba(245,158,11,.38);border-radius:13px;box-shadow:0 14px 44px rgba(0,0,0,.6);' +
      'overflow:hidden;font-size:13px}' +
      '#lumen-panel .lp-h{display:flex;align-items:center;gap:8px;padding:9px 13px;' +
      'background:linear-gradient(135deg,#B45309,#F59E0B);color:#1a1206;font-weight:800;' +
      'letter-spacing:1.4px;font-size:11px;text-transform:uppercase}' +
      '#lumen-panel .lp-x{margin-left:auto;cursor:pointer;font-size:15px;line-height:1;opacity:.75}' +
      '#lumen-panel .lp-x:hover{opacity:1}' +
      '#lumen-panel .lp-b{padding:13px}' +
      '#lumen-panel .lp-nom{font-weight:700;font-size:14px;margin-bottom:2px;line-height:1.3}' +
      '#lumen-panel .lp-sub{color:#94A3B8;font-size:11.5px;margin-bottom:11px;' +
      'font-family:ui-monospace,Menlo,monospace}' +
      '#lumen-panel .lp-lbl{font-size:9.5px;letter-spacing:1.4px;text-transform:uppercase;' +
      'color:#94A3B8;margin-bottom:5px}' +
      '#lumen-panel .lp-ben{display:flex;gap:7px;align-items:stretch;margin-bottom:11px}' +
      '#lumen-panel .lp-ben button{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700;' +
      'background:#1A2332;border:1px solid rgba(148,163,184,.2);color:#67E8F9;border-radius:8px;' +
      'padding:9px 6px;cursor:pointer;letter-spacing:.5px}' +
      '#lumen-panel .lp-ben button:hover{border-color:#F59E0B;color:#FCD34D}' +
      '#lumen-panel .lp-ben .lp-b1{flex:1}' +
      '#lumen-panel .lp-ben .lp-b2{width:56px;color:#FBBF24}' +
      '#lumen-panel .lp-acts{display:flex;gap:7px}' +
      '#lumen-panel .lp-acts button{flex:1;border-radius:8px;padding:9px 4px;cursor:pointer;' +
      'font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;border:1px solid}' +
      '#lumen-panel .lp-ok{background:rgba(16,185,129,.16);border-color:rgba(16,185,129,.5);color:#6ee7b7}' +
      '#lumen-panel .lp-no{background:rgba(248,113,113,.14);border-color:rgba(248,113,113,.45);color:#fca5a5}' +
      '#lumen-panel .lp-sk{background:rgba(148,163,184,.1);border-color:rgba(148,163,184,.25);color:#94A3B8}' +
      '#lumen-panel .lp-nx{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:#94A3B8}' +
      '#lumen-panel .lp-msg{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.35);' +
      'color:#FCD34D;border-radius:8px;padding:8px 10px;font-size:11.5px;margin-bottom:11px;line-height:1.45}' +
      '#lumen-panel .lp-tip{margin-top:10px;font-size:10.5px;color:#64748B;line-height:1.45}' +
      '</style>' +
      '<div class="lp-h">Lumen · Validación<span class="lp-x" id="lp-x">✕</span></div>' +
      '<div class="lp-b">' +
        (aviso ? '<div class="lp-msg">' + aviso + '</div>' : '') +
        '<div class="lp-nom">' + esc(p.nombre || '') + '</div>' +
        '<div class="lp-sub">Orden ' + esc(p.orden) + (p.turno ? ' · ' + esc(p.turno) : '') + '</div>' +
        '<div class="lp-lbl">Beneficio / GP — click para copiar</div>' +
        '<div class="lp-ben">' +
          '<button class="lp-b1" id="lp-cb">' + esc(p.benBase) + '</button>' +
          '<button class="lp-b2" id="lp-cd">' + esc(p.benDv) + '</button>' +
        '</div>' +
        '<div class="lp-acts">' +
          '<button class="lp-ok" id="lp-ok">✓ Validada</button>' +
          '<button class="lp-no" id="lp-no">✗ Rechazada</button>' +
          '<button class="lp-sk" id="lp-sk">Saltar</button>' +
        '</div>' +
        '<label class="lp-nx"><input type="checkbox" id="lp-nx"' +
          (localStorage.getItem('lumen_auto_next') === '0' ? '' : ' checked') +
          '/> Ir a la siguiente orden al marcar</label>' +
        '<div class="lp-tip">El número largo ya está en el portapapeles. Abrí <b>Credencial Provisoria</b> y pegá; ' +
        'los últimos 2 dígitos van en el cuadro chico.</div>' +
      '</div>';

    document.body.appendChild(box);

    var next = function () { return document.getElementById('lp-nx').checked; };
    var marcar = function (estado) {
      localStorage.setItem('lumen_auto_next', next() ? '1' : '0');
      var ok = avisar({ accion: 'estado', orden: p.orden, estado: estado, siguiente: next() });
      if (!ok) alert('No pude avisarle a Lumen (¿cerraste la pestaña de Lumen?). Marcá la orden a mano.');
      box.remove();
    };

    document.getElementById('lp-x').onclick  = function () { box.remove(); };
    document.getElementById('lp-cb').onclick = function () { copiar(p.benBase); flash(this); };
    document.getElementById('lp-cd').onclick = function () { copiar(p.benDv);  flash(this); };
    document.getElementById('lp-ok').onclick = function () { marcar('validada'); };
    document.getElementById('lp-no').onclick = function () { marcar('rechazada'); };
    document.getElementById('lp-sk').onclick = function () {
      localStorage.setItem('lumen_auto_next', next() ? '1' : '0');
      avisar({ accion: 'estado', orden: p.orden, estado: 'pendiente', siguiente: next() });
      box.remove();
    };
  }

  function flash(btn) {
    var t = btn.textContent;
    btn.textContent = '✓ copiado';
    setTimeout(function () { btn.textContent = t; }, 900);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
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
      // Volvimos del submit: mostrar el panel con el resultado
      copiar(p.benBase);
      var w = sessionStorage.getItem('lumen_warn_' + p.t);
      panel(p, w || '');
      return;
    }

    var last = sessionStorage.getItem(LAST_KEY);
    if (last) { try { panel(JSON.parse(last), ''); } catch (e) {} }
  }

  window.addEventListener('hashchange', function () {
    var p = leerPayload();
    if (p && p.orden && !sessionStorage.getItem('lumen_done_' + p.t)) ejecutar(p);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
