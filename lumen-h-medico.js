/* GENERADO por tools/extraer_handlers.py — NO editar a mano (tools/check_static.py lo verifica).
   Handlers que estaban inline (atributos on<evento>) en medico.html, con el código tal cual.
   Cada elemento marcado con data-lh="<ids>" recibe sus funciones al final de este archivo.
   Motivo: poder sacar 'unsafe-inline' de script-src (ver tools/csp.py y M1 del ROADMAP).
   Para cambiar un handler: editarlo en LH-DATA y correr  python tools/extraer_handlers.py medico.html --regenerar */
/*LH-DATA
[
[1, "click", "spcdVolverAtras('app.html?screen=roles')"],
[2, "click", "spcdCerrarSesion()"],
[3, "click", "applyFilters()"],
[4, "click", "resetFilters()"],
[5, "click", "openRealizadosPage()"],
[6, "click", "openModal('pendientes')"],
[7, "click", "openTiempoPage()"],
[8, "click", "event.stopPropagation();openModal('inconsistentes')"],
[9, "click", "openModal('medicos')"],
[10, "click", "switchTab('tab-semaforo',this)"],
[11, "click", "switchTab('tab-resumen',this)"],
[12, "click", "switchTab('tab-pendientes',this)"],
[13, "click", "switchTab('tab-medicos',this)"],
[14, "click", "switchTab('tab-prestaciones',this)"],
[15, "click", "switchTab('tab-demora',this)"],
[16, "change", "renderTabPendientes(filtradoBacklog)"],
[17, "change", "renderTabPendientes(filtradoBacklog)"],
[18, "click", "exportMedicosExcel(false)"],
[19, "click", "exportPrestacionesExcel(false)"],
[20, "click", "exportMapaCalorExcel(false)"],
[21, "click", "exportTendenciaExcel(false)"],
[22, "click", "closeRealizadosPage()"],
[23, "click", "exportRealizadosExcel(false)"],
[24, "click", "exportRealizadosExcel(true)"],
[25, "click", "closeTiempoPage()"],
[26, "click", "exportTiempoExcel(false)"],
[27, "click", "exportTiempoExcel(true)"],
[28, "click", "if(event.target===this)closeModal()"],
[29, "click", "closeModal()"],
[30, "input", "filterModal(this.value)"],
[31, "click", "handleExportClick()"]
]
LH-DATA*/
window.__lh_medico = {
1: ["click", function (event) {
spcdVolverAtras('app.html?screen=roles')
}],
2: ["click", function (event) {
spcdCerrarSesion()
}],
3: ["click", function (event) {
applyFilters()
}],
4: ["click", function (event) {
resetFilters()
}],
5: ["click", function (event) {
openRealizadosPage()
}],
6: ["click", function (event) {
openModal('pendientes')
}],
7: ["click", function (event) {
openTiempoPage()
}],
8: ["click", function (event) {
event.stopPropagation();openModal('inconsistentes')
}],
9: ["click", function (event) {
openModal('medicos')
}],
10: ["click", function (event) {
switchTab('tab-semaforo',this)
}],
11: ["click", function (event) {
switchTab('tab-resumen',this)
}],
12: ["click", function (event) {
switchTab('tab-pendientes',this)
}],
13: ["click", function (event) {
switchTab('tab-medicos',this)
}],
14: ["click", function (event) {
switchTab('tab-prestaciones',this)
}],
15: ["click", function (event) {
switchTab('tab-demora',this)
}],
16: ["change", function (event) {
renderTabPendientes(filtradoBacklog)
}],
17: ["change", function (event) {
renderTabPendientes(filtradoBacklog)
}],
18: ["click", function (event) {
exportMedicosExcel(false)
}],
19: ["click", function (event) {
exportPrestacionesExcel(false)
}],
20: ["click", function (event) {
exportMapaCalorExcel(false)
}],
21: ["click", function (event) {
exportTendenciaExcel(false)
}],
22: ["click", function (event) {
closeRealizadosPage()
}],
23: ["click", function (event) {
exportRealizadosExcel(false)
}],
24: ["click", function (event) {
exportRealizadosExcel(true)
}],
25: ["click", function (event) {
closeTiempoPage()
}],
26: ["click", function (event) {
exportTiempoExcel(false)
}],
27: ["click", function (event) {
exportTiempoExcel(true)
}],
28: ["click", function (event) {
if(event.target===this)closeModal()
}],
29: ["click", function (event) {
closeModal()
}],
30: ["input", function (event) {
filterModal(this.value)
}],
31: ["click", function (event) {
handleExportClick()
}],
};
(function () {
  var T = window.__lh_medico;
  var els = document.querySelectorAll('[data-lh]');
  Array.prototype.forEach.call(els, function (el) {
    el.getAttribute('data-lh').split(' ').forEach(function (id) {
      var h = T[id];
      if (!h) return;
      el.addEventListener(h[0], function (ev) {
        // quitar el id de data-lh (o el atributo entero) desactiva el handler, como antes quitar su atributo inline
        if ((' ' + (el.getAttribute('data-lh') || '') + ' ').indexOf(' ' + id + ' ') < 0) return;
        var r = h[1].call(el, ev);
        if (r === false) ev.preventDefault();
      });
    });
  });
})();
