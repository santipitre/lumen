/* Cronogramas - Dashboard Imágenes H.Italiano (Lumen).
 * Módulo montado por imagenes.js en la pestaña #cronogramas. Datos: img_cron_leer / img_cron_guardar / img_cron_borrar
 * (05_cronogramas.sql) + personas de img_listar + Eco/Doppler de img_cronograma (img_agenda), sin duplicarlo.
 * Todo texto de la base entra al DOM con textContent (nunca como HTML). Sin contactos: solo id, apellido, nombre y servicios. */
(function(){
'use strict';
if(!window.__img_user) return;

/* == constantes == */
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MN = MESES.map(function(x){ return x.toLowerCase(); });
const TURN = { M: ['07:00', '13:00', 'Mañana'], T: ['13:00', '19:00', 'Tarde'], N: ['19:00', '07:00', 'Noche'], D: ['07:00', '19:00', 'Guardia día'] };
const DL = { M: 'Mañana', T: 'Tarde', N: 'Noche', D: 'Guardia día' };
const SEC = { 'Tomografía': 'TC', 'Radiología': 'RX', 'Resonancia Magnética': 'RM' };
const END = '9999-12-31';
const PAL = [205, 265, 330, 28, 172, 48, 150, 300, 10, 230, 120, 190, 80, 350, 250];
const TIPOS_LIC = ['Vacaciones', 'Profiláctica', 'Licencia', 'Licencia (a especificar)', 'Examen', 'Maternidad', 'Paternidad', 'Matrimonio', 'Fallecimiento de familiar', 'Congreso / capacitación', 'Sin goce de haberes', 'Cambio de turno', 'Ausencia puntual'];
const TH_BASE = [150, 40, 8, 25, 220, 330, 200, 290, 0, 265, 60];
const OFICINA = 'Oficina propia';
const TARIFAS_DEF = { diurna: 0, nocturna: 0 };
const SAT0_DEF = '2026-10-03';
/* Si hay más de 2 personas superpuestas en los 2 boxes, quien queda como SOPORTE ADMINISTRATIVO es siempre esta persona. */
const SOPORTE_FIJO = { ap: 'Ávila', nom: 'Joel' };
/* Box fijo de cada persona (los que no figuran aquí toman el primer lugar libre). */
const BOX_FIJO = [
  { ap: 'Ávila', nom: 'Joel', box: 'box1' }, { ap: 'José', nom: 'Monica', box: 'box1' },
  { ap: 'Abraham', nom: 'Zamira', box: 'box2' }, { ap: 'Torres', nom: 'Joaquin', box: 'box2' }
];
/* Sábados de administrativos: cada persona hace 1 sábado por ciclo (el orden se repite desde la fecha ancla).
 * saleA = hora fija de salida lun–jue de la semana siguiente; suple = quien entra esos días en ese horario (reemplaza su horario habitual).
 * sale = minutos que se retira antes de lunes a jueves de la semana siguiente a su sábado (0 = no compensa).
 * La rotación rige desde la fecha ancla (los sábados anteriores siguen según las franjas cargadas en la base).
 * Si la base tiene la clave 'rot_sab' en img_cron_config ({ ancla, orden: [{ ap, nom, d, h, sale }] }), reemplaza estos valores. */
/* DESACTIVADA a pedido: el cronograma se arma a mano. Para volver a la rotación automática, reemplazar `orden: []` por la lista de abajo:
 *   { ap: 'Torres', nom: 'Joaquin', d: '09:00', h: '13:00', sale: 60 },
 *   { ap: 'Abraham', nom: 'Zamira', d: '09:00', h: '13:00', saleA: '12:00', suple: { ap: 'Torres', nom: 'Joaquin', d: '12:00', h: '18:00' } },
 *   { ap: 'José', nom: 'Monica', d: '08:00', h: '14:00', sale: 0 },
 *   { ap: 'Ávila', nom: 'Joel', d: '09:00', h: '13:00', sale: 60 }  */
const ROT_SAB_DEF = { ancla: '2026-10-24', orden: [] };
const SUBS = [
  { k: 'tecnicos', n: 'Técnicos', tab: 'tec' },
  { k: 'administrativos', n: 'Administrativos', tab: 'adm' },
  { k: 'radiografias', n: 'Radiografías', tab: 'rx' },
  { k: 'tc', n: 'Tomografía (guardias)', tab: 'tc' },
  { k: 'eco', n: 'Eco/Doppler', tab: 'eco' },
  { k: 'licencias', n: 'Licencias y reemplazos', tab: 'lic' },
  { k: 'pago', n: 'Pago de técnicos', tab: 'tec', soloEdicion: true },
  { k: 'alertas', n: 'Alertas', tab: 'todo' }
];
const VISTAS = {
  tecnicos: [['diag', 'Diagrama del mes'], ['horas', 'Horas por técnico'], ['sem', 'Semana tipo'], ['sems', 'Semanas del mes'], ['cuadro', 'Cuadro'], ['mes', 'Mes']],
  administrativos: [['sem', 'Semana tipo'], ['sems', 'Semanas del mes'], ['horas', 'Horas por semana'], ['cuadro', 'Cuadro'], ['mes', 'Mes']],
  radiografias: [['sem', 'Semana tipo'], ['sems', 'Semanas del mes'], ['cuadro', 'Cuadro'], ['mes', 'Mes'], ['anio', 'Año']],
  tc: [['tcg', 'Guardias de Tomografía']],
  eco: [['sem', 'Semana tipo']],
  licencias: [['conf', 'Confirmar reemplazos'], ['lista', 'Licencias'], ['anio', 'Año']],
  pago: [['pago', 'Horas y valor']],
  alertas: [['alertas', 'Alertas']]
};
const MSG = {
  CONFLICTO: 'Otra persona cambió este dato mientras lo editabas. Tu cambio no se aplicó y se recargó el cronograma.',
  NO_EXISTE: 'Ese dato ya no existe (alguien lo borró). Se recargó el cronograma.',
  INVALIDO: 'Algún dato no es válido (horas, fechas o campos obligatorios). Se recargó el cronograma.',
  DUPLICADO: 'Ya existe un registro igual.',
  SIN_PERMISO: 'No tenés permiso para esta operación.',
  SIN_PERMISO_ESCRITURA: 'No tenés permiso para modificar datos en este módulo.',
  RED_ESCRITURA: 'No se pudo confirmar el guardado. Puede haberse aplicado: se recargó el cronograma.',
  LECTURA: 'No se pudieron leer los cronogramas. Probá recargar la página.'
};

/* == fechas y horas (puras) == */
function pad(n){ return String(n).padStart(2, '0'); }
function iso(y, mo, d){ return y + '-' + pad(mo + 1) + '-' + pad(d); }
function mins(s){ const p = String(s).split(':'); return (+p[0]) * 60 + (+p[1]); }
function hhmm(x){ return Math.floor(x / 60) + ':' + pad(x % 60); }
function hm(s){ return s ? String(s).slice(0, 5) : ''; }
function fmtH(x){ return (x).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' h'; }
function fmtF(s){ return s ? s.split('-').reverse().join('/') : ''; }
function fmtC(s){ return s ? fmtF(s).slice(0, 5) : ''; }
function fmtM(v){ return '$ ' + Math.round(v).toLocaleString('es-AR'); }
function wdOf(s){ return (new Date(s + 'T12:00:00').getDay() + 6) % 7; }
function addD(s, n){ const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d.getFullYear(), d.getMonth(), d.getDate()); }
function diffD(a, b){ return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
function mondayOf(s){ return addD(s, -wdOf(s)); }
function dimOf(y, mo){ return new Date(y, mo + 1, 0).getDate(); }
function monthDays(y, mo){ const n = dimOf(y, mo), o = []; for(let i = 1; i <= n; i++) o.push(iso(y, mo, i)); return o; }
function weeksOf(y, mo){
  const first = iso(y, mo, 1), last = iso(y, mo, dimOf(y, mo)), o = [];
  let w = mondayOf(first);
  while(w <= last){ o.push(w); w = addD(w, 7); }
  return o;
}
function uni(l){
  const a = l.map(function(x){ return [x[0], x[1]]; }).sort(function(p, q){ return p[0] - q[0]; }), o = [];
  a.forEach(function(x){
    if(o.length && x[0] <= o[o.length - 1][1]) o[o.length - 1][1] = Math.max(o[o.length - 1][1], x[1]);
    else o.push(x);
  });
  return o;
}
function sumi(l){ return l.reduce(function(s, x){ return s + x[1] - x[0]; }, 0); }
function splitDN(d, hasta){
  const a = mins(d), len = (mins(hasta) - a + 1440) % 1440;
  let n = 0;
  for(let k = 0; k < len; k++){ const t = (a + k) % 1440; if(t >= 1200 || t < 420) n++; }
  return [(len - n) / 60, n / 60];
}
function letterOf(d, hasta){
  const a = mins(d), dur = (mins(hasta) - a + 1440) % 1440;
  if(dur === 720 && a === 420) return 'D';
  if(a >= 1140 || a < 300) return 'N';
  if(a >= 780) return 'T';
  return 'M';
}

/* == modelo: respuesta de img_cron_leer + personas -> objetos de trabajo == */
function grpDe(tipo){ return tipo === 'medico' ? 'med' : tipo === 'tecnico' ? 'tec' : tipo === 'administrativo' ? 'adm' : 'res'; }

function armarModelo(raw, listas){
  const M = { PM: {}, P: [], F: [], G: [], XT: [], L: [], FER: {}, TC: { cal: {}, calV: {}, cambios: [] }, cfg: { sat0: null, tarifas: null, jefa: null, servicios: null, rotSab: null, ver: {} } };
  Object.keys(listas || {}).forEach(function(tipo){
    (listas[tipo] || []).forEach(function(p){
      if(!p || !p.id) return;
      M.PM[p.id] = { key: p.id, id: p.id, tipo: p.tipo || tipo, grp: grpDe(p.tipo || tipo), ap: String(p.apellido || ''), nom: String(p.nombre || ''),
        serv: Array.isArray(p.servicios) ? p.servicios.slice() : [], orden: +p.orden || 0, anio: (String((p.datos || {}).anio || '').match(/\d/) || [''])[0] };
    });
  });
  function persona(id, nombreLibre, grp){
    const k = id || ('libre:' + nombreLibre);
    if(!M.PM[k]){
      if(id) M.PM[k] = { key: k, id: id, tipo: null, grp: grp || 'med', ap: '(persona no visible)', nom: '', serv: [], orden: 9999, oculta: true };
      else M.PM[k] = { key: k, id: null, tipo: 'medico', grp: 'med', ap: String(nombreLibre || ''), nom: '', serv: ['Radiología'], orden: 9999, libre: true };
    }
    return k;
  }
  (raw.franjas || []).forEach(function(f){
    M.F.push({ id: f.id, ver: f.version, tab: f.tab, key: persona(f.persona_id, f.nombre_libre), dia: +f.dia, d: hm(f.desde), h: hm(f.hasta), sec: f.sec || '',
      asig: f.asig || [], guardia: !!f.guardia, sem: +f.sem || 0, turno: f.turno || '', pend: !!f.pendiente, motivo: f.pendiente_motivo || '' });
  });
  (raw.guardias || []).forEach(function(g){ M.G.push({ id: g.id, ver: g.version, key: persona(g.persona_id), fecha: g.fecha, t: g.t, pend: !!g.pendiente, motivo: g.pendiente_motivo || '' }); });
  (raw.turnos_extra || []).forEach(function(x){ M.XT.push({ id: x.id, ver: x.version, key: persona(x.persona_id), fecha: x.fecha, d: hm(x.desde), h: hm(x.hasta), nota: x.nota || '' }); });
  const LM = {};
  (raw.licencias || []).forEach(function(l){
    const o = { id: l.id, ver: l.version, key: persona(l.persona_id), tipo: l.tipo, desde: l.desde, hasta: l.hasta || '', obs: l.obs || '', pend: !!l.pendiente, motivo: l.pendiente_motivo || '', reemps: [] };
    LM[l.id] = o;
    M.L.push(o);
  });
  (raw.reemplazos || []).forEach(function(r){
    const l = LM[r.licencia_id];
    if(!l) return;
    l.reemps.push({ id: r.id, ver: r.version, lid: r.licencia_id, key: r.persona_id ? persona(r.persona_id) : '', nombre: r.nombre || '', d: hm(r.hora_desde), h: hm(r.hora_hasta),
      nota: r.nota || '', fechas: (r.fechas || []).slice(), desde: r.fecha_desde || '', hasta: r.fecha_hasta || '', est: r.est || '' });
  });
  (raw.feriados || []).forEach(function(f){ M.FER[f.fecha] = f.nombre; M.cfg.ver['fer:' + f.fecha] = f.version; });
  (raw.tc || []).forEach(function(t){ M.TC.cal[t.fecha] = t.medico; M.TC.calV[t.fecha] = t.version; });
  (raw.tc_cambios || []).forEach(function(c){ M.TC.cambios.push({ id: c.id, ver: c.version, fecha: c.fecha, antes: c.medico_antes || '', nuevo: c.medico_nuevo, nota: c.nota || '', at: c.updated_at || '' }); });
  (raw.config || []).forEach(function(c){
    M.cfg.ver[c.clave] = c.version;
    if(c.clave === 'sat0') M.cfg.sat0 = String(c.valor);
    else if(c.clave === 'tarifas') M.cfg.tarifas = c.valor;
    else if(c.clave === 'jefa') M.cfg.jefa = c.valor;
    else if(c.clave === 'servicios') M.cfg.servicios = c.valor;
    else if(c.clave === 'rot_sab') M.cfg.rotSab = c.valor;
  });
  M.P = Object.keys(M.PM).map(function(k){ return M.PM[k]; }).sort(function(a, b){
    const g = ['tec', 'adm', 'med', 'res'];
    return g.indexOf(a.grp) - g.indexOf(b.grp) || a.orden - b.orden || a.ap.localeCompare(b.ap, 'es');
  });
  return M;
}

/* == cálculos del cronograma (puros; portados del boceto v16) == */
function calculos(M, hoy){
  const PM = M.PM, P = M.P, F = M.F, G = M.G, XT = M.XT, L = M.L, FER = M.FER;
  const SAT0 = M.cfg.sat0 || SAT0_DEF;
  const nm = function(p){ return p.ap + (p.nom ? ' ' + p.nom : ''); };
  const lend = function(l){ return l.hasta || END; };
  const satPrev = function(d){ let x = d; while(wdOf(x) !== 5) x = addD(x, -1); return x; };
  const satTipo = function(d){ const w = Math.round(diffD(SAT0, d) / 7); return (((w % 2) + 2) % 2) === 0 ? 2 : 1; };
  const satTipoW = function(d){ return satTipo(satPrev(d)); };
  /* dinámicos: las altas/bajas locales (optimistas) cambian G y F sin recalcular el modelo */
  const esGuard = function(k){ return G.some(function(g){ return g.key === k; }) || F.some(function(f){ return f.key === k && f.guardia; }); };
  const esOfi = function(k){ return F.some(function(f){ return f.key === k && f.tab === 'adm' && String(f.sec).toLowerCase() === OFICINA.toLowerCase(); }); };
  const licOn = function(k, d){ return L.find(function(l){ return l.key === k && l.desde <= d && d <= lend(l); }); };
  const repOn = function(r, l, d){
    return d >= l.desde && d <= lend(l) && (!r.desde || d >= r.desde) && (!r.hasta || d <= r.hasta) && (!(r.fechas && r.fechas.length) || r.fechas.indexOf(d) >= 0);
  };
  const rname = function(r){ return r.key && PM[r.key] ? nm(PM[r.key]) : (r.nombre || '(sin definir)'); };
  const rshort = function(r){ return r.key && PM[r.key] ? PM[r.key].ap : (r.nombre || '?').split(' ')[0]; };
  const repEst = function(r){ return r.est === 'ok' ? 'ok' : r.est === 'no' ? 'no' : 'pe'; };
  const people = function(t){
    if(t === 'tec') return P.filter(function(p){ return p.grp === 'tec'; });
    if(t === 'adm') return P.filter(function(p){ return p.grp === 'adm'; });
    const keys = new Set(F.filter(function(f){ return f.tab === t; }).map(function(f){ return f.key; }));
    const srv = t === 'rx' ? 'Radiología' : t === 'tc' ? 'Tomografía' : null;
    return P.filter(function(p){ return p.grp === 'med' && (keys.has(p.key) || (srv && p.serv.indexOf(srv) >= 0)); });
  };
  const grpDeTab = function(t){ return t === 'tec' ? 'tec' : t === 'adm' ? 'adm' : 'med'; };

  /* rotación de sábados de administrativos */
  const nrm = function(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
  const ROT = M.cfg.rotSab && Array.isArray(M.cfg.rotSab.orden) && M.cfg.rotSab.orden.length && M.cfg.rotSab.ancla ? M.cfg.rotSab : ROT_SAB_DEF;
  const rotOrden = ROT.orden.map(function(o){
    const p = P.find(function(q){ return q.grp === 'adm' && nrm(q.ap) === nrm(o.ap) && nrm(q.nom) === nrm(o.nom); });
    if(!p) return null;
    const sp = o.suple && P.find(function(q){ return q.grp === 'adm' && nrm(q.ap) === nrm(o.suple.ap) && nrm(q.nom) === nrm(o.suple.nom); });
    return { key: p.key, d: o.d, h: o.h, sale: +o.sale || 0, saleA: o.saleA || '', suple: sp ? { key: sp.key, d: o.suple.d, h: o.suple.h } : null };
  }).filter(Boolean);
  const rotOf = function(k){ return rotOrden.some(function(x){ return x.key === k; }); };
  const rotAt = function(sat){
    if(!rotOrden.length || wdOf(sat) !== 5 || sat < ROT.ancla) return null;
    const n = rotOrden.length, w = Math.round(diffD(ROT.ancla, sat) / 7);
    return rotOrden[((w % n) + n) % n];
  };
  const rotSab = function(sat){ return FER[sat] ? null : rotAt(sat); };
  const rotLista = function(desde, n){
    const o = [];
    let s = desde;
    while(wdOf(s) !== 5) s = addD(s, 1);
    for(let i = 0; i < n; i++, s = addD(s, 7)){
      const r = rotAt(s);
      if(r) o.push({ sat: s, key: r.key, d: r.d, h: r.h, sale: r.sale, saleA: r.saleA, suple: r.suple, fer: !!FER[s] });
    }
    return o;
  };
  /* ajusta las franjas administrativas de un día: sábado = el de la rotación; lunes a jueves = sale antes quien hizo el sábado anterior */
  const admAjuste = function(frs, d, wd){
    if(!rotOrden.length) return frs;
    if(wd === 5){
      const o = rotAt(d) ? frs.filter(function(f){ return !rotOf(f.key); }) : frs.slice(), r = rotSab(d);
      if(r) o.push({ id: 'rot:' + d, tab: 'adm', key: r.key, dia: 5, d: r.d, h: r.h, sec: '', asig: [], guardia: false, sem: 0, turno: '', pend: false, motivo: '', rot: true });
      return o;
    }
    if(wd <= 3){
      const r = rotSab(addD(d, -(wd + 2)));
      if(r && (r.sale || r.saleA)){
        let out = frs.map(function(f){
          if(f.key !== r.key || f.pend) return f;
          const fin = r.saleA ? Math.min(mins(f.h), mins(r.saleA)) : mins(f.h) - r.sale;
          if(fin >= mins(f.h) || fin - mins(f.d) < 60) return f;
          return Object.assign({}, f, { h: minT(fin), corta: mins(f.h) - fin, orig: f });
        });
        if(r.suple && !FER[d]){
          out = out.filter(function(f){ return f.key !== r.suple.key; });
          out.push({ id: 'sup:' + d, tab: 'adm', key: r.suple.key, dia: wd, d: r.suple.d, h: r.suple.h, sec: '', asig: [], guardia: false, sem: 0, turno: '', pend: false, motivo: '', sup: r.key });
        }
        return out;
      }
    }
    return frs;
  };

  function dayData(t, d, pf){
    const wd = wdOf(d), items = [], strip = [], fer = FER[d];
    const frs0 = F.filter(function(f){ return f.tab === t && f.dia === wd && (!f.sem || f.sem === satTipoW(d)) && !(fer && (t === 'tec' || t === 'adm')); });
    const frs = t === 'adm' ? admAjuste(frs0, d, wd) : frs0;
    const gs = t === 'tec' ? G.filter(function(g){ return g.fecha === d; }).map(function(g){
      return { id: g.id, tab: 'tec', key: g.key, dia: wd, d: TURN[g.t][0], h: TURN[g.t][1], sec: '', asig: [], guardia: true, g: true, t: g.t, fecha: g.fecha, pend: g.pend };
    }) : [];
    const xs = t === 'tec' ? XT.filter(function(x){ return x.fecha === d; }).map(function(x){
      return { id: x.id, tab: 'tec', key: x.key, dia: wd, d: x.d, h: x.h, xt: true, nota: x.nota || '' };
    }) : [];
    const hasF = function(k){ return frs.some(function(f){ return f.key === k; }) || gs.some(function(g){ return g.key === k; }); };
    frs.forEach(function(f){ const l = licOn(f.key, d); items.push(l ? { kind: 'lic', f: f, k: f.key, d: f.d, h: f.h, l: l } : { kind: 'w', f: f, k: f.key, d: f.d, h: f.h }); });
    gs.forEach(function(f){ const l = licOn(f.key, d); items.push(l ? { kind: 'lic', f: f, k: f.key, d: f.d, h: f.h, l: l } : { kind: 'w', f: f, k: f.key, d: f.d, h: f.h }); });
    xs.forEach(function(f){ items.push({ kind: 'w', f: f, k: f.key, d: f.d, h: f.h }); });
    people(t).forEach(function(p){
      const l = licOn(p.key, d);
      if(!l) return;
      const anyF = F.some(function(f){ return f.tab === t && f.key === p.key; }) || (t === 'tec' && G.some(function(g){ return g.key === p.key; }));
      if(!hasF(p.key)) strip.push({ k: p.key, l: l });
      if(!anyF || hasF(p.key)){
        l.reemps.forEach(function(r){
          if(!repOn(r, l, d)) return;
          if(esGuard(p.key) && !gs.some(function(g){ return g.key === p.key && g.d === r.d && g.h === r.h; })) return;
          items.push({ kind: 'rep', k: r.key || null, r: r, 'for': p.key, d: r.d, h: r.h, l: l });
        });
      }
    });
    if(t === 'tec'){
      /* quien cubre un reemplazo ese día no hace su horario habitual: se quita su franja propia (guardias y turnos extra se mantienen) */
      const cubre = new Set(items.filter(function(i){ return i.kind === 'rep' && i.k; }).map(function(i){ return i.k; }));
      if(cubre.size) for(let i = items.length - 1; i >= 0; i--){
        const x = items[i];
        if(x.kind === 'w' && cubre.has(x.k) && x.f && !x.f.g && !x.f.xt) items.splice(i, 1);
      }
    }
    if(t === 'adm'){
      for(let i = items.length - 1; i >= 0; i--) if(items[i].kind === 'lic') items.splice(i, 1);
      strip.length = 0;
    }
    if(pf) return { items: items.filter(function(i){ return i.k === pf || i['for'] === pf; }), strip: strip.filter(function(s){ return s.k === pf; }) };
    return { items: items, strip: strip };
  }
  function ownShifts(k, d, ig){
    const wd = wdOf(d), o = [];
    if(!ig && licOn(k, d)) return o;
    const fin = function(a, b){ return [mins(a), mins(b) <= mins(a) ? mins(b) + 1440 : mins(b)]; };
    F.filter(function(f){ return f.key === k && f.dia === wd && (!f.sem || f.sem === satTipoW(d)) && !(FER[d] && f.tab === 'tec') && !(wd === 5 && f.tab === 'adm' && rotOf(k) && rotAt(d)); }).forEach(function(f){ o.push(fin(f.d, f.h)); });
    if(wd === 5){ const rs = rotSab(d); if(rs && rs.key === k) o.push(fin(rs.d, rs.h)); }
    if(wd <= 3 && !FER[d]){ const rp = rotSab(addD(d, -(wd + 2))); if(rp && rp.suple && rp.suple.key === k){ o.length = 0; o.push(fin(rp.suple.d, rp.suple.h)); } }
    G.filter(function(g){ return g.key === k && g.fecha === d; }).forEach(function(g){ o.push(fin(TURN[g.t][0], TURN[g.t][1])); });
    XT.filter(function(x){ return x.key === k && x.fecha === d; }).forEach(function(x){ o.push(fin(x.d, x.h)); });
    return o;
  }
  function repDays(l, r){
    const out = [], to = lend(l) > addD(hoy, 120) ? addD(hoy, 120) : lend(l), a = mins(r.d), b = mins(r.h) <= a ? mins(r.h) + 1440 : mins(r.h);
    for(let d = l.desde; d <= to; d = addD(d, 1)){
      if(!repOn(r, l, d)) continue;
      const need = ownShifts(l.key, d, true);
      if(!need.length) continue;
      if(esGuard(l.key) && !need.some(function(x){ return x[0] === a && x[1] === b; })) continue;
      out.push(d);
    }
    return out;
  }
  function popOverlap(k, d, a, b){
    const w = [];
    ownShifts(k, d).forEach(function(z){ if(z[0] < b && a < z[1]) w.push('ya trabaja en ese horario'); });
    const lo = licOn(k, d);
    if(lo && lo.tipo !== 'Cambio de turno') w.push('tiene licencia ese día');
    return w;
  }
  function repAll(){
    const out = [];
    L.filter(function(l){ return PM[l.key] && (PM[l.key].grp === 'tec' || PM[l.key].grp === 'adm'); }).forEach(function(l){
      l.reemps.forEach(function(r, i){
        const x = { l: l, r: r, i: i, est: repEst(r), pasado: lend(l) < hoy };
        if((x.est === 'ok' && x.pasado) || repDays(l, r).length || x.pasado) out.push(x);
      });
    });
    return out;
  }
  function repCheck(l, r){
    const ds = repDays(l, r).filter(function(d){ return d >= hoy; }), a = mins(r.d), b = mins(r.h) <= a ? mins(r.h) + 1440 : mins(r.h), iss = {};
    const oth = repAll().filter(function(x){ return x.r !== r && x.r.key === r.key && x.est !== 'no'; }).map(function(x){
      return { x: x, set: new Set(repDays(x.l, x.r)), a: mins(x.r.d), b: mins(x.r.h) <= mins(x.r.d) ? mins(x.r.h) + 1440 : mins(x.r.h) };
    });
    ds.forEach(function(d){
      popOverlap(r.key, d, a, b).forEach(function(z){ (iss[z] = iss[z] || []).push(d); });
      oth.forEach(function(o){
        if(o.set.has(d) && o.a < b && a < o.b){ const kk = 'ya cubre a ' + PM[o.x.l.key].ap + ' en ese horario'; (iss[kk] = iss[kk] || []).push(d); }
      });
    });
    return { ds: ds, iss: iss };
  }
  function repConflicts(l){
    const out = [];
    l.reemps.forEach(function(r){
      if(!r.key) return;
      const a = mins(r.d), b = mins(r.h) <= a ? mins(r.h) + 1440 : mins(r.h);
      let first = null, n = 0;
      const to = lend(l) > addD(hoy, 90) ? addD(hoy, 90) : lend(l);
      for(let d = l.desde; d <= to; d = addD(d, 1)){
        if(!repOn(r, l, d)) continue;
        const need = ownShifts(l.key, d, true);
        if(!need.length) continue;
        if(esGuard(l.key) && !need.some(function(x){ return x[0] === a && x[1] === b; })) continue;
        if(ownShifts(r.key, d).find(function(x){ return x[0] < b && a < x[1]; })){ n++; first = first || d; }
      }
      if(n) out.push({ l: l, r: r, n: n, first: first });
    });
    return out;
  }

  /* diagrama / horas */
  function diagCells(y, mo){
    const o = {};
    monthDays(y, mo).forEach(function(d){
      const dd = dayData('tec', d, null);
      o[d] = {};
      dd.items.forEach(function(i){
        const k = i.k || (i.kind === 'rep' && i.r ? '_ext:' + i.r.nombre : null);
        if(k) (o[d][k] = o[d][k] || []).push(i);
      });
      dd.strip.forEach(function(x){ (o[d][x.k] = o[d][x.k] || []).push({ kind: 'lic', k: x.k, l: x.l }); });
    });
    return o;
  }
  function horasData(y, mo, pf){
    const C = diagCells(y, mo), days = monthDays(y, mo), wk = [];
    days.forEach(function(d){ if(!wk.length || wdOf(d) === 0) wk.push([]); wk[wk.length - 1].push(d); });
    return people('tec').filter(function(p){ return !pf || p.key === pf; }).map(function(p){
      const o = { p: p, own: 0, rep: 0, gua: 0, ext: 0, lic: 0, D: 0, N: 0, pend: 0, cat: { own: [0, 0], rep: [0, 0], gua: [0, 0], ext: [0, 0] }, wk: wk.map(function(){ return 0; }), det: [], wkDias: wk };
      days.forEach(function(d){
        const its = (C[d] && C[d][p.key]) || [], wi = wk.findIndex(function(w){ return w.indexOf(d) >= 0; });
        const hasRep = its.some(function(i){ return i.kind === 'rep'; }), cam = its.some(function(i){ return i.kind === 'lic' && i.l.tipo === 'Cambio de turno'; });
        if(its.some(function(i){ return i.kind === 'lic'; }) && !cam) o.lic++;
        its.forEach(function(i){
          let t = null, tx = '', pe = false;
          if(i.kind === 'w'){
            t = i.f && i.f.g ? 'gua' : i.f && i.f.xt ? 'ext' : 'own';
            tx = t === 'gua' ? 'Guardia ' + (i.f.t === 'N' ? 'noche' : 'día') + ' ' + i.d + '–' + i.h : t === 'ext' ? 'Turno extra ' + i.d + '–' + i.h : DL[letterOf(i.d, i.h)] + ' ' + i.d + '–' + i.h;
            pe = !!(i.f && i.f.pend);
          } else if(i.kind === 'rep'){
            t = 'rep'; tx = 'Cubre a ' + PM[i['for']].ap + ' ' + i.d + '–' + i.h;
            pe = repEst(i.r) !== 'ok' || !!i.l.pend;
          } else if(i.kind === 'lic' && cam && !hasRep && i.f){
            t = 'own'; tx = DL[letterOf(i.d, i.h)] + ' ' + i.d + '–' + i.h + ' (cambio de turno)';
          }
          if(!t) return;
          const hs = ((mins(i.h) - mins(i.d) + 1440) % 1440) / 60;
          o[t] += hs; o.wk[wi] += hs;
          const z = splitDN(i.d, i.h);
          o.D += z[0]; o.N += z[1]; o.cat[t][0] += z[0]; o.cat[t][1] += z[1];
          if(pe) o.pend += hs;
          o.det.push(DIAS[wdOf(d)].slice(0, 3) + ' ' + fmtC(d) + ' · ' + tx + ' · ' + fmtH(hs) + (pe ? ' · a confirmar' : ''));
        });
      });
      o.tot = o.own + o.rep + o.gua + o.ext;
      return o;
    });
  }
  function admIv(dd){
    const o = [];
    dd.items.forEach(function(x){
      if(x.kind !== 'w' && x.kind !== 'rep') return;
      if(x.k && PM[x.k] && esOfi(x.k)) return;
      const a = mins(x.d), b = mins(x.h) <= a ? 1440 : mins(x.h);
      o.push({ a: a, b: b, n: x.k ? PM[x.k].ap : (x.r && x.r.nombre) || '?' });
    });
    return o;
  }
  function admConc(dd){
    const iv = admIv(dd);
    let mx = 0, who = [];
    iv.forEach(function(z){
      const at = iv.filter(function(y){ return y.a <= z.a && z.a < y.b; });
      if(at.length > mx){ mx = at.length; who = at.map(function(y){ return y.n; }); }
    });
    return { n: mx, who: who };
  }
  function admPeak(y, mo){
    let n = 0;
    const bad = [];
    monthDays(y, mo).forEach(function(d){
      const c = admConc(dayData('adm', d, null));
      n = Math.max(n, c.n);
      if(c.n > 2) bad.push({ d: d, who: c.who });
    });
    return { n: n, bad: bad };
  }
  return { PM: PM, nm: nm, lend: lend, satTipo: satTipo, satTipoW: satTipoW, esGuard: esGuard, esOfi: esOfi, licOn: licOn, repOn: repOn, rname: rname, rshort: rshort,
    repEst: repEst, people: people, grpDeTab: grpDeTab, dayData: dayData, ownShifts: ownShifts, repDays: repDays, popOverlap: popOverlap, repAll: repAll, repCheck: repCheck,
    repConflicts: repConflicts, diagCells: diagCells, horasData: horasData, admIv: admIv, admConc: admConc, admPeak: admPeak, hoy: hoy,
    rotOf: rotOf, rotSab: rotSab, rotLista: rotLista, rotOrden: rotOrden };
}

/* pago: horas diurnas/nocturnas por categoría; sinPropias excluye la planta propia */
function horasPago(o, sinPropias){
  let D = 0, N = 0;
  ['own', 'rep', 'gua', 'ext'].forEach(function(k){
    if(sinPropias && k === 'own') return;
    D += o.cat[k][0]; N += o.cat[k][1];
  });
  return [D, N];
}

/* == estado de la interfaz == */
const ST = {
  puente: null, raw: null, M: null, C: null, el: null, nav: null, cuerpo: null,
  cargando: false, cargado: false, error: null, eco: [], ecoError: null, leidoEn: 0, iniciado: false, gen: 0, cola: Promise.resolve(), tmp: 0, escribiendo: 0,
  base: null, guardando: false,
  S: { sub: 'tecnicos', vistas: {}, y: 0, m: 0, wk: null, we: true, pf: null, dm: 'none', dp: null, hl: null, hlL: null, addF: false, addL: false, addR: null, nk: 'f',
       tcUp: false, tcPrev: null, solo: false, pop: null, msg: {}, edit: false, addP: false, addLP: false, ed: {}, pcAbierto: true, pcR: null },
  R: {}
};
const S = ST.S;

function h(tag, a){
  const el = document.createElement(tag);
  if(a){
    Object.keys(a).forEach(function(k){
      const v = a[k];
      if(v === null || v === undefined || v === false) return;
      if(k === 't') el.textContent = String(v);
      else if(k === 's'){ Object.keys(v).forEach(function(p){ el.style.setProperty(p, String(v[p])); }); }
      else if(k === 'on'){ Object.keys(v).forEach(function(e){ el.addEventListener(e, v[e]); }); }
      else if(k === 'value'){ el.value = String(v); }
      else el.setAttribute(k, v === true ? '' : String(v));
    });
  }
  for(let i = 2; i < arguments.length; i++) anexar(el, arguments[i]);
  return el;
}
function anexar(el, c){
  if(c === null || c === undefined || c === false) return;
  if(Array.isArray(c)){ c.forEach(function(x){ anexar(el, x); }); return; }
  el.append(typeof c === 'object' ? c : document.createTextNode(String(c)));
}
function poner(el){ for(let i = 1; i < arguments.length; i++) anexar(el, arguments[i]); return el; }
function vaciar(el){ while(el.firstChild) el.removeChild(el.firstChild); }
function btn(txt, cls, fn, extra){
  const a = { type: 'button', class: 'cr-btn' + (cls ? ' ' + cls : ''), t: txt, on: { click: fn } };
  if(extra) Object.keys(extra).forEach(function(k){ a[k] = extra[k]; });
  return h('button', a);
}
function opciones(lista, val){
  return lista.map(function(o){
    const v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
    return h('option', { value: v, selected: String(v) === String(val), t: t });
  });
}
function selec(lista, val, fn, cls){ return h('select', { class: cls || '', on: { change: function(ev){ fn(ev.target.value); } } }, opciones(lista, val)); }
function entrada(tipo, val, fn, at){
  const a = { type: tipo, value: val, on: { change: function(ev){ fn(ev.target.value, ev.target); } } };
  if(at) Object.keys(at).forEach(function(k){ a[k] = at[k]; });
  return h('input', a);
}
function campo(txt, ctl, cls){ return h('label', { class: 'cr-f' + (cls ? ' ' + cls : '') }, txt, ctl); }

/* == acceso a datos == */
function permisoEditar(){ return ['editar', 'admin'].indexOf(ST.puente.nivel()) >= 0; }
/* mientras se guarda el lote la pantalla queda en solo lectura (evita editar a mitad de la escritura) */
function puedeEditar(){ return permisoEditar() && !ST.guardando; }
function enEdicion(){ return S.edit && puedeEditar(); }
function esAdmin(){ return ST.puente.nivel() === 'admin'; }
function textoError(c, e){
  if(c === 'CONFLICTO' || c === 'NO_EXISTE' || c === 'INVALIDO' || c === 'DUPLICADO' || c === 'RED_ESCRITURA' || c === 'SIN_PERMISO' || c === 'SIN_PERMISO_ESCRITURA') return MSG[c];
  return ST.puente.mensajeDe(c, e && e.detalle);
}
function listasPersonas(){
  const p = ST.puente, o = {};
  [['medicos', 'medico'], ['residentes', 'residente'], ['tecnicos', 'tecnico'], ['administrativos', 'administrativo']].forEach(function(par){
    const l = p.personas(par[0]);
    if(Array.isArray(l)) o[par[1]] = l;
  });
  return o;
}
function reconstruir(){
  ST.M = armarModelo(ST.raw, listasPersonas());
  ST.C = calculos(ST.M, ST.puente.hoy());
  ST.R.hueMap = null;
  ST.R.jefaNom = ST.M.cfg.jefa && ST.M.cfg.jefa.nom ? String(ST.M.cfg.jefa.nom) : 'a confirmar';
  const t = ST.M.cfg.tarifas;
  ST.R.tarifas = t && typeof t === 'object' ? { diurna: +t.diurna || 0, nocturna: +t.nocturna || 0, personas: Array.isArray(t.personas) ? t.personas.slice() : null } : null;
  S.ed = {};
  tomarBase();
}
async function leer(){
  /* Eco/Doppler vive en img_agenda: se lee de img_cronograma, nunca se copia a las tablas del cronograma. */
  const par = await Promise.all([
    ST.puente.rpc('img_cron_leer'),
    ST.puente.rpc('img_cronograma', { p_vista: 'eco' }).then(function(x){ return x; }, function(e){ return { _fallo: ST.puente.codigoDe(e) }; })
  ]);
  ST.raw = par[0];
  ST.eco = par[1] && Array.isArray(par[1].turnos) ? par[1].turnos : [];
  ST.ecoError = par[1] && par[1]._fallo ? par[1]._fallo : null;
  ST.leidoEn = Date.now();
  reconstruir();
}
async function recargar(silencioso){
  ST.gen++;
  try{
    await leer();
    ST.error = null;
  }catch(e){
    ST.error = ST.puente.codigoDe(e);
  }
  pintar();
}
function nuevoTmp(){ ST.tmp++; return 'tmp:' + ST.tmp; }
function esTmp(id){ return String(id).indexOf('tmp:') === 0; }

function dialogoAviso(titulo, texto){
  ST.puente.dialogo({
    titulo: titulo, clase: 'aviso',
    cuerpo: [h('p', { t: texto })],
    botones: [{ texto: 'Entendido', clase: 'ed-btn prim', alClic: function(c){ c.cerrar(); } }]
  });
}
const MSG_LOTE = ' Los cambios que ya se habían guardado quedaron; los demás se perdieron. Revisá el cronograma y repetí lo que falte.';
async function fallo(e){
  const c = ST.puente.codigoDe(e), lote = ST.guardando ? MSG_LOTE : '';
  await recargar(true);
  if(c === 'CONFLICTO') dialogoAviso('⚠ Alguien guardó antes que vos', MSG.CONFLICTO + lote);
  else ST.puente.aviso(textoError(c, e) + lote);
}
/* Escritura optimista serializada: el cambio local ya está aplicado; las llamadas salen de a una (la versión de cada fila
   se actualiza con la respuesta antes de la siguiente). Si algo falla se recarga todo y se avisa. */
function encolar(fn){
  const gen = ST.gen;
  ST.escribiendo++;
  ST.cola = ST.cola.then(async function(){
    if(gen !== ST.gen) return;
    try{ await fn(); }catch(e){ await fallo(e); }
  }).then(function(){ ST.escribiendo--; });
  return ST.cola;
}
/* Borrador: las acciones solo cambian el modelo local. Nada va a la base hasta confirmar el diálogo de revisión
   (revisarYGuardar), que arma las escrituras reales con escribirFila / borrarReal / escribirTc / borrarTc / escribirTarifas. */
function marcarSucio(){ pintarBarra(); }
function guardarFila(){ marcarSucio(); }
function borrarFila(){ marcarSucio(); }
function escribirFila(ent, obj, payload){
  return encolar(async function(){
    const nuevo = esTmp(obj.id);
    const dato = payload();
    if(!nuevo) dato.id = obj.id;
    const r = await ST.puente.rpc('img_cron_guardar', { p_entidad: ent, p_dato: dato, p_version: nuevo ? null : obj.ver });
    obj.id = r.id; obj.ver = r.version;
  });
}
function borrarReal(ent, obj){
  return encolar(async function(){
    await ST.puente.rpc('img_cron_borrar', { p_entidad: ent, p_id: String(obj.id), p_version: obj.ver });
  });
}
const tm = function(s){ return s.length === 5 ? s : s; };
function pFranja(f){
  const libre = ST.M.PM[f.key] && ST.M.PM[f.key].libre;
  return { tab: f.tab, persona_id: libre ? null : f.key, nombre_libre: libre ? ST.M.PM[f.key].ap : null, dia: f.dia, desde: f.d, hasta: f.h, sec: f.sec || '', asig: f.asig || [],
    guardia: !!f.guardia, sem: f.sem || 0, turno: f.turno || '', pendiente: !!f.pend, pendiente_motivo: f.pend ? (f.motivo || null) : null };
}
function pGuardia(g){ return { persona_id: g.key, fecha: g.fecha, t: g.t, pendiente: !!g.pend, pendiente_motivo: g.pend ? (g.motivo || null) : null }; }
function pExtra(x){ return { persona_id: x.key, fecha: x.fecha, desde: x.d, hasta: x.h, nota: x.nota || '' }; }
function pLic(l){ return { persona_id: l.key, tipo: l.tipo, desde: l.desde, hasta: l.hasta || '', obs: l.obs || '', pendiente: !!l.pend, pendiente_motivo: l.pend ? (l.motivo || null) : null }; }
function pRep(r, l){
  return { licencia_id: l.id, persona_id: r.key || null, nombre: r.key ? null : (r.nombre || null), hora_desde: r.d, hora_hasta: r.h, nota: r.nota || '',
    fechas: r.fechas || [], fecha_desde: r.desde || null, fecha_hasta: r.hasta || null, est: r.est || '' };
}
/* acciones de datos (cambio local + escritura) */
const A = {
  franjaAlta: function(f){ f.id = nuevoTmp(); ST.M.F.push(f); guardarFila('franja', f, function(){ return pFranja(f); }); },
  franjaCambio: function(f){ guardarFila('franja', f, function(){ return pFranja(f); }); },
  franjaBaja: function(f){ ST.M.F.splice(ST.M.F.indexOf(f), 1); borrarFila('franja', f); },
  guardiaAlta: function(g){ g.id = nuevoTmp(); ST.M.G.push(g); guardarFila('guardia', g, function(){ return pGuardia(g); }); },
  guardiaCambio: function(g){ guardarFila('guardia', g, function(){ return pGuardia(g); }); },
  guardiaBaja: function(g){ ST.M.G.splice(ST.M.G.indexOf(g), 1); borrarFila('guardia', g); },
  extraAlta: function(x){ x.id = nuevoTmp(); ST.M.XT.push(x); guardarFila('turno_extra', x, function(){ return pExtra(x); }); },
  extraBaja: function(x){ ST.M.XT.splice(ST.M.XT.indexOf(x), 1); borrarFila('turno_extra', x); },
  licAlta: function(l){ l.id = nuevoTmp(); ST.M.L.push(l); guardarFila('licencia', l, function(){ return pLic(l); }); },
  licCambio: function(l){ guardarFila('licencia', l, function(){ return pLic(l); }); },
  licBaja: function(l){ ST.M.L.splice(ST.M.L.indexOf(l), 1); borrarFila('licencia', l); },
  repAlta: function(l, r){ r.id = nuevoTmp(); r.lid = l.id; l.reemps.push(r); guardarFila('reemplazo', r, function(){ return pRep(r, l); }); },
  repCambio: function(l, r){ guardarFila('reemplazo', r, function(){ return pRep(r, l); }); },
  repBaja: function(l, r){ l.reemps.splice(l.reemps.indexOf(r), 1); borrarFila('reemplazo', r); }
};

/* == borrador: lo que cambió el usuario y todavía no se guardó == */
function valorTarifas(){
  const tf = ST.R.tarifas;
  if(!tf) return null;
  const v = { diurna: +tf.diurna || 0, nocturna: +tf.nocturna || 0 };
  if(Array.isArray(tf.personas)) v.personas = tf.personas.slice();
  return v;
}
function payloadDe(ent, o, l){
  if(ent === 'franja') return pFranja(o);
  if(ent === 'guardia') return pGuardia(o);
  if(ent === 'turno_extra') return pExtra(o);
  if(ent === 'licencia') return pLic(o);
  if(ent === 'reemplazo'){ const p = pRep(o, l); delete p.licencia_id; return p; }
  if(ent === 'tc') return { fecha: o.fecha, medico: o.medico };
  if(ent === 'tc_cambio') return { fecha: o.fecha, medico_antes: o.antes, medico_nuevo: o.nuevo, nota: o.nota };
  if(ent === 'config') return valorTarifas();
  return {};
}
function filasActuales(){
  const M = ST.M, out = {};
  const put = function(ent, id, o, l){
    const k = ent + ':' + id;
    out[k] = { k: k, ent: ent, id: id, o: o, l: l || null, json: JSON.stringify(payloadDe(ent, o, l)) };
  };
  M.F.forEach(function(f){ put('franja', f.id, f); });
  M.G.forEach(function(g){ put('guardia', g.id, g); });
  M.XT.forEach(function(x){ put('turno_extra', x.id, x); });
  M.L.forEach(function(l){ put('licencia', l.id, l); l.reemps.forEach(function(r){ put('reemplazo', r.id, r, l); }); });
  Object.keys(M.TC.cal).forEach(function(f){ put('tc', f, { fecha: f, medico: M.TC.cal[f] }); });
  M.TC.cambios.forEach(function(c){ put('tc_cambio', c.id, c); });
  if(ST.R.tarifas) put('config', 'tarifas', ST.R.tarifas);
  return out;
}
function tomarBase(){
  if(!ST.M) return;
  const f = filasActuales();
  Object.keys(f).forEach(function(k){ f[k].et = etiquetaDe(f[k].ent, f[k].o, f[k].l); });
  ST.base = f;
}

/* textos humanos */
function vTxt(v){ return v === null || v === undefined || v === '' ? '(vacío)' : String(v); }
function vFecha(v){ return v ? fmtF(v) : '(sin fecha)'; }
function vHasta(v){ return v ? fmtF(v) : 'sin fecha de regreso'; }
function vPend(v){ return v ? 'a confirmar' : 'confirmado'; }
function vEst(v){ return v === 'ok' ? 'confirmado' : v === 'no' ? 'no puede' : 'a confirmar'; }
function vSiNo(v){ return v ? 'sí' : 'no'; }
function vSem(v){ return +v ? 'Sábado ' + v : 'todos los sábados'; }
function vDia(v){ return DIAS[+v] || String(v); }
function vTurno(v){ return v && TURN[v] ? TURN[v][2] : 'sin turno fijo'; }
function vTurnoG(v){ return DL[v] || String(v); }
function vPlata(v){ return fmtM(+v || 0); }
function vPers(v){ return v ? nmP(v) : '(vacío)'; }
function quienRep(p){ return p.persona_id ? nmP(p.persona_id) : (p.nombre ? p.nombre + ' (externo)' : 'sin definir'); }
function rangoLic(l){ return l.desde && l.hasta && l.hasta !== l.desde ? fmtC(l.desde) + ' al ' + fmtC(l.hasta) : l.desde ? (l.hasta ? fmtC(l.desde) : 'desde ' + fmtC(l.desde)) : ''; }
function etiquetaDe(ent, o, l){
  if(ent === 'franja') return TN[o.tab] + ' · ' + nmP(o.key) + ' · ' + DIAS[o.dia] + (o.sem ? ' (Sáb ' + o.sem + ')' : '');
  if(ent === 'guardia') return 'Guardia · ' + nmP(o.key) + ' · ' + DIAS[wdOf(o.fecha)].slice(0, 3) + ' ' + fmtC(o.fecha) + ' ' + vTurnoG(o.t).toLowerCase();
  if(ent === 'turno_extra') return 'Turno extra · ' + nmP(o.key) + ' · ' + DIAS[wdOf(o.fecha)].slice(0, 3) + ' ' + fmtC(o.fecha);
  if(ent === 'licencia') return nmP(o.key) + ' (' + o.tipo + ' ' + rangoLic(o) + ')';
  if(ent === 'reemplazo') return nmP(l.key) + ' (' + l.tipo + ' ' + rangoLic(l) + ')';
  if(ent === 'tc') return 'Tomografía · Hospital Central · ' + DIAS[wdOf(o.fecha)].slice(0, 3) + ' ' + fmtF(o.fecha);
  if(ent === 'tc_cambio') return 'Tomografía · ' + (o.nota || 'cambio') + ' · ' + DIAS[wdOf(o.fecha)].slice(0, 3) + ' ' + fmtF(o.fecha);
  if(ent === 'config') return 'Tarifas de pago';
  return ent;
}
const CAMPOS = {
  franja: [['dia', 'Día', vDia], ['desde', 'Desde'], ['hasta', 'Hasta'], ['sem', 'Sábado', vSem], ['sec', 'Sector', vTxt], ['turno', 'Turno', vTurno], ['guardia', 'Guardia', vSiNo],
    ['pendiente', 'Estado', vPend], ['tab', 'Pestaña', function(v){ return TN[v] || v; }], ['persona_id', 'Persona', vPers], ['nombre_libre', 'Nombre', vTxt]],
  guardia: [['fecha', 'Fecha', vFecha], ['t', 'Turno', vTurnoG], ['pendiente', 'Estado', vPend]],
  turno_extra: [['fecha', 'Fecha', vFecha], ['desde', 'Desde'], ['hasta', 'Hasta'], ['nota', 'Nota', vTxt]],
  licencia: [['tipo', 'Tipo'], ['desde', 'Desde', vFecha], ['hasta', 'Hasta', vHasta], ['obs', 'Detalle', vTxt], ['pendiente', 'Estado', vPend]],
  reemplazo: [['hora_desde', 'Desde (hora)'], ['hora_hasta', 'Hasta (hora)'], ['nota', 'Nota', vTxt], ['fecha_desde', 'Cubre desde', vFecha], ['fecha_hasta', 'Cubre hasta', vFecha], ['est', 'Estado', vEst]],
  tc: [['medico', 'Médico', vTxt]],
  tc_cambio: [['medico_antes', 'Antes', vTxt], ['medico_nuevo', 'Ahora', vTxt], ['nota', 'Tipo', vTxt]],
  config: [['diurna', 'Tarifa diurna', vPlata], ['nocturna', 'Tarifa nocturna', vPlata]]
};
function listaDias(a){
  const ds = a.map(fmtC);
  return ds.length > 1 ? ds.slice(0, -1).join(', ') + ' y ' + ds[ds.length - 1] : ds[0] || '';
}
function detallesMod(ent, a, b){
  const out = [];
  (CAMPOS[ent] || []).forEach(function(c){
    const x = a[c[0]], y = b[c[0]];
    if(JSON.stringify(x === undefined ? null : x) === JSON.stringify(y === undefined ? null : y)) return;
    const f = c[2] || function(v){ return v === null || v === undefined ? '' : String(v); };
    out.push({ campo: c[1], antes: f(x), despues: f(y) });
  });
  if(ent === 'reemplazo'){
    if(a.persona_id !== b.persona_id || (a.nombre || '') !== (b.nombre || '')) out.unshift({ campo: 'Reemplazante', antes: quienRep(a), despues: quienRep(b) });
    const fa = a.fechas || [], fb = b.fechas || [];
    if(JSON.stringify(fa) !== JSON.stringify(fb)){
      const q = fa.filter(function(d){ return fb.indexOf(d) < 0; }), n = fb.filter(function(d){ return fa.indexOf(d) < 0; });
      if(q.length) out.push({ campo: 'Días', antes: listaDias(q), despues: '', texto: 'Se quit' + (q.length === 1 ? 'ó el día ' : 'aron los días ') + listaDias(q) });
      if(n.length) out.push({ campo: 'Días', antes: '', despues: listaDias(n), texto: 'Se agreg' + (n.length === 1 ? 'ó el día ' : 'aron los días ') + listaDias(n) });
      if(!fa.length && fb.length) out.push({ campo: 'Días', antes: 'todo el período', despues: 'solo ' + listaDias(fb), texto: 'Pasa a cubrir solo ' + listaDias(fb) });
      if(fa.length && !fb.length) out.push({ campo: 'Días', antes: listaDias(fa), despues: 'todo el período', texto: 'Pasa a cubrir todo el período' });
    }
  }
  if(ent === 'config'){
    const pa = a.personas || null, pb = b.personas || null;
    if(JSON.stringify(pa) !== JSON.stringify(pb)){
      const nn = function(l){ return l ? l.map(nmP) : []; };
      const q = nn(pa).filter(function(x){ return nn(pb).indexOf(x) < 0; }), n = nn(pb).filter(function(x){ return nn(pa).indexOf(x) < 0; });
      if(q.length) out.push({ campo: 'Panel de pago', antes: q.join(', '), despues: '', texto: 'Se saca del panel de pago: ' + q.join(', ') });
      if(n.length) out.push({ campo: 'Panel de pago', antes: '', despues: n.join(', '), texto: 'Se agrega al panel de pago: ' + n.join(', ') });
      if(!q.length && !n.length) out.push({ campo: 'Panel de pago', antes: '', despues: '', texto: 'Cambia la lista del panel de pago' });
    }
  }
  return out;
}
function detallesAlta(ent, o, l){
  const p = payloadDe(ent, o, l), d = [];
  const t = function(x){ d.push({ campo: '', antes: '', despues: '', texto: x }); };
  if(ent === 'franja'){
    if(o.sec) t('sector ' + o.sec);
    if(o.turno) t(vTurno(o.turno));
    if(o.guardia) t('guardia');
    if(o.pend) t('a confirmar');
  } else if(ent === 'guardia'){ if(o.pend) t('a confirmar'); }
  else if(ent === 'turno_extra'){ if(o.nota) t(o.nota); }
  else if(ent === 'licencia'){ if(o.obs) t(o.obs); if(o.pend) t('a confirmar'); if(!o.hasta) t('sin fecha de regreso'); }
  else if(ent === 'reemplazo'){
    t(quienRep(p) + ' ' + o.d + '–' + o.h);
    if(o.fechas && o.fechas.length) t('solo ' + listaDias(o.fechas));
    else if(o.desde || o.hasta) t('desde ' + (o.desde ? fmtC(o.desde) : 'el inicio') + ' hasta ' + (o.hasta ? fmtC(o.hasta) : 'el final'));
    t(vEst(o.est));
    if(o.nota) t(o.nota);
  } else if(ent === 'tc') t(p.medico);
  else if(ent === 'tc_cambio'){ t((o.antes ? o.antes + ' → ' : '') + o.nuevo); }
  else if(ent === 'config'){ t('diurna ' + fmtM(p.diurna) + ', nocturna ' + fmtM(p.nocturna)); }
  return d;
}
function tituloAlta(ent, o, l){
  const e = etiquetaDe(ent, o, l);
  if(ent === 'franja') return 'Nueva franja · ' + e + ' ' + o.d + '–' + o.h;
  if(ent === 'guardia') return 'Nueva guardia · ' + e.replace('Guardia · ', '');
  if(ent === 'turno_extra') return 'Nuevo turno extra · ' + e.replace('Turno extra · ', '') + ' ' + o.d + '–' + o.h;
  if(ent === 'licencia') return 'Nueva licencia · ' + e;
  if(ent === 'reemplazo') return 'Nuevo reemplazo · ' + e;
  if(ent === 'tc') return 'Tomografía · Hospital Central · se carga ' + e.split(' · ').pop();
  if(ent === 'tc_cambio') return 'Nuevo cambio · ' + e;
  return 'Nuevo · ' + e;
}
function tituloBaja(b){
  const e = b.et;
  const q = JSON.parse(b.json);
  if(b.ent === 'franja') return 'Se quita la franja · ' + e + ' ' + q.desde + '–' + q.hasta;
  if(b.ent === 'guardia') return 'Se quita la guardia · ' + e.replace('Guardia · ', '');
  if(b.ent === 'turno_extra') return 'Se quita el turno extra · ' + e.replace('Turno extra · ', '');
  if(b.ent === 'licencia') return 'Se quita la licencia · ' + e;
  if(b.ent === 'reemplazo') return 'Se quita un reemplazo · ' + e + ': ' + quienRep(JSON.parse(b.json));
  if(b.ent === 'tc') return 'Tomografía · Hospital Central · se quita ' + e.split(' · ').pop();
  if(b.ent === 'tc_cambio') return 'Se quita el cambio · ' + e;
  return 'Se quita · ' + e;
}
function cambioAlta(c){
  return { tipo: 'alta', ent: c.ent, titulo: tituloAlta(c.ent, c.o, c.l), detalles: detallesAlta(c.ent, c.o, c.l), ops: [{ fase: 0, ent: c.ent, id: c.id, o: c.o, l: c.l }] };
}
function cambioMod(b, c){
  const a = JSON.parse(b.json), n = JSON.parse(c.json);
  let ds = detallesMod(c.ent, a, n);
  if(!ds.length) ds = [{ campo: 'Otros datos', antes: '', despues: '', texto: 'se actualizan otros datos' }];
  let tit = etiquetaDe(c.ent, c.o, c.l);
  if(c.ent === 'franja') tit = 'Franja · ' + b.et;
  else if(c.ent === 'guardia' || c.ent === 'turno_extra') tit = c.ent === 'guardia' ? 'Guardia · ' + b.et.replace('Guardia · ', '') : 'Turno extra · ' + b.et.replace('Turno extra · ', '');
  else if(c.ent === 'licencia') tit = 'Licencia · ' + b.et;
  else if(c.ent === 'reemplazo') tit = 'Reemplazo · ' + etiquetaDe('reemplazo', c.o, c.l) + (c.l && c.l.reemps.length > 1 ? ' · ' + quienRep(n) : '');
  else if(c.ent === 'tc') tit = 'Tomografía · Hospital Central · ' + DIAS[wdOf(c.id)].slice(0, 3) + ' ' + fmtF(c.id);
  else if(c.ent === 'tc_cambio') tit = 'Cambio · ' + b.et;
  else if(c.ent === 'config') tit = 'Tarifas de pago';
  return { tipo: 'mod', ent: c.ent, titulo: tit, detalles: ds, ops: [{ fase: 1, ent: c.ent, id: c.id, o: c.o, l: c.l }] };
}
function cambioBaja(b){
  return { tipo: 'baja', ent: b.ent, titulo: tituloBaja(b), detalles: [], ops: [{ fase: 2, ent: b.ent, id: b.id, o: b.o, l: b.l }], lic: b.ent === 'reemplazo' && b.l ? b.l.id : null, licId: b.ent === 'licencia' ? b.id : null };
}
function mesDe(f){ return MESES[+f.slice(5, 7) - 1] + ' ' + f.slice(0, 4); }
function agruparCambios(lista){
  /* bajas de reemplazos cuya licencia también se quita: se muestran dentro de la licencia (igual se ejecutan antes) */
  const licBaja = {};
  lista.forEach(function(c){ if(c.licId) licBaja[c.licId] = c; });
  const res = [];
  lista.forEach(function(c){
    if(c.lic && licBaja[c.lic]){
      const L_ = licBaja[c.lic];
      L_.ops = L_.ops.concat(c.ops);
      L_.nRep = (L_.nRep || 0) + 1;
      return;
    }
    res.push(c);
  });
  res.forEach(function(c){ if(c.nRep) c.detalles = [{ campo: '', antes: '', despues: '', texto: 'y ' + (c.nRep === 1 ? 'su reemplazo' : 'sus ' + c.nRep + ' reemplazos') }]; });
  /* Tomografía: un renglón por mes con el detalle día por día adentro */
  const out = [], mes = {};
  res.forEach(function(c){
    if(c.ent !== 'tc'){ out.push(c); return; }
    const f = c.ops[0].id, k = f.slice(0, 7);
    if(!mes[k]){ mes[k] = { tipo: c.tipo, ent: 'tc', titulo: 'Tomografía · Hospital Central · ' + mesDe(f), detalles: [], ops: [], tipos: {} }; out.push(mes[k]); }
    const m = mes[k];
    m.ops = m.ops.concat(c.ops);
    m.tipos[c.tipo] = (m.tipos[c.tipo] || 0) + 1;
    const dia = DIAS[wdOf(f)].slice(0, 3) + ' ' + fmtC(f);
    if(c.tipo === 'alta') m.detalles.push({ campo: dia, antes: '', despues: c.detalles.length ? c.detalles[0].texto : '', texto: dia + ': ' + (c.detalles.length ? c.detalles[0].texto : '') });
    else if(c.tipo === 'baja') m.detalles.push({ campo: dia, antes: '', despues: '', texto: dia + ': se quita' });
    else m.detalles.push({ campo: dia, antes: c.detalles[0].antes, despues: c.detalles[0].despues, texto: dia + ': ' + c.detalles[0].antes + ' → ' + c.detalles[0].despues });
  });
  Object.keys(mes).forEach(function(k){
    const m = mes[k], n = m.tipos;
    m.tipo = (n.alta && !n.mod && !n.baja) ? 'alta' : (n.baja && !n.mod && !n.alta) ? 'baja' : 'mod';
    const parts = [];
    if(n.alta) parts.push(n.alta + ' día' + (n.alta === 1 ? '' : 's') + ' nuevo' + (n.alta === 1 ? '' : 's'));
    if(n.mod) parts.push(n.mod + ' cambiado' + (n.mod === 1 ? '' : 's'));
    if(n.baja) parts.push(n.baja + ' quitado' + (n.baja === 1 ? '' : 's'));
    m.resumen = parts.join(', ');
  });
  return out;
}
function cambiosPendientes(){
  if(!ST.base || !ST.M || !ST.cargado) return [];
  const cur = filasActuales(), base = ST.base, out = [];
  Object.keys(cur).forEach(function(k){
    const c = cur[k], b = base[k];
    if(!b) out.push(cambioAlta(c));
    else if(b.json !== c.json) out.push(cambioMod(b, c));
  });
  Object.keys(base).forEach(function(k){ if(!cur[k]) out.push(cambioBaja(base[k])); });
  return agruparCambios(out);
}
function textoCambio(c){
  const ds = c.detalles.map(function(d){ return d.texto || (d.campo + ' ' + d.antes + ' → ' + d.despues); });
  if(c.resumen) return c.titulo + ': ' + c.resumen + ' (' + ds.join(' · ') + ')';
  return c.titulo + (ds.length ? ': ' + ds.join(' · ') : '');
}
function nCambiosTxt(n){ return n + ' cambio' + (n === 1 ? '' : 's'); }
function hayBorrador(){ return !!ST.cargado && cambiosPendientes().length > 0; }

/* ejecución real del borrador, en orden: altas -> reemplazos nuevos -> modificaciones -> bajas (reemplazos primero, licencias al final) */
const ORD_ENT = { franja: 1, guardia: 2, turno_extra: 3, licencia: 4, tc: 5, tc_cambio: 6, config: 7, reemplazo: 8 };
const ORD_BAJA = { reemplazo: 0, franja: 1, guardia: 2, turno_extra: 3, tc: 4, tc_cambio: 5, config: 6, licencia: 9 };
function ordenOps(ops){
  return ops.map(function(o, i){ return { o: o, i: i }; }).sort(function(a, b){
    const x = a.o, y = b.o;
    if(x.fase !== y.fase) return x.fase - y.fase;
    const ox = x.fase === 2 ? ORD_BAJA[x.ent] : ORD_ENT[x.ent], oy = y.fase === 2 ? ORD_BAJA[y.ent] : ORD_ENT[y.ent];
    return ox - oy || a.i - b.i;
  }).map(function(z){ return z.o; });
}
function ejecutarOp(op){
  if(op.fase === 2) return op.ent === 'tc' ? borrarTc(op.id) : borrarReal(op.ent, op.o);
  if(op.ent === 'tc') return escribirTc(op.id, ST.M.TC.cal[op.id]);
  if(op.ent === 'config') return escribirTarifas();
  return escribirFila(op.ent, op.o, function(){ return op.ent === 'reemplazo' ? pRep(op.o, op.l) : payloadDe(op.ent, op.o, op.l); });
}
async function guardarTodo(cambios, opt){
  if(ST.guardando) return;
  const ops = [];
  cambios.forEach(function(c){ c.ops.forEach(function(o){ ops.push(o); }); });
  const n = cambios.length, gen0 = ST.gen;
  ST.guardando = true;
  limpiarPop();
  pintar();
  ordenOps(ops).forEach(ejecutarOp);
  await ST.cola;
  if(ST.gen !== gen0){ ST.guardando = false; pintar(); return; }
  await recargar();
  ST.guardando = false;
  if(ST.error) tomarBase();
  if(opt && opt.salir) S.edit = false;
  pintar();
  if(!ST.error) ST.puente.aviso('Guardado: ' + nCambiosTxt(n));
}
async function descartarYa(){
  S.pop = null;
  await recargar();
  ST.puente.aviso('Se descartaron los cambios sin guardar.');
}
function confirmar(titulo, cuerpo, okTxt, noTxt, okClase){
  return new Promise(function(res){
    let ctl = null;
    function fin(v){ if(ctl) ctl.cerrar(); res(v); }
    ctl = ST.puente.dialogo({ titulo: titulo, clase: 'aviso', cuerpo: cuerpo,
      botones: [{ texto: noTxt || 'Cancelar', clase: 'ed-btn', alClic: function(){ fin(false); } }, { texto: okTxt, clase: 'ed-btn ' + (okClase || 'prim'), alClic: function(){ fin(true); } }],
      alCancelar: function(){ fin(false); } });
  });
}
function descartar(){
  const cs = cambiosPendientes();
  if(!cs.length){ ST.puente.aviso('No hay cambios para descartar.'); return Promise.resolve(); }
  limpiarPop();
  return confirmar('¿Descartar los cambios?', [h('p', { t: 'Vas a perder ' + nCambiosTxt(cs.length) + ' que todavía no guardaste. Se vuelve a leer el cronograma guardado.' })], 'Sí, descartar', 'No, seguir editando', 'peligro')
    .then(function(ok){ if(ok) return descartarYa(); });
}
function itemCambio(c){
  const li = h('li', { class: 'cr-rev-i', 'data-ent': c.ent });
  if(c.detalles.length > 6 || c.resumen){
    poner(li, h('b', { t: c.titulo }), c.resumen ? ': ' + c.resumen : '',
      h('details', { class: 'cr-rev-ds' }, h('summary', { t: 'Ver el detalle (' + c.detalles.length + ')' }), h('ul', null, c.detalles.map(function(d){ return h('li', { t: d.texto || (d.campo + ' ' + d.antes + ' → ' + d.despues) }); }))));
    return li;
  }
  poner(li, h('b', { t: c.titulo }));
  if(c.detalles.length){
    poner(li, ': ');
    c.detalles.forEach(function(d, i){
      poner(li, i ? ' · ' : '', h('span', { class: 'cr-rev-d', t: d.texto || (d.campo + ' ' + d.antes + ' → ' + d.despues) }));
    });
  }
  return li;
}
function revisarYGuardar(opt){
  const cs = cambiosPendientes();
  if(!cs.length){
    ST.puente.aviso('No hiciste cambios.');
    if(opt && opt.salir){ S.edit = false; pintar(); }
    return;
  }
  limpiarPop();
  const n = cs.length, cuerpo = [h('p', { class: 'cr-rev-t', t: (n === 1 ? 'Este es el cambio que vas a guardar.' : 'Estos son los ' + n + ' cambios que vas a guardar.') + ' Mientras no confirmes, la base no cambia.' })];
  const lista = h('div', { class: 'cr-rev', id: 'cr-rev', tabindex: '0', 'aria-label': 'Lista de cambios' });
  [['alta', 'Altas'], ['mod', 'Modificaciones'], ['baja', 'Se quitan']].forEach(function(g){
    const del = cs.filter(function(c){ return c.tipo === g[0]; });
    if(!del.length) return;
    poner(lista, h('div', { class: 'cr-rev-h ' + g[0], t: g[1] + ' (' + del.length + ')' }), h('ul', { class: 'cr-rev-l' }, del.map(itemCambio)));
  });
  cuerpo.push(lista);
  ST.puente.dialogo({ titulo: '¿Guardar los cambios?', clase: 'ancho', cuerpo: cuerpo,
    botones: [
      { texto: 'Guardar ' + nCambiosTxt(n), clase: 'ed-btn prim', alClic: function(c){ c.cerrar(); guardarTodo(cs, opt); } },
      { texto: 'Seguir editando', clase: 'ed-btn', alClic: function(c){ c.cerrar(); } },
      { texto: 'Descartar todo', clase: 'ed-btn peligro', alClic: function(c){ c.cerrar(); descartarYa(); } }
    ] });
}
function barraBorrador(n, sfx){
  const sf = sfx ? '-' + sfx : '';
  return h('div', { class: 'cr-borrador' + (sfx ? ' cr-bchica' : ''), id: 'cr-borrador' + sf, role: 'status' },
    h('b', { class: 'bn', t: ST.guardando ? 'Guardando…' : '✎ ' + nCambiosTxt(n) + ' sin guardar' }),
    h('span', { class: 'bs', t: ST.guardando ? 'Un momento, no cierres la página.' : 'Todavía no se guardó nada en la base.' }),
    h('div', { class: 'ba' },
      btn('Revisar y guardar', 'sm pri', function(){ revisarYGuardar(); }, { id: 'cr-revisar' + sf, disabled: ST.guardando }),
      btn('Descartar', 'sm dng', function(){ descartar(); }, { id: 'cr-descartar' + sf, disabled: ST.guardando })));
}
function pintarBarra(){
  if(!ST.cargado) return;
  const cs = cambiosPendientes(), n = cs.length;
  ST.R.nCambios = n;
  [['bhost', ''], ['dhost', 'ficha']].forEach(function(z){
    const host = ST.R[z[0]];
    if(!host) return;
    vaciar(host);
    if(n || ST.guardando) poner(host, barraBorrador(n, z[1]));
  });
}
function avisoSalida(ev){
  if(ST.cargado && (ST.guardando || hayBorrador())){
    ev.preventDefault();
    ev.returnValue = '';
  }
}

/* == reemplazos por día: quitar un día, pasarlo a otra persona, asignarlo (lógica sin DOM; ops permite probarla sobre un modelo suelto) == */
function opsReal(){ return { alta: A.repAlta, cambio: A.repCambio, baja: A.repBaja, PM: ST.M ? ST.M.PM : {} }; }
function minT(x){ x = ((x % 1440) + 1440) % 1440; return pad(Math.floor(x / 60)) + ':' + pad(x % 60); }
function quienDe(v, PM){
  if(v && typeof v === 'object') return { key: v.key || '', nombre: v.key ? '' : (v.nombre || '') };
  return PM && PM[v] ? { key: v, nombre: '' } : { key: '', nombre: String(v || '') };
}
/* primer y último día efectivos de un reemplazo por rango; fin '' = abierto */
function repBordes(l, r){
  const ini = r.desde && r.desde > l.desde ? r.desde : l.desde;
  const fl = l.hasta || '', fin = r.hasta && (!fl || r.hasta < fl) ? r.hasta : fl;
  return { ini: ini, fin: fin };
}
/* devuelve null si el día no pertenece al reemplazo; si no, cómo quedó: 'baja' | 'fechas' | 'inicio' | 'fin' | 'partido' */
function repDiaQuitar(l, r, d, ops){
  ops = ops || opsReal();
  if(r.fechas && r.fechas.length){
    if(r.fechas.indexOf(d) < 0) return null;
    const resto = r.fechas.filter(function(x){ return x !== d; });
    if(!resto.length){ ops.baja(l, r); return 'baja'; }
    r.fechas = resto; ops.cambio(l, r);
    return 'fechas';
  }
  const e = repBordes(l, r);
  if(d < e.ini || (e.fin && d > e.fin)) return null;
  if(d === e.ini){
    if(e.fin && e.fin === d){ ops.baja(l, r); return 'baja'; }
    r.desde = addD(d, 1); ops.cambio(l, r);
    return 'inicio';
  }
  if(e.fin && d === e.fin){ r.hasta = addD(d, -1); ops.cambio(l, r); return 'fin'; }
  const r2 = { key: r.key, nombre: r.nombre, d: r.d, h: r.h, nota: r.nota, fechas: [], desde: addD(d, 1), hasta: r.hasta, est: r.est };
  r.hasta = addD(d, -1);
  ops.cambio(l, r); ops.alta(l, r2);
  return 'partido';
}
/* da el día d a quien (key o nombre externo) con esas horas: suma a un reemplazo por fechas de la misma persona y horas que siga a confirmar, o crea uno */
function repDiaAsignar(l, quien, d, dh, hh, ops){
  ops = ops || opsReal();
  const q = quienDe(quien, ops.PM);
  const ex = l.reemps.find(function(x){ return x.fechas && x.fechas.length && (x.key || '') === q.key && (x.nombre || '') === q.nombre && x.d === dh && x.h === hh && !x.est; });
  if(ex){
    if(ex.fechas.indexOf(d) < 0){ ex.fechas = ex.fechas.concat([d]).sort(); ops.cambio(l, ex); }
    return ex;
  }
  const nr = { key: q.key, nombre: q.nombre, d: dh, h: hh, nota: '', fechas: [d], desde: '', hasta: '', est: '' };
  ops.alta(l, nr);
  return nr;
}
function repDiaMover(l, r, d, quien, ops){
  ops = ops || opsReal();
  const q = quienDe(quien, ops.PM), dh = r.d, hh = r.h;
  if(repDiaQuitar(l, r, d, ops) === null) return null;
  return repDiaAsignar(l, q, d, dh, hh, ops);
}
/* suma el día d a este reemplazo: 'ok' | 'ya' (ya lo cubría) | 'fuera' (fuera de la licencia) */
function repDiaAgregar(l, r, d, ops){
  ops = ops || opsReal();
  if(d < l.desde || (l.hasta && d > l.hasta)) return 'fuera';
  if(r.fechas && r.fechas.length){
    if(r.fechas.indexOf(d) >= 0) return 'ya';
    r.fechas = r.fechas.concat([d]).sort(); ops.cambio(l, r);
    return 'ok';
  }
  const e = repBordes(l, r);
  if(d >= e.ini && (!e.fin || d <= e.fin)) return 'ya';
  repDiaAsignar(l, { key: r.key, nombre: r.nombre }, d, r.d, r.h, ops);
  return 'ok';
}
/* el reemplazo r cubre efectivamente el día d del titular (hay turno que cubrir; si es de guardias, el horario coincide) */
function repCubre(l, r, d){
  const C_ = ST.C, need = C_.ownShifts(l.key, d, true);
  if(!need.length || !C_.repOn(r, l, d)) return false;
  if(C_.esGuard(l.key)){
    const a = mins(r.d), b = mins(r.h) <= a ? mins(r.h) + 1440 : mins(r.h);
    return need.some(function(x){ return x[0] === a && x[1] === b; });
  }
  return true;
}
/* advertencias (no bloquean) de poner a quien en el día d con el horario de r */
function avisosDia(l, r, q, d, dh, hh){
  if(!q.key) return ['es un reemplazante externo: no se puede verificar su disponibilidad'];
  const C_ = ST.C, a = mins(dh || r.d), e = mins(hh || r.h), b = e <= a ? e + 1440 : e;
  const out = C_.popOverlap(q.key, d, a, b).slice();
  C_.repAll().forEach(function(x){
    if(x.r === r || x.r.key !== q.key || x.est === 'no') return;
    if(C_.repDays(x.l, x.r).indexOf(d) < 0) return;
    const a2 = mins(x.r.d), b2 = mins(x.r.h) <= a2 ? mins(x.r.h) + 1440 : mins(x.r.h);
    if(a2 < b && a < b2) out.push('ya cubre a ' + apP(x.l.key) + ' en ese horario');
  });
  return out;
}

/* selector de persona (misma planilla que el titular + "otro/externo") */
function selectorQuien(l, excluirKey, rotulo, alCambiar){
  const op = opcionesReemp(l, '').filter(function(o){ return o[0] !== excluirKey; });
  op[0] = ['', rotulo];
  const refs = {};
  refs.nom = h('input', { type: 'text', placeholder: 'Nombre del reemplazante', maxlength: '120', hidden: true, 'aria-label': 'Nombre del reemplazante externo', on: { input: function(){ if(alCambiar) alCambiar(); } } });
  refs.sel = selec(op, '', function(v){ refs.nom.hidden = v !== '__ext'; if(alCambiar) alCambiar(); }, 'cr-qsel');
  refs.sel.setAttribute('aria-label', rotulo);
  return {
    el: h('span', { class: 'cr-quien' }, refs.sel, refs.nom),
    valor: function(){
      const v = refs.sel.value;
      if(!v) return null;
      if(v === '__ext'){ const n = refs.nom.value.trim(); return n ? { key: '', nombre: n.slice(0, 120) } : null; }
      return { key: v, nombre: '' };
    }
  };
}
function textoQuien(q){ return q.key ? nmP(q.key) : q.nombre; }
function controlPasar(l, r, d){
  const box = h('div', { class: 'cr-pasar', 'data-pasar': d }), av = h('div', { class: 'cr-pasar-av' });
  let q = null;
  function ver(){
    vaciar(av);
    const v = q.valor();
    if(!v) return;
    const w = avisosDia(l, r, v, d);
    if(w.length) poner(av, h('div', { class: 'cfc w', t: '⚠ ' + textoQuien(v) + ': ' + w.join(' · ') + '. Se puede pasar igual.' }));
  }
  q = selectorQuien(l, r.key, 'Pasar a…', ver);
  poner(box, q.el, btn('Pasar este día', 'sm', function(){
    const v = q.valor();
    if(!v){ ST.puente.aviso('Elegí a quién pasarle el día ' + fmtC(d) + '.'); return; }
    repDiaMover(l, r, d, v);
    limpiarPop(); pintar();
  }, { 'aria-label': 'Pasar el día ' + fmtC(d) + ' a otra persona' }), av);
  return box;
}
function controlAsignar(l, d, turno){
  const dh = turno ? minT(turno[0]) : '07:00', hh = turno ? minT(turno[1]) : '13:00';
  const di = h('input', { type: 'time', value: dh, 'aria-label': 'Reemplazo desde' }), hi = h('input', { type: 'time', value: hh, 'aria-label': 'Reemplazo hasta' });
  const av = h('div', { class: 'cr-pasar-av' });
  let q = null;
  function ver(){
    vaciar(av);
    const v = q.valor();
    if(!turno) poner(av, h('div', { class: 'cfc w', t: '⚠ ' + apP(l.key) + ' no tiene turno cargado ese día: el reemplazo no se va a ver en el diagrama.' }));
    if(!v) return;
    const w = avisosDia(l, { d: di.value, h: hi.value }, v, d, di.value, hi.value);
    if(w.length) poner(av, h('div', { class: 'cfc w', t: '⚠ ' + textoQuien(v) + ': ' + w.join(' · ') + '. Se puede asignar igual.' }));
  }
  q = selectorQuien(l, '', 'Elegir reemplazante…', ver);
  di.addEventListener('change', ver); hi.addEventListener('change', ver);
  const box = h('div', { class: 'cr-asignar', 'data-asignar': d }, turno && ST.C.esGuard(l.key) ? h('small', { t: DL[letterOf(dh, hh)] + ' ' + dh + '–' + hh }) : null,
    h('div', { class: 'cr-fr1' }, q.el, di, hi,
      btn('Asignar este día', 'sm pri', function(){
        const v = q.valor();
        if(!v){ ST.puente.aviso('Elegí quién reemplaza a ' + apP(l.key) + ' el ' + fmtC(d) + '.'); return; }
        if(!horaOk(di.value, hi.value)) return;
        repDiaAsignar(l, v, d, di.value, hi.value);
        limpiarPop(); pintar();
      })), av);
  ver();
  return box;
}
/* lista de días de un reemplazo con quitar / pasar a otra persona / agregar */
function diasEditor(l, r){
  const hoy = ST.puente.hoy(), todos = ST.C.repDays(l, r), fut = todos.filter(function(d){ return d >= hoy; }), pas = todos.length - fut.length, MAXD = 40;
  const box = h('div', { class: 'cr-dias', 'data-dias': r.id });
  poner(box, h('div', { class: 'cr-hint', t: fut.length ? 'Días que cubre (' + fut.length + (pas ? ', y ' + pas + ' ya pasaron' : '') + '):' : 'No tiene días por cubrir de hoy en adelante.' }));
  fut.slice(0, MAXD).forEach(function(d){
    poner(box, h('div', { class: 'cr-dia', 'data-dia': d },
      h('span', { class: 'chip', t: DIAS[wdOf(d)].slice(0, 3) + ' ' + fmtC(d) }),
      btn('✕ Quitar día', 'sm dng', function(){ repDiaQuitar(l, r, d); pintar(); }, { 'aria-label': 'Quitar el día ' + fmtC(d) + ' de este reemplazo' }),
      controlPasar(l, r, d)));
  });
  if(fut.length > MAXD) poner(box, h('div', { class: 'cr-hint', t: '…y ' + (fut.length - MAXD) + ' días más (el período sigue). Acortá el período para ver los demás.' }));
  const di = h('input', { type: 'date', min: l.desde, max: l.hasta || null, 'aria-label': 'Día a agregar' });
  poner(box, h('div', { class: 'cr-fr1' }, h('small', { t: 'Sumar un día:' }), di, btn('+ Agregar día', 'sm', function(){
    if(!di.value){ ST.puente.aviso('Elegí la fecha del día a agregar.'); return; }
    const res = repDiaAgregar(l, r, di.value);
    if(res === 'ya') ST.puente.aviso('Ese día ya lo cubre este reemplazo.');
    else if(res === 'fuera') ST.puente.aviso('Ese día está fuera de la licencia (' + rangoLic(l) + ').');
    else pintar();
  })));
  return box;
}

/* == modo "Editar cuadro" == */
function abrirPop(e, r){
  poner(document.body, e);
  ubicarPop(e, r);
  e.setAttribute('tabindex', '-1');
  try{ e.focus({ preventScroll: true }); }catch(x){}
}
function btnCerrarPop(){ return h('button', { type: 'button', class: 'x2', title: 'Cerrar', 'aria-label': 'Cerrar', on: { click: limpiarPop }, t: '✕' }); }
function tabEditable(t){ return t === 'tec' || t === 'adm' || t === 'rx'; }
function esFranjaEditable(f){ return !!f && !f.g && !f.xt && ST.M.F.indexOf(f) >= 0; }
function resumenFranja(f){
  return DIAS[f.dia] + ' ' + f.d + '–' + f.h + (f.sem ? ' · Sáb ' + f.sem : '') + (f.sec ? ' · ' + (SEC[f.sec] || f.sec) : '');
}
/* campos de una franja semanal; leer() devuelve los valores o null si falta algo */
function camposFranja(f){
  const tec = f.tab === 'tec', adm = f.tab === 'adm', r = {};
  r.dia = selec(DIAS.map(function(x, i){ return [i, x]; }), f.dia, function(v){ r.semw.hidden = +v !== 5; });
  r.dia.setAttribute('aria-label', 'Día');
  r.d = h('input', { type: 'time', value: f.d, 'aria-label': 'Desde' });
  r.h = h('input', { type: 'time', value: f.h, 'aria-label': 'Hasta' });
  r.sem = selec([[0, 'Todos los sábados'], [1, 'Sábado 1'], [2, 'Sábado 2']], f.sem || 0, function(){});
  r.sem.setAttribute('aria-label', 'Sábado');
  r.semw = campo('Sábado', r.sem);
  r.semw.hidden = f.dia !== 5;
  r.sec = adm ? h('input', { type: 'text', value: f.sec || '', maxlength: '60', placeholder: 'Sector', 'aria-label': 'Sector' }) : null;
  r.turno = tec ? selec([['', 'Sin turno fijo'], ['M', 'Mañana'], ['T', 'Tarde']], f.turno || '', function(){}) : null;
  if(r.turno) r.turno.setAttribute('aria-label', 'Turno');
  r.g = tec ? h('input', { type: 'checkbox', checked: !!f.guardia, 'aria-label': 'Guardia' }) : null;
  r.pend = h('input', { type: 'checkbox', checked: !!f.pend, 'aria-label': 'A confirmar' });
  const el = h('div', { class: 'cr-fcampos' },
    campo('Día', r.dia), r.semw, campo('Desde', r.d), campo('Hasta', r.h),
    adm ? campo('Sector', r.sec, 'full') : null, tec ? campo('Turno', r.turno) : null,
    tec ? h('label', { class: 'cr-chk1' }, r.g, 'Guardia') : null, h('label', { class: 'cr-chk1' }, r.pend, 'A confirmar'));
  return {
    el: el,
    leer: function(){
      if(!horaOk(r.d.value, r.h.value)) return null;
      const dia = +r.dia.value;
      return { dia: dia, d: r.d.value, h: r.h.value, sem: dia === 5 ? +r.sem.value : 0, sec: r.sec ? r.sec.value.trim().slice(0, 60) : f.sec, turno: r.turno ? r.turno.value : f.turno,
        guardia: r.g ? r.g.checked : f.guardia, pend: r.pend.checked };
    }
  };
}
function franjaPop(ev, f, nuevo){
  if(ev && ev.stopPropagation) ev.stopPropagation();
  limpiarPop();
  const el = (ev && (ev.currentTarget || ev.target)) || document.body, r = el.getBoundingClientRect();
  S.pop = { franja: f.id || 'nueva', t: Date.now() };
  const cf = camposFranja(f), msg = h('div', { class: 'msg', role: 'alert' });
  const aplicar = function(){
    const v = cf.leer();
    if(!v){ vaciar(msg); poner(msg, 'Revisá las horas: tienen que estar completas y ser distintas.'); return; }
    if(nuevo){
      if(ST.M.F.some(function(x){ return x.key === f.key && x.tab === f.tab && x.dia === v.dia && x.d === v.d && x.h === v.h && x.sem === v.sem; })){ vaciar(msg); poner(msg, 'Ya existe una franja igual para esa persona.'); return; }
      Object.assign(f, v, { motivo: v.pend ? (f.motivo || '') : '' });
      A.franjaAlta(f);
    } else {
      Object.assign(f, v);
      if(!f.pend) f.motivo = '';
      A.franjaCambio(f);
    }
    limpiarPop(); pintar();
  };
  const acts = nuevo
    ? [btn('Agregar franja', 'pri sm', aplicar), btn('Cancelar', 'sm', limpiarPop)]
    : [btn('Aplicar', 'pri sm', aplicar), btn('Quitar franja', 'sm dng', function(){ A.franjaBaja(f); limpiarPop(); pintar(); }), btn('Ver ficha', 'sm', function(){ limpiarPop(); openPerson(f.key, f.id); })];
  const e = h('div', { id: 'cr-pop', class: 'cr-pop', role: 'dialog', 'aria-label': nuevo ? 'Nueva franja' : 'Editar franja' }, btnCerrarPop(),
    h('h4', { t: (nuevo ? 'Nueva franja · ' : '') + nmP(f.key) }),
    h('div', { class: 'sb', t: TN[f.tab] + (nuevo ? '' : ' · ' + resumenFranja(f)) + '. Es la franja semanal: vale para todas las semanas, no solo para este día.' }),
    cf.el, msg, h('div', { class: 'acts' }, acts));
  abrirPop(e, r);
}
function franjaNueva(ev, p, dia, tab){
  const otra = ST.M.F.find(function(x){ return x.key === p.key && x.tab === tab; });
  franjaPop(ev, { tab: tab, key: p.key, dia: dia, d: otra ? otra.d : (tab === 'adm' ? '08:00' : '07:00'), h: otra ? otra.h : (tab === 'adm' ? '16:00' : '13:00'), sec: otra ? otra.sec : '', asig: [],
    guardia: false, sem: 0, turno: otra && tab === 'tec' ? otra.turno : '', pend: false, motivo: '' }, true);
}
function quitarDelCuadro(p, tab){
  const fs = ST.M.F.filter(function(f){ return f.key === p.key && f.tab === tab; });
  fs.forEach(function(f){ A.franjaBaja(f); });
  limpiarPop();
  pintar();
  if(fs.length) ST.puente.aviso('Se quitó a ' + nmP(p.key) + ' de ' + TN[tab] + ' (' + fs.length + ' franja' + (fs.length === 1 ? '' : 's') + '). Falta guardar.');
}
function ordenP(a, b){
  const g = ['tec', 'adm', 'med', 'res'];
  return g.indexOf(a.grp) - g.indexOf(b.grp) || a.orden - b.orden || a.ap.localeCompare(b.ap, 'es');
}
function personaLibre(nombre){
  const n = nombre.replace(/\s+/g, ' ').trim().slice(0, 80), k = 'libre:' + n, PM = ST.M.PM;
  if(!PM[k]){
    PM[k] = { key: k, id: null, tipo: 'medico', grp: 'med', ap: n, nom: '', serv: ['Radiología'], orden: 9999, libre: true };
    ST.M.P.push(PM[k]);
    ST.M.P.sort(ordenP);
    ST.R.hueMap = null;
  }
  return k;
}
function formPersonaCuadro(){
  const t = tabAct(), grp = t === 'tec' ? 'tec' : t === 'adm' ? 'adm' : 'med', M = ST.M;
  const con = new Set(M.F.filter(function(f){ return f.tab === t; }).map(function(f){ return f.key; }));
  const todas = M.P.filter(function(p){ return p.grp === grp && !p.oculta && p.key !== 'res'; });
  const ord = todas.filter(function(p){ return !con.has(p.key); }).concat(todas.filter(function(p){ return con.has(p.key); }));
  const op = [['', '— elegir persona —']].concat(ord.map(function(p){ return [p.key, ST.C.nm(p) + (con.has(p.key) ? '' : ' (sin franjas)')]; }));
  if(t === 'rx') op.push(['__libre', 'Otra persona (nombre libre)…']);
  const r = {}, msg = h('div', { class: 'msg', role: 'alert' });
  r.nom = h('input', { type: 'text', placeholder: 'Nombre y apellido', maxlength: '80', hidden: true, 'aria-label': 'Nombre de la persona (nombre libre)' });
  r.p = selec(op, '', function(v){ r.nom.hidden = v !== '__libre'; });
  r.p.setAttribute('aria-label', 'Persona');
  const dias = DIAS.map(function(n, i){ return h('label', { class: 'cr-chk1 cr-dsel' }, h('input', { type: 'checkbox', 'data-dia': i, 'aria-label': n, on: { change: function(){ r.semw.hidden = !dias[5].querySelector('input').checked; } } }), n.slice(0, 3)); });
  r.sem = selec([[0, 'Todos los sábados'], [1, 'Sábado 1'], [2, 'Sábado 2']], 0, function(){});
  r.sem.setAttribute('aria-label', 'Sábado');
  r.semw = campo('Sábado', r.sem); r.semw.hidden = true;
  r.d = h('input', { type: 'time', value: t === 'adm' ? '08:00' : t === 'rx' ? '08:00' : '07:00', 'aria-label': 'Desde' });
  r.h = h('input', { type: 'time', value: t === 'adm' ? '16:00' : t === 'rx' ? '20:00' : '13:00', 'aria-label': 'Hasta' });
  r.sec = t === 'adm' ? h('input', { type: 'text', maxlength: '60', placeholder: 'Sector', 'aria-label': 'Sector' }) : null;
  r.turno = t === 'tec' ? selec([['', 'Sin turno fijo'], ['M', 'Mañana'], ['T', 'Tarde']], '', function(){}) : null;
  if(r.turno) r.turno.setAttribute('aria-label', 'Turno');
  r.pend = h('input', { type: 'checkbox', 'aria-label': 'A confirmar' });
  const marcar = function(a){ dias.forEach(function(l, i){ l.querySelector('input').checked = a.indexOf(i) >= 0; }); r.semw.hidden = a.indexOf(5) < 0; };
  const falla = function(t_){ vaciar(msg); poner(msg, t_); };
  return h('div', { class: 'cr-form cr-addp', id: 'cr-form-persona' }, h('b', { t: 'Agregar persona al cuadro · ' + TN[t] }),
    campo('Persona', r.p), r.nom,
    h('div', { class: 'cr-dsels' }, dias, btn('Lun a Vie', 'sm', function(){ marcar([0, 1, 2, 3, 4]); }), btn('Ninguno', 'sm', function(){ marcar([]); })),
    h('div', { class: 'cr-fcampos' }, r.semw, campo('Desde', r.d), campo('Hasta', r.h), r.sec ? campo('Sector', r.sec, 'full') : null, r.turno ? campo('Turno', r.turno) : null,
      h('label', { class: 'cr-chk1' }, r.pend, 'A confirmar')),
    msg,
    h('div', { class: 'acts' }, btn('Agregar', 'pri sm', function(){
      let key = r.p.value;
      if(!key){ falla('Elegí una persona.'); return; }
      if(key === '__libre'){
        if(!r.nom.value.trim()){ falla('Escribí el nombre de la persona.'); return; }
      }
      const ds = [];
      dias.forEach(function(l, i){ if(l.querySelector('input').checked) ds.push(i); });
      if(!ds.length){ falla('Elegí al menos un día.'); return; }
      if(!horaOk(r.d.value, r.h.value)){ falla('Revisá las horas: tienen que estar completas y ser distintas.'); return; }
      if(key === '__libre') key = personaLibre(r.nom.value);
      let n = 0;
      ds.forEach(function(dia){
        const sem = dia === 5 ? +r.sem.value : 0;
        if(ST.M.F.some(function(x){ return x.key === key && x.tab === t && x.dia === dia && x.d === r.d.value && x.h === r.h.value && x.sem === sem; })) return;
        A.franjaAlta({ tab: t, key: key, dia: dia, d: r.d.value, h: r.h.value, sec: r.sec ? r.sec.value.trim().slice(0, 60) : '', asig: [], guardia: false, sem: sem, turno: r.turno ? r.turno.value : '', pend: r.pend.checked, motivo: '' });
        n++;
      });
      S.addP = false;
      pintar();
      ST.puente.aviso(n ? 'Se agregaron ' + n + ' franja' + (n === 1 ? '' : 's') + ' a ' + nmP(key) + '. Falta guardar.' : 'Esa persona ya tenía esas franjas.');
    }), btn('Cancelar', 'sm', function(){ S.addP = false; pintar(); })));
}
function ayudaEdicion(v){
  const sub = S.sub, t = tabAct();
  if(sub === 'eco') return 'Eco/Doppler se edita en Médicos › Cronograma Ecografía/Doppler: acá es solo lectura.';
  if(v === 'sem') return 'Tocá un bloque para cambiar día, horario o sector, o quitarlo. Con “+ Agregar persona al cuadro” cargás personal nuevo con sus horarios.';
  if(v === 'sems' || v === 'mes') return 'Tocá un bloque para editar su franja semanal (se repite todas las semanas, no solo este día). Para cambios de un día puntual usá el diagrama o la ficha de la persona.';
  if(v === 'cuadro') return 'Tocá un horario para editarlo, el “+” de una celda para sumar una franja ese día, o “Quitar del cuadro” para sacar a una persona de esta pestaña.';
  if(v === 'lista') return 'Cada licencia se edita acá mismo. Con “+ Licencia” cargás una nueva.';
  if(v === 'conf') return 'Confirmá, editá, quitá o pasá de persona los reemplazos desde el cuadro “A confirmar” de arriba.';
  if(v === 'tcg') return 'Tocá un día para cambiar quién informa o quién cubre las urgencias; con “+ Subir cronograma del mes” cargás el calendario completo.';
  if(v === 'pago') return 'Las tarifas y la lista de técnicos del panel se editan acá mismo (solo un administrador).';
  if(v === 'diag') return 'Tocá una celda del diagrama para confirmar un reemplazo, quitar o pasar un día a otra persona, marcar una ausencia o sumar un turno extra. Los horarios fijos se editan en Semana tipo o Cuadro.';
  return 'Esta vista no se edita directamente. Los horarios se cambian en ' + (tabEditable(t) ? 'Semana tipo o Cuadro' : 'su vista de edición') + '; las ausencias y reemplazos, desde el diagrama o la ficha de la persona.';
}
function guardarEdicion(){ revisarYGuardar({ salir: true }); }
function cancelarEdicion(){
  const n = cambiosPendientes().length;
  if(!n){ S.edit = false; limpiarPop(); pintar(); return; }
  limpiarPop();
  confirmar('¿Salir sin guardar?', [h('p', { t: 'Tenés ' + nCambiosTxt(n) + ' sin guardar. Si cancelás la edición se pierden y se vuelve a leer el cronograma guardado.' })], 'Descartar y salir', 'Seguir editando', 'peligro')
    .then(function(ok){ if(!ok) return; S.edit = false; return descartarYa(); });
}
function renderEdicion(){
  if(!enEdicion()) return null;
  const v = vistaAct(), t = tabAct();
  const cuadro = ['sem', 'sems', 'cuadro', 'mes'].indexOf(v) >= 0 && tabEditable(t) && ['licencias', 'pago', 'alertas'].indexOf(S.sub) < 0;
  const bar = h('div', { class: 'cr-edbar', id: 'cr-edbar' }, h('div', { class: 'cr-edh' }, h('b', { t: '✎ Modo edición' }), h('span', { class: 'cr-hint', t: ayudaEdicion(v) })));
  if(S.sub === 'eco') poner(bar, h('a', { class: 'cr-lk', href: '#medicos/eco', t: 'Ir a Médicos › Cronograma Ecografía/Doppler' }));
  if(cuadro){
    if(S.addP) poner(bar, formPersonaCuadro());
    else poner(bar, h('div', { class: 'acts' }, btn('+ Agregar persona al cuadro', 'sm', function(){ S.addP = true; pintar(); }, { id: 'cr-agregar-persona' })));
  }
  if(S.sub === 'licencias' && v === 'lista'){
    if(S.addLP) poner(bar, formLic(null, function(){ S.addLP = false; pintar(); }));
    else poner(bar, h('div', { class: 'acts' }, btn('+ Licencia', 'sm', function(){ S.addLP = true; pintar(); }, { id: 'cr-agregar-licencia' })));
  }
  return bar;
}

/* == cuadro "A confirmar" (arriba de todo) == */
function ambitoPC(){
  const sub = S.sub, tab = subActual().tab;
  if(sub === 'alertas') return { grps: ['tec', 'adm'], tabs: ['tec', 'adm', 'rx', 'tc', 'eco'], g: true, nom: 'todo el módulo' };
  if(sub === 'licencias') return { grps: ['tec', 'adm'], tabs: ['tec', 'adm'], g: true, nom: 'técnicos y administrativos' };
  return { grps: tab === 'tec' ? ['tec'] : tab === 'adm' ? ['adm'] : [], tabs: [tab], g: tab === 'tec', nom: TN[tab] };
}
function itemsPC(){
  const sc = ambitoPC(), C_ = ST.C, M = ST.M, hoy = ST.puente.hoy();
  const grpOk = function(k){ return M.PM[k] && sc.grps.indexOf(M.PM[k].grp) >= 0; };
  const ord = function(a, b){ return a.l.desde.localeCompare(b.l.desde) || a.r.d.localeCompare(b.r.d); };
  const reps = C_.repAll().filter(function(x){ return !x.pasado && x.est !== 'ok' && grpOk(x.l.key); });
  const o = {
    no: reps.filter(function(x){ return x.est === 'no'; }).sort(ord),
    pe: reps.filter(function(x){ return x.est !== 'no'; }).sort(ord),
    sinR: M.L.filter(function(l){ return grpOk(l.key) && C_.lend(l) >= hoy && !l.reemps.length; }).sort(function(a, b){ return a.desde.localeCompare(b.desde); }),
    lp: M.L.filter(function(l){ return l.pend && grpOk(l.key); }).sort(function(a, b){ return a.desde.localeCompare(b.desde); }),
    fp: M.F.filter(function(f){ return f.pend && sc.tabs.indexOf(f.tab) >= 0; }).sort(function(a, b){ return a.tab.localeCompare(b.tab) || nmP(a.key).localeCompare(nmP(b.key), 'es') || a.dia - b.dia; }),
    gp: sc.g ? M.G.filter(function(g){ return g.pend; }).sort(function(a, b){ return a.fecha.localeCompare(b.fecha); }) : []
  };
  o.total = o.no.length + o.pe.length + o.sinR.length + o.lp.length + o.fp.length + o.gp.length;
  o.sc = sc;
  return o;
}
function tarjetaPC(cls, titulo, estado, meta, acts, extra, attr){
  const a = { class: 'cr-cf ' + cls };
  if(attr) Object.keys(attr).forEach(function(k){ a[k] = attr[k]; });
  return h('div', a, h('div', { class: 'cft' }, h('div', null, titulo), estado ? h('span', { class: 'sb2', t: estado }) : null),
    meta ? h('div', { class: 'cfm' }, meta) : null, acts && acts.length ? h('div', { class: 'acts' }, acts) : null, extra || null);
}
function licSinCard(l){
  const edit = puedeEditar(), ab = S.ed['l:' + l.id];
  const acts = edit ? [
    btn('+ Agregar reemplazante', 'sm pri', function(){ S.pcR = S.pcR === l.id ? null : l.id; pintar(); }),
    btn(ab ? 'Cerrar editor' : 'Editar licencia', 'sm', function(){ S.ed['l:' + l.id] = !ab; pintar(); }),
    btn('Ver ficha', 'sm', function(){ openPerson(l.key, null, l.id); }),
    btn('Quitar licencia', 'sm dng', function(){ A.licBaja(l); pintar(); })] : [btn('Ver ficha', 'sm', function(){ openPerson(l.key, null, l.id); })];
  return tarjetaPC('sr', [h('b', { t: nmP(l.key) }), ' · ' + l.tipo], 'sin reemplazo', [fmtC(l.desde) + (l.hasta ? ' al ' + fmtC(l.hasta) : ' · sin fecha de regreso'), l.pend ? [' · ', pendMarca('licencia a confirmar')] : null],
    acts, [edit && S.pcR === l.id ? formReemp(l, function(){ S.pcR = null; pintar(); }) : null, edit && ab ? licFila(l) : null], { 'data-lic-sin': l.id });
}
function licPendCard(l){
  const edit = puedeEditar(), ab = S.ed['l:' + l.id];
  const acts = edit ? [
    btn('✔ Confirmar licencia', 'sm pri', function(){ l.pend = false; l.motivo = ''; A.licCambio(l); pintar(); }),
    btn(ab ? 'Cerrar editor' : 'Editar', 'sm', function(){ S.ed['l:' + l.id] = !ab; pintar(); }),
    btn('Quitar', 'sm dng', function(){ A.licBaja(l); pintar(); })] : [];
  return tarjetaPC('pe', [h('b', { t: nmP(l.key) }), ' · ' + l.tipo], 'licencia a confirmar', [fmtC(l.desde) + (l.hasta ? ' al ' + fmtC(l.hasta) : ' · sin fecha de regreso'), l.motivo ? ' · ' + l.motivo : ''],
    acts, edit && ab ? licFila(l) : null, { 'data-lic-pend': l.id });
}
function franjaPendCard(f){
  const edit = puedeEditar();
  const acts = edit ? [
    btn('✔ Confirmar horario', 'sm pri', function(){ f.pend = false; f.motivo = ''; A.franjaCambio(f); pintar(); }),
    btn('✎ Editar', 'sm', function(ev){ franjaPop(ev, f); }),
    btn('Quitar', 'sm dng', function(){ A.franjaBaja(f); pintar(); })] : [];
  return tarjetaPC('pe', [h('b', { t: nmP(f.key) }), ' · ' + TN[f.tab]], 'horario a confirmar', [resumenFranja(f), f.motivo ? ' · ' + f.motivo : ''], acts, null, { 'data-fr-pend': f.id });
}
function guardiaPendCard(g){
  const edit = puedeEditar();
  const acts = edit ? [
    btn('✔ Confirmar horario', 'sm pri', function(){ g.pend = false; g.motivo = ''; A.guardiaCambio(g); pintar(); }),
    btn('✎ Editar', 'sm', function(){ openPerson(g.key); }),
    btn('Quitar', 'sm dng', function(){ A.guardiaBaja(g); pintar(); })] : [];
  return tarjetaPC('pe', [h('b', { t: nmP(g.key) }), ' · Guardia'], 'guardia a confirmar', DIAS[wdOf(g.fecha)].slice(0, 3) + ' ' + fmtC(g.fecha) + ' · ' + DL[g.t] + ' ' + TURN[g.t][0] + '–' + TURN[g.t][1] + (g.motivo ? ' · ' + g.motivo : ''), acts, null, { 'data-g-pend': g.id });
}
function renderPorConfirmar(){
  const it = itemsPC(), n = it.total, sec = function(t, cls){ return h('div', { class: 'cr-pc-h' + (cls ? ' ' + cls : ''), t: t }); };
  const det = h('details', { class: 'cr-pc', id: 'cr-porconf', open: S.pcAbierto, on: { toggle: function(ev){ S.pcAbierto = ev.target.open; } } },
    h('summary', null, h('b', { t: 'A confirmar' }), h('span', { class: 'cr-pcn' + (n ? '' : ' z'), t: String(n) }), h('small', { t: ' · ' + it.sc.nom })));
  const body = h('div', { class: 'cr-pc-b' });
  if(!n) poner(body, h('div', { class: 'cr-hint', t: 'Nada pendiente ✔' }));
  if(it.no.length) poner(body, sec('No pueden: hay que buscar otro (' + it.no.length + ')', 'cr-w'), it.no.map(function(x){ return repCard(x); }));
  if(it.pe.length) poner(body, sec('Reemplazos a confirmar (' + it.pe.length + ')'), it.pe.map(function(x){ return repCard(x); }));
  if(it.sinR.length) poner(body, sec('Licencias sin reemplazo (' + it.sinR.length + ')', 'cr-w'), it.sinR.map(licSinCard));
  if(it.lp.length) poner(body, sec('Licencias a confirmar (' + it.lp.length + ')'), it.lp.map(licPendCard));
  if(it.fp.length || it.gp.length) poner(body, sec('Horarios a confirmar (' + (it.fp.length + it.gp.length) + ')'), it.fp.map(franjaPendCard), it.gp.map(guardiaPendCard));
  poner(det, body);
  return det;
}
/* editor completo de un reemplazo: quién, horas, período, nota y día por día */
function repEditor(l, r){
  const chg = function(){ A.repCambio(l, r); pintar(); };
  const nom = h('input', { type: 'text', value: r.nombre || '', maxlength: '120', placeholder: 'Nombre del reemplazante', hidden: !!r.key, 'aria-label': 'Nombre del reemplazante externo', on: { change: function(ev){
    const v = ev.target.value.trim().slice(0, 120);
    if(!v) return;
    r.key = ''; r.nombre = v; r.est = ''; chg();
  } } });
  const op = opcionesReemp(l, '').filter(function(o){ return o[0] !== ''; });
  if(r.key && !op.some(function(o){ return o[0] === r.key; })) op.unshift([r.key, nmP(r.key)]);
  const sel = selec(op, r.key || '__ext', function(v){
    if(v === '__ext'){ nom.hidden = false; nom.focus(); return; }
    r.key = v; r.nombre = ''; r.est = ''; chg();
  });
  sel.setAttribute('aria-label', 'Reemplazante');
  return h('div', { class: 'cr-eded', 'data-editor': r.id }, h('b', { t: 'Editar reemplazo' }),
    h('div', { class: 'cr-fr1' }, campo('Reemplazante', sel), nom),
    h('div', { class: 'cr-fr1' },
      campo('Hora desde', entrada('time', r.d, function(v, el){ if(!horaOk(v, r.h)){ el.value = r.d; return; } r.d = v; chg(); }, { 'aria-label': 'Reemplazo desde' })),
      campo('Hora hasta', entrada('time', r.h, function(v, el){ if(!horaOk(r.d, v)){ el.value = r.h; return; } r.h = v; chg(); }, { 'aria-label': 'Reemplazo hasta' }))),
    h('div', { class: 'cr-fr1' },
      campo('Cubre desde (vacío = desde el inicio)', entrada('date', r.desde, function(v, el){ if(v && r.hasta && v > r.hasta){ el.value = r.desde; return; } r.desde = v; chg(); }, { 'aria-label': 'Cubre desde' })),
      campo('Cubre hasta (vacío = hasta el final)', entrada('date', r.hasta, function(v, el){ if(v && r.desde && v < r.desde){ el.value = r.hasta; return; } r.hasta = v; chg(); }, { 'aria-label': 'Cubre hasta' }))),
    entrada('text', r.nota, function(v){ r.nota = v.slice(0, 200); chg(); }, { class: 'n', placeholder: 'Nota: con quién hablaste y cuándo', maxlength: '200', 'aria-label': 'Nota del reemplazo (editor)' }),
    diasEditor(l, r));
}

/* == utilidades de vista == */
const TN = { tec: 'Técnicos', adm: 'Administrativos', rx: 'Radiografías', tc: 'Tomografía', eco: 'Eco/Doppler', lic: 'Licencias', todo: 'Todo' };
const GN = { med: 'Informante', tec: 'Técnico', adm: 'Administrativo', res: 'Residentes' };
function subActual(){ return SUBS.find(function(x){ return x.k === S.sub; }) || SUBS[0]; }
function tabAct(){ const t = subActual().tab; return t === 'lic' || t === 'todo' ? 'tec' : t; }
function vistaAct(){ return S.vistas[S.sub] || VISTAS[S.sub][0][0]; }
function setVista(v){ S.vistas[S.sub] = v; pintar(); }
function nmP(k){ const p = ST.M.PM[k]; return p ? ST.C.nm(p) : '?'; }
function apP(k){ const p = ST.M.PM[k]; return p ? p.ap : '?'; }
function hue(k){
  if(k === 'res') return 90;
  if(!ST.R.hueMap){ ST.R.hueMap = {}; ST.M.P.forEach(function(p, i){ ST.R.hueMap[p.key] = PAL[i % PAL.length]; }); }
  return ST.R.hueMap[k] === undefined ? 200 : ST.R.hueMap[k];
}
function thLic(t){
  const i = TIPOS_LIC.indexOf(t);
  return TH_BASE[(i < 0 ? TIPOS_LIC.length : i) % TH_BASE.length];
}
function iniciales(p){ return (p.ap[0] || '?') + (p.nom ? p.nom[0] : ''); }
function esAngosto(){ return ST.R.angosto === true; }
function medirAngosto(){
  const w = (ST.R.main && ST.R.main.clientWidth) || (ST.el && ST.el.clientWidth) || window.innerWidth;
  ST.R.ancho = w;
  ST.R.angosto = w < 700;
}
function nota(txt){ return h('div', { class: 'cr-note', t: txt }); }
function pill(txt, cls){ return h('span', { class: 'cr-pill' + (cls ? ' ' + cls : ''), t: txt }); }
function pendMarca(txt){ return h('span', { class: 'cr-apend', t: txt || 'a confirmar' }); }
function hrsDe(list){ return sumi(uni(list.map(function(f){ return [mins(f.d), mins(f.h)]; }))); }
function dhx(x){ return fmtH(x / 60); }
function limpiarPop(){ const e = document.getElementById('cr-pop'); if(e) e.remove(); S.pop = null; }

/* == grilla horaria == */
function layoutCol(list){
  const Lm = {}, s = list.slice().sort(function(a, b){ return mins(a.d) - mins(b.d) || mins(a.h) - mins(b.h); });
  let cl = [], ends = [];
  const fin = function(){ cl.forEach(function(a){ Lm[a.uid].n = ends.length; }); cl = []; ends = []; };
  s.forEach(function(a){
    const st = mins(a.d), en = mins(a.h) <= mins(a.d) ? 1440 : mins(a.h);
    if(cl.length && ends.every(function(e){ return e <= st; })) fin();
    let c = ends.findIndex(function(e){ return e <= st; });
    if(c < 0){ c = ends.length; ends.push(0); }
    ends[c] = en; Lm[a.uid] = { c: c, n: 1 }; cl.push(a);
  });
  fin();
  return Lm;
}
function laneDe(i){
  if(i.lane) return i.lane;
  const PM = ST.M.PM;
  return i.k && PM[i.k] ? PM[i.k].grp : (PM[i['for']] ? PM[i['for']].grp : ST.C.grpDeTab(tabAct()));
}
function itemInfo(i){
  const C_ = ST.C, PM = ST.M.PM;
  let lab, sub = '', cls = '', click;
  if(i.eco){ return { lab: i.lab, sub: i.sub, cls: i.cls || '', click: function(){ openEco(i); } }; }
  const box = i.lane === 'box1' ? 'BOX 1' : i.lane === 'box2' ? 'BOX 2' : i.lane === 'sin' ? 'SOPORTE ADMINISTRATIVO' : '';
  if(i.rotTipo){ return { lab: 'Sábado', sub: 'rota: 1 persona por sábado', cls: 'rot', box: box, click: function(){ const e = document.getElementById('cr-rotsab'); if(e && e.scrollIntoView) e.scrollIntoView({ block: 'center' }); } }; }
  if(i.kind === 'rep'){
    lab = C_.rshort(i.r);
    sub = 'reemp. a ' + PM[i['for']].ap + (C_.repEst(i.r) !== 'ok' ? ' · a confirmar' : '');
    cls = 'rep';
    click = i.k ? function(){ openPerson(i.k); } : function(){ openPerson(i['for'], null, i.l.id); };
  } else if(i.kind === 'lic'){
    lab = PM[i.k].ap; sub = i.l.tipo + (i.f && i.f.g ? ' · ' + TURN[i.f.t][2] : '') + (i.l.pend ? ' · a confirmar' : ''); cls = 'lic';
    click = function(){ openPerson(i.k, i.f.id); };
  } else {
    const f = i.f;
    lab = PM[i.k].ap;
    if(f.pend) sub = 'Horario a confirmar' + (f.sem ? ' · Sáb ' + f.sem : '');
    else if(C_.esOfi(i.k)) sub = OFICINA;
    else if(f.g) sub = TURN[f.t][2] + (f.pend ? ' · a confirmar' : '');
    else if(f.xt) sub = 'Turno extra';
    else sub = (f.sec ? SEC[f.sec] || f.sec : '') + (f.turno && TURN[f.turno] ? (f.sec ? ' · ' : '') + TURN[f.turno][2] : '') + (f.sem ? ' · Sáb ' + f.sem : '');
    if(f.rot) sub = 'Sábado rotativo';
    if(f.corta) sub += (sub ? ' · ' : '') + 'sale ' + minT(mins(f.h)) + ' (' + (f.corta % 60 ? f.corta + ' min' : (f.corta / 60) + ' h') + ' antes)';
    if(f.sup) sub = 'Cubre salida de ' + apP(f.sup);
    const fo = f.orig || f;
    click = function(ev){ if(enEdicion() && esFranjaEditable(fo)) franjaPop(ev, fo); else openPerson(i.k, f.rot ? null : f.id); };
  }
  return { lab: lab, sub: sub, cls: cls, click: click, box: box };
}
function listDays(days, nombreTab){
  const any = days.some(function(d){ return d.items.length || d.strip.length || d.jefa; });
  const out = h('div', null, any ? null : nota('Sin agendas cargadas en ' + nombreTab + (S.pf ? ' para esta persona' : '') + '.'));
  days.forEach(function(d){
    const its = d.items.slice().sort(function(a, b){ return mins(a.d) - mins(b.d); });
    const box = h('div', { class: 'cr-ld' + (d.today ? ' today' : '') }, h('div', { class: 'cr-lt' + (d.we ? ' we' : ''), t: d.lab }));
    if(d.jefa) poner(box, h('div', { class: 'cr-li jf' }, h('span', { class: 'tt', t: d.jefa[0] + '–' + d.jefa[1] }), h('b', { t: 'Jefa de residentes' }), h('small', { t: ST.R.jefaNom })));
    d.strip.forEach(function(sx){
      poner(box, h('div', { class: 'cr-li lic', on: { click: function(){ openPerson(sx.k, null, sx.l.id); } } }, h('b', { t: apP(sx.k) }), h('span', { t: sx.l.tipo })));
    });
    its.forEach(function(i){
      const x = itemInfo(i);
      poner(box, h('div', { class: 'cr-li ' + x.cls, s: { '--h': hue(i.k || i['for']) }, on: { click: x.click } },
        h('span', { class: 'tt', t: i.d + '–' + i.h }), h('b', { t: x.lab }), (x.box || x.sub) ? h('small', { t: (x.box ? x.box + (x.sub ? ' · ' : '') : '') + (x.sub || '').replace(/^ · /, '') }) : null));
    });
    if(!its.length && !d.strip.length && !d.jefa) poner(box, h('div', { class: 'cr-hint', t: '—' }));
    poner(out, box);
  });
  return out;
}
function timeGrid(days, o){
  o = o || {};
  const nombreTab = o.nombreTab || TN[tabAct()];
  if(esAngosto()) return listDays(days, nombreTab);
  let t0 = 480, t1 = 1020;
  days.forEach(function(d){
    d.items.forEach(function(i, ix){
      i.uid = ix;
      const a = mins(i.d), b = mins(i.h) <= a ? 1440 : mins(i.h);
      t0 = Math.min(t0, Math.floor(a / 60) * 60); t1 = Math.max(t1, Math.ceil(b / 60) * 60);
    });
  });
  const PX = o.px || ((t1 - t0) > 720 ? 0.75 : 1.1), H = (t1 - t0) * PX;
  const lanes = o.lanes || (S.pf && ST.M.PM[S.pf] ? [ST.M.PM[S.pf].grp] : [ST.C.grpDeTab(tabAct())]);
  const laneLab = o.laneLab || { med: 'Inf.', tec: 'Téc.', adm: 'Adm.', res: 'Res.' };
  const any = days.some(function(d){ return d.items.length || d.strip.length; });
  const lanesDe = o.lanesDe || function(){ return lanes; };
  const gs = { '--px': PX, '--n': days.length };
  if(o.lanesDe) gs['grid-template-columns'] = '42px ' + days.map(function(d){ return 'minmax(0,' + lanesDe(d).reduce(function(s, l){ return s + (o.laneW[l] || 1); }, 0) + 'fr)'; }).join(' ');
  const g = h('div', { class: 'cr-grid', s: gs }, h('div'));
  days.forEach(function(d){
    const np = new Set(d.items.filter(function(i){ return i.kind !== 'rep'; }).map(function(i){ return i.k; })).size;
    const col = h('div', null,
      h('div', { class: 'cr-dh' + (d.we ? ' we' : '') + (d.today ? ' today' : '') }, d.lab, h('small', { t: d.sub !== undefined ? d.sub : (np ? np + ' persona' + (np === 1 ? '' : 's') : '—') })));
    if(d.jefa) poner(col, h('div', { class: 'cr-jf', title: 'Jefa de residentes' }, h('b', { t: 'Jefa de residentes' }), ST.R.jefaNom + ' · ' + d.jefa[0] + '–' + d.jefa[1]));
    if(d.strip.length){
      poner(col, h('div', { class: 'cr-strip' }, d.strip.map(function(s){
        return h('span', { class: 'cr-sc', title: nmP(s.k) + ' · ' + s.l.tipo, on: { click: function(){ openPerson(s.k, null, s.l.id); } }, t: apP(s.k) + ' · ' + s.l.tipo.slice(0, 4) + '.' });
      })));
    }
    if(lanes.length > 1) poner(col, h('div', { class: 'cr-lh' }, lanesDe(d).map(function(l){ return h('span', { class: 'lh ' + l, t: laneLab[l] || l }); })));
    poner(g, col);
  });
  const axis = h('div', { class: 'cr-axis', s: { height: H + 'px' } });
  for(let x = t0; x <= t1; x += 60) poner(axis, h('span', { s: { top: ((x - t0) * PX) + 'px' }, t: hhmm(x) }));
  poner(g, axis);
  days.forEach(function(d){
    const day = h('div', { class: 'cr-day' + (d.today ? ' today' : ''), s: { height: H + 'px' }, 'data-dia': String(days.indexOf(d)) });
    if(d.jefa) poner(day, h('div', { class: 'cr-jband', title: 'Jefa de residentes ' + d.jefa[0] + '–' + d.jefa[1], s: { top: ((mins(d.jefa[0]) - t0) * PX) + 'px', height: ((mins(d.jefa[1]) - mins(d.jefa[0])) * PX) + 'px' } }));
    lanesDe(d).forEach(function(l){
      const li = d.items.filter(function(i){ return laneDe(i) === l; }), Lm = layoutCol(li), lane = h('div', { class: 'cr-lane ' + l });
      li.forEach(function(i){
        const gg = Lm[i.uid], w = 100 / gg.n, a = mins(i.d), b = mins(i.h) <= a ? 1440 : mins(i.h), x = itemInfo(i);
        const fmv = i.kind === 'w' && i.f && !i.f.rot && !i.f.sup && !i.f.g && !i.f.xt && enEdicion() && tabEditable(tabAct()) && esFranjaEditable(i.f.orig || i.f) ? (i.f.orig || i.f) : null;
        const vt = !!o.corto;
        const blk = h('div', { class: 'cr-blk ' + x.cls + (vt ? ' v' : '') + (i.over ? ' over' : '') + (fmv ? ' drag' : '') + (i.kind === 'w' && S.hl === (i.f && i.f.id) ? ' sel' : ''), tabindex: '0', role: 'button',
          s: { top: ((a - t0) * PX) + 'px', height: ((b - a) * PX) + 'px', left: (gg.c * w) + '%', width: 'calc(' + w + '% - 2px)', '--h': hue(i.k || i['for']) },
          title: x.lab + ' ' + i.d + '–' + i.h + (x.sub ? ' · ' + x.sub : '') + (i.over ? ' · supera los 2 lugares de atención' : ''), on: { click: function(ev){ if(blk.__movido){ blk.__movido = false; return; } x.click(ev); }, keydown: function(ev){ if(fmv && ev.altKey && moverFranjaTecla(ev, fmv)) return; if(ev.key === 'Enter') x.click(ev); } } },
          vt ? h('div', { class: 'vt', s: { '--n1': String(Math.max(2, String(x.lab).length)), '--n2': String(Math.max(2, tCorto(i.d, i.h).length)) } }, h('b', { t: x.lab }), h('small', { class: 'tm', t: tCorto(i.d, i.h) }), x.sub ? h('small', { class: 'nm' + (x.sub === 'Sin asignar' ? ' none' : ''), t: x.sub }) : null)
            : [h('b', { t: x.lab }), h('small', { t: i.d + '–' + i.h }), x.sub ? h('small', { class: 'nm' + (x.sub === 'Sin asignar' ? ' none' : ''), t: x.sub }) : null]);
        if(fmv) blk.addEventListener('pointerdown', function(ev){ arrastrarFranja(ev, blk, fmv, PX, g); });
        poner(lane, blk);
      });
      poner(day, lane);
    });
    poner(g, day);
  });
  return h('div', null, any ? null : nota('Sin agendas cargadas en ' + nombreTab + (S.pf ? ' para esta persona' : '') + '.'),
    enEdicion() && tabEditable(tabAct()) ? nota('Modo edición: arrastrá un cuadro para moverlo de hora o de día (de a 15 min), o tocalo para editarlo. Con el cuadro seleccionado: Alt + flechas. Cambia el horario fijo de esa persona (todas las semanas) y queda en el borrador hasta que lo guardes. Los sábados rotativos y los cambios automáticos (salida anticipada) no se arrastran.') : null, g);
}
/* == mover cuadros con el mouse / teclado (modo edición) == */
function moverFranja(fo, dia, dMin){
  const a = mins(fo.d), b = mins(fo.h);
  if(b <= a) return false;
  let na = a + dMin, nb = b + dMin;
  if(na < 0){ nb -= na; na = 0; }
  if(nb > 1440){ na -= nb - 1440; nb = 1440; }
  if(na === a && dia === fo.dia) return false;
  fo.d = minT(na); fo.h = nb === 1440 ? '23:59' : minT(nb); fo.dia = dia;
  A.franjaCambio(fo);
  ST.puente.aviso('Movido: ' + nmP(fo.key) + ' → ' + DIAS[dia] + ' ' + fo.d + '–' + fo.h + ' (sin guardar: revisalo en el borrador).');
  pintar();
  return true;
}
function moverFranjaTecla(ev, fo){
  const k = ev.key, dm = k === 'ArrowUp' ? -15 : k === 'ArrowDown' ? 15 : 0, dd = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
  if(!dm && !dd) return false;
  const nd = fo.dia + dd, tope = S.we ? 6 : 4;
  ev.preventDefault();
  moverFranja(fo, nd < 0 ? 0 : nd > tope ? tope : nd, dm);
  return true;
}
function arrastrarFranja(ev, blk, fo, PX, grid){
  if(ev.button !== undefined && ev.button !== 0) return;
  const x0 = ev.clientX, y0 = ev.clientY;
  let mov = false;
  const dias = function(){ return Array.prototype.slice.call(grid.querySelectorAll('.cr-day[data-dia]')); };
  const diaEn = function(x){
    const ds = dias();
    for(let n = 0; n < ds.length; n++){ const r = ds[n].getBoundingClientRect(); if(x >= r.left && x <= r.right) return +ds[n].getAttribute('data-dia'); }
    return x < ds[0].getBoundingClientRect().left ? +ds[0].getAttribute('data-dia') : +ds[ds.length - 1].getAttribute('data-dia');
  };
  const paso = function(e){ return Math.round((e.clientY - y0) / PX / 15) * 15; };
  const move = function(e){
    if(!mov && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < 5) return;
    if(!mov){ mov = true; blk.classList.add('dragging'); }
    e.preventDefault();
    blk.style.transform = 'translate(' + (e.clientX - x0) + 'px,' + (paso(e) * PX) + 'px)';
    const a = Math.max(0, Math.min(mins(fo.d) + paso(e), 1440 - (mins(fo.h) - mins(fo.d))));
    blk.title = DIAS[diaEn(e.clientX)] + ' ' + minT(a) + '–' + minT(a + mins(fo.h) - mins(fo.d));
  };
  const fin = function(e){
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin);
    if(!mov) return;
    blk.classList.remove('dragging'); blk.style.transform = '';
    blk.__movido = true;
    setTimeout(function(){ blk.__movido = false; }, 0);
    if(e.type === 'pointercancel') return;
    if(!moverFranja(fo, diaEn(e.clientX), paso(e))) return;
  };
  window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin);
}
/* == BOX 1 / BOX 2 (administrativos) == */
function tCorto(a, b){
  const f = function(x){ return x.slice(-3) === ':00' ? String(+x.slice(0, 2)) : x.replace(/^0/, ''); };
  return f(a) + '–' + f(b);
}
/* Cada día, los 2 lugares de atención se llenan por horario (primero en llegar = BOX 1). Un 3.º superpuesto queda en la columna roja SOPORTE ADMINISTRATIVO. La oficina propia no ocupa box. */
function asignarBoxes(items){
  const C_ = ST.C, PM = ST.M.PM;
  const nr = function(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
  const persona = function(i){ const p = i.k && PM[i.k]; return p ? nr(p.ap) + '|' + nr(p.nom) : ''; };
  const esJoel = function(i){ return persona(i) === nr(SOPORTE_FIJO.ap) + '|' + nr(SOPORTE_FIJO.nom); };
  const fijoDe = function(i){ const k = persona(i), f = k && BOX_FIJO.find(function(x){ return nr(x.ap) + '|' + nr(x.nom) === k; }); return f ? f.box : null; };
  /* idempotente: se deshace lo que una pasada anterior partió */
  for(let n = items.length - 1; n >= 0; n--){ if(items[n].parte) items.splice(n, 1); }
  const ws = items.filter(function(i){ return i.kind === 'w' || i.kind === 'rep'; });
  ws.forEach(function(i){ if(i.d0 !== undefined){ i.d = i.d0; i.h = i.h0; } else { i.d0 = i.d; i.h0 = i.h; } delete i.lane; delete i.over; });
  const rg = function(i){ const a = mins(i.d), b = mins(i.h) <= a ? 1440 : mins(i.h); return [a, b]; };
  const trozos = [];
  ws.forEach(function(i){
    if(i.k && C_.esOfi(i.k)){ i.lane = 'ofi'; return; }
    if(i.rotTipo){ i.lane = 'box1'; return; }
    const f = fijoDe(i);
    if(f){ const r = rg(i); trozos.push({ i: i, a: r[0], b: r[1], lane: f }); }
  });
  /* Joel y Mónica: BOX 1; Zamira y Joaquín: BOX 2. Si dos se superponen en el mismo box, el tramo superpuesto de uno pasa a SOPORTE ADMINISTRATIVO (siempre Joel; si no, el que llegó después) */
  ['box1', 'box2'].forEach(function(L){
    for(let vuelta = 0; vuelta < 50; vuelta++){
      const ts = trozos.filter(function(t){ return t.lane === L; }).sort(function(x, y){ return x.a - y.a || y.b - x.b; });
      let par = null;
      for(let m = 0; m < ts.length && !par; m++) for(let n = m + 1; n < ts.length; n++){ if(ts[n].a < ts[m].b){ par = [ts[m], ts[n]]; break; } }
      if(!par) break;
      const perd = esJoel(par[0].i) ? par[0] : par[1], gan = perd === par[0] ? par[1] : par[0];
      const ca = Math.max(perd.a, gan.a), cb = Math.min(perd.b, gan.b), pa = perd.a, pb = perd.b;
      perd.a = ca; perd.b = cb; perd.lane = 'sin';
      if(pa < ca) trozos.push({ i: perd.i, a: pa, b: ca, lane: L });
      if(cb < pb) trozos.push({ i: perd.i, a: cb, b: pb, lane: L });
    }
  });
  /* el resto de las personas (sin box fijo): primer lugar libre; si no hay, soporte */
  const libre = function(L, a, b){ return !trozos.some(function(t){ return t.lane === L && t.a < b && t.b > a; }); };
  ws.filter(function(i){ return !i.lane && !fijoDe(i); }).sort(function(x, y){ const rx = rg(x), ry = rg(y); return rx[0] - ry[0] || ry[1] - rx[1]; }).forEach(function(i){
    const r = rg(i), L = libre('box1', r[0], r[1]) ? 'box1' : libre('box2', r[0], r[1]) ? 'box2' : 'sin';
    if(L === 'sin'){ i.lane = 'sin'; i.over = true; return; }
    i.lane = L; trozos.push({ i: null, a: r[0], b: r[1], lane: L });
  });
  /* aplicar los tramos: el primero queda en el cuadro original; los demás son cuadros nuevos */
  const orden = {};
  trozos.filter(function(t){ return t.i; }).forEach(function(t){ const k = ws.indexOf(t.i); (orden[k] = orden[k] || []).push(t); });
  Object.keys(orden).forEach(function(k){
    const ps = orden[k].sort(function(x, y){ return x.a - y.a; }), i = ws[+k], r = rg(i);
    ps.forEach(function(t, n){
      const dd = t.a === r[0] ? i.d0 : minT(t.a), hh = t.b === r[1] ? i.h0 : minT(t.b), ov = t.lane === 'sin';
      if(n === 0){ i.d = dd; i.h = hh; i.lane = t.lane; if(ov) i.over = true; }
      else { const c = Object.assign({}, i, { d: dd, h: hh, lane: t.lane, parte: true }); if(ov) c.over = true; else delete c.over; items.push(c); }
    });
  });
}
const LANE_W = { box1: 1, box2: 1, sin: 1.6, ofi: 0.5 };
/* columnas de un día: siempre BOX 1 y BOX 2; SIN BOX y la oficina propia solo si ese día las usa */
function lanesAdm(d){
  const tiene = function(l){ return d.items.some(function(i){ return i.lane === l; }); };
  return ['box1', 'box2'].concat(tiene('sin') ? ['sin'] : []).concat(tiene('ofi') ? ['ofi'] : []);
}
function admGrid(days){
  days.forEach(function(d){ asignarBoxes(d.items); });
  return { nombreTab: TN.adm, lanes: ['box1', 'box2'], lanesDe: lanesAdm, laneW: LANE_W, laneLab: { box1: 'BOX 1', box2: 'BOX 2', sin: 'SOPORTE ADMINISTRATIVO', ofi: 'Of.' }, px: 0.95, corto: true };
}
function rotNota(x){
  if(x.fer || !(x.sale || x.saleA)) return '—';
  const f = 'Lun ' + fmtC(addD(x.sat, 2)) + ' a Jue ' + fmtC(addD(x.sat, 5));
  return f + (x.saleA ? ' · sale ' + x.saleA + (x.suple ? ' · ' + apP(x.suple.key) + ' ' + tCorto(x.suple.d, x.suple.h) + ' h' : '') : ' · sale ' + (x.sale % 60 ? x.sale + ' min' : x.sale / 60 + ' h') + ' antes');
}
function renderRotSab(){
  const C_ = ST.C, hoy = ST.puente.hoy(), L = C_.rotLista(hoy, 8);
  if(!C_.rotOrden.length) return null;
  const box = h('div', { class: 'cr-card cr-rotsab', id: 'cr-rotsab' }, h('h3', { t: 'Rotación de sábados' }));
  if(!L.length){ poner(box, h('div', { class: 'cr-hint', t: 'Sin rotación definida.' })); return box; }
  poner(box, h('div', { class: 'cr-hint', t: 'Cada persona hace 1 sábado por ciclo. Semana siguiente (lun a jue): Joaquín y Joel salen 1 h antes; Zamira sale a las 12 h y Joaquín cubre de 12 a 18 h; Mónica no compensa.' }));
  const ul = h('div', { class: 'cr-rotl' });
  L.forEach(function(x){
    poner(ul, h('div', { class: 'cr-roti' + (x.fer ? ' fer' : '') },
      h('div', { class: 'r1' }, h('b', { t: fmtC(x.sat) }), h('span', { class: 'q', t: nmP(x.key) }), h('span', { class: 'hr', t: x.fer ? 'feriado' : tCorto(x.d, x.h) + ' h' })),
      h('div', { class: 'r2', t: rotNota(x) })));
  });
  poner(box, ul);
  return box;
}

function diaItems(t, dia){
  const C_ = ST.C, hoy = ST.puente.hoy();
  const items = ST.M.F.filter(function(f){ return f.tab === t && f.dia === dia && (!S.pf || f.key === S.pf); })
    .map(function(f){ return { kind: 'w', f: f, k: f.key, d: f.d, h: f.h }; });
  if(t === 'adm' && dia === 5 && C_.rotOrden.length){
    /* los sábados no son fijos: rotan entre varias personas (ver tarjeta Rotación de sábados) */
    const quita = items.filter(function(x){ return C_.rotOf(x.k); });
    quita.forEach(function(x){ items.splice(items.indexOf(x), 1); });
    const ds = C_.rotOrden.map(function(r){ return mins(r.d); }), hs = C_.rotOrden.map(function(r){ return mins(r.h); });
    items.push({ kind: 'w', rotTipo: true, k: null, d: minT(Math.min.apply(null, ds)), h: minT(Math.max.apply(null, hs)) });
  }
  return { items: items, strip: [] };
}
function jefaDe(dia, d){
  if(tabAct() !== 'eco' || (S.pf && S.pf !== 'res') || (d && ST.M.FER[d])) return null;
  const j = ST.M.cfg.jefa;
  if(!j || !j.b) return null;
  return j.b[DIAS[dia]] || null;
}
function renderSem(){
  const t = tabAct(), days = DIAS.slice(0, S.we ? 7 : 5).map(function(nom, dia){
    return Object.assign({ lab: nom, we: dia >= 5, jefa: jefaDe(dia) }, t === 'eco' ? ecoDia(dia) : diaItems(t, dia));
  });
  const o = h('div');
  if(t === 'adm') poner(o, nota('Semana tipo junta todo lo cargado de lunes a viernes. Boxes: Joel y Mónica en BOX 1; Zamira y Joaquín en BOX 2. Si Joel y Mónica coinciden, el tramo superpuesto de Joel pasa a SOPORTE ADMINISTRATIVO. El horario real de cada día está en “Semanas del mes”.'));
  if(t === 'tec') poner(o, nota('Semana tipo = lo que se repite siempre. Las guardias de 12 h (noches y fines de semana) se asignan por fecha cada mes: miralas en “Diagrama del mes”, “Semanas del mes” o “Mes”. Los sábados alternan entre Sábado 1 y Sábado 2.'));
  if(t === 'adm' && days.length === 7 && !days[6].items.length) days.pop();
  poner(o, timeGrid(days, t === 'eco' ? ecoOpts() : t === 'adm' ? admGrid(days) : null));
  return o;
}
function renderSems(){
  ensureWk();
  const t = tabAct(), n = S.we ? 7 : 5, days = [], hoy = ST.puente.hoy();
  for(let i = 0; i < n; i++){
    const d = addD(S.wk, i), dt = new Date(d + 'T12:00:00'), dd = ST.C.dayData(t, d, S.pf);
    days.push(Object.assign({ lab: DIAS[i].slice(0, 3) + ' ' + dt.getDate() + '/' + (dt.getMonth() + 1), we: i >= 5 || (!!ST.M.FER[d] && t === 'tec'), today: d === hoy }, ST.M.FER[d] ? { sub: 'Feriado' } : {}, dd));
  }
  if(t === 'adm' && days.length === 7 && !days[6].items.length) days.pop();
  return timeGrid(days, t === 'adm' ? admGrid(days) : null);
}
function ensureWk(){
  const ws = weeksOf(S.y, S.m);
  if(!S.wk || ws.indexOf(S.wk) < 0){ const tw = mondayOf(ST.puente.hoy()); S.wk = ws.indexOf(tw) >= 0 ? tw : ws[0]; }
}
function listaPers(t){
  if(t === 'eco') return ecoPersonas();
  return ST.C.people(t === 'lic' ? 'tec' : t);
}
function renderCuadro(){
  const t = tabAct(), days = DIAS.slice(0, S.we ? 7 : 5), ps = listaPers(t).filter(function(p){ return !S.pf || p.key === S.pf; });
  const own = function(p){ return ST.M.F.filter(function(f){ return f.key === p.key && f.tab === t && !(t === 'adm' && f.dia === 5 && ST.C.rotOf(p.key)); }); };
  const rotTxt = function(p){ const r = t === 'adm' && ST.C.rotOrden.find(function(x){ return x.key === p.key; }); return r ? r : null; };
  const ed = enEdicion() && tabEditable(t);
  const franjaTxt = function(f){ return f.d + '–' + f.h + (f.sec ? ' ' + (SEC[f.sec] || f.sec) : '') + (f.guardia ? ' guardia' : '') + (f.pend ? ' (a confirmar)' : ''); };
  if(esAngosto()){
    return h('div', null, ps.map(function(p){
      const o = own(p);
      return h('div', { class: 'cr-ld' },
        h('div', { class: 'cr-lt', s: { cursor: 'pointer' }, on: { click: function(){ openPerson(p.key); } } }, ST.C.nm(p), h('small', { t: o.length ? dhx(hrsDe(o.filter(function(f){ return f.dia < days.length; }))) + ' / sem' : 'sin agenda' })),
        ed ? h('div', { class: 'acts' }, btn('+ Franja', 'sm', function(ev){ franjaNueva(ev, p, 0, t); }, { 'aria-label': 'Agregar franja a ' + ST.C.nm(p) }),
          o.length ? btn('Quitar del cuadro', 'sm dng', function(){ quitarDelCuadro(p, t); }, { 'aria-label': 'Quitar a ' + ST.C.nm(p) + ' del cuadro' }) : null) : null,
        days.map(function(nom, di){
          const fs = o.filter(function(f){ return f.dia === di; }).sort(function(a, b){ return mins(a.d) - mins(b.d); });
          if(ed) return fs.map(function(f){
            return h('div', { class: 'cr-li', role: 'button', tabindex: '0', s: { '--h': hue(p.key) }, on: { click: function(ev){ franjaPop(ev, f); }, keydown: function(ev){ if(ev.key === 'Enter') franjaPop(ev, f); } } },
              h('span', { class: 'tt', t: nom.slice(0, 3) }), h('b', { t: franjaTxt(f) }));
          });
          return fs.length ? h('div', { class: 'cr-li', s: { '--h': hue(p.key) }, on: { click: function(){ openPerson(p.key, fs[0].id); } } }, h('span', { class: 'tt', t: nom.slice(0, 3) }),
            h('b', { t: fs.map(franjaTxt).join(' · ') })) : null;
        }));
    }));
  }
  const tb = h('table', { class: 'cr-tbl' }, h('tr', null, h('th', { t: 'Persona' }), days.map(function(d){ return h('th', { t: d.slice(0, 3) }); }), h('th', { t: 'Horas/sem' })));
  ps.forEach(function(p){
    const o = own(p), tr = h('tr', { 'data-cuadro': p.key }, h('td', { class: 'p', s: { cursor: 'pointer' }, on: { click: function(){ openPerson(p.key); } } },
      h('i', { class: 'cr-sq', s: { background: 'hsl(' + hue(p.key) + ' 75% 62%)' } }), ST.C.nm(p),
      ed && o.length ? h('div', null, btn('✕ Quitar del cuadro', 'sm dng', function(ev){ ev.stopPropagation(); quitarDelCuadro(p, t); }, { 'aria-label': 'Quitar a ' + ST.C.nm(p) + ' del cuadro' })) : null));
    days.forEach(function(d, di){
      const fs = o.filter(function(f){ return f.dia === di; }).sort(function(a, b){ return mins(a.d) - mins(b.d); });
      let spans = fs.length ? fs.map(function(f){
        const sp = h('span', { class: 'cr-tm' + (ed ? ' ed' : '') }, f.d + '–' + f.h, f.sec ? [' ', h('small', { t: SEC[f.sec] || f.sec })] : null, f.sem ? [' ', h('small', { t: 'Sáb ' + f.sem })] : null,
          f.turno && TURN[f.turno] ? [' ', h('small', { t: TURN[f.turno][2] })] : null, f.guardia ? [' ', h('small', { t: 'guardia' })] : null, f.pend ? [' ', pendMarca()] : null);
        if(ed){
          sp.setAttribute('role', 'button'); sp.tabIndex = 0;
          sp.setAttribute('aria-label', 'Editar franja de ' + ST.C.nm(p) + ' ' + d + ' ' + f.d + ' a ' + f.h);
          sp.addEventListener('click', function(ev){ franjaPop(ev, f); });
          sp.addEventListener('keydown', function(ev){ if(ev.key === 'Enter') franjaPop(ev, f); });
        }
        return sp;
      }) : h('span', { class: 'cr-hint', t: '—' });
      const rt = di === 5 && rotTxt(p);
      if(rt) spans = h('span', { class: 'cr-tm' }, tCorto(rt.d, rt.h), [' ', h('small', { t: 'rota' })]);
      poner(tr, h('td', { class: 'c', on: ed ? null : { click: function(){ openPerson(p.key, fs[0] ? fs[0].id : null); } } }, spans,
        ed ? btn('+', 'sm cr-plus', function(ev){ franjaNueva(ev, p, di, t); }, { title: 'Agregar franja', 'aria-label': 'Agregar franja a ' + ST.C.nm(p) + ' el ' + d }) : null));
    });
    poner(tr, h('td', null, o.length ? dhx(hrsDe(o.filter(function(f){ return f.dia < days.length; }))) : h('span', { class: 'cr-pill z', t: 'sin agenda' })));
    poner(tb, tr);
  });
  return h('div', { class: 'cr-scrollx' }, tb);
}
function chipsFor(d){
  const t = tabAct(), dd = ST.C.dayData(t, d, S.pf), seen = new Set(), out = [];
  if(t === 'adm') asignarBoxes(dd.items);
  const bx = function(it){ return it.lane === 'box1' ? ' · BOX 1' : it.lane === 'box2' ? ' · BOX 2' : it.lane === 'sin' ? ' · SOPORTE ADMINISTRATIVO' : ''; };
  dd.items.forEach(function(it){
    const key = it.kind + '|' + (it.k || (it.r && it.r.nombre)) + '|' + (it['for'] || '');
    if(it.kind === 'lic'){
      if(seen.has(key)) return;
      seen.add(key);
      out.push(h('div', { class: 'cr-chp lic', s: { '--h': hue(it.k) }, on: { click: function(){ openPerson(it.k, null, it.l.id); } } }, h('b', { t: apP(it.k) }), h('small', { t: it.l.tipo })));
    } else if(it.kind === 'rep'){
      out.push(h('div', { class: 'cr-chp rep', s: { '--h': hue(it.k || it['for']) }, on: { click: function(){ if(it.k) openPerson(it.k); else openPerson(it['for'], null, it.l.id); } } },
        h('b', { t: ST.C.rshort(it.r) }), h('small', { t: 'reemp. a ' + apP(it['for']) + ' · ' + it.d + '–' + it.h + bx(it) + (ST.C.repEst(it.r) !== 'ok' ? ' · a confirmar' : '') })));
    } else {
      const f = it.f;
      const fo = f.orig || f;
      out.push(h('div', { class: 'cr-chp w', s: { '--h': hue(it.k) }, on: { click: function(ev){ if(enEdicion() && esFranjaEditable(fo)) franjaPop(ev, fo); else openPerson(it.k, f.rot ? null : f.id); } } }, h('b', { t: apP(it.k) }),
        h('small', { t: it.d + '–' + it.h + bx(it) + (f.g ? ' · ' + TURN[f.t][2] : ((f.sec ? ' · ' + (SEC[f.sec] || f.sec) : '') + (f.turno && TURN[f.turno] ? ' · ' + TURN[f.turno][2] : ''))) + (f.rot ? ' · sábado' : '') + (f.corta ? ' · sale ' + minT(mins(f.h)) : '') + (f.sup ? ' · cubre salida de ' + apP(f.sup) : '') + (f.pend ? ' · a confirmar' : '') })));
    }
  });
  dd.strip.forEach(function(sx){
    out.push(h('div', { class: 'cr-chp lic', s: { '--h': hue(sx.k) }, on: { click: function(){ openPerson(sx.k, null, sx.l.id); } } }, h('b', { t: apP(sx.k) }), h('small', { t: sx.l.tipo })));
  });
  const jf = jefaDe(wdOf(d), d);
  if(jf) out.push(h('div', { class: 'cr-chp jfc' }, h('b', { t: 'Jefa de residentes' }), h('small', { t: ST.R.jefaNom + ' · ' + jf[0] + '–' + jf[1] })));
  return out;
}
function renderMes(){
  const t = tabAct(), first = new Date(S.y, S.m, 1), off = (first.getDay() + 6) % 7, dim = dimOf(S.y, S.m), n = Math.ceil((off + dim) / 7) * 7, hoy = ST.puente.hoy();
  const any = ST.M.F.some(function(f){ return f.tab === t; }) || ST.M.L.length;
  const o = h('div', null, any ? null : nota('Sin agendas ni licencias cargadas en ' + TN[t] + '.'));
  if(esAngosto()){
    let c = 0;
    for(let dn = 1; dn <= dim; dn++){
      const d = iso(S.y, S.m, dn), ch = chipsFor(d);
      if(!ch.length) continue;
      c++;
      poner(o, h('div', { class: 'cr-ld' + (d === hoy ? ' today' : '') }, h('div', { class: 'cr-lt' + (wdOf(d) >= 5 ? ' we' : ''), t: DIAS[wdOf(d)].slice(0, 3) + ' ' + dn }), ch));
    }
    if(!c && any) poner(o, nota('Sin movimientos este mes.'));
    return o;
  }
  const mes = h('div', { class: 'cr-mes' }, DIAS.map(function(d){ return h('div', { class: 'cr-mh', t: d.slice(0, 3) }); }));
  for(let i = 0; i < n; i++){
    const dn = i - off + 1, dt = new Date(S.y, S.m, dn), d = iso(dt.getFullYear(), dt.getMonth(), dt.getDate()), inM = dn >= 1 && dn <= dim;
    poner(mes, h('div', { class: 'cr-cell' + (inM ? '' : ' out') + (d === hoy ? ' today' : '') + (i % 7 >= 5 ? ' we' : '') },
      h('div', { class: 'n', t: dt.getDate() }), inM && ST.M.FER[d] ? h('em', { class: 'cr-fer', t: 'Feriado' }) : null, inM ? chipsFor(d) : null));
  }
  poner(o, mes);
  return o;
}
function renderAnio(){
  const y = S.y, tot = diffD(y + '-01-01', (y + 1) + '-01-01'), t = tabAct(), hoy = ST.puente.hoy();
  const ps = (S.sub === 'licencias' ? ST.C.people('tec').concat(ST.C.people('adm')) : ST.C.people(t)).filter(function(p){ return !S.pf || p.key === S.pf; });
  const pc = function(d){ return (d / tot * 100) + '%'; }, Y0 = y + '-01-01', Y1 = y + '-12-31';
  const doy = function(mo, d){ return diffD(y + '-01-01', iso(y, mo, d)); };
  const gt = h('div', { class: 'cr-gt' }, h('div', { class: 'cr-gm' }, MESES.map(function(mm, i){ return h('span', { s: { left: pc(doy(i, 1)) }, t: mm.slice(0, 3) }); })));
  let any = false;
  ps.forEach(function(p){
    const ls = ST.M.L.filter(function(l){ return l.key === p.key && ST.C.lend(l) >= Y0 && l.desde <= Y1; });
    const dias = ls.reduce(function(s, l){ return s + diffD(l.desde < Y0 ? Y0 : l.desde, ST.C.lend(l) > Y1 ? Y1 : ST.C.lend(l)) + 1; }, 0);
    if(ls.length) any = true;
    const gc = h('div', { class: 'cr-gc' }, MESES.map(function(_, i){ return h('i', { s: { left: pc(doy(i, 1)) } }); }));
    if(y === +hoy.slice(0, 4)) poner(gc, h('i', { class: 'td', s: { left: pc(diffD(Y0, hoy)) } }));
    ls.forEach(function(l){
      const a = l.desde < Y0 ? Y0 : l.desde, b = ST.C.lend(l) > Y1 ? Y1 : ST.C.lend(l), w = diffD(a, b) + 1;
      poner(gc, h('div', { class: 'cr-bar', s: { left: pc(diffD(Y0, a)), width: pc(w), '--h': thLic(l.tipo) }, tabindex: '0',
        title: l.tipo + ' ' + fmtF(l.desde) + '–' + (l.hasta ? fmtF(l.hasta) : 'sin fecha de regreso') + (l.pend ? ' (a confirmar)' : '') + (l.reemps.length ? ' · reemplaza: ' + l.reemps.map(ST.C.rname).join(', ') : ''),
        on: { click: function(){ openPerson(p.key, null, l.id); } }, t: l.tipo + (l.hasta ? '' : ' →') + (l.pend ? ' *' : '') }));
    });
    poner(gt, h('div', { class: 'cr-gr' }, h('div', { class: 'cr-gl', on: { click: function(){ openPerson(p.key); } } }, ST.C.nm(p), h('small', { t: dias ? dias + ' días de licencia' : 'sin licencias' })), gc));
  });
  const o = h('div', null, any ? null : nota('Sin licencias cargadas en ' + y + ' para este servicio.'), gt);
  if(S.pf){
    const mms = h('div', { class: 'cr-mms' });
    MESES.forEach(function(mm, i){
      const off = (new Date(y, i, 1).getDay() + 6) % 7, dim = dimOf(y, i), d7 = h('div', { class: 'd' });
      for(let q = 0; q < off; q++) poner(d7, h('span'));
      for(let d = 1; d <= dim; d++){
        const ds = iso(y, i, d), l = ST.C.licOn(S.pf, ds), w = ST.M.F.some(function(f){ return f.key === S.pf && f.dia === wdOf(ds); });
        poner(d7, h('span', { class: (l ? 'l' : w ? 'k' : '') + (ds === hoy ? ' t' : ''), s: l ? { '--h': thLic(l.tipo) } : null, title: l ? l.tipo : null, t: d }));
      }
      poner(mms, h('div', { class: 'cr-mm' }, h('b', { t: mm }), d7));
    });
    poner(o, mms);
  }
  return o;
}

/* == diagrama mensual (técnicos) == */
function cellInfo(p, d, Cc){
  const C_ = ST.C, PM = ST.M.PM, key = p.ext ? '_ext:' + p.ext : p.key, its = (Cc[d] && Cc[d][key]) || [];
  const turnoP = !p.ext && ST.M.F.some(function(f){ return f.tab === 'tec' && f.key === p.key && f.turno; });
  const lic0 = its.find(function(i){ return i.kind === 'lic'; }), rs0 = its.filter(function(i){ return i.kind === 'rep'; });
  const cam = lic0 && lic0.l.tipo === 'Cambio de turno', lic = cam ? null : lic0;
  if(cam && !rs0.length && lic0.f){
    const x = letterOf(lic0.d, lic0.h);
    return { t: x, c: x, ti: C_.nm(p) + ' · cambio de turno' + (lic0.l.pend ? ' (a confirmar)' : ''), l: lic0.l, h: (mins(lic0.h) - mins(lic0.d) + 1440) % 1440 / 60 };
  }
  if(lic){
    const x = lic.f && lic.f.g ? letterOf(lic.d, lic.h) : '';
    return { t: 'L', c: 'L', ti: C_.nm(p) + ' · ' + lic.l.tipo + (x ? ' · ' + DL[x] : '') + (lic.l.pend ? ' (a confirmar)' : '') +
      (lic.l.reemps.length ? ' · reemplaza: ' + lic.l.reemps.map(C_.rname).join(', ') : ' · sin reemplazo definido'), l: lic.l };
  }
  const ws = cam ? [] : its.filter(function(i){ return i.kind === 'w'; }), rs = its.filter(function(i){ return i.kind === 'rep'; });
  if(ws.length || rs.length){
    const ls = ws.concat(rs).map(function(i){ return letterOf(i.d, i.h); });
    const est = rs.some(function(i){ return C_.repEst(i.r) === 'no'; }) ? 'no' : rs.some(function(i){ return C_.repEst(i.r) === 'pe'; }) ? 'pe' : 'ok';
    const ti = ws.map(function(i){ return DL[letterOf(i.d, i.h)] + ' ' + i.d + '–' + i.h + (i.f && i.f.xt ? ' (turno extra)' : '') + (i.f && i.f.pend ? ' (a confirmar)' : ''); })
      .concat(rs.map(function(i){ return 'Reemplaza a ' + PM[i['for']].ap + ' · ' + DL[letterOf(i.d, i.h)] + ' ' + i.d + '–' + i.h + ' (' + ESTTXT[C_.repEst(i.r)] + ')'; })).join(' | ');
    const uniq = ls.filter(function(x, i){ return ls.indexOf(x) === i; });
    return { t: uniq.join(''), c: ls[0] + (ws.length ? '' : ' r ' + est), ti: C_.nm(p) + ' · ' + fmtF(d) + ' · ' + ti, rep: !ws.length,
      h: ws.concat(rs).reduce(function(s, i){ return s + ((mins(i.h) - mins(i.d) + 1440) % 1440) / 60; }, 0) };
  }
  if(turnoP) return { t: 'F', c: 'F', ti: (ST.M.FER[d] ? 'Feriado: ' + ST.M.FER[d] + ' · ' : '') + 'Franco' };
  return { t: '', c: '', ti: '' };
}
const ESTTXT = { ok: 'confirmado', pe: 'por confirmar', no: 'no puede' };
function diagGroups(Cc){
  const C_ = ST.C, ps = C_.people('tec').filter(function(p){ return !S.pf || p.key === S.pf; }), ds = monthDays(S.y, S.m);
  const has = function(p){ return ds.some(function(d){ return ((Cc[d][p.key]) || []).length; }); };
  const tn = function(p){ const f = ST.M.F.find(function(x){ return x.tab === 'tec' && x.key === p.key && x.turno; }); return f ? f.turno : null; };
  const g = { M: [], T: [], G: [], O: [], X: [] };
  ps.forEach(function(p){
    if(C_.esGuard(p.key)) g.G.push(p);
    else if(tn(p) === 'M') g.M.push(p);
    else if(tn(p) === 'T') g.T.push(p);
    else if(has(p)) g.O.push(p);
  });
  const ex = new Set();
  ds.forEach(function(d){ Object.keys(Cc[d]).filter(function(k){ return k.indexOf('_ext:') === 0; }).forEach(function(k){ ex.add(k.slice(5)); }); });
  g.X = Array.from(ex).map(function(n){ return { ext: n, ap: n, nom: '', key: null }; });
  g.sin = ps.filter(function(p){ return g.M.indexOf(p) < 0 && g.T.indexOf(p) < 0 && g.G.indexOf(p) < 0 && g.O.indexOf(p) < 0; });
  return g;
}
function diagHelp(){
  const cc = function(c, t){ return h('b', { class: 'cr-cc lg ' + c, t: t }); };
  return h('div', null,
    h('div', { class: 'cr-lgd' },
      h('span', null, cc('M', 'M'), 'Mañana 07–13'), h('span', null, cc('T', 'T'), 'Tarde 13–19'), h('span', null, cc('N', 'N'), 'Noche 19–07'), h('span', null, cc('D', 'D'), 'Guardia de día 07–19'),
      h('span', null, cc('F', 'F'), 'Franco'), h('span', null, cc('L', 'L'), 'Licencia'), h('span', null, cc('M r ok', 'M'), 'Reemplazo confirmado'),
      h('span', null, cc('M r pe', 'M'), 'Reemplazo por confirmar'), h('span', null, cc('M r no', 'M'), 'Dijo que no puede')),
    h('details', { class: 'cr-how' }, h('summary', { t: 'Cómo se lee y reglas del servicio' }),
      h('p', null, h('b', { t: 'Planta (mañana o tarde): ' }), 'lunes a viernes; cada técnico conserva su horario real y la letra M/T es solo el turno. Los sábados alternan entre ', h('b', { t: 'Sábado 1' }), ' y ', h('b', { t: 'Sábado 2' }),
        ' a partir de una fecha ancla configurada (sat0).'),
      h('p', null, h('b', { t: 'Guardias de 12 h: ' }), 'se cargan por fecha cada mes (noche 19–07, día 07–19). Domingos y feriados llevan guardia de día más noche.'),
      h('p', null, h('b', { t: 'Feriados: ' }), 'la columna se marca en rojo y el personal de planta tiene franco.'),
      h('p', null, h('b', { t: 'Reemplazos: ' }), 'aparecen en la fila de quien cubre, con borde punteado según el estado. Todo reemplazo sin confirmar figura como “a confirmar”. ',
        h('b', { t: 'Cambio de turno: ' }), 'quien pasa a cubrir otro turno figura con la letra del turno que cubre.'),
      h('p', null, h('b', { t: 'Licencias: ' }), 'la celda pasa a L. Abajo se listan las licencias del mes con quién reemplaza.'),
      h('p', { t: 'Tocá cualquier celda para ver el detalle' + (puedeEditar() ? ' y registrar cambios de último momento.' : '.') })));
}
function diagNotes(){
  const ds = monthDays(S.y, S.m), a = ds[0], b = ds[ds.length - 1], PM = ST.M.PM, C_ = ST.C;
  const ls = ST.M.L.filter(function(l){ return PM[l.key] && PM[l.key].grp === 'tec' && l.desde <= b && C_.lend(l) >= a && (!S.pf || l.key === S.pf); }).sort(function(x, y){ return x.desde.localeCompare(y.desde); });
  if(!ls.length) return h('div', { class: 'cr-hint', s: { 'margin-top': '12px' }, t: 'Sin licencias de técnicos en este mes.' });
  return h('div', null, h('div', { class: 'cr-gh2', t: 'Licencias del mes y quién cubre' }), ls.map(function(l){
    const p = PM[l.key], rp = l.reemps;
    return h('div', { class: 'cr-dl', on: { click: function(){ openPerson(l.key, null, l.id); } } },
      h('b', { t: C_.nm(p) }), ' · ' + l.tipo + ' · ' + fmtF(l.desde) + (l.hasta ? ' al ' + fmtF(l.hasta) : ' · sin fecha de regreso'),
      l.pend ? [' ', pendMarca()] : null, l.obs ? h('small', { class: 'cr-mut', t: ' · ' + l.obs }) : null,
      rp.length ? rp.map(function(r){
        return h('div', { class: 'rr' }, 'Reemplaza: ', h('b', { t: C_.rname(r) }), ' · ' + r.d + '–' + r.h + (r.fechas.length ? ' · solo ' + r.fechas.map(fmtC).join(', ') : '') + (r.desde ? ' · desde ' + fmtF(r.desde) : ''),
          C_.repEst(r) !== 'ok' ? [' ', pendMarca(ESTTXT[C_.repEst(r)])] : null, r.nota ? h('small', { t: ' (' + r.nota + ')' }) : null);
      }) : h('div', { class: 'rr no', t: 'Sin reemplazo definido.' }));
  }));
}
function renderDiag(){
  const days = monthDays(S.y, S.m), Cc = ST.C.diagCells(S.y, S.m), Gp = diagGroups(Cc), WL = ['L', 'M', 'Mi', 'J', 'V', 'S', 'D'], C_ = ST.C, hoy = ST.puente.hoy();
  const sections = [['Turno mañana', Gp.M], ['Turno tarde', Gp.T], ['Guardias de 12 h', Gp.G], ['Suplentes y otros que cubren este mes', Gp.O], ['Reemplazantes externos', Gp.X]].filter(function(x){ return x[1].length; });
  const out = h('div', null, diagHelp());
  if(!sections.length) poner(out, nota('Sin turnos cargados este mes en Técnicos.'));
  const stat = function(p){
    let hs = 0, fr = 0;
    days.forEach(function(d){ const x = cellInfo(p, d, Cc); if(x.h) hs += x.h; if(x.c === 'F' && !ST.M.FER[d] && wdOf(d) !== 6) fr++; });
    return { hs: Math.round(hs), fr: fr };
  };
  const celda = function(p, d, x, extra){
    return h('span', { class: 'cr-cc ' + (extra || '') + (x.c || 'e'), title: x.ti || 'Tocá para ver', tabindex: p.key ? '0' : null, role: p.key ? 'button' : null,
      on: p.key ? { click: function(ev){ cellPop(ev, p.key, d); }, keydown: function(ev){ if(ev.key === 'Enter') cellPop(ev, p.key, d); } } : null }, extra ? [h('i', { t: +d.slice(8) }), x.t] : (x.t || ' '));
  };
  const angosto = (ST.R.ancho || 0) < 860;
  if(angosto){
    const off = (new Date(S.y, S.m, 1).getDay() + 6) % 7;
    sections.forEach(function(sec){
      poner(out, h('div', { class: 'cr-gh2', t: sec[0] }));
      sec[1].forEach(function(p){
        const st = stat(p), dgd = h('div', { class: 'cr-dgd' }, WL.map(function(x){ return h('b', { class: 'wh', t: x }); }));
        for(let q = 0; q < off; q++) poner(dgd, h('span'));
        days.forEach(function(d){
          const x = cellInfo(p, d, Cc);
          poner(dgd, h('span', { class: 'cr-cc dc ' + (x.c || 'e') + (ST.M.FER[d] ? ' fer' : ''), title: x.ti || 'Tocá para ver', tabindex: p.key ? '0' : null,
            on: p.key ? { click: function(ev){ cellPop(ev, p.key, d); } } : null }, h('i', { t: +d.slice(8) }), x.t));
        });
        poner(out, h('div', { class: 'cr-dgm' }, h('div', { class: 'cr-dgn', on: p.key ? { click: function(){ openPerson(p.key); } } : null }, ST.C.nm(p) + (p.ext ? ' (externo)' : ''), h('small', { t: st.hs + ' h en el mes' })), dgd));
      });
    });
  } else {
    const tb = h('table', { class: 'cr-dg' }, h('colgroup', null, h('col', { s: { width: '128px' } }), days.map(function(){ return h('col'); }), h('col', { s: { width: '34px' } })),
      h('thead', null, h('tr', null, h('th', { class: 'nm', s: { cursor: 'default' }, t: MESES[S.m] + ' ' + S.y }),
        days.map(function(d){ const w = wdOf(d); return h('th', { class: (ST.M.FER[d] ? 'fer ' : '') + (w >= 5 ? 'we' : ''), title: ST.M.FER[d] ? 'Feriado: ' + ST.M.FER[d] : null }, WL[w], h('small', { t: +d.slice(8) })); }),
        h('th', { class: 'st', t: 'Hs' }))));
    const body = h('tbody');
    sections.forEach(function(sec){
      poner(body, h('tr', { class: 'gh' }, h('td', { colspan: days.length + 2, t: sec[0] })));
      sec[1].forEach(function(p){
        const st = stat(p);
        poner(body, h('tr', null, h('td', { class: 'nm', title: C_.nm(p), on: p.key ? { click: function(){ openPerson(p.key); } } : null }, p.ext ? p.ap + ' (ext.)' : p.ap + ' ' + (p.nom || '')[0] + '.'),
          days.map(function(d){ const x = cellInfo(p, d, Cc), w = wdOf(d); return h('td', { class: (ST.M.FER[d] ? 'fer ' : '') + (w >= 5 ? 'we' : '') }, p.key ? celda(p, d, x) : (x.t ? h('span', { class: 'cr-cc ' + x.c, title: x.ti, t: x.t }) : null)); }),
          h('td', { class: 'st', t: st.hs || '' })));
      });
    });
    poner(tb, body);
    poner(out, h('div', { class: 'cr-scrollx' }, tb));
  }
  if(Gp.sin.length) poner(out, h('div', { class: 'cr-hint', s: { 'margin-top': '10px' } }, 'Sin turnos este mes: ', Gp.sin.map(function(p, i){
    return [i ? ', ' : '', h('a', { href: '#', class: 'cr-lk', on: { click: function(ev){ ev.preventDefault(); openPerson(p.key); } }, t: C_.nm(p) })];
  }), '.'));
  poner(out, diagNotes());
  return out;
}

/* == pago y horas == */
function listaPago(A_){
  const t = ST.R.tarifas;
  if(t && Array.isArray(t.personas)) return t.personas.map(function(id){ return A_.find(function(o){ return o.p.key === id; }); }).filter(Boolean);
  return A_.filter(function(o){ return o.cat.rep[0] + o.cat.rep[1] > 0; });
}
function pagoVisible(){ return !!ST.R.tarifas && puedeEditar(); }
function pagoPanel(){
  const A_ = ST.C.horasData(S.y, S.m, null), rows = listaPago(A_).map(function(o){
    const z = horasPago(o, S.solo), tf = ST.R.tarifas;
    return { o: o, D: z[0], N: z[1], pd: z[0] * tf.diurna, pn: z[1] * tf.nocturna, t: z[0] * tf.diurna + z[1] * tf.nocturna };
  });
  const box = h('div', { class: 'cr-pay', id: 'cr-pay' });
  const tf = ST.R.tarifas;
  const num = function(v, k){
    return entrada('number', v, function(val){ tf[k] = Math.max(0, +val || 0); guardarTarifas(); pintar(); }, { min: '0', disabled: !esAdmin(), 'aria-label': 'Tarifa ' + (k === 'diurna' ? 'diurna' : 'nocturna') });
  };
  poner(box, h('div', { class: 'ph' }, h('b', { t: 'Horas y valor por técnico · ' + MESES[S.m] + ' ' + S.y }),
    h('label', { class: 'cr-hint' }, 'Diurna $ ', num(tf.diurna, 'diurna'), ' 07–20 h'),
    h('label', { class: 'cr-hint' }, 'Nocturna $ ', num(tf.nocturna, 'nocturna'), ' 20–07 h'),
    h('label', { class: 'cr-hint cr-chk1' }, h('input', { type: 'checkbox', checked: S.solo, on: { change: function(ev){ S.solo = ev.target.checked; pintar(); } } }), 'Sin horas propias de planta (solo reemplazos, guardias y extras)')));
  if(!esAdmin()) poner(box, h('div', { class: 'cr-hint', t: 'Las tarifas solo las modifica un administrador.' }));
  if(!tf.diurna && !tf.nocturna) poner(box, nota('Tarifas sin cargar (a confirmar): los importes figuran en $ 0 hasta que un administrador las cargue.'));
  if(!rows.length){ poner(box, nota('Sin técnicos para liquidar este mes.')); }
  else {
    const avg = rows.reduce(function(a, r){ return a + r.t; }, 0) / rows.length, mx = Math.max(1, Math.max.apply(null, rows.map(function(r){ return r.t; })));
    const dif = function(r){
      const x = r.t - avg, p = avg ? x / avg * 100 : 0;
      return h('span', { class: x > 0.5 ? 'pos' : 'neg', t: (x >= 0 ? '+' : '−') + fmtM(Math.abs(x)) + ' (' + (x >= 0 ? '+' : '−') + Math.abs(p).toLocaleString('es-AR', { maximumFractionDigits: 0 }) + '%)' });
    };
    const avgOf = function(f){ return rows.reduce(function(a, r){ return a + f(r); }, 0) / rows.length; };
    if(esAngosto()){
      poner(box, h('div', { class: 'cr-pgs' }, rows.map(function(r){
        return h('div', { class: 'cr-pgc', 'data-pago': r.o.p.key }, h('div', { class: 'r1' }, h('b', { t: ST.C.nm(r.o.p) }), h('b', { t: fmtM(r.t) })),
          h('small', { t: fmtH(r.D) + ' diurnas · ' + fmtH(r.N) + ' nocturnas · ' + fmtH(r.D + r.N) }), h('small', { t: fmtM(r.pd) + ' + ' + fmtM(r.pn) }),
          r.o.pend ? h('small', { class: 'cr-apend', t: 'Incluye ' + fmtH(r.o.pend) + ' a confirmar' }) : null,
          h('small', null, dif(r), ' vs. promedio'), h('div', { class: 'cr-bar2', s: { width: (r.t / mx * 100) + '%' } }));
      }), h('div', { class: 'cr-pgc' }, h('div', { class: 'r1' }, h('b', { t: 'Promedio' }), h('b', { t: fmtM(avg) })))));
    } else {
      const tb = h('table', { class: 'cr-pt' }, h('tr', null, ['Técnico', 'Hs diurnas', 'Hs nocturnas', 'Total hs', '$ diurnas', '$ nocturnas', 'Total $', 'Vs. promedio', 'A confirmar'].map(function(x){ return h('th', { t: x }); }), h('th', { s: { width: '12%' } })));
      rows.forEach(function(r){
        poner(tb, h('tr', { 'data-pago': r.o.p.key }, h('td', { t: ST.C.nm(r.o.p) }), h('td', { t: fmtH(r.D) }), h('td', { t: fmtH(r.N) }), h('td', { t: fmtH(r.D + r.N) }), h('td', { t: fmtM(r.pd) }), h('td', { t: fmtM(r.pn) }),
          h('td', null, h('b', { t: fmtM(r.t) })), h('td', null, dif(r)), h('td', { t: r.o.pend ? fmtH(r.o.pend) : '—' }), h('td', null, h('div', { class: 'cr-bar2', s: { width: (r.t / mx * 100) + '%' } }))));
      });
      poner(tb, h('tr', { class: 'tot' }, h('td', { t: 'Promedio' }), h('td', { t: fmtH(avgOf(function(r){ return r.D; })) }), h('td', { t: fmtH(avgOf(function(r){ return r.N; })) }), h('td', { t: fmtH(avgOf(function(r){ return r.D + r.N; })) }),
        h('td', { t: fmtM(avgOf(function(r){ return r.pd; })) }), h('td', { t: fmtM(avgOf(function(r){ return r.pn; })) }), h('td', { t: fmtM(avg) }), h('td'), h('td'), h('td')));
      poner(box, h('div', { class: 'cr-scrollx' }, tb));
    }
  }
  poner(box, h('div', { class: 'cr-hint', s: { 'margin-top': '6px' }, t: 'Una guardia de 19 a 07 se divide sola: 19–20 diurna, 20–07 nocturna. Las licencias no suman horas. “A confirmar” = horas de reemplazos sin confirmar o de licencias a confirmar: el importe las incluye pero no es definitivo.' }));
  if(esAdmin()){
    const sel = new Set(rows.map(function(r){ return r.o.p.key; }));
    poner(box, h('details', { class: 'cr-how' }, h('summary', { t: 'Quiénes figuran en este panel' }),
      h('p', { class: 'cr-hint', t: ST.R.tarifas.personas ? 'Lista guardada por un administrador.' : 'Sin lista guardada: se muestran los técnicos que cubrieron reemplazos este mes.' }),
      h('div', { class: 'cr-chk' }, ST.C.people('tec').map(function(p){
        return h('label', null, h('input', { type: 'checkbox', checked: sel.has(p.key), on: { change: function(ev){
          const cur = new Set(listaPago(A_).map(function(o){ return o.p.key; }));
          if(ev.target.checked) cur.add(p.key); else cur.delete(p.key);
          tf.personas = ST.C.people('tec').map(function(q){ return q.key; }).filter(function(k){ return cur.has(k); });
          guardarTarifas(); pintar();
        } } }), h('span', { t: ST.C.nm(p) }));
      }))));
  }
  return box;
}
function guardarTarifas(){ marcarSucio(); }
function escribirTarifas(){
  const valor = valorTarifas();
  return encolar(async function(){
    const v = ST.M.cfg.ver.tarifas;
    const r = await ST.puente.rpc('img_cron_guardar', { p_entidad: 'config', p_dato: { clave: 'tarifas', valor: valor }, p_version: v === undefined ? null : v });
    ST.M.cfg.ver.tarifas = r.version;
  });
}
function renderPago(){
  const o = h('div');
  if(!pagoVisible()){ poner(o, nota('Esta vista requiere permiso de edición.')); return o; }
  poner(o, pagoPanel());
  const sel = listaPago(ST.C.horasData(S.y, S.m, null));
  ST.R.mxHoras = Math.max(1, Math.max.apply(null, sel.map(function(o){ return o.tot; })));
  if(sel.length) poner(o, h('div', { class: 'cr-hsec', t: 'Detalle de horas' }), h('div', { class: 'cr-hg' }, sel.map(function(x){ return cardHoras(x, true); })));
  return o;
}
function cardHoras(o, big){
  const seg = [['own', 190, 'Propias'], ['rep', 90, 'Cubriendo a otros'], ['gua', 255, 'Guardias 12 h'], ['ext', 35, 'Turnos extra']];
  const mx = Math.max(1, ST.R.mxHoras || 1), wk = o.wkDias;
  const pago = pagoVisible() && listaPago([o]).length ? horasPago(o, S.solo) : null;
  return h('div', { class: 'cr-hc' + (big ? ' big' : ''), 'data-horas': o.p.key },
    h('div', { class: 'hh' }, h('b', { s: { cursor: 'pointer' }, on: { click: function(){ openPerson(o.p.key); } }, t: ST.C.nm(o.p) }), h('span', { class: 'tot', t: fmtH(o.tot) })),
    h('div', { class: 'bar', title: fmtH(o.tot) + ' en el mes' }, seg.map(function(s){ return o[s[0]] ? h('i', { s: { width: (o[s[0]] / mx * 100) + '%', background: 'hsl(' + s[1] + ' 70% 55%)' } }) : null; })),
    h('div', { class: 'hl' }, h('span', { class: 'nw' }, '☀ Diurnas ', h('b', { t: fmtH(o.D) })), h('span', { class: 'nw' }, '☾ Nocturnas ', h('b', { t: fmtH(o.N) })),
      pago ? h('span', { class: 'nw' }, h('b', { t: fmtM(pago[0] * ST.R.tarifas.diurna + pago[1] * ST.R.tarifas.nocturna) })) : null,
      o.pend ? h('span', { class: 'nw cr-apend', t: fmtH(o.pend) + ' a confirmar' }) : null),
    h('div', { class: 'hl' }, seg.map(function(s){ return h('span', { class: 'nw' }, h('i', { class: 'dot', s: { background: 'hsl(' + s[1] + ' 70% 55%)' } }), s[2] + ' ', h('b', { t: fmtH(o[s[0]]) })); }),
      o.lic ? h('span', { class: 'nw cr-w', t: 'Licencia ' + o.lic + ' día' + (o.lic === 1 ? '' : 's') }) : null),
    h('div', { class: 'wks' }, wk.map(function(w, i){
      const mas = o.wk[i] > 48;
      return h('span', { class: mas ? 'mas48' : '', title: mas ? 'Más de 48 h en la semana (referencia: tope legal de jornada)' : 'Semana del ' + (+w[0].slice(8)) + ' al ' + (+w[w.length - 1].slice(8)) },
        (+w[0].slice(8)) + '–' + (+w[w.length - 1].slice(8)) + ' ', h('b', { t: fmtH(o.wk[i]) + (mas ? ' ⚠' : '') }));
    })),
    h('details', null, h('summary', { t: 'Ver día por día (' + o.det.length + ')' }), o.det.length ? o.det.map(function(z){ return h('div', { t: z }); }) : h('div', { t: 'Sin turnos este mes.' })));
}
function renderHoras(){
  if(tabAct() === 'adm') return renderHorasAdm();
  const all = ST.C.horasData(S.y, S.m, S.pf);
  ST.R.mxHoras = Math.max(1, Math.max.apply(null, all.map(function(o){ return o.tot; })));
  const pk = new Set(listaPago(all).map(function(o){ return o.p.key; }));
  const rest = all.filter(function(o){ return !pk.has(o.p.key) && (o.tot > 0 || o.lic > 0); }), vac = all.filter(function(o){ return !pk.has(o.p.key) && !(o.tot > 0 || o.lic > 0); });
  const hk = all.filter(function(o){ return pk.has(o.p.key); });
  const pl = rest.filter(function(o){ return !ST.C.esGuard(o.p.key); }), gu = rest.filter(function(o){ return ST.C.esGuard(o.p.key); });
  const out = h('div', null, h('div', { class: 'cr-hint', s: { 'margin-bottom': '6px' } }, 'Horas de ', h('b', { t: MESES[S.m] + ' ' + S.y }),
    ' según lo que figura en el diagrama: turnos propios, reemplazos que cubre, guardias de 12 h y turnos extra. Una licencia descuenta las horas propias de esos días; quien cubre un reemplazo ese día no suma su horario habitual; cada noche de guardia cuenta en el día que empieza. Las semanas van de lunes a domingo (recortadas al mes). Las horas “a confirmar” vienen de reemplazos sin confirmar o licencias a confirmar.'));
  if(hk.length) poner(out, h('div', { class: 'cr-hsec', t: 'Reemplazantes y suplentes' }), h('div', { class: 'cr-hg' }, hk.map(function(o){ return cardHoras(o, true); })));
  if(pl.length) poner(out, h('div', { class: 'cr-hsec', t: 'Personal de planta' }), h('div', { class: 'cr-hg' }, pl.map(function(o){ return cardHoras(o); })));
  if(gu.length) poner(out, h('div', { class: 'cr-hsec', t: 'Guardias de 12 h' }), h('div', { class: 'cr-hg' }, gu.map(function(o){ return cardHoras(o); })));
  if(vac.length) poner(out, h('div', { class: 'cr-hint', s: { 'margin-top': '14px' }, t: 'Sin turnos cargados este mes: ' + vac.map(function(o){ return ST.C.nm(o.p); }).join(', ') + '.' }));
  return out;
}
function admWeeks(){
  const f = monthDays(S.y, S.m);
  let w = f[0];
  while(wdOf(w) !== 0) w = addD(w, -1);
  const ws = [];
  for(; w <= f[f.length - 1]; w = addD(w, 7)) ws.push(w);
  return ws;
}
function renderHorasAdm(){
  const C_ = ST.C, ws = admWeeks(), ps = C_.people('adm'), md = new Set(monthDays(S.y, S.m)), pk = C_.admPeak(S.y, S.m);
  const rows = ps.map(function(p){ return { p: p, w: ws.map(function(){ return { h: 0, s: 0, lic: 0 }; }), mes: 0, pend: 0 }; });
  ws.forEach(function(w, wi){
    for(let i = 0; i < 7; i++){
      const d = addD(w, i), dd = C_.dayData('adm', d, null);
      rows.forEach(function(o){
        let hs = 0;
        dd.items.forEach(function(x){
          if((x.kind === 'w' || x.kind === 'rep') && x.k === o.p.key){
            const hh_ = ((mins(x.h) - mins(x.d) + 1440) % 1440) / 60;
            hs += hh_;
            if(md.has(d) && ((x.f && x.f.pend) || (x.kind === 'rep' && (C_.repEst(x.r) !== 'ok' || x.l.pend)))) o.pend += hh_;
          }
        });
        if(C_.licOn(o.p.key, d) && dd.items.every(function(x){ return x.k !== o.p.key || x.kind !== 'w'; }) && i < 5 && !ST.M.FER[d]) o.w[wi].lic++;
        if(i < 5) o.w[wi].h += hs; else o.w[wi].s += hs;
        if(md.has(d)) o.mes += hs;
      });
    }
  });
  const vis = rows.filter(function(o){ return !S.pf || o.p.key === S.pf; });
  const out = h('div', null, h('div', { class: 'cr-hint', s: { 'margin-bottom': '8px' } }, 'Horas de ', h('b', { t: MESES[S.m] + ' ' + S.y }),
    ' por semana (lunes a domingo, semanas completas). Los feriados no suman. Los sábados se muestran aparte porque no cuentan igual que las horas semanales (se compensan). El régimen semanal de cada persona no está cargado: figura “a confirmar”.'),
    h('div', { class: 'cr-pay' }, h('b', { t: 'Lugares de atención: 2. ' }), h('span', { class: 'cr-hint' }, 'Pico de personas en simultáneo este mes (sin contar a quien tiene oficina propia): ',
      h('b', { class: pk.n > 2 ? 'cr-w' : '', t: pk.n }), pk.bad.length ? ' · días con más de 2: ' + pk.bad.map(function(x){ return fmtC(x.d); }).join(', ') : ' · ningún día pasa de 2')));
  poner(out, h('div', { class: 'cr-hg' }, vis.map(function(o){
    const lic = o.w.reduce(function(a, x){ return a + x.lic; }, 0);
    return h('div', { class: 'cr-hc', 'data-horas': o.p.key }, h('div', { class: 'hh' }, h('b', { s: { cursor: 'pointer' }, on: { click: function(){ openPerson(o.p.key); } }, t: C_.nm(o.p) }), h('span', { class: 'tot', t: fmtH(o.mes) })),
      h('div', { class: 'hl' }, 'Régimen semanal: ', pendMarca('a confirmar'), C_.esOfi(o.p.key) ? ' · oficina propia' : '', lic ? [' · ', h('span', { class: 'cr-w', t: 'licencia ' + lic + ' día' + (lic === 1 ? '' : 's') + ' hábil' + (lic === 1 ? '' : 'es') })] : null,
        o.pend ? [' · ', h('span', { class: 'cr-apend', t: fmtH(o.pend) + ' a confirmar' })] : null),
      h('div', { class: 'wks' }, ws.map(function(w, i){ const x = o.w[i]; return h('span', { title: 'Semana del ' + fmtC(w) + ' al ' + fmtC(addD(w, 6)) }, fmtC(w) + '–' + fmtC(addD(w, 6)) + ' ', h('b', { t: fmtH(x.h) }), x.s ? [' + sáb ', h('b', { t: fmtH(x.s) })] : null); })));
  })));
  return out;
}

/* == confirmar reemplazos y licencias == */
function opcionesReemp(l, sel){
  const p = ST.M.PM[l.key], grp = p ? p.grp : 'tec';
  const ps = ST.M.P.filter(function(x){ return x.grp === grp && x.key !== l.key && !x.oculta; });
  return [['', '— elegir —']].concat(ps.map(function(x){ return [x.key, ST.C.nm(x)]; })).concat([['__ext', 'Otro (no figura en la planilla)…']]);
}
function periodoRep(x){
  const l = x.l, r = x.r, ds = ST.C.repDays(l, r);
  const lst = ds.length && ds.length <= 10 && ((r.fechas && r.fechas.length) || ST.C.esGuard(l.key));
  if(lst){
    const nocturna = mins(r.h) <= mins(r.d);
    return (nocturna ? (ds.length === 1 ? 'noche del ' : 'noches del ') : (ds.length === 1 ? 'día ' : 'días ')) + ds.map(fmtC).join(', ').replace(/, ([^,]*)$/, ' y $1');
  }
  if(ds.length) return l.hasta ? (ds.length === 1 ? fmtC(ds[0]) : fmtC(ds[0]) + ' al ' + fmtC(ds[ds.length - 1])) + ' · ' + ds.length + ' día' + (ds.length === 1 ? '' : 's') : 'desde ' + fmtC(ds[0]) + ' · sin fecha de regreso';
  return 'sin días a cubrir en el período';
}
function setEst(l, r, est){ r.est = est; A.repCambio(l, r); pintar(); }
function repCard(x){
  const l = x.l, r = x.r, est = x.est, p = ST.M.PM[l.key], edit = puedeEditar(), C_ = ST.C;
  const chk = r.key ? C_.repCheck(l, r) : null;
  let cl = null;
  if(!r.key) cl = h('div', { class: 'cfc w', t: 'Reemplazante externo (no figura en la planilla): no se puede verificar la disponibilidad.' });
  else if(!x.pasado){
    const ks = Object.keys(chk.iss);
    cl = ks.length ? h('div', { class: 'cfc w', t: '⚠ ' + ks.map(function(z){ return nmP(r.key) + ' ' + z + ' (' + chk.iss[z].length + ' día' + (chk.iss[z].length === 1 ? '' : 's') + ', desde ' + fmtC(chk.iss[z][0]) + ')'; }).join(' · ') })
      : h('div', { class: 'cfc g', t: '✔ Sin choques de horario ni licencias cargadas en ' + (chk.ds.length ? 'esos ' + chk.ds.length + ' día' + (chk.ds.length === 1 ? '' : 's') : 'el período') + '.' + (est === 'ok' ? '' : ' Falta tu confirmación con la persona.') });
  }
  const has = chk && Object.keys(chk.iss).length;
  const b = function(e, t, c){ return btn(t, 'sm ' + (c || ''), function(){ setEst(l, r, e); }); };
  const abierto = edit && !!S.ed['r:' + r.id];
  let acts = null;
  if(edit){
    acts = (est === 'ok' ? [b('no', '✖ No puede'), b('', '↺ Volver a por confirmar')] : est === 'no' ? [b('ok', '✔ Confirmar igual'), b('', '↺ Volver a por confirmar')] : [b('ok', has ? '✔ Confirmar igual' : '✔ Confirmar', 'pri'), b('no', '✖ No puede')])
      .concat([btn(abierto ? 'Cerrar editor' : '✎ Editar', 'sm', function(){ S.ed['r:' + r.id] = !abierto; pintar(); }, { 'aria-expanded': abierto ? 'true' : 'false' }),
        btn('🗑 Quitar reemplazo', 'sm dng', function(){ A.repBaja(l, r); pintar(); })]);
  }
  const clsEst = est;
  return h('div', { class: 'cr-cf ' + clsEst, 'data-rep': r.id },
    h('div', { class: 'cft' }, h('div', null, h('b', { s: { cursor: 'pointer' }, on: r.key ? { click: function(){ openPerson(r.key); } } : null, t: C_.rname(r) }), ' cubre a ', h('b', { s: { cursor: 'pointer' }, on: { click: function(){ openPerson(l.key, null, l.id); } }, t: ST.C.nm(p) })),
      h('span', { class: 'sb2', t: est === 'ok' ? 'confirmado' : est === 'no' ? 'no puede' : (x.pasado ? 'a confirmar (período pasado)' : 'a confirmar') })),
    h('div', { class: 'cfm' }, l.tipo + ' · ', h('b', { t: r.d + '–' + r.h }), ' · ' + periodoRep(x) + (r.nota ? ' · ' + r.nota : ''), l.pend ? [' · ', pendMarca('licencia a confirmar')] : null),
    cl, acts ? h('div', { class: 'acts' }, acts) : null,
    edit && !abierto ? entrada('text', r.nota, function(v){ r.nota = v.slice(0, 200); A.repCambio(l, r); }, { class: 'n', placeholder: 'Nota: con quién hablaste y cuándo', maxlength: '200', 'aria-label': 'Nota del reemplazo' }) : null,
    edit && !abierto ? h('details', null, h('summary', { t: 'Cambiar reemplazante' }), h('select', { on: { change: function(ev){
      const v = ev.target.value;
      if(!v || v === '__ext') return;
      r.key = v; r.nombre = ''; r.est = ''; A.repCambio(l, r); pintar();
    } } }, opciones(opcionesReemp(l, r.key).filter(function(o){ return o[0] !== '__ext'; }), ''))) : null,
    abierto ? repEditor(l, r) : null);
}
function renderConf(){
  const C_ = ST.C, all = C_.repAll(), vig = all.filter(function(x){ return !x.pasado; }), pas = all.filter(function(x){ return x.pasado; });
  const by = function(e){ return vig.filter(function(x){ return x.est === e; }); };
  const ord = function(a, b){ return a.l.desde.localeCompare(b.l.desde) || a.r.d.localeCompare(b.r.d); };
  const out = h('div', null, h('div', { class: 'cr-hint', s: { 'margin-bottom': '6px' } },
    'Cada reemplazo pasa por dos controles. ', h('b', { t: '1)' }), ' El sistema revisa lo que está cargado: que el reemplazante no tenga ya turno en ese horario ni licencia. ', h('b', { t: '2)' }),
    ' Vos confirmás con la persona y lo marcás. Todo reemplazo sin confirmar figura como “a confirmar”. En el diagrama, el borde de la celda del reemplazante muestra el estado: ', h('b', { t: 'sólido' }), ' = confirmado, ',
    h('b', { class: 'cr-w', t: 'punteado rojo' }), ' = a confirmar, ', h('b', { class: 'cr-w', t: 'tachado' }), ' = dijo que no puede.'),
    h('div', { class: 'cfs' }, h('span', { class: 'cfp pe' }, h('b', { t: by('pe').length }), 'a confirmar'), h('span', { class: 'cfp ok' }, h('b', { t: by('ok').length }), 'confirmados'), h('span', { class: 'cfp no' }, h('b', { t: by('no').length }), 'no pueden')),
    h('div', { class: 'cr-hint', s: { 'margin-bottom': '6px' }, t: 'Lo que falta confirmar (reemplazos, rechazados y licencias sin reemplazo) está en el cuadro “A confirmar” de arriba: ahí mismo podés confirmar, editar, quitar o pasar días a otra persona.' }));
  if(by('ok').length) poner(out, h('div', { class: 'cr-hsec', t: 'Confirmados' }), by('ok').sort(ord).map(repCard));
  const pasPe = pas.filter(function(x){ return x.est !== 'ok'; }).sort(ord), pasOk = pas.filter(function(x){ return x.est === 'ok'; }).sort(ord);
  if(pasPe.length) poner(out, h('details', { class: 'cr-how', s: { 'margin-top': '14px' } }, h('summary', { t: 'Período pasado sin confirmar (' + pasPe.length + ')' }), pasPe.map(repCard)));
  if(pasOk.length) poner(out, h('details', { class: 'cr-how', s: { 'margin-top': '8px' } }, h('summary', { t: 'Ya realizados y confirmados (' + pasOk.length + ')' }), pasOk.map(repCard)));
  return out;
}
function renderLista(){
  const PM = ST.M.PM, ls = ST.M.L.filter(function(l){ return PM[l.key] && (PM[l.key].grp === 'tec' || PM[l.key].grp === 'adm') && (!S.pf || l.key === S.pf); }).sort(function(a, b){ return b.desde.localeCompare(a.desde); });
  if(!ls.length) return nota('Sin licencias cargadas.');
  if(enEdicion()) return h('div', null, ls.map(function(l){ return h('div', { class: 'cr-ledit' }, h('b', { class: 'cr-lnom', t: nmP(l.key) }), licFila(l)); }));
  return h('div', null, ls.map(function(l){
    return h('div', { class: 'cr-dl', 'data-lic': l.id, on: { click: function(){ openPerson(l.key, null, l.id); } } }, h('b', { t: nmP(l.key) }), ' · ' + l.tipo + ' · ' + fmtF(l.desde) + (l.hasta ? ' al ' + fmtF(l.hasta) : ' · sin fecha de regreso'),
      l.pend ? [' ', pendMarca()] : null, l.obs ? h('small', { class: 'cr-mut', t: ' · ' + l.obs }) : null,
      l.reemps.length ? l.reemps.map(function(r){ return h('div', { class: 'rr' }, 'Reemplaza: ', h('b', { t: ST.C.rname(r) }), ' · ' + r.d + '–' + r.h, ST.C.repEst(r) !== 'ok' ? [' ', pendMarca(ESTTXT[ST.C.repEst(r)])] : null); }) : h('div', { class: 'rr no', t: 'Sin reemplazo definido.' }));
  }));
}

/* == Tomografía: guardias de Hospital Central + cambios == */
const TC_INF = 'Informa', TC_URG = 'Urgencias';
function tcCambio(d, tipo){
  const l = ST.M.TC.cambios.filter(function(c){ return c.fecha === d && c.nota === tipo; }).sort(function(a, b){ return a.at < b.at ? 1 : -1; });
  return l[0] || null;
}
function tcDay(d){
  const wd = wdOf(d), fer = ST.M.FER[d], we = wd >= 5, hc = ST.M.TC.cal[d] || '';
  const b = tcCambio(d, TC_INF), u = tcCambio(d, TC_URG), r4 = we || !!fer;
  return { wd: wd, fer: fer, we: we, r4: r4, hc: hc, inf: b ? b.nuevo : '', urg: u ? u.nuevo : (r4 ? '' : hc), cb: b, cu: u,
    urgT: r4 ? 'Urgente todo el día' : 'Urgente 20–23:59' };
}
function tcMonths(){ const o = {}; Object.keys(ST.M.TC.cal).forEach(function(k){ const q = k.slice(0, 7); o[q] = (o[q] || 0) + 1; }); return o; }
function tcLoaded(y, mo){ return tcMonths()[y + '-' + pad(mo + 1)] || 0; }
function tcGuardar(fecha, medico){ ST.M.TC.cal[fecha] = medico; marcarSucio(); }
function tcQuitar(fecha){ delete ST.M.TC.cal[fecha]; marcarSucio(); }
function escribirTc(fecha, medico){
  return encolar(async function(){
    const v = ST.M.TC.calV[fecha];
    const r = await ST.puente.rpc('img_cron_guardar', { p_entidad: 'tc', p_dato: { fecha: fecha, medico: medico }, p_version: v === undefined ? null : v });
    ST.M.TC.calV[fecha] = r.version;
  });
}
function borrarTc(fecha){
  return encolar(async function(){
    await ST.puente.rpc('img_cron_borrar', { p_entidad: 'tc', p_id: fecha, p_version: ST.M.TC.calV[fecha] });
    delete ST.M.TC.calV[fecha];
  });
}
function tcCambioGuardar(d, tipo, def, valor){
  const ex = tcCambio(d, tipo);
  if(valor === def || !valor){
    if(ex){ ST.M.TC.cambios.splice(ST.M.TC.cambios.indexOf(ex), 1); borrarFila('tc_cambio', ex); }
    return;
  }
  if(ex){ ex.nuevo = valor; ex.antes = def; guardarFila('tc_cambio', ex, function(){ return { fecha: d, medico_antes: def, medico_nuevo: valor, nota: tipo }; }); }
  else {
    const c = { id: nuevoTmp(), ver: 1, fecha: d, antes: def, nuevo: valor, nota: tipo, at: new Date().toISOString() };
    ST.M.TC.cambios.push(c);
    guardarFila('tc_cambio', c, function(){ return { fecha: d, medico_antes: def, medico_nuevo: valor, nota: tipo }; });
  }
}
function tcEdit(ev, d){
  ev.stopPropagation();
  limpiarPop();
  const x = tcDay(d), r = ev.currentTarget.getBoundingClientRect(), edit = puedeEditar();
  S.pop = { tc: d, t: Date.now() };
  const ib = h('input', { type: 'text', value: x.inf, maxlength: '160', disabled: !edit, 'aria-label': 'Informa Tomografía' });
  const iu = h('input', { type: 'text', value: x.urg, maxlength: '160', disabled: !edit, 'aria-label': 'Urgencias' });
  const defU = x.r4 ? '' : x.hc;
  const e = h('div', { id: 'cr-pop', class: 'cr-pop', role: 'dialog' },
    h('button', { type: 'button', class: 'x2', title: 'Cerrar', on: { click: limpiarPop }, t: '✕' }),
    h('h4', { t: DIAS[x.wd] + ' ' + fmtC(d) + (x.fer ? ' · feriado' : '') }),
    h('div', { class: 'sb', t: (x.fer ? 'Feriado: ' + x.fer + '. ' : '') + (edit ? 'Cambios de último momento sobre quién informa o quién cubre las urgencias.' : 'Solo lectura.') }),
    h('label', { class: 'cr-hint', t: 'Informa Tomografía (00:00–23:59)' }), ib,
    h('label', { class: 'cr-hint', t: x.urgT.replace('Urgente', 'Urgentes') + (x.r4 ? ' (00:00–23:59)' : '') }), iu,
    x.hc && x.r4 ? h('div', { class: 'ln cr-mut', t: 'Cronograma mensual Hosp. Central ese día: ' + x.hc }) : null,
    x.r4 && !x.cu ? h('div', { class: 'ln cr-mut', t: 'Urgencias de fin de semana y feriados: R4. Los nombres de las R4 están a confirmar.' }) : null,
    edit ? h('div', { class: 'acts' }, btn('Guardar', 'pri sm', function(){
      tcCambioGuardar(d, TC_INF, '', ib.value.trim());
      tcCambioGuardar(d, TC_URG, defU, iu.value.trim());
      limpiarPop(); pintar();
    }), (x.cb || x.cu) ? btn('Volver al cronograma', 'sm dng', function(){
      if(x.cb) tcCambioGuardar(d, TC_INF, '', '');
      if(x.cu) tcCambioGuardar(d, TC_URG, defU, '');
      limpiarPop(); pintar();
    }) : null) : null);
  abrirPop(e, r);
}
function ubicarPop(e, r){
  const w = e.offsetWidth, hh_ = e.offsetHeight;
  let top = r.top - hh_ - 8;
  if(top < 8) top = r.bottom + 8;
  if(top + hh_ > window.innerHeight - 8) top = Math.max(8, window.innerHeight - hh_ - 8);
  e.style.top = top + 'px';
  e.style.left = Math.max(10, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 10)) + 'px';
}
function tcNorm(n){
  n = n.replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').replace(/[\s.\-–,;:]+$/, '').trim();
  return n.toLowerCase().replace(/(^|[\s\/(])([a-záéíóúüñ])/g, function(m_, a, b){ return a + b.toUpperCase(); }).replace(/\bR4\b/gi, 'R4').replace(/\bBastias\b/g, 'Bastías');
}
function tcParse(text, y, mo){
  const dim = dimOf(y, mo), map = {}, warn = [];
  const put = function(d, n, src){
    n = tcNorm(n);
    if(!n) return;
    if(d < 1 || d > dim){ warn.push('Día ' + d + ' no existe en ' + MESES[mo] + ' (' + src.slice(0, 30) + ')'); return; }
    const k = iso(y, mo, d);
    if(map[k] && map[k] !== n){ warn.push('Día ' + d + ' repetido: me quedé con ' + map[k] + ' (también aparece ' + n + ')'); return; }
    map[k] = n.slice(0, 160);
  };
  const rows = text.replace(/\r/g, '').split(/\n/);
  let explicit = 0;
  rows.forEach(function(l){
    const m1 = l.match(/^\s*(\d{4})-(\d{2})-(\d{2})\s*[;,\t:\-–]?\s*(.+)$/), m2 = l.match(/^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[;,\t:\-–]?\s*(.+)$/);
    if(m1){ explicit++; if(+m1[1] === y && +m1[2] - 1 === mo) put(+m1[3], m1[4], l.trim()); else warn.push('Fecha de otro mes ignorada: ' + l.trim().slice(0, 40)); }
    else if(m2){ explicit++; const yy = m2[3] ? (+m2[3] < 100 ? 2000 + (+m2[3]) : +m2[3]) : y; if(yy === y && +m2[2] - 1 === mo) put(+m2[1], m2[4], l.trim()); else warn.push('Fecha de otro mes ignorada: ' + l.trim().slice(0, 40)); }
  });
  if(!explicit){
    const re = /(\d{1,2})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\/ .'\-]*?)(?=\s+\d{1,2}(?:\s|$)|$)/g;
    rows.forEach(function(r){ r.split(/[;\t,|]/).forEach(function(ch){ ch = ch.trim(); if(!ch) return; let q; re.lastIndex = 0; while((q = re.exec(ch))) put(+q[1], q[2], ch); }); });
  }
  const miss = [];
  for(let d = 1; d <= dim; d++) if(!map[iso(y, mo, d)]) miss.push(d);
  return { y: y, mo: mo, map: map, warn: warn, miss: miss, dim: dim };
}
function tcDetect(t){ const m = t.match(new RegExp('(' + MN.join('|') + ')\\s*(?:de\\s*)?(20\\d\\d)', 'i')); return m ? { mo: MN.indexOf(m[1].toLowerCase()), y: +m[2] } : null; }
function tcAplicar(){
  const r = S.tcPrev;
  if(!r) return;
  const pref = r.y + '-' + pad(r.mo + 1);
  Object.keys(ST.M.TC.cal).filter(function(k){ return k.indexOf(pref) === 0 && !r.map[k]; }).forEach(tcQuitar);
  Object.keys(r.map).forEach(function(k){ if(ST.M.TC.cal[k] !== r.map[k]) tcGuardar(k, r.map[k]); });
  S.y = r.y; S.m = r.mo; S.tcPrev = null; S.tcUp = false;
  pintar();
}
function tcInterp(refs){
  const t = refs.ta.value, det = tcDetect(t);
  if(det){ refs.y.value = det.y; refs.m.value = det.mo; }
  const y = +refs.y.value, mo = +refs.m.value, prev = refs.prev;
  vaciar(prev);
  if(!t.trim()){ poner(prev, h('div', { class: 'msg', t: 'Pegá el cronograma o elegí un archivo.' })); S.tcPrev = null; return; }
  const r = tcParse(t, y, mo), n = Object.keys(r.map).length, WL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  S.tcPrev = n ? r : null;
  poner(prev, h('div', { class: 'cr-hint', s: { margin: '6px 0' } }, h('b', { t: MESES[mo] + ' ' + y }), ': interpreté ', h('b', { t: n + ' de ' + r.dim }), ' días' + (det ? ' (mes detectado en el archivo)' : '') + '.'));
  if(r.miss.length && n) poner(prev, h('div', { class: 'msg', t: 'Sin médico en los días: ' + r.miss.join(', ') + '.' }));
  r.warn.slice(0, 6).forEach(function(w){ poner(prev, h('div', { class: 'msg', t: w + '.' })); });
  if(n){
    poner(prev, h('div', { class: 'cr-tcpv' }, Object.keys(r.map).map(function(k){ return h('span', null, h('b', { t: +k.slice(8) }), ' ' + WL[new Date(k + 'T12:00:00').getDay()] + ' · ' + r.map[k]); })));
    poner(prev, btn('Cargar ' + MESES[mo] + ' ' + y + (tcLoaded(y, mo) ? ' (reemplaza el actual)' : ''), 'pri sm', tcAplicar, { 'data-tc-cargar': '1' }));
  } else poner(prev, h('div', { class: 'msg', t: 'No pude interpretar ningún día. Probá con el formato “2026-11-03;Apellido”.' }));
}
function cargarXlsx(cb, fallo_){
  if(window.XLSX) return cb();
  const sc = document.createElement('script');
  sc.src = 'xlsx.min.js';
  sc.onload = cb; sc.onerror = fallo_;
  document.head.appendChild(sc);
}
function tcArchivo(inp, refs){
  const f = inp.files[0];
  if(!f) return;
  const ext = f.name.split('.').pop().toLowerCase(), rd = new FileReader();
  if(ext === 'xlsx' || ext === 'xls'){
    refs.msg.textContent = 'Leyendo Excel…';
    cargarXlsx(function(){
      rd.onload = function(e){
        const wb = window.XLSX.read(e.target.result, { type: 'array' });
        let txt = '';
        wb.SheetNames.forEach(function(n){
          const rs = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }).map(function(r){ return r.map(function(c){ return String(c).replace(/\s*\n\s*/g, ' ').trim(); }); });
          for(let i = 0; i < rs.length; i++){
            const nums = rs[i].filter(function(c){ return /^\d{1,2}$/.test(c); }).length;
            if(nums >= 3 && rs[i + 1]){
              rs[i].forEach(function(c, ci){ if(/^\d{1,2}$/.test(c)){ const nmv = rs[i + 1][ci] || ''; if(nmv && !/^\d+$/.test(nmv)) txt += c + ' ' + nmv + '\n'; } });
              i++;
            } else txt += rs[i].join('\t') + '\n';
          }
        });
        refs.ta.value = txt; refs.msg.textContent = ''; tcInterp(refs);
      };
      rd.readAsArrayBuffer(f);
    }, function(){ refs.msg.textContent = 'No pude cargar el lector de Excel. Guardá el archivo como CSV o pegá el texto del calendario.'; });
  } else { rd.onload = function(e){ refs.ta.value = String(e.target.result).slice(0, 20000); tcInterp(refs); }; rd.readAsText(f); }
}
function tcSubida(){
  const refs = {};
  refs.m = h('select', { id: 'cr-tc-m', on: { change: function(){ tcInterp(refs); } } }, opciones(MESES.map(function(x, i){ return [i, x]; }), S.m));
  refs.y = h('input', { type: 'number', id: 'cr-tc-y', value: S.y, on: { change: function(){ tcInterp(refs); } } });
  refs.msg = h('div', { class: 'msg', s: { 'margin-top': '6px' } });
  refs.prev = h('div', { id: 'cr-tc-prev' });
  let tt = null;
  refs.ta = h('textarea', { id: 'cr-tc-t', rows: '5', placeholder: 'Pegá acá el cronograma…', class: 'cr-ta', on: { input: function(){ clearTimeout(tt); tt = setTimeout(function(){ tcInterp(refs); }, 350); } } });
  return h('div', { class: 'cr-card inner' },
    h('div', { class: 'cr-hint', s: { 'margin-bottom': '6px' } }, 'Subí un archivo ', h('b', { t: '.xlsx, .csv o .txt' }), ' o pegá el texto. Formatos: ', h('b', { t: 'una línea por día' }), ' (“2026-11-03;Apellido” o “3/11 Apellido”) o el calendario completo (“5 CAMPI/MERCADO”). Si el archivo dice el mes (“Noviembre 2026”) lo detecto solo.'),
    h('div', { class: 'r2c' }, campo('Mes', refs.m), campo('Año', refs.y)),
    h('div', { s: { margin: '8px 0' } }, h('input', { type: 'file', accept: '.xlsx,.xls,.csv,.txt', 'aria-label': 'Archivo del cronograma', on: { change: function(ev){ tcArchivo(ev.target, refs); } } })),
    refs.ta,
    h('div', { s: { display: 'flex', gap: '6px', 'margin-top': '6px' } }, btn('Interpretar', 'sm', function(){ tcInterp(refs); }), btn('Rellenar plantilla del mes', 'sm', function(){
      const y = +refs.y.value, mo = +refs.m.value;
      refs.ta.value = monthDays(y, mo).map(function(d){ return d + ';'; }).join('\n');
      vaciar(refs.prev); poner(refs.prev, h('div', { class: 'cr-hint', t: 'Completá el nombre después del “;” en cada día y apretá Interpretar.' }));
    })), refs.msg, refs.prev);
}
function renderTcg(){
  const ds = monthDays(S.y, S.m), off = (new Date(S.y, S.m, 1).getDay() + 6) % 7, WL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], nar = esAngosto(), lo = tcLoaded(S.y, S.m), edit = puedeEditar();
  const cell = function(d){
    const x = tcDay(d), ch = (x.cb || x.cu) ? ' ch' : '';
    const infTxt = x.inf ? h('strong', { t: x.inf }) : h('strong', null, pendMarca('a confirmar'));
    const urgTxt = x.urg ? x.urg : (x.r4 ? null : (lo ? h('i', { t: 'sin asignar' }) : h('i', { t: 'sin cronograma' })));
    return h('div', { class: 'cr-tcd' + (x.we ? ' we' : '') + (x.fer ? ' fer' : '') + ch, tabindex: '0', role: 'button', 'data-tc': d, title: 'Tocá para ver',
      on: { click: function(ev){ tcEdit(ev, d); }, keydown: function(ev){ if(ev.key === 'Enter') tcEdit(ev, d); } } },
      h('div', { class: 'tcn' }, nar ? [h('b', { t: +d.slice(8) }), DIAS[x.wd].slice(0, 3)] : h('span', { t: +d.slice(8) }), x.fer ? h('em', { t: 'feriado' }) : null),
      h('div', null, h('div', { class: 'tci big', s: { '--h': 255 } }, h('small', { t: 'Hospital Italiano · informa 24 h' }), infTxt),
        h('div', { class: 'tcu' }, h('small', { t: x.urgT + (x.we || x.fer ? '' : ' · H. Central') }), urgTxt === null ? ['R4 ', pendMarca('nombres a confirmar')] : urgTxt),
        x.hc && x.r4 ? h('div', { class: 'tch' }, h('small', { t: 'Cronograma H. Central' }), x.hc) : null));
  };
  const fer = ds.filter(function(d){ return ST.M.FER[d]; }).length;
  const out = h('div');
  poner(out, h('div', { class: 'cr-hsec', s: { 'margin-top': '2px' }, t: 'Médicos del Hospital Italiano · guardia fija' }),
    nota('Pendiente de carga (a confirmar): quién informa cada día de la semana, las notas del calendario mensual y quiénes son las R4 de fines de semana y feriados. Mientras tanto figuran “a confirmar” y no se asume ningún nombre.'));
  poner(out, h('div', { class: 'cr-hsec', t: 'Hospital Central · cronograma mensual (urgencias 20:00–23:59, lunes a viernes)' }));
  const meses = Object.keys(tcMonths()).sort();
  poner(out, h('div', { s: { display: 'flex', 'flex-wrap': 'wrap', gap: '6px', 'align-items': 'center', 'margin-bottom': '6px' } },
    meses.length ? meses.map(function(q){ const p = q.split('-'); return h('span', { class: 'cfp ok', s: { cursor: 'pointer' }, title: 'Ver ese mes', on: { click: function(){ S.y = +p[0]; S.m = +p[1] - 1; pintar(); } } }, h('b', { t: MESES[+p[1] - 1].slice(0, 3) + ' ' + p[0] }), tcMonths()[q] + ' días'); }) : h('span', { class: 'cr-hint', t: 'Todavía no hay cronogramas cargados.' }),
    edit ? btn(S.tcUp ? 'Cerrar' : '+ Subir cronograma del mes', 'sm pri', function(){ S.tcUp = !S.tcUp; S.tcPrev = null; pintar(); }) : null,
    edit && lo ? btn('Quitar ' + MN[S.m], 'sm dng', function(){ Object.keys(ST.M.TC.cal).filter(function(k){ return k.indexOf(S.y + '-' + pad(S.m + 1)) === 0; }).forEach(tcQuitar); pintar(); }) : null));
  if(!lo && !S.tcUp) poner(out, nota('Falta el cronograma del Hospital Central de ' + MESES[S.m] + ' ' + S.y + ': las urgencias de lunes a viernes aparecen “sin cronograma”.'));
  if(S.tcUp && edit) poner(out, tcSubida());
  poner(out, h('details', { class: 'cr-how' }, h('summary', { t: 'Reglas del cronograma' }),
    h('p', null, h('b', { t: 'Urgencias: ' }), 'de lunes a viernes de 20:00 a 23:59 las informa el médico del Hospital Central del cronograma mensual; sábados, domingos y ', h('b', { t: 'feriados, todo el día' }), ', las R4 (' + fer + ' feriado' + (fer === 1 ? '' : 's') + ' este mes). ',
      h('b', { t: 'Informa: ' }), 'el médico del Hospital Italiano de 00:00 a 23:59.')));
  poner(out, h('div', { class: 'cr-hsec', t: 'Calendario de ' + MESES[S.m] + ' ' + S.y }), h('div', { class: 'cr-hint', s: { 'margin-bottom': '6px' }, t: edit ? 'Tocá un día para cambiar quién informa o quién cubre las urgencias.' : 'Tocá un día para ver el detalle.' }));
  if(nar) poner(out, h('div', { class: 'cr-tcl' }, ds.map(cell)));
  else {
    const g = h('div', { class: 'cr-tcg' }, WL.map(function(x){ return h('b', { class: 'wh', t: x }); }));
    for(let i = 0; i < off; i++) poner(g, h('span'));
    ds.forEach(function(d){ poner(g, cell(d)); });
    poner(out, g);
  }
  return out;
}
/* == Eco/Doppler: se lee de img_agenda (img_cronograma), solo lectura acá == */
function ecoTurnos(){ return Array.isArray(ST.eco) ? ST.eco : []; }
function ecoNombre(t){
  const PM = ST.M.PM;
  if(t.es_residentes){
    const ns = (t.residentes || []).map(function(r){ return PM[r.persona_id]; }).filter(Boolean).map(function(p){ return p.anio ? p.ap + ' R' + p.anio : p.ap; });
    return { lab: 'Residentes', sub: ns.length ? ns.join(', ') : 'Sin asignar' };
  }
  const p = t.persona_id ? PM[t.persona_id] : null;
  return { lab: p ? p.ap : '?', sub: 'Consultorio ' + t.cons };
}
function ecoDia(dia){
  const items = ecoTurnos().filter(function(t){ return +t.dia === dia && (!S.pf || t.persona_id === S.pf || (S.pf === 'res' && t.es_residentes)); }).map(function(t){
    const n = ecoNombre(t);
    return { eco: true, t: t, lane: 'c' + t.cons, k: t.es_residentes ? 'res' : t.persona_id, d: hm(t.desde), h: hm(t.hasta), lab: n.lab, sub: n.sub, cls: 'eco c' + t.cons };
  });
  return { items: items, strip: [] };
}
function ecoOpts(){
  const cs = Array.from(new Set(ecoTurnos().map(function(t){ return +t.cons; }).concat([1, 2]))).sort();
  const lab = {};
  cs.forEach(function(c){ lab['c' + c] = 'Cons. ' + c; });
  return { lanes: cs.map(function(c){ return 'c' + c; }), laneLab: lab, nombreTab: 'Eco/Doppler' };
}
function ecoPersonas(){
  const ids = new Set(ecoTurnos().filter(function(t){ return t.persona_id; }).map(function(t){ return t.persona_id; }));
  return ST.M.P.filter(function(p){ return ids.has(p.key); });
}
function openEco(i){
  const t = i.t, n = ecoNombre(t), PM = ST.M.PM;
  const cuerpo = [h('p', { t: DIAS[+t.dia] + ' · ' + i.d + '–' + i.h + ' · Consultorio ' + t.cons })];
  if(t.es_residentes){
    (t.residentes || []).forEach(function(r){
      const p = PM[r.persona_id];
      cuerpo.push(h('p', { t: (p ? p.ap + (p.nom ? ' ' + p.nom : '') : '?') + ((r.estudios || []).length ? ' · ' + r.estudios.join(', ') : '') }));
    });
    if(!(t.residentes || []).length) cuerpo.push(h('p', { t: 'Sin residentes asignados.' }));
  } else cuerpo.push(h('p', { t: n.lab }));
  cuerpo.push(h('p', { class: 'cr-hint', t: 'Eco/Doppler se edita en Médicos › Cronograma Ecografía/Doppler.' }));
  ST.puente.dialogo({ titulo: 'Eco/Doppler', clase: 'aviso', cuerpo: cuerpo, botones: [{ texto: 'Cerrar', clase: 'ed-btn prim', alClic: function(c){ c.cerrar(); } }] });
}

/* == alertas, pendientes y KPIs == */
function fs5(d){ return fmtC(d); }
function listaCorta(arr, n){ return arr.slice(0, n).join(', ') + (arr.length > n ? '…' : ''); }
function alertasDe(scope){
  const C_ = ST.C, M = ST.M, PM = M.PM, hoy = ST.puente.hoy(), al = [];
  const inc = function(t){ return scope === 'todo' || scope === t; };
  const w = function(pre, txt, go){ al.push({ w: pre, txt: txt, go: go || null }); };
  const grpScope = function(k){
    const g = PM[k] && PM[k].grp;
    return scope === 'todo' ? (g === 'tec' || g === 'adm') : g === (scope === 'tec' ? 'tec' : scope === 'adm' ? 'adm' : '-');
  };
  if(inc('tec') || inc('adm')){
    const mine = M.L.filter(function(l){ return grpScope(l.key); }), lim = addD(hoy, 60);
    mine.filter(function(l){ return !l.hasta; }).forEach(function(l){ w('Sin fecha de regreso: ', nmP(l.key) + ', ' + l.tipo + ' desde ' + fmtF(l.desde) + '.'); });
    mine.filter(function(l){ return C_.lend(l) >= hoy && l.desde <= lim && !l.reemps.length; }).forEach(function(l){
      w('Sin reemplazo: ', nmP(l.key) + ', ' + l.tipo + ' ' + fmtF(l.desde) + '–' + (l.hasta ? fmtF(l.hasta) : 'sin fecha de regreso') + '.', { sub: 'licencias', vista: 'conf' });
    });
    mine.forEach(function(l){
      l.reemps.forEach(function(r){
        if(!r.key) return;
        const c = M.L.find(function(x){ return x.key === r.key && x.id !== l.id && x.tipo !== 'Cambio de turno' && x.desde <= C_.lend(l) && l.desde <= C_.lend(x); });
        if(c) w('Reemplazante de licencia: ', nmP(r.key) + ' cubre a ' + nmP(l.key) + ' pero tiene ' + c.tipo + ' ' + fmtF(c.desde) + '–' + (c.hasta ? fmtF(c.hasta) : 'sin fecha de regreso') + '.');
      });
    });
    const rp = C_.repAll().filter(function(x){ return !x.pasado && (x.est === 'pe' || x.est === 'no') && grpScope(x.l.key); });
    const pe = rp.filter(function(x){ return x.est === 'pe'; }), no = rp.filter(function(x){ return x.est === 'no'; });
    if(no.length) w('Reemplazo rechazado (' + no.length + '): ', no.map(function(x){ return C_.rname(x.r) + ' no puede cubrir a ' + apP(x.l.key) + ' ' + x.r.d + '–' + x.r.h; }).join('; ') + '. Hay que buscar otro.', { sub: 'licencias', vista: 'conf' });
    if(pe.length) w('Reemplazos sin confirmar (' + pe.length + '): ', listaCorta(pe.map(function(x){ return C_.rname(x.r) + ' → ' + apP(x.l.key) + ' (' + (x.r.fechas && x.r.fechas.length ? x.r.fechas.map(fs5).join(', ') : fs5(x.l.desde) + (x.l.hasta ? '–' + fs5(x.l.hasta) : '…')) + ' ' + x.r.d + '–' + x.r.h + ')'; }), 6), { sub: 'licencias', vista: 'conf' });
    mine.forEach(function(l){
      C_.repConflicts(l).forEach(function(c){ w('Reemplazante ocupado: ', nmP(c.r.key) + ' cubre a ' + nmP(l.key) + ' ' + c.r.d + '–' + c.r.h + ' pero ya trabaja en ese horario ' + c.n + ' día' + (c.n === 1 ? '' : 's') + ' (desde ' + fs5(c.first) + ').'); });
    });
  }
  if(inc('tec')){
    const unc = M.G.filter(function(g){ return g.fecha >= hoy; }).filter(function(g){
      const l = C_.licOn(g.key, g.fecha);
      if(!l) return false;
      return !l.reemps.some(function(r){ return C_.repOn(r, l, g.fecha) && r.d === TURN[g.t][0] && r.h === TURN[g.t][1] && (r.key || r.nombre); });
    }).sort(function(a, b){ return a.fecha.localeCompare(b.fecha); });
    if(unc.length) w('Guardias sin reemplazante (' + unc.length + '): ', listaCorta(unc.map(function(g){ return apP(g.key) + ' ' + fs5(g.fecha) + ' ' + DL[g.t].toLowerCase(); }), 8) + '.', { sub: 'licencias', vista: 'conf' });
    const miss = [];
    monthDays(S.y, S.m).filter(function(d){ return d >= hoy; }).forEach(function(d){
      const dd = C_.dayData('tec', d, null), needD = wdOf(d) === 6 || !!M.FER[d];
      const has = function(x){
        return dd.items.some(function(i){ return (i.kind === 'w' || i.kind === 'lic' || i.kind === 'rep') && i.d && letterOf(i.d, i.h) === x && (i.f ? i.f.g : true) && (i.kind !== 'w' || (i.f && i.f.g) || i.kind === 'rep'); });
      };
      if(!has('N')) miss.push(fs5(d) + ' noche');
      if(needD && !has('D')) miss.push(fs5(d) + ' día');
    });
    if(miss.length) w('Sin guardia asignada (' + miss.length + '): ', listaCorta(miss, 10) + '.', { sub: 'tecnicos', vista: 'diag' });
    const over = [];
    C_.horasData(S.y, S.m, null).forEach(function(o){
      o.wk.forEach(function(x, i){ if(x > 48) over.push(C_.nm(o.p) + ' (' + (+o.wkDias[i][0].slice(8)) + '–' + (+o.wkDias[i][o.wkDias[i].length - 1].slice(8)) + ': ' + fmtH(x) + ')'); });
    });
    if(over.length) w('Más de 48 h en la semana (' + over.length + '): ', listaCorta(over, 8) + '.', { sub: 'tecnicos', vista: 'horas' });
  }
  if(inc('adm')){
    const q = C_.admPeak(S.y, S.m);
    if(q.bad.length) w('Más de 2 personas en simultáneo (hay 2 lugares de atención): ', listaCorta(q.bad.map(function(x){ return DIAS[wdOf(x.d)].slice(0, 3) + ' ' + fs5(x.d) + ' (' + x.who.join(', ') + ')'; }), 6) + '.', { sub: 'administrativos', vista: 'sems' });
  }
  if(inc('tc')){
    const lo = tcLoaded(S.y, S.m);
    if(!lo) w('Falta el cronograma del Hospital Central de ' + MESES[S.m] + ' ' + S.y + '. ', 'Subilo en “Guardias de Tomografía”.', { sub: 'tc', vista: 'tcg' });
    else {
      const sin = monthDays(S.y, S.m).filter(function(d){ return d >= hoy; }).filter(function(d){ const x = tcDay(d); return !x.inf || !x.urg; }).map(fs5);
      if(sin.length) w('Tomografía sin médico asignado (' + sin.length + '): ', listaCorta(sin, 8) + '.', { sub: 'tc', vista: 'tcg' });
    }
    const n = M.TC.cambios.filter(function(c){ return c.fecha.indexOf(S.y + '-' + pad(S.m + 1)) === 0; }).length;
    if(n) w('Cambios manuales en guardias de Tomografía este mes: ', n + ' registro' + (n === 1 ? '' : 's') + '.');
  }
  if(scope === 'todo' || scope === 'tec' || scope === 'adm'){
    const ext = Array.from(new Set(M.L.filter(function(l){ return grpScope(l.key); }).reduce(function(a, l){
      return a.concat(l.reemps.filter(function(r){ return !r.key && r.nombre; }).map(function(r){ return r.nombre; }));
    }, [])));
    if(ext.length) w('', 'Reemplazantes que no figuran en la planilla de personal: ' + ext.join(', ') + '.');
  }
  return al;
}
/* inventario de datos "a confirmar": lo marcado pendiente en la base + lo que el seed no cargó */
function pendientesDe(){
  const M = ST.M, o = [];
  const porTab = {};
  M.F.filter(function(f){ return f.pend; }).forEach(function(f){ const n = TN[f.tab] || f.tab; porTab[n] = (porTab[n] || 0) + 1; });
  Object.keys(porTab).forEach(function(n){ o.push('Horarios a confirmar en ' + n + ': ' + porTab[n] + ' franja' + (porTab[n] === 1 ? '' : 's') + '.'); });
  const gp = M.G.filter(function(g){ return g.pend; }).length;
  if(gp) o.push('Guardias de técnicos a confirmar: ' + gp + '.');
  const lp = M.L.filter(function(l){ return l.pend; });
  if(lp.length) o.push('Licencias a confirmar: ' + lp.map(function(l){ return nmP(l.key) + ' (' + l.tipo + ')'; }).join(', ') + '.');
  const rs = ST.C.repAll().filter(function(x){ return !x.est || x.est === 'pe'; }).length;
  if(rs) o.push('Reemplazos sin estado definido: ' + rs + '.');
  if(!M.TC.cambios.length && !Object.keys(M.TC.cal).length) o.push('Tomografía: cronograma mensual del Hospital Central sin cargar.');
  o.push('Tomografía: quién informa cada día de la semana, las notas del calendario y los nombres de las R4 de fines de semana y feriados no están cargados (a confirmar).');
  o.push('Tomografía: guardias de Ismael y Hualpa sin cargar (a confirmar).');
  o.push('Técnicos de Resonancia Magnética: sin cargar (a confirmar).');
  o.push('Administrativos: régimen semanal de cada persona sin cargar (a confirmar).');
  if(puedeEditar() && !ST.R.tarifas) o.push('Pago de técnicos: tarifas sin cargar (a confirmar).');
  return o;
}
function kpisDe(){
  const t = tabAct(), C_ = ST.C, M = ST.M, hoy = ST.puente.hoy();
  const ps = (t === 'eco' ? ecoPersonas() : C_.people(t)).filter(function(p){ return p.key !== 'res'; });
  const mk = S.y + '-' + pad(S.m + 1);
  if(S.sub === 'tc'){
    const lo = tcLoaded(S.y, S.m), dim = dimOf(S.y, S.m), fer = monthDays(S.y, S.m).filter(function(d){ return M.FER[d]; }).length;
    return [['Días con cronograma', lo + ' / ' + dim, MESES[S.m], !lo], ['Feriados del mes', fer, 'urgencias R4 todo el día', false], ['Cambios manuales', M.TC.cambios.filter(function(c){ return c.fecha.indexOf(mk) === 0; }).length, 'este mes', false]];
  }
  const reales = ps, onL = reales.filter(function(p){ const q = C_.licOn(p.key, hoy); return q && q.tipo !== 'Cambio de turno'; });
  const lim = addD(hoy, 60), mine = M.L.filter(function(l){ return reales.some(function(p){ return p.key === l.key; }); });
  const nor = mine.filter(function(l){ return C_.lend(l) >= hoy && l.desde <= lim && !l.reemps.length; });
  const k = [];
  if(t === 'adm'){ const q = C_.admPeak(S.y, S.m); k.push(['Máx. en simultáneo', q.n, 'de 2 lugares de atención', q.n > 2]); }
  else if(t === 'tec'){
    const gm = M.G.filter(function(g){ return g.fecha.indexOf(mk) === 0; });
    k.push(['Guardias de 12 h este mes', gm.length, gm.filter(function(g){ return g.t === 'N'; }).length + ' noches · ' + gm.filter(function(g){ return g.t === 'D'; }).length + ' de día', false]);
    const a = C_.repAll().filter(function(x){ return !x.pasado; }), n = a.filter(function(x){ return x.est !== 'ok'; }).length;
    k.push(['Reemplazos por confirmar', n, 'de ' + a.length + ' vigentes', n > 0]);
  } else if(t === 'eco'){
    k.push(['Turnos cargados', ecoTurnos().length, 'en Eco/Doppler', false]);
  } else {
    const fr = M.F.filter(function(f){ return f.tab === t && (!S.pf || f.key === S.pf); });
    k.push(['Horas por semana', fr.length ? dhx(hrsDe(fr)) : '—', S.pf ? nmP(S.pf) : 'con agenda cargada', false]);
    const withA = new Set(M.F.filter(function(f){ return f.tab === t; }).map(function(f){ return f.key; }));
    k.push(['Personas con agenda', withA.size + ' / ' + reales.length, 'cargadas', false]);
  }
  k.push(['De licencia hoy', onL.length, onL.length ? onL.map(function(p){ return p.ap; }).join(', ') : 'nadie', false]);
  if(t !== 'eco') k.push(['Licencias sin reemplazo', nor.length, 'próximos 60 días', nor.length > 0]);
  return k;
}

/* == personal del servicio (lista lateral) == */
function renderPersonal(){
  const t = tabAct(), C_ = ST.C, hoy = ST.puente.hoy();
  const ps = (t === 'eco' ? ecoPersonas() : C_.people(t)).filter(function(p){ return p.key !== 'res'; });
  const box = h('div', { class: 'cr-card' }, h('h3', { t: 'Personal · ' + TN[t] }));
  if(!ps.length) poner(box, h('div', { class: 'cr-hint', t: 'Sin personal para mostrar.' }));
  ps.forEach(function(p){
    const own = ST.M.F.filter(function(f) { return f.key === p.key && f.tab === t; }), l = C_.licOn(p.key, hoy);
    const txt = l ? (l.tipo === 'Cambio de turno' ? 'cambio de turno' : 'licencia' + (l.hasta ? ' hasta ' + fmtC(l.hasta) : ' abierta')) :
      own.length ? (t === 'tec' || t === 'adm' ? Array.from(new Set(own.map(function(f){ return DIAS[f.dia].slice(0, 3); }))).join(' · ') : dhx(hrsDe(own))) :
      (C_.esGuard(p.key) ? 'guardias' : 'sin agenda');
    const quitar = enEdicion() && tabEditable(t) && own.length;
    poner(box, h('div', { class: 'cr-st' + (S.pf === p.key ? ' on' : ''), 'data-staff': p.key, tabindex: '0', role: 'button',
      on: { click: function(){ S.pf = S.pf === p.key ? null : p.key; openPerson(p.key); }, keydown: function(ev){ if(ev.key === 'Enter' && ev.target === ev.currentTarget) { S.pf = S.pf === p.key ? null : p.key; openPerson(p.key); } } } },
      h('div', null, C_.nm(p), h('br'), h('small', { t: GN[p.grp] + (p.serv.length ? ' · ' + p.serv.join(' + ') : '') })),
      h('div', { class: 'cr-stx' }, h('span', { class: 'cr-pill' + (l ? ' l' : own.length ? '' : ' z'), t: txt }),
        quitar ? btn('✕', 'sm dng', function(ev){ ev.stopPropagation(); quitarDelCuadro(p, t); }, { title: 'Quitar del cuadro', 'aria-label': 'Quitar a ' + C_.nm(p) + ' del cuadro' }) : null)));
  });
  return box;
}
/* Disponibilidad de servicio (solo informativa, no entra en horas ni $). Valor de config 'servicios':
 * [{ servicio, franjas: [{ dias, horario, pend }] }]; si la base no lo tiene se muestran estos valores por defecto. */
const SERVICIOS_DEF = [
  { servicio: 'Tomografía (TC)', franjas: [{ dias: 'Todos los días', horario: '24 h' }] },
  { servicio: 'Radiografía (RX)', franjas: [{ dias: 'Todos los días', horario: '24 h, a demanda' }] },
  { servicio: 'Resonancia (RM)', franjas: [{ dias: 'Lunes a viernes', horario: '08:00–24:00' }, { dias: 'Sábado', horario: '08:00–13:00' }, { dias: 'Domingo', horario: 'cerrada', pend: true }] }
];
function renderServicios(){
  const v = ST.M.cfg.servicios, lista = Array.isArray(v) && v.length ? v : SERVICIOS_DEF;
  const ajuste = { 'min-width': '0', 'max-width': '100%', 'box-sizing': 'border-box', overflow: 'visible', 'white-space': 'normal', 'overflow-wrap': 'anywhere' };
  const box = h('div', { class: 'cr-card', id: 'cr-servicios', s: ajuste }, h('h3', { t: 'Disponibilidad de servicio' }));
  lista.forEach(function(s, i){
    const fr = Array.isArray(s.franjas) ? s.franjas : [];
    poner(box, h('div', { s: Object.assign({ display: 'block', padding: '6px 0', 'border-top': i ? '1px solid rgba(128,128,128,.25)' : 'none' }, ajuste) },
      h('div', { s: ajuste }, h('b', { t: String(s.servicio || '') })),
      fr.map(function(f){
        return h('div', { s: Object.assign({ 'margin-top': '2px' }, ajuste) }, String(f.dias || '') + ': ' + String(f.horario || ''), f.pend ? [' ', pendMarca()] : null);
      })));
  });
  return box;
}
function renderAlertas(scope, solo){
  const al = alertasDe(scope), box = h('div', { class: 'cr-card', id: 'cr-alertas' }, h('h3', { t: 'Alertas' }));
  if(!al.length) poner(box, h('div', { class: 'cr-hint', t: 'Sin alertas.' }));
  const ul = h('ul', { class: 'cr-al' });
  al.forEach(function(a){
    poner(ul, h('li', { 'data-alerta': '1' }, a.w ? h('span', { class: 'cr-w', t: a.w }) : null, a.txt,
      a.go ? [' ', h('a', { href: '#' + 'cronogramas/' + a.go.sub, class: 'cr-lk', on: { click: function(){ S.vistas[a.go.sub] = a.go.vista; } }, t: 'Ver' })] : null));
  });
  poner(box, ul);
  if(solo){
    const pend = pendientesDe();
    poner(box, h('h3', { s: { 'margin-top': '14px' }, t: 'Datos a confirmar o sin cargar' }), h('ul', { class: 'cr-al', id: 'cr-pendientes' }, pend.map(function(x){ return h('li', { t: x }); })));
  }
  return box;
}
/* == popover de celda del diagrama == */
function bloqueRepDia(l, r, d, esRep){
  const C_ = ST.C, est = C_.repEst(r);
  return h('div', { class: 'cr-repdia', 'data-repdia': r.id },
    h('div', { class: 'ln' }, h('b', { t: esRep ? 'Cubre a ' + apP(l.key) : 'Reemplaza: ' + C_.rname(r) }), ' · ' + r.d + '–' + r.h + ' · ', pendMarca(ESTTXT[est])),
    h('div', { class: 'acts' },
      btn('✔ Confirmar reemplazo ' + r.d + '–' + r.h, 'sm pri', function(){ setEst(l, r, 'ok'); }),
      btn('✖ No puede', 'sm', function(){ setEst(l, r, 'no'); }),
      btn('Quitar este día', 'sm dng', function(){ repDiaQuitar(l, r, d); limpiarPop(); pintar(); }, { 'aria-label': 'Quitar el ' + fmtC(d) + ' de este reemplazo' })),
    h('div', { class: 'cr-hint', t: 'Pasar este día a otra persona:' }), controlPasar(l, r, d));
}
function cellPop(ev, key, d){
  if(ev.stopPropagation) ev.stopPropagation();
  limpiarPop();
  const el = ev.currentTarget, r = el.getBoundingClientRect(), C_ = ST.C, p = ST.M.PM[key], edit = puedeEditar();
  const dd = C_.dayData('tec', d, key), Cc = {};
  Cc[d] = {};
  Cc[d][key] = dd.items.filter(function(i){ return i.k === key; }).concat(dd.strip.filter(function(x){ return x.k === key; }).map(function(x){ return { kind: 'lic', k: x.k, l: x.l }; }));
  const x = cellInfo(p, d, Cc), lic = C_.licOn(key, d);
  S.pop = { cell: key + '|' + d, t: Date.now() };
  const reps = dd.items.filter(function(i){ return i.kind === 'rep' && i.k === key; });
  const acts = [], secs = [];
  if(edit){
    reps.forEach(function(i){ secs.push(bloqueRepDia(i.l, i.r, d, true)); });
    if(lic && lic.tipo !== 'Cambio de turno'){
      const cubre = lic.reemps.filter(function(q){ return repCubre(lic, q, d); });
      cubre.forEach(function(q){ secs.push(bloqueRepDia(lic, q, d, false)); });
      const need = C_.ownShifts(key, d, true), guard = C_.esGuard(key);
      let turnos = [];
      if(!need.length) turnos = cubre.length ? [] : [null];
      else if(guard) turnos = need.filter(function(z){ return !cubre.some(function(q){ const a = mins(q.d), b = mins(q.h) <= a ? mins(q.h) + 1440 : mins(q.h); return z[0] === a && z[1] === b; }); });
      else if(!cubre.length) turnos = [[Math.min.apply(null, need.map(function(z){ return z[0]; })), Math.max.apply(null, need.map(function(z){ return z[1]; }))]];
      if(turnos.length) secs.push(h('div', { class: 'cr-repdia', 'data-sin-rep': '1' }, h('div', { class: 'ln' }, h('b', { t: 'Asignar reemplazante para este día' })), turnos.map(function(z){ return controlAsignar(lic, d, z); })));
    }
    if(!lic) acts.push(btn('Marcar ausencia este día', 'sm', function(){
      A.licAlta({ key: key, tipo: 'Ausencia puntual', desde: d, hasta: d, obs: '', pend: false, motivo: '', reemps: [] });
      limpiarPop(); pintar();
    }));
  }
  acts.push(btn('Ver ficha', 'sm', function(){ limpiarPop(); openPerson(key, null, lic ? lic.id : null); }));
  let extra = null;
  if(edit){
    const di = h('input', { type: 'time', value: '07:00', 'aria-label': 'Turno extra desde' }), hi = h('input', { type: 'time', value: '13:00', 'aria-label': 'Turno extra hasta' });
    extra = h('div', { class: 'cr-ex' }, h('small', { t: 'Turno extra este día' }), di, hi, btn('Agregar', 'sm', function(){
      if(!di.value || !hi.value || di.value === hi.value) return;
      A.extraAlta({ key: key, fecha: d, d: di.value, h: hi.value, nota: '' });
      limpiarPop(); pintar();
    }));
  }
  const e = h('div', { id: 'cr-pop', class: 'cr-pop ancho', role: 'dialog', 'aria-label': 'Detalle del día' },
    btnCerrarPop(),
    h('h4', { t: C_.nm(p) + ' · ' + DIAS[wdOf(d)].slice(0, 3) + ' ' + fmtC(d) }),
    h('div', { class: 'sb', t: (ST.M.FER[d] ? 'Feriado: ' + ST.M.FER[d] + '. ' : '') + (x.ti ? x.ti.split(' · ').slice(1).join(' · ') : 'Sin turno ese día.') }),
    secs, h('div', { class: 'acts' }, acts), extra);
  abrirPop(e, r);
}

/* == ficha de persona (panel lateral) == */
function openPerson(key, fid, lid){
  limpiarPop();
  if(!ST.M.PM[key]) return;
  S.dp = key; S.hl = fid || null; S.hlL = lid || null; S.addF = false; S.addL = false; S.addR = null;
  pintar();
  const e = ST.R.drawerEl && (lid ? ST.R.drawerEl.querySelector('[data-lic="' + lid + '"]') : fid ? ST.R.drawerEl.querySelector('[data-fr="' + fid + '"]') : null);
  if(e && e.scrollIntoView) e.scrollIntoView({ block: 'nearest' });
}
function cerrarPerson(){ S.dp = null; S.hl = null; S.hlL = null; S.addF = false; S.addL = false; S.addR = null; pintar(); }
function chk(txt, val, fn, at){
  return h('label', { class: 'cr-chk1' }, h('input', Object.assign({ type: 'checkbox', checked: !!val, on: { change: function(ev){ fn(ev.target.checked); } } }, at || {})), txt);
}
function horaOk(a, b){ return !!a && !!b && a !== b; }
function franjaRow(f, p){
  const edit = puedeEditar(), tec = f.tab === 'tec', adm = f.tab === 'adm';
  const resumen = DIAS[f.dia] + ' ' + f.d + '–' + f.h + (f.sec ? ' · ' + (SEC[f.sec] || f.sec) : '') + (f.sem ? ' · Sáb ' + f.sem : '') + (f.turno && TURN[f.turno] ? ' · ' + TURN[f.turno][2] : '') + (f.guardia ? ' · guardia' : '');
  const cls = 'cr-fr' + (S.hl === f.id ? ' sel' : '');
  if(!edit) return h('div', { class: cls, 'data-fr': f.id }, h('span', { class: 'cr-mut', t: TN[f.tab] + ' · ' }), resumen, f.pend ? [' ', pendMarca()] : null);
  const chg = function(){ A.franjaCambio(f); pintar(); };
  return h('div', { class: cls, 'data-fr': f.id },
    h('div', { class: 'cr-fr1' }, h('b', { t: TN[f.tab] }),
      selec(DIAS.map(function(x, i){ return [i, x]; }), f.dia, function(v){ f.dia = +v; chg(); }),
      entrada('time', f.d, function(v, el){ if(!horaOk(v, f.h)){ el.value = f.d; return; } f.d = v; chg(); }, { 'aria-label': 'Desde' }),
      entrada('time', f.h, function(v, el){ if(!horaOk(f.d, v)){ el.value = f.h; return; } f.h = v; chg(); }, { 'aria-label': 'Hasta' }),
      btn('✕', 'sm dng', function(){ A.franjaBaja(f); pintar(); }, { title: 'Quitar franja', 'aria-label': 'Quitar franja' })),
    h('div', { class: 'cr-fr1' },
      selec([[0, 'Todos los sábados'], [1, 'Sábado 1'], [2, 'Sábado 2']], f.sem, function(v){ f.sem = +v; chg(); }),
      adm ? entrada('text', f.sec, function(v){ f.sec = v.slice(0, 60); chg(); }, { placeholder: 'Sector', maxlength: '60', 'aria-label': 'Sector' }) : null,
      tec ? selec([['', 'Sin turno fijo'], ['M', 'Mañana'], ['T', 'Tarde']], f.turno, function(v){ f.turno = v; chg(); }) : null,
      tec ? chk('Guardia', f.guardia, function(v){ f.guardia = v; chg(); }) : null,
      chk('A confirmar', f.pend, function(v){ f.pend = v; chg(); })));
}
function formFranja(p){
  const tabs = p.grp === 'tec' ? ['tec'] : p.grp === 'adm' ? ['adm'] : ['rx', 'tc', 'eco'];
  let tab = tabs.indexOf(tabAct()) >= 0 ? tabAct() : tabs[0];
  const refs = {};
  refs.dia = selec(DIAS.map(function(x, i){ return [i, x]; }), 0, function(){});
  refs.d = h('input', { type: 'time', value: '08:00', 'aria-label': 'Desde' });
  refs.h = h('input', { type: 'time', value: '16:00', 'aria-label': 'Hasta' });
  refs.sem = selec([[0, 'Todos los sábados'], [1, 'Sábado 1'], [2, 'Sábado 2']], 0, function(){});
  refs.tab = selec(tabs.map(function(t){ return [t, TN[t]]; }), tab, function(v){ tab = v; });
  refs.pend = h('input', { type: 'checkbox' });
  return h('div', { class: 'cr-form', id: 'cr-form-franja' }, h('b', { t: 'Nueva franja semanal' }), tabs.length > 1 ? refs.tab : null, refs.dia, refs.d, refs.h, refs.sem, h('label', { class: 'cr-chk1' }, refs.pend, 'A confirmar'),
    h('div', { class: 'acts' }, btn('Agregar', 'pri sm', function(){
      if(!horaOk(refs.d.value, refs.h.value)) return;
      A.franjaAlta({ tab: tab, key: p.key, dia: +refs.dia.value, d: refs.d.value, h: refs.h.value, sec: '', asig: [], guardia: false, sem: +refs.sem.value, turno: '', pend: refs.pend.checked, motivo: '' });
      S.addF = false; pintar();
    }), btn('Cancelar', 'sm', function(){ S.addF = false; pintar(); })));
}
function repFila(l, r){
  const C_ = ST.C, edit = puedeEditar(), est = C_.repEst(r);
  if(!edit) return h('div', { class: 'cr-rp' }, h('b', { t: C_.rname(r) }), ' · ' + r.d + '–' + r.h + ' · ', pendMarca(ESTTXT[est]));
  const chg = function(){ A.repCambio(l, r); pintar(); };
  const sel = selec(opcionesReemp(l, r.key).filter(function(o){ return o[0] !== '__ext'; }).concat(r.key ? [] : [['', r.nombre ? r.nombre + ' (externo)' : '— elegir —']]), r.key || '', function(v){ if(!v) return; r.key = v; r.nombre = ''; r.est = ''; chg(); });
  return h('div', { class: 'cr-rp' },
    h('div', { class: 'cr-fr1' }, sel,
      entrada('time', r.d, function(v, el){ if(!horaOk(v, r.h)){ el.value = r.d; return; } r.d = v; chg(); }, { 'aria-label': 'Reemplazo desde' }),
      entrada('time', r.h, function(v, el){ if(!horaOk(r.d, v)){ el.value = r.h; return; } r.h = v; chg(); }, { 'aria-label': 'Reemplazo hasta' }),
      btn('✕', 'sm dng', function(){ A.repBaja(l, r); pintar(); }, { title: 'Quitar reemplazo', 'aria-label': 'Quitar reemplazo' })),
    h('div', { class: 'cr-fr1' }, selec([['', 'a confirmar'], ['ok', 'confirmado'], ['no', 'no puede']], r.est, function(v){ r.est = v; chg(); }),
      entrada('text', r.nota, function(v){ r.nota = v.slice(0, 200); chg(); }, { placeholder: 'Nota', maxlength: '200', 'aria-label': 'Nota del reemplazo' })),
    h('details', { class: 'cr-dd', 'data-dias-det': r.id }, h('summary', { t: 'Días que cubre · quitar o pasar a otra persona' }), diasEditor(l, r)));
}
function formReemp(l, alCerrar){
  const refs = {}, p = ST.M.PM[l.key], cerrar = alCerrar || function(){ S.addR = null; pintar(); };
  const first = ST.M.F.find(function(f){ return f.key === l.key; });
  const op = opcionesReemp(l, '');
  refs.who = selec(op, '', function(v){ refs.nom.hidden = v !== '__ext'; });
  refs.nom = h('input', { type: 'text', placeholder: 'Nombre del reemplazante', maxlength: '120', hidden: true, 'aria-label': 'Nombre del reemplazante externo' });
  refs.d = h('input', { type: 'time', value: first ? first.d : '07:00', 'aria-label': 'Desde' });
  refs.h = h('input', { type: 'time', value: first ? first.h : '13:00', 'aria-label': 'Hasta' });
  return h('div', { class: 'cr-form' }, h('b', { t: 'Nuevo reemplazante de ' + (p ? p.ap : '') }), refs.who, refs.nom, refs.d, refs.h,
    h('div', { class: 'acts' }, btn('Agregar', 'pri sm', function(){
      const v = refs.who.value, nombre = refs.nom.value.trim();
      if(!v || (v === '__ext' && !nombre) || !horaOk(refs.d.value, refs.h.value)) return;
      A.repAlta(l, { key: v === '__ext' ? '' : v, nombre: v === '__ext' ? nombre.slice(0, 120) : '', d: refs.d.value, h: refs.h.value, nota: '', fechas: [], desde: '', hasta: '', est: '' });
      cerrar();
    }), btn('Cancelar', 'sm', cerrar)));
}
function licFila(l){
  const edit = puedeEditar(), cls = 'cr-lic' + (S.hlL === l.id ? ' sel' : '');
  const reps = l.reemps.map(function(r){ return repFila(l, r); });
  if(!edit){
    return h('div', { class: cls, 'data-lic': l.id }, h('b', { t: l.tipo }), ' · ' + fmtF(l.desde) + (l.hasta ? ' al ' + fmtF(l.hasta) : ' · sin fecha de regreso'), l.pend ? [' ', pendMarca()] : null,
      l.obs ? h('small', { class: 'cr-mut', t: ' · ' + l.obs }) : null, reps.length ? reps : h('div', { class: 'cr-hint', t: 'Sin reemplazo definido.' }));
  }
  const chg = function(){ A.licCambio(l); pintar(); };
  return h('div', { class: cls, 'data-lic': l.id },
    h('div', { class: 'cr-fr1' }, selec(TIPOS_LIC.indexOf(l.tipo) >= 0 ? TIPOS_LIC : TIPOS_LIC.concat([l.tipo]), l.tipo, function(v){ l.tipo = v; chg(); }),
      btn('✕', 'sm dng', function(){ A.licBaja(l); pintar(); }, { title: 'Quitar licencia', 'aria-label': 'Quitar licencia' })),
    h('div', { class: 'cr-fr1' }, h('label', { class: 'cr-f' }, 'Desde', entrada('date', l.desde, function(v, el){ if(!v){ el.value = l.desde; return; } l.desde = v; if(l.hasta && l.hasta < v) l.hasta = v; chg(); })),
      h('label', { class: 'cr-f' }, 'Hasta', entrada('date', l.hasta, function(v, el){ if(v && v < l.desde){ el.value = l.hasta; return; } l.hasta = v; chg(); }))),
    h('div', { class: 'cr-fr1' }, entrada('text', l.obs, function(v){ l.obs = v.slice(0, 200); chg(); }, { placeholder: 'Detalle (no cargar motivos de salud)', maxlength: '200', 'aria-label': 'Detalle de la licencia' }),
      chk('A confirmar', l.pend, function(v){ l.pend = v; chg(); })),
    reps.length ? reps : h('div', { class: 'cr-hint', t: 'Sin reemplazo definido.' }),
    S.addR === l.id ? formReemp(l) : btn('+ Reemplazante', 'sm', function(){ S.addR = l.id; pintar(); }));
}
function formLic(p, alCerrar){
  const refs = {}, cerrar = alCerrar || function(){ S.addL = false; pintar(); };
  refs.tipo = selec(TIPOS_LIC, TIPOS_LIC[0], function(){});
  refs.desde = h('input', { type: 'date', value: ST.puente.hoy(), 'aria-label': 'Desde' });
  refs.hasta = h('input', { type: 'date', 'aria-label': 'Hasta' });
  refs.obs = h('input', { type: 'text', maxlength: '200', placeholder: 'Detalle (no cargar motivos de salud)', 'aria-label': 'Detalle' });
  refs.pend = h('input', { type: 'checkbox' });
  if(!p){
    refs.p = selec([['', '— elegir persona —']].concat(ST.C.people('tec').concat(ST.C.people('adm')).map(function(x){ return [x.key, ST.C.nm(x)]; })), '', function(){});
    refs.p.setAttribute('aria-label', 'Persona');
  }
  return h('div', { class: 'cr-form', id: 'cr-form-lic' }, h('b', { t: 'Nueva licencia' }), refs.p ? campo('Persona', refs.p) : null, refs.tipo, h('label', { class: 'cr-f' }, 'Desde', refs.desde), h('label', { class: 'cr-f' }, 'Hasta (vacío = sin fecha de regreso)', refs.hasta), refs.obs,
    h('label', { class: 'cr-chk1' }, refs.pend, 'A confirmar'),
    h('div', { class: 'acts' }, btn('Agregar', 'pri sm', function(){
      const key = p ? p.key : refs.p.value;
      if(!key){ ST.puente.aviso('Elegí la persona de la licencia.'); return; }
      if(!refs.desde.value || (refs.hasta.value && refs.hasta.value < refs.desde.value)) return;
      A.licAlta({ key: key, tipo: refs.tipo.value, desde: refs.desde.value, hasta: refs.hasta.value, obs: refs.obs.value.slice(0, 200), pend: refs.pend.checked, motivo: '', reemps: [] });
      cerrar();
    }), btn('Cancelar', 'sm', cerrar)));
}
function formGuardia(p, tipo){
  const refs = {}, mk = S.y + '-' + pad(S.m + 1) + '-01';
  refs.f = h('input', { type: 'date', value: mk, 'aria-label': 'Fecha' });
  refs.t = selec([['N', 'Noche 19–07'], ['D', 'Día 07–19']], 'N', function(){});
  refs.d = h('input', { type: 'time', value: '07:00', 'aria-label': 'Desde' });
  refs.h = h('input', { type: 'time', value: '13:00', 'aria-label': 'Hasta' });
  return h('div', { class: 'cr-form' }, h('b', { t: tipo === 'g' ? 'Nueva guardia de 12 h' : 'Nuevo turno extra' }), refs.f, tipo === 'g' ? refs.t : [refs.d, refs.h],
    h('div', { class: 'acts' }, btn('Agregar', 'pri sm', function(){
      if(!refs.f.value) return;
      if(tipo === 'g'){
        if(ST.M.G.some(function(g){ return g.key === p.key && g.fecha === refs.f.value && g.t === refs.t.value; })) return;
        A.guardiaAlta({ key: p.key, fecha: refs.f.value, t: refs.t.value, pend: false, motivo: '' });
      } else {
        if(!horaOk(refs.d.value, refs.h.value)) return;
        A.extraAlta({ key: p.key, fecha: refs.f.value, d: refs.d.value, h: refs.h.value, nota: '' });
      }
      S.nk = 'f'; pintar();
    }), btn('Cancelar', 'sm', function(){ S.nk = 'f'; pintar(); })));
}
function renderDrawer(){
  if(!S.dp || !ST.M.PM[S.dp]) return null;
  const p = ST.M.PM[S.dp], key = p.key, edit = puedeEditar(), C_ = ST.C, mk = S.y + '-' + pad(S.m + 1);
  const fr = ST.M.F.filter(function(f){ return f.key === key; }).sort(function(a, b){ return a.tab.localeCompare(b.tab) || a.dia - b.dia || a.d.localeCompare(b.d); });
  const gs = ST.M.G.filter(function(g){ return g.key === key && g.fecha.indexOf(mk) === 0; }).sort(function(a, b){ return a.fecha.localeCompare(b.fecha) || a.t.localeCompare(b.t); });
  const xs = ST.M.XT.filter(function(x){ return x.key === key && x.fecha.indexOf(mk) === 0; }).sort(function(a, b){ return a.fecha.localeCompare(b.fecha); });
  const ls = ST.M.L.filter(function(l){ return l.key === key; }).sort(function(a, b){ return b.desde.localeCompare(a.desde); });
  const bd = h('div', { class: 'cr-dbody' });
  ST.R.dhost = h('div', { class: 'cr-dbar-host' });
  const dr = h('aside', { class: 'cr-drawer', id: 'cr-drawer', role: 'dialog', 'aria-label': 'Ficha de ' + C_.nm(p) },
    h('div', { class: 'cr-dtop' },
      h('div', { class: 'cr-dh2' }, h('div', null, h('b', { t: C_.nm(p) }), h('br'), h('small', { t: GN[p.grp] + (p.serv.length ? ' · ' + p.serv.join(' + ') : '') })),
        btn('✕ Cerrar', 'sm pri cr-xficha', cerrarPerson, { id: 'cr-cerrar-ficha', title: 'Cerrar ficha (Esc)', 'aria-label': 'Cerrar ficha' })), ST.R.dhost), bd);
  if(p.grp === 'adm' && edit){
    const ofi = C_.esOfi(key), fa = ST.M.F.filter(function(f){ return f.key === key && f.tab === 'adm'; });
    poner(bd, h('div', { class: 'cr-sec' }, chk('Oficina propia (no cuenta en el máximo de 2 simultáneos)', ofi, function(v){
      fa.forEach(function(f){ f.sec = v ? OFICINA : ''; A.franjaCambio(f); });
      if(v && !fa.length) ST.puente.aviso('Cargá primero una franja para marcar oficina propia.');
      pintar();
    })));
  } else if(C_.esOfi(key)) poner(bd, h('div', { class: 'cr-sec cr-hint', t: 'Oficina propia: no cuenta en el máximo de 2 simultáneos.' }));
  poner(bd, h('div', { class: 'cr-sec' }, h('h4', { t: 'Agenda semanal' }),
    fr.length ? fr.map(function(f){ return franjaRow(f, p); }) : h('div', { class: 'cr-hint', t: 'Sin agenda semanal cargada.' }),
    edit ? (S.addF ? formFranja(p) : btn('+ Franja', 'sm', function(){ S.addF = true; pintar(); })) : null));
  if(p.grp === 'tec' || gs.length || xs.length){
    poner(bd, h('div', { class: 'cr-sec' }, h('h4', { t: 'Guardias de 12 h y turnos extra · ' + MESES[S.m] }),
      gs.map(function(g){
        return h('div', { class: 'cr-fr' }, h('span', { t: DIAS[wdOf(g.fecha)].slice(0, 3) + ' ' + fmtC(g.fecha) + ' · ' + DL[g.t] + ' ' + TURN[g.t][0] + '–' + TURN[g.t][1] }), g.pend ? [' ', pendMarca()] : null,
          C_.licOn(key, g.fecha) ? h('span', { class: 'cr-w', t: ' · de licencia' }) : null, edit ? btn('✕', 'sm dng', function(){ A.guardiaBaja(g); pintar(); }, { title: 'Quitar guardia', 'aria-label': 'Quitar guardia' }) : null);
      }),
      xs.map(function(x){
        return h('div', { class: 'cr-fr' }, h('span', { t: 'Extra ' + DIAS[wdOf(x.fecha)].slice(0, 3) + ' ' + fmtC(x.fecha) + ' · ' + x.d + '–' + x.h }), edit ? btn('✕', 'sm dng', function(){ A.extraBaja(x); pintar(); }, { title: 'Quitar turno extra', 'aria-label': 'Quitar turno extra' }) : null);
      }),
      !gs.length && !xs.length ? h('div', { class: 'cr-hint', t: 'Sin guardias ni turnos extra este mes.' }) : null,
      edit && p.grp === 'tec' ? (S.nk === 'g' || S.nk === 'x' ? formGuardia(p, S.nk) : h('div', { class: 'acts' }, btn('+ Guardia', 'sm', function(){ S.nk = 'g'; pintar(); }), btn('+ Turno extra', 'sm', function(){ S.nk = 'x'; pintar(); }))) : null));
  }
  poner(bd, h('div', { class: 'cr-sec' }, h('h4', { t: 'Licencias y reemplazos' }),
    ls.length ? ls.map(licFila) : h('div', { class: 'cr-hint', t: 'Sin licencias cargadas.' }),
    edit ? (S.addL ? formLic(p) : btn('+ Licencia', 'sm', function(){ S.addL = true; pintar(); })) : null));
  const cubre = [];
  ST.M.L.forEach(function(l){ l.reemps.forEach(function(r){ if(r.key === key && l.key !== key) cubre.push({ l: l, r: r }); }); });
  if(cubre.length) poner(bd, h('div', { class: 'cr-sec' }, h('h4', { t: 'Cubre a otras personas' }), cubre.map(function(x){
    return h('div', { class: 'cr-fr' }, h('b', { t: nmP(x.l.key) }), ' · ' + x.l.tipo + ' · ' + x.r.d + '–' + x.r.h + ' · ', pendMarca(ESTTXT[C_.repEst(x.r)]));
  })));
  if(!edit) poner(bd, h('div', { class: 'cr-hint', t: 'Solo lectura.' }));
  poner(dr, h('div', { class: 'cr-dfoot' }, btn('Cerrar', '', cerrarPerson, { id: 'cr-cerrar-ficha-pie', 'aria-label': 'Cerrar ficha (botón al final)' })));
  return dr;
}

/* == armado de la pantalla == */
function bloqueEstado(titulo, texto, esError, reintentar){
  return h('div', { class: 'cr-estado' + (esError ? ' error' : ''), role: esError ? 'alert' : 'status' }, h('h2', { t: titulo }), h('p', { t: texto }),
    reintentar ? btn('Reintentar', 'sm pri', function(){ iniciarCarga(); }) : null);
}
function subsVisibles(){ return SUBS.filter(function(s){ return !s.soloEdicion || pagoVisible(); }); }
function renderKpis(){
  return h('div', { class: 'cr-kpis', id: 'cr-kpis' }, kpisDe().map(function(x){
    return h('div', { class: 'cr-kpi' + (x[3] ? ' bad' : '') }, h('small', { t: x[0] }), h('b', { t: x[1] }), h('em', { t: x[2] }));
  }));
}
function renderNav(){
  return h('nav', { class: 'cr-subs', 'aria-label': 'Vistas de Cronogramas' }, subsVisibles().map(function(s){
    return h('a', { href: '#cronogramas/' + s.k, 'data-sub': s.k, 'aria-current': s.k === S.sub ? 'page' : null, t: s.n });
  }));
}
function personasFiltro(){
  const t = tabAct();
  if(S.sub === 'licencias') return ST.C.people('tec').concat(ST.C.people('adm'));
  return (t === 'eco' ? ecoPersonas() : ST.C.people(t)).filter(function(p){ return p.key !== 'res'; });
}
function renderTools(){
  const v = vistaAct(), vs = VISTAS[S.sub], tools = h('div', { class: 'cr-tools' });
  if(vs.length > 1) poner(tools, h('div', { class: 'cr-seg', role: 'group', 'aria-label': 'Vista' }, vs.map(function(x){
    return h('button', { type: 'button', class: 'cr-btn sm' + (x[0] === v ? ' on' : ''), 'aria-pressed': x[0] === v ? 'true' : 'false', 'data-vista': x[0], t: x[1], on: { click: function(){ setVista(x[0]); } } });
  })));
  const conMes = ['diag', 'horas', 'sems', 'mes', 'pago', 'tcg', 'alertas'].indexOf(v) >= 0;
  const conAnio = v === 'anio';
  if(conMes || conAnio){
    const mover = function(n){
      if(conAnio) S.y += n;
      else { S.m += n; if(S.m < 0){ S.m = 11; S.y--; } if(S.m > 11){ S.m = 0; S.y++; } }
      S.wk = null; pintar();
    };
    poner(tools, h('div', { class: 'cr-mnav' }, btn('◀', 'sm', function(){ mover(-1); }, { 'aria-label': conAnio ? 'Año anterior' : 'Mes anterior' }),
      h('b', { class: 'cr-mlab', t: conAnio ? String(S.y) : MESES[S.m] + ' ' + S.y }),
      btn('▶', 'sm', function(){ mover(1); }, { 'aria-label': conAnio ? 'Año siguiente' : 'Mes siguiente' }),
      btn('Hoy', 'sm', function(){ const hy = ST.puente.hoy(); S.y = +hy.slice(0, 4); S.m = +hy.slice(5, 7) - 1; S.wk = null; pintar(); })));
  }
  if(v === 'sems'){
    ensureWk();
    poner(tools, selec(weeksOf(S.y, S.m).map(function(w){ return [w, 'Semana del ' + fmtC(w)]; }), S.wk, function(x){ S.wk = x; pintar(); }, 'cr-sel'));
  }
  if(['sem', 'sems', 'cuadro'].indexOf(v) >= 0) poner(tools, chk('Sáb y dom', S.we, function(x){ S.we = x; pintar(); }));
  if(['conf', 'pago', 'tcg', 'alertas'].indexOf(v) < 0){
    const ps = personasFiltro();
    if(ps.length > 1) poner(tools, selec([['', 'Todas las personas']].concat(ps.map(function(p){ return [p.key, ST.C.nm(p)]; })), S.pf || '', function(x){ S.pf = x || null; pintar(); }, 'cr-sel'));
  }
  if(S.sub === 'administrativos'){
    poner(tools, h('div', { class: 'cr-pdf', role: 'group', 'aria-label': 'Descargar cronograma en PDF' },
      v === 'sem' ? btn('⬇ PDF semana tipo', 'sm', function(){ descargarPdfAdm('tipo'); }, { id: 'cr-pdf-tipo' }) : btn('⬇ PDF de la semana', 'sm', function(){ descargarPdfAdm('semana'); }, { id: 'cr-pdf-sem' }),
      btn('⬇ PDF del mes', 'sm', function(){ descargarPdfAdm('mes'); }, { id: 'cr-pdf-mes' })));
  }
  if(permisoEditar()){
    if(!S.edit) poner(tools, h('div', { class: 'cr-edtools' }, btn('✎ Editar', 'sm', function(){ S.edit = true; limpiarPop(); pintar(); }, { id: 'cr-editar', 'aria-label': 'Editar este cuadro', disabled: ST.guardando })));
    else poner(tools, h('div', { class: 'cr-edtools' }, btn('💾 Guardar edición', 'sm pri', guardarEdicion, { id: 'cr-guardar-edicion', disabled: ST.guardando }), btn('Cancelar edición', 'sm', cancelarEdicion, { id: 'cr-cancelar-edicion', disabled: ST.guardando })));
  }
  return tools;
}
function renderCuerpo(){
  const v = vistaAct();
  try{
    if(v === 'sem') return renderSem();
    if(v === 'sems') return renderSems();
    if(v === 'cuadro') return renderCuadro();
    if(v === 'mes') return renderMes();
    if(v === 'anio') return renderAnio();
    if(v === 'diag') return renderDiag();
    if(v === 'horas') return renderHoras();
    if(v === 'conf') return renderConf();
    if(v === 'lista') return renderLista();
    if(v === 'tcg') return renderTcg();
    if(v === 'pago') return renderPago();
    if(v === 'alertas') return renderAlertas('todo', true);
  }catch(e){
    ST.R.errVista = String(e && e.message || e);
    return bloqueEstado('NO SE PUDO DIBUJAR ESTA VISTA', 'Probá otra vista o recargá la página.', true, false);
  }
  return nota('Vista no disponible.');
}
function pintar(){
  /* un cambio de campo puede dispararse al quitar el campo enfocado: se encola otra pasada en vez de anidar */
  if(ST.R.pintando){ ST.R.otra = true; return; }
  ST.R.pintando = true;
  try{ do{ ST.R.otra = false; pintarYa(); }while(ST.R.otra); }
  finally{ ST.R.pintando = false; }
}
function quitarFlotantes(){
  if(ST.R.drawerEl && ST.R.drawerEl.parentNode) ST.R.drawerEl.parentNode.removeChild(ST.R.drawerEl);
  if(ST.R.scrimEl && ST.R.scrimEl.parentNode) ST.R.scrimEl.parentNode.removeChild(ST.R.scrimEl);
  ST.R.drawerEl = null; ST.R.scrimEl = null;
}
function pintarYa(){
  if(!ST.el) return;
  const foco = document.activeElement;
  if(foco && foco !== document.body && ST.el.contains(foco) && foco.blur) foco.blur();
  if(ST.R.otra) return;
  const sy = window.scrollY, ds = ST.R.drawerEl ? ST.R.drawerEl.scrollTop : 0, hadDrawer = !!ST.R.drawerEl;
  limpiarPop();
  medirAngosto();
  ST.R.bucket = ST.R.ancho < 700 ? 0 : ST.R.ancho < 860 ? 1 : 2;
  const root = ST.el;
  vaciar(root);
  quitarFlotantes();
  ST.R.bhost = null; ST.R.dhost = null;
  root.classList.add('cr-root');
  root.dataset.angosto = esAngosto() ? '1' : '0';
  const tb = document.querySelector('.topbar'), fija = tb && ['sticky', 'fixed'].indexOf(getComputedStyle(tb).position) >= 0;
  root.style.setProperty('--cr-top', (fija ? tb.offsetHeight : 0) + 'px');
  if(!ST.cargado){
    poner(root, ST.error ? bloqueEstado('NO SE PUDO LEER', textoError(ST.error, null), true, true) : bloqueEstado('CARGANDO', 'Cargando cronogramas…', false, false));
    return;
  }
  if(!subsVisibles().some(function(s){ return s.k === S.sub; })) S.sub = 'tecnicos';
  const wrap = h('div', { class: 'cr-wrap' });
  ST.R.bhost = h('div', { class: 'cr-bhost', id: 'cr-bhost' });
  poner(wrap, ST.R.bhost);
  if(!permisoEditar()) poner(wrap, h('div', { class: 'cr-ro', t: 'Solo lectura' }));
  if(ST.error) poner(wrap, bloqueEstado('NO SE PUDO ACTUALIZAR', MSG.LECTURA, true, true));
  poner(wrap, renderKpis(), renderNav(), renderPorConfirmar(), renderTools(), renderEdicion());
  const sub = S.sub, ancho = sub === 'administrativos', conLado = !ancho && ['tecnicos', 'radiografias', 'eco', 'tc'].indexOf(sub) >= 0;
  const main = h('div', { class: 'cr-main', id: 'cr-main' }, h('div', { class: 'cr-card', id: 'cr-vista' }, renderCuerpo()));
  const lay = h('div', { class: 'cr-lay' + (conLado ? ' lado' : '') }, main);
  if(conLado){
    const side = h('div', { class: 'cr-side' }, renderAlertas(subActual().tab, false));
    poner(side, renderServicios());
    if(sub !== 'tc') poner(side, renderPersonal());
    poner(lay, side);
  } else if(ancho){
    /* administrativos: la grilla ocupa todo el ancho y los paneles van debajo (más lugar para BOX 1 / BOX 2) */
    poner(lay, h('div', { class: 'cr-side wide' }, renderRotSab(), renderAlertas('adm', false), renderServicios(), renderPersonal()));
  }
  poner(wrap, lay);
  poner(root, wrap);
  /* la ficha va colgada del body (no del módulo): <main> crea su propio contexto de apilado y la barra superior de la página tapaba el botón Cerrar */
  const dr = renderDrawer();
  if(dr){
    const sc = h('div', { class: 'cr-scrim', id: 'cr-scrim', 'aria-hidden': 'true', on: { click: cerrarPerson } });
    poner(document.body, sc, dr);
    ST.R.scrimEl = sc; ST.R.drawerEl = dr;
    if(hadDrawer) dr.scrollTop = ds;
    else { const cb = dr.querySelector('#cr-cerrar-ficha'); if(cb) try{ cb.focus({ preventScroll: true }); }catch(x){} }
  }
  pintarBarra();
  if(Math.abs(window.scrollY - sy) > 2) window.scrollTo(0, sy);
}

/* == PDF del cronograma de administrativos (sin librerías: A4 apaisado, vectorial, Helvetica) == */
const PDF_AW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
function pdfLat(s){
  return String(s).replace(/–/g, '\x96').replace(/—/g, '\x97').replace(/…/g, '\x85').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/→/g, '>').replace(/[^\x00-\xFF]/g, '?');
}
function pdfEsc(s){ return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function pdfAncho(s, sz, neg){
  let w = 0;
  for(let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); w += c >= 32 && c <= 126 ? PDF_AW[c - 32] : 556; }
  return w * sz / 1000 * (neg ? 1.06 : 1);
}
function pdfCortar(s, sz, neg, max){
  let t = pdfLat(s);
  if(pdfAncho(t, sz, neg) <= max) return t;
  while(t.length > 1 && pdfAncho(t + '..', sz, neg) > max) t = t.slice(0, -1);
  return t + '..';
}
function hsl2rgb(hh, s, l){
  const a = s * Math.min(l, 1 - l), f = function(n){ const k = (n + hh / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
  return [f(0), f(8), f(4)];
}
function pdfPagina(W, H){
  const c = [], col = function(a){ return a.map(function(x){ return x.toFixed(3); }).join(' '); };
  return {
    W: W, H: H, ops: c,
    rect: function(x, y, w, hh, o){
      c.push('q');
      if(o.fill) c.push(col(o.fill) + ' rg');
      if(o.line) c.push(col(o.line) + ' RG ' + (o.lw || 0.5) + ' w');
      if(o.dash) c.push('[' + o.dash.join(' ') + '] 0 d');
      c.push(x.toFixed(2) + ' ' + (H - y - hh).toFixed(2) + ' ' + w.toFixed(2) + ' ' + hh.toFixed(2) + ' re ' + (o.fill && o.line ? 'B' : o.fill ? 'f' : 'S'));
      c.push('Q');
    },
    line: function(x1, y1, x2, y2, rgb, lw, dash){
      c.push('q ' + col(rgb) + ' RG ' + (lw || 0.5) + ' w' + (dash ? ' [' + dash.join(' ') + '] 0 d' : '') + ' ' + x1.toFixed(2) + ' ' + (H - y1).toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + (H - y2).toFixed(2) + ' l S Q');
    },
    textV: function(x, y, s, sz, o){
      o = o || {};
      c.push('BT ' + col(o.color || [0.1, 0.1, 0.1]) + ' rg /' + (o.bold ? 'F2' : 'F1') + ' ' + sz + ' Tf 0 -1 1 0 ' + x.toFixed(2) + ' ' + (H - y).toFixed(2) + ' Tm (' + pdfEsc(pdfLat(s)) + ') Tj ET');
    },
    textU: function(x, y, s, sz, o){
      o = o || {};
      c.push('BT ' + col(o.color || [0.1, 0.1, 0.1]) + ' rg /' + (o.bold ? 'F2' : 'F1') + ' ' + sz + ' Tf 0 1 -1 0 ' + x.toFixed(2) + ' ' + (H - y).toFixed(2) + ' Tm (' + pdfEsc(pdfLat(s)) + ') Tj ET');
    },
    text: function(x, y, s, sz, o){
      o = o || {};
      const t = pdfLat(s), w = pdfAncho(t, sz, o.bold);
      const xx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
      c.push('BT ' + col(o.color || [0.1, 0.1, 0.1]) + ' rg /' + (o.bold ? 'F2' : 'F1') + ' ' + sz + ' Tf ' + xx.toFixed(2) + ' ' + (H - y).toFixed(2) + ' Td (' + pdfEsc(t) + ') Tj ET');
    }
  };
}
function pdfArmar(paginas){
  const objs = [];
  const add = function(s){ objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  paginas.forEach(function(p){
    const body = p.ops.join('\n'), cid = objs.length + 2;
    kids.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + p.W + ' ' + p.H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cid + ' 0 R >>') + ' 0 R');
    add('<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream');
  });
  objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach(function(o, i){ offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xr = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offs.forEach(function(o){ out += String(o).padStart(10, '0') + ' 00000 n \n'; });
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF\n';
  const u8 = new Uint8Array(out.length);
  for(let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 255;
  return u8;
}
const PDF_NEG = [0.08, 0.1, 0.14], PDF_GRIS = [0.4, 0.43, 0.48], PDF_LINEA = [0.8, 0.82, 0.85];
const PDF_LANE = { box1: { w: LANE_W.box1, rgb: [0.12, 0.45, 0.72], bg: [0.93, 0.96, 0.99], lab: 'BOX 1' }, box2: { w: LANE_W.box2, rgb: [0.78, 0.42, 0.04], bg: [0.995, 0.96, 0.9], lab: 'BOX 2' }, sin: { w: LANE_W.sin, rgb: [0.8, 0.12, 0.12], bg: [0.99, 0.93, 0.93], lab: 'SOPORTE|ADMINISTRATIVO' }, ofi: { w: LANE_W.ofi, rgb: [0.4, 0.43, 0.48], bg: [0.95, 0.95, 0.96], lab: 'OFIC.' } };
function pdfCabecera(p, titulo, sub){
  const W = p.W, mg = 28;
  p.text(mg, 38, 'Cronograma de Administrativos', 16, { bold: true, color: PDF_NEG });
  p.text(mg, 54, titulo, 10.5, { color: PDF_NEG });
  if(sub) p.text(W - mg, 38, sub, 8, { align: 'right', color: PDF_GRIS });
  p.text(W - mg, 54, 'Imágenes H. Italiano · FUESMEN', 8, { align: 'right', color: PDF_GRIS });
}
function pdfPie(p, extra){
  const C_ = ST.C, mg = 28, W = p.W, H = p.H, L = [];
  L.push('BOX 1 y BOX 2 son los 2 lugares de atención (máximo 2 personas en simultáneo; la oficina propia no ocupa box). SOPORTE ADMINISTRATIVO = persona adicional cuando los 2 boxes ya están ocupados.');
  const rot = C_.rotOrden.map(function(r){ const hs = (mins(r.h) - mins(r.d)) / 60; return apP(r.key) + ' ' + nmPNom(r.key) + ' ' + tCorto(r.d, r.h) + ' h (' + (hs % 1 ? hs.toFixed(1) : hs) + ' h)'; });
  if(rot.length) L.push('Sábados (1 por persona, rotan): ' + rot.join(' · ') + '.');
  if(rot.length) L.push('Semana siguiente al sábado, lun a jue: Joaquín y Joel salen 1 h antes; Zamira sale a las 12 h y Joaquín cubre de 12 a 18 h; Mónica no compensa.');
  (extra || []).forEach(function(x){ L.push(x); });
  const d = new Date(), pd = function(n){ return String(n).padStart(2, '0'); };
  L.push('Generado el ' + pd(d.getDate()) + '/' + pd(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pd(d.getHours()) + ':' + pd(d.getMinutes()) + ' desde Lumen. Horarios sujetos a cambios; consultar el cronograma en línea.');
  let y = H - 14 - (L.length - 1) * 9;
  L.forEach(function(s, i){ p.text(mg, y + i * 9, pdfCortar(s, 6.5, false, W - 2 * mg), 6.5, { color: PDF_GRIS }); });
}
function nmPNom(k){ const q = ST.M.PM[k]; return q ? q.nom : ''; }
function pdfGrilla(p, days, titulo, sub){
  const W = p.W, H = p.H, mg = 28, axW = 34, x0 = mg + axW, lanesD = days.map(lanesAdm), pesos = lanesD.map(function(ls){ return ls.reduce(function(s, l){ return s + LANE_W[l]; }, 0); }), ptot = pesos.reduce(function(a, b){ return a + b; }, 0), cwU = (W - mg - x0) / ptot;
  pdfCabecera(p, titulo, sub);
  let t0 = 480, t1 = 1020, any = false;
  days.forEach(function(d){ d.items.forEach(function(i, ix){
    i.uid = ix; any = true;
    const a = mins(i.d), b = mins(i.h) <= a ? 1440 : mins(i.h);
    t0 = Math.min(t0, Math.floor(a / 60) * 60); t1 = Math.max(t1, Math.ceil(b / 60) * 60);
  }); });
  const yH = 72, hH = 24, hL = 17, yG = yH + hH + hL, yB = H - 62, PXp = (yB - yG) / (t1 - t0);
  const Y = function(m){ return yG + (m - t0) * PXp; };
  for(let m = t0; m <= t1; m += 60){
    p.line(x0, Y(m), W - mg, Y(m), PDF_LINEA, 0.4);
    p.text(x0 - 4, Y(m) + 2.5, String(m / 60).padStart(2, '0') + ':00', 6.5, { align: 'right', color: PDF_GRIS });
  }
  let acum = 0;
  days.forEach(function(d, di){
    const dx = x0 + acum, cw = pesos[di] * cwU, usadas = lanesD[di], tot = pesos[di];
    acum += cw;
    p.rect(dx, yH, cw, hH, { fill: d.we ? [0.99, 0.94, 0.82] : [0.93, 0.94, 0.96], line: PDF_LINEA, lw: 0.4 });
    p.text(dx + cw / 2, yH + 10, d.lab, 9, { align: 'center', bold: true, color: PDF_NEG });
    const np = new Set(d.items.filter(function(i){ return i.kind !== 'rep'; }).map(function(i){ return i.k; })).size;
    p.text(dx + cw / 2, yH + 20, d.sub !== undefined ? d.sub : (np ? np + (np === 1 ? ' persona' : ' personas') : 'sin personal'), 6.5, { align: 'center', color: PDF_GRIS });
    let lx = dx;
    usadas.forEach(function(l){
      const lw = cw * PDF_LANE[l].w / tot, c = PDF_LANE[l];
      p.rect(lx, yH + hH, lw, hL, { fill: c.rgb });
      c.lab.split('|').forEach(function(t, ti, arr){ p.text(lx + lw / 2, yH + hH + (arr.length > 1 ? 7 + ti * 6.5 : 11), t, arr.length > 1 ? 5.4 : 6.5, { align: 'center', bold: true, color: [1, 1, 1] }); });
      p.rect(lx, yG, lw, yB - yG, { fill: c.bg });
      lx += lw;
    });
    for(let m = t0; m <= t1; m += 60) p.line(dx, Y(m), dx + cw, Y(m), PDF_LINEA, 0.3);
    p.rect(dx, yG, cw, yB - yG, { line: PDF_LINEA, lw: 0.5 });
    lx = dx;
    usadas.forEach(function(l){
      const lw = cw * PDF_LANE[l].w / tot, li = d.items.filter(function(i){ return (i.lane || 'box1') === l; }), Lm = layoutCol(li);
      li.forEach(function(i){
        const g = Lm[i.uid], bw = lw / g.n, a = mins(i.d), b = mins(i.h) <= a ? 1440 : mins(i.h), x = itemInfo(i), hu = hue(i.k || i['for']);
        const bx = lx + g.c * bw + 1, by = Y(a) + 0.5, bh = (b - a) * PXp - 1, bwi = bw - 2;
        const rgb = i.rotTipo ? [0.9, 0.9, 0.92] : hsl2rgb(hu, 0.7, 0.86), lin = i.over ? [0.85, 0.1, 0.1] : hsl2rgb(hu, 0.6, 0.38);
        p.rect(bx, by, bwi, bh, { fill: rgb, line: lin, lw: i.over ? 1.6 : 0.7, dash: i.kind === 'rep' || i.rotTipo ? [2.5, 1.5] : null });
        p.rect(bx, by, 2.2, bh, { fill: lin });
        /* nombre y horario en vertical (de abajo hacia arriba), ocupando todo el cuadro */
        const mh = bh - 5, lines = [[x.lab, true, 0.40], [tCorto(i.d, i.h), false, 0.32]];
        if(x.sub && bwi >= 44 && l !== 'ofi') lines.push([x.sub, false, 0.2]);
        const x0b = bx + 2.2, aw = bwi - 2.2;
        const fs = lines.map(function(ln){ return Math.max(4.5, Math.min(aw * ln[2], mh / Math.max(1, pdfAncho(pdfLat(ln[0]), 1, ln[1])), ln[2] > 0.3 ? 12 : 9)); });
        const suma = fs.reduce(function(s, v){ return s + v; }, 0), gap = Math.max(0.4, (aw - suma) / (lines.length + 1));
        let lxl = x0b + gap;
        lines.forEach(function(ln, n){
          const sz = fs[n], txt = pdfCortar(ln[0], sz, ln[1], mh), w = pdfAncho(pdfLat(txt), sz, ln[1]);
          p.textU(lxl + sz * 0.8, by + bh / 2 + w / 2, txt, sz, { bold: ln[1], color: PDF_NEG });
          lxl += sz + gap;
        });
      });
      lx += lw;
    });
    if(!d.items.length) p.text(dx + cw / 2, yG + 14, '—', 8, { align: 'center', color: PDF_GRIS });
  });
  return any;
}
function pdfDiasSemana(lunes){
  const t = 'adm', hoy = ST.puente.hoy(), out = [];
  for(let i = 0; i < 7; i++){
    const d = addD(lunes, i), dt = new Date(d + 'T12:00:00'), dd = ST.C.dayData(t, d, null);
    asignarBoxes(dd.items);
    if(i === 6 && !dd.items.length) continue;
    out.push(Object.assign({ lab: DIAS[i] + ' ' + dt.getDate() + '/' + (dt.getMonth() + 1), we: i >= 5 || !!ST.M.FER[d], today: d === hoy }, ST.M.FER[d] ? { sub: 'Feriado' } : {}, dd));
  }
  return out;
}
function pdfPagRotacion(desde){
  const C_ = ST.C, p = pdfPagina(842, 595), mg = 28, L = C_.rotLista(desde, 12);
  pdfCabecera(p, 'Rotación de sábados', null);
  const cols = [['Sábado', 90], ['Quién', 200], ['Horario', 90], ['Horas', 60], ['Semana siguiente (lunes a jueves)', 330]];
  let x = mg;
  const xs = cols.map(function(c){ const v = x; x += c[1]; return v; });
  let y = 80;
  p.rect(mg, y - 12, x - mg, 18, { fill: [0.93, 0.94, 0.96] });
  cols.forEach(function(c, i){ p.text(xs[i] + 4, y, c[0], 8, { bold: true, color: PDF_NEG }); });
  y += 18;
  L.forEach(function(r, ri){
    if(ri % 2) p.rect(mg, y - 12, x - mg, 18, { fill: [0.975, 0.98, 0.985] });
    const hs = (mins(r.h) - mins(r.d)) / 60;
    const v = [fmtF(r.sat), nmP(r.key), r.fer ? 'feriado' : tCorto(r.d, r.h) + ' h', r.fer ? '—' : (hs % 1 ? hs.toFixed(1) : hs) + ' h',
      rotNota(r)];
    v.forEach(function(s, i){ p.text(xs[i] + 4, y, pdfCortar(s, 8.5, false, cols[i][1] - 8), 8.5, { color: PDF_NEG }); });
    y += 18;
  });
  pdfPie(p, []);
  return p;
}
function construirPdfAdm(modo){
  const C_ = ST.C, hoy = ST.puente.hoy(), pags = [];
  if(modo === 'tipo'){
    const t = 'adm', days = DIAS.slice(0, 6).map(function(nom, dia){ return Object.assign({ lab: nom, we: dia >= 5 }, diaItems(t, dia)); });
    days.forEach(function(d){ asignarBoxes(d.items); });
    const p = pdfPagina(842, 595);
    pdfGrilla(p, days, 'Semana tipo' + (ST.C.rotOrden.length ? ' (lunes a viernes fijos; los sábados rotan)' : ''), null);
    pdfPie(p, []);
    pags.push(p); if(ST.C.rotOrden.length) pags.push(pdfPagRotacion(hoy));
    return { nombre: 'cronograma-administrativos-semana-tipo.pdf', bytes: pdfArmar(pags) };
  }
  if(modo === 'semana'){
    ensureWk();
    const lunes = S.wk, days = pdfDiasSemana(lunes), p = pdfPagina(842, 595);
    pdfGrilla(p, days, 'Semana del ' + fmtF(lunes) + ' al ' + fmtF(addD(lunes, 6)), null);
    pdfPie(p, []);
    pags.push(p); if(ST.C.rotOrden.length) pags.push(pdfPagRotacion(lunes));
    return { nombre: 'cronograma-administrativos-semana-' + lunes + '.pdf', bytes: pdfArmar(pags) };
  }
  const ws = admWeeks();
  ws.forEach(function(lunes, i){
    const p = pdfPagina(842, 595);
    pdfGrilla(p, pdfDiasSemana(lunes), 'Semana del ' + fmtF(lunes) + ' al ' + fmtF(addD(lunes, 6)) + ' · ' + MESES[S.m] + ' ' + S.y, 'Hoja ' + (i + 1) + ' de ' + (ws.length + (ST.C.rotOrden.length ? 1 : 0)));
    pdfPie(p, []);
    pags.push(p);
  });
  if(ST.C.rotOrden.length) pags.push(pdfPagRotacion(ws[0]));
  return { nombre: 'cronograma-administrativos-' + S.y + '-' + pad(S.m + 1) + '.pdf', bytes: pdfArmar(pags) };
}
function descargarPdfAdm(modo){
  try{
    const r = construirPdfAdm(modo), url = URL.createObjectURL(new Blob([r.bytes], { type: 'application/pdf' }));
    const a = h('a', { href: url, download: r.nombre, s: { display: 'none' } });
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); if(a.parentNode) a.parentNode.removeChild(a); }, 4000);
  }catch(e){
    ST.puente.aviso('No se pudo generar el PDF: ' + String(e && e.message || e));
  }
}

/* == arranque == */
async function iniciarCarga(){
  if(ST.cargando) return;
  ST.cargando = true; ST.error = null;
  pintar();
  try{ await leer(); ST.cargado = true; ST.error = null; }
  catch(e){ ST.error = ST.puente.codigoDe(e); }
  ST.cargando = false;
  pintar();
}
function teclaGlobal(ev){
  if(!ST.el || !ST.el.offsetParent) return;
  if(ev.key === 'Escape'){
    if(document.getElementById('cr-pop')) limpiarPop();
    else if(S.dp) cerrarPerson();
  }
}
function clicGlobal(ev){
  const pop = document.getElementById('cr-pop');
  if(pop && !pop.contains(ev.target) && S.pop && Date.now() - S.pop.t > 80) limpiarPop();
}
let tRs = null;
function alRedimensionar(){
  clearTimeout(tRs);
  tRs = setTimeout(function(){
    if(!ST.el || !ST.cargado || !ST.el.offsetParent) return;
    const w = ST.el.clientWidth || window.innerWidth, b = w < 700 ? 0 : w < 860 ? 1 : 2;
    if(b !== ST.R.bucket) pintar();
  }, 120);
}
/* al salir de la pestaña Cronogramas la ficha (colgada del body) se cierra; el borrador se conserva */
function alCambiarHashMod(){
  if(location.hash.indexOf('#cronogramas') === 0) return;
  S.dp = null; S.hl = null; S.hlL = null;
  quitarFlotantes();
  limpiarPop();
  if(hayBorrador()) ST.puente.aviso('Quedaron cambios sin guardar en Cronogramas. Volvé a esa pestaña para guardarlos o descartarlos.');
}
function mostrar(el, sub, puente){
  ST.puente = puente; ST.el = el;
  if(sub && SUBS.some(function(s){ return s.k === sub; }) && sub !== S.sub){ S.sub = sub; S.pf = null; S.dp = null; S.hl = null; S.hlL = null; S.wk = null; S.addP = false; S.addLP = false; }
  if(!ST.iniciado){
    ST.iniciado = true;
    const hy = puente.hoy();
    S.y = +hy.slice(0, 4); S.m = +hy.slice(5, 7) - 1;
    document.addEventListener('keydown', teclaGlobal);
    document.addEventListener('click', clicGlobal);
    window.addEventListener('resize', alRedimensionar);
    window.addEventListener('hashchange', alCambiarHashMod);
    window.addEventListener('beforeunload', avisoSalida);
  }
  if(!ST.cargado && !ST.cargando) return iniciarCarga();
  /* con borrador sin guardar nunca se vuelve a leer solo (pisaría lo que el usuario está editando) */
  if(ST.cargado && !ST.cargando && !ST.escribiendo && !ST.guardando && Date.now() - ST.leidoEn > 300000 && !hayBorrador()) return recargar(true);
  pintar();
}
window.LumenCronogramas = { mostrar: mostrar,
  pdfAdm: function(modo){ return construirPdfAdm(modo); },
  logica: { armarModelo: armarModelo, calculos: calculos, horasPago: horasPago, splitDN: splitDN, letterOf: letterOf, repDiaQuitar: repDiaQuitar, repDiaAsignar: repDiaAsignar, repDiaMover: repDiaMover, repDiaAgregar: repDiaAgregar },
  cambios: function(){ return cambiosPendientes().map(function(c){ return { tipo: c.tipo, ent: c.ent, titulo: c.titulo, texto: textoCambio(c) }; }); } };
})();
