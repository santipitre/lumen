/* =====================================================================
   Lumen · Atención temprana — acceso por rol (pantalla de entrada)
   ---------------------------------------------------------------------
   GateAT.arrancar({ permitidos:['recepcion','admin'], prueba:true|false, listo:function(info){…} })
     · Muestra «Conectando…» hasta saber quién es el usuario.
     · Sin sesión / sin rol / rol equivocado / sin red → pantalla clara con el botón que corresponde.
     · Si la sesión vence con la pantalla abierta, vuelve a pedir ingreso (no pierde lo que está a la vista).
     · Sin conexión: franja arriba con aviso (los datos en pantalla pueden estar atrasados).
   Requiere atencion-cola.js. Sin frameworks; sin ??, sin ?..
   ===================================================================== */
(function (w) {
'use strict';
var d = w.document, ov = null, banner = null, cfg = null, activo = false;

var PAGINAS = { recepcion:['atencion-temprana.html','Recepción (tablet)'], ventanilla:['atencion-ventanilla.html','Ventanilla'], admin:['atencion-admin.html','Administrador'] };
var ROLES = { recepcion:'Recepción', ventanilla:'Ventanilla', admin:'Administrador' };

var ICO = {
  llave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/></svg>',
  stop:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
  wifi:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 20 0M5.5 12.4a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/><path d="M3 3l18 18"/></svg>',
  espera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
};
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

function asegurar(){
  if (ov) return;
  ov = d.createElement('div'); ov.className = 'gate'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); ov.hidden = true;
  banner = d.createElement('div'); banner.className = 'connbar'; banner.setAttribute('role', 'status'); banner.hidden = true;
  banner.innerHTML = ICO.wifi + '<span>Sin conexión · reintentando. Lo que ves puede estar atrasado.</span>';
  d.body.appendChild(banner); d.body.appendChild(ov);
  ov.addEventListener('click', function (e) {
    var b = e.target.closest('[data-g]'); if (!b) return;
    if (b.dataset.g === 'login') w.location.href = 'app.html?screen=login';
    else if (b.dataset.g === 'lumen') w.location.href = 'app.html';
    else if (b.dataset.g === 'retry') { mostrar('carga'); intentar(); }
  });
}
function mostrar(t, o){
  asegurar(); o = o || {};
  var ico = ICO.llave, h = '', p = '', bt = '';
  if (t === 'carga'){ ico = ICO.espera; h = 'Conectando…'; p = 'Verificando tu usuario.'; }
  else if (t === 'login'){ h = o.vencida ? 'La sesión venció' : 'Iniciá sesión'; p = o.vencida ? 'Por seguridad la sesión dura una jornada. Ingresá de nuevo y volvé a abrir esta pantalla.' : 'Entrá con tu usuario de Lumen para usar esta pantalla.'; bt = '<button class="gbtn primary" data-g="login">Ingresar</button>'; }
  else if (t === 'sinrol'){ ico = ICO.stop; h = 'Tu usuario no tiene rol de atención'; p = 'Pedile al administrador que te asigne el rol RECEPCIÓN o VENTANILLA.'; bt = '<button class="gbtn" data-g="lumen">Volver a Lumen</button>'; }
  else if (t === 'rol'){
    ico = ICO.stop; h = 'Esta pantalla no es para tu rol';
    var link = PAGINAS[o.rol] ? '<a class="gbtn primary" href="' + PAGINAS[o.rol][0] + '">Ir a ' + esc(PAGINAS[o.rol][1]) + '</a>' : '';
    p = 'Tu rol es ' + esc(ROLES[o.rol] || o.rol) + '.'; bt = link + '<button class="gbtn" data-g="lumen">Volver a Lumen</button>';
  }
  else if (t === 'red'){ ico = ICO.wifi; h = 'No se pudo conectar'; p = 'Revisá el WiFi del equipo.'; bt = '<button class="gbtn primary" data-g="retry">Reintentar</button>'; }
  else { ico = ICO.stop; h = 'No se pudo abrir'; p = esc(o.msg || 'Error inesperado.'); bt = '<button class="gbtn primary" data-g="retry">Reintentar</button>'; }
  ov.innerHTML = '<div class="gcard"><div class="gico">' + ico + '</div><h2>' + esc(h) + '</h2><p>' + p + '</p><div class="gbtns">' + bt + '</div></div>';
  ov.hidden = false;
}
function ocultar(){ if (ov) ov.hidden = true; }

function intentar(){
  w.ColaAT.init({ prueba: cfg.prueba }).then(function (info) {
    if (cfg.permitidos.indexOf(info.rol) < 0) return mostrar('rol', { rol: info.rol });
    activo = true; ocultar();
    if (cfg.listo) cfg.listo(info);
  }, function (e) {
    if (e.code === 'NOAUTH') mostrar('login');
    else if (e.code === 'SINROL') mostrar('sinrol');
    else if (e.code === 'RED') mostrar('red');
    else mostrar('error', { msg: w.ColaAT.mensaje(e) });
  });
}

function arrancar(c){
  cfg = c; asegurar(); mostrar('carga');
  w.ColaAT.alEstado(function (s) {
    if (!activo) return;
    banner.hidden = s.online;
    if (!s.auth) mostrar('login', { vencida: true }); else if (!ov.hidden && ov.querySelector('[data-g="login"]')) ocultar();
  });
  intentar();
}
w.GateAT = { arrancar: arrancar, mostrar: mostrar, ocultar: ocultar };
})(window);
