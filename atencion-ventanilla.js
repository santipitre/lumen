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

function $(id){ return document.getElementById(id); }
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
  var v = document.querySelector('.toast'); if (v) v.remove();
  document.body.appendChild(n); clearTimeout(toastT); toastT = setTimeout(function () { n.remove(); }, 5000);
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
      return '<button class="fil" data-fil="' + esc(m.letra) + '" aria-pressed="' + (filtro === m.letra) + '" title="' + esc(m.nombre) + '"><i>' + esc(m.letra) + '</i>' + esc(m.nombre) + ' <b>' + (cuenta[m.letra] || 0) + '</b></button>';
    }).join('');

  /* cola */
  var vis = esp.filter(function (t) { return filtro === '*' || t.letra === filtro; });
  $('rows').innerHTML = vis.length ? vis.map(function (t) {
    var min = minutos(t.ts), largo = min >= ESPERA_AVISO_MIN, busy = ocupado[t.id] ? ' disabled' : '';
    return '<article class="row' + (largo ? ' largo' : '') + (nuevos[t.id] ? ' nuevo' : '') + '">' +
      '<div class="cod">' + esc(t.codigo) + (nuevos[t.id] ? '<em>NUEVO</em>' : '') + '</div>' +
      '<div class="lleg"><b>' + esc(hhmm(t.ts)) + '</b><span class="esp">' + (largo ? ICON.reloj : '') + esc(hace(min)) + '</span></div>' +
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

C.suscribir(render);
reloj();
setInterval(function () { reloj(); render(); }, 20000);   // actualiza «hace N min» y el cambio de día
window.GateAT.arrancar({ permitidos: ['ventanilla', 'admin'], prueba: false, listo: function () {
  puesto = leerPuesto();
  if (puesto && Number(puesto) > C.puestos()) puesto = '';
  pintarPuesto(); render();
  if (!puesto) elegirPuesto(true);
} });
})();
