/* =====================================================================
   Lumen · Atención temprana — cola de números para ventanilla
   ---------------------------------------------------------------------
   Lo usan DOS páginas: el tablero del recepcionista (emite el número)
   y la pantalla de ventanillas (lo muestra y lo llama).

   MODO DEMO (hoy): la cola vive en el navegador (localStorage) y se
   sincroniza entre pestañas del MISMO navegador del MISMO equipo.
   Entre equipos distintos (tablet → TV de ventanilla) NO se ve: para eso
   hace falta un almacén compartido en la nube (ver CONTRATO abajo).

   PRIVACIDAD: el número NO lleva nombre ni DNI. Lo que se escribe en
   "observación" lo ve cualquiera que mire la pantalla de ventanilla.

   CONTRATO para pasar a la nube (misma forma que usa hoy):
     ticket = { id, letra:'T', num:14, codigo:'T-014', ts:<ms epoch llegada>,
                obs:'texto libre o vacío', estado:'espera'|'llamando'|'atendido' }
     La numeración es por letra y por día (arranca en 001 cada día).
   Sin frameworks; compatible con Chrome/Edge viejos (sin ??, sin ?.).
   ===================================================================== */
(function (w) {
'use strict';

var KEY = 'lumen.at.cola.v1';
var MOTIVOS = [
  { letra:'T', nombre:'Trámite incompleto' },
  { letra:'P', nombre:'Pedido médico' },
  { letra:'N', nombre:'Sin turno hoy' },
  { letra:'G', nombre:'Consulta general' }
];
var OBS_MAX = 140;

var subs = [], mem = null, canal = null;

function pad(n, l){ var s = String(n); while (s.length < l) s = '0' + s; return s; }
function hoy(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); }
function vacio(){ return { fecha: hoy(), cont: {}, items: [] }; }

function leer(){
  var o = null;
  try { o = JSON.parse(w.localStorage.getItem(KEY)); } catch (_) { o = null; }
  if (!o && mem) o = mem;
  if (!o || o.fecha !== hoy() || !o.items || !o.cont) o = vacio();     // cambia el día → arranca de cero
  return o;
}
function avisar(){
  for (var i = 0; i < subs.length; i++) { try { subs[i](); } catch (_) {} }
}
function guardar(o){
  mem = o;
  try { w.localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) {}
  try { if (canal) canal.postMessage('cambio'); } catch (_) {}
  avisar();
}

try { if ('BroadcastChannel' in w) { canal = new w.BroadcastChannel('lumen-at-cola'); canal.onmessage = function () { avisar(); }; } } catch (_) { canal = null; }
w.addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) avisar(); });

function motivo(letra){
  for (var i = 0; i < MOTIVOS.length; i++) if (MOTIVOS[i].letra === letra) return MOTIVOS[i];
  return { letra: letra, nombre: letra };
}

function emitir(letra, obs, tsForzado){
  var o = leer();
  var n = (o.cont[letra] || 0) + 1;
  if (n > 999) n = 1;                                   // 3 dígitos
  o.cont[letra] = n;
  var ts = tsForzado || Date.now();
  var t = { id: letra + pad(n, 3) + '-' + ts, letra: letra, num: n, codigo: letra + '-' + pad(n, 3),
            ts: ts, obs: String(obs || '').replace(/\s+/g, ' ').trim().slice(0, OBS_MAX), estado: 'espera' };
  o.items.push(t);
  guardar(o);
  return t;
}
function cambiar(id, estado){
  var o = leer(), ok = false;
  for (var i = 0; i < o.items.length; i++) if (o.items[i].id === id) { o.items[i].estado = estado; ok = true; }
  if (ok) guardar(o);
  return ok;
}
function listar(){
  return leer().items.slice().sort(function (a, b) { return a.ts - b.ts || a.num - b.num; });
}
function suscribir(fn){ subs.push(fn); }

/* demo: carga números de ejemplo con horarios anteriores */
function sembrar(){
  var ahora = Date.now(), m = 60000;
  emitir('T', 'Trae orden de PAMI, falta validar', ahora - 23 * m);
  emitir('G', '', ahora - 17 * m);
  emitir('P', 'Dice que el pedido lo tiene en el celular', ahora - 12 * m);
  emitir('T', '', ahora - 8 * m);
  emitir('N', 'Viene por turno de otra sede', ahora - 3 * m);
}
function reiniciar(){ guardar(vacio()); }

w.ColaAT = { MOTIVOS: MOTIVOS, OBS_MAX: OBS_MAX, motivo: motivo, emitir: emitir, listar: listar,
             llamar: function (id) { return cambiar(id, 'llamando'); },
             atendido: function (id) { return cambiar(id, 'atendido'); },
             volver: function (id) { return cambiar(id, 'espera'); },
             suscribir: suscribir, sembrar: sembrar, reiniciar: reiniciar };
})(window);
