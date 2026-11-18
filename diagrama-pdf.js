/* diagrama-pdf.js — Lumen · Cronogramas · Técnicos
 * Genera el PDF del cronograma mensual con el MISMO formato de la planilla del Hospital Italiano de Mendoza:
 * título + logo, fila del mes con las letras de los días (domingos y feriados en rojo), «APELLIDO Y NOMBRE» con los días,
 * una fila por técnico (APELLIDO, N.) con M/T/N/D/F/L, LICENCIA en amarillo, y el bloque «Horario de turno y Referencias».
 * Sin librerías (A4 apaisado, vectorial, Helvetica). El resultado se puede volver a cargar con «Cargar archivo».
 *   DiagramaPDF.planilla({ mes, anio, filas:[{ nombre, celdas:{ dia:{ c, m } } }], feriados:[dia], logo:{ w, h, data } | null }) → Uint8Array
 *   logo.data = cadena binaria con los bytes RGB (w·h·3).
 */
(function(root){
'use strict';
var MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
var DOWL = ['D', 'L', 'M', 'MI', 'J', 'V', 'S'];
var AW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
var AWB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
var C_AZUL = [0.741, 0.839, 0.933], C_ROJO = [1, 0, 0], C_AMARILLO = [1, 0.851, 0.4], C_VERDE = [0.773, 0.878, 0.706], C_VIOLETA = [0.8, 0.6, 1],
    C_SAB = [0.886, 0.937, 0.855], C_NEGRO = [0.08, 0.08, 0.08], C_LINEA = [0.55, 0.57, 0.6], C_BLANCO = [1, 1, 1];

function lat(s){
  return String(s).replace(/–/g, '\x96').replace(/—/g, '\x97').replace(/…/g, '\x85').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/→/g, '>').replace(/[^\x00-\xFF]/g, '?');
}
function esc(s){ return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function ancho(s, sz, bold){
  var w = 0, T = bold ? AWB : AW;
  for(var i = 0; i < s.length; i++){ var c = s.charCodeAt(i); w += c >= 32 && c <= 126 ? T[c - 32] : 556; }
  return w * sz / 1000;
}
function cortar(s, sz, bold, max){
  var t = lat(s);
  if(ancho(t, sz, bold) <= max) return t;
  while(t.length > 1 && ancho(t + '..', sz, bold) > max) t = t.slice(0, -1);
  return t + '..';
}
function col(a){ return a.map(function(x){ return x.toFixed(3); }).join(' '); }
function pagina(W, H){
  var c = [];
  return {
    W: W, H: H, ops: c, img: [],
    rect: function(x, y, w, h, o){
      o = o || {};
      c.push('q');
      if(o.fill) c.push(col(o.fill) + ' rg');
      c.push(col(o.line || C_LINEA) + ' RG ' + (o.lw || 0.5) + ' w');
      c.push(x.toFixed(2) + ' ' + (H - y - h).toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re ' + (o.fill ? (o.noline ? 'f' : 'B') : 'S'));
      c.push('Q');
    },
    text: function(x, y, s, sz, o){
      o = o || {};
      var t = lat(s), w = ancho(t, sz, o.bold);
      var xx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
      c.push('BT ' + col(o.color || C_NEGRO) + ' rg /' + (o.bold ? 'F2' : 'F1') + ' ' + sz + ' Tf ' + xx.toFixed(2) + ' ' + (H - y).toFixed(2) + ' Td (' + esc(t) + ') Tj ET');
      return w;
    },
    imagen: function(x, y, w, h){ c.push('q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + x.toFixed(2) + ' ' + (H - y - h).toFixed(2) + ' cm /Im1 Do Q'); }
  };
}
function armar(paginas, logo){
  var objs = [];
  function add(s){ objs.push(s); return objs.length; }
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  var imgId = 0;
  if(logo) imgId = add('<< /Type /XObject /Subtype /Image /Width ' + logo.w + ' /Height ' + logo.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ' + logo.data.length + ' >>\nstream\n' + logo.data + '\nendstream');
  var kids = [];
  paginas.forEach(function(p){
    var body = p.ops.join('\n'), cid = objs.length + 2;
    kids.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + p.W + ' ' + p.H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>' + (imgId ? ' /XObject << /Im1 ' + imgId + ' 0 R >>' : '') + ' >> /Contents ' + cid + ' 0 R >>') + ' 0 R');
    add('<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream');
  });
  objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
  var out = '%PDF-1.4\n', offs = [];
  objs.forEach(function(o, i){ offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  var xr = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offs.forEach(function(o){ out += String(o).padStart(10, '0') + ' 00000 n \n'; });
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info << /Title (Cronograma mensual del personal tecnico) /Producer (Lumen) >> >>\nstartxref\n' + xr + '\n%%EOF\n';
  var u8 = new Uint8Array(out.length);
  for(var i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 255;
  return u8;
}
/* «Forni V.» → { ape: 'FORNI', nom: 'V.' } · «Dalla Caneva M.» → DALLA CANEVA / M. */
function partes(nombre){
  var t = String(nombre || '').replace(/\s+/g, ' ').trim().split(' ');
  if(t.length === 1) return { ape: t[0].toUpperCase(), nom: '' };
  return { ape: t.slice(0, -1).join(' ').toUpperCase(), nom: t[t.length - 1] };
}

function planilla(d){
  var W = 842, H = 595, mx = 24, nDias = new Date(d.anio, d.mes, 0).getDate(), fer = {};
  (d.feriados || []).forEach(function(x){ fer[x] = 1; });
  var nameW = 146, cw = (W - 2 * mx - nameW) / nDias, tw = nameW + cw * nDias;
  var porPag = 16, grupos = [], filas = d.filas || [];
  for(var i = 0; i < filas.length || !grupos.length; i += porPag) grupos.push(filas.slice(i, i + porPag));
  var pags = [];
  grupos.forEach(function(gr, gi){
    var p = pagina(W, H), x0 = mx, y0 = 100, hh1 = 22, hh2 = 20, rh = Math.max(15, Math.min(22, gi === grupos.length - 1 ? (H - 24 - y0 - hh1 - hh2 - 128) / Math.max(1, gr.length) : 22));
    /* título y logo */
    p.text(x0 + tw / 2, 54, 'HOSPITAL ITALIANO DE MENDOZA', 22, { bold: true, align: 'center' });
    if(d.logo) p.imagen(W - mx - 58, 18, 58, 58 * d.logo.h / d.logo.w);
    /* fila 1: mes + letras de los días */
    p.rect(x0, y0, nameW, hh1, { fill: C_AZUL });
    p.text(x0 + nameW / 2, y0 + 15, MESES[d.mes - 1] + ' ' + d.anio + '.', 11, { bold: true, align: 'center' });
    for(var k = 1; k <= nDias; k++){
      var dow = new Date(d.anio, d.mes - 1, k).getDay(), rojo = dow === 0 || fer[k], x = x0 + nameW + (k - 1) * cw;
      p.rect(x, y0, cw, hh1, { fill: rojo ? C_ROJO : dow === 6 ? C_SAB : C_AZUL });
      p.text(x + cw / 2, y0 + 14.5, DOWL[dow], 7.5, { align: 'center', color: rojo ? C_BLANCO : C_NEGRO, bold: !!rojo });
    }
    /* fila 2: APELLIDO Y NOMBRE + números */
    p.rect(x0, y0 + hh1, nameW, hh2, { fill: C_AZUL });
    p.text(x0 + nameW / 2, y0 + hh1 + 13.5, 'APELLIDO Y NOMBRE', 8, { align: 'center' });
    for(k = 1; k <= nDias; k++){
      var xk = x0 + nameW + (k - 1) * cw;
      p.rect(xk, y0 + hh1, cw, hh2, { fill: C_BLANCO });
      p.text(xk + cw / 2, y0 + hh1 + 13.5, String(k), 8, { align: 'center' });
    }
    /* técnicos */
    var yy = y0 + hh1 + hh2;
    gr.forEach(function(f){
      var pt = partes(f.nombre), sz = 9, a = pt.ape, b = pt.nom ? ', ' + pt.nom : '';
      while(sz > 6 && ancho(lat(a), sz, true) + ancho(lat(b), sz, false) > nameW - 8) sz -= 0.5;
      p.rect(x0, yy, nameW, rh, { fill: C_AZUL });
      var wa = ancho(lat(a), sz, true), wb = ancho(lat(b), sz, false), xs = x0 + (nameW - wa - wb) / 2, yb = yy + rh / 2 + sz * 0.35;
      p.text(xs, yb, a, sz, { bold: true }); p.text(xs + wa, yb, b, sz, {});
      for(var k2 = 1; k2 <= nDias; k2++){
        var c = f.celdas && f.celdas[k2], xc = x0 + nameW + (k2 - 1) * cw, code = c && c.m !== 'no' ? c.c : '', lic = code === 'L';
        p.rect(xc, yy, cw, rh, { fill: lic ? C_AMARILLO : C_BLANCO });
        if(code){
          p.text(xc + cw / 2, yy + rh / 2 + 3.2, code + (c.m === 'pend' ? '?' : ''), 9, { align: 'center', bold: code === 'D', color: code === 'F' ? C_ROJO : C_NEGRO });
        }
      }
      yy += rh;
    });
    if(gi === grupos.length - 1){
      /* bloque de referencias */
      var lh = 13, lw = nameW + 2 * cw;
      p.rect(x0, yy, tw, 20, { fill: C_BLANCO, line: C_NEGRO });
      p.text(x0 + tw / 2, yy + 14.5, 'Horario de turno y Referencias.', 12.5, { bold: true, align: 'center' });
      yy += 20;
      [['Turno mañana: 7:00-13:00', 'REFERENCIA ( M )', null], ['Turno tarde: 13:00-19:00', 'REFERENCIA ( T )', null], ['Turno Noche: 19:00-07:00', 'REFERENCIA ( N )', null],
       ['FRANCO', 'REFERENCIA ( F )', null], ['LICENCIAS', 'REFERENCIA ( L )', C_AMARILLO], ['Turno mañana: 8:00-14:00', '', C_VERDE],
       ['Turno tarde: 16:00-22:00', '', C_VIOLETA], ['Guardias día: 07 a 19 hs "D"', '', null]].forEach(function(r){
        p.rect(x0, yy, lw, lh, { fill: C_BLANCO });
        p.text(x0 + lw / 2, yy + 9.5, r[0], 7.5, { align: 'center' });
        p.rect(x0 + lw, yy, tw - lw, lh, { fill: r[2] || C_BLANCO });
        if(r[1]) p.text(x0 + lw + 3, yy + 9.5, r[1], 7.5, {});
        yy += lh;
      });
    }
    pags.push(p);
  });
  return armar(pags, d.logo || null);
}

var API = { planilla: planilla };
if(typeof module !== 'undefined' && module.exports) module.exports = API; else root.DiagramaPDF = API;
})(typeof window !== 'undefined' ? window : globalThis);
