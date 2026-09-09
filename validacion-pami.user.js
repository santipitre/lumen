// ==UserScript==
// @name         Lumen · Validación PAMI
// @namespace    https://santipitre.github.io/lumen/
// @version      3.2.0
// @description  Recibe la orden desde Lumen, saca el DNI por la API interna de PAMI, chequea en el HIS que el turno sea de un equipo del Hospital Italiano y recién ahí valida la prestación.
// @author       Pyralis / Lumen
// @match        https://pe.pami.org.ar/*
// @match        http://pe.pami.org.ar/*
// @match        http://his.fuesmen.edu.ar:8180/*
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
  TRES FASES, TRES DOMINIOS. Todo verificado en vivo el 2026-09-09.

  fase 'gate'    (pe.pami.org.ar)          POST controllers/ajax/efectores_detalle.php
                                           {orden, estado:'modificar', bene, gp} -> JSON.
                                           El DNI es afiliado[0].n_docu.
                                           GUARDA: afiliado[0].n_beneficio TIENE que ser igual
                                           al benBase de la orden. Medido: la pagina puede tener
                                           un td.documento oculto de OTRO paciente.
  fase 'his'     (his.fuesmen.edu.ar:8180) hturno: #_DOCUMENTOPERSONA + input[name=BUTTON7].
                                           Grilla GeneXus con sufijo _0001, _0002...
                                           span__NOMBRE1_ = equipo, span_CENTROID_ = centro.
  fase 'validar' (pe.pami.org.ar)          transmision.php: limpiar TODOS los filtros (PAMI los
                                           recuerda y deja la busqueda vacia), vaciar f_turno_*,
                                           Buscar, y leer el icono de ACCIONES.

  NUNCA buscar en transmision.php sin nro. de orden: cuelga el portal (medido, 2 timeouts 45s).
  NUNCA elegir el boton por name: hay varios input[name=buscar] ("Exportar", "Trasmision masiva").
  NUNCA clickear i.fa-ban ("Cancelar Aceptacion") en efector.php.
*/

(function () {
  'use strict';

  var LUMEN_ORIGIN = 'https://santipitre.github.io';
  var BUS_KEY      = 'lumen_val_bus';
  var LAST_KEY     = 'lumen_val_last';
  var HIS_URL      = 'http://his.fuesmen.edu.ar:8180/his/servlet/hturno?0';
  var PAMI_VALIDAR = 'https://pe.pami.org.ar/controllers/transmision.php';

  /* Lista blanca de equipos, TAL CUAL la pidio Santiago (2026-09-09).
     Sabe que deja afuera 20 equipos del Italiano (entre ellos 6 "ECOG-DOPP H.ITALIAN" sin
     la O final y la RMN GE SIGNA HORIZON). Decision suya: no ampliarla sin que la pida.
     Por eso, cuando rechaza, el panel MUESTRA el nombre del equipo encontrado. */
  var EQUIPOS_OK = [
    'RMN-H ITALIA-SIEMENS FLOW',
    'RX-H.ITALIANO-GBA',
    'RX-H.ITALIANO-MERATE',
    'TCMC PHIL.-BRILLANCE 64 HITALI'
  ];
  var PREFIJO_OK = 'ECOG-DOPP H.ITALIANO';

  /* ─── helpers comunes ─────────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function ss(k)      { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k,v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function txtDe(id)  { var e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g,' ').trim() : ''; }
  function pad4(n)    { return ('000' + n).slice(-4); }

  function setNativeValue(el, value) {
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (setter && setter.set) setter.set.call(el, value); else el.value = value;
    ['input', 'change', 'blur', 'keyup'].forEach(function (t) {
      el.dispatchEvent(new Event(t, { bubbles: true }));
    });
  }
  function copiar(txt) {
    try { GM_setClipboard(txt, 'text'); return true; }
    catch (e) { try { navigator.clipboard.writeText(txt); return true; } catch (e2) { return false; } }
  }
  function leerPayload() {
    var m = location.hash.match(/[#&]lumen=([^&]+)/);
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; }
  }
  function irA(base, p) { location.href = base + '#lumen=' + encodeURIComponent(JSON.stringify(p)); }

  /* Avisa a Lumen por los dos caminos: opener (se rompe si no abrio Lumen la pestana)
     y el bus de Tampermonkey (compartido entre pestanas y dominios). */
  function avisarLumen(msg) {
    var porOpener = false, porBus = false;
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(Object.assign({ src: 'lumen-pami-us' }, msg), LUMEN_ORIGIN);
        porOpener = true;
      }
    } catch (e) {}
    try { GM_setValue(BUS_KEY, Object.assign({ t: Date.now() }, msg)); porBus = true; } catch (e) {}
    return porOpener || porBus;
  }

  function autoNext() { return localStorage.getItem('lumen_auto_next') !== '0'; }

  /* ─── panel flotante (compartido por PAMI y HIS) ──────── */

  var COLORES = {
    falta:    ['#B45309', '#F59E0B', '#1a1206'],
    validada: ['#047857', '#10B981', '#04160f'],
    err:      ['#991B1B', '#EF4444', '#1a0808'],
    elegir:   ['#1E3A8A', '#3B82F6', '#04101f']
  };

  function panel(p, caso, aviso, cuerpoHTML, onMount) {
    var prev = document.getElementById('lumen-panel');
    if (prev) prev.remove();
    var col = COLORES[caso] || COLORES.falta;

    var box = document.createElement('div');
    box.id = 'lumen-panel';
    box.innerHTML =
      '<style>' +
      '#lumen-panel{position:fixed;top:14px;right:14px;z-index:2147483000;width:330px;max-height:88vh;overflow:auto;' +
      'font-family:Inter,system-ui,Segoe UI,sans-serif;background:#0E1521;color:#F1F5F9;' +
      'border:1px solid rgba(148,163,184,.35);border-radius:13px;box-shadow:0 14px 44px rgba(0,0,0,.6);font-size:13px}' +
      '#lumen-panel .lp-h{display:flex;align-items:center;gap:8px;padding:9px 13px;position:sticky;top:0;' +
      'background:linear-gradient(135deg,' + col[0] + ',' + col[1] + ');color:' + col[2] + ';font-weight:800;' +
      'letter-spacing:1.4px;font-size:11px;text-transform:uppercase}' +
      '#lumen-panel .lp-x{margin-left:auto;cursor:pointer;font-size:15px;line-height:1;opacity:.75}' +
      '#lumen-panel .lp-b{padding:13px}' +
      '#lumen-panel .lp-nom{font-weight:700;font-size:14px;margin-bottom:2px;line-height:1.3}' +
      '#lumen-panel .lp-sub{color:#94A3B8;font-size:11.5px;margin-bottom:11px;font-family:ui-monospace,Menlo,monospace}' +
      '#lumen-panel .lp-ok-big{font-size:15px;font-weight:800;color:#6ee7b7;margin-bottom:3px}' +
      '#lumen-panel .lp-bad-big{font-size:15px;font-weight:800;color:#fca5a5;margin-bottom:3px}' +
      '#lumen-panel .lp-lbl{font-size:9.5px;letter-spacing:1.4px;text-transform:uppercase;color:#94A3B8;margin:9px 0 5px}' +
      '#lumen-panel .lp-equipo{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#FCD34D;' +
      'background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);border-radius:7px;padding:7px 9px;word-break:break-word}' +
      '#lumen-panel .lp-ben{display:flex;gap:7px;margin-bottom:11px}' +
      '#lumen-panel .lp-ben button{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700;' +
      'background:#1A2332;border:1px solid rgba(148,163,184,.2);color:#67E8F9;border-radius:8px;padding:9px 6px;cursor:pointer}' +
      '#lumen-panel .lp-ben .lp-b1{flex:1}#lumen-panel .lp-ben .lp-b2{width:56px;color:#FBBF24}' +
      '#lumen-panel .lp-fila{width:100%;text-align:left;background:#131C2B;border:1px solid rgba(148,163,184,.22);' +
      'color:#E2E8F0;border-radius:9px;padding:8px 10px;margin-bottom:6px;cursor:pointer;font-size:11.5px;line-height:1.45}' +
      '#lumen-panel .lp-fila:hover{border-color:#3B82F6}' +
      '#lumen-panel .lp-fila b{color:#93C5FD;font-family:ui-monospace,Menlo,monospace}' +
      '#lumen-panel .lp-acts{display:flex;gap:7px;margin-top:10px}' +
      '#lumen-panel .lp-acts button{flex:1;border-radius:8px;padding:9px 4px;cursor:pointer;font-size:11px;' +
      'font-weight:700;letter-spacing:.8px;text-transform:uppercase;border:1px solid}' +
      '#lumen-panel .lp-ok{background:rgba(16,185,129,.16);border-color:rgba(16,185,129,.5);color:#6ee7b7}' +
      '#lumen-panel .lp-no{background:rgba(248,113,113,.14);border-color:rgba(248,113,113,.45);color:#fca5a5}' +
      '#lumen-panel .lp-sk{background:rgba(148,163,184,.1);border-color:rgba(148,163,184,.25);color:#94A3B8}' +
      '#lumen-panel .lp-nx{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:#94A3B8}' +
      '#lumen-panel .lp-msg{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.35);color:#FCD34D;' +
      'border-radius:8px;padding:8px 10px;font-size:11.5px;margin-bottom:11px;line-height:1.45}' +
      '#lumen-panel .lp-tip{margin-top:8px;font-size:10.5px;color:#8FA0B5;line-height:1.5}' +
      '</style>' +
      '<div class="lp-h">Lumen · Validación<span class="lp-x" id="lp-x">✕</span></div>' +
      '<div class="lp-b">' +
        (aviso ? '<div class="lp-msg">' + aviso + '</div>' : '') +
        '<div class="lp-nom">' + esc(p.nombre || '') + '</div>' +
        '<div class="lp-sub">Orden ' + esc(p.orden || '') + (p.turno ? ' · ' + esc(p.turno) : '') + '</div>' +
        cuerpoHTML +
        '<div class="lp-acts">' +
          '<button class="lp-ok" id="lp-ok">✓ Validada</button>' +
          '<button class="lp-no" id="lp-no">✗ Rechazada</button>' +
          '<button class="lp-sk" id="lp-sk">Saltar</button>' +
        '</div>' +
        '<label class="lp-nx"><input type="checkbox" id="lp-nx"' + (autoNext() ? ' checked' : '') +
        '/> Ir a la siguiente orden al marcar</label>' +
      '</div>';

    document.body.appendChild(box);

    var next = function () { var c = document.getElementById('lp-nx'); return !c || c.checked; };
    var marcar = function (estado, motivo) {
      localStorage.setItem('lumen_auto_next', next() ? '1' : '0');
      var ok = avisarLumen({ accion: 'estado', orden: p.orden, estado: estado, motivo: motivo || '', siguiente: next() });
      if (!ok) alert('No pude avisarle a Lumen por ningún camino. Marcá la orden a mano.');
      box.remove();
    };
    document.getElementById('lp-x').onclick  = function () { box.remove(); };
    document.getElementById('lp-ok').onclick = function () { marcar('validada'); };
    document.getElementById('lp-no').onclick = function () { marcar('rechazada'); };
    document.getElementById('lp-sk').onclick = function () {
      localStorage.setItem('lumen_auto_next', next() ? '1' : '0');
      avisarLumen({ accion: 'estado', orden: p.orden, estado: 'pendiente', siguiente: next() });
      box.remove();
    };
    if (onMount) onMount(box, marcar, next);
    return { marcar: marcar, autoNext: next, box: box };
  }

  function flash(btn) {
    var t = btn.textContent;
    btn.textContent = '✓ copiado';
    setTimeout(function () { btn.textContent = t; }, 900);
  }

  /* ─── modalidad: el unico cruce que pega entre PAMI y el HIS ───
     PAMI dice "323022 - RESONANCIA MAGNETICA..." y el HIS dice "RMAC COLUMNA LUMBAR":
     los nombres de estudio NO son comparables. Lo que si compara es la modalidad. */
  function modalidadDePractica(s) {
    var t = String(s || '').toUpperCase();
    if (/TOMOGRAF/.test(t))                    return 'TC';
    if (/RESONANCIA|ANGIORRESONANCIA/.test(t)) return 'RMN';
    if (/ECOGRAF|DOPPLER|ECODOPPLER/.test(t))  return 'ECO';
    if (/RADIOGRAF|RADIOLOG/.test(t))          return 'RX';
    var m = t.match(/(\d{6})/);
    if (m) {
      var pre = m[1].slice(0, 3);
      if (pre === '324') return 'TC';
      if (pre === '323') return 'RMN';
      if (pre === '186') return 'ECO';
    }
    return null;
  }
  function modalidadDeEquipo(s) {
    var t = String(s || '').toUpperCase().trim();
    if (t.indexOf('RMN') === 0)  return 'RMN';
    if (t.indexOf('TCMC') === 0 || t.indexOf('TOMOG') === 0) return 'TC';
    if (t.indexOf('ECOG') === 0) return 'ECO';
    if (t.indexOf('RX') === 0)   return 'RX';
    if (t.indexOf('CGAM') === 0) return 'GAMMA';
    return null;
  }
  function equipoHabilitado(nombre) {
    var n = String(nombre || '').trim();
    if (EQUIPOS_OK.indexOf(n) !== -1) return true;
    return n.indexOf(PREFIJO_OK) === 0;
  }

  /* ══════════════ MITAD LUMEN: el puente ══════════════ */
  if (location.hostname === 'santipitre.github.io') {
    var reenviar = function (v) {
      if (!v || !v.orden) return;
      window.postMessage({
        src: 'lumen-bridge', accion: 'estado',
        orden: v.orden, estado: v.estado, motivo: v.motivo || '', siguiente: !!v.siguiente
      }, location.origin);
    };
    try { GM_addValueChangeListener(BUS_KEY, function (k, viejo, nuevo) { reenviar(nuevo); }); } catch (e) {}
    /* Se manda la version instalada para que Lumen la muestre. Sin esto no hay forma
        de saber si Tampermonkey se quedo con una version vieja: la pagina se ve igual
        y el circuito falla distinto. */
    var VER = '?';
    try { VER = (GM_info && GM_info.script && GM_info.script.version) || '?'; } catch (e) {}
    setTimeout(function () {
      window.postMessage({ src: 'lumen-bridge', accion: 'puente', ver: VER }, location.origin);
    }, 400);
    return;
  }

  /* ══════════════ MITAD HIS FUESMEN ══════════════ */
  if (/his\.fuesmen\.edu\.ar/i.test(location.hostname)) {

    var HIS_JOB = 'lumen_his_job';

    var filasHis = function () {
      var out = [], i = 1;
      while (i <= 200) {
        var suf = pad4(i);
        var eq = document.getElementById('span__NOMBRE1_' + suf);
        if (!eq) break;
        out.push({
          suf:     suf,
          equipo:  eq.textContent.replace(/\s+/g, ' ').trim(),
          centro:  txtDe('span_CENTROID_' + suf),
          estudio: txtDe('span_ESTUDIONOMBRE_' + suf),
          fecha:   txtDe('span_TURNOFECHAHORA_' + suf),
          estado:  txtDe('span__TEXTOESTADO_' + suf)
        });
        i++;
      }
      return out;
    };

    var seguirAValidar = function (p, fila) {
      var q = {};
      for (var k in p) q[k] = p[k];
      q.fase = 'validar';
      q.t = Date.now();
      q.equipo = fila ? fila.equipo : '';
      irA(PAMI_VALIDAR, q);
    };

    var evaluarFila = function (p, f) {
      if (equipoHabilitado(f.equipo)) {
        panel(p, 'validada', '',
          '<div class="lp-ok-big">✓ Equipo habilitado</div>' +
          '<div class="lp-lbl">Equipo</div><div class="lp-equipo">' + esc(f.equipo) + '</div>' +
          '<div class="lp-tip">' + esc(f.centro) + ' · ' + esc(f.estudio) + ' · ' + esc(f.fecha) +
          '<br>Sigo a PAMI a validar la prestación…</div>');
        setTimeout(function () { seguirAValidar(p, f); }, 1200);
        return;
      }
      /* RECHAZA. Se muestra el equipo encontrado A PROPOSITO: si empiezan a aparecer
         "ECOG-DOPP H.ITALIAN" sin la O, Santiago lo ve en vez de perderse. */
      var api = panel(p, 'err', '',
        '<div class="lp-bad-big">✗ Equipo fuera de la lista</div>' +
        '<div class="lp-lbl">Equipo encontrado</div><div class="lp-equipo">' + esc(f.equipo) + '</div>' +
        '<div class="lp-tip">' + esc(f.centro) + ' · ' + esc(f.estudio) + ' · ' + esc(f.fecha) +
        '<br>No está en la lista blanca, así que no se valida. Se marca rechazada en Lumen.</div>');
      setTimeout(function () { api.marcar('rechazada', 'equipo: ' + f.equipo); }, 1600);
    };

    var elegirFila = function (p, filas, aviso) {
      var html = '<div class="lp-lbl">Turnos del Hospital Italiano — elegí cuál corresponde</div>' +
        filas.map(function (f, i) {
          return '<button class="lp-fila" data-i="' + i + '"><b>' + esc(f.equipo) + '</b><br>' +
                 esc(f.centro) + ' · ' + esc(f.estudio) + '<br>' + esc(f.fecha) + ' · ' + esc(f.estado) + '</button>';
        }).join('');
      panel(p, 'elegir', aviso, html, function (box) {
        [].slice.call(box.querySelectorAll('.lp-fila')).forEach(function (b) {
          b.onclick = function () { box.remove(); evaluarFila(p, filas[+b.getAttribute('data-i')]); };
        });
      });
    };

    var evaluarHis = function (p) {
      var filas = filasHis();
      if (!filas.length) {
        panel(p, 'err', 'El HIS no devolvió turnos para el DNI <b>' + esc(p.dni) + '</b>.',
          '<div class="lp-tip">Revisá a mano y marcá en Lumen.</div>');
        return;
      }

      /* PRIMERO la lista blanca: al elegir fila sólo se ofrecen turnos de equipos del
         Hospital Italiano. Antes se listaban TODOS (aparecían RX y TC de Hospital
         Central), que además contradecía el cartel de "N turnos de la modalidad". */
      var habil = filas.filter(function (f) { return equipoHabilitado(f.equipo); });

      if (!habil.length) {
        /* Ninguno pasa. Se muestran los equipos que SÍ tenía, para que se vea por qué. */
        var vistos = filas.map(function (f) { return f.equipo; })
                          .filter(function (v, i, a) { return a.indexOf(v) === i; })
                          .slice(0, 8);
        var api0 = panel(p, 'err', '',
          '<div class="lp-bad-big">✗ Ningún turno del Hospital Italiano</div>' +
          '<div class="lp-lbl">Equipos que tiene el paciente (' + filas.length + ' turnos)</div>' +
          vistos.map(function (v) { return '<div class="lp-equipo" style="margin-bottom:5px">' + esc(v) + '</div>'; }).join('') +
          '<div class="lp-tip">Ninguno está en la lista blanca. Se marca rechazada en Lumen.</div>');
        setTimeout(function () { api0.marcar('rechazada', 'sin turno del Italiano'); }, 1800);
        return;
      }

      var mod  = modalidadDePractica((p.practicas || []).join(' | ') || p.practica || '');
      var cand = mod ? habil.filter(function (f) { return modalidadDeEquipo(f.equipo) === mod; }) : [];

      if (cand.length === 1) { evaluarFila(p, cand[0]); return; }
      if (habil.length === 1) { evaluarFila(p, habil[0]); return; }

      /* Se ofrecen las de la modalidad si las hay; si no, todas las habilitadas. */
      var lista = cand.length ? cand : habil;
      elegirFila(p, lista,
        cand.length > 1
          ? 'Hay <b>' + cand.length + '</b> turnos del Italiano de la misma modalidad (' + esc(mod) + '). Elegí vos.'
          : 'No pude cruzar la práctica' + (mod ? ' (' + esc(mod) + ')' : '') + ' con ningún turno del Italiano. Elegí entre los <b>' + habil.length + '</b> habilitados.');
    };

    var arrancarHis = function () {
      var p = leerPayload();
      if (p && p.dni) { ssSet(HIS_JOB, JSON.stringify(p)); }
      else { var g = ss(HIS_JOB); if (g) { try { p = JSON.parse(g); } catch (e) { p = null; } } }
      if (!p || !p.dni) return;

      var campo = document.getElementById('_DOCUMENTOPERSONA');
      if (!campo) return;

      var mismoDni = String(campo.value || '').replace(/\D/g, '') === String(p.dni).replace(/\D/g, '');
      if ((mismoDni && document.getElementById('span__NOMBRE1_0001')) || ss('lumen_his_done_' + p.t)) {
        evaluarHis(p); return;
      }
      ssSet('lumen_his_done_' + p.t, '1');
      setNativeValue(campo, String(p.dni));
      try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow.gxonchange) unsafeWindow.gxonchange(campo); } catch (e) {}
      var btn = document.querySelector('input[name="BUTTON7"]');
      if (!btn) {
        panel(p, 'err', 'No encontré el botón BUSCAR del HIS. Buscá vos el DNI <b>' + esc(p.dni) + '</b>.', '');
        return;
      }
      setTimeout(function () { btn.click(); }, 150);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancarHis);
    else arrancarHis();
    return;
  }

  /* ══════════════ MITAD PAMI ══════════════ */

  function enLogin() { return /cup\.pami\.org\.ar|loginController/i.test(location.href); }

  /* ── fase gate: sacar el DNI por la API interna ───────── */
  function gate(p) {
    ssSet('lumen_gate_' + p.t, '1');
    var body = new URLSearchParams({ orden: p.orden, estado: 'modificar', bene: p.benBase, gp: p.benDv });
    fetch('/controllers/ajax/efectores_detalle.php', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: body
    })
    .then(function (r) { return r.text(); })
    .then(function (txt) {
      var j = null;
      try { j = JSON.parse(txt); } catch (e) {}
      if (!j) {
        panel(p, 'err', 'PAMI no devolvió los datos del afiliado. Lo más probable: <b>se cayó la sesión</b>. Volvé a entrar y reintentá.', '');
        return;
      }
      var af  = Array.isArray(j.afiliado) ? j.afiliado[0] : j.afiliado;
      var ben = af && String(af.n_beneficio || '').replace(/\D/g, '');
      var dni = af && String(af.n_docu || '').replace(/\D/g, '');

      /* GUARDA DURA: la pagina puede traer datos de OTRO paciente (medido: un td.documento
         oculto con el DNI de otra persona). Sin esto se consulta el HIS con el DNI
         equivocado y se valida o rechaza la orden de alguien mas. */
      if (!ben || ben !== String(p.benBase).replace(/\D/g, '')) {
        panel(p, 'err', 'El beneficio que devolvió PAMI (<b>' + esc(ben || '—') +
          '</b>) NO coincide con el de la orden (<b>' + esc(p.benBase) + '</b>). Freno acá.', '');
        return;
      }
      if (!dni) { panel(p, 'err', 'PAMI no trajo el número de documento del afiliado.', ''); return; }

      var q = {}; for (var k in p) q[k] = p[k];
      q.dni = dni; q.fase = 'his'; q.t = Date.now();
      irA(HIS_URL, q);
    })
    .catch(function () {
      panel(p, 'err', 'No pude consultar los datos del afiliado en PAMI (¿sesión caída o sin red?).', '');
    });
  }

  /* ── fase validar: transmision.php ────────────────────── */

  function campoOrden() { return document.querySelector('input[name="n_orden"]'); }

  function camposFecha() {
    var td = document.getElementById('f_turno_desde'), th = document.getElementById('f_turno_hasta');
    if (td && th) return { tipo: 'turno', desde: td, hasta: th };
    var ed = document.getElementById('f_emision_desde'), eh = document.getElementById('f_emision_hasta');
    if (ed && eh) return { tipo: 'emision', desde: ed, hasta: eh };
    return null;
  }

  /* NUNCA por name: los vecinos son "Exportar" y "Trasmision masiva". */
  function botonBuscar() {
    var subs = [].slice.call(document.querySelectorAll('input[type="submit"][name="buscar"]'));
    for (var i = 0; i < subs.length; i++) {
      if (/^buscar$/i.test((subs[i].value || '').trim())) return subs[i];
    }
    return document.getElementById('filtrar') || null;
  }

  /* PAMI RECUERDA LOS FILTROS ENTRE BUSQUEDAS: si queda pegado un c_validada, un n_bate,
     una practica o el tilde "aceptadas por mi usuario", la busqueda vuelve VACIA y parece
     que la orden no existe. Se limpia TODO menos n_orden. */
  function limpiarFiltros(inOrden) {
    var form = inOrden.form || document;
    [].slice.call(form.querySelectorAll('input, select')).forEach(function (el) {
      if (el === inOrden || el.name === 'registros_por_pagina') return;
      var t = (el.type || '').toLowerCase();
      if (t === 'submit' || t === 'button' || t === 'hidden') return;
      if (t === 'checkbox' || t === 'radio') {
        if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
        return;
      }
      if (el.tagName === 'SELECT') {
        var vacia = false;
        for (var i = 0; i < el.options.length; i++) if (el.options[i].value === '') { vacia = true; break; }
        if (vacia && el.value !== '') { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); }
        return;
      }
      if (el.value !== '') setNativeValue(el, '');
    });
  }

  function ejecutar(p) {
    if (!p.orden) { panel(p, 'err', 'Lumen no mandó nro. de orden. No busco: sin orden y sin fechas, PAMI se cuelga.', ''); return; }
    var inOrden = campoOrden();
    if (!inOrden) {
      panel(p, 'err', 'No encontré el buscador. ¿Estás en el <b>Panel de prestaciones</b> y logueado?', '');
      avisarLumen({ accion: 'error', msg: 'no encontre input[name=n_orden]' });
      return;
    }
    limpiarFiltros(inOrden);
    setNativeValue(inOrden, p.orden);
    var f = camposFecha();
    if (f && p.fechas !== 'none') { setNativeValue(f.desde, ''); setNativeValue(f.hasta, ''); }
    ssSet('lumen_done_' + p.t, '1');
    ssSet(LAST_KEY, JSON.stringify(p));
    var btn = botonBuscar();
    if (!btn) { panel(p, 'err', 'Completé los campos pero no encontré el botón <b>Buscar</b>. Apretalo vos.', ''); return; }
    setTimeout(function () { btn.click(); }, 120);
  }

  function filaDe(orden) {
    var trs = [].slice.call(document.querySelectorAll('table tbody tr'));
    var d = String(orden).replace(/\D/g, '');
    for (var i = 0; i < trs.length; i++) {
      var c0 = (trs[i].cells[0] ? trs[i].cells[0].textContent : '').replace(/\D/g, '');
      if (c0 && c0.indexOf(d) !== -1) return trs[i];
    }
    return null;
  }
  function titulo(el) { return (el.getAttribute('data-original-title') || el.getAttribute('title') || '').trim(); }

  function analizarFila(tr) {
    if (!tr) return { caso: 'no-aparece' };
    if (tr.querySelector('i.validar')) return { caso: 'falta' };
    var ic = [].slice.call(tr.querySelectorAll('i'));
    for (var i = 0; i < ic.length; i++) {
      var t = titulo(ic[i]);
      if (/prestaci[oó]n validada/i.test(t)) {
        return { caso: 'validada', fecha: (t.match(/(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}:\d{2})?)/) || [])[1] || '' };
      }
    }
    return { caso: 'raro' };
  }

  function alVolver(p, auto) {
    var r  = analizarFila(filaDe(p.orden));
    var eq = p.equipo ? '<div class="lp-lbl">Equipo (HIS)</div><div class="lp-equipo">' + esc(p.equipo) + '</div>' : '';

    if (r.caso === 'validada') {
      var api = panel(p, 'validada', '',
        '<div class="lp-ok-big">✓ Prestación ya validada</div>' +
        (r.fecha ? '<div class="lp-sub">' + esc(r.fecha) + '</div>' : '') + eq +
        '<div class="lp-tip">Se marca sola en Lumen con tilde verde.</div>');
      /* Solo automatico si la busqueda la disparo este job. Si la tabla es la que PAMI
         restauro de la busqueda anterior (recarga), decide Santiago. */
      if (auto) setTimeout(function () { api.marcar('validada'); }, 1400);
      return;
    }
    if (r.caso === 'falta') {
      copiar(p.benBase);
      panel(p, 'falta', '',
        '<div class="lp-lbl">Afiliado / GP — click para copiar</div>' +
        '<div class="lp-ben"><button class="lp-b1" id="lp-cb">' + esc(p.benBase) + '</button>' +
        '<button class="lp-b2" id="lp-cd">' + esc(p.benDv) + '</button></div>' + eq +
        '<div class="lp-tip">Falta validar. El número largo ya está en el portapapeles: abrí ' +
        '<b>PAMI: Credencial Provisoria</b>, pegalo (los 2 dígitos van en el cuadro chico) y dale ' +
        '<b>GENERAR QR</b>. Escaneá el QR con el celular y volvé acá.</div>',
        function (box) {
          var cb = box.querySelector('#lp-cb'), cd = box.querySelector('#lp-cd');
          if (cb) cb.onclick = function () { copiar(p.benBase); flash(this); };
          if (cd) cd.onclick = function () { copiar(p.benDv);  flash(this); };
        });
      return;
    }
    panel(p, 'err',
      r.caso === 'no-aparece' ? 'La búsqueda no trajo esta orden en el Panel de prestaciones.'
                              : 'La fila apareció pero no reconocí el ícono de ACCIONES.',
      eq + '<div class="lp-tip">Revisá a mano y marcá en Lumen.</div>');
  }

  function arrancarPami() {
    if (enLogin()) return;   /* el reCAPTCHA no se automatiza; no hay nada que hacer aca */
    var p = leerPayload();
    if (p && p.orden) {
      if (p.fase === 'gate' && !ss('lumen_gate_' + p.t)) { gate(p); return; }
      if (p.fase === 'gate') return;                        /* ya se disparo, esperando */
      if (!ss('lumen_done_' + p.t)) { ejecutar(p); return; }
      alVolver(p, true);
      return;
    }
    var last = ss(LAST_KEY);
    if (last) { try { var q = JSON.parse(last); if (filaDe(q.orden)) alVolver(q, false); } catch (e) {} }
  }

  window.addEventListener('hashchange', function () {
    var p = leerPayload();
    if (!p || !p.orden) return;
    if (p.fase === 'gate' && !ss('lumen_gate_' + p.t)) { gate(p); return; }
    if (p.fase !== 'gate' && !ss('lumen_done_' + p.t)) ejecutar(p);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancarPami);
  else arrancarPami();
})();
