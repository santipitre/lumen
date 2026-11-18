/* LUMEN NEURO — retirado (18/11/2026).
   El fondo animado (luciérnagas / neuronas) se sacó de todas las páginas.
   Queda esta cáscara vacía para que cualquier página que todavía cargue el archivo
   no falle: no crea canvas, no dibuja y no toca el fondo de la página. */
(function () {
  'use strict';
  function Nada() { return { frame: function () {}, setLight: function () {}, resize: function () {} }; }
  window.LumenNeuro = { Synapse: Nada, Neuronas: Nada, Fireflies: Nada, autoFondo: function () {} };
})();
