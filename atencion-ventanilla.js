/* =====================================================================
   Lumen · Ventanilla — pantalla de turnos para el personal de ventanilla
   ---------------------------------------------------------------------
   Muestra los números que genera el tablero de recepción (atencion-cola.js):
   por orden de llegada, con letra+número, horario y observación.
   Cada persona de ventanilla elige en qué puesto está («Ventanilla 2»);
   al llamar un número queda «T-014 → Ventanilla 2».
   Sin nombre ni DNI del paciente (la pantalla queda a la vista del público).
   Sin frameworks; compatible con Chrome/Edge viejos (sin ??, sin ?.).
   ===================================================================== */
(function () {
'use strict';

var C = window.ColaAT;
var ESPERA_AVISO_MIN = 20;          // desde cuántos minutos de espera se marca la fila
var PUESTO_KEY = 'lumen.at.puesto';
var filtro = '*';                   // '*' = todas las letras
var vistos = null;                  // ids ya mostrados (para marcar los "nuevos")
var nuevos = {};
var puesto = '';                    // ventanilla de este equipo
var ocupado = {};                   // ids con una acción en curso (evita doble toque)
var confirmando = '';               // id de «No se presentó» esperando confirmación
var confTimer = null, toastT = null;

var app = document.getElementById('app');   // todo lo que se ve vive acá: se puede mover a una ventana flotante
function $(id){ return app.querySelector('#' + id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function hhmm(ms){ return new Date(ms).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', hour12:false }); }
function minutos(ms){ return Math.max(0, Math.floor((C.ahora() - ms) / 60000)); }
function hace(min){ return min < 1 ? 'recién' : (min < 60 ? 'hace ' + min + ' min' : 'hace ' + Math.floor(min / 60) + ' h ' + (min % 60) + ' min'); }

var ICON = {
  nota:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M15 20v-4a1 1 0 0 1 1-1h4M8 9h8M8 13h4"/></svg>',
  reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
  voz:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/></svg>',
  flecha:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  no:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/></svg>'
};

function toast(msg){
  var n = document.createElement('div'); n.className = 'toast'; n.setAttribute('role', 'alert'); n.textContent = msg;
  var v = app.querySelector('.toast'); if (v) v.remove();
  app.appendChild(n); clearTimeout(toastT); toastT = setTimeout(function () { n.remove(); }, 5000);
}
function fallo(e){ toast(C.mensaje(e)); render(); }

function obsHtml(t){
  return t.obs ? '<span class="obs-t">' + ICON.nota + '<span>' + esc(t.obs) + '</span></span>'
               : '<span class="sin">Sin observación</span>';
}
function pruebaTag(t){ return t.prueba ? '<span class="ptag">PRUEBA</span>' : ''; }

function render(){
  if (!C.listo()) return;
  var all = C.listar();
  var esp = all.filter(function (t) { return t.estado === 'espera'; });
  var llam = all.filter(function (t) { return t.estado === 'llamando'; });

  /* nuevos (para resaltar un rato los que acaban de llegar) */
  if (vistos === null){ vistos = {}; all.forEach(function (t) { vistos[t.id] = 1; }); }
  all.forEach(function (t) { if (!vistos[t.id]){ vistos[t.id] = 1; nuevos[t.id] = Date.now(); } });
  Object.keys(nuevos).forEach(function (k) { if (Date.now() - nuevos[k] > 10000) delete nuevos[k]; });

  $('stat').innerHTML = '<b>' + esp.length + '</b> en espera' + (llam.length ? ' · <b>' + llam.length + '</b> llamando' : '');

  /* barra de la ventana achicada: lo más importante en una línea */
  var mias = llam.filter(function (t) { return t.puesto === puesto; });
  var hayNuevo = Object.keys(nuevos).length > 0;
  $('barInfo').textContent = (hayNuevo ? 'NUEVO · ' : '') + (mias.length ? 'Llamando ' + mias[0].codigo : (esp.length ? 'Próximo ' + esp[0].codigo + ' · ' + esp.length + ' en espera' : 'Sin nadie en espera')) + (puesto ? ' · V' + puesto : '');
  app.querySelector('.top').classList.toggle('pulso', hayNuevo);

  /* llamando: los de mi ventanilla primero */
  llam.sort(function (a, b) { return (b.puesto === puesto) - (a.puesto === puesto) || a.llamadoEn - b.llamadoEn; });
  $('llamando').innerHTML = llam.length ? llam.map(function (t) {
    var mia = t.puesto === puesto, id = esc(t.id), busy = ocupado[t.id] ? ' disabled' : '';
    return '<article class="call' + (mia ? ' mia' : '') + '"><div class="cod">' + esc(t.codigo) + '</div>' +
      '<div class="dest">' + ICON.flecha + '<span>Ventanilla <b>' + esc(t.puesto) + '</b></span>' + (mia ? '<em>la tuya</em>' : '') + '</div>' +
      '<div class="cm">' + esc(C.motivo(t.letra).nombre) + ' · llegó ' + esc(hhmm(t.ts)) + pruebaTag(t) + '</div>' +
      '<div class="cobs">' + obsHtml(t) + '</div>' +
      '<div class="btnrow"><button class="btn primary" data-act="atendido" data-id="' + id + '"' + busy + '>' + ICON.check + 'Atendido</button>' +
      '<button class="btn ghost" data-act="volver" data-id="' + id + '"' + busy + '>Volver a espera</button>' +
      '<button class="btn ghost no' + (confirmando === t.id ? ' conf' : '') + '" data-act="nopresento" data-id="' + id + '"' + busy + '>' + ICON.no + (confirmando === t.id ? '¿Seguro? Tocá de nuevo' : 'No se presentó') + '</button></div></article>';
  }).join('') : '<div class="nadie">' + ICON.voz + '<span>Nadie llamado todavía</span></div>';

  /* filtros por letra (con cantidad en espera) */
  var cuenta = {};
  esp.forEach(function (t) { cuenta[t.letra] = (cuenta[t.letra] || 0) + 1; });
  $('filtros').innerHTML =
    '<button class="fil" data-fil="*" aria-pressed="' + (filtro === '*') + '">Todas <b>' + esp.length + '</b></button>' +
    C.MOTIVOS.map(function (m) {
      return '<button class="fil" data-fil="' + esc(m.letra) + '" aria-pressed="' + (filtro === m.letra) + '" title="' + esc(m.nombre) + '"><i>' + esc(m.letra) + '</i><span class="fn">' + esc(m.nombre) + '</span> <b>' + (cuenta[m.letra] || 0) + '</b></button>';
    }).join('');

  /* cola */
  var vis = esp.filter(function (t) { return filtro === '*' || t.letra === filtro; });
  $('rows').innerHTML = vis.length ? vis.map(function (t) {
    var min = minutos(t.ts), largo = min >= ESPERA_AVISO_MIN, busy = ocupado[t.id] ? ' disabled' : '';
    return '<article class="row' + (largo ? ' largo' : '') + (nuevos[t.id] ? ' nuevo' : '') + '">' +
      '<div class="cod">' + esc(t.codigo) + (nuevos[t.id] ? '<em>NUEVO</em>' : '') + '</div>' +
      '<div class="lleg"><b>' + esc(hhmm(t.ts)) + '</b><span class="esp">' + (largo ? ICON.reloj : '') + esc(hace(min)) + '</span>' + (t.prueba ? '<span class="ptag ptmini">PRUEBA</span>' : '') + '</div>' +
      '<div class="mot">' + esc(C.motivo(t.letra).nombre) + pruebaTag(t) + '</div>' +
      '<div class="obs">' + obsHtml(t) + '</div>' +
      '<div class="act"><button class="btn primary" data-act="llamar" data-id="' + esc(t.id) + '"' + busy + '>' + ICON.voz + 'Llamar</button></div></article>';
  }).join('') : '<div class="vacio">' + ICON.check +
      '<h3>' + (esp.length ? 'No hay nadie en espera con esta letra' : 'No hay nadie en espera') + '</h3>' +
      '<p>' + (esp.length ? 'Tocá «Todas» para ver el resto.' : 'Los números aparecen acá apenas los genera recepción.') + '</p></div>';
}

function reloj(){
  var d = new Date();
  $('clock').textContent = d.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' }) + ' · ' + hhmm(d.getTime());
}

/* ---------- puesto (ventanilla) de este equipo ---------- */
function leerPuesto(){ try { return localStorage.getItem(PUESTO_KEY) || ''; } catch (_) { return ''; } }
function guardarPuesto(v){ puesto = String(v); try { localStorage.setItem(PUESTO_KEY, puesto); } catch (_) {} pintarPuesto(); render(); }
function pintarPuesto(){ $('puestoTxt').textContent = puesto ? 'Ventanilla ' + puesto : 'Elegí tu ventanilla'; $('btnPuesto').classList.toggle('falta', !puesto); }
function elegirPuesto(forzado){
  var n = C.puestos(), h = '';
  for (var i = 1; i <= n; i++) h += '<button class="pbtn" data-p="' + i + '" aria-pressed="' + (String(i) === puesto) + '">' + i + '</button>';
  $('puestoGrid').innerHTML = h;
  $('puestoCancel').hidden = !!forzado || !puesto;
  $('puestoOv').hidden = false;
}
$('btnPuesto').addEventListener('click', function () { elegirPuesto(false); });
$('puestoCancel').addEventListener('click', function () { $('puestoOv').hidden = true; });
$('puestoGrid').addEventListener('click', function (e) {
  var b = e.target.closest('[data-p]'); if (!b) return;
  guardarPuesto(b.dataset.p); $('puestoOv').hidden = true;
});

/* ---------- acciones ---------- */
$('filtros').addEventListener('click', function (e) {
  var b = e.target.closest('[data-fil]'); if (!b) return;
  filtro = b.dataset.fil; render();
});
function accion(e){
  var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  var id = b.dataset.id, a = b.dataset.act, p;
  if (ocupado[id]) return;
  if (a === 'llamar'){
    if (!puesto) return elegirPuesto(true);
    p = C.llamar(id, puesto);
  }
  else if (a === 'atendido') p = C.atendido(id);
  else if (a === 'volver') p = C.volver(id);
  else if (a === 'nopresento'){
    if (confirmando !== id){ confirmando = id; clearTimeout(confTimer); confTimer = setTimeout(function () { confirmando = ''; render(); }, 4000); return render(); }
    confirmando = ''; p = C.cancelar(id);
  }
  if (!p) return;
  ocupado[id] = 1; render();
  p.then(function () { delete ocupado[id]; render(); }, function (er) { delete ocupado[id]; fallo(er); });
}
$('rows').addEventListener('click', accion);
$('llamando').addEventListener('click', accion);

/* ---------- estado de conexión ---------- */
C.alEstado(function (s) {
  var m = $('modeBadge'); m.className = 'mode ' + (s.online ? 'live' : 'demo');
  m.querySelector('span').textContent = s.online ? 'En línea' : 'Sin conexión';
});

/* ---------- vista compacta y ventana flotante ----------
   Una página web no puede quedar «encima» de otros programas por sí sola. Hay dos caminos reales:
   1) Picture-in-Picture de documento (Chrome/Edge 116+): una ventana chica que queda SIEMPRE arriba.
   2) Si el navegador no lo tiene: una ventana emergente chica (se mueve, se minimiza y se cierra,
      pero puede quedar detrás de otra ventana). */
var QS = {}; (location.search || '').replace(/^\?/, '').split('&').forEach(function (p) { var k = p.split('='); if (k[0]) QS[k[0]] = decodeURIComponent(k[1] || ''); });
var popup = QS.flot === '1';          // esta pestaña ES la ventana emergente
var pip = null;                       // ventana de Picture-in-Picture abierta (si hay)
var mini = false, minim = false, delta = null;
var POS_KEY = 'lumen.at.pos';

function flotante(){ return !!pip || popup; }
function ventana(){ return pip || window; }
function aplicar(){
  var cl = app.ownerDocument.documentElement.classList;
  cl.toggle('mini', mini); cl.toggle('flot', flotante()); cl.toggle('min', minim && flotante());
  $('btnFlotar').hidden = !(mini && !flotante());
  $('btnMin').hidden = !flotante();
  $('btnMin').setAttribute('aria-label', minim ? 'Agrandar la ventana' : 'Achicar la ventana');
  $('btnMin').innerHTML = minim
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15l7-7 7 7"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>';
  var admin = C.rol() === 'admin';
  $('btnVista').hidden = !(admin && !flotante());
  $('btnVista').textContent = mini ? 'Vista completa' : 'Vista compacta';
}
function achicar(){
  minim = !minim; aplicar();
  var w = ventana();
  try {
    if (minim){ delta = [360 - w.innerWidth, 84 - w.innerHeight]; w.resizeBy(delta[0], delta[1]); }
    else if (delta){ w.resizeBy(-delta[0], -delta[1]); delta = null; }
  } catch (_) {}
}
function abrirPopup(){
  var pos = null; try { pos = JSON.parse(localStorage.getItem(POS_KEY)); } catch (_) {}
  var W = (pos && pos.w) || 380, H = (pos && pos.h) || 560;
  var X = pos ? pos.x : Math.max(0, (screen.availWidth || 1200) - W - 24), Y = pos ? pos.y : 80;
  var w = window.open('atencion-ventanilla.html?flot=1', 'lumenVentanilla', 'popup=yes,width=' + W + ',height=' + H + ',left=' + X + ',top=' + Y);
  if (!w) toast('El navegador bloqueó la ventana. Permití las ventanas emergentes para este sitio.');
}
function abrirFlotante(){
  if (!mini){ mini = true; aplicar(); }
  if (window.documentPictureInPicture && window.documentPictureInPicture.requestWindow){
    window.documentPictureInPicture.requestWindow({ width: 380, height: 560 }).then(function (w) {
      var esperas = [];
      /* copiamos los estilos como <style> (no dependen de la red); si el navegador no deja leerlos, enlazamos el archivo */
      Array.prototype.forEach.call(document.styleSheets, function (hoja) {
        try {
          var base = (hoja.href || location.href).replace(/[^\/]*$/, '');
          var css = Array.prototype.map.call(hoja.cssRules, function (r) { return r.cssText; }).join('\n')
            .replace(/url\(\s*(['"]?)(?!data:|https?:|\/|#)/g, 'url($1' + base);
          var st = w.document.createElement('style'); st.textContent = css; w.document.head.appendChild(st);
        } catch (_) {
          if (!hoja.href) return;
          var n = w.document.createElement('link'); n.rel = 'stylesheet'; n.href = hoja.href;
          esperas.push(new Promise(function (ok) { n.onload = n.onerror = ok; }));
          w.document.head.appendChild(n);
        }
      });
      w.document.title = 'Turnos · Ventanilla';
      /* esperamos a que carguen los estilos para no mostrar la ventana «pelada» */
      Promise.race([Promise.all(esperas), new Promise(function (ok) { setTimeout(ok, 2000); })]).then(function () {
        pip = w;
        w.document.body.appendChild(app);
        document.getElementById('flotaAviso').hidden = false;
        w.addEventListener('pagehide', traer);
        aplicar(); render();
      });
    }, function () { abrirPopup(); });
  } else abrirPopup();
}
function traer(){
  if (!pip) return;
  pip = null; minim = false; delta = null;
  document.body.insertBefore(app, document.body.firstChild);
  document.getElementById('flotaAviso').hidden = true;
  aplicar(); render();
}
$('btnFlotar').addEventListener('click', abrirFlotante);
$('btnMin').addEventListener('click', achicar);
$('btnVista').addEventListener('click', function () { mini = !mini; aplicar(); render(); });
document.getElementById('btnTraer').addEventListener('click', function () { if (pip) pip.close(); });
/* si la sesión vence mientras flota, el aviso de ingreso sale en la pestaña principal: se la devolvemos */
new MutationObserver(function () { if (pip && document.querySelector('.gate:not([hidden])')) pip.close(); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
/* la ventana emergente recuerda dónde la dejaron */
if (popup){
  setInterval(function () {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: window.screenX, y: window.screenY, w: minim && delta ? window.outerWidth - delta[0] : window.outerWidth, h: minim && delta ? window.outerHeight - delta[1] : window.outerHeight })); } catch (_) {}
  }, 2000);
}

C.suscribir(render);
reloj();
setInterval(function () { reloj(); render(); }, 20000);   // actualiza «hace N min» y el cambio de día
window.GateAT.arrancar({ permitidos: ['ventanilla', 'admin'], prueba: false, listo: function () {
  puesto = leerPuesto();
  if (puesto && Number(puesto) > C.puestos()) puesto = '';
  /* pantalla completa: solo administrador y recepción (la recepción usa la tablet); ventanilla siempre compacta */
  mini = C.rol() === 'ventanilla' || popup || QS.mini === '1';
  aplicar(); pintarPuesto(); render();
  if (!puesto) elegirPuesto(true);
} });
})();
