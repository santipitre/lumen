/* =====================================================================
   Lumen · Administrador de turnos
   ---------------------------------------------------------------------
   Sólo el rol ADMINISTRADOR (usuarios.rol = 'admin'). Las funciones SQL
   at_stats / at_admin_* vuelven a comprobarlo del lado del servidor.
     · Estadísticas: números emitidos y espera entre que se entrega el número
       y la PRIMERA llamada de ventanilla. Los números de prueba (demo) no cuentan.
     · Usuarios y roles: RECEPCIÓN / VENTANILLA por usuario.
     · Configuración: cantidad de ventanillas y letras de motivo.
   Sin frameworks; compatible con Chrome/Edge viejos (sin ??, sin ?.).
   ===================================================================== */
(function () {
'use strict';

var C = window.ColaAT;
var rango = 'hoy', datos = null, toastT = null;

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function num(v){ return v == null ? '–' : Number(v).toLocaleString('es-AR'); }
function min(v){ return v == null ? '–' : Number(v).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function hoyISO(){ return new Date(C.ahora() - 3 * 3600000).toISOString().slice(0, 10); }        // Mendoza = UTC-3, sin horario de verano
function sumar(iso, d){ var t = Date.parse(iso + 'T12:00:00Z') + d * 86400000; return new Date(t).toISOString().slice(0, 10); }
function dmy(iso){ var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function toast(msg, mal){
  var n = document.createElement('div'); n.className = 'toast' + (mal ? ' bad' : ''); n.setAttribute('role', mal ? 'alert' : 'status'); n.textContent = (mal ? '⚠ ' : '✓ ') + msg;
  var v = document.querySelector('.toast'); if (v) v.remove();
  document.body.appendChild(n); clearTimeout(toastT); toastT = setTimeout(function () { n.remove(); }, 4500);
}

/* ---------- pestañas ---------- */
function irTab(t){
  ['stats', 'users', 'conf'].forEach(function (k) {
    var on = k === t;
    $('tab-' + k).setAttribute('aria-selected', String(on)); $('p-' + k).hidden = !on;
  });
  if (t === 'users') cargarUsuarios();
  if (t === 'conf') cargarConf();
}
document.querySelector('.tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) irTab(b.dataset.tab); });

/* ---------- estadísticas ---------- */
function periodo(){
  var h = hoyISO();
  if (rango === 'hoy') return [h, h];
  if (rango === '7') return [sumar(h, -6), h];
  if (rango === '30') return [sumar(h, -29), h];
  return [$('fDesde').value, $('fHasta').value];
}
function cargarStats(){
  var p = periodo();
  if (!p[0] || !p[1] || p[1] < p[0]){ $('statsBody').innerHTML = '<div class="err">Elegí un período válido: «Hasta» no puede ser anterior a «Desde».</div>'; return; }
  $('statsBody').innerHTML = '<div class="vacio">Cargando…</div>'; $('btnCsv').disabled = true;
  C.rpc('at_stats', { p_desde: p[0], p_hasta: p[1] }).then(function (r) { datos = r; pintarStats(); }, function (e) {
    datos = null; $('statsBody').innerHTML = '<div class="err">' + esc(C.mensaje(e)) + '</div>';
  });
}
function barra(v, max){ var w = max > 0 ? Math.max(2, Math.round(v * 100 / max)) : 0; return '<span class="bw" aria-hidden="true"><i style="width:' + w + '%"></i></span>'; }
function pintarStats(){
  var r = datos, s = r.resumen, per = r.desde === r.hasta ? dmy(r.desde) : dmy(r.desde) + ' al ' + dmy(r.hasta);
  $('notaStats').innerHTML = 'Período: <b>' + esc(per) + '</b>. «Espera» = desde que se entrega el número hasta la <b>primera</b> llamada de ventanilla.' +
    (r.pruebas_excluidas ? ' <b>' + r.pruebas_excluidas + '</b> número(s) de prueba no se cuentan.' : '');
  if (!s.emitidos){ $('statsBody').innerHTML = '<div class="vacio">No hay números emitidos en este período.</div>'; $('btnCsv').disabled = true; return; }
  var largo = s.espera_p90_min != null && s.espera_p90_min >= 20;
  var h = '<div class="kpis">' +
    k('Números emitidos', num(s.emitidos), '', 'main') +
    k('Atendidos', num(s.atendidos), '', '') +
    k('No se presentaron', num(s.cancelados), '', '') +
    k('Sin cerrar', num(s.pendientes), '', '', 'en espera o llamando') +
    k('Espera promedio', min(s.espera_prom_min), 'min', 'main') +
    k('Espera mediana', min(s.espera_med_min), 'min', '') +
    k('Espera p90', min(s.espera_p90_min), 'min', largo ? 'warn' : '', '9 de cada 10 esperaron menos que esto' + (largo ? ' · ⚠ alta' : '')) +
    k('Espera máxima', min(s.espera_max_min), 'min', '') +
    k('Atención promedio', min(s.atencion_prom_min), 'min', '', 'desde que lo llaman hasta «Atendido»') +
    k('Re-llamados', num(s.rellamados), '', '', 'veces que se volvió a llamar') +
    '</div>';
  var maxD = Math.max.apply(null, r.por_dia.map(function (x) { return x.emitidos; }));
  var maxH = Math.max.apply(null, r.por_hora.map(function (x) { return x.emitidos; }));
  h += '<div class="grid2">';
  h += '<div class="card"><h3>Por hora del día</h3><p class="sub">Hora en que se entregó el número</p><div class="tabla-scroll"><table><thead><tr><th>Hora</th><th>Emitidos</th><th></th><th class="r">Espera prom.</th></tr></thead><tbody>' +
    r.por_hora.map(function (x) { return '<tr><td>' + x.hora + ' hs</td><td>' + x.emitidos + '</td><td>' + barra(x.emitidos, maxH) + '</td><td class="r">' + min(x.espera_prom_min) + ' min</td></tr>'; }).join('') + '</tbody></table></div></div>';
  h += '<div class="card"><h3>Por motivo (letra)</h3><p class="sub">Cuántos números de cada tipo</p><div class="tabla-scroll"><table><thead><tr><th>Motivo</th><th class="r">Emitidos</th><th class="r">Espera prom.</th></tr></thead><tbody>' +
    r.por_letra.map(function (x) { return '<tr><td><span class="letra">' + esc(x.letra) + '</span>' + esc(x.nombre) + '</td><td class="r">' + x.emitidos + '</td><td class="r">' + min(x.espera_prom_min) + ' min</td></tr>'; }).join('') + '</tbody></table></div>' +
    '<h3 style="margin-top:18px">Por ventanilla</h3><p class="sub">Números llamados desde cada puesto</p>' +
    (r.por_puesto.length ? '<div class="tabla-scroll"><table><thead><tr><th>Puesto</th><th class="r">Llamados</th><th class="r">Atendidos</th></tr></thead><tbody>' +
      r.por_puesto.map(function (x) { return '<tr><td>Ventanilla ' + esc(x.puesto) + '</td><td class="r">' + x.llamados + '</td><td class="r">' + x.atendidos + '</td></tr>'; }).join('') + '</tbody></table></div>'
      : '<div class="vacio">Todavía no se llamó a nadie.</div>') + '</div>';
  h += '</div>';
  if (r.por_dia.length > 1 || r.desde !== r.hasta){
    h += '<div class="card"><h3>Por día</h3><div class="tabla-scroll"><table><thead><tr><th>Fecha</th><th>Emitidos</th><th></th><th class="r">Espera prom.</th><th class="r">Espera máx.</th></tr></thead><tbody>' +
      r.por_dia.map(function (x) { return '<tr><td>' + esc(dmy(x.fecha)) + '</td><td>' + x.emitidos + '</td><td>' + barra(x.emitidos, maxD) + '</td><td class="r">' + min(x.espera_prom_min) + ' min</td><td class="r">' + min(x.espera_max_min) + ' min</td></tr>'; }).join('') + '</tbody></table></div></div>';
  }
  $('statsBody').innerHTML = h; $('btnCsv').disabled = false;
}
function k(t, v, u, cls, hint){
  return '<div class="kpi ' + (cls || '') + '"><div class="k">' + esc(t) + '</div><div class="v">' + v + (u ? '<small>' + esc(u) + '</small>' : '') + '</div>' + (hint ? '<div class="h">' + esc(hint) + '</div>' : '') + '</div>';
}
function csv(){
  if (!datos) return;
  var f = function (v) { return v == null ? '' : String(v).replace('.', ','); };
  var l = ['Fecha;Emitidos;Espera promedio (min);Espera máxima (min)'];
  datos.por_dia.forEach(function (x) { l.push([x.fecha, x.emitidos, f(x.espera_prom_min), f(x.espera_max_min)].join(';')); });
  var blob = new Blob(['﻿' + l.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'turnos-por-dia_' + datos.desde + '_' + datos.hasta + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
$('rangos').addEventListener('click', function (e) {
  var b = e.target.closest('[data-r]'); if (!b) return;
  rango = b.dataset.r;
  Array.prototype.forEach.call(document.querySelectorAll('#rangos .chip'), function (n) { n.setAttribute('aria-pressed', String(n === b)); });
  $('custom').hidden = rango !== 'x';
  if (rango === 'x'){ var h = hoyISO(); if (!$('fDesde').value) $('fDesde').value = sumar(h, -6); if (!$('fHasta').value) $('fHasta').value = h; }
  else cargarStats();
});
$('btnVer').addEventListener('click', cargarStats);
$('btnCsv').addEventListener('click', csv);

/* ---------- usuarios y roles ---------- */
var usuarios = [];
function cargarUsuarios(){
  $('usersBody').innerHTML = '<div class="vacio">Cargando…</div>';
  C.rpc('at_admin_usuarios').then(function (r) { usuarios = r || []; pintarUsuarios(); }, function (e) {
    $('usersBody').innerHTML = '<div class="err">' + esc(C.mensaje(e)) + '</div>';
  });
}
function pintarUsuarios(){
  var q = $('uFiltro').value.trim().toLowerCase();
  var lista = usuarios.filter(function (u) { return !q || (u.username + ' ' + (u.nombre || '')).toLowerCase().indexOf(q) >= 0; });
  $('usersBody').innerHTML = lista.length ? lista.map(function (u) {
    var sel = u.rol === 'admin' ? '<span class="fijo">Administrador</span>' :
      '<select data-uid="' + esc(u.id) + '" aria-label="Rol de ' + esc(u.username) + '">' +
      '<option value=""' + (!u.at_rol ? ' selected' : '') + '>Sin rol de atención</option>' +
      '<option value="recepcion"' + (u.at_rol === 'recepcion' ? ' selected' : '') + '>Recepción</option>' +
      '<option value="ventanilla"' + (u.at_rol === 'ventanilla' ? ' selected' : '') + '>Ventanilla</option></select>';
    return '<div class="urow" id="u-' + esc(u.id) + '"><div class="un"><b>' + esc(u.nombre || u.username) + '</b><span>' + esc(u.username) + ' · rol Lumen: ' + esc(u.rol) + '</span></div>' + sel + '</div>';
  }).join('') : '<div class="vacio">No hay usuarios que coincidan.</div>';
}
$('uFiltro').addEventListener('input', pintarUsuarios);
$('usersBody').addEventListener('change', function (e) {
  var s = e.target.closest('select[data-uid]'); if (!s) return;
  var row = $('u-' + s.dataset.uid), antes = null;
  usuarios.forEach(function (u) { if (u.id === s.dataset.uid) antes = u; });
  row.classList.add('guardando'); s.disabled = true;
  C.rpc('at_admin_set_rol', { p_usuario_id: s.dataset.uid, p_rol: s.value }).then(function () {
    if (antes) antes.at_rol = s.value || null;
    row.classList.remove('guardando'); s.disabled = false;
    toast((antes ? antes.username : 'Usuario') + ': ' + (s.value ? (s.value === 'recepcion' ? 'Recepción' : 'Ventanilla') : 'sin rol de atención'));
  }, function (er) {
    row.classList.remove('guardando'); s.disabled = false; s.value = (antes && antes.at_rol) || '';
    toast(C.mensaje(er), true);
  });
});

/* ---------- configuración ---------- */
var conf = null;
function cargarConf(){
  $('confBody').innerHTML = '<div class="vacio">Cargando…</div>';
  C.rpc('at_admin_motivos').then(function (r) { conf = r; pintarConf(); }, function (e) {
    $('confBody').innerHTML = '<div class="err">' + esc(C.mensaje(e)) + '</div>';
  });
}
function filaMotivo(m, nuevo){
  return '<div class="mrow" data-letra="' + esc(m.letra) + '"' + (nuevo ? ' data-nuevo="1"' : '') + '>' +
    (nuevo ? '<input type="text" class="m-letra" maxlength="1" placeholder="Letra" aria-label="Letra nueva" style="text-transform:uppercase;text-align:center">' : '<span class="letra">' + esc(m.letra) + '</span>') +
    '<input type="text" class="m-nombre" maxlength="40" value="' + esc(m.nombre) + '" placeholder="Nombre del motivo" aria-label="Nombre del motivo ' + esc(m.letra) + '">' +
    '<input type="number" class="m-orden" min="0" max="99" value="' + esc(m.orden) + '" aria-label="Orden">' +
    '<label><input type="checkbox" class="m-activo"' + (m.activo ? ' checked' : '') + '>Activo</label>' +
    '<span class="act-col"><button class="btn primary" data-guardar="1">Guardar</button></span></div>';
}
function pintarConf(){
  $('confBody').innerHTML =
    '<div class="card"><h3>Ventanillas</h3><p class="sub">Cuántos puestos aparecen para elegir en la pantalla de ventanilla (1 a 20).</p>' +
    '<div class="fld"><label>Cantidad de ventanillas <input type="number" id="cPuestos" min="1" max="20" value="' + esc(conf.puestos) + '"></label><button class="btn primary" id="btnPuestos" style="margin-left:12px">Guardar</button></div></div>' +
    '<div class="card"><h3>Motivos (letras)</h3><p class="sub">Son las letras que elige recepción. Si desactivás una, deja de ofrecerse pero se conserva en las estadísticas. Se aplica la próxima vez que se abra cada pantalla.</p>' +
    '<div id="mList">' + conf.motivos.map(function (m) { return filaMotivo(m, false); }).join('') + '</div>' +
    '<div style="margin-top:12px"><button class="btn ghost" id="btnAddMot">+ Agregar letra</button></div></div>';
}
$('confBody').addEventListener('click', function (e) {
  if (e.target.closest('#btnAddMot')){
    var d = document.createElement('div'); d.innerHTML = filaMotivo({ letra: '', nombre: '', orden: conf.motivos.length + 1, activo: true }, true);
    $('mList').appendChild(d.firstChild); return;
  }
  if (e.target.closest('#btnPuestos')){
    var n = parseInt($('cPuestos').value, 10);
    if (!(n >= 1 && n <= 20)) return toast('Poné un número entre 1 y 20.', true);
    return C.rpc('at_admin_set_puestos', { p_n: n }).then(function () { conf.puestos = n; toast('Ventanillas: ' + n); }, function (er) { toast(C.mensaje(er), true); });
  }
  var g = e.target.closest('[data-guardar]'); if (!g) return;
  var row = g.closest('.mrow'), letra = row.dataset.nuevo ? row.querySelector('.m-letra').value.trim().toUpperCase() : row.dataset.letra;
  var nombre = row.querySelector('.m-nombre').value.trim();
  if (!/^[A-Z]$/.test(letra)) return toast('La letra tiene que ser una sola, de la A a la Z.', true);
  if (!nombre) return toast('Poné un nombre para el motivo.', true);
  g.disabled = true;
  C.rpc('at_admin_set_motivo', { p_letra: letra, p_nombre: nombre, p_orden: parseInt(row.querySelector('.m-orden').value, 10) || 0, p_activo: row.querySelector('.m-activo').checked })
    .then(function () { toast('Motivo ' + letra + ' guardado'); cargarConf(); }, function (er) { g.disabled = false; toast(C.mensaje(er), true); });
});

window.GateAT.arrancar({ permitidos: ['admin'], prueba: false, listo: function () { cargarStats(); } });
})();
