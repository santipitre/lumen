/* ═══════════════════════════════════════════════════════════════════
   SPCD-EXCEL-TEMPLATE  ·  Plantilla ejecutiva común (Bloomberg / Fintech)
   ───────────────────────────────────────────────────────────────────
   Paleta:   Negro Pyralis  +  Firefly dorado (#F59E0B)  ·  acento cian secundario
   Estilo:   Ejecutivo / formal / institucional / data-terminal · Marca: Lumen by Pyralis

   Uso (cualquier módulo):
     await SpcdExcel.ready();
     const { wb, ws } = SpcdExcel.createBook({ subtitle:'INFORME ADMINISTRATIVO', sheetName:'Detalle' });
     SpcdExcel.buildHeader(ws, { subtitle:'INFORME ADMINISTRATIVO', meta:{...}, totalCols });
     SpcdExcel.buildKPIs(ws, kpis, { startRow:5, totalCols });
     const r = SpcdExcel.buildTable(ws, { columns, widths, rows, startRow, formatter });
     SpcdExcel.buildFooter(ws, { startRow:r, totalCols, meta:{...} });
     await SpcdExcel.exportAndShare(wb, fileName, shareOpts);

   Autor: Lumen by Pyralis — 2026
═══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ─────────────────────  PALETA EJECUTIVA · TECH NEÓN  ───────────────────── */
  const P = {
    INK:        'FF070B10', // Negro Pyralis — header principal
    CARBON:     'FF0A0F14', // Fondo Pyralis — filas pares
    STEEL:      'FF0E1521', // Elevado — filas impares
    GRAPHITE:   'FF1F2937', // Borde Pyralis — divisores
    SLATE:      'FF1A2332', // Input — bg secundario
    CYAN:       'FFF59E0B', // Firefly dorado — ACENTO PRINCIPAL Lumen (alias histórico "CYAN")
    CYAN_DEEP:  'FFB45309', // Dorado profundo — bordes de header
    NEON:       'FFFCD34D', // Firefly soft — líneas brillantes
    ICE:        'FFF1F5F9', // Texto claro destacado
    WHITE:      'FFF1F5F9', // Blanco — texto base
    SILVER:     'FF94A3B8', // Plata — texto secundario
    MUTED:      'FF64748B', // Mudo — texto sutil
    AMBER:      'FFFBBF24', // Ámbar — warnings
    ROSE:       'FFF87171', // Rojo — errores / críticos
    EMERALD:    'FF10B981', // Esmeralda — éxito
    /* Acentos de marca Lumen (semánticos) */
    GOLD:       'FFF59E0B', // Firefly (idéntico a CYAN, nombre claro)
    GOLD_SOFT:  'FFFCD34D',
    GOLD_GLOW:  'FFFEF3C7',
    ACCENT2:    'FF06B6D4', // Cian eléctrico — acento secundario Lumen
  };

  /* Nombres "cortos" para usar fuera */
  const PALETTE = Object.freeze({
    ink:P.INK, carbon:P.CARBON, steel:P.STEEL, graphite:P.GRAPHITE, slate:P.SLATE,
    cyan:P.CYAN, cyanDeep:P.CYAN_DEEP, neon:P.NEON, ice:P.ICE, white:P.WHITE,
    silver:P.SILVER, muted:P.MUTED, amber:P.AMBER, rose:P.ROSE, emerald:P.EMERALD,
    gold:P.GOLD, goldSoft:P.GOLD_SOFT, goldGlow:P.GOLD_GLOW, accent2:P.ACCENT2
  });

  /* ─────────────────────  CARGADOR DE EXCELJS (lazy)  ───────────────────── */
  function ready() {
    if (root.ExcelJS) return Promise.resolve(root.ExcelJS);
    if (root.__spcdExcelJSPromise) return root.__spcdExcelJSPromise;
    root.__spcdExcelJSPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      s.onload = () => resolve(root.ExcelJS);
      s.onerror = () => reject(new Error('No se pudo cargar ExcelJS'));
      document.head.appendChild(s);
    });
    return root.__spcdExcelJSPromise;
  }

  /* ─────────────────────  LOGO PNG (canvas) — Lumen by Pyralis  ─────────────────────
     Identidad: "L" blanca + punto firefly dorado (favicon Lumen) + wordmark.
     Paleta: fondo Pyralis #0A0F14 · firefly #F59E0B · texto #F1F5F9
  */
  function generateLogoPNG() {
    const c = document.createElement('canvas');
    c.width = 520; c.height = 110;
    const ctx = c.getContext('2d');

    // Fondo INK Pyralis
    ctx.fillStyle = '#070B10';
    ctx.fillRect(0,0,c.width,c.height);

    /* ── Marca: panel redondeado con "L" + punto dorado (escala del favicon 60→78) ── */
    const bx = 16, by = 16, bs = 78, s = bs/60; // factor de escala desde el viewBox 60
    const X = x => bx + x*s, Y = y => by + y*s;

    // Panel redondeado (rect x3 y3 54x54 rx13)
    (function roundRect(x,y,w,h,r){
      ctx.beginPath();
      ctx.moveTo(x+r,y);
      ctx.arcTo(x+w,y,x+w,y+h,r);
      ctx.arcTo(x+w,y+h,x,y+h,r);
      ctx.arcTo(x,y+h,x,y,r);
      ctx.arcTo(x,y,x+w,y,r);
      ctx.closePath();
    })(X(3),Y(3),54*s,54*s,13*s);
    ctx.fillStyle = '#0A0F14'; ctx.fill();
    ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 0.8*s; ctx.stroke();

    // "L" (M16 14 L16 46 L44 46)
    ctx.beginPath();
    ctx.moveTo(X(16),Y(14));
    ctx.lineTo(X(16),Y(46));
    ctx.lineTo(X(44),Y(46));
    ctx.strokeStyle = '#F1F5F9'; ctx.lineWidth = 3*s;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();

    // Anillo firefly tenue (cx38 cy22 r9)
    ctx.beginPath(); ctx.arc(X(38),Y(22),9*s,0,Math.PI*2);
    ctx.strokeStyle = 'rgba(245,158,11,.40)'; ctx.lineWidth = 0.8*s; ctx.stroke();
    // Núcleo dorado (r4)
    ctx.beginPath(); ctx.arc(X(38),Y(22),4*s,0,Math.PI*2);
    ctx.fillStyle = '#F59E0B'; ctx.fill();
    // Brillo central (r1.8)
    ctx.beginPath(); ctx.arc(X(38),Y(22),1.8*s,0,Math.PI*2);
    ctx.fillStyle = '#FEF3C7'; ctx.fill();

    /* ── Wordmark ── */
    const tx = 116;
    // "Lumen" (la 'u' en dorado, guiño al firefly-o de la marca)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '600 36px Rajdhani, Calibri, Arial';
    let cursor = tx;
    const parts = [['L','#F1F5F9'],['u','#F59E0B'],['men','#F1F5F9']];
    parts.forEach(([txt,col]) => {
      ctx.fillStyle = col;
      ctx.fillText(txt, cursor, 52);
      cursor += ctx.measureText(txt).width;
    });

    // Línea dorada fina debajo del wordmark
    ctx.beginPath();
    ctx.moveTo(tx, 60); ctx.lineTo(cursor + 6, 60);
    ctx.strokeStyle = 'rgba(245,158,11,.45)'; ctx.lineWidth = 0.8; ctx.stroke();

    // "by Pyralis"
    ctx.font = '600 12px Calibri, Arial';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText('by Pyralis', tx, 76);

    // Tagline
    ctx.font = '600 9px Calibri, Arial';
    ctx.fillStyle = 'rgba(148,163,184,.85)';
    ctx.fillText('ENTERPRISE  ·  INTELLIGENCE  ·  HEALTHCARE', tx, 92);

    return c.toDataURL('image/png').split(',')[1];
  }

  /* ─────────────────────  helpers internos  ───────────────────── */
  function fillCell(cell, color) {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb: color } };
  }
  function fillRange(ws, row, c1, c2, color) {
    for (let i = c1; i <= c2; i++) fillCell(ws.getCell(row, i), color);
  }
  function getCurrentUser() {
    try { return localStorage.getItem('spcd_user') || localStorage.getItem('spcd_username') || ''; } catch(e) { return ''; }
  }
  function getCurrentSede() {
    try { return localStorage.getItem('spcd_sede') || 'General'; } catch(e) { return 'General'; }
  }
  function nowIsoDate() { return new Date().toISOString().slice(0,10); }
  function nowAr() { return new Date().toLocaleString('es-AR'); }
  function dateAr() { return new Date().toLocaleDateString('es-AR'); }

  /* Hash corto del reporte (audit trail) */
  function makeReportHash() {
    const t = Date.now().toString(36).toUpperCase();
    const r = Math.floor(Math.random()*46656).toString(36).toUpperCase().padStart(3,'0');
    return `${t.slice(-6)}-${r}`;
  }

  /* ─────────────────────  CREAR LIBRO  ─────────────────────
     opts: { sheetName, subtitle, author, hidePageGuides }
  */
  function createBook(opts = {}) {
    if (!root.ExcelJS) throw new Error('ExcelJS no está cargado. Llamá a SpcdExcel.ready() primero.');
    const wb = new root.ExcelJS.Workbook();
    wb.creator = opts.author || 'Lumen by Pyralis';
    wb.lastModifiedBy = opts.author || 'Lumen by Pyralis';
    wb.created = new Date();
    wb.title = opts.subtitle || 'SPCD Report';
    wb.company = 'Hospital Italiano · Lumen by Pyralis';
    // Reporte ID único del libro: identifica el archivo y evita duplicados.
    // Se reutiliza en header, footer y nombre de archivo (todo el mismo ID).
    wb._lumenRef = makeReportHash();
    const ws = wb.addWorksheet(opts.sheetName || 'Reporte', {
      properties: { tabColor: { argb: P.CYAN } },
      views: [{ showGridLines: false, state:'normal', zoomScale: 100 }],
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left:0.4, right:0.4, top:0.4, bottom:0.5, header:0.2, footer:0.2 }
      },
      headerFooter: {
        oddFooter: '&L&8&"Calibri"&K94A3B8LUMEN by Pyralis&R&8&"Calibri"&KF59E0BPágina &P de &N'
      }
    });
    // Print area se ajusta cuando se sabe el rango — opcional
    return { wb, ws };
  }

  /* ─────────────────────  HEADER PRINCIPAL  ─────────────────────
     opts: { subtitle, totalCols, meta:{ sede, fecha, usuario, modulo, registros, periodo, extra }, hash, logo }
     Ocupa filas 1..4
  */
  function buildHeader(ws, opts) {
    const cols = Math.max(1, opts.totalCols || 8);
    const sub  = (opts.subtitle || 'INFORME EJECUTIVO').toUpperCase();
    const m    = opts.meta || {};
    const sede = m.sede || getCurrentSede();
    const usuario = m.usuario || getCurrentUser();
    const fecha   = m.fecha || dateAr();
    const modulo  = (m.modulo || 'SPCD').toUpperCase();
    const hash = opts.hash || (ws.workbook && ws.workbook._lumenRef) || makeReportHash();

    /* Fila 1 — barra superior cian neón (h=3) */
    fillRange(ws, 1, 1, cols, P.CYAN);
    ws.getRow(1).height = 3;

    /* Fila 2 — Logo + Título (h=46, INK) */
    fillRange(ws, 2, 1, cols, P.INK);
    if (cols > 3) ws.mergeCells(2, 4, 2, cols);
    const tCell = ws.getCell(2, Math.min(4, cols));
    tCell.value = sub;
    tCell.font = { name:'Calibri', size:16, bold:true, color:{ argb:P.ICE } };
    tCell.alignment = { horizontal:'center', vertical:'middle' };
    ws.getRow(2).height = 46;

    if (opts.logo !== false) {
      try {
        const logoB64 = (typeof opts.logoFn === 'function' ? opts.logoFn() : generateLogoPNG());
        const logoId = ws.workbook.addImage({ base64: logoB64, extension:'png' });
        ws.addImage(logoId, { tl:{ col:0.15, row:1.10 }, ext:{ width:240, height:50 } });
      } catch(e) { /* logo silencioso */ }
    }

    /* Fila 3 — línea neón cian fina (h=3) */
    fillRange(ws, 3, 1, cols, P.INK);
    for (let i=1;i<=cols;i++) {
      ws.getCell(3,i).border = { bottom: { style:'medium', color:{ argb:P.CYAN } } };
    }
    ws.getRow(3).height = 3;

    /* Fila 4 — Brand bar con chips (h=24) */
    fillRange(ws, 4, 1, cols, P.STEEL);
    if (cols >= 1) ws.mergeCells(4, 1, 4, cols);
    const bar = ws.getCell(4, 1);
    const partes = [];
    partes.push(`▸ MÓDULO: ${modulo}`);
    partes.push(`SEDE: ${sede.toUpperCase()}`);
    partes.push(`FECHA: ${fecha}`);
    if (usuario) partes.push(`USUARIO: ${usuario}`);
    if (m.periodo) partes.push(`PERÍODO: ${m.periodo}`);
    if (typeof m.registros === 'number') partes.push(`REGISTROS: ${m.registros.toLocaleString('es-AR')}`);
    if (m.extra) partes.push(m.extra);
    partes.push(`ID: ${hash}`);
    bar.value = '  ' + partes.join('   ◆   ');
    bar.font = { name:'Consolas', size:9, bold:true, color:{ argb:P.CYAN } };
    bar.alignment = { horizontal:'left', vertical:'middle' };
    bar.border = { bottom: { style:'hair', color:{ argb:P.GRAPHITE } } };
    ws.getRow(4).height = 24;

    /* Devuelvo metadata útil */
    return { hash, nextRow: 5, headerRows: 4 };
  }

  /* ─────────────────────  KPI CARDS  ─────────────────────
     kpis: array de { label, value, hint?, tone? ('cyan'|'amber'|'rose'|'emerald'|'silver') }
     opts: { startRow, totalCols }
     Ocupa 3 filas: spacer + label-row + value-row + spacer
     Devuelve { nextRow }
  */
  function buildKPIs(ws, kpis, opts) {
    if (!Array.isArray(kpis) || !kpis.length) return { nextRow: opts.startRow };
    const cols = Math.max(1, opts.totalCols || 8);
    const startRow = opts.startRow || 5;
    const n = kpis.length;
    const span = Math.floor(cols / n);
    const remain = cols - span * n;

    /* spacer arriba */
    fillRange(ws, startRow, 1, cols, P.CARBON);
    ws.getRow(startRow).height = 8;

    const labelRow = startRow + 1;
    const valueRow = startRow + 2;

    let cursor = 1;
    kpis.forEach((k, idx) => {
      const w = span + (idx < remain ? 1 : 0);
      const c1 = cursor;
      const c2 = cursor + w - 1;
      cursor = c2 + 1;

      const tone = k.tone || (idx === 0 ? 'cyan' : (idx % 2 ? 'silver' : 'cyan'));
      const accent = ({ cyan:P.CYAN, amber:P.AMBER, rose:P.ROSE, emerald:P.EMERALD, silver:P.SILVER })[tone] || P.CYAN;

      // label row (h=18)
      ws.mergeCells(labelRow, c1, labelRow, c2);
      const lc = ws.getCell(labelRow, c1);
      lc.value = '  ' + (k.label || '').toUpperCase();
      lc.font = { name:'Calibri', size:8, bold:true, color:{ argb:P.MUTED } };
      lc.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:P.STEEL } };
      lc.alignment = { horizontal:'left', vertical:'middle' };
      lc.border = {
        top:    { style:'thin',   color:{ argb:accent } },
        left:   { style:'hair',   color:{ argb:P.GRAPHITE } },
        right:  { style:'hair',   color:{ argb:P.GRAPHITE } }
      };
      // Pintar resto de celdas del label-row dentro del card
      for (let i = c1+1; i <= c2; i++) {
        const x = ws.getCell(labelRow, i);
        x.fill = lc.fill;
        x.border = { top: { style:'thin', color:{ argb:accent } } };
      }

      // value row (h=30)
      ws.mergeCells(valueRow, c1, valueRow, c2);
      const vc = ws.getCell(valueRow, c1);
      const v = (k.value === null || k.value === undefined) ? '—' : k.value;
      const hint = k.hint ? `   ${k.hint}` : '';
      vc.value = '  ' + v + hint;
      vc.font = { name:'Consolas', size:18, bold:true, color:{ argb:accent } };
      vc.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:P.CARBON } };
      vc.alignment = { horizontal:'left', vertical:'middle' };
      vc.border = {
        bottom: { style:'thin', color:{ argb:P.GRAPHITE } },
        left:   { style:'hair', color:{ argb:P.GRAPHITE } },
        right:  { style:'hair', color:{ argb:P.GRAPHITE } }
      };
      for (let i = c1+1; i <= c2; i++) {
        const x = ws.getCell(valueRow, i);
        x.fill = vc.fill;
        x.border = { bottom: { style:'thin', color:{ argb:P.GRAPHITE } } };
      }
    });
    ws.getRow(labelRow).height = 18;
    ws.getRow(valueRow).height = 30;

    /* spacer abajo */
    const sp = valueRow + 1;
    fillRange(ws, sp, 1, cols, P.CARBON);
    ws.getRow(sp).height = 8;

    return { nextRow: sp + 1 };
  }

  /* ─────────────────────  SECTION TITLE  ─────────────────────
     Para encabezar bloques: "DETALLE DE OPERACIONES", "DESGLOSE", etc.
  */
  function buildSection(ws, opts) {
    const cols = Math.max(1, opts.totalCols || 8);
    const r = opts.startRow;
    fillRange(ws, r, 1, cols, P.INK);
    ws.mergeCells(r, 1, r, cols);
    const c = ws.getCell(r, 1);
    c.value = '  ◤  ' + (opts.title || 'DATOS').toUpperCase();
    c.font = { name:'Calibri', size:11, bold:true, color:{ argb:P.CYAN } };
    c.alignment = { horizontal:'left', vertical:'middle' };
    c.border = { bottom: { style:'thin', color:{ argb:P.CYAN_DEEP } } };
    ws.getRow(r).height = 22;
    return { nextRow: r + 1 };
  }

  /* ─────────────────────  TABLA: HEADER + FILAS  ─────────────────────
     opts: {
       columns:[ 'Header1', 'Header2', ... ],          // labels visibles
       widths:[ 12, 8, ... ],                          // widths (chars)
       rows:[ [..valores..] | { col:val } ],           // datos
       startRow,
       totalCols (opc, default = columns.length),
       formatter: (cell, value, rowData, rowIdx, colIdx, colName) => void   // opcional
       freezeHeader: true|false                        // freeze header row
     }
     Devuelve { nextRow, headerRow, dataStartRow, dataEndRow, totalCols }
  */
  function buildTable(ws, opts) {
    const cols = opts.columns || [];
    const widths = opts.widths || cols.map(()=>14);
    const rows = opts.rows || [];
    const totalCols = opts.totalCols || cols.length;
    const startRow = opts.startRow || 1;
    const formatter = opts.formatter || null;

    // Anchos
    widths.forEach((w,i) => { ws.getColumn(i+1).width = w; });

    // Header row
    const hr = ws.getRow(startRow);
    cols.forEach((h,i) => {
      const cell = hr.getCell(i+1);
      cell.value = h;
      cell.font = { name:'Calibri', size:9, bold:true, color:{ argb:P.INK } };
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:P.CYAN } };
      cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
      cell.border = {
        top:    { style:'thin',   color:{ argb:P.CYAN_DEEP } },
        bottom: { style:'medium', color:{ argb:P.CYAN_DEEP } },
        left:   { style:'hair',   color:{ argb:P.STEEL } },
        right:  { style:'hair',   color:{ argb:P.STEEL } }
      };
    });
    // Pintar columnas extra (más allá de las definidas) con el bg STEEL
    if (totalCols > cols.length) {
      for (let i = cols.length+1; i <= totalCols; i++) fillCell(hr.getCell(i), P.STEEL);
    }
    hr.height = 24;

    // Data rows
    const cellBorderEven = {
      bottom:{ style:'hair', color:{ argb:P.GRAPHITE } },
      left:  { style:'hair', color:{ argb:P.STEEL } },
      right: { style:'hair', color:{ argb:P.STEEL } }
    };
    const cellBorderOdd = cellBorderEven;

    rows.forEach((rowData, idx) => {
      const r = ws.getRow(startRow + 1 + idx);
      const bg = (idx % 2 === 0) ? P.CARBON : P.STEEL;
      const isArray = Array.isArray(rowData);
      cols.forEach((c, i) => {
        const cell = r.getCell(i+1);
        let val;
        if (isArray) val = rowData[i];
        else val = rowData[c] ?? rowData[c.toLowerCase?.()] ?? '';
        cell.value = (val === undefined || val === null) ? '' : val;
        cell.font = { name:'Calibri', size:9, color:{ argb:P.WHITE } };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:bg } };
        cell.border = (idx%2===0)? cellBorderEven : cellBorderOdd;
        cell.alignment = { vertical:'middle', shrinkToFit:true, wrapText:false };
        if (formatter) {
          try { formatter(cell, cell.value, rowData, idx, i, c); } catch(e) { /* skip */ }
        }
      });
      // Pintar resto de columnas (visual continuity)
      if (totalCols > cols.length) {
        for (let i = cols.length+1; i <= totalCols; i++) fillCell(r.getCell(i), bg);
      }
      r.height = 16;
    });

    // Freeze header
    if (opts.freezeHeader !== false) {
      ws.views = [{ state:'frozen', xSplit: 0, ySplit: startRow, showGridLines:false, zoomScale:100 }];
    }

    return {
      nextRow: startRow + 1 + rows.length,
      headerRow: startRow,
      dataStartRow: startRow + 1,
      dataEndRow: startRow + rows.length,
      totalCols
    };
  }

  /* ─────────────────────  TOTALS / RESUMEN  ─────────────────────
     opts: { startRow, totalCols, items: [{ label, value, tone? }] }
  */
  function buildTotals(ws, opts) {
    const cols = Math.max(1, opts.totalCols || 8);
    const r = opts.startRow;
    const items = opts.items || [];
    fillRange(ws, r, 1, cols, P.SLATE);
    ws.mergeCells(r, 1, r, cols);
    const c = ws.getCell(r, 1);
    const txt = items.map(it => {
      const tone = it.tone || 'cyan';
      const sep = '  ◆  ';
      return `${(it.label||'').toUpperCase()}: ${it.value}`;
    }).join('   ◆   ');
    c.value = '  ' + txt;
    c.font = { name:'Consolas', size:10, bold:true, color:{ argb:P.CYAN } };
    c.alignment = { horizontal:'left', vertical:'middle' };
    c.border = {
      top:    { style:'thin',   color:{ argb:P.CYAN_DEEP } },
      bottom: { style:'thin',   color:{ argb:P.CYAN_DEEP } }
    };
    ws.getRow(r).height = 22;
    return { nextRow: r + 1 };
  }

  /* ─────────────────────  FOOTER  ─────────────────────
     opts: { startRow, totalCols, hash, meta }
  */
  function buildFooter(ws, opts) {
    const cols = Math.max(1, opts.totalCols || 8);
    const r = opts.startRow || 1;

    /* spacer */
    fillRange(ws, r, 1, cols, P.CARBON);
    ws.getRow(r).height = 6;

    /* línea cian fina */
    fillRange(ws, r+1, 1, cols, P.INK);
    for (let i=1;i<=cols;i++) ws.getCell(r+1,i).border = { top: { style:'medium', color:{ argb:P.CYAN } } };
    ws.getRow(r+1).height = 3;

    /* footer row con metadata */
    fillRange(ws, r+2, 1, cols, P.INK);
    ws.mergeCells(r+2, 1, r+2, cols);
    const c = ws.getCell(r+2, 1);
    const hash = opts.hash || (ws.workbook && ws.workbook._lumenRef) || makeReportHash();
    const usuario = (opts.meta && opts.meta.usuario) || getCurrentUser();
    const partes = [
      `LUMEN by Pyralis · ENTERPRISE INTELLIGENCE`,
      `Generado: ${nowAr()}`,
      usuario ? `Usuario: ${usuario}` : null,
      `Reporte ID: ${hash}`,
      `Confidencial · Uso interno Hospital Italiano`
    ].filter(Boolean);
    c.value = '  ' + partes.join('   ·   ');
    c.font = { name:'Calibri', size:8, italic:true, color:{ argb:P.SILVER } };
    c.alignment = { horizontal:'left', vertical:'middle' };
    ws.getRow(r+2).height = 18;

    return { nextRow: r + 3 };
  }

  /* ─────────────────────  EXPORT + SHARE  ─────────────────────
     fileName SIN extensión opcional .xlsx (se agrega si falta)
     shareOpts: si está y existe window.SpcdShare → muestra diálogo
  */
  async function exportAndShare(wb, fileName, shareOpts) {
    // ── Convención de nombre Lumen ──
    //   LUMEN_<descripción>_<ReporteID>.xlsx
    //   · Prefijo LUMEN_ (saca prefijos viejos SPCD_/LUMEN_ si venían en el nombre).
    //   · ReporteID = mismo hash único del documento → identificatorio y sin duplicados.
    let base = String(fileName || 'Reporte').replace(/\.xlsx$/i, '');
    base = base.replace(/^\s*(SPCD|LUMEN)[\s_\-]+/i, '').trim();   // quita prefijo viejo
    if (!base) base = 'Reporte';
    // Acortar: quitar la explicación que va tras un guión largo (—/–), preservando la fecha final
    if (/[—–]/.test(base)) {
      const dm = base.match(/\d{4}-\d{2}-\d{2}/);
      base = base.split(/[—–]/)[0].replace(/[_\s]+$/, '');
      if (dm && !base.includes(dm[0])) base += '_' + dm[0];
    }
    const ref = (wb && wb._lumenRef) || makeReportHash();
    if (!new RegExp(`${ref}$`).test(base)) base = `${base}_${ref}`; // evita duplicar el ID
    fileName = `LUMEN_${base}.xlsx`;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (shareOpts && root.SpcdShare && typeof root.SpcdShare.showShareDialog === 'function') {
      try { root.SpcdShare.showShareDialog(blob, fileName, shareOpts); } catch(e) { /* skip */ }
    }
    return { blob, fileName };
  }

  /* ─────────────────────  HELPERS DE FORMATEO COMUNES  ───────────────────── */
  const Fmt = {
    money(cell)   { cell.numFmt = '"$"#,##0;[Red]"$"-#,##0'; cell.alignment = { ...(cell.alignment||{}), horizontal:'right' }; },
    moneyD(cell)  { cell.numFmt = '"$"#,##0.00;[Red]"$"-#,##0.00'; cell.alignment = { ...(cell.alignment||{}), horizontal:'right' }; },
    int(cell)     { cell.numFmt = '#,##0'; cell.alignment = { ...(cell.alignment||{}), horizontal:'right' }; },
    pct(cell)     { cell.numFmt = '0.0%'; cell.alignment = { ...(cell.alignment||{}), horizontal:'right' }; },
    date(cell)    { cell.numFmt = 'dd/mm/yyyy'; cell.alignment = { ...(cell.alignment||{}), horizontal:'center' }; },
    center(cell)  { cell.alignment = { ...(cell.alignment||{}), horizontal:'center' }; },
    error(cell)   { cell.font = { ...(cell.font||{}), color:{ argb:P.ROSE }, bold:true }; },
    warn(cell)    { cell.font = { ...(cell.font||{}), color:{ argb:P.AMBER }, bold:true }; },
    success(cell) { cell.font = { ...(cell.font||{}), color:{ argb:P.EMERALD }, bold:true }; },
    accent(cell)  { cell.font = { ...(cell.font||{}), color:{ argb:P.CYAN }, bold:true }; }
  };

  /* ─────────────────────  EXPORT API  ───────────────────── */
  root.SpcdExcel = {
    PALETTE, P,
    ready,
    gene
