/* diagrama-importar.js — Lumen · Cronogramas · Técnicos
 * Lee la planilla mensual del personal técnico (la del Hospital Italiano) desde Excel, PDF o foto y la devuelve como datos:
 *   { fuente, mes, anio, personas:[{ nombre, horario, celdas:{ dia:{ c, base, lic } } }], feriados:[dia], avisos:[] }
 * Formato de la planilla: fila de días (1..31) con la columna «APELLIDO Y NOMBRE» a la izquierda; una fila por técnico; en cada día
 * la letra M/T/N/D/F/L. La LICENCIA se marca con el color de fondo AMARILLO de la celda (la letra de abajo puede ser cualquiera o estar vacía).
 * Verde claro = horario de mañana 8–14 y violeta = tarde 16–22 (solo informativo). Encabezado de día en rojo (que no sea domingo) = feriado.
 * Todo texto leído se trata como dato; nunca se inserta como HTML.
 * Funciones puras (desdeExcel, desdeTokens, emparejar) sin DOM, para poder probarlas; los lectores de archivo usan el navegador.
 */
(function(root){
'use strict';
var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
var PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
var OCRJS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
var OCRLANG = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa/4.0.0_best_int';
var STOP = /^(horario|turno|referencia|licencias?|franco|cantidad|guardias?|observaciones?|firma)\b/;

function trim(s){ return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function norm(s){ return trim(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9, ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function mediana(a){ a = a.slice().sort(function(x, y){ return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }
function diasDelMes(m, y){ return (m >= 1 && m <= 12 && y) ? new Date(y, m, 0).getDate() : 0; }

/* ===== colores ===== */
function rgbOf(c){
  if(Array.isArray(c)) return c;
  var h = String(c || '').replace('#', ''); if(h.length === 8) h = h.slice(2);
  if(!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function claseColor(c){
  var rgb = rgbOf(c); if(!rgb) return null;
  var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
  if(d){ h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if(h < 0) h += 360; }
  var s = mx ? d / mx : 0;
  if(mx < 0.5) return null;
  if(h >= 38 && h <= 68 && s >= 0.3) return 'lic';      /* amarillo: licencia */
  if(h >= 80 && h <= 165 && s >= 0.15) return 'ver';    /* verde claro: mañana 8–14 */
  if(h >= 250 && h <= 325 && s >= 0.2) return 'vio';    /* violeta: tarde 16–22 */
  if((h <= 12 || h >= 348) && s >= 0.6) return 'rojo';  /* rojo: feriado/domingo */
  return null;
}

/* ===== nombres ===== */
function partesNombre(raw){
  var s = trim(raw), ape = [], nom = '';
  if(s.indexOf(',') >= 0){ var p = s.split(','); ape = [p[0]]; nom = p.slice(1).join(' '); }
  else {
    var t = s.split(' ');
    if(t.length > 1){ nom = t[t.length - 1]; ape = [t.slice(0, -1).join(' '), s]; } else ape = [s];
  }
  return {
    apes: ape.map(function(a){ return norm(a).replace(/,/g, '').trim(); }).filter(Boolean),
    ini: norm(nom).split(' ').filter(Boolean).map(function(w){ return w[0]; })
  };
}
function dam(a, b){
  var i, j, d = [];
  for(i = 0; i <= a.length; i++){ d[i] = [i]; }
  for(j = 1; j <= b.length; j++) d[0][j] = j;
  for(i = 1; i <= a.length; i++) for(j = 1; j <= b.length; j++){
    var c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if(i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
/* Busca a quién de Lumen corresponde «APELLIDO, NOMBRE». Tolera una letra de más/menos o intercambiada en el apellido (MUSRI/Mursi,
   GRANADO/Granados, BATISTELLA/Battistella) y compara la inicial con cualquiera de los nombres (SKAMLEC, MARÍA ISABEL ↔ «Skamlec I.»).
   Devuelve la persona o null si no hay una única coincidencia clara. */
function emparejar(nombreArchivo, personas){
  var f = partesNombre(nombreArchivo), cand = [];
  (personas || []).forEach(function(p){
    var q = partesNombre(p.name), best = 99;
    f.apes.forEach(function(fa){ q.apes.forEach(function(qa){
      var lim = Math.min(2, Math.floor(Math.max(fa.length, qa.length) / 5)), d = dam(fa, qa);
      if(d <= lim && d < best) best = d;
    }); });
    if(best === 99) return;
    var okIni = !q.ini.length || !f.ini.length || f.ini.indexOf(q.ini[0]) >= 0;
    if(okIni) cand.push({ p: p, d: best });
  });
  cand.sort(function(a, b){ return a.d - b.d; });
  if(cand.length && (cand.length === 1 || cand[0].d < cand[1].d)) return cand[0].p;
  return null;
}

/* ===== mes/año en un texto ===== */
function mesAnioDe(textos){
  var mes = 0, anio = 0, i, m;
  for(i = 0; i < textos.length && !mes; i++){
    var t = norm(textos[i]).replace('setiembre', 'septiembre');
    for(m = 0; m < 12; m++) if(new RegExp('\\b' + MESES[m] + '\\b').test(t)){ mes = m + 1; var y = /\b(20\d\d)\b/.exec(t); if(y) anio = +y[1]; break; }
  }
  if(!anio) for(i = 0; i < textos.length; i++){ var y2 = /\b(20\d\d)\b/.exec(textos[i]); if(y2){ anio = +y2[1]; break; } }
  return { mes: mes, anio: anio };
}
function esCodigo(v){ return /^[MTNDFL][*?!]?$/.test(v); }
function armarPersona(nombre, celdas, mt, cv, cp){
  var n = 0; for(var k in celdas) if(celdas.hasOwnProperty(k)) n++;
  var horario = '';
  if(mt >= 3){ if(cv >= mt * 0.6) horario = '8–14'; else if(cp >= mt * 0.6) horario = '16–22'; }
  return { nombre: trim(nombre), celdas: celdas, horario: horario, n: n };
}

/* ===== Excel ===== */
function desdeExcel(buf, XLSX){
  var wb = XLSX.read(buf, { type: 'array', cellStyles: true }), i, r;
  for(i = 0; i < wb.SheetNames.length; i++){ r = leerHoja(XLSX, wb.Sheets[wb.SheetNames[i]]); if(r) return r; }
  return null;
}
function leerHoja(XLSX, ws){
  if(!ws || !ws['!ref']) return null;
  var rg = XLSX.utils.decode_range(ws['!ref']), maxR = Math.min(rg.e.r, 300), maxC = Math.min(rg.e.c, 60);
  function cell(r, c){ return ws[XLSX.utils.encode_cell({ r: r, c: c })]; }
  function txt(c){ return c && c.v != null ? trim(c.v) : ''; }
  function fill(c){ return c && c.s && c.s.patternType === 'solid' && c.s.fgColor && c.s.fgColor.rgb ? c.s.fgColor.rgb : null; }
  var hr = -1, dayCols = null, r, c;
  for(r = 0; r <= Math.min(maxR, 80) && hr < 0; r++){
    var arr = [];
    for(c = 1; c <= maxC; c++){ var cc = cell(r, c), t = cc && cc.v != null ? trim(cc.v) : ''; if(/^\d{1,2}$/.test(t) && +t >= 1 && +t <= 31) arr.push({ c: c, d: +t }); }
    if(arr.length >= 10 && arr.every(function(x, k){ return k === 0 || x.d > arr[k - 1].d; })){ hr = r; dayCols = arr; }
  }
  if(hr < 0) return null;
  var textos = []; for(r = 0; r <= hr; r++) for(c = 0; c <= maxC; c++){ var tt = txt(cell(r, c)); if(tt) textos.push(tt); }
  var ma = mesAnioDe(textos), feriados = [];
  if(hr > 0) dayCols.forEach(function(dc){
    var c0 = cell(hr - 1, dc.c);
    if(c0 && txt(c0).toUpperCase() !== 'D' && claseColor(fill(c0)) === 'rojo') feriados.push(dc.d);
  });
  var pers = [];
  for(r = hr + 1; r <= maxR; r++){
    var nm = txt(cell(r, 0));
    if(!nm){ if(pers.length) break; continue; }
    if(STOP.test(norm(nm))) break;
    var celdas = {}, mt = 0, cv = 0, cp = 0;
    dayCols.forEach(function(dc){
      var cc = cell(r, dc.c), v = cc && cc.v != null ? trim(cc.v).toUpperCase() : '', code = esCodigo(v) ? v[0] : '', cl = claseColor(fill(cc));
      if(code === 'M' || code === 'T'){ mt++; if(cl === 'ver') cv++; if(cl === 'vio') cp++; }
      if(code || cl === 'lic') celdas[dc.d] = { c: cl === 'lic' ? 'L' : code, base: code, lic: cl === 'lic' };
    });
    pers.push(armarPersona(nm, celdas, mt, cv, cp));
  }
  if(!pers.length) return null;
  return { fuente: 'excel', mes: ma.mes, anio: ma.anio, personas: pers, feriados: feriados, avisos: [] };
}

/* ===== PDF / foto: palabras con posición =====
   tokens: [{ s, x, y, w, h }] (x,y = centro, en píxeles de la página); sampler(x, y) → [r,g,b] del píxel. */
function agruparFilas(tokens){
  var tol = Math.max(2, mediana(tokens.map(function(t){ return t.h || 10; })) * 0.55), rows = [];
  tokens.slice().sort(function(a, b){ return a.y - b.y; }).forEach(function(t){
    var r = rows[rows.length - 1];
    if(r && Math.abs(t.y - r.y) <= tol){ r.t.push(t); r.y = (r.y * (r.t.length - 1) + t.y) / r.t.length; } else rows.push({ y: t.y, t: [t] });
  });
  rows.forEach(function(r){ r.t.sort(function(a, b){ return a.x - b.x; }); });
  return rows;
}
function claseCelda(sampler, x, y, sp, rh){
  var pts = [[x - 0.33 * sp, y], [x + 0.33 * sp, y], [x, y - 0.3 * rh], [x, y + 0.3 * rh]], votos = {}, best = null, bn = 0;
  pts.forEach(function(p){ var k = claseColor(sampler(p[0], p[1])); if(k) votos[k] = (votos[k] || 0) + 1; });
  for(var k in votos) if(votos[k] > bn){ bn = votos[k]; best = k; }
  return bn >= 2 ? best : null;
}
function desdeTokens(tokens, sampler, fuente){
  tokens = tokens.filter(function(t){ return trim(t.s); });
  if(tokens.length < 20) return null;
  var rows = agruparFilas(tokens), hi = -1, pts = null, i;
  for(i = 0; i < rows.length && hi < 0; i++){
    var ints = rows[i].t.filter(function(t){ var s = trim(t.s); return /^\d{1,2}$/.test(s) && +s >= 1 && +s <= 31; });
    var ds = ints.map(function(t){ return +trim(t.s); });
    if(ints.length >= 10 && ds.every(function(d, k){ return k === 0 || d > ds[k - 1]; })){ hi = i; pts = ints.map(function(t){ return { d: +trim(t.s), x: t.x }; }); }
  }
  if(hi < 0) return null;
  /* recta x = a + b·día por mínimos cuadrados (tolera dígitos mal leídos) */
  var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
  pts.forEach(function(p){ sx += p.d; sy += p.x; sxx += p.d * p.d; sxy += p.d * p.x; });
  var b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n, sp = Math.abs(b);
  var textos = []; for(i = 0; i <= hi; i++) textos.push(rows[i].t.map(function(t){ return t.s; }).join(' '));
  var ma = mesAnioDe(textos), nDias = Math.max(pts[pts.length - 1].d, diasDelMes(ma.mes, ma.anio));
  var limite = a + b * 1 - sp * 0.5, rhHead = hi + 1 < rows.length ? Math.abs(rows[hi + 1].y - rows[hi].y) : sp;
  var feriados = [];
  if(hi > 0 && rows[hi - 1].t.length >= 8) for(var d = 1; d <= nDias; d++){
    var x = a + b * d, tk = rows[hi - 1].t.filter(function(t){ return Math.abs(t.x - x) <= sp * 0.45; })[0];
    if(tk && trim(tk.s).toUpperCase() !== 'D' && claseCelda(sampler, x, rows[hi - 1].y, sp, rhHead) === 'rojo') feriados.push(d);
  }
  /* filas de personas */
  var filas = [];
  for(i = hi + 1; i < rows.length; i++){
    var nameT = rows[i].t.filter(function(t){ return t.x < limite; }), nm = nameT.map(function(t){ return trim(t.s); }).join(' ');
    if(!nameT.length) continue;
    if(STOP.test(norm(nm))) break;
    filas.push({ y: rows[i].y, nm: nm, t: rows[i].t });
  }
  if(!filas.length) return null;
  var ys = filas.map(function(f){ return f.y; }), difs = [];
  for(i = 1; i < ys.length; i++) difs.push(ys[i] - ys[i - 1]);
  var rh = difs.length ? mediana(difs) : rhHead, pers = [];
  filas.forEach(function(f){
    var celdas = {}, mt = 0, cv = 0, cp = 0;
    for(var d = 1; d <= nDias; d++){
      var x = a + b * d, tk = f.t.filter(function(t){ return t.x >= limite && Math.abs(t.x - x) <= sp * 0.45; })[0];
      var v = tk ? trim(tk.s).toUpperCase() : '', code = /^[MTNDFL]$/.test(v) ? v : '', cl = claseCelda(sampler, x, f.y, sp, rh);
      if(code === 'M' || code === 'T'){ mt++; if(cl === 'ver') cv++; if(cl === 'vio') cp++; }
      if(code || cl === 'lic') celdas[d] = { c: cl === 'lic' ? 'L' : code, base: code, lic: cl === 'lic' };
    }
    pers.push(armarPersona(f.nm, celdas, mt, cv, cp));
  });
  return { fuente: fuente || 'pdf', mes: ma.mes, anio: ma.anio, personas: pers, feriados: feriados, avisos: [] };
}

/* ===== navegador: carga de librerías y lectura de archivos ===== */
function cargarScript(url){
  return new Promise(function(ok, ko){
    var s = document.createElement('script'); s.src = url; s.onload = ok;
    s.onerror = function(){ ko(new Error('No se pudo cargar «' + url.split('/').pop().split('?')[0] + '». Revisá la conexión a internet.')); };
    document.head.appendChild(s);
  });
}
function asegurarXLSX(){ return root.XLSX ? Promise.resolve() : cargarScript('xlsx.min.js'); }
function asegurarPDFJS(){
  if(root.pdfjsLib) return Promise.resolve();
  return cargarScript(PDFJS + 'pdf.min.js').then(function(){ root.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; });
}
function asegurarOCR(){ return root.Tesseract ? Promise.resolve() : cargarScript(OCRJS); }
function samplerDe(ctx, W, H){
  return function(x, y){
    x = Math.round(x); y = Math.round(y);
    if(x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return null;
    var d = ctx.getImageData(x - 1, y - 1, 3, 3).data, r = 0, g = 0, b = 0, k;
    for(k = 0; k < 36; k += 4){ r += d[k]; g += d[k + 1]; b += d[k + 2]; }
    return [r / 9, g / 9, b / 9];
  };
}
function leerPDF(buf, estado){
  return asegurarPDFJS().then(function(){
    return root.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  }).then(function(pdf){
    var res = null, p = 0;
    function paso(){
      if(p >= Math.min(pdf.numPages, 8)) return res;
      p++; estado('Leyendo la página ' + p + ' de ' + pdf.numPages + '…');
      return pdf.getPage(p).then(function(page){
        var vp = page.getViewport({ scale: 2 }), cv = document.createElement('canvas');
        cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
        var ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function(){ return page.getTextContent(); }).then(function(tc){
          var toks = tc.items.filter(function(it){ return it.str && it.str.trim(); }).map(function(it){
            var tx = root.pdfjsLib.Util.transform(vp.transform, it.transform), h = Math.hypot(tx[2], tx[3]), w = it.width * vp.scale;
            return { s: it.str, x: tx[4] + w / 2, y: tx[5] - h * 0.35, w: w, h: h };
          });
          var r = desdeTokens(toks, samplerDe(ctx, cv.width, cv.height), 'pdf');
          if(r){ if(!res) res = r; else if(!r.mes || r.mes === res.mes){ res.personas = res.personas.concat(r.personas); res.feriados = res.feriados.concat(r.feriados); } }
        });
      }).then(paso);
    }
    return paso();
  }).then(function(r){
    if(!r) throw new Error('No encontré la tabla del cronograma en el PDF. Tiene que ser la planilla con los días en columnas y «APELLIDO Y NOMBRE» a la izquierda. Si es un PDF escaneado, probá con una foto (JPG/PNG).');
    return r;
  });
}
/* ===== imagen (JPG/PNG): se ubica la grilla por sus líneas, el texto por OCR (nombres) y cada casilla se lee sola ===== */
function otsu(g, n){
  var h = new Array(256).fill(0), i, t, sum = 0, sB = 0, wB = 0, best = 0, th = 128;
  for(i = 0; i < n; i++) h[g[i]]++;
  for(t = 0; t < 256; t++) sum += t * h[t];
  for(t = 0; t < 256; t++){
    wB += h[t]; if(!wB) continue; var wF = n - wB; if(!wF) break;
    sB += t * h[t]; var mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if(v > best){ best = v; th = t; }
  }
  return th;
}
/* perfil de «trazos»: para cada columna (o fila) qué fracción de la franja tiene un trazo distinto de su entorno */
function perfilV(G, y0, y1){
  var W = G.W, g = G.g, prof = new Float32Array(W), x, y;
  for(x = 4; x < W - 4; x++){
    var c = 0; for(y = y0; y < y1; y++){ var o = y * W + x; if(Math.abs((g[o - 4] + g[o + 4]) / 2 - Math.min(g[o - 1], g[o], g[o + 1])) > 10) c++; }
    prof[x] = c / Math.max(1, y1 - y0);
  }
  var sm = new Float32Array(W); for(x = 1; x < W - 1; x++) sm[x] = Math.max(prof[x - 1], prof[x], prof[x + 1]);
  return sm;
}
function ajustarPeine(sm, W, nd, pa, pb, xa, xb, paso){
  var best = -1, bx = 0, bp = 0, p, x0, k;
  for(p = pa; p <= pb; p += paso) for(x0 = Math.round(xa); x0 <= xb; x0++){
    if(x0 + nd * p > W - 2) break;
    var sc = 0; for(k = 0; k <= nd; k++) sc += sm[Math.round(x0 + k * p)];
    if(sc > best){ best = sc; bx = x0; bp = p; }
  }
  return { sc: best / (nd + 1), x0: bx, p: bp };
}
function geometriaImagen(cv, ctx, ma){
  var W = cv.width, H = cv.height, img = ctx.getImageData(0, 0, W, H).data, g = new Uint8Array(W * H), i, k, x, y;
  for(i = 0; i < W * H; i++) g[i] = (img[4 * i] * 30 + img[4 * i + 1] * 59 + img[4 * i + 2] * 11) / 100 | 0;
  var G = { W: W, H: H, g: g, img: img, thr: Math.max(90, Math.min(150, otsu(g, W * H) * 0.8)), ma: ma };
  var nd = ma.mes ? diasDelMes(ma.mes, ma.anio || new Date().getFullYear()) : 31;
  /* 1) columnas: se ajusta x0 + k·paso a las líneas verticales de toda la imagen */
  var sm = perfilV(G, Math.round(H * 0.05), Math.round(H * 0.95));
  var fit = ajustarPeine(sm, W, nd, W / 130, W / 25, W * 0.08, W * 0.55, 0.2);
  geometriaImagen.dbg = { fase1: fit, nd: nd };
  if(fit.sc < 0.15) return (geometriaImagen.why = 1, null);
  var bx = fit.x0, bp = fit.p;
  /* 2) filas: líneas horizontales sobre el ancho de los días; se toma la tanda más larga de líneas equidistantes */
  var xa0 = Math.round(bx + 2), xb0 = Math.round(bx + nd * bp - 2), hp = new Float32Array(H);
  for(y = 4; y < H - 4; y++){
    var c = 0; for(x = xa0; x < xb0; x++){ var o = y * W + x; if(Math.abs((g[o - 4 * W] + g[o + 4 * W]) / 2 - Math.min(g[o - W], g[o], g[o + W])) > 10) c++; }
    hp[y] = c / (xb0 - xa0);
  }
  var ly = [], run = null;
  for(y = 4; y < H - 4; y++){
    if(hp[y] > 0.4){ if(!run) run = { a: y, b: y }; else run.b = y; }
    else if(run){ ly.push((run.a + run.b) / 2); run = null; }
  }
  var ly2 = []; ly.forEach(function(v){ var u = ly2[ly2.length - 1]; if(u && v - u.v < Math.max(12, H * 0.01)){ u.v = (u.v * u.n + v) / (u.n + 1); u.n++; } else ly2.push({ v: v, n: 1 }); });
  ly = ly2.map(function(u){ return u.v; });
  if(ly.length < 5) return (geometriaImagen.why = 2, null);
  var best = null, j;
  for(i = 0; i < ly.length - 1; i++){
    var d0 = ly[i + 1] - ly[i]; if(d0 < H * 0.01) continue;
    j = i; while(j + 1 < ly.length && Math.abs((ly[j + 1] - ly[j]) - d0) <= d0 * 0.15) j++;
    if(!best || j - i > best.b - best.a) best = { a: i, b: j, d: d0 };
  }
  if(!best || best.b - best.a < 4) return (geometriaImagen.why = 3, null);
  geometriaImagen.dbg.filas = { ly: ly.map(Math.round), run: best };
  /* 3) afinado de las columnas solo con la franja de la tabla */
  var yt = Math.round(ly[best.a]), yb = Math.round(ly[best.b]), sm2 = perfilV(G, yt, yb);
  var fit2 = ajustarPeine(sm2, W, nd, bp * 0.97, bp * 1.03, bx - bp * 0.6, bx + bp * 0.6, 0.05);
  if(fit2.sc < 0.3) return (geometriaImagen.why = 4, null);
  bx = fit2.x0; bp = fit2.p; sm = sm2;
  /* 4) si la «primera columna» ya trae letras en casi todas las filas, era el día 1: la grilla estaba corrida */
  var med = []; for(i = best.a + 2; i < best.b - 1; i++) med.push([ly[i], ly[i + 1]]);
  function conTinta(xs){ var n = 0; med.forEach(function(r){ var mh = (r[1] - r[0]) * 0.2, mw = bp * 0.2; if(tinta(G, xs + mw, r[0] + mh, xs + bp - mw, r[1] - mh) >= 0.035) n++; }); return med.length ? n / med.length : 1; }
  for(k = 0; k < 2; k++){ if(bx - bp < 8 || sm[Math.round(bx - bp)] < 0.5) break; if(conTinta(bx - bp) >= 0.5) bx -= bp; else break; }
  for(k = 0; k < 2; k++){ if(bx + (nd + 1) * bp > W - 2 || sm[Math.round(bx + bp)] < 0.5) break; if(conTinta(bx) < 0.2 && conTinta(bx + bp) >= 0.5) bx += bp; else break; }
  G.xa = bx; G.pitch = bp; G.nd = nd; G.ly = ly; G.run = best;
  return G;
}
/* color de fondo de una casilla: promedio de los píxeles claros del interior */
function colorRect(G, xa, ya, xb, yb){
  var W = G.W, r = 0, gg = 0, b = 0, n = 0, tot = 0, x, y;
  for(y = Math.max(0, Math.round(ya)); y < Math.min(G.H, Math.round(yb)); y++) for(x = Math.max(0, Math.round(xa)); x < Math.min(W, Math.round(xb)); x++){
    tot++; var o = y * W + x; if(Math.max(G.img[4 * o], G.img[4 * o + 1], G.img[4 * o + 2]) > 140){ r += G.img[4 * o]; gg += G.img[4 * o + 1]; b += G.img[4 * o + 2]; n++; }
  }
  if(!n || n < tot * 0.15) return null;
  return claseColor([r / n, gg / n, b / n]);
}
/* píxel de tinta: oscuro, o rojo marcado (la «F» es roja y suavizada se ve clara) */
function esTinta(G, o){
  if(G.g[o] < G.thr) return true;
  if(!G.img) return false;
  var r = G.img[4 * o], g = G.img[4 * o + 1], b = G.img[4 * o + 2];
  return r > 150 && r - g > 60 && r - b > 60;
}
function tinta(G, xa, ya, xb, yb){
  var n = 0, tot = 0, x, y;
  for(y = Math.round(ya); y < Math.round(yb); y++) for(x = Math.round(xa); x < Math.round(xb); x++){ tot++; if(esTinta(G, y * G.W + x)) n++; }
  return tot ? n / tot : 0;
}
/* la «F» de franco va en rojo: si la tinta de la casilla es roja, es una F (el OCR la confunde) */
function tintaRoja(G, xa, ya, xb, yb){
  var n = 0, rj = 0, x, y;
  for(y = Math.round(ya); y < Math.round(yb); y++) for(x = Math.round(xa); x < Math.round(xb); x++){
    var o = y * G.W + x; if(!esTinta(G, o)) continue; n++;
    var r = G.img[4 * o], g = G.img[4 * o + 1], b = G.img[4 * o + 2];
    if(r > 150 && r - g > 60 && r - b > 60) rj++;
  }
  return n ? rj / n : 0;
}
function recortarCasilla(cv, xa, ya, xb, yb, thr){
  var w = Math.max(4, Math.round(xb - xa)), h = Math.max(4, Math.round(yb - ya)), sc = 64 / h, c = document.createElement('canvas');
  c.width = Math.round(w * sc) + 40; c.height = 64 + 40;
  var k = c.getContext('2d', { willReadFrequently: true }); k.fillStyle = '#fff'; k.fillRect(0, 0, c.width, c.height);
  k.drawImage(cv, xa, ya, w, h, 20, 20, Math.round(w * sc), 64);
  var d = k.getImageData(0, 0, c.width, c.height), p = d.data, i;
  for(i = 0; i < p.length; i += 4){ var rojo = p[i] > 150 && p[i] - p[i + 1] > 60 && p[i] - p[i + 2] > 60, v = rojo || (p[i] * 30 + p[i + 1] * 59 + p[i + 2] * 11) / 100 < Math.max(100, thr) ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = v; }
  k.putImageData(d, 0, 0); return c;
}
/* corrige la inclinación de la foto: se prueba cada ángulo y se queda con el que deja más rectas las líneas horizontales */
function enderezar(cv){
  var sc = Math.min(1, 1000 / cv.width), w = Math.round(cv.width * sc), h = Math.round(cv.height * sc), c = document.createElement('canvas');
  c.width = w; c.height = h; var k = c.getContext('2d', { willReadFrequently: true });
  function puntaje(a){
    k.setTransform(1, 0, 0, 1, 0, 0); k.fillStyle = '#fff'; k.fillRect(0, 0, w, h);
    k.translate(w / 2, h / 2); k.rotate(a * Math.PI / 180); k.drawImage(cv, -w / 2, -h / 2, w, h);
    var d = k.getImageData(0, 0, w, h).data, tot = 0, x, y;
    for(y = 2; y < h; y++){
      var n = 0; for(x = 0; x < w; x++){ var o = (y * w + x) * 4, o2 = ((y - 2) * w + x) * 4; if(Math.abs((d[o] * 30 + d[o + 1] * 59 + d[o + 2] * 11) / 100 - (d[o2] * 30 + d[o2 + 1] * 59 + d[o2 + 2] * 11) / 100) > 14) n++; }
      tot += n * n;
    }
    return tot;
  }
  var mejor = 0, ms = puntaje(0), a;
  for(a = -4; a <= 4; a += 0.5){ var sA = puntaje(a); if(sA > ms){ ms = sA; mejor = a; } }
  var c0 = mejor; for(a = c0 - 0.5; a <= c0 + 0.5; a += 0.1){ var sB = puntaje(a); if(sB > ms){ ms = sB; mejor = a; } }
  if(Math.abs(mejor) < 0.15) return cv;
  var o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
  var q = o.getContext('2d', { willReadFrequently: true }); q.fillStyle = '#fff'; q.fillRect(0, 0, o.width, o.height);
  q.translate(o.width / 2, o.height / 2); q.rotate(mejor * Math.PI / 180); q.drawImage(cv, -o.width / 2, -o.height / 2);
  return o;
}
function recorteTexto(cv, xa, ya, xb, yb){
  var w = Math.max(4, Math.round(xb - xa)), h = Math.max(4, Math.round(yb - ya)), sc = Math.max(1, 70 / h), c = document.createElement('canvas');
  c.width = Math.round(w * sc) + 30; c.height = Math.round(h * sc) + 30;
  var k = c.getContext('2d'); k.fillStyle = '#fff'; k.fillRect(0, 0, c.width, c.height);
  k.drawImage(cv, xa, ya, w, h, 15, 15, Math.round(w * sc), Math.round(h * sc)); return c;
}
function leerImagen(file, estado){
  estado('Preparando la imagen…');
  return new Promise(function(ok, ko){
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function(){ ok(im); setTimeout(function(){ URL.revokeObjectURL(url); }, 2000); };
    im.onerror = function(){ ko(new Error('No se pudo abrir la imagen.')); };
    im.src = url;
  }).then(function(im){
    var esc = Math.max(1, Math.min(3, 2600 / im.naturalWidth)); if(im.naturalWidth * esc > 3600) esc = 3600 / im.naturalWidth;
    var cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * esc); cv.height = Math.round(im.naturalHeight * esc);
    var ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(im, 0, 0, cv.width, cv.height);
    estado('Enderezando la imagen…'); cv = enderezar(cv); ctx = cv.getContext('2d', { willReadFrequently: true });
    estado('Cargando el lector de texto (la primera vez tarda un poco)…');
    var wk, fase = 'pagina', MALA = 'No pude reconocer la tabla en la imagen. Probá con una foto de frente (sin inclinar), nítida y con toda la planilla, de «APELLIDO Y NOMBRE» hasta el último día; o usá el Excel/PDF.';
    return asegurarOCR().then(function(){
      return root.Tesseract.createWorker('spa', 1, { langPath: OCRLANG, logger: function(m){ if(m && m.status === 'recognizing text' && fase === 'pagina') estado('Leyendo la imagen… ' + Math.round((m.progress || 0) * 100) + ' %'); } });
    }).then(function(w){
      wk = w; return wk.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
    }).then(function(){ return wk.recognize(cv); }).then(function(rr){
      /* 1) mes y año: del texto de la página */
      var d = rr.data, words = d.words || [];
      if(!words.length && d.blocks) d.blocks.forEach(function(b){ (b.paragraphs || []).forEach(function(p){ (p.lines || []).forEach(function(l){ (l.words || []).forEach(function(w){ words.push(w); }); }); }); });
      var toks = words.filter(function(w){ return w.text && w.text.trim() && w.bbox; }).map(function(w){
        return { s: w.text, x: (w.bbox.x0 + w.bbox.x1) / 2, y: (w.bbox.y0 + w.bbox.y1) / 2, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0 };
      });
      var ma = mesAnioDe(agruparFilas(toks).map(function(r){ return r.t.map(function(t){ return t.s; }).join(' '); }));
      /* 2) grilla por píxeles */
      estado('Ubicando la grilla…');
      var G = geometriaImagen(cv, ctx, ma);
      if(!G){ wk.terminate(); throw new Error(MALA); }
      var mes = ma.mes, anio = ma.anio, nd = G.nd, ly = G.ly, i, k;
      /* 3) nombres: cada fila de la tabla, solo la parte a la izquierda de los días */
      var filas = [], xl = Math.max(2, G.xa - 11 * G.pitch);
      return wk.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1' }).then(function(){
        var seq = Promise.resolve();
        for(i = G.run.a; i < G.run.b; i++) (function(idx){
          seq = seq.then(function(){
            estado('Leyendo nombres… ' + (idx - G.run.a + 1) + ' de ' + (G.run.b - G.run.a));
            var t = ly[idx], b = ly[idx + 1];
            return wk.recognize(recorteTexto(cv, xl, t + (b - t) * 0.12, G.xa - 6, b - (b - t) * 0.12)).then(function(q){
              var nm = trim(String((q.data && q.data.text) || '').replace(/[|_\[\]{}()\d]+/g, ' ').replace(/\s*[,;]\s*/g, ', '));
              if(nm.indexOf(',') < 0) nm = nm.replace(/^([A-ZÁÉÍÓÚÑ'-]{3,}(?: [A-ZÁÉÍÓÚÑ'-]{2,})?)[.:] ?/, '$1, ');
              filas.push({ idx: idx, t: t, b: b, nm: nm });
            });
          });
        })(i);
        return seq;
      }).then(function(){
        var pers = [], primero = -1;
        filas.forEach(function(f, n){
          var nm = f.nm;
          if(!/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(nm) || STOP.test(norm(nm)) || /apellido|nombre|\b20\d\d\b/.test(norm(nm))) return;
          if(nm.indexOf(',') < 0 && !/^[A-ZÁÉÍÓÚÑ'.-]{3,}( [A-ZÁÉÍÓÚÑ'.-]{2,})+$/.test(nm)) return;
          if(primero < 0) primero = n; f.persona = true;
        });
        if(primero < 0){ wk.terminate(); throw new Error(MALA); }
        var personas = filas.filter(function(f){ return f.persona; }), feriados = [], total = personas.length * nd, hecho = 0, dudas = 0, ph = filas[primero].idx;
        /* 4) feriados: casilla roja en la fila de las letras de los días (dos filas arriba de la primera persona) que no sea domingo */
        if(mes && anio && ph >= 2){
          var yt = ly[ph - 2], yb = ly[ph - 1], d1;
          for(d1 = 1; d1 <= nd; d1++){
            var cx = G.xa + (d1 - 0.5) * G.pitch;
            if(new Date(anio, mes - 1, d1).getDay() !== 0 && colorRect(G, cx - G.pitch * 0.3, yt + (yb - yt) * 0.2, cx + G.pitch * 0.3, yb - (yb - yt) * 0.2) === 'rojo') feriados.push(d1);
          }
        }
        /* 5) cada casilla: color de fondo + letra */
        fase = 'celdas';
        return wk.setParameters({ tessedit_pageseg_mode: '10', tessedit_char_whitelist: 'MTNDFL', preserve_interword_spaces: '0' }).then(function(){
          var seq = Promise.resolve(), out = [];
          personas.forEach(function(r){
            var celdas = {}, mt = 0, cv2 = 0, cp = 0;
            for(var dd = 1; dd <= nd; dd++) (function(dia){
              seq = seq.then(function(){
                var xa = G.xa + (dia - 1) * G.pitch, xb = xa + G.pitch, mh = (r.b - r.t) * 0.2, mw = G.pitch * 0.2;
                var ya = r.t + mh, yb2 = r.b - mh, cl = colorRect(G, xa + mw * 0.5, ya, xb - mw * 0.5, yb2), ink = tinta(G, xa + mw, ya, xb - mw, yb2), code = '';
                estado('Leyendo casillas… ' + (++hecho) + ' de ' + total);
                var fin = function(){
                  if(code === 'M' || code === 'T'){ mt++; if(cl === 'ver') cv2++; if(cl === 'vio') cp++; }
                  if(code || cl === 'lic') celdas[dia] = { c: cl === 'lic' ? 'L' : code, base: code, lic: cl === 'lic' };
                };
                if(ink < 0.035){ fin(); return; }
                if(tintaRoja(G, xa + mw, ya, xb - mw, yb2) > 0.5){ code = 'F'; fin(); return; }
                return wk.recognize(recortarCasilla(cv, xa + mw, ya, xb - mw, yb2, G.thr)).then(function(q){
                  var t = String((q.data && q.data.text) || '').replace(/[^A-Za-z]/g, '').toUpperCase().charAt(0);
                  if(/[MTNDFL]/.test(t)) code = t; else dudas++;
                  fin();
                });
              });
            })(dd);
            seq = seq.then(function(){ out.push(armarPersona(r.nm, celdas, mt, cv2, cp)); });
          });
          return seq.then(function(){
            wk.terminate();
            var av = []; if(dudas) av.push(dudas + ' casilla' + (dudas === 1 ? '' : 's') + ' con tinta que no pude leer quedaron vacías');
            return { fuente: 'imagen', mes: mes, anio: anio, personas: out, feriados: feriados, avisos: av };
          });
        });
      });
    });
  });
}
function leerArchivo(file, estado){
  estado = estado || function(){};
  var ext = (file.name.split('.').pop() || '').toLowerCase(), tipo = file.type || '';
  function buf(){ return file.arrayBuffer ? file.arrayBuffer() : new Promise(function(ok, ko){ var fr = new FileReader(); fr.onload = function(){ ok(fr.result); }; fr.onerror = ko; fr.readAsArrayBuffer(file); }); }
  if(/^(xlsx|xlsm|xls)$/.test(ext)){
    estado('Leyendo el Excel…');
    return asegurarXLSX().then(buf).then(function(b){
      var r = desdeExcel(b, root.XLSX);
      if(!r) throw new Error('No encontré la tabla del cronograma en el Excel. Tiene que tener los días (1, 2, 3…) en columnas y «APELLIDO Y NOMBRE» a la izquierda.');
      return r;
    });
  }
  if(ext === 'pdf' || tipo === 'application/pdf') return buf().then(function(b){ return leerPDF(b, estado); });
  if(/^(jpe?g|png)$/.test(ext) || /^image\/(jpeg|png)$/.test(tipo)) return leerImagen(file, estado);
  return Promise.reject(new Error('Formato no admitido. Cargá un archivo PDF, Excel (.xlsx), JPG o PNG.'));
}

var API = { geometriaImagen: geometriaImagen, leerArchivo: leerArchivo, desdeExcel: desdeExcel, desdeTokens: desdeTokens, emparejar: emparejar, claseColor: claseColor, partesNombre: partesNombre, mesAnioDe: mesAnioDe };
if(typeof module !== 'undefined' && module.exports) module.exports = API; else root.DiagramaImportar = API;
})(typeof window !== 'undefined' ? window : globalThis);
