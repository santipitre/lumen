/* ════════════════════════════════════════════════════════════════════════════
   SPCD BG — Fondo animado compartido (neuronas con sinapsis, vía lumen-neuro.js)
   Replica el look de index.html en todos los módulos.
   Idempotente: si ya está cargado en la página, no reinicia.
   ════════════════════════════════════════════════════════════════════════════ */
(function() {
  if (window.__SPCD_BG_LOADED__) return;
  window.__SPCD_BG_LOADED__ = true;

  // CSS del canvas + efecto glass para contenedores comunes
  // (canvas a z-index:0, contenido body lift via JS + reglas opcionales)
  const style = document.createElement('style');
  style.textContent = `
    html { background-color: #0F172A; }
    body { background-color: transparent !important; }
    #spcd-bg-canvas {
      position: fixed;
      inset: 0;
      width: 100vw; height: 100vh;
      z-index: 0;
      pointer-events: none;
    }
    /* Efecto "glass" sutil: refuerza el look con backdrop-blur
       sobre las clases de card más comunes. No cambia fondos sólidos. */
    .kpi-card, .table-card, .chart-card, .rank-card,
    .summary-bar, .filters-bar, .module-card,
    .real-card, .tiempo-card,
    #chart-operadores-section .table-card,
    #chart-comparativo-section .table-card,
    #informe-rendimiento-section .table-card {
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    /* Topbar: blur más fuerte para legibilidad */
    .topbar { backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
  `;
  document.head.appendChild(style);

  // Levanta los hijos estáticos del body para que queden sobre el canvas (z-index:0).
  // Respeta elementos ya posicionados (sticky/fixed/absolute/relative) — solo lifts los static.
  function liftBodyChildren() {
    Array.from(document.body.children).forEach(el => {
      if (!el.tagName) return;
      if (el.id === 'spcd-bg-canvas') return;
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META' || tag === 'NOSCRIPT') return;
      const pos = getComputedStyle(el).position;
      if (pos === 'static') {
        el.style.position = 'relative';
      }
      // Solo asignar z-index si el elemento no tiene uno explícito > 0
      const currentZ = getComputedStyle(el).zIndex;
      if (currentZ === 'auto' || parseInt(currentZ, 10) < 1) {
        el.style.zIndex = '1';
      }
    });
  }

  function initCanvas() {
    // Insertar canvas al inicio del body si no existe
    let canvas = document.getElementById('spcd-bg-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'spcd-bg-canvas';
      document.body.insertBefore(canvas, document.body.firstChild);
    }
    liftBodyChildren();

    /* Fondo de neuronas con sinapsis (lumen-neuro.js, 10/11/2026) */
    function arrancar() {
      const syn = window.LumenNeuro.Synapse(canvas);
      let last = 0;
      (function loop(ms) {
        if (document.visibilityState === 'visible' && ms - last > 32) { syn.frame(ms); last = ms; }
        requestAnimationFrame(loop);
      })(0);
    }
    if (window.LumenNeuro) arrancar();
    else {
      const sc = document.createElement('script');
      sc.src = 'lumen-neuro.js?v=20261110b';
      sc.onload = arrancar;
      document.head.appendChild(sc);
    }
  }

  // Arrancar cuando DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCanvas);
  } else {
    initCanvas();
  }
})();
