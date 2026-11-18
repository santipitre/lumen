/* =====================================================================
   Lumen · Atención temprana — cola de números (Supabase)
   ---------------------------------------------------------------------
   Lo usan las tres pantallas: tablero de recepción (emite), pantalla de
   ventanilla (llama) y panel del administrador (estadísticas).

   ROLES (tabla at_roles + usuarios.rol = 'admin'):
     recepcion  → emite números           (atencion-temprana.html)
     ventanilla → llama / atiende         (atencion-ventanilla.html)
     admin      → todo + estadísticas     (atencion-admin.html)

   Todo pasa por funciones SQL con guarda de rol (at_*): las tablas no
   tienen permisos directos. Hace falta sesión de Lumen (Google / OTP).

   PRIVACIDAD: el número NO lleva nombre ni DNI. Lo que se escribe en
   «observación» lo ve cualquiera que mire la pantalla de ventanilla.

   Requiere cargados antes: supabase-js (CDN) y spcd-supabase.js.
   Sin frameworks; compatible con Chrome/Edge viejos (sin ??, sin ?.).
   ===================================================================== */
(function (w) {
'use strict';

var SESSION_KEY = 'spcd_session', SESSION_TO = 8 * 60 * 60 * 1000;   // misma política que el resto de Lumen
var POLL_MS = 4000;
var OBS_MAX = 140;
var MOTIVOS = [
  { letra:'T', nombre:'Trámite incompleto' },
  { letra:'P', nombre:'Pedido médico' },
  { letra:'N', nombre:'Sin turno hoy' },
  { letra:'G', nombre:'Consulta general' }
];

var info = { rol: null, nombre: '', puestos: 4 };
var items = [], offset = 0, online = true, authOk = true, listo = false;
var subs = [], evs = [], timer = null, canal = null, vuelo = null, prueba = false;

/* ---------- sesión y red ---------- */
function sesion(){
  try { var s = JSON.parse(w.localStorage.getItem(SESSION_KEY)); return (s && s.user && (Date.now() - s.ts < SESSION_TO)) ? s : null; }
  catch (_) { return null; }
}
function err(code, msg, extra){
  var e = new Error(msg || code); e.code = code;
  if (extra) for (var k in extra) e[k] = extra[k];
  return e;
}
function rpc(fn, args){
  if (typeof getSBHeaders !== 'function' || typeof SUPABASE_URL === 'undefined')
    return Promise.reject(err('CARGA', 'No se cargó spcd-supabase.js'));
  return getSBHeaders().then(function (h) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: h, body: JSON.stringify(args || {}) });
  }).then(function (r) {
    if (r.ok) return r.status === 204 ? null : r.json();
    return r.json().then(function (j) { return j; }, function () { return {}; }).then(function (j) {
      var msg = (j && j.message) || ('HTTP ' + r.status);
      var code = r.status === 401 ? 'NOAUTH' : (r.status === 403 || /No autorizado/.test(msg)) ? 'PERMISO' : (/^[A-Z_]{4,}$/.test(msg) ? msg : 'ERROR');
      throw err(code, msg, { status: r.status });
    });
  }, function (e) {
    if (e && e.code) throw e;
    throw err('RED', 'Sin conexión');
  });
}
function mensaje(e){
  var c = e && e.code;
  if (c === 'RED') return 'Sin conexión. Revisá el WiFi y volvé a intentar.';
  if (c === 'NOAUTH') return 'La sesión venció. Ingresá de nuevo.';
  if (c === 'PERMISO') return 'Tu usuario no tiene permiso para esta acción.';
  if (c === 'ESTADO_CAMBIO') return 'Otra persona ya cambió este número. Se actualizó la lista.';
  if (c === 'PUESTO_INVALIDO') return 'Ese puesto no existe. Elegí otro.';
  if (c === 'LETRA_INVALIDA') return 'Esa letra no está habilitada.';
  if (c === 'NUMEROS_AGOTADOS') return 'Se agotaron los números de esa letra por hoy.';
  return (e && e.message) || 'No se pudo completar la acción.';
}

/* ---------- datos ---------- */
function ms(s){ var n = Date.parse(s); return isNaN(n) ? null : n; }
function mapear(t){
  return { id: t.id, codigo: t.codigo, letra: t.letra, num: t.num, obs: t.obs || '', estado: t.estado,
           ts: ms(t.ts), llamadoEn: t.llamado_en ? ms(t.llamado_en) : null, puesto: t.puesto || '', prueba: !!t.prueba };
}
function avisar(){ for (var i = 0; i < subs.length; i++) { try { subs[i](); } catch (_) {} } }
function avisarEstado(){ for (var i = 0; i < evs.length; i++) { try { evs[i]({ online: online, auth: authOk }); } catch (_) {} } }

function refrescar(){
  if (vuelo) return vuelo;
  vuelo = rpc('at_listar').then(function (r) {
    items = (r.items || []).map(mapear);
    var srv = ms(r.ahora); if (srv) offset = srv - Date.now();
    var cambio = !online || !authOk;
    online = true; authOk = true; listo = true; vuelo = null;
    avisar(); if (cambio) avisarEstado();
    return items;
  }, function (e) {
    vuelo = null;
    var antes = online + '|' + authOk;
    if (e.code === 'NOAUTH') authOk = false; else if (e.code === 'RED') online = false;
    if (antes !== online + '|' + authOk) avisarEstado();
    throw e;
  });
  return vuelo;
}
function silencioso(){ refrescar().then(null, function () {}); }
function empujar(){ try { if (canal) canal.postMessage('cambio'); } catch (_) {} }

function iniciarPolling(){
  if (timer) return;
  timer = setInterval(function () {
    if (w.document.visibilityState === 'hidden') return;
    if (!sesion()) { if (authOk) { authOk = false; avisarEstado(); } return; }
    silencioso();
  }, POLL_MS);
  w.document.addEventListener('visibilitychange', function () { if (w.document.visibilityState === 'visible') silencioso(); });
  w.addEventListener('online', silencioso);
  try {
    if ('BroadcastChannel' in w) { canal = new w.BroadcastChannel('lumen-at-cola-v2'); canal.onmessage = silencioso; }
  } catch (_) { canal = null; }
}

/* init(): comprueba sesión y rol, carga letras y puestos, empieza a sincronizar.
   Rechaza con code NOAUTH (sin sesión), SINROL (sin rol de atención), RED o CARGA. */
function init(opts){
  prueba = !!(opts && opts.prueba);
  if (!sesion()) return Promise.reject(err('NOAUTH', 'Sin sesión'));
  return rpc('at_mi_rol').then(function (r) {
    if (!r || !r.rol) throw err('SINROL', 'Sin rol de atención');
    info.rol = r.rol; info.nombre = r.nombre || '';
    return rpc('at_catalogo');
  }).then(function (c) {
    if (c.motivos && c.motivos.length){ MOTIVOS.length = 0; for (var i = 0; i < c.motivos.length; i++) MOTIVOS.push(c.motivos[i]); }
    info.puestos = c.puestos || 4;
    return refrescar();
  }).then(function () { iniciarPolling(); return info; });
}

function motivo(letra){
  for (var i = 0; i < MOTIVOS.length; i++) if (MOTIVOS[i].letra === letra) return MOTIVOS[i];
  return { letra: letra, nombre: letra };
}
function listar(){
  return items.slice().sort(function (a, b) { return a.ts - b.ts || a.num - b.num; });
}
function ahora(){ return Date.now() + offset; }

/* posición de un número dentro de la espera (arrival order). null si ya no está esperando. */
function delante(id){
  var esp = listar().filter(function (t) { return t.estado === 'espera'; });
  for (var i = 0; i < esp.length; i++) if (esp[i].id === id) {
    var mia = esp[i], misma = 0;
    for (var j = 0; j < i; j++) if (esp[j].letra === mia.letra) misma++;
    return { total: i, misma: misma, letra: mia.letra };
  }
  return null;
}

/* ---------- acciones ---------- */
function accion(fn, args){
  return rpc(fn, args).then(function (r) { empujar(); silencioso(); return r; }, function (e) {
    if (e.code === 'ESTADO_CAMBIO') silencioso();
    throw e;
  });
}
function emitir(letra, obs){
  var o = String(obs || '').replace(/\s+/g, ' ').trim().slice(0, OBS_MAX);
  return rpc('at_emitir', { p_letra: letra, p_obs: o, p_prueba: prueba }).then(function (t) {
    empujar(); silencioso();
    return mapear(t);
  });
}

w.ColaAT = {
  MOTIVOS: MOTIVOS, OBS_MAX: OBS_MAX,
  init: init, rpc: rpc, mensaje: mensaje, sesion: sesion,
  rol: function () { return info.rol; }, nombre: function () { return info.nombre; }, puestos: function () { return info.puestos; },
  motivo: motivo, listar: listar, delante: delante, ahora: ahora, refrescar: refrescar,
  listo: function () { return listo; }, enLinea: function () { return online; }, sesionOk: function () { return authOk && !!sesion(); },
  emitir: emitir,
  llamar:   function (id, puesto) { return accion('at_llamar', { p_id: id, p_puesto: String(puesto) }); },
  atendido: function (id) { return accion('at_atender', { p_id: id }); },
  volver:   function (id) { return accion('at_volver', { p_id: id }); },
  cancelar: function (id) { return accion('at_cancelar', { p_id: id }); },
  suscribir: function (fn) { subs.push(fn); },
  alEstado: function (fn) { evs.push(fn); }
};
})(window);
