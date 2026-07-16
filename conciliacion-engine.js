/* ============================================================
   LUMEN · CONCILIACIÓN PAMI — MOTOR DE MATCHING (sin DOM)
   ------------------------------------------------------------
   Puro: parseo (desde arrays), normalización, generación de
   candidatos 1-a-N, scoring 0-100 y clasificación de ESTADO.
   Reusable en navegador (window.CP) y en Node (module.exports)
   para poder testearlo contra los archivos reales.

   Diseño calibrado sobre datos reales (Turno5055 + bandeja):
   - El afiliado FUESMEN viene vacío en ~25% del set filtrado
     (96% en cuenta 'PAMI'): NO puede ser clave única. Nombre+
     fecha cargan el match; afiliado es bonus cuando existe.
   - PAMI se cruza COMPLETO (sin filtrar VALIDADA) porque el
     objetivo es reconciliar ESTADO, no sólo lo pendiente.
   ============================================================ */
(function (root) {
  'use strict';

  // ── Normalizadores ──────────────────────────────────────
  function stripAccents(t) {
    return String(t == null ? '' : t)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '');
  }
  function normName(t) {
    var s = stripAccents(t).toUpperCase().replace(/[^A-Z ]/g, ' ');
    var toks = s.split(/\s+/).filter(function (w) { return w.length > 0; });
    toks.sort();
    return toks.join(' ');
  }
  function nameTokens(t) {
    return stripAccents(t).toUpperCase().replace(/[^A-Z ]/g, ' ')
      .split(/\s+/).filter(function (w) { return w.length >= 3; });
  }
  function normAfil(t) {
    return String(t == null ? '' : t).replace(/\D/g, '').replace(/^0+/, '');
  }
  function trim(t) { return String(t == null ? '' : t).trim(); }

  // ── token_sort_ratio compatible con rapidfuzz (Indel/LCS) ──
  // ratio = 100 * 2*LCS / (len1+len2)
  function lcsLen(a, b) {
    var n = a.length, m = b.length;
    if (n === 0 || m === 0) return 0;
    var prev = new Int32Array(m + 1), cur = new Int32Array(m + 1), i, j, tmp;
    for (i = 1; i <= n; i++) {
      var ca = a.charCodeAt(i - 1);
      for (j = 1; j <= m; j++) {
        if (ca === b.charCodeAt(j - 1)) cur[j] = prev[j - 1] + 1;
        else cur[j] = prev[j] >= cur[j - 1] ? prev[j] : cur[j - 1];
      }
      tmp = prev; prev = cur; cur = tmp;
      for (j = 0; j <= m; j++) cur[j] = 0;
    }
    return prev[m];
  }
  // a, b ya normalizados (token-sorted). Devuelve 0..100
  function ratio(a, b) {
    if (!a && !b) return 100;
    if (!a || !b) return 0;
    var L = lcsLen(a, b);
    return (200 * L) / (a.length + b.length);
  }
  function nameSim(a, b) { return (a && b) ? ratio(a, b) : 0; }

  // ── Fechas ──────────────────────────────────────────────
  function dOnly(d) {
    if (!d) return null;
    if (d instanceof Date && !isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return null;
  }
  // PAMI TURNO: "01/03/2026 - 02:20 - P" → Date (dd/mm/aaaa)
  function parsePamiFecha(s) {
    var m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s || ''));
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1]);
  }
  function deltaDias(a, b) {
    if (!a || !b) return null;
    return Math.abs(Math.round((a - b) / 86400000));
  }
  function fmtDate(d) {
    if (!d) return '';
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  // ── Localizar columnas por header normalizado ───────────
  function headerIndex(headerRow) {
    var idx = {};
    for (var c = 0; c < headerRow.length; c++) {
      var key = stripAccents(headerRow[c]).toUpperCase().replace(/\s+/g, ' ').trim();
      idx[key] = c;
    }
    return function (name) {
      var key = stripAccents(name).toUpperCase().replace(/\s+/g, ' ').trim();
      return (key in idx) ? idx[key] : -1;
    };
  }

  // ── Parseo FUESMEN (aoa = array-of-arrays con fila 0 = headers) ──
  var ASEG_OK = { 'INSSJYP': 1, 'FINAMED SA - HOSP ITAL (PROV)': 1 };
  function parseFuesmen(aoa) {
    if (!aoa || aoa.length < 2) return { turnos: [], total: 0, p1: 0, p2: 0, vacios: 0 };
    var H = aoa[0], at = headerIndex(H);
    var iTur = at('N° Turno'), iFT = at('Fecha Turno'),
        iAP = at('Apellido Paterno'), iAM = at('Apellido Materno'), iNo = at('Nombres'),
        iDoc = at('Documento'), iEst = at('Estudio'), iServ = at('Servicio'),
        iAseg = at('Aseguradora'), iCta = at('Cuenta'), iAfi = at('N° Afiliado'),
        iRec = at('Recep. Orden'), iEstado = at('Estado');
    var byTurno = {}, order = [], p1 = 0, p2 = 0, totalData = aoa.length - 1;
    for (var r = 1; r < aoa.length; r++) {
      var row = aoa[r];
      var aseg = trim(row[iAseg]);
      if (!(aseg in ASEG_OK)) continue;
      p1++;
      var cta = trim(row[iCta]).toUpperCase();
      if (!(cta.indexOf('INSSJYP') === 0 || cta.indexOf('PAMI') === 0)) continue;
      p2++;
      var tur = row[iTur];
      tur = (typeof tur === 'number') ? String(Math.trunc(tur)) : trim(tur);
      var estudio = trim(row[iEst]);
      if (!byTurno[tur]) {
        var fdate = dOnly(row[iFT]);
        var obj = {
          nro_turno: tur,
          fecha: fdate,
          fecha_str: fmtDate(fdate),
          apellido_paterno: trim(row[iAP]),
          apellido_materno: trim(row[iAM]),
          nombres: trim(row[iNo]),
          nombre_raw: (trim(row[iAP]) + ' ' + trim(row[iAM]) + ' ' + trim(row[iNo])).replace(/\s+/g, ' ').trim(),
          nombre_norm: normName(trim(row[iAP]) + ' ' + trim(row[iAM]) + ' ' + trim(row[iNo])),
          documento: trim(row[iDoc]),
          afiliado_raw: trim(row[iAfi]),
          afiliado_norm: normAfil(row[iAfi]),
          aseguradora: aseg,
          cuenta: trim(row[iCta]),
          servicio: trim(row[iServ]),
          recep_orden: trim(row[iRec]),
          estado_fuesmen: trim(row[iEstado]),
          estudios: []
        };
        byTurno[tur] = obj; order.push(tur);
      }
      if (estudio) byTurno[tur].estudios.push(estudio);
    }
    var turnos = order.map(function (t) { return byTurno[t]; });
    var vacios = turnos.filter(function (x) { return !x.afiliado_norm; }).length;
    return { turnos: turnos, total: totalData, p1: p1, p2: p2, vacios: vacios };
  }

  // ── Parseo PAMI (aoa = filas de la <table> ya como texto) ──
  function parsePami(aoa, cfg) {
    cfg = cfg || {};
    if (!aoa || aoa.length < 2) return { registros: [], total: 0, delUsuario: 0, pendientes: 0 };
    var H = aoa[0], at = headerIndex(H);
    var iOrd = at('NRO. ORDEN'), iBen = at('NRO. BENEFICIO/GP'), iNom = at('APELLIDO Y NOMBRE'),
        iPrac = at('PRÁCTICA'), iTur = at('TURNO'), iUA = at('U. ACEPTO'),
        iTra = at('TRASMITIDA'), iVal = at('VALIDADA'), iFEmi = at('FECHA EMISIÓN');
    var regs = [], delUsuario = 0, pend = 0;
    for (var r = 1; r < aoa.length; r++) {
      var row = aoa[r];
      if (!row || row.length < 4) continue;
      var fec = parsePamiFecha(row[iTur]);
      var ua = trim(row[iUA]), val = trim(row[iVal]), tra = trim(row[iTra]);
      var o = {
        nro_orden: trim(row[iOrd]),
        afiliado_raw: trim(row[iBen]),
        afiliado_norm: normAfil(row[iBen]),
        nombre_raw: trim(row[iNom]),
        nombre_norm: normName(row[iNom]),
        practica: trim(row[iPrac]),
        turno_str: trim(row[iTur]),
        fecha: fec,
        fecha_str: fmtDate(fec),
        u_acepto: ua,
        trasmitida: tra,
        validada: val,
        fecha_emision: trim(row[iFEmi])
      };
      regs.push(o);
      if (cfg.uAcepto && ua === cfg.uAcepto) { delUsuario++; if (!val) pend++; }
    }
    return { registros: regs, total: regs.length, delUsuario: delUsuario, pendientes: pend };
  }

  // ── Índices para candidatos ─────────────────────────────
  function buildPamiIndex(regs) {
    var byAfil = {}, byToken = {};
    for (var i = 0; i < regs.length; i++) {
      var p = regs[i];
      if (p.afiliado_norm) (byAfil[p.afiliado_norm] || (byAfil[p.afiliado_norm] = [])).push(i);
      var toks = nameTokens(p.nombre_raw), seen = {};
      for (var j = 0; j < toks.length; j++) {
        var tk = toks[j];
        if (seen[tk]) continue; seen[tk] = 1;
        (byToken[tk] || (byToken[tk] = [])).push(i);
      }
    }
    return { byAfil: byAfil, byToken: byToken };
  }

  // ── Scoring de un candidato ─────────────────────────────
  function scorePair(fu, p, cfg) {
    var s = 0;
    var afx = !!fu.afiliado_norm && fu.afiliado_norm === p.afiliado_norm;
    if (afx) s += 50;
    var ns = nameSim(fu.nombre_norm, p.nombre_norm);
    s += ns * 0.30;
    var d = deltaDias(fu.fecha, p.fecha);
    if (d === 0) s += 20;
    else if (d != null && d <= cfg.ventanaDias) s += 20 * (1 - d / cfg.ventanaDias);
    return { score: s, afil_exacto: afx, nombre_sim: ns, delta_dias: d };
  }

  // ── Estado PAMI de un registro ──────────────────────────
  function estadoPami(p) {
    if (p.validada === 'S') return 'VALIDADO';
    if (p.trasmitida === 'S') return 'TRANSMITIDO_SIN_VALIDAR';
    return 'PENDIENTE';
  }

  // ── Reconciliación completa ─────────────────────────────
  // cfg: { uAcepto, ventanaDias=3, umbralNombre=82, corteFuerte=90, maxAlt=4 }
  function reconcile(fuTurnos, pamiRegs, cfg) {
    cfg = Object.assign({ ventanaDias: 3, umbralNombre: 82, corteFuerte: 90, maxAlt: 4 }, cfg || {});
    var idx = buildPamiIndex(pamiRegs);
    var items = [];
    for (var t = 0; t < fuTurnos.length; t++) {
      var fu = fuTurnos[t];
      var candSet = {};
      // por afiliado exacto
      if (fu.afiliado_norm && idx.byAfil[fu.afiliado_norm]) {
        idx.byAfil[fu.afiliado_norm].forEach(function (i) { candSet[i] = 1; });
      }
      // por tokens compartidos (blocking)
      var toks = nameTokens(fu.nombre_raw);
      for (var k = 0; k < toks.length; k++) {
        var lst = idx.byToken[toks[k]];
        if (lst) for (var z = 0; z < lst.length; z++) candSet[lst[z]] = 1;
      }
      var scored = [];
      for (var key in candSet) {
        var p = pamiRegs[key];
        var sc = scorePair(fu, p, cfg);
        if (sc.afil_exacto || sc.nombre_sim >= cfg.umbralNombre) {
          scored.push({ p: p, sc: sc });
        }
      }
      scored.sort(function (a, b) { return b.sc.score - a.sc.score; });

      var best = scored.length ? scored[0] : null;
      var estado, confianza, matchP = null;
      if (!best) {
        estado = 'SIN_REGISTRO'; confianza = 'sin_match';
      } else {
        matchP = best.p;
        var fuerte = best.sc.afil_exacto ||
          (best.sc.nombre_sim >= cfg.corteFuerte && best.sc.delta_dias != null && best.sc.delta_dias <= cfg.ventanaDias);
        confianza = fuerte ? 'fuerte' : 'dudoso';
        estado = estadoPami(matchP);
      }
      var alternativas = scored.slice(1, 1 + cfg.maxAlt).map(function (x) {
        return { registro: x.p, score: Math.round(x.sc.score), nombre_sim: Math.round(x.sc.nombre_sim), delta_dias: x.sc.delta_dias };
      });

      items.push({
        turno: fu,
        match: matchP,
        alternativas: alternativas,
        score: best ? Math.round(best.sc.score) : 0,
        nombre_sim: best ? Math.round(best.sc.nombre_sim) : 0,
        afil_exacto: best ? best.sc.afil_exacto : false,
        delta_dias: best ? best.sc.delta_dias : null,
        estado: estado,               // VALIDADO | TRANSMITIDO_SIN_VALIDAR | PENDIENTE | SIN_REGISTRO
        confianza: confianza,         // fuerte | dudoso | sin_match
        operador: matchP ? (cfg.uAcepto && matchP.u_acepto === cfg.uAcepto ? 'mi_usuario' : 'otro_operador') : null,
        decision_manual: 'pendiente', // pendiente | confirmado | descartado
        estado_proceso: 'pendiente'
      });
    }
    return items;
  }

  function resumen(items) {
    var r = { total: items.length, VALIDADO: 0, TRANSMITIDO_SIN_VALIDAR: 0, PENDIENTE: 0, SIN_REGISTRO: 0,
              fuerte: 0, dudoso: 0, sin_match: 0, mi_usuario: 0, otro_operador: 0 };
    items.forEach(function (it) {
      r[it.estado] = (r[it.estado] || 0) + 1;
      r[it.confianza] = (r[it.confianza] || 0) + 1;
      if (it.operador) r[it.operador] = (r[it.operador] || 0) + 1;
    });
    return r;
  }

  var CP = {
    stripAccents: stripAccents, normName: normName, normAfil: normAfil,
    nameSim: nameSim, ratio: ratio, tokenSortRatio: function (a, b) { return ratio(normName(a), normName(b)); },
    parsePamiFecha: parsePamiFecha, deltaDias: deltaDias, fmtDate: fmtDate,
    parseFuesmen: parseFuesmen, parsePami: parsePami,
    reconcile: reconcile, resumen: resumen, estadoPami: estadoPami,
    ASEG_OK: ASEG_OK
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CP;
  else root.CP = CP;
})(typeof window !== 'undefined' ? window : this);
