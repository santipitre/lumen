/* ════════════════════════════════════════════════════════════════════════
   LUMEN NEURO — fondo de neuronas con sinapsis (canvas 2D, sin librerías)
   Cada neurona: soma con núcleo, dendritas ramificadas y un axón mielinizado
   que termina en un botón sináptico frente a la dendrita de otra neurona.
   Al disparar: el impulso baja por el axón, el botón libera neurotransmisores
   que cruzan la hendidura sináptica y la neurona siguiente se activa.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function sprite(stops, size) {
    const c = document.createElement('canvas'); c.width = c.height = size || 64;
    const g = c.getContext('2d'), h = c.width / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.width); return c;
  }
  const GLOW = sprite([[0, 'rgba(255,248,225,1)'], [.18, 'rgba(251,191,36,.85)'], [.5, 'rgba(245,158,11,.22)'], [1, 'rgba(0,0,0,0)']]);
  const HALO = sprite([[0, 'rgba(103,232,249,.55)'], [.4, 'rgba(34,211,238,.14)'], [1, 'rgba(0,0,0,0)']]);

  function Synapse(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    let LIGHT = !!opts.light;   // variante para páginas de fondo claro
    let W, H, DPR, N = [], chains = [];
    const CYCLE = 1.9;   // segundos entre una neurona y la siguiente en la cadena

    function bez(a, c, b, u) { const v = 1 - u; return [v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1], v * v * a[2] + 2 * v * u * c[2] + u * u * b[2]]; }

    function build() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const r = rng(1110);
      const ar = W / H, count = Math.max(9, Math.min(22, Math.round((W * H) / 95000)));
      // posiciones repartidas en una grilla con jitter (evita amontonamientos)
      const cols = Math.ceil(Math.sqrt(count * ar)), rows = Math.ceil(count / cols);
      N = [];
      for (let i = 0; i < count; i++) {
        const cx = (i % cols + .5) / cols, cy = (Math.floor(i / cols) + .5) / rows;
        const p = [(cx - .5) * 3.05 * ar + (r() - .5) * .4, (cy - .5) * 2.9 + (r() - .5) * .35, (r() - .5) * 1.2];
        // dendritas: árbol ramificado
        const branches = [];
        const prim = 5 + Math.floor(r() * 3);
        for (let k = 0; k < prim; k++) {
          const a = (k / prim) * 6.283 + r() * .5, el = (r() - .5) * 1.1;
          grow(branches, [0, 0, 0], [Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el), Math.sin(el)], .16 + r() * .08, 0, r);
        }
        N.push({ p, branches, soma: .035 + r() * .012, ph: r() * 6.283 });
      }
      // axones: cada neurona proyecta a una vecina cercana (sin repetir objetivo)
      const used = new Set();
      N.forEach((n, i) => {
        const cand = N.map((m, j) => [j, (m.p[0] - n.p[0]) ** 2 + (m.p[1] - n.p[1]) ** 2 + (m.p[2] - n.p[2]) ** 2]).filter(e => e[0] !== i).sort((a, b) => a[1] - b[1]);
        let tgt = cand.find(e => !used.has(e[0])) || cand[0]; used.add(tgt[0]); n.target = tgt[0];
      });
      N.forEach((n) => {
        const m = N[n.target];
        // terminal: punta de la dendrita del objetivo que mira hacia el emisor
        let best = null, bd = 1e9;
        m.branches.forEach(b => { if (!b.tip) return; const w = [m.p[0] + b.b[0], m.p[1] + b.b[1], m.p[2] + b.b[2]]; const d = (w[0] - n.p[0]) ** 2 + (w[1] - n.p[1]) ** 2 + (w[2] - n.p[2]) ** 2; if (d < bd) { bd = d; best = w; } });
        const dir = [best[0] - n.p[0], best[1] - n.p[1], best[2] - n.p[2]], L = Math.hypot(...dir);
        const gap = .045 / L;
        const end = [best[0] - dir[0] * gap, best[1] - dir[1] * gap, best[2] - dir[2] * gap];   // hendidura sináptica
        const mid = [(n.p[0] + end[0]) / 2 + (r() - .5) * .35 * L, (n.p[1] + end[1]) / 2 + (r() - .5) * .35 * L, (n.p[2] + end[2]) / 2];
        n.axon = { a: n.p, c: mid, b: end, post: best };
      });
      // cadenas de disparo: recorren el grafo neurona → objetivo
      chains = [];
      const starts = [0, Math.floor(count / 3), Math.floor(2 * count / 3)];
      starts.forEach((s, ci) => { const seq = []; let k = s; for (let i = 0; i < count; i++) { seq.push(k); k = N[k].target; } chains.push({ seq, off: ci * CYCLE / 3 + ci * .37 }); });
    }
    function grow(out, from, dir, len, depth, r) {
      const bend = [(r() - .5) * .5, (r() - .5) * .5, (r() - .5) * .5];
      const d = [dir[0] + bend[0], dir[1] + bend[1], dir[2] + bend[2]], m = Math.hypot(...d);
      const to = [from[0] + d[0] / m * len, from[1] + d[1] / m * len, from[2] + d[2] / m * len];
      const c = [(from[0] + to[0]) / 2 + bend[1] * len * .3, (from[1] + to[1]) / 2 - bend[0] * len * .3, (from[2] + to[2]) / 2];
      const tip = depth >= 2;
      out.push({ a: from, c, b: to, w: 1.6 - depth * .5, tip });
      if (!tip) { const nb = depth === 0 ? 2 : 1 + (r() < .6 ? 1 : 0); for (let k = 0; k < nb; k++) { const sp = (k - (nb - 1) / 2) * .9 + (r() - .5) * .4; const ca = Math.cos(sp), sa = Math.sin(sp); grow(out, to, [d[0] * ca - d[1] * sa, d[0] * sa + d[1] * ca, d[2]], len * (.62 + r() * .15), depth + 1, r); } }
    }
    let rot = 0, tilt = 0;
    function P(q) { // proyección 3D
      const ca = Math.cos(rot), sa = Math.sin(rot);
      let x = q[0] * ca + q[2] * sa, z = -q[0] * sa + q[2] * ca;
      const ct = Math.cos(tilt), st = Math.sin(tilt); let y = q[1] * ct - z * st; z = q[1] * st + z * ct;
      const k = (H * 1.0) / (3.2 - z);
      return [W / 2 + x * k, H / 2 + y * k, z, k];
    }
    const dA = (z) => Math.max(.18, Math.min(1, (z + 1.3) / 2.1));
    function curve(a, c, b) { const A = P(a), C = P(c), B = P(b); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.quadraticCurveTo(C[0], C[1], B[0], B[1]); return (A[2] + B[2]) / 2; }

    function frame(ms) {
      const t = ms / 1000;
      rot = Math.sin(t * .05) * .35; tilt = .1 + Math.sin(t * .037) * .05;
      ctx.clearRect(0, 0, W, H);
      if (!LIGHT) { const bg = ctx.createRadialGradient(W * .5, H * .5, 0, W * .5, H * .5, Math.max(W, H) * .8);
      bg.addColorStop(0, 'rgba(12,44,70,.32)'); bg.addColorStop(1, 'rgba(5,8,12,0)'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
      const K = LIGHT ? .55 : 1;   // intensidad general

      // estado de actividad
      const act = new Float32Array(N.length);       // brillo del soma
      const axonP = [];                             // impulsos en axones
      const release = [];                           // liberación de neurotransmisores
      for (const ch of chains) {
        const tt = t + ch.off, step = Math.floor(tt / CYCLE), u = (tt / CYCLE) - step;
        for (let back = 0; back < 2; back++) {
          const k = ch.seq[((step - back) % ch.seq.length + ch.seq.length) % ch.seq.length], uu = u + back;
          act[k] = Math.max(act[k], Math.exp(-uu * 4));                    // disparo
          if (uu < .55) axonP.push([k, uu / .55]);                          // viaja por el axón
          if (uu > .5 && uu < 1.0) release.push([k, (uu - .5) / .5]);       // cruza la hendidura
          if (uu >= .95) { const tg = N[k].target; act[tg] = Math.max(act[tg], .55 * Math.exp(-(uu - .95) * 3)); }
        }
      }
      // orden por profundidad (lejos → cerca)
      const order = N.map((n, i) => [i, P(n.p)[2]]).sort((a, b) => a[1] - b[1]).map(e => e[0]);
      ctx.lineCap = 'round';
      for (const i of order) {
        const n = N[i], S = P(n.p), da = dA(S[2]), on = act[i];
        // dendritas
        for (const br of n.branches) {
          const a = [n.p[0] + br.a[0], n.p[1] + br.a[1], n.p[2] + br.a[2]], c = [n.p[0] + br.c[0], n.p[1] + br.c[1], n.p[2] + br.c[2]], b = [n.p[0] + br.b[0], n.p[1] + br.b[1], n.p[2] + br.b[2]];
          curve(a, c, b);
          ctx.strokeStyle = LIGHT ? `rgba(13,148,136,${(.20 + .30 * on) * da * K})` : `rgba(${on > .1 ? '153,246,228' : '45,212,191'},${(.22 + .35 * on) * da})`;
          ctx.lineWidth = Math.max(.5, br.w * S[3] * .006 * (1 + on * .4)); ctx.stroke();
          if (br.tip) { const T = P(b); ctx.fillStyle = LIGHT ? `rgba(13,148,136,${.3 * da * K})` : `rgba(94,234,212,${.35 * da})`; ctx.beginPath(); ctx.arc(T[0], T[1], Math.max(.8, S[3] * .0035), 0, 6.283); ctx.fill(); }
        }
        // axón con vainas de mielina (segmentos)
        const ax = n.axon;
        curve(ax.a, ax.c, ax.b); ctx.strokeStyle = LIGHT ? `rgba(14,116,144,${.16 * da * K})` : `rgba(56,189,248,${.20 * da})`; ctx.lineWidth = Math.max(.6, S[3] * .004); ctx.stroke();
        ctx.setLineDash([Math.max(3, S[3] * .03), Math.max(2, S[3] * .012)]);
        curve(ax.a, ax.c, ax.b); ctx.strokeStyle = LIGHT ? `rgba(14,116,144,${.22 * da * K})` : `rgba(125,211,252,${.28 * da})`; ctx.lineWidth = Math.max(1.4, S[3] * .011); ctx.stroke();
        ctx.setLineDash([]);
        // botón sináptico
        const Bt = P(ax.b), bs = Math.max(2.2, S[3] * .018);
        ctx.fillStyle = LIGHT ? `rgba(14,116,144,${.4 * da * K})` : `rgba(125,211,252,${.55 * da})`; ctx.beginPath(); ctx.arc(Bt[0], Bt[1], bs, 0, 6.283); ctx.fill();
        // soma con núcleo
        const sr = Math.max(4, n.soma * S[3]);
        ctx.globalAlpha = (.35 + .65 * on) * da * (LIGHT ? .25 : 1); ctx.drawImage(HALO, S[0] - sr * 4, S[1] - sr * 4, sr * 8, sr * 8); ctx.globalAlpha = 1;
        const gs = ctx.createRadialGradient(S[0] - sr * .3, S[1] - sr * .35, sr * .1, S[0], S[1], sr);
        if (LIGHT) { gs.addColorStop(0, `rgba(94,234,212,${.6 * da * K})`); gs.addColorStop(.6, `rgba(13,148,136,${.55 * da * K})`); gs.addColorStop(1, `rgba(15,118,110,${.45 * da * K})`); }
        else { gs.addColorStop(0, `rgba(204,251,241,${.85 * da})`); gs.addColorStop(.6, `rgba(20,184,166,${.75 * da})`); gs.addColorStop(1, `rgba(13,82,95,${.6 * da})`); }
        ctx.fillStyle = gs; ctx.beginPath(); ctx.arc(S[0], S[1], sr, 0, 6.283); ctx.fill();
        ctx.fillStyle = LIGHT ? `rgba(15,60,70,${.35 * da * K})` : `rgba(8,47,73,${.7 * da})`; ctx.beginPath(); ctx.arc(S[0] + sr * .12, S[1] + sr * .1, sr * .42, 0, 6.283); ctx.fill();
        if (on > .03) { const g = sr * 6 * (.6 + on); ctx.globalCompositeOperation = LIGHT ? 'source-over' : 'lighter'; ctx.globalAlpha = on * da * (LIGHT ? .7 : 1); ctx.drawImage(GLOW, S[0] - g / 2, S[1] - g / 2, g, g); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      }
      // impulsos y neurotransmisores (encima de todo)
      ctx.globalCompositeOperation = LIGHT ? 'source-over' : 'lighter';
      for (const [k, u] of axonP) {
        const ax = N[k].axon;
        for (let tr = 0; tr < 5; tr++) {
          const uu = u - tr * .035; if (uu < 0) continue;
          const q = P(bez(ax.a, ax.c, ax.b, uu)), s = (16 - tr * 2.6) * (q[3] / H) * 1.3;
          ctx.globalAlpha = (1 - tr * .2) * dA(q[2]); ctx.drawImage(GLOW, q[0] - s, q[1] - s, s * 2, s * 2);
        }
      }
      for (const [k, u] of release) {
        const ax = N[k].axon, A = ax.b, B = ax.post;
        const bt = P(A), bf = Math.sin(Math.PI * Math.min(1, u * 1.6));
        ctx.globalAlpha = bf * dA(bt[2]); const s = 22 * (bt[3] / H); ctx.drawImage(GLOW, bt[0] - s, bt[1] - s, s * 2, s * 2);
        for (let v = 0; v < 9; v++) {   // vesículas cruzando la hendidura
          const off = (v * .618) % 1, uu = Math.min(1, Math.max(0, u * 1.3 - off * .3));
          const jit = [(((v * 37) % 7) - 3) * .006, (((v * 53) % 7) - 3) * .006, 0];
          const q = P([A[0] + (B[0] - A[0]) * uu + jit[0] * (1 - uu) * 2, A[1] + (B[1] - A[1]) * uu + jit[1] * (1 - uu) * 2, A[2] + (B[2] - A[2]) * uu]);
          ctx.globalAlpha = Math.sin(Math.PI * uu) * dA(q[2]); ctx.fillStyle = LIGHT ? '#D97706' : '#FDE68A';
          ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(1, q[3] * .0035), 0, 6.283); ctx.fill();
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    build();
    window.addEventListener('resize', build);
    return { frame, setLight: (v) => { LIGHT = !!v; } };
  }
  /* ── LUCIÉRNAGAS v2 (11/11/2026) — destello en "J" con estela, tres planos de profundidad (lejos / medio / bokeh),
        onda de sincronía desde el logo y reflejo en el panel de ingreso.
        opts: { light, scene (escena nocturna completa: solo ingreso), origin(), glowEl, onWave() }
        Misma interfaz que Synapse: { frame(ms), setLight(bool) } + wave(). ── */
  var TAU = Math.PI * 2;
  function Fireflies(cv, opts) {
    opts = opts || {};
    var ctx = cv.getContext('2d'), light = !!opts.light, scene = opts.scene === true;
    var W = 0, H = 0, DPR = 1, flies = [], T = 0, lastMs = null, mouse = { x: -9999, y: -9999 };
    var wave = null, nextWave = 6, reeds = null, grain = mkGrain();
    var sGlow = mkGlow(false), sGlowL = mkGlow(true), sBokeh = mkBokeh();
    var HN = 16;

    function mkGlow(lt) {
      var s = document.createElement('canvas'); s.width = s.height = 128; var x = s.getContext('2d');
      var gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      if (lt) { gr.addColorStop(0, 'rgba(176,104,8,.95)'); gr.addColorStop(.2, 'rgba(202,128,20,.32)'); gr.addColorStop(1, 'rgba(202,128,20,0)'); }
      else {
        gr.addColorStop(0, 'rgba(255,252,232,1)'); gr.addColorStop(.06, 'rgba(255,232,150,.98)');
        gr.addColorStop(.2, 'rgba(250,196,60,.42)'); gr.addColorStop(.5, 'rgba(240,160,20,.09)'); gr.addColorStop(1, 'rgba(240,160,20,0)');
      }
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return s;
    }
    function mkBokeh() {
      var s = document.createElement('canvas'); s.width = s.height = 256; var x = s.getContext('2d');
      var gr = x.createRadialGradient(128, 128, 0, 128, 128, 126);
      gr.addColorStop(0, 'rgba(255,214,120,.50)'); gr.addColorStop(.72, 'rgba(250,190,70,.55)');
      gr.addColorStop(.9, 'rgba(255,224,150,.85)'); gr.addColorStop(.97, 'rgba(250,190,70,.25)'); gr.addColorStop(1, 'rgba(250,190,70,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(128, 128, 127, 0, TAU); x.fill(); return s;
    }
    function mkGrain() {
      var s = document.createElement('canvas'); s.width = s.height = 160; var x = s.getContext('2d'), d = x.createImageData(160, 160);
      for (var i = 0; i < d.data.length; i += 4) { var v = 110 + Math.random() * 145 | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = Math.random() * 26 | 0; }
      x.putImageData(d, 0, 0); return s;
    }
    function mkReeds() {                                  // juncos desenfocados, apenas más claros que el fondo
      var s = document.createElement('canvas'); s.width = W; s.height = H; var x = s.getContext('2d');
      x.filter = 'blur(' + Math.max(2, W / 520) + 'px)'; x.lineCap = 'round';
      var groups = [[0, .26], [.74, 1]];
      for (var gI = 0; gI < groups.length; gI++) {
        var a = groups[gI][0] * W, b = groups[gI][1] * W, n = Math.round((b - a) / 26);
        for (var i = 0; i < n; i++) {
          var bx = a + Math.random() * (b - a), edge = gI ? (bx - a) / (b - a) : 1 - (bx - a) / (b - a);
          var h = H * (.10 + .34 * edge * edge) * (.55 + Math.random() * .6), lean = (Math.random() - .5) * 90 + (gI ? -30 : 30) * edge;
          x.strokeStyle = 'rgba(22,44,54,' + (.35 + Math.random() * .4) + ')'; x.lineWidth = 1.2 + Math.random() * 2.6;
          x.beginPath(); x.moveTo(bx, H + 6); x.quadraticCurveTo(bx + lean * .15, H - h * .6, bx + lean, H - h); x.stroke();
        }
      }
      return s;
    }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function spawn(f, anywhere) {
      f.x = Math.random() * W; f.y = anywhere ? Math.random() * H : H + 30;
      f.ang = rnd(0, TAU); f.hist = []; return f;
    }
    function resize() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth || window.innerWidth; H = cv.clientHeight || window.innerHeight;
      cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var n = Math.max(20, Math.min(84, Math.round(W * H / 19000)));
      flies = [];
      for (var i = 0; i < n; i++) {
        var u = Math.random(), layer = u < .5 ? 0 : (u < .93 ? 1 : 2);        // 0 lejos · 1 medio · 2 cerca (bokeh)
        flies.push(spawn({
          layer: layer, z: layer === 0 ? rnd(.25, .5) : layer === 1 ? rnd(.6, 1) : rnd(1.6, 2.3),
          spd: rnd(10, 22), p1: rnd(0, 99), p2: rnd(0, 99), f1: rnd(.25, .6), f2: rnd(.7, 1.3),
          next: rnd(0, 7), dur: rnd(.9, 1.5), per: rnd(4.5, 9), t0: -99, b: 0
        }, true));
      }
      reeds = (scene && !light) ? mkReeds() : null;
    }
    function origin() {
      var o = opts.origin && opts.origin(); return (o && isFinite(o.x)) ? o : { x: W / 2, y: H * .42 };
    }
    function startWave() { var o = origin(); wave = { x: o.x, y: o.y, t: T }; if (opts.onWave) try { opts.onWave(); } catch (e) { } }
    function step(dt) {
      T += dt;
      if (!light && T > nextWave) { startWave(); nextWave = T + rnd(13, 20); }
      var wr = wave ? (T - wave.t) * 430 : -1; if (wave && wr > Math.max(W, H) * 1.3) wave = null;
      for (var i = 0; i < flies.length; i++) {
        var f = flies[i], z = f.z;
        if (T > f.next) { f.t0 = T; f.next = T + f.per * rnd(.7, 1.4); }
        if (wave) { var d = Math.hypot(f.x - wave.x, f.y - wave.y); if (Math.abs(d - wr) < 26 && T - f.t0 > 2.2) { f.t0 = T; f.next = T + f.per; } }
        var p = (T - f.t0) / f.dur, b = p >= 0 && p <= 1 ? Math.pow(Math.sin(Math.PI * Math.pow(p, .7)), 1.6) : 0;
        f.b = b;
        f.ang += (Math.sin(T * f.f1 + f.p1) * .9 + Math.sin(T * f.f2 + f.p2) * .6) * dt;
        var sp = f.spd * z * (1 + b * 1.4), vx = Math.cos(f.ang) * sp, vy = Math.sin(f.ang) * sp * .55 - 5 * z - b * 46 * z;   // sube al brillar: la "J"
        var mx = f.x - mouse.x, my = f.y - mouse.y, md = Math.hypot(mx, my);
        if (md < 150 && md > .1) { var k = (1 - md / 150) * 90; vx += mx / md * k; vy += my / md * k; }
        f.x += vx * dt; f.y += vy * dt;
        if (f.layer === 1) { f.hist.push(f.x, f.y, b); if (f.hist.length > HN * 3) f.hist.splice(0, 3); }
        if (f.y < -70 || f.x < -90 || f.x > W + 90 || f.y > H + 90) spawn(f, false);
      }
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      if (!light && scene) {
        var bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#04070C'); bg.addColorStop(.55, '#07111A'); bg.addColorStop(1, '#0A1820');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        var hz = ctx.createRadialGradient(W * .5, H * 1.05, 0, W * .5, H * 1.05, Math.max(W, H) * .75);      // resplandor de horizonte
        hz.addColorStop(0, 'rgba(34,150,140,.16)'); hz.addColorStop(.5, 'rgba(20,80,100,.06)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
        for (var k = 0; k < 3; k++) {                                                                         // bruma en capas
          var fy = H * (.62 + k * .13) + Math.sin(T * .05 + k * 2) * 14, fx = W * (.5 + Math.sin(T * .021 + k * 1.7) * .22);
          var fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * .62);
          fg.addColorStop(0, 'rgba(120,190,200,' + (.035 - k * .006) + ')'); fg.addColorStop(1, 'rgba(120,190,200,0)');
          ctx.save(); ctx.translate(0, fy); ctx.scale(1, .22); ctx.translate(0, -fy); ctx.fillStyle = fg; ctx.fillRect(0, fy - W, W, W * 2); ctx.restore();
        }
      }
      var add = light ? 'source-over' : 'lighter', spr = light ? sGlowL : sGlow, i, f, a, r;
      ctx.globalCompositeOperation = add;
      for (i = 0; i < flies.length; i++) {                 // plano lejano
        f = flies[i]; if (f.layer !== 0) continue;
        a = (.16 + f.b * .72) * (light ? .45 : .85); r = (4 + f.z * 9) * (.8 + f.b * .5) * (light ? .7 : 1);
        ctx.globalAlpha = a; ctx.drawImage(spr, f.x - r, f.y - r, r * 2, r * 2);
      }
      if (reeds) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(reeds, 0, 0, W, H); ctx.globalCompositeOperation = add; }
      ctx.lineCap = 'round';
      for (i = 0; i < flies.length; i++) {                 // plano medio: estela + núcleo
        f = flies[i]; if (f.layer !== 1) continue;
        var h = f.hist, n = h.length / 3;
        for (var j = 1; j < n; j++) {
          var hb = h[j * 3 + 2], age = j / n; if (hb < .04) continue;
          ctx.globalAlpha = hb * age * age * (light ? .30 : .55);
          ctx.strokeStyle = light ? '#B87410' : '#FFD778'; ctx.lineWidth = (.6 + age * 2.2) * f.z;
          ctx.beginPath(); ctx.moveTo(h[(j - 1) * 3], h[(j - 1) * 3 + 1]); ctx.lineTo(h[j * 3], h[j * 3 + 1]); ctx.stroke();
        }
        a = (.16 + f.b * .84) * (light ? .55 : 1); r = (9 + f.z * 20) * (.7 + f.b * .6) * (light ? .5 : 1);
        ctx.globalAlpha = a; ctx.drawImage(spr, f.x - r, f.y - r, r * 2, r * 2);
        if (!light && f.b > .5) { ctx.globalAlpha = (f.b - .5) * 1.5; r *= 2.3; ctx.drawImage(spr, f.x - r, f.y - r, r * 2, r * 2); }
      }
      if (!light) for (i = 0; i < flies.length; i++) {     // plano cercano: bokeh de lente
        f = flies[i]; if (f.layer !== 2) continue;
        r = 22 * f.z * (.9 + f.b * .25); ctx.globalAlpha = .014 + f.b * .15;
        ctx.drawImage(sBokeh, f.x - r, f.y - r, r * 2, r * 2);
      }
      if (wave && !light) {                                // onda de sincronía, casi invisible
        var wr = (T - wave.t) * 430, wa = Math.max(0, .09 * (1 - wr / (Math.max(W, H) * 1.1)));
        ctx.globalAlpha = wa; ctx.strokeStyle = '#FCD34D'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(wave.x, wave.y, wr, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (!light && scene) {
        var vg = ctx.createRadialGradient(W / 2, H * .48, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .78);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.62)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = .16; var ox = (Math.random() * 160) | 0, oy = (Math.random() * 160) | 0;             // grano de película
        for (var gx = -ox; gx < W; gx += 160) for (var gy = -oy; gy < H; gy += 160) ctx.drawImage(grain, gx, gy);
        ctx.globalAlpha = 1;
      }
      if (opts.glowEl) reflect(opts.glowEl);
    }
    function reflect(el) {                                 // la luz más cercana se refleja en el borde del panel
      var rc = el.getBoundingClientRect(), cr = cv.getBoundingClientRect(), best = 0, bx = 50, by = 50;
      for (var i = 0; i < flies.length; i++) {
        var f = flies[i]; if (f.layer === 0) continue;
        var px = f.x + cr.left, py = f.y + cr.top;
        var dx = Math.max(rc.left - px, 0, px - rc.right), dy = Math.max(rc.top - py, 0, py - rc.bottom), d = Math.hypot(dx, dy);
        var v = Math.max(0, 1 - d / 200) * (.25 + f.b * .75);
        if (v > best) { best = v; bx = (px - rc.left) / rc.width * 100; by = (py - rc.top) / rc.height * 100; }
      }
      el.style.setProperty('--fly', best.toFixed(3)); el.style.setProperty('--fx', bx.toFixed(1) + '%'); el.style.setProperty('--fy', by.toFixed(1) + '%');
    }
    function frame(ms) {
      if (cv.clientWidth !== W || cv.clientHeight !== H) resize();
      var dt = lastMs == null ? 1 / 30 : Math.min(.08, Math.max(0, (ms - lastMs) / 1000)); lastMs = ms;
      step(dt); draw();
    }
    window.addEventListener('pointermove', function (e) { var cr = cv.getBoundingClientRect(); mouse.x = e.clientX - cr.left; mouse.y = e.clientY - cr.top; }, { passive: true });
    window.addEventListener('pointerleave', function () { mouse.x = mouse.y = -9999; });
    resize(); for (var w = 0; w < 240; w++) step(1 / 30);   // arranca ya "poblado"
    return { frame: frame, setLight: function (v) { light = !!v; reeds = (scene && !light) ? mkReeds() : null; }, wave: startWave };
  }
  const FONDO = 'luciernagas';   // 'luciernagas' | 'neuronas'
  const Fondo = FONDO === 'neuronas' ? Synapse : Fireflies;
  /* Fondo automático: crea el canvas detrás del contenido y elige variante clara/oscura según el fondo de la página */
  function lum(c) { const m = String(c).match(/\d+(\.\d+)?/g); if (!m || m.length < 3) return 0; if (m.length > 3 && +m[3] === 0) return -1; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; }
  function autoFondo() {
    if (document.getElementById('lumen-neuro-bg') || document.getElementById('bg-canvas') || document.getElementById('spcd-bg-canvas')) return;
    const c = document.createElement('canvas'); c.id = 'lumen-neuro-bg'; c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;pointer-events:none';
    document.body.insertBefore(c, document.body.firstChild);
    const html = document.documentElement, body = document.body;
    function syncBg() {   // pasa el fondo del body al html para que el canvas quede entre ambos
      body.style.removeProperty('background'); body.style.removeProperty('background-color');
      const cs = getComputedStyle(body);
      let col = cs.backgroundColor, img = cs.backgroundImage;
      if (lum(col) < 0 && (img === 'none' || !img)) { col = getComputedStyle(html).backgroundColor; }
      html.style.backgroundColor = lum(col) < 0 ? '#0A0F14' : col;
      if (img && img !== 'none') { html.style.backgroundImage = img; html.style.backgroundAttachment = 'fixed'; }
      body.style.setProperty('background', 'transparent', 'important');
      return lum(lum(col) < 0 ? '#0A0F14' : col) > 0.55;
    }
    const claro0 = syncBg(); const syn = Fondo(c, { light: claro0 });
    c.style.opacity = claro0 ? '1' : (FONDO === 'luciernagas' ? '.9' : '.55');   // más tenue detrás de pantallas con tarjetas translúcidas
    let last = 0, chk = 0;
    (function loop(ms) {
      if (document.visibilityState === 'visible' && ms - last > 32) { syn.frame(ms); last = ms; }
      if (ms - chk > 1500) { chk = ms; const cl = syncBg(); syn.setLight(cl); c.style.opacity = cl ? '1' : (FONDO === 'luciernagas' ? '.9' : '.55'); }
      requestAnimationFrame(loop);
    })(0);
  }
  window.LumenNeuro = { Synapse: Fondo, Neuronas: Synapse, Fireflies, autoFondo };
  if (document.currentScript && document.currentScript.dataset.auto !== undefined) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoFondo); else autoFondo();
  }
})();
