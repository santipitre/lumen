/* ═══════════════════════════════════
   medico-metricas.js — motor de métricas y semáforo
   (FR2.1, FR2.2, FR3.1–FR3.3, PLAN-3.1 · fase 3-motor-metricas-semaforo)

   Funciones puras, SIN DOM: ninguna función de este archivo toca la página
   (ni el árbol de nodos ni su marcado) ni lee la fecha de corte global de
   medico.html. Si alguna función necesitara una fecha de corte, entra
   siempre por parámetro, nunca por esa variable global.

   Script clásico (sin `import`/`export`), mismo scope global que medico.js.
   Reutiliza, sin volver a declararlas, estas globales de medico.js — por
   eso el orden de carga es OBLIGATORIO: medico.html carga este archivo
   DESPUÉS de medico.js:
     parseDate, toDateStr, tieneInformeIF, esCentinela,
     categorizarInconsistencia, modalidad, normalizarClave, EQUIPO_GROUPS.

   Fase 3 (A1): el motor se construyó sin cablear a las vistas. Desde la
   fase 4 las vistas de medico.js lo consumen (Semáforo, Pendientes, demora
   mediana) y SC2 se exige también fuera del motor. Acá sigue valiendo SC2
   DENTRO del motor: semaforo() no tiene números propios, todos salen de
   SLA_DEFAULT.

   Prohibido el identificador "dias" (en minúsculas, tal cual) en este
   archivo: evita coincidir con las comparaciones de días de los mutantes
   viejos de medico_mutantes.py, calcadas sobre variables locales de
   medico.js con ese nombre exacto. Acá se usa `horas` y `diasCal`.
═══════════════════════════════════ */

function deepFreeze(o) {
  Object.getOwnPropertyNames(o).forEach(k => {
    const v = o[k];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(o);
}

// PROVISORIO (OQ1, A2): horas corridas, pendiente de aprobación. INT/URG sin valores: semaforo() devuelve 'sin umbral'
const SLA_DEFAULT = deepFreeze({
  'RAYOS X': { AMB: { verde: 24, amarillo: 48 } },
  'ECOGRAFÍA / DOPPLER': { AMB: { verde: 'mismoDia', amarillo: 24, amarilloDiasSinHora: 1 } },
  'TOMOGRAFÍA': { AMB: { verde: 48, amarillo: 72 } },
  'RESONANCIA MAGNÉTICA': { AMB: { verde: 48, amarillo: 72 } },
  'CÁMARA GAMMA': { AMB: { verde: 72, amarillo: 120 } },
});

// B1: única marca. false = umbrales PROVISORIOS (abre Resumen + aviso); true = aprobados (OQ1): abre Semáforo, sin aviso.
let SLA_APROBADO = false;

const MS_POR_HORA = 3600000;
const HORAS_POR_DIA = 24;

/* Granularidad de minuto, igual que la marca FR1.6 de medico.js: SheetJS con
   cellDates le suma ~48 s a las fechas leídas (00:00:00 llega como
   00:00:48), así que exigir segundos en 0 nunca detectaría una medianoche real. */
function esMedianoche(d) {
  return d.getHours() === 0 && d.getMinutes() === 0;
}

function mismoDiaLocal(a, b) {
  return toDateStr(a) === toDateStr(b);
}

function diasCalendario(a, b) {
  const soloFechaA = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const soloFechaB = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((soloFechaB - soloFechaA) / 86400000);
}

function tipoTurno(r) {
  return normalizarClave(r['Tipo Turno']);
}

/* 'dia' si Turno Fecha es medianoche exacta, 'hora' si trae hora, null si
   Turno Fecha falta o no se puede leer (no hay precisión que mostrar). */
function precisionFila(r) {
  const fe = parseDate(r['Turno Fecha']);
  if (!fe) return null;
  return esMedianoche(fe) ? 'dia' : 'hora';
}

/* FR2.1: demora real en horas, SIN TOPE (D1). El único filtro es
   categorizarInconsistencia (D10 de PROJECT.md), nunca un corte < N. */
function tatHoras(r) {
  if (!tieneInformeIF(r) || categorizarInconsistencia(r) !== null) return null;
  return (parseDate(r['Fecha Informe']) - parseDate(r['Turno Fecha'])) / MS_POR_HORA;
}

/* Interpolación lineal sobre la lista ordenada (Hyndman-Fan tipo 7): el
   mismo método que PERCENTILE.INC/MEDIAN de Excel y numpy.percentile. */
function percentil(valores, p) {
  const x = valores.slice().sort((a, b) => a - b);
  const n = x.length;
  if (n === 0) return null;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, n - 1);
  return x[lo] + (h - lo) * (x[hi] - x[lo]);
}

const ZERO = 0;
function validarHoras(horas) {
  if (!Number.isFinite(horas) || horas < ZERO) {
    throw new RangeError("semaforo(): horas debe ser un numero finito y no negativo");
  }
}

/* FR3.1/FR3.3: semaforo(modalidad, tipoTurno, horas, fechas). `fechas`
   ({inicio: Date, fin: Date}) es obligatorio SÓLO para Eco (A3) y opcional
   para el resto. 'sin umbral' se resuelve ANTES de validar horas: una fila
   INT/URG nunca tira error por el semáforo de Eco (A4). */
function semaforo(modalidad, tipoTurno, horas, fechas) {
  const regla = SLA_DEFAULT[modalidad];
  if (!regla) return null;                                   // OTROS / sin SLA
  const u = regla[normalizarClave(tipoTurno)];
  if (!u) return 'sin umbral';                                // INT, URG o faltante
  validarHoras(horas);
  if (u.verde === 'mismoDia') {
    if (!fechas || !(fechas.inicio instanceof Date) || !(fechas.fin instanceof Date)) {
      throw new TypeError("semaforo(): fechas.inicio y fechas.fin son obligatorios para Eco");
    }
    if (esMedianoche(fechas.inicio) || esMedianoche(fechas.fin)) {  // Eco sin hora
      if (mismoDiaLocal(fechas.inicio, fechas.fin)) return 'verde';
      return diasCalendario(fechas.inicio, fechas.fin) <= u.amarilloDiasSinHora ? 'amarillo' : 'rojo';
    }
    if (mismoDiaLocal(fechas.inicio, fechas.fin)) return 'verde';   // Eco con hora
    return horas <= u.amarillo ? 'amarillo' : 'rojo';
  }
  if (horas <= u.verde) return 'verde';
  return horas <= u.amarillo ? 'amarillo' : 'rojo';
}

/* FR2.2: agregados sobre cualquier universo de filas (típicamente
   window.__t.realizados o un subconjunto filtrado por Tipo Turno). */
function agregados(filas) {
  const tats = [];
  const bandas = { verde: 0, amarillo: 0, rojo: 0 };
  const excluidos = { centinela: 0, fecha_ilegible: 0, informe_antes_del_estudio: 0 };
  let pendientes = 0;
  let nSinSla = 0;

  filas.forEach(r => {
    const cat = categorizarInconsistencia(r);
    if (cat) { excluidos[cat] = (excluidos[cat] || 0) + 1; return; }   // una categoría nueva no da NaN
    if (!tieneInformeIF(r)) { pendientes += 1; return; }
    const h = tatHoras(r);
    tats.push(h);
    const banda = semaforo(modalidad(r), r['Tipo Turno'], h,
      { inicio: parseDate(r['Turno Fecha']), fin: parseDate(r['Fecha Informe']) });
    if (banda === null || banda === 'sin umbral') { nSinSla += 1; }
    else { bandas[banda] += 1; }
  });

  const n = tats.length;
  const totalBandas = bandas.verde + bandas.amarillo + bandas.rojo;
  return {
    n,
    medianaHoras: percentil(tats, 0.5),
    p90Horas: percentil(tats, 0.9),
    maxHoras: n ? tats.reduce((a, b) => (a > b ? a : b)) : null,
    bandas,
    pctEnSla: totalBandas ? 100 * bandas.verde / totalBandas : null,
    nSinSla,
    excluidos,
    pendientes,
  };
}

function exigirFecha(fechaCorte, quien) {
  if (!(fechaCorte instanceof Date) || isNaN(fechaCorte)) {
    throw new TypeError(quien + "(): fechaCorte tiene que ser un Date valido");
  }
}

/* Horizontes de FR2.3 (% informado a las H horas). NO son umbrales de
   semáforo: la cohorte no aplica SLA y por eso no lleva nSinSla. */
const HORIZONTES_COHORTE = [24, 48, 72];

/* FR2.3/D7: % informado a las H horas, por estudio y por horizonte.
   - inconsistente (categorizarInconsistencia) → sinTat, antes que nada;
   - edad = fechaCorte - Turno Fecha; edad < H → abierto (fuera de todo:
     un informado rápido dentro de una ventana abierta NO infla el %);
   - si no, elegible; a tiempo si tatHoras <= H.
   pct = 100 * aTiempo / elegibles, o null. porDia agrupa por la fecha local
   de Turno Fecha. */
function cohortes(filas, fechaCorte) {
  exigirFecha(fechaCorte, 'cohortes');
  const vacio = () => {
    const c = {};
    HORIZONTES_COHORTE.forEach(h => { c[h] = { elegibles: 0, aTiempo: 0, abiertos: 0, sinTat: 0 }; });
    return c;
  };
  const global = vacio();
  const porDia = {};

  filas.forEach(r => {
    const fe = parseDate(r['Turno Fecha']);
    const destinos = [global];
    if (fe) {
      const clave = toDateStr(fe);
      destinos.push(porDia[clave] || (porDia[clave] = vacio()));
    }
    if (categorizarInconsistencia(r) !== null) {
      destinos.forEach(d => HORIZONTES_COHORTE.forEach(h => { d[h].sinTat += 1; }));
      return;
    }
    const edad = (fechaCorte - fe) / MS_POR_HORA;
    const tat = tatHoras(r);
    destinos.forEach(d => HORIZONTES_COHORTE.forEach(h => {
      const c = d[h];
      if (edad < h) { c.abiertos += 1; return; }
      c.elegibles += 1;
      if (tat !== null && tat <= h) c.aTiempo += 1;
    }));
  });

  const conPct = d => {
    HORIZONTES_COHORTE.forEach(h => {
      d[h].pct = d[h].elegibles ? 100 * d[h].aTiempo / d[h].elegibles : null;
    });
    return d;
  };
  conPct(global);
  Object.keys(porDia).forEach(k => conPct(porDia[k]));
  global.porDia = porDia;
  return global;
}

/* FR2.4: edad en horas de un pendiente contra fechaCorte; null si tiene
   informe o si Turno Fecha no se puede leer. */
function edadHoras(r, fechaCorte) {
  if (tieneInformeIF(r)) return null;
  const fe = parseDate(r['Turno Fecha']);
  if (!fe) return null;
  return (fechaCorte - fe) / MS_POR_HORA;
}

/* FR2.4: pendientes por modalidad y banda, con la edad medida contra
   fechaCorte (Eco: inicio = Turno Fecha, fin = fechaCorte). sinUmbral cuenta
   'sin umbral' (A4), sinSla cuenta null (A5, OTROS); nSinSla es la suma.
   Pendientes sin Turno Fecha legible van a sinFecha, y los de Turno Fecha
   posterior a fechaCorte (edad negativa: una fecha de corte pasada) van a
   posteriorAlCorte, sin semáforo; total = todos. */
function backlog(filas, fechaCorte) {
  exigirFecha(fechaCorte, 'backlog');
  const porModalidad = {};
  EQUIPO_GROUPS.map(g => g.label).concat('OTROS').forEach(lbl => {
    porModalidad[lbl] = { verde: 0, amarillo: 0, rojo: 0, sinUmbral: 0, sinSla: 0, total: 0, nSinSla: 0 };
  });
  let total = 0;
  let sinFecha = 0;
  let posteriorAlCorte = 0;

  filas.forEach(r => {
    if (tieneInformeIF(r)) return;
    total += 1;
    const edad = edadHoras(r, fechaCorte);
    if (edad === null) { sinFecha += 1; return; }
    if (edad < ZERO) { posteriorAlCorte += 1; return; }
    const mod = modalidad(r);
    const m = porModalidad[mod];
    const banda = semaforo(mod, r['Tipo Turno'], edad,
      { inicio: parseDate(r['Turno Fecha']), fin: fechaCorte });
    m.total += 1;
    if (banda === null) m.sinSla += 1;
    else if (banda === 'sin umbral') m.sinUmbral += 1;
    else m[banda] += 1;
  });

  let nSinSla = 0;
  Object.keys(porModalidad).forEach(k => {
    const m = porModalidad[k];
    m.nSinSla = m.sinUmbral + m.sinSla;
    nSinSla += m.nSinSla;
  });
  return { porModalidad, total, sinFecha, posteriorAlCorte, nSinSla };
}

/* FR5.1/B2: % en SLA de los estudios realizados en la ventana
   (fechaCorte − ventanaDias·24 h, fechaCorte], por Turno Fecha y por modalidad.
   Inconsistente → excluidos. Informado → banda de su TAT: verde en SLA,
   amarillo/rojo fuera, null/'sin umbral' en nSinSla. Pendiente → banda de su
   edad contra fechaCorte: verde = en plazo (fuera del denominador),
   amarillo/rojo fuera de SLA (vencido), null/'sin umbral' en nSinSla.
   pctEnSla = 100 · enSla / (enSla + fueraSla), o null. */
function pctEnSlaVentana(filas, fechaCorte, ventanaDias) {
  exigirFecha(fechaCorte, 'pctEnSlaVentana');
  if (!Number.isFinite(ventanaDias) || ventanaDias <= ZERO) {
    throw new RangeError("pctEnSlaVentana(): ventanaDias debe ser un numero finito y positivo");
  }
  const desde = new Date(fechaCorte.getTime() - ventanaDias * HORAS_POR_DIA * MS_POR_HORA);
  const vacio = () => ({ enSla: 0, fueraSla: 0, nSinSla: 0, nPendientesEnPlazo: 0, excluidos: 0 });
  const porModalidad = Object.create(null);
  EQUIPO_GROUPS.map(g => g.label).concat('OTROS').forEach(lbl => { porModalidad[lbl] = vacio(); });

  filas.forEach(r => {
    const fe = parseDate(r['Turno Fecha']);
    if (!fe) return;
    if (!(fe > desde && fe <= fechaCorte)) return;
    const mod = modalidad(r);
    const m = porModalidad[mod];
    if (categorizarInconsistencia(r) !== null) { m.excluidos += 1; return; }
    let banda;
    if (tieneInformeIF(r)) {
      banda = semaforo(mod, r['Tipo Turno'], tatHoras(r), { inicio: fe, fin: parseDate(r['Fecha Informe']) });
    } else {
      banda = semaforo(mod, r['Tipo Turno'], edadHoras(r, fechaCorte), { inicio: fe, fin: fechaCorte });
      if (banda === 'verde') { m.nPendientesEnPlazo += 1; return; }
    }
    if (banda === null || banda === 'sin umbral') m.nSinSla += 1;
    else if (banda === 'verde') m.enSla += 1;
    else m.fueraSla += 1;
  });

  const conPct = m => {
    const den = m.enSla + m.fueraSla;
    m.pctEnSla = den ? 100 * m.enSla / den : null;
    return m;
  };
  const total = vacio();
  Object.keys(porModalidad).forEach(k => {
    const m = conPct(porModalidad[k]);
    Object.keys(total).forEach(c => { total[c] += m[c]; });
  });
  return { porModalidad, total: conPct(total) };
}

const textoOVacio = v => String(v || '').trim() || '(vacío)';

function claveFecha(r, fmt) {
  const fe = parseDate(r['Turno Fecha']);
  return fe ? fmt(fe) : '(sin fecha)';
}

/* Semana ISO 8601 en hora local: la semana del jueves de esa semana. */
function semanaIso(d) {
  const diaIso = (d.getDay() + 6) % 7;                 // lunes = 0
  const jueves = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - diaIso);
  const anioIso = jueves.getFullYear();
  const primerJueves = new Date(anioIso, 0, 4);
  const semana = 1 + Math.round(
    (diasCalendario(primerJueves, jueves) - 3 + (primerJueves.getDay() + 6) % 7) / 7);
  return anioIso + '-W' + String(semana).padStart(2, '0');
}

const CLAVES_AGRUPAR = {
  modalidad: r => modalidad(r),
  prestacion: r => textoOVacio(r['Prestación']),
  medicoInformante: r => textoOVacio(r['Médico Informante']),
  informanteSugerido: r => textoOVacio(r['Informante Sugerido']),
  diaSemana: r => claveFecha(r, d => String(((d.getDay() + 6) % 7) + 1)),
  semana: r => claveFecha(r, semanaIso),
};

/* FR2.5: {clave: agregados(subconjunto)} según el criterio. */
function agrupar(filas, criterio) {
  const clave = Object.prototype.hasOwnProperty.call(CLAVES_AGRUPAR, criterio) && CLAVES_AGRUPAR[criterio];
  if (!clave) throw new TypeError("agrupar(): criterio desconocido: " + criterio);
  // Sin prototipo (AUDIT-3 I1): las claves son texto libre del Excel, y una
  // Prestación '__proto__' o 'constructor' no puede resolver a Object.prototype.
  const grupos = Object.create(null);
  filas.forEach(r => {
    const k = clave(r);
    (grupos[k] || (grupos[k] = [])).push(r);
  });
  const out = Object.create(null);
  Object.keys(grupos).forEach(k => { out[k] = agregados(grupos[k]); });
  return out;
}
