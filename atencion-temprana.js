/* =====================================================================
   Lumen · Atención temprana — tablero para el recepcionista de Imágenes
   ---------------------------------------------------------------------
   mode 'demo'  → datos de ejemplo (FICTICIOS). Sirve para ver y probar en la tablet.
   mode 'api'   → POST a `endpoint` con { dni, hoy:{desde,hasta}, previos:{desde,hasta} }
                  y espera el JSON descrito en CONTRATO DE DATOS.
   Para activarlo, definí antes de este script:
     window.ATENCION_TEMPRANA = { endpoint:'https://…', headers:{Authorization:'Bearer …'} }
   Sin frameworks; compatible con Chrome/Edge viejos (sin ??, sin ?., sin motivo en abort()).
   ===================================================================== */
(function () {
'use strict';

var CONFIG = Object.assign({
  mode: 'demo',
  endpoint: '',
  headers: {},
  timeoutMs: 45000,       // el HIS es lento: tope de espera por consulta
  autoClearSeg: 45,       // privacidad: limpia la pantalla tras este tiempo sin tocar
  mesesPrevios: 3,
  nombreCompleto: false   // false → "APELLIDO, N." (la pantalla queda a la vista de la cola)
}, window.ATENCION_TEMPRANA || {});
if (CONFIG.endpoint) CONFIG.mode = 'api';

/* =====================================================================
   CONTRATO DE DATOS (lo que debe devolver el endpoint)
   {
     paciente: { nombre: "APELLIDO, Nombre" } | null,   // null = no está en el HIS
     consultadoEn: "2026-11-15T10:42:00-03:00",           // opcional
     turnosHoy: [{
       prestacion: "RESONANCIA MAGNETICA DE CEREBRO",
       hora: "10:30",
       equipo: "RMN",                                      // opcional
       tramite: { completo: true | false | null,           // null = el HIS no lo informó
                  faltante: "Falta validación PAMI" },     // opcional, sólo si completo=false
       pedido:  { disponible: true, url: "https://…" }     // opcional
     }],
     previos: [{ fecha: "2026-10-02", prestacion: "…", tramite: { completo: true } }]
              // SOLO anteriores a hoy: previos.hasta = ayer (el turno de hoy va en turnosHoy)
   }
   ===================================================================== */

/* ---------- utilidades ---------- */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function pad(n){ return String(n).padStart(2,'0'); }
function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function dmy(s){ var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function fmtDni(v){ return v.replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
function sleep(ms, signal){
  return new Promise(function (res, rej) {
    var t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', function () { clearTimeout(t); rej(new Error('abort')); }, {once:true});
  });
}
function hoyISO(){ return ymd(new Date()); }
function ayerISO(){ var d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); }
function hace(meses){
  var d = new Date(), dia = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() - meses);
  var ult = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  d.setDate(Math.min(dia, ult));
  return ymd(d);
}
function nombreMostrado(n){
  n = String(n || '');
  if (CONFIG.nombreCompleto) return n;
  var i = n.indexOf(',');
  if (i < 0) return n;
  var ape = n.slice(0, i).trim(), nom = n.slice(i + 1).trim();
  return nom ? ape + ', ' + nom.charAt(0).toUpperCase() + '.' : ape;
}

/* ---------- íconos ---------- */
var ICON = {
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6.5 4.5h12l-3.2 4.3 3.2 4.3h-12z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18.2v.1"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7.5v.1"/></svg>',
  doc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  queue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="7" r="2.4"/><circle cx="13" cy="7" r="2.4"/><circle cx="20" cy="7" r="2.4"/><path d="M2 20v-3.2A3.8 3.8 0 0 1 5.8 13h.4M9.5 20v-3.2a3.8 3.8 0 0 1 3.8-3.8h-.3M17 20v-3.2a3.8 3.8 0 0 1 3.8-3.8"/></svg>'
};

/* =====================================================================
   CAPA DE DATOS
   ===================================================================== */
function consultar(dni, signal){
  var rangos = {
    hoy:     { desde: hoyISO(), hasta: hoyISO() },
    previos: { desde: hace(CONFIG.mesesPrevios), hasta: ayerISO() }
  };
  return CONFIG.mode === 'api' ? consultarApi(dni, rangos, signal) : consultarDemo(dni, rangos, signal);
}

function consultarApi(dni, rangos, signal){
  return fetch(CONFIG.endpoint, {
    method: 'POST', signal: signal,
    headers: Object.assign({'Content-Type':'application/json'}, CONFIG.headers),
    body: JSON.stringify({ dni: dni, hoy: rangos.hoy, previos: rangos.previos })
  }).then(function (r) {
    if (r.status === 404) return { paciente: null };
    if (!r.ok) throw new Error('El servidor respondió ' + r.status);
    return r.json();
  });
}

/* --- Demo: pacientes FICTICIOS --- */
function dias(n){ var d = new Date(); d.setDate(d.getDate() - n); return ymd(d); }
var DEMO = {
  '12345678': { paciente:{nombre:'PÉREZ DEMO, Marta Elena'},
    turnosHoy:[{prestacion:'RESONANCIA MAGNETICA DE CEREBRO', hora:'10:30', equipo:'RMN',
      tramite:{completo:false, faltante:'Falta validar la orden en PAMI'}, pedido:{disponible:true, url:'demo:pedido'}}],
    previos:[{fecha:dias(34), prestacion:'RADIOGRAFIA DE TORAX FRENTE Y PERFIL', tramite:{completo:true}},
             {fecha:dias(71), prestacion:'ECOGRAFIA ABDOMINAL', tramite:{completo:false, faltante:'Falta autorización'}}]},
  '23456789': { paciente:{nombre:'DEMO GARCÍA, Juan Carlos'},
    turnosHoy:[{prestacion:'TOMOGRAFIA DE ABDOMEN Y PELVIS CON CONTRASTE', hora:'09:45', equipo:'TC',
      tramite:{completo:true}, pedido:{disponible:true, url:'demo:pedido'}}],
    previos:[]},
  '34567890': { paciente:{nombre:'DEMO RODRÍGUEZ, Lucía'},
    turnosHoy:[],
    previos:[{fecha:dias(12), prestacion:'ECODOPPLER VENOSO DE MIEMBROS INFERIORES', tramite:{completo:true}},
             {fecha:dias(48), prestacion:'ECOGRAFIA TIROIDEA', tramite:{completo:true}},
             {fecha:dias(83), prestacion:'RADIOGRAFIA DE COLUMNA LUMBAR', tramite:{completo:false, faltante:'Falta pedido médico'}}]},
  '45678901': { paciente:{nombre:'DEMO FERNÁNDEZ, Ana María'},
    turnosHoy:[{prestacion:'ECOGRAFIA MAMARIA BILATERAL', hora:'11:15', equipo:'ECO',
                tramite:{completo:true}, pedido:{disponible:false}},
               {prestacion:'MAMOGRAFIA BILATERAL', hora:'11:40', equipo:'MAMO',
                tramite:{completo:null}, pedido:{disponible:true, url:'demo:pedido'}}],
    previos:[{fecha:dias(5), prestacion:'RADIOGRAFIA DE MANO IZQUIERDA', tramite:{completo:true}}]}
};
function consultarDemo(dni, rangos, signal){
  return sleep(700 + Math.random()*900, signal).then(function () {
    if (dni === '99999999') throw new Error('El HIS no respondió (simulado)');
    var p = DEMO[dni];
    return p ? Object.assign({consultadoEn:new Date().toISOString()}, JSON.parse(JSON.stringify(p))) : { paciente: null };
  });
}

/* =====================================================================
   ESTADO
   ===================================================================== */
var S = { dni:'', phase:'idle', data:null, tab:'hoy', ctrl:null, why:'', tick:null, idle:null, err:'' };

function setPhase(p){
  S.phase = p;
  document.body.classList.toggle('has-result', p !== 'idle');
  render();
}
function conResultado(){ return S.phase === 'result' || S.phase === 'error' || S.phase === 'notfound'; }
function abortar(why){
  var c = S.ctrl; S.ctrl = null; S.why = why;
  if (c) { try { c.abort(); } catch (_) {} }
}

/* ---------- entrada del documento ---------- */
function renderDni(){
  $('dni').innerHTML = S.dni
    ? '<span>' + esc(fmtDni(S.dni)) + '</span><span class="caret"></span>'
    : '<span class="ph">00.000.000</span><span class="caret"></span>';
  $('btnBuscar').disabled = S.dni.length < 6 || S.phase === 'loading';
}
function tecla(k){
  if (conResultado()) limpiar(true);
  if (S.phase === 'loading') return;
  if (k === 'clear') S.dni = '';
  else if (k === 'back') S.dni = S.dni.slice(0,-1);
  else if (/^\d$/.test(k) && S.dni.length < 8) S.dni += k;
  renderDni();
}
function limpiar(mantenerPantalla){
  abortar('cancel');
  clearInterval(S.tick); clearTimeout(S.idle);
  S.dni = ''; S.data = null; S.tab = 'hoy';
  if (!mantenerPantalla) setPhase('idle');
  else { S.phase = 'idle'; document.body.classList.remove('has-result'); render(); }
  renderDni();
}

/* ---------- búsqueda ---------- */
function buscar(){
  if (S.dni.length < 6 || S.phase === 'loading') return;
  var ctrl = new AbortController(); S.ctrl = ctrl; S.why = '';
  var t0 = Date.now();
  setPhase('loading');
  S.tick = setInterval(function () { var e = $('elapsed'); if (e) e.textContent = Math.floor((Date.now()-t0)/1000); }, 400);
  var to = setTimeout(function () { if (S.ctrl === ctrl) abortar('timeout'); }, CONFIG.timeoutMs);
  function fin(){ clearTimeout(to); clearInterval(S.tick); if (S.ctrl === ctrl) S.ctrl = null; renderDni(); }
  consultar(S.dni, ctrl.signal).then(function (raw) {
    if (S.ctrl !== ctrl) return;
    var data = norm(raw);
    S.data = data; S.tab = 'hoy';
    setPhase(data.paciente ? 'result' : 'notfound');
    armarIdle();
  }).catch(function (e) {
    if (S.ctrl !== ctrl && S.why !== 'timeout') return;       // cancelada a propósito
    S.err = S.why === 'timeout'
      ? 'El HIS no respondió a tiempo.'
      : (e && e.message ? e.message : 'No se pudo consultar el HIS.');
    setPhase('error'); armarIdle();
  }).then(fin, fin);
}
function norm(d){
  d = d || {};
  function t(x){ return { completo: x && x.completo === true ? true : (x && x.completo === false ? false : null), faltante: (x && x.faltante) || '' }; }
  return {
    paciente: d.paciente && d.paciente.nombre ? d.paciente : null,
    consultadoEn: d.consultadoEn || null,
    turnosHoy: (d.turnosHoy || []).map(function (x) { return Object.assign({}, x, {tramite:t(x.tramite)}); })
                 .sort(function (a,b) { return String(a.hora||'').localeCompare(String(b.hora||'')); }),
    previos: (d.previos || []).map(function (x) { return Object.assign({}, x, {tramite:t(x.tramite)}); })
                 .sort(function (a,b) { return String(b.fecha||'').localeCompare(String(a.fecha||'')); })
  };
}

/* ---------- privacidad: limpiar solo ---------- */
function armarIdle(){
  clearTimeout(S.idle);
  var bar = document.querySelector('.idlebar i');
  if (bar){ bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
  S.idle = setTimeout(function () {
    if (conResultado()){ limpiar(false); toast('Pantalla limpiada por inactividad (datos del paciente)'); }
  }, CONFIG.autoClearSeg * 1000);
}
['pointerdown','keydown'].forEach(function (ev) {
  document.addEventListener(ev, function () { if (conResultado()) armarIdle(); }, true);
});

/* =====================================================================
   RENDER
   ===================================================================== */
function flag(t){
  if (t.completo === true)  return '<span class="flag ok">' + ICON.flag + 'Trámite completo</span>';
  if (t.completo === false) return '<span class="flag bad">' + ICON.flag + 'Trámite incompleto</span>';
  return '<span class="flag unk">' + ICON.flag + 'Sin dato de trámite</span>';
}
function cls(t){ return t.completo === true ? 'ok' : t.completo === false ? 'bad' : 'unk'; }

function resumen(d){
  if (!d.turnosHoy.length)
    return { c:'warn', icon:ICON.info, h:'No tiene turno para hoy',
             items:['Revisá “Estudios anteriores” si trae una orden vieja.','Si no se resuelve acá, sigue en la cola a ventanilla.'] };
  var malos = d.turnosHoy.filter(function (x) { return x.tramite.completo === false; });
  var sinDato = d.turnosHoy.filter(function (x) { return x.tramite.completo === null; });
  var sinPedido = d.turnosHoy.filter(function (x) { return x.pedido && x.pedido.disponible === false; });
  if (malos.length){
    var items = malos.map(function (x) { return '<b>' + esc(x.hora||'--:--') + '</b> ' + esc(x.prestacion) + (x.tramite.faltante ? ' — ' + esc(x.tramite.faltante) : ''); });
    sinPedido.forEach(function (x) { items.push('<b>' + esc(x.hora||'--:--') + '</b> ' + esc(x.prestacion) + ' — sin pedido médico cargado'); });
    return { c:'bad', icon:ICON.alert, h: malos.length === 1 ? 'Hay 1 trámite incompleto para hoy' : 'Hay ' + malos.length + ' trámites incompletos para hoy', items:items };
  }
  if (sinDato.length)
    return { c:'unk', icon:ICON.info, h:'El HIS no informó el estado del trámite',
             items:['No se puede confirmar. Verificar en ventanilla.'] };
  if (sinPedido.length)
    return { c:'warn', icon:ICON.alert, h:'Trámite completo, pero sin pedido médico cargado',
             items:sinPedido.map(function (x) { return '<b>' + esc(x.hora||'--:--') + '</b> ' + esc(x.prestacion); }) };
  return { c:'ok', icon:ICON.check, h: d.turnosHoy.length === 1 ? 'Trámite completo para hoy' : 'Trámites completos para hoy', items:[] };
}

function itemHoy(x){
  var ped = !x.pedido ? '<span class="nopedido">Pedido médico: sin dato</span>'
    : x.pedido.disponible
      ? '<button class="btn ghost pedido" data-pedido="' + esc(x.pedido.url||'') + '" data-t="' + esc(x.prestacion) + '">' + ICON.doc + 'Ver pedido médico</button>'
      : '<span class="nopedido">Sin pedido médico cargado</span>';
  return '<article class="item ' + cls(x.tramite) + '">' +
    '<div class="hora">' + esc(x.hora||'--:--') + '</div>' +
    '<div><div class="prest">' + esc(x.prestacion) + '</div>' + (x.equipo ? '<div class="meta">' + esc(x.equipo) + '</div>' : '') +
      (x.tramite.completo === false && x.tramite.faltante ? '<div class="falta">' + esc(x.tramite.faltante) + '</div>' : '') + '</div>' +
    '<div class="side">' + flag(x.tramite) + ped + '</div></article>';
}
function itemPrev(x){
  var f = x.fecha ? dmy(x.fecha) : '—';
  return '<article class="item prev ' + cls(x.tramite) + '">' +
    '<div class="fecha">' + esc(f) + '</div>' +
    '<div><div class="prest">' + esc(x.prestacion) + '</div>' +
      (x.tramite.completo === false && x.tramite.faltante ? '<div class="falta">' + esc(x.tramite.faltante) + '</div>' : '') + '</div>' +
    '<div class="side">' + flag(x.tramite) + '</div></article>';
}
function badge(list){
  var bad = list.filter(function (x) { return x.tramite.completo === false; }).length;
  return '<span class="badge ' + (bad ? 'bad' : (list.length ? 'ok' : '')) + '">' + list.length + '</span>';
}
function pieIdle(){
  return '<div class="idlebar" style="--t:' + CONFIG.autoClearSeg + 's"><i></i></div>' +
         '<div class="foot">Por privacidad, la pantalla se limpia sola tras ' + CONFIG.autoClearSeg + ' s sin tocarla.</div>';
}

function render(){
  var R = $('results'), d = S.data;
  if (S.phase === 'idle'){
    R.innerHTML = '<div class="state card">' +
      '<h2>Listo para consultar</h2>' +
      '<ol>' +
        '<li>Ingresá o escaneá el documento del paciente.</li>' +
        '<li>Mirá si el trámite está completo (bandera verde) o incompleto (bandera roja).</li>' +
        '<li>Si no se puede resolver en la fila, el paciente sigue a ventanilla.</li>' +
      '</ol>' +
      (CONFIG.mode === 'demo' ? '<div class="demohint"><b>Modo demo</b> — datos ficticios. Probá los documentos ' +
        '<b>12345678</b> (trámite incompleto), <b>23456789</b> (todo en orden), <b>34567890</b> (sin turno hoy), ' +
        '<b>45678901</b> (dos turnos), <b>11111111</b> (no encontrado), <b>99999999</b> (error del HIS).</div>' : '') +
      '</div>';
    renderDni(); return;
  }
  if (S.phase === 'loading'){
    R.innerHTML = '<div class="state card"><div class="spinner" role="status" aria-label="Consultando"></div>' +
      '<h2>Consultando el HIS…</h2>' +
      '<p>Documento ' + esc(fmtDni(S.dni)) + ' · <span id="elapsed">0</span> s</p>' +
      '<div class="btnrow"><button class="btn ghost" id="btnCancel">Cancelar</button></div></div>';
    renderDni(); return;
  }
  if (S.phase === 'error'){
    R.innerHTML = '<div class="state card"><div class="banner bad" style="max-width:560px;text-align:left">' + ICON.alert +
      '<div><div class="h">No se pudo consultar</div><ul><li>' + esc(S.err) + '</li><li>Reintentá, o el paciente sigue en la cola a ventanilla.</li></ul></div></div>' +
      '<div class="btnrow"><button class="btn primary" id="btnRetry">Reintentar</button><button class="btn ghost" id="btnNueva">Nueva consulta</button></div></div>' + pieIdle();
    renderDni(); return;
  }
  if (S.phase === 'notfound'){
    R.innerHTML = '<div class="state card"><div class="banner warn" style="max-width:560px;text-align:left">' + ICON.info +
      '<div><div class="h">Documento ' + esc(fmtDni(S.dni)) + ' no encontrado en el HIS</div><ul><li>Verificá que el número esté bien escrito.</li><li>Si está bien, sigue en la cola a ventanilla.</li></ul></div></div>' +
      '<div class="btnrow"><button class="btn primary" id="btnNueva">Nueva consulta</button></div></div>' + pieIdle();
    renderDni(); return;
  }
  /* result */
  var rs = resumen(d);
  var hora = d.consultadoEn ? new Date(d.consultadoEn).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '';
  var desde = dmy(hace(CONFIG.mesesPrevios)), hasta = dmy(ayerISO());
  var panel =
    S.tab === 'hoy' ? (d.turnosHoy.length ? '<div class="list">' + d.turnosHoy.map(itemHoy).join('') + '</div>'
                                          : '<div class="empty">No tiene turno el día de hoy.</div>')
  : S.tab === 'prev' ? (d.previos.length ? '<div class="list">' + d.previos.map(itemPrev).join('') + '</div>'
                                         : '<div class="empty">Sin estudios entre el ' + desde + ' y el ' + hasta + '.</div>')
  : '<div class="vent">' + ICON.queue + '<h3>Sigue en la cola</h3>' +
       '<p>Este paciente tiene que ser atendido en ventanilla.</p>' +
       '<button class="btn primary" id="btnNueva" style="min-height:64px;font-size:21px;padding:0 34px">Siguiente paciente</button></div>';
  R.innerHTML =
    '<div class="patient card">' +
      '<div class="who"><h2>' + esc(nombreMostrado(d.paciente.nombre)) + '</h2>' +
        '<div class="sub">DNI ' + esc(fmtDni(S.dni)) + (hora ? ' · datos del HIS a las ' + esc(hora) : '') + '</div></div>' +
      '<button class="btn ghost" id="btnNueva">Nueva consulta</button>' +
    '</div>' +
    '<div class="banner ' + rs.c + '">' + rs.icon + '<div><div class="h">' + esc(rs.h) + '</div>' +
      (rs.items.length ? '<ul>' + rs.items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>' : '') + '</div></div>' +
    '<div class="tabs" role="tablist">' +
      '<button class="tab" role="tab" data-tab="hoy" aria-selected="' + (S.tab==='hoy') + '">Turno hoy ' + badge(d.turnosHoy) + '</button>' +
      '<button class="tab" role="tab" data-tab="prev" aria-selected="' + (S.tab==='prev') + '">Estudios anteriores ' + badge(d.previos) + '</button>' +
      '<button class="tab" role="tab" data-tab="vent" aria-selected="' + (S.tab==='vent') + '">Atención en ventanilla</button>' +
    '</div>' +
    (S.tab === 'prev' ? '<div class="foot">Del ' + desde + ' al ' + hasta + '</div>' : '') +
    panel + pieIdle();
  renderDni();
}

/* =====================================================================
   EVENTOS
   ===================================================================== */
$('keypad').addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (b) tecla(b.dataset.k); });
$('btnBuscar').addEventListener('click', buscar);
$('results').addEventListener('click', function (e) {
  var t = e.target.closest('button'); if (!t) return;
  if (t.id === 'btnNueva') return limpiar(false);
  if (t.id === 'btnCancel'){ abortar('cancel'); clearInterval(S.tick); return setPhase('idle'); }
  if (t.id === 'btnRetry') return buscar();
  if (t.dataset.tab){ S.tab = t.dataset.tab; return render(); }
  if (t.dataset.pedido !== undefined) return abrirPedido(t.dataset.pedido, t.dataset.t);
});
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('pedidoOv').hidden){ if (e.key === 'Escape') cerrarPedido(); return; }
  if (!$('scanOv').hidden) return;
  if (/^\d$/.test(e.key)) tecla(e.key);
  else if (e.key === 'Backspace') tecla('back');
  else if (e.key === 'Escape') limpiar(false);
  else if (e.key === 'Enter' && S.phase === 'idle') buscar();
});

/* ---------- pedido médico ---------- */
function abrirPedido(url, titulo){
  $('pedidoTitle').textContent = 'Pedido médico · ' + (titulo || '');
  var body = $('pedidoBody'), open = $('pedidoOpen');
  if (url.indexOf('demo:') === 0){
    open.hidden = true;
    body.innerHTML = '<div class="paper"><b>PEDIDO MÉDICO (DEMO)</b><hr>Paciente: ' + esc(S.data ? nombreMostrado(S.data.paciente.nombre) : '') +
      '<br>Estudio solicitado: ' + esc(titulo||'') + '<hr>Este es un documento de ejemplo. En modo real se muestra el pedido cargado en el sistema.<hr>Firma y sello del profesional</div>';
  } else if (/^https?:\/\//i.test(url)){
    open.hidden = false; open.href = url;
    body.innerHTML = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url)
      ? '<img alt="Pedido médico" src="' + esc(url) + '">'
      : '<iframe title="Pedido médico" src="' + esc(url) + '"></iframe>';
  } else {
    open.hidden = true;
    body.innerHTML = '<div class="paper">No hay una dirección válida para este pedido.</div>';
  }
  $('pedidoOv').hidden = false;
}
function cerrarPedido(){ $('pedidoOv').hidden = true; $('pedidoBody').innerHTML = ''; }
$('pedidoClose').addEventListener('click', cerrarPedido);
$('pedidoOv').addEventListener('click', function (e) { if (e.target === $('pedidoOv')) cerrarPedido(); });

/* ---------- escáner del código del DNI (PDF417) ---------- */
function parseDni(raw){
  var p = String(raw||'').split('@').map(function (s) { return s.trim(); });
  if (/^\d{7,8}$/.test(p[4]||'')) return p[4];                 // DNI tarjeta: tramite@apellido@nombre@sexo@DNI@…
  for (var i = 0; i < p.length; i++) if (/^\d{7,8}$/.test(p[i])) return p[i];   // otros formatos
  return '';
}
function initScan(){
  try{
    if ('BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
      window.BarcodeDetector.getSupportedFormats().then(function (f) {
        if (f.indexOf('pdf417') >= 0) $('btnScan').hidden = false;
      }).catch(function () {});
    }
  }catch(_){}
}
$('btnScan').addEventListener('click', async function () {
  if (S.phase !== 'idle') limpiar(true);
  var ov = $('scanOv'), v = $('scanVideo'), stream;
  try{ stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}, audio:false}); }
  catch(_){ return toast('No se pudo abrir la cámara (¿permiso denegado?)'); }
  v.srcObject = stream; try{ await v.play(); }catch(_){}
  ov.hidden = false;
  var det = new window.BarcodeDetector({formats:['pdf417']}), vivo = true;
  function parar(){ vivo = false; stream.getTracks().forEach(function (t) { t.stop(); }); v.srcObject = null; ov.hidden = true; }
  $('scanCancel').onclick = parar;
  while (vivo){
    try{
      var r = await det.detect(v);
      if (r.length){ var dni = parseDni(r[0].rawValue); if (dni){ parar(); S.dni = dni; renderDni(); return buscar(); } }
    }catch(_){}
    await sleep(250);
  }
});

/* ---------- toast, reloj, pantalla encendida ---------- */
var toastT;
function toast(msg){
  document.querySelectorAll('.toast').forEach(function (n) { n.remove(); });
  var n = document.createElement('div'); n.className = 'toast'; n.setAttribute('role','status'); n.textContent = msg;
  document.body.appendChild(n); clearTimeout(toastT); toastT = setTimeout(function () { n.remove(); }, 4500);
}
function reloj(){
  var d = new Date(), corto = innerWidth < 900;
  $('clock').textContent = d.toLocaleDateString('es-AR', corto ? {weekday:'short',day:'numeric',month:'short'} : {weekday:'long',day:'numeric',month:'long'})
    + ' · ' + d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
}
addEventListener('resize', reloj);
var wl = null;
function mantenerPantalla(){
  try{
    if ('wakeLock' in navigator && !wl){
      navigator.wakeLock.request('screen').then(function (l) { wl = l; l.addEventListener('release', function () { wl = null; }); }).catch(function () {});
    }
  }catch(_){}
}
document.addEventListener('pointerdown', mantenerPantalla);
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') mantenerPantalla(); });

/* ---------- inicio ---------- */
$('modeBadge').className = 'mode ' + (CONFIG.mode === 'demo' ? 'demo' : 'live');
$('modeBadge').innerHTML = CONFIG.mode === 'demo' ? '<i></i>MODO DEMO · datos ficticios' : '<i></i>Conectado al HIS';
reloj(); setInterval(reloj, 15000);
renderDni(); render(); initScan();
})();
