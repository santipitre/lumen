/* SPCD BG — sin fondo animado (18/11/2026).
   Antes dibujaba neuronas/luciérnagas en un canvas. Ahora sólo deja el fondo oscuro liso
   que ya tenían las páginas de módulo y mantiene las páginas por encima de la capa de fondo.
   Estilo Zafiro (opt-in): no hace nada, el fondo lo pone lumen-zafiro.css. */
(function () {
  if (window.__SPCD_BG_LOADED__) return;
  if (document.documentElement.getAttribute('data-ui') === 'zafiro') return;
  window.__SPCD_BG_LOADED__ = true;
  var style = document.createElement('style');
  style.textContent = 'html { background-color: #0F172A; } body { background-color: transparent !important; }';
  document.head.appendChild(style);
})();
