/* =====================================================================
   Lumen · Ventanilla — pantalla de turnos para el personal de ventanilla
   ---------------------------------------------------------------------
   Muestra los números que genera el tablero de recepción (atencion-cola.js):
   por orden de llegada, con letra+número, horario y observación.
   Sin nombre ni DNI del paciente (la pantalla queda a la vista del público).
   Sin frameworks; compatible con Chrome/Edge viejos (sin ??, sin ?.).
   ===================================================================== */
(function () {
'use strict';

var C = window.ColaAT;
var ESPERA_AVISO_MIN = 20;          // desde cuántos minutos de espera se marca la fila
var filtro = '*';                   // '*' = todas las letras
var vistos = null;                  // ids ya mostrados (para marcar los "nuevos")
var nuevos = {};

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function hhmm(ms){ return new Date(ms).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', hour12:false }); }
function minutos(ms){ return Math.max(0, Math.floor((Date.now() - ms) / 60000)); }
function hace(min){ return min < 1 ? 'recién' : (min < 60 ? 'hace ' + min + ' min' : 'hace ' + Math.floor(min / 60) + ' h ' + (min % 60) + ' min'); }

var ICON = {
  nota:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M15 20v-4a1 1 0 0 1 1-1h4M8 9h8M8 13h4"/></svg>',
  reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
  voz:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/></svg>'
};

function obsHtml(t){
  return t.obs ? '<span class="obs-t">' + ICON.nota + '<span>' + esc(t.obs) + '</span></span>'
               : '<span class="sin">Sin observación</span>';
}

function render(){
  var all = C.listar().filter(function (t) { return t.estado !== 'atendido'; });
  var esp = all.filter(function (t) { return t.estado === 'espera'; });
  var llam = all.filter(function (t) { return t.estado === 'llamando'; });

  /* nuevos (para resaltar un rato los que acaban de llegar) */
  if (vistos === null){ vistos = {}; all.forEach(function (t) { vistos[t.id] = 1; }); }
  all.forEach(function (t) { if (!vistos[t.id]){ vistos[t.id] = 1; nuevos[t.id] = Date.now(); } });
  Object.keys(nuevos).forEach(function (k) { if (Date.now() - nuevos[k] > 10000) delete nuevos[k]; });

  $('stat').innerHTML = '<b>' + esp.length + '</b> en espera' + (llam.length ? ' · <b>' + llam.length + '</b> llamando' : '');

  /* llamando */
  $('llamando').innerHTML = llam.length ? llam.map(function (t) {
    return '<article class="call"><div class="cod">' + esc(t.codigo) + '</div>' +
      '<div class="cm">' + esc(C.motivo(t.letra).nombre) + ' · llegó ' + esc(hhmm(t.ts)) + '</div>' +
      '<div class="cobs">' + obsHtml(t) + '</div>' +
      '<div class="btnrow"><button class="btn primary" data-act="atendido" data-id="' + esc(t.id) + '">' + ICON.check + 'Atendido</button>' +
      '<button class="btn ghost" data-act="volver" data-id="' + esc(t.id) + '">Volver a espera</button></div></article>';
  }).join('') : '<div class="nadie">' + ICON.voz + '<span>Nadie llamado todavía</span></div>';

  /* filtros por letra (con cantidad en espera) */
  var cuenta = {};
  esp.forEach(function (t) { cuenta[t.letra] = (cuenta[t.letra] || 0) + 1; });
  $('filtros').innerHTML =
    '<button class="fil" data-fil="*" aria-pressed="' + (filtro === '*') + '">Todas <b>' + esp.length + '</b></button>' +
    C.MOTIVOS.map(function (m) {
      return '<button class="fil" data-fil="' + m.letra + '" aria-pressed="' + (filtro === m.letra) + '" title="' + esc(m.nombre) + '"><i>' + m.letra + '</i>' + esc(m.nombre) + ' <b>' + (cuenta[m.letra] || 0) + '</b></button>';
    }).join('');

  /* cola */
  var vis = esp.filter(function (t) { return filtro === '*' || t.letra === filtro; });
  $('rows').innerHTML = vis.length ? vis.map(function (t) {
    var min = minutos(t.ts), largo = min >= ESPERA_AVISO_MIN;
    return '<article class="row' + (largo ? ' largo' : '') + (nuevos[t.id] ? ' nuevo' : '') + '">' +
      '<div class="cod">' + esc(t.codigo) + (nuevos[t.id] ? '<em>NUEVO</em>' : '') + '</div>' +
      '<div class="lleg"><b>' + esc(hhmm(t.ts)) + '</b><span class="esp">' + (largo ? ICON.reloj : '') + esc(hace(min)) + '</span></div>' +
      '<div class="mot">' + esc(C.motivo(t.letra).nombre) + '</div>' +
      '<div class="obs">' + obsHtml(t) + '</div>' +
      '<div class="act"><button class="btn primary" data-act="llamar" data-id="' + esc(t.id) + '">' + ICON.voz + 'Llamar</button></div></article>';
  }).join('') : '<div class="vacio">' + ICON.check +
      '<h3>' + (esp.length ? 'No hay nadie en espera con esta letra' : 'No hay nadie en espera') + '</h3>' +
      '<p>' + (esp.length ? 'Tocá «Todas» para ver el resto.' : 'Los números aparecen acá apenas los genera recepción.') + '</p></div>';
}

function reloj(){
  var d = new Date();
  $('clock').textContent = d.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' }) + ' · ' + hhmm(d.getTime());
}

$('filtros').addEventListener('click', function (e) {
  var b = e.target.closest('[data-fil]'); if (!b) return;
  filtro = b.dataset.fil; render();
});
function accion(e){
  var b = e.target.closest('[data-act]'); if (!b) return;
  var id = b.dataset.id, a = b.dataset.act;
  if (a === 'llamar') C.llamar(id);
  else if (a === 'atendido') C.atendido(id);
  else if (a === 'volver') C.volver(id);
}
$('rows').addEventListener('click', accion);
$('llamando').addEventListener('click', accion);
$('btnSembrar').addEventListener('click', function () { C.sembrar(); });
$('btnVaciar').addEventListener('click', function () { C.reiniciar(); vistos = null; nuevos = {}; render(); });

C.suscribir(render);
reloj(); render();
setInterval(function () { reloj(); render(); }, 20000);   // actualiza «hace N min» y el cambio de día
})();
