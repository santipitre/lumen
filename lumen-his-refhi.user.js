// ==UserScript==
// @name         HIS FUESMEN · limpiar encabezado + N° Referencia HI
// @namespace    lumen.santipitre
// @version      1.7.0
// @description  Oculta los cuadros negros del encabezado del HIS y mueve el N° Ref (badge del Asistente FUESMEN v7.33) a la columna N° Afiliado en las filas H ITAL. No modifica el asistente: lee lo que ese ya pinta.
// @match        http://his.fuesmen.edu.ar:8180/*
// @match        https://his.fuesmen.edu.ar:8180/*
// @run-at       document-end
// @grant        none
// @downloadURL  https://santipitre.github.io/lumen/lumen-his-refhi.user.js
// @updateURL    https://santipitre.github.io/lumen/lumen-his-refhi.user.js
// ==/UserScript==

(function () {
  'use strict';
  if (window.__lumenRefHI) return; window.__lumenRefHI = true;

  var LS = 'lumenHI.';
  // MEDIDO 2026-09-08: el header no matcheaba /^N°\s*Afiliado$/ (i:-1). Match laxo.
  var HDR_RE = /afiliado/i;
  var HDR_ORIG = 'N° Afiliado';
  var HDR_HI = 'N° Referencia HI';

  // Cuadros negros del encabezado del HIS (contador de notificaciones, contador de
  // chat y el iframe del botón de chat). Se editan en vivo con Alt+H.
  var HIDE_DEFAULT = [
    'iframe[src*="hbotonchat"]',
    'img[name="notificacion_cantidad"]',
    'img[src*="bchat_cantidad"]'
  ];

  function lsGet(k, d) { try { var v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }

  var HIDE = lsGet('hide', HIDE_DEFAULT);

  /* ---------------- CSS ---------------- */
  var st = document.createElement('style');
  st.id = 'lumen-refhi-css';
  (document.head || document.documentElement).appendChild(st);

  function pintarCss() {
    var sel = HIDE.filter(Boolean).join(',');
    st.textContent =
      (sel ? sel + '{display:none !important;}\n' : '') +
      // MEDIDO 2026-09-09: sobre el azul del HIS el verde no se leia. Todo con
      // !important porque el CSS del HIS pisaba el fondo y quedaba texto verde sin pastilla.
      '.lumen-ref{color:#0b2a12 !important;background:#FFD84A !important;' +
      'border:1px solid #B8860B !important;border-radius:5px;' +
      'padding:1px 7px !important;font:800 13px/1.35 Segoe UI,sans-serif !important;' +
      'display:inline-block;letter-spacing:.3px;}\n' +
      '.lumen-ref-off{color:#8a8a8a;font:italic 11px Segoe UI,sans-serif;}\n' +
      '.lumen-chip{display:inline-block;margin-left:4px;padding:0 4px;border-radius:3px;' +
      'background:#1f6feb;color:#fff;font:bold 9px Segoe UI,sans-serif;vertical-align:middle;}\n' +
      // Botón rectangular a lo ancho de la celda, alto = 20px (el del ícono anterior).
      // Dibujado en CSS (no como imagen estirada) para que no se deforme en celdas anchas.
      '.lumen-cp{display:flex;align-items:center;justify-content:center;gap:4px;' +
      'width:100%;box-sizing:border-box;height:20px;margin:3px 0 1px;padding:0 4px;' +
      'border:0;border-radius:5px;cursor:pointer;overflow:hidden;' +
      'background:linear-gradient(135deg,#22b0fb 0%,#0d78f7 55%,#014efb 100%);' +
      'box-shadow:0 1px 2px rgba(0,0,0,.35);transition:filter .12s,box-shadow .12s;}\n' +
      '.lumen-cp span{color:#fff;font:800 11px/1 Segoe UI,sans-serif;letter-spacing:.2px;' +
      'white-space:nowrap;text-shadow:0 1px 1px rgba(0,0,0,.25);}\n' +
      '.lumen-cp img{width:13px;height:13px;flex:0 0 auto;display:block;}\n' +
      '.lumen-cp:hover{filter:brightness(1.12);}\n' +
      '.lumen-cp:active{filter:brightness(.92);}\n' +
      '.lumen-cp-ok{background:linear-gradient(135deg,#3ddc7f 0%,#1a7f37 100%) !important;}\n' +
      '.lumen-cp-err{background:linear-gradient(135deg,#ff7b72 0%,#d1242f 100%) !important;}\n' +
      // el botón 📋 del Asistente v7.33 en la columna Turno: lo reemplazo por el ícono azul
      'button.fm-copy-turno{display:none !important;}\n' +
      '.lumen-pick{outline:2px solid #ff3b30 !important;outline-offset:-2px !important;cursor:crosshair !important;}\n' +
      '#lumen-hud{position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#0d1117;color:#c9d1d9;' +
      'border:1px solid #30363d;border-radius:6px;padding:6px 10px;font:11px/1.4 Segoe UI,sans-serif;max-width:420px;}';
  }
  pintarCss();

  function hud(html, ms) {
    var h = document.getElementById('lumen-hud');
    if (!h) { h = document.createElement('div'); h.id = 'lumen-hud'; document.body.appendChild(h); }
    h.innerHTML = html;
    clearTimeout(hud._t);
    if (ms) hud._t = setTimeout(function () { if (h.parentNode) h.remove(); }, ms);
  }

  /* ------------- modo limpieza (Alt+H) ------------- */
  var picking = false, hovered = null;

  function selectorDe(el) {
    if (el.id) return '#' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id);
    var n = el.getAttribute('name');
    if (n) return el.tagName.toLowerCase() + '[name="' + n + '"]';
    var src = el.getAttribute('src');
    if (src) return el.tagName.toLowerCase() + '[src*="' + src.split('/').pop().split('?')[0] + '"]';
    var cl = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/)[0];
    if (cl) return el.tagName.toLowerCase() + '.' + cl;
    var p = [], x = el;
    while (x && x.nodeType === 1 && p.length < 6) {
      var par = x.parentElement; if (!par) break;
      p.unshift(x.tagName.toLowerCase() + ':nth-child(' + ([].indexOf.call(par.children, x) + 1) + ')');
      if (par.id) { p.unshift('#' + par.id); break; }
      x = par;
    }
    return p.join(' > ');
  }

  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && /^r$/i.test(e.key)) {
      HIDE = HIDE_DEFAULT.slice(); lsSet('hide', HIDE); pintarCss();
      hud('Ocultos reseteados a los 3 por defecto.', 2500); return;
    }
    if (e.altKey && /^h$/i.test(e.key)) {
      picking = !picking;
      if (!picking && hovered) { hovered.classList.remove('lumen-pick'); hovered = null; }
      hud(picking
        ? '<b>Modo limpieza ON</b> · click = ocultar · Alt+H salir · Alt+Shift+R reset<br>Ocultos: ' + HIDE.length
        : 'Modo limpieza OFF', picking ? 0 : 1500);
    }
    if (e.key === 'Escape' && picking) {
      picking = false;
      if (hovered) { hovered.classList.remove('lumen-pick'); hovered = null; }
      hud('Modo limpieza OFF', 1200);
    }
  }, true);

  document.addEventListener('mouseover', function (e) {
    if (!picking) return;
    if (hovered) hovered.classList.remove('lumen-pick');
    hovered = e.target;
    if (hovered && hovered !== document.body && hovered !== document.documentElement) hovered.classList.add('lumen-pick');
  }, true);

  document.addEventListener('click', function (e) {
    if (!picking) return;
    var el = e.target;
    if (!el || el === document.body || el === document.documentElement) return;
    if (el.closest && el.closest('tr[id], td[id]') && el.closest('table')) {
      // no dejo ocultar la grilla por accidente
      if (el.closest('[id*="TBL"], .Grid')) { hud('Eso es la grilla — no lo oculto.', 2000); e.preventDefault(); e.stopPropagation(); return; }
    }
    e.preventDefault(); e.stopPropagation();
    var s = selectorDe(el);
    if (s && HIDE.indexOf(s) === -1) { HIDE.push(s); lsSet('hide', HIDE); pintarCss(); }
    hud('<b>Modo limpieza ON</b><br>oculto: <code>' + s + '</code><br>total: ' + HIDE.length, 0);
  }, true);

  var ICON = 'data:image/png;base64,' +
    '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';

  /* ============================================================
     MOTOR DE REFERENCIAS  (Recepción de Orden -> COBERTURANREFERENCIA)
     ------------------------------------------------------------
     "Recepción de Orden" (img#_PRESTACION_XXXX) es un evento de GeneXus:
     no tiene URL propia, hace POST del formulario entero y navega.
     En vez de adivinar el payload, el script lo APRENDE: la primera vez
     que hacés click con el modo aprender puesto, guarda el formulario tal
     cual se envía. Después replica ese POST por fila con fetch(), cambiando
     el índice de la grilla, y lee el span de la respuesta. Sin navegar.
     ============================================================ */
  var REFS = lsGet('refs', {});          // { "4014098": "73315", ... }  cache por turno
  var PROTO = lsGet('post', null);       // { action, campos:{}, idx }
  var aprendiendo = lsGet('aprender', false);

  function guardarProto(f) {
    if (!f || !f.elements) return;
    var d = {}, els = f.elements, i, e;
    for (i = 0; i < els.length; i++) {
      e = els[i];
      if (!e.name) continue;
      if ((e.type === 'checkbox' || e.type === 'radio') && !e.checked) continue;
      d[e.name] = e.value;
    }
    // El evento de GeneXus viaja como  E'PRESTACION'.0001  -> me guardo ese 0001
    // para poder cambiarlo por el índice de cada fila al replicar.
    var base = '', mm;
    for (var k in d) {
      if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
      mm = String(d[k]).match(/'\.(\d{4})\b/);
      if (mm) { base = mm[1]; break; }
    }
    PROTO = {
      action: (f.getAttribute('action') || location.pathname + location.search),
      campos: d, idxBase: base || '0001', t: Date.now()
    };
    lsSet('post', PROTO);
    lsSet('aprender', false); aprendiendo = false;
  }

  // GeneXus termina llamando form.submit() (gxSubmit). Enganchamos ahí y en el evento.
  (function engancharSubmit() {
    try {
      var orig = HTMLFormElement.prototype.submit;
      HTMLFormElement.prototype.submit = function () {
        if (aprendiendo) { try { guardarProto(this); } catch (e) {} }
        return orig.apply(this, arguments);
      };
    } catch (e) {}
    document.addEventListener('submit', function (ev) {
      if (aprendiendo) { try { guardarProto(ev.target); } catch (e) {} }
    }, true);
  })();

  // Reemplaza el índice de fila por el pedido, solo donde viaja el evento.
  function cuerpoPara(idx) {
    var b = new URLSearchParams(), c = PROTO.campos, base = PROTO.idxBase || '0001', k, v;
    for (k in c) {
      if (!Object.prototype.hasOwnProperty.call(c, k)) continue;
      v = c[k];
      if (typeof v === 'string' && v.indexOf("'." + base) >= 0) {
        v = v.split("'." + base).join("'." + idx);
      } else if (v === base && /row|linea|line|index|fila/i.test(k)) {
        v = idx;
      }
      b.set(k, v);
    }
    return b;
  }

  function refDeHtml(html) {
    var m = html.match(/id="span_COBERTURANREFERENCIA_[0-9]+"[^>]*>([^<]*)</i);
    if (m) return m[1].replace(/&nbsp;/g, '').trim();
    m = html.match(/COBERTURANREFERENCIA[^>]*value="([^"]*)"/i);
    return m ? m[1].trim() : '';
  }

  // Secuencial a propósito: GeneXus guarda estado de página por sesión;
  // 15 POST en paralelo se pisan entre sí.
  function traerReferencias(filas, onPaso, onFin) {
    var pend = filas.filter(function (f) { return esHI(f.alias) && f.turno && !REFS[f.turno]; });
    if (!PROTO) { onFin('SIN_PROTO', 0); return; }
    if (!pend.length) { onFin('NADA', 0); return; }
    var i = 0, ok = 0;
    (function paso() {
      if (i >= pend.length) { lsSet('refs', REFS); onFin('OK', ok); return; }
      var f = pend[i++];
      onPaso(i, pend.length, f.turno);
      fetch(PROTO.action, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: cuerpoPara(f.idx)
      }).then(function (r) { return r.text(); })
        .then(function (html) {
          var ref = refDeHtml(html);
          if (ref) { REFS[f.turno] = ref; ok++; }
          lsSet('refs', REFS);
          setTimeout(paso, 250);
        })
        .catch(function () { setTimeout(paso, 250); });
    })();
  }

  /* ---------------- botón copiar ---------------- */
  // La página es HTTP: navigator.clipboard puede no existir -> fallback textarea.
  function copiar(txt) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(String(txt)); return true; } } catch (e) {}
    try {
      var ta = document.createElement('textarea');
      ta.value = String(txt);
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { ta.setSelectionRange(0, ta.value.length); } catch (e) {}
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove(); return ok;
    } catch (e) { return false; }
  }

  function btnCopiar(txt, rotulo) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'lumen-cp';
    b.title = 'Copiar ' + rotulo + ' ' + txt;
    b.setAttribute('data-cp', txt);
    var ic = document.createElement('img'); ic.src = ICON; ic.alt = '';
    var tx = document.createElement('span'); tx.textContent = 'Copiar';
    b.appendChild(ic); b.appendChild(tx);
    b.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var ok = copiar(txt);                        // <- el número de ESTA celda
      b.classList.add(ok ? 'lumen-cp-ok' : 'lumen-cp-err');
      var prevT = b.title;
      tx.textContent = ok ? ('✓ ' + txt) : '✗ error';
      b.title = ok ? ('Copiado ' + txt) : 'No pude copiar';
      setTimeout(function () {
        b.classList.remove('lumen-cp-ok', 'lumen-cp-err');
        tx.textContent = 'Copiar'; b.title = prevT;
      }, 1200);
    }, true);
    return b;
  }

  // Cuelga el botón DEBAJO del número, dentro de la celda (td) para que tome
  // el ancho del cuadro. Idempotente ante los repintados de GeneXus.
  function ponerBoton(el, txt, rotulo) {
    if (!el || !txt) return;
    var cel = (el.closest && el.closest('td')) || el;
    var ya = cel.querySelector('.lumen-cp');
    if (ya) { if (ya.getAttribute('data-cp') === txt) return; ya.remove(); }
    cel.appendChild(btnCopiar(txt, rotulo));
  }

  /* ============================================================
     N° Referencia HI en la columna N° Afiliado
     Fuente del dato: el badge .fm-his-pedido que ya pinta
     annotateHisGrid() del Asistente FUESMEN (PEDIDOMAP = worklist.pedido_med).
     ============================================================ */
  var esHI = function (t) { return /\bH\s*ITAL/i.test(t || ''); };

  // 1º el caché propio (traído del HIS), 2º el badge del Asistente (Supabase).
  function refDeFila(tr, turno) {
    if (turno && REFS[turno]) return REFS[turno];
    if (!tr) return '';
    var b = tr.querySelector('.fm-his-pedido');
    if (!b) return '';
    var m = (b.textContent || '').match(/([0-9]{3,})\s*$/);
    return m ? m[1] : (b.getAttribute('data-ref') || '');
  }

  // Índice de columna por texto de header (fallback cuando no hay id).
  function colPorHeader(re, extra) {
    var ths = document.querySelectorAll('th.GridTitle');
    for (var i = 0; i < ths.length; i++) {
      var t = (ths[i].textContent || '').trim();
      if (re.test(t) || (extra && t === extra)) return i;
    }
    return -1;
  }
  function colAfiliado() { return colPorHeader(HDR_RE, HDR_HI); }
  function colDocumento() { return colPorHeader(/^N\s*[°ºo]?\.?\s*Doc/i); }
  function colTurno() { return colPorHeader(/^Turno$/i); }

  // Santiago (2026-09-09): que el N° Ref NO aparezca en la columna Turno.
  function ocultarBadgesTurno(tr) {
    if (!tr) return;
    var bs = tr.querySelectorAll('.fm-his-pedido');
    for (var i = 0; i < bs.length; i++) bs[i].style.display = 'none';
  }

  function pintar() {
    var alias = document.querySelectorAll('[id^="span_FINANCIADORALIAS_"]');
    if (!alias.length) return;

    var col = colAfiliado();
    var colDoc = colDocumento();
    var colTur = colTurno();
    var filas = [], i, a, tr, afi, td;
    for (i = 0; i < alias.length; i++) {
      a = alias[i];
      tr = a.closest('tr');
      if (!tr) continue;
      // MEDIDO: el id real es span__AFILIADONUMERO_0001 (DOS guiones bajos).
      // Buscar por "contiene" dentro de la fila cubre las dos variantes.
      afi = tr.querySelector('[id*="AFILIADONUMERO"]');
      if (!afi && col >= 0 && tr.children[col]) {
        td = tr.children[col];
        afi = td.querySelector('span') || td;   // fallback por índice de columna
      }
      if (!afi) continue;
      var reg = { alias: (a.textContent || '').trim(), afi: afi, tr: tr, idx: a.id.replace(/^span_FINANCIADORALIAS_/, ''), turno: '' };
      filas.push(reg);

      // N° Doc.: mismo botón de copiar, en todas las filas
      var doc = tr.querySelector('[id*="PACIENTEDOCUMENTOGRILLA"]');
      if (!doc && colDoc >= 0 && tr.children[colDoc]) {
        var tdd = tr.children[colDoc];
        doc = tdd.querySelector('span') || tdd;
      }
      if (doc) {
        var nd = (doc.textContent || '').replace(/[^0-9]/g, '');
        if (nd) ponerBoton(doc, nd, 'N° Doc.');
      }

      // ---- Turno ----
      // MEDIDO: el N° visible NO está en span__TURNONRO_ (viene vacío/oculto); está en
      // un <a href="javascript:abrirpopup(...)">4014098</a>. Y hay DOS headers "Turno"
      // (índices 12 y 15), así que el índice de columna solo sirve de último recurso.
      // 1) el número autoritativo: el input hidden _TURNONRO_XXXX
      var inpT = tr.querySelector('input[name^="_TURNONRO_"], input[name^="TURNONRO_"]');
      var nt = inpT ? String(inpT.value || '').replace(/[^0-9]/g, '') : '';
      if (!nt) {
        var spT = tr.querySelector('[id*="TURNONRO"]');
        if (spT) nt = (spT.textContent || '').replace(/[^0-9]/g, '');
      }
      // 2) la celda: la del <a> que muestra ese número, o la del botón 📋 del Asistente
      var celT = null, k, as;
      if (nt) {
        as = tr.querySelectorAll('a');
        for (k = 0; k < as.length; k++) {
          if ((as[k].textContent || '').replace(/\s/g, '') === nt) { celT = as[k].closest('td'); break; }
        }
      }
      if (!celT) {
        var clip = tr.querySelector('.fm-copy-turno');   // el botón del Asistente v7.33
        if (clip) celT = clip.closest('td');
      }
      if (!celT && nt) {
        var tds = tr.querySelectorAll('td');
        for (k = 0; k < tds.length; k++) {
          if ((tds[k].textContent || '').replace(/\s/g, '').indexOf(nt) === 0) { celT = tds[k]; break; }
        }
      }
      if (!celT && colTur >= 0 && tr.children[colTur]) celT = tr.children[colTur];
      if (celT && nt) ponerBoton(celT, nt, 'N° Turno');
      reg.turno = nt;
    }
    if (!filas.length) return;
    FILAS = filas;

    var todasHI = filas.every(function (f) { return esHI(f.alias); });

    filas.forEach(function (f) {
      if (!esHI(f.alias)) {
        if (f.afi.dataset.lumenOrig != null) {
          f.afi.textContent = f.afi.dataset.lumenOrig;
          delete f.afi.dataset.lumenOrig;
        }
        ocultarBadgesTurno(f.tr);
        return;
      }
      if (f.afi.dataset.lumenOrig == null) f.afi.dataset.lumenOrig = f.afi.textContent;

      var ref = refDeFila(f.tr, f.turno);
      var chip = todasHI ? '' : '<span class="lumen-chip">REF HI</span>';
      var nuevo = ref
        ? '<span class="lumen-ref">' + ref + '</span>' + chip
        : '<span class="lumen-ref-off" title="Ese turno no está en fuesmen_worklist (el parse va atrasado)">sin ref</span>' + chip;
      if (f.afi.getAttribute('data-lumen-ref') !== (ref || '-')) {
        f.afi.innerHTML = nuevo;
        f.afi.setAttribute('data-lumen-ref', ref || '-');
        if (ref) ponerBoton(f.afi, ref, 'N° Referencia HI');
      }

      // El badge original queda duplicado en la celda del Turno. Se esconden TODOS
      // (querySelectorAll: habia filas con tres apilados) y en TODAS las filas, tenga
      // o no ref: Santiago pidio que ese sector quede limpio.
      ocultarBadgesTurno(f.tr);
    });

    var ths = document.querySelectorAll('th.GridTitle');
    for (i = 0; i < ths.length; i++) {
      var t = (ths[i].textContent || '').trim();
      if (HDR_RE.test(t) || t === HDR_HI) {
        if (ths[i].dataset.lumenTh == null) ths[i].dataset.lumenTh = t;
        var quiero = todasHI ? HDR_HI : ths[i].dataset.lumenTh;
        if (t !== quiero) ths[i].textContent = quiero;
        break;
      }
    }
  }

  /* la grilla se repinta en cada postback de GeneXus y el badge del asistente
     llega asincrónico (Supabase), así que reintento */
  var t0;
  new MutationObserver(function () { clearTimeout(t0); t0 = setTimeout(pintar, 200); })
    .observe(document.documentElement, { childList: true, subtree: true });
  [300, 900, 1800, 3200, 5000].forEach(function (ms) { setTimeout(function () { pintar(); panel(); }, ms); });
  pintar();

  /* ---------------- panel de referencias ---------------- */
  var FILAS = [];   // última foto de la grilla (la llena pintar())

  function panel() {
    var hi = FILAS.filter(function (f) { return esHI(f.alias) && f.turno; });
    var falta = hi.filter(function (f) { return !REFS[f.turno]; }).length;
    var p = document.getElementById('lumen-panel');
    if (!hi.length) { if (p) p.remove(); return; }
    if (!p) {
      p = document.createElement('div');
      p.id = 'lumen-panel';
      p.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#0d1117;' +
        'color:#c9d1d9;border:1px solid #30363d;border-radius:8px;padding:8px 10px;' +
        'font:11px/1.5 Segoe UI,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.45);max-width:330px;';
      document.body.appendChild(p);
    }
    var txt, btn;
    if (!PROTO) {
      txt = aprendiendo
        ? '<b style="color:#f0883e">Modo aprender ACTIVO</b><br>Hacé click en el ícono 📄 <b>Recepción de Orden</b> de cualquier fila. Cuando vuelvas (Atrás), ya sé el POST.'
        : '<b>' + falta + '</b> filas H ITAL sin referencia.<br>Todavía no sé cómo pedirla al HIS.';
      btn = aprendiendo ? '' : '<button id="lumen-b1">Aprender (1 click)</button>';
    } else {
      txt = '<b>' + falta + '</b> sin referencia · ' + Object.keys(REFS).length + ' en caché.';
      btn = falta ? '<button id="lumen-b2">Traer referencias</button>' : '';
      btn += '<button id="lumen-b3" style="background:#30363d">Olvidar POST</button>';
    }
    p.innerHTML = '<div style="margin-bottom:6px">' + txt + '</div><div id="lumen-bts">' + btn + '</div>';
    [].forEach.call(p.querySelectorAll('button'), function (b) {
      b.style.cssText += ';font:700 11px Segoe UI;color:#fff;background:#1f6feb;border:0;' +
        'padding:5px 10px;border-radius:6px;cursor:pointer;margin-right:6px;';
    });
    var b1 = p.querySelector('#lumen-b1'), b2 = p.querySelector('#lumen-b2'), b3 = p.querySelector('#lumen-b3');
    if (b1) b1.onclick = function () { aprendiendo = true; lsSet('aprender', true); panel(); };
    if (b3) b3.onclick = function () { PROTO = null; lsSet('post', null); panel(); };
    if (b2) b2.onclick = function () {
      b2.disabled = true;
      traerReferencias(FILAS,
        function (i, n, t) { p.querySelector('#lumen-bts').textContent = 'Trayendo ' + i + '/' + n + ' (turno ' + t + ')…'; },
        function (estado, ok) {
          pintar(); panel();
          if (estado === 'OK' && !ok) hud('Ninguna respuesta trajo el número. El POST aprendido no sirve: "Olvidar POST" y volvé a aprender.', 8000);
        });
    };
  }

  window.LumenRefHI = {
    refs: function () { return REFS; },
    proto: function () { return PROTO; },
    aprender: function () { aprendiendo = true; lsSet('aprender', true); panel(); return 'Hacé click en Recepción de Orden'; },
    traer: function () { var b = document.querySelector('#lumen-b2'); if (b) b.click(); },
    pintar: pintar, panel: panel, ocultos: function () { return HIDE; }, version: '1.6.0'
  };
})();
