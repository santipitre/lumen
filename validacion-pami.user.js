// ==UserScript==
// @name         Lumen · Validación PAMI
// @namespace    https://santipitre.github.io/lumen/
// @version      4.0.0
// @description  Tres ventanas abiertas al mismo tiempo (Lumen, PAMI, HIS): cada una se queda en su sitio y toma del bus el paso que le toca. Ninguna navega a otro dominio ni se cierra.
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

  /* v4.0.0 — EL BUS. Claves compartidas entre pestanas Y entre dominios (GM_setValue). */
  var JOB_KEY   = 'lumen_val_job';    /* el trabajo a hacer: {id, fase, dest, ...} */
  var HB_PAMI   = 'lumen_hb_pami';    /* latido de la ventana de PAMI */
  var HB_HIS    = 'lumen_hb_his';     /* latido de la ventana del HIS */
  var JOB_LOCAL = 'lumen_job_local';  /* sessionStorage: el job sobrevive al submit */
  var VISTO_KEY = 'lumen_job_visto';  /* ultimo job que tomo ESTA pestana */
  var TAB_KEY   = 'lumen_tab_id';
  var PAUSA     = 1800;               /* pausa visible entre saltos, en ms */
  var ROL       = '';                 /* que ventana soy, para el cartel */

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
  /* ══════════ EL BUS DE TRABAJOS (v4.0.0) ══════════
     ANTES: una sola ventana saltaba PAMI -> HIS -> PAMI con location.href. Se veia
     una cosa por vez, y la ventana del HIS que Santiago tenia abierta no se usaba
     nunca (una ventana abierta a mano NO se puede alcanzar por nombre: window.open
     con target solo encuentra ventanas del mismo grupo de navegacion).
     AHORA: cada ventana se queda en su dominio y toma del bus el paso que le toca.
     El bus es GM_setValue, que se comparte entre pestanas y entre dominios y NO
     necesita opener. Nadie navega fuera de su sitio, nadie se cierra. */
  function gmGet(k, d) { try { return GM_getValue(k, d); } catch (e) { return d; } }
  function gmSet(k, v) { try { GM_setValue(k, v); return true; } catch (e) { return false; } }

  function tabId() {
    var t = ss(TAB_KEY);
    if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); ssSet(TAB_KEY, t); }
    return t;
  }
  /* Latido. Lumen tiene que saber si la ventana esta abierta ANTES de disparar:
     abrirle una ventana nueva le desarmaria la disposicion en pantalla. */
  function latir(key, extraFn) {
    var pulso = function () {
      var v = { ts: Date.now(), tab: tabId(), url: location.href };
      try { var e = extraFn && extraFn(); for (var k in (e || {})) v[k] = e[k]; } catch (er) {}
      gmSet(key, v);
    };
    pulso();
    setInterval(pulso, 2500);
  }
  function publicarJob(p) {
    p.id = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    p.ts = Date.now();
    gmSet(JOB_KEY, p);
    return p;
  }
  /* Cada pestana anota el ultimo job que tomo: asi el submit que recarga la pagina
     no lo vuelve a disparar desde cero. */
  function escucharJobs(dest, fn) {
    var tomar = function (j) {
      if (!j || !j.id || j.dest !== dest) return;
      if (ss(VISTO_KEY) === j.id) return;
      ssSet(VISTO_KEY, j.id);
      /* Si por error hay DOS pestanas del mismo sitio abiertas, que trabaje una sola:
         se marca el job y a los 200 ms se relee quien quedo. */
      var mio = tabId();
      gmSet('lumen_claim_' + j.id, mio);
      setTimeout(function () {
        if (gmGet('lumen_claim_' + j.id, mio) !== mio) return;
        ssSet(JOB_LOCAL, JSON.stringify(j));
        fn(j);
      }, 200);
    };
    try { GM_addValueChangeListener(JOB_KEY, function (k, viejo, nuevo) { tomar(nuevo); }); } catch (e) {}
    var j0 = gmGet(JOB_KEY, null);
    if (j0 && j0.dest === dest && (Date.now() - (j0.ts || 0)) < 60000) tomar(j0);
  }
  function jobLocal() {
    var t = ss(JOB_LOCAL);
    if (!t) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }
  /* Compatibilidad con una copia vieja de Lumen que todavia navegue por hash. */
  function adoptarHash(dest) {
    var p = leerPayload();
    if (!p || !p.orden) return null;
    p.id = p.id || ('hash-' + p.t);
    p.dest = dest;
    ssSet(VISTO_KEY, p.id);
    ssSet(JOB_LOCAL, JSON.stringify(p));
    return p;
  }

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

  /* Cartel de PROGRESO: sin botones. Es lo que pidio Santiago — mirar las tres
     ventanas al mismo tiempo y entender que esta haciendo cada una. */
  function cerrarProg() { var e = document.getElementById('lumen-prog'); if (e) e.remove(); }

  function panelProg(p, tono, titulo, detalle) {
    if (!document.body) return null;
    var col = COLORES[tono] || COLORES.elegir;
    cerrarProg();
    var box = document.createElement('div');
    box.id = 'lumen-prog';
    box.innerHTML =
      '<style>#lumen-prog{position:fixed;top:14px;right:14px;z-index:2147482999;width:330px;overflow:hidden;' +
      'font-family:Inter,system-ui,Segoe UI,sans-serif;background:#0E1521;color:#F1F5F9;' +
      'border:1px solid rgba(148,163,184,.35);border-radius:13px;box-shadow:0 14px 44px rgba(0,0,0,.6);font-size:13px}' +
      '#lumen-prog .pg-h{padding:9px 13px;background:linear-gradient(135deg,' + col[0] + ',' + col[1] + ');' +
      'color:' + col[2] + ';font-weight:800;letter-spacing:1.4px;font-size:11px;text-transform:uppercase}' +
      '#lumen-prog .pg-bar{height:3px;background:rgba(148,163,184,.18)}' +
      '#lumen-prog .pg-bar i{display:block;height:3px;width:36%;background:' + col[1] + ';animation:lpg 1.15s ease-in-out infinite}' +
      '@keyframes lpg{0%{margin-left:0}50%{margin-left:64%}100%{margin-left:0}}' +
      '#lumen-prog .pg-b{padding:12px 13px}' +
      '#lumen-prog .pg-t{font-weight:700;font-size:13.5px;line-height:1.35;margin-bottom:4px}' +
      '#lumen-prog .pg-n{color:#94A3B8;font-size:11.5px;font-family:ui-monospace,Menlo,monospace;margin-bottom:9px}' +
      '#lumen-prog .pg-d{font-size:11.5px;color:#8FA0B5;line-height:1.55}' +
      '</style>' +
      '<div class="pg-h">' + esc(ROL) + ' · trabajando</div>' +
      '<div class="pg-bar"><i></i></div>' +
      '<div class="pg-b">' +
        '<div class="pg-t">' + titulo + '</div>' +
        '<div class="pg-n">' + esc(p.nombre || '') + (p.orden ? ' · ' + esc(p.orden) : '') + '</div>' +
        '<div class="pg-d">' + (detalle || '') + '</div>' +
      '</div>';
    document.body.appendChild(box);
    return box;
  }

  function panel(p, caso, aviso, cuerpoHTML, onMount) {
    cerrarProg();
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

    /* La PAGINA no puede escribir en el bus (GM_* no existe en su contexto): le pasa
       el trabajo al userscript por postMessage y el userscript lo publica. */
    var ultimoOut = '';
    var tomarDeLaPagina = function (raw) {
      if (!raw || raw === ultimoOut) return;
      ultimoOut = raw;
      try { publicarJob(JSON.parse(raw)); } catch (e) {}
    };
    window.addEventListener('message', function (ev) {
      if (ev.origin !== location.origin) return;
      var d = ev.data;
      if (!d || d.src !== 'lumen-page') return;
      if (d.accion === 'job' && d.pay) tomarDeLaPagina(JSON.stringify(d.pay));
    });
    /* Segundo camino, por si postMessage no cruza el sandbox de Tampermonkey:
       la pagina deja el trabajo en localStorage (mismo origen) y aca se lee. */
    try { ultimoOut = localStorage.getItem('lumen_job_out') || ''; } catch (e) {}
    setInterval(function () {
      try { tomarDeLaPagina(localStorage.getItem('lumen_job_out')); } catch (e) {}
    }, 300);

    /* PRESENCIA de las otras dos ventanas. Lumen frena si falta alguna en vez de
       abrirla: una ventana nueva le desarma a Santiago la disposicion en pantalla. */
    var VIVO = 9000;
    var mirar = function () {
      var pa = gmGet(HB_PAMI, null), hi = gmGet(HB_HIS, null), n = Date.now();
      window.postMessage({
        src: 'lumen-bridge', accion: 'presencia',
        pami:    !!(pa && (n - (pa.ts || 0)) < VIVO),
        pamiUrl: (pa && pa.url) || '',
        his:     !!(hi && (n - (hi.ts || 0)) < VIVO),
        hisUrl:  (hi && hi.url) || '',
        hisOk:   !!(hi && hi.lista)
      }, location.origin);
    };

    /* Se manda la version instalada para que Lumen la muestre. Sin esto no hay forma
        de saber si Tampermonkey se quedo con una version vieja: la pagina se ve igual
        y el circuito falla distinto. */
    var VER = '?';
    try { VER = (GM_info && GM_info.script && GM_info.script.version) || '?'; } catch (e) {}
    setTimeout(function () {
      window.postMessage({ src: 'lumen-bridge', accion: 'puente', ver: VER }, location.origin);
      mirar();
    }, 400);
    setInterval(mirar, 2000);
    return;
  }

  /* ══════════════ MITAD HIS FUESMEN ══════════════ */
  if (/his\.fuesmen\.edu\.ar/i.test(location.hostname)) {

    ROL = 'HIS FUESMEN';

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

    /* El HIS NO navega a PAMI: publica el trabajo y se queda donde esta. La ventana
       de PAMI, que ya esta abierta al lado, lo levanta sola. */
    var seguirAValidar = function (p, fila) {
      var q = {};
      for (var k in p) q[k] = p[k];
      q.fase   = 'validar';
      q.dest   = 'pami';
      q.equipo = fila ? fila.equipo : '';
      publicarJob(q);
    };

    var evaluarFila = function (p, f) {
      if (equipoHabilitado(f.equipo)) {
        panel(p, 'validada', '',
          '<div class="lp-ok-big">✓ Equipo habilitado</div>' +
          '<div class="lp-lbl">Equipo</div><div class="lp-equipo">' + esc(f.equipo) + '</div>' +
          '<div class="lp-tip">' + esc(f.centro) + ' · ' + esc(f.estudio) + ' · ' + esc(f.fecha) +
          '<br>Le paso el trabajo a la ventana de <b>PAMI</b>. Esta ventana se queda acá.</div>');
        setTimeout(function () { seguirAValidar(p, f); }, PAUSA);
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

    var correrHis = function (p) {
      if (!p || !p.dni) return;
      var campo = document.getElementById('_DOCUMENTOPERSONA');
      if (!campo) {
        /* La ventana quedo en otra pantalla del HIS. Se vuelve a hturno: es navegacion
           DENTRO del HIS, la ventana sigue siendo la del HIS y no se cierra. */
        panelProg(p, 'elegir', 'Vuelvo a <b>Consulta de Turnos</b>…',
          'Esta ventana no está en <b>hturno</b>. Navego dentro del HIS, no salgo de acá.');
        setTimeout(function () { location.href = HIS_URL; }, 800);
        return;
      }
      var mismoDni = String(campo.value || '').replace(/\D/g, '') === String(p.dni).replace(/\D/g, '');
      if ((mismoDni && document.getElementById('span__NOMBRE1_0001')) || ss('lumen_his_done_' + p.id)) {
        evaluarHis(p); return;
      }
      ssSet('lumen_his_done_' + p.id, '1');
      panelProg(p, 'elegir', 'Buscando el DNI <b>' + esc(p.dni) + '</b> en el HIS…',
        'Completo <b>N° Doc.</b> y aprieto <b>BUSCAR</b>. La grilla se recarga sola y después leo los equipos.');
      setNativeValue(campo, String(p.dni));
      try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow.gxonchange) unsafeWindow.gxonchange(campo); } catch (e) {}
      var btn = document.querySelector('input[name="BUTTON7"]');
      if (!btn) {
        panel(p, 'err', 'No encontré el botón BUSCAR del HIS. Buscá vos el DNI <b>' + esc(p.dni) + '</b>.', '');
        return;
      }
      setTimeout(function () { btn.click(); }, 300);
    };

    var arrancarHis = function () {
      latir(HB_HIS, function () { return { lista: !!document.getElementById('_DOCUMENTOPERSONA') }; });
      escucharJobs('his', function (j) { setTimeout(function () { correrHis(j); }, 400); });
      var ph = adoptarHash('his');
      if (ph && ph.dni) { correrHis(ph); return; }
      var p = jobLocal();
      if (p && p.dni && p.dest === 'his') correrHis(p);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancarHis);
    else arrancarHis();
    return;
  }

  /* ══════════════ MITAD PAMI ══════════════ */

  ROL = 'PAMI';

  function enLogin() { return /cup\.pami\.org\.ar|loginController/i.test(location.href); }

  /* ── fase gate: sacar el DNI por la API interna ───────── */
  function gate(p) {
    ssSet('lumen_gate_' + p.id, '1');
    panelProg(p, 'elegir', 'Consultando el afiliado en PAMI…',
      'API interna del portal. Saco el <b>DNI</b> y controlo que el beneficio que devuelve ' +
      'sea el de <b>esta</b> orden (la página puede tener datos de otro paciente).');
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

      /* NO se navega al HIS: se publica el trabajo y la ventana del HIS, que ya esta
         abierta al lado, lo levanta sola. Esta ventana se queda en PAMI. */
      panelProg(p, 'validada', 'DNI <b>' + esc(dni) + '</b> ✓',
        'Beneficio verificado. Le paso el trabajo a la ventana del <b>HIS</b>. ' +
        'Esta ventana se queda acá, esperando para validar.');
      var q = {}; for (var k in p) q[k] = p[k];
      q.dni = dni; q.fase = 'his'; q.dest = 'his';
      setTimeout(function () { publicarJob(q); }, PAUSA);
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
    ssSet('lumen_done_' + p.id, '1');
    ssSet(LAST_KEY, JSON.stringify(p));
    var btn = botonBuscar();
    if (!btn) { panel(p, 'err', 'Completé los campos pero no encontré el botón <b>Buscar</b>. Apretalo vos.', ''); return; }
    panelProg(p, 'elegir', 'Buscando la orden en el Panel de prestaciones…',
      'Limpié todos los filtros (PAMI los recuerda entre búsquedas), puse el nro. de orden ' +
      'y vacié las fechas de turno. Apretando <b>Buscar</b>.');
    setTimeout(function () { btn.click(); }, 250);
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

  /* El unico movimiento que hace esta ventana es DENTRO de pami.org.ar (ir al Panel
     de prestaciones). Nunca sale a otro dominio y nunca se cierra. */
  function correrPami(p) {
    if (!p || !p.orden) return;
    if (enLogin()) {
      panel(p, 'err', 'Se cayó la sesión de PAMI (el reCAPTCHA no se automatiza). Entrá de nuevo y reintentá.', '');
      return;
    }
    if (p.fase === 'gate') {
      if (!ss('lumen_gate_' + p.id)) gate(p);
      return;                                   /* ya se disparo: espera al HIS */
    }
    if (!/transmision\.php/i.test(location.pathname)) {
      panelProg(p, 'elegir', 'Voy al <b>Panel de prestaciones</b>…',
        'Navego dentro de PAMI, a <b>transmision.php</b>. Es la única página donde se valida.');
      setTimeout(function () { location.href = PAMI_VALIDAR; }, 800);
      return;
    }
    if (!ss('lumen_done_' + p.id)) { ejecutar(p); return; }
    alVolver(p, true);
  }

  function arrancarPami() {
    latir(HB_PAMI, function () { return { panel: /transmision\.php/i.test(location.pathname), login: enLogin() }; });
    escucharJobs('pami', function (j) { setTimeout(function () { correrPami(j); }, 400); });

    var ph = adoptarHash('pami');
    if (ph) { correrPami(ph); return; }

    var p = jobLocal();
    if (p && p.dest === 'pami' && p.orden) { correrPami(p); return; }

    if (enLogin()) return;
    var last = ss(LAST_KEY);
    if (last) { try { var q = JSON.parse(last); if (filaDe(q.orden)) alVolver(q, false); } catch (e) {} }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancarPami);
  else arrancarPami();
})();
