/* ════════════════════════════════════════════════════════════════════════════
   SPCD BG — Fondo animado compartido (canvas partículas + grid + conexiones)
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

    const ctx = canvas.getContext('2d');
    let W, H, particles = [], nodes = [];

    function resize() {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    function randomBetween(a, b) { return a + Math.random() * (b - a); }

    function initParticles() {
      particles = [];
      const count = Math.floor((W * H) / 18000);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: randomBetween(.5, 2),
          vx: randomBetween(-.15, .15),
          vy: randomBetween(-.15, .15),
          alpha: randomBetween(.2, .6),
          color: Math.random() > .5 ? '#22DBAE' : '#3B82F6'
        });
      }
      nodes = particles.slice(0, 12);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Gradient radial suave
      const grad = ctx.createRadialGradient(W*.5, H*.5, 0, W*.5, H*.5, W*.7);
      grad.addColorStop(0, 'rgba(30,58,138,.15)');
      grad.addColorStop(1, 'rgba(10,15,20,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = 'rgba(30,58,138,.25)';
      ctx.lineWidth = .5;
      const gSize = 60;
      for (let x = 0; x < W; x += gSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += gSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Conexiones entre nodos cercanos
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 200) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(34,219,174,' + (.12 * (1 - dist/200)) + ')';
            ctx.lineWidth = .8;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Partículas
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle   = p.color;
        ctx.fill();
        ctx.globalAlpha = 1;

        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
      });

      requestAnimationFrame(draw);
    }

    resize();
    initParticles();
    draw();
    window.addEventListener('resize', () => { resize(); initParticles(); });
  }

  // Arrancar cuando DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCanvas);
  } else {
    initCanvas();
  }
})();
