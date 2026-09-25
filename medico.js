/* ═══════════════════════════════════
   AUTH GUARD — requiere sesión activa
═══════════════════════════════════ */
(function() {
  const SK = 'spcd_session', TO = 8*60*60*1000;
  const DEFAULTS = { admin:{admin:'edit',tecnico:'edit',medico:'edit',operativo:'admin'}, consultor:{admin:'view',tecnico:'view',medico:'view',operativo:'view'}, mixto:{medico:'edit',operativo:'admin'}, solicitante:{operativo:'pedidos'} };
  const SOLICITANTES_FORZADOS = ['TRUMBO','VFORNI','ISKAMLEC','MWSANCHEZ','JAVILA','LBASTIAS'];
  try {
    const s = JSON.parse(localStorage.getItem(SK));
    if (!s || Date.now() - s.ts >= TO) throw 0;
    if (s.user && s.user.username && SOLICITANTES_FORZADOS.includes(s.user.username.toUpperCase())) {
      window.location.href = 'operativo.html'; return;
    }
    const pm = (s.user.permisos && s.user.permisos.modulos) ? s.user.permisos.modulos : (DEFAULTS[s.user.rol]||{});
    if (!pm.medico) throw 0;
    window.__spcd_user = s.user;
    window.__spcd_perm = pm.medico;
  } catch(e) {
    window.location.href = 'app.html';
  }
})();

/* FR4.5/B9 (fase 4): rankings y agregados por médico sólo para admin/jefatura,
   o sea quien tiene el módulo médico en 'edit' o 'admin' (el mismo criterio que
   puedeEditar() de caja-datos.js y los guards de app.html). Cualquier otro valor
   ('view', vacío o desconocido) no ve. Guard client-side: disuasivo, no una
   garantía (la garantía real llega con RLS en la fase 6). */
const AVISO_RANKING = 'Ranking de médicos visible sólo para admin/jefatura';
function puedeVerRankingMedicos() {
  return window.__spcd_perm === 'edit' || window.__spcd_perm === 'admin';
}
const avisoRankingHTML = () => `<div class="aviso-ranking">${esc(AVISO_RANKING)}</div>`;
const filaAvisoRanking = columnas => `<tr><td colspan="${columnas}">${avisoRankingHTML()}</td></tr>`;

/* Sin permiso: el filtro global Médico no aparece y los exports por médico
   quedan deshabilitados. */
function aplicarPermisosRanking() {
  if (puedeVerRankingMedicos()) return;
  const fm = document.getElementById('f-medico');
  if (fm) fm.closest('.filter-group').style.display = 'none';
  document.querySelectorAll('button[onclick^="exportRealizadosExcel"], button[onclick^="exportTiempoExcel"]')
    .forEach(b => { b.disabled = true; b.title = AVISO_RANKING; });
}

/* ═══════════════════════════════════
   STORAGE (IndexedDB)
═══════════════════════════════════ */
/* SPCD_DB, SPCD_STORE, openDB, dbLoad, dbSave viven ahora en spcd-utils.js */

/* ═══════════════════════════════════
   ESTADO
═══════════════════════════════════ */
let rawData  = [];
let filtered = [];
let realizados = [];
let fechaCorteActual = null;
let chartDias, chartDonut;

/* ═══════════════════════════════════
   UNIDAD DE CONTEO: ESTUDIO (D4/FR1.2/FR1.3)
   estudio = Turno N° con al menos un renglón no accesorio. PREST_EXCLUIDAS
   vivía sólo dentro de populateFilters y sólo filtraba el <select> de
   prestaciones; ahora a nivel de módulo también filtra los conteos/KPI.
═══════════════════════════════════ */
const PREST_EXCLUIDAS = ['PERFUSION Y DIF. RM DINAMICA','MATERIAL','SET DE BOMBA','COSEGURO','RADIOFARMACO','TC DESARROLLO 3D','NC/ND','AGUJAS','NOTA','REGION','ADICIONAL'];
function esAccesoria(prest) {
  return PREST_EXCLUIDAS.some(ex => (prest||'').toUpperCase().startsWith(ex));
}
function esEstudio(r) {
  return r['Estado'] === 'REA' && !esAccesoria(r['Prestación']);
}

/* esc() de spcd-utils.js serializa un nodo de texto y no escapa comillas:
   sirve para contenido, no para atributos. Para title="..." va escAttr(). */
function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════
   STORAGE PROPIO (D6/FR1.1)
   medico.js se hace su propia copia de spcd_data_full en spcd_data_medico,
   con timestamp ISO propio (nunca spcd_upload_date: es texto localizado y
   admin.html lo pisa). Si spcd_data_full no trae las 12 columnas médicas,
   se usa la última copia buena y se avisa; si tampoco hay copia, se avisa
   sin mostrar ningún número (D1 de CONTEXT-2.md, SC4).
═══════════════════════════════════ */
const COLUMNAS_MEDICAS_REQUERIDAS = ['Estado','Turno Fecha','Turno N°','Paciente','Documento',
  'Prestación','Médico','Médico Informante','Informante Sugerido','Informe','Fecha Informe','Equipo'];

function columnasFaltantes(data) {
  const presentes = new Set();
  data.forEach(r => Object.keys(r).forEach(k => presentes.add(k)));
  return COLUMNAS_MEDICAS_REQUERIDAS.filter(c => !presentes.has(c));
}

function mostrarAvisoColumnas(faltantes, copiadoEn) {
  const copiaMsg = copiadoEn
    ? `Mostrando la última copia guardada (${fmtDateTime(copiadoEn)}).`
    : 'No hay ninguna copia previa guardada.';
  document.getElementById('upload-sub-text').textContent =
    `⚠️ Los datos cargados no traen: ${faltantes.join(', ')}. ${copiaMsg}`;
  document.getElementById('data-status').textContent = '';
}

/* ═══════════════════════════════════
   INIT
═══════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  aplicarPortada();
  aplicarPermisosRanking();
  const sede = localStorage.getItem('spcd_sede') || '';
  document.getElementById('bc-sede').textContent  = sede || 'Sede';
  document.getElementById('top-sede').textContent = sede || '—';

  const uploadDate = localStorage.getItem('spcd_upload_date') || '';
  function mostrarErrorCarga(msg) {
    document.getElementById('upload-sub-text').textContent = msg;
    if (uploadDate) document.getElementById('data-status').textContent = `Última actualización: ${uploadDate}`;
  }
  function tryLoad(retries) {
    dbLoad('spcd_data_full').then(data => {
      if (data && data.length > 0) {
        if (columnasFaltantes(data).length === 0) {
          rawData = data;
          dbSave('spcd_data_medico', { meta: { copiadoEn: new Date().toISOString() }, rows: data })
            .catch(err => console.error('Error guardando spcd_data_medico:', err));
          try {
            onDataLoaded(rawData);
          } catch(err) {
            console.error('Error en onDataLoaded:', err);
            mostrarErrorCarga('⚠️ Error al procesar datos: ' + err.message);
          }
        } else {
          // D6/FR1.1: spcd_data_full no trae las columnas médicas requeridas
          // (posible pisada de admin.html con datos de la nube) -- cae a la
          // última copia buena propia, si existe, y avisa (D1 de CONTEXT-2.md).
          const faltantes = columnasFaltantes(data);
          dbLoad('spcd_data_medico').catch(e2 => {
            console.error('Error leyendo spcd_data_medico:', e2);
            return null;
          }).then(datosViejos => {
            if (datosViejos && datosViejos.rows) {
              rawData = datosViejos.rows;
              try {
                onDataLoaded(rawData);
              } catch(err) {
                console.error('Error en onDataLoaded:', err);
              }
              mostrarAvisoColumnas(faltantes, datosViejos.meta && datosViejos.meta.copiadoEn);
            } else {
              // Sin copia previa: sin datos falsos (SC4) -- rawData/realizados
              // quedan vacíos y el aviso explícito reemplaza al mensaje genérico.
              rawData = [];
              mostrarAvisoColumnas(faltantes, null);
            }
          }).catch(err => console.error('Error procesando spcd_data_medico:', err));
        }
      } else {
        mostrarErrorCarga('⚠️ No hay datos cargados. Volvé a Inicio y cargá el archivo Excel.');
      }
    }).catch(e => {
      console.error('IndexedDB error (intento '+(3-retries+1)+'):', e);
      if (retries > 0) { setTimeout(() => tryLoad(retries - 1), 500); return; }
      mostrarErrorCarga('⚠️ Error al leer datos. Volvé a cargar el Excel desde Inicio.');
    });
  }
  tryLoad(2);
});

/* ═══════════════════════════════════
   ON DATA LOADED
═══════════════════════════════════ */
function onDataLoaded(data) {
  // B3a: las fechas del Excel real del HIS (.xls) llegan exactas; la página no
  // las corrige (medido en Estadistica497.xls: 0 ms de sesgo en 49.336 fechas).
  const zone = document.getElementById('upload-zone');
  zone.classList.add('has-data');
  const uploadDate = localStorage.getItem('spcd_upload_date') || '';
  document.getElementById('upload-sub-text').textContent =
    `✅  ${data.length.toLocaleString()} registros cargados`;
  document.getElementById('data-status').textContent = uploadDate ? `Última actualización: ${uploadDate}` : '';

  // Solo estudios realizados (D4: unidad = estudio, no renglón)
  realizados = deduplicarPorTurno(data.filter(esEstudio));

  // A12(a): Servicio no vacío y desconocido -- se cuenta y se avisa (un solo
  // console.warn, no console.error, para no disparar el filtro de errores
  // del test). modalidad() sigue siendo pura y no loguea por fila.
  const desconocidos = serviciosDesconocidos(data);
  if (Object.keys(desconocidos).length > 0) {
    console.warn('Servicio desconocido → OTROS (sin fallback): ' + JSON.stringify(desconocidos));
  }

  populateFilters(data);
  document.getElementById('filters-bar').style.display = 'flex';

  filtered = [...realizados];
  render(filtered);
}

/* ═══════════════════════════════════
   POBLAR FILTROS
═══════════════════════════════════ */
function populateFilters(data) {
  const rea = data.filter(esEstudio);

  const fechas = rea.map(r => parseDate(r['Turno Fecha'])).filter(Boolean)
    .map(toDateStr).sort();
  if (fechas.length) {
    document.getElementById('f-desde').value = fechas[0];
    document.getElementById('f-hasta').value = fechas[fechas.length-1];
  }

  // B9: sin permiso, el filtro Médico no lista nombres (y está oculto).
  const medicos = puedeVerRankingMedicos()
    ? [...new Set(rea.map(r => r['Médico Informante']).filter(m => medicoValido(m)))].sort() : [];
  const selM = document.getElementById('f-medico');
  selM.innerHTML = '<option value="">Todos</option>';
  medicos.forEach(m => { const o=document.createElement('option'); o.value=m; o.textContent=m; selM.appendChild(o); });

  // rea ya excluye accesorias (esEstudio): no hace falta filtrar PREST_EXCLUIDAS
  // de nuevo acá, ninguna prestación accesoria puede aparecer en este universo.
  const prests = [...new Set(rea.map(r => r['Prestación']).filter(Boolean))].sort();
  const selP = document.getElementById('f-prest');
  selP.innerHTML = '<option value="">Todas</option>';
  prests.forEach(p => { const o=document.createElement('option'); o.value=p; o.textContent=p.slice(0,50); selP.appendChild(o); });
}

/* ═══════════════════════════════════
   FILTROS
═══════════════════════════════════ */
function applyFilters() {
  const desde   = document.getElementById('f-desde').value;
  const hasta   = document.getElementById('f-hasta').value;
  const medico  = document.getElementById('f-medico').value;
  const informe = document.getElementById('f-informe').value;
  const prest   = document.getElementById('f-prest').value;

  filtered = realizados.filter(r => {
    const fd = parseDate(r['Turno Fecha']);
    if (!fd) return false;
    const ds = toDateStr(fd);
    if (desde && ds < desde) return false;
    if (hasta && ds > hasta) return false;
    if (medico && r['Médico Informante'] !== medico) return false;
    if (prest  && r['Prestación'] !== prest) return false;
    if (informe === 'CON' && !tieneInformeIF(r)) return false;
    if (informe === 'SIN' && tieneInformeIF(r))  return false;
    return true;
  });
  render(filtered);
}

function resetFilters() {
  populateFilters(rawData);
  document.getElementById('f-medico').value  = '';
  document.getElementById('f-informe').value = '';
  document.getElementById('f-prest').value   = '';
  filtered = [...realizados];
  render(filtered);
}

/* ═══════════════════════════════════
   FECHA DE CORTE (D5/FR1.4)
   Máxima entre Turno Fecha (siempre) y Fecha Informe (sólo si no es el
   centinela -1, año >= 1900) del dataset. Reemplaza a new Date() como
   referencia de edad de los pendientes: determinista, no depende de cuándo
   se mira la pantalla.
═══════════════════════════════════ */
/* ═══════════════════════════════════
   CENTINELA -1 DE Fecha Informe (D10, FR1.7)
   El serial -1 de Excel llega a JS como Date(1899-12-29) (año < 1900): pasa
   el chequeo !fInforme de tieneInformeIF (D3: "con informe" = Informe no
   vacío) y sólo lo frenaba, en silencio, el guard dias>=0 de calcKPIs.
═══════════════════════════════════ */
function esCentinela(d) {
  return !!(d && d.getFullYear() < 1900);
}

function calcFechaCorte(data) {
  let max = null;
  data.forEach(r => {
    const fe = parseDate(r['Turno Fecha']);
    if (fe && (!max || fe > max)) max = fe;
    const fi = parseDate(r['Fecha Informe']);
    if (fi && fi.getFullYear() >= 1900 && (!max || fi > max)) max = fi;
  });
  return max;
}

/* ═══════════════════════════════════
   RENDER
═══════════════════════════════════ */
function render(data) {
  fechaCorteActual = calcFechaCorte(data);
  calcKPIs(data);
  renderAlertPendientes(data);
  renderChartDias(data);
  renderChartDonut(data);
  renderRankMedicos(data);
  renderRankTiempos(data);
  renderTabPendientes(data);
  renderTabMedicos(data);
  renderTabSemaforo(data);
}

/* ═══════════════════════════════════
   KPIs
═══════════════════════════════════ */
function calcKPIs(data) {
  const conInforme = data.filter(r => tieneInformeIF(r));
  const sinInforme = data.filter(r => !tieneInformeIF(r));

  document.getElementById('kpi-pendientes').textContent = sinInforme.length.toLocaleString();
  document.getElementById('kpi-pend-sub').textContent =
    `de ${data.length.toLocaleString()} estudios realizados`;

  document.getElementById('kpi-realizados').textContent = conInforme.length.toLocaleString();
  document.getElementById('kpi-real-sub').textContent =
    `${data.length ? ((conInforme.length/data.length)*100).toFixed(1) : 0}% del total`;

  // B5 (fase 4): demora MEDIANA en días, sin tope, desde agregados() del motor.
  const demora = resumenDemora(conInforme);
  document.getElementById('kpi-tiempo').textContent = demora.mediana;

  // D10/FR1.7: el centinela -1 (Fecha Informe -> Date año<1900) cuenta en
  // "con informe" pero queda afuera del cálculo de demora. Antes se perdía
  // en silencio dentro del guard dias>=0; ahora se cuenta aparte y se
  // muestra explícito junto al KPI de demora (D3 de CONTEXT-2.md).
  const informadosSinFecha = conInforme.filter(r => esCentinela(parseDate(r['Fecha Informe']))).length;
  document.getElementById('kpi-tiempo-sub').textContent =
    `sobre ${demora.n.toLocaleString()} informes con fecha registrada` +
    (informadosSinFecha > 0 ? ` · ${informadosSinFecha.toLocaleString()} informados sin fecha` : '');

  const linkInconsistentes = document.getElementById('kpi-inconsistentes-link');
  if (linkInconsistentes) {
    const totalInconsistentes = getInconsistentes(data).length;
    linkInconsistentes.style.display = totalInconsistentes > 0 ? 'block' : 'none';
  }

  const medActivos = new Set(conInforme.map(r => r['Médico Informante']).filter(m => medicoValido(m)));
  document.getElementById('kpi-medicos').textContent = medActivos.size;
  // B9: sin permiso, sólo la cantidad (sin nombres).
  document.getElementById('kpi-med-sub').textContent = puedeVerRankingMedicos()
    ? `${[...medActivos].slice(0,2).join(', ') || 'en el período'}` : 'en el período';
}

/* ═══════════════════════════════════
   ALERTA
═══════════════════════════════════ */
function renderAlertPendientes(data) {
  const sinInforme = data.filter(r => !tieneInformeIF(r));
  const alert = document.getElementById('alert-pendientes');
  if (sinInforme.length > 0) {
    alert.style.display = 'flex';
    document.getElementById('alert-val').textContent = sinInforme.length;
    document.getElementById('alert-sub').textContent =
      `${sinInforme.length} estudio${sinInforme.length === 1 ? '' : 's'} realizado${sinInforme.length === 1 ? '' : 's'} sin informe registrado en el sistema`;
  } else {
    alert.style.display = 'none';
  }
}

/* ═══════════════════════════════════
   CHART DÍAS
═══════════════════════════════════ */
function renderChartDias(data) {
  const conInforme = data.filter(r => tieneInformeIF(r));
  const byDay  = groupBy(data,       r => toDateStr(parseDate(r['Turno Fecha'])));
  const byDayI = groupBy(conInforme, r => toDateStr(parseDate(r['Turno Fecha'])));
  const labels = Object.keys(byDay).filter(Boolean).sort().slice(-30);
  const vTot   = labels.map(d => byDay[d]?.length  || 0);
  const vInf   = labels.map(d => byDayI[d]?.length || 0);

  if (chartDias) chartDias.destroy();
  chartDias = new Chart(document.getElementById('chart-dias').getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels.map(l => l ? l.slice(5) : ''),
      datasets: [
        { label:'Informados', data: vInf, backgroundColor:'rgba(85,231,139,.7)', borderRadius:3, stack:'s' },
        { label:'Sin informe', data: vTot.map((v,i)=>v-vInf[i]), backgroundColor:'rgba(248,113,113,.4)', borderRadius:3, stack:'s' }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:true,
      plugins:{ legend:{ labels:{ color:'#94A3B8', font:{ size:11 } } } },
      scales:{
        x:{ stacked:true, ticks:{ color:'#64748B', font:{size:10} }, grid:{ color:'rgba(30,58,138,.2)' } },
        y:{ stacked:true, ticks:{ color:'#64748B', font:{size:10} }, grid:{ color:'rgba(30,58,138,.2)' } }
      }
    }
  });
}

/* ═══════════════════════════════════
   CHART DONUT
═══════════════════════════════════ */
function renderChartDonut(data) {
  const con = data.filter(r => tieneInformeIF(r)).length;
  const sin = data.length - con;
  if (chartDonut) chartDonut.destroy();
  chartDonut = new Chart(document.getElementById('chart-donut').getContext('2d'), {
    type:'doughnut',
    data:{
      labels:['Con informe','Sin informe'],
      datasets:[{
        data:[con, sin],
        backgroundColor:['rgba(85,231,139,.75)','rgba(248,113,113,.6)'],
        borderWidth:0, hoverOffset:6
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:true, cutout:'65%',
      plugins:{
        legend:{ position:'bottom', labels:{ color:'#94A3B8', font:{size:11}, padding:12, boxWidth:12 } }
      }
    }
  });
}

/* ═══════════════════════════════════
   RANK MÉDICOS
═══════════════════════════════════ */
function renderRankMedicos(data) {
  if (!puedeVerRankingMedicos()) { document.getElementById('rank-medicos').innerHTML = avisoRankingHTML(); return; }
  const conInforme = data.filter(r => tieneInformeIF(r) && medicoValido(r['Médico Informante']));
  const byMed = groupBy(conInforme, r => r['Médico Informante']);
  const sorted = Object.entries(byMed).sort((a,b)=>b[1].length-a[1].length).slice(0,8);
  const maxVal = sorted[0]?.[1].length || 1;
  const container = document.getElementById('rank-medicos');
  if (!sorted.length) { container.innerHTML = emptyState('👨‍⚕️','Sin datos'); return; }
  container.innerHTML = sorted.map(([med, rows], i) => `
    <div class="rank-item">
      <div class="rank-num">${i+1}</div>
      <div class="rank-label"><span title="${escAttr(med)}">${esc(med)}</span></div>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${(rows.length/maxVal*100).toFixed(0)}%;background:rgba(85,231,139,.5)"></div></div>
      <div class="rank-val" style="color:var(--green)">${rows.length}</div>
    </div>`).join('');
}

/* ═══════════════════════════════════
   DEMORA (B3/B5, fase 4): mediana sin tope desde el motor
═══════════════════════════════════ */
const fmtDias = horas => horas === null ? '—' : (horas / HORAS_POR_DIA).toFixed(1);

function resumenDemora(filas) {
  const a = agregados(filas);
  return { n: a.n, mediana: fmtDias(a.medianaHoras), p90: fmtDias(a.p90Horas), bandas: a.bandas };
}

/* agregados() por Médico Informante válido (sin ADMINVM/DALONSO ni vacío). */
function demoraPorMedico(filas) {
  const g = agrupar(filas.filter(r => medicoValido(r['Médico Informante'])), 'medicoInformante');
  delete g['(vacío)'];
  return g;
}

const cmpTexto = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
// B8 con umbrales provisorios: como hoy, los más rápidos primero (mediana ascendente).
const ordenPorMediana = ([ma, a], [mb, b]) => (a.medianaHoras - b.medianaHoras) || cmpTexto(ma, mb);
// B8/FR4.3 con umbrales aprobados: % en SLA ascendente (sin % al final), los peores primero.
const ordenPorSla = ([ma, a], [mb, b]) => {
  if ((a.pctEnSla === null) !== (b.pctEnSla === null)) return a.pctEnSla === null ? 1 : -1;
  return ((a.pctEnSla || 0) - (b.pctEnSla || 0)) || (b.medianaHoras - a.medianaHoras) || cmpTexto(ma, mb);
};

function renderRankTiempos(data) {
  if (!puedeVerRankingMedicos()) { document.getElementById('rank-tiempos').innerHTML = avisoRankingHTML(); return; }
  const porMed = demoraPorMedico(data.filter(r => tieneInformeIF(r)));
  const ordenRank = SLA_APROBADO ? ordenPorSla : ordenPorMediana;
  const sorted = Object.entries(porMed).filter(([, a]) => a.n).sort(ordenRank).slice(0, 8);
  const maxVal = sorted.reduce((m, [, a]) => Math.max(m, a.medianaHoras), 0) || 1;
  const container = document.getElementById('rank-tiempos');
  if (!sorted.length) { container.innerHTML = emptyState('⏱','Sin datos'); return; }
  // B6: sin color por médico hasta la fase 5 (barra y texto neutros).
  container.innerHTML = sorted.map(([med, a], i) => `<div class="rank-item">
      <div class="rank-num">${i+1}</div>
      <div class="rank-label"><span title="${escAttr(med)}">${esc(med)}</span></div>
      <div class="rank-bar-wrap"><div class="rank-bar bar-neutra" style="width:${(a.medianaHoras/maxVal*100).toFixed(0)}%"></div></div>
      <div class="rank-val" style="color:var(--text)">${fmtDias(a.medianaHoras)}d</div>
    </div>`).join('');
}

/* ═══════════════════════════════════
   TAB PENDIENTES
═══════════════════════════════════ */
/* ═══════════════════════════════════
   PENDIENTES (FR5.2, fase 4): bandas de semaforo(), orden por días de demora
═══════════════════════════════════ */
const RANGO_BANDA = { rojo: 0, amarillo: 1, verde: 2, 'sin umbral': 3, 'sin SLA': 4, 'sin fecha': 5 };
const CLASE_BANDA = { rojo: 'urgencia-alta', amarillo: 'urgencia-media', verde: 'urgencia-normal', 'sin umbral': 'urgencia-na', 'sin SLA': 'urgencia-sinsla', 'sin fecha': 'urgencia-na' };
const ETIQUETA_BANDA = { rojo: '● Rojo', amarillo: '● Amarillo', verde: '● Verde', 'sin umbral': 'Sin umbral', 'sin SLA': 'Sin SLA', 'sin fecha': '—' };

/* Banda de un pendiente por su edad contra fechaCorte (sólo el motor decide). */
function bandaPendiente(r, fechaCorte) {
  const edad = edadHoras(r, fechaCorte);
  if (edad === null || edad < 0) return 'sin fecha';
  const b = semaforo(modalidad(r), r['Tipo Turno'], edad, { inicio: parseDate(r['Turno Fecha']), fin: fechaCorte });
  return b === null ? 'sin SLA' : b;
}

/* Más demorados primero: edad descendente sin importar la banda (un 'sin umbral'
   de 140 días va antes que un rojo de 10), sin edad al final, y turno. */
function ordenarPendientes(filas, fechaCorte) {
  const conBanda = filas.map(r => ({ r, banda: bandaPendiente(r, fechaCorte), edad: edadHoras(r, fechaCorte) }));
  conBanda.sort((a, b) => {
    if ((a.edad === null) !== (b.edad === null)) return a.edad === null ? 1 : -1;
    if (a.edad !== b.edad) return b.edad - a.edad;
    return cmpTexto(String(a.r['Turno N°']), String(b.r['Turno N°']));
  });
  return conBanda;
}

/* Peor banda de un conjunto (tono del KPI del Excel de pendientes). */
function peorBanda(filas, fechaCorte) {
  return filas.map(r => bandaPendiente(r, fechaCorte))
    .reduce((peor, b) => (peor === null || RANGO_BANDA[b] < RANGO_BANDA[peor]) ? b : peor, null);
}

const edadEnDias = (r, fechaCorte) => {
  const edad = edadHoras(r, fechaCorte);
  return edad === null ? null : edad / HORAS_POR_DIA;
};

function renderTabPendientes(data) {
  const todos = data.filter(r => !tieneInformeIF(r));
  const fMod = document.getElementById('f-pend-modalidad').value;
  const fSem = document.getElementById('f-pend-semaforo').value;
  const hoy = fechaCorteActual;
  const ordenados = hoy ? ordenarPendientes(todos, hoy) : todos.map(r => ({ r, banda: 'sin fecha', edad: null }));
  const visibles = ordenados.filter(({ r, banda }) => {
    if (fMod && modalidad(r) !== fMod) return false;
    if (fSem && banda !== fSem) return false;
    return true;
  });

  document.getElementById('count-pend').textContent = (fMod || fSem)
    ? `${visibles.length.toLocaleString()} de ${todos.length.toLocaleString()} registros`
    : `${todos.length.toLocaleString()} registros`;

  const tbody = document.getElementById('tbody-pendientes');
  if (!visibles.length) {
    const msg = todos.length ? 'Ningún pendiente con estos filtros' : '¡Sin informes pendientes!';
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="e-icon">✅</div><div class="e-text">${msg}</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = visibles.slice(0,300).map(({ r, banda, edad }) => {
    const fEstudio = parseDate(r['Turno Fecha']);
    const diasStr  = edad === null ? '—' : (edad / HORAS_POR_DIA).toFixed(0);
    return `<tr>
      <td>${fEstudio ? fEstudio.toLocaleDateString('es-AR') : '—'}</td>
      <td style="color:var(--muted)">${esc(r['Turno N°']||'—')}</td>
      <td>${esc((r['Paciente']||'').slice(0,24))}</td>
      <td title="${escAttr(r['Prestación']||'')}">${esc((r['Prestación']||'').slice(0,32))}…</td>
      <td>${esc(r['Médico']||'—')}</td>
      <td>${r['Informante Sugerido'] ? esc(r['Informante Sugerido']) : '<span style="color:var(--muted)">No asignado</span>'}</td>
      <td style="text-align:center;font-family:'Rajdhani',sans-serif;font-size:15px;font-weight:700">${diasStr}</td>
      <td class="${CLASE_BANDA[banda]}">${ETIQUETA_BANDA[banda]}</td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════
   TAB MÉDICOS
═══════════════════════════════════ */
function renderTabMedicos(data) {
  if (!puedeVerRankingMedicos()) { document.getElementById('medicos-grid').innerHTML = avisoRankingHTML(); return; }
  const conInforme = data.filter(r => tieneInformeIF(r) && medicoValido(r['Médico Informante']));
  const byMed = groupBy(conInforme, r => r['Médico Informante']);
  const sorted = Object.entries(byMed).sort((a,b)=>b[1].length-a[1].length);
  const maxInf = sorted[0]?.[1].length || 1;
  const grid = document.getElementById('medicos-grid');

  if (!sorted.length) {
    grid.innerHTML = emptyState('👨‍⚕️','Sin médicos informantes registrados');
    return;
  }

  const porMed = demoraPorMedico(conInforme);
  grid.innerHTML = sorted.map(([med, rows]) => {
    // B5: demora mediana sin tope del médico (agregados del motor).
    // Contrato: agrupar(..., 'medicoInformante') usa como clave
    // String(valor).trim() (textoOVacio en medico-metricas.js); si esa
    // normalización cambia, este lookup tiene que cambiar igual.
    const a = porMed[String(med).trim()];
    const mediana = a ? fmtDias(a.medianaHoras) : '—';
    const pct = ((rows.length/maxInf)*100).toFixed(0);

    return `<div class="medico-card">
      <div class="medico-avatar">👨‍⚕️</div>
      <div class="medico-nombre" title="${escAttr(med)}">${esc(med)}</div>
      <div class="medico-stats">
        <div class="medico-stat">
          <span>Informes realizados</span>
          <span class="medico-stat-val">${rows.length}</span>
        </div>
        <div class="medico-stat">
          <span>Demora mediana</span>
          <span class="medico-stat-val">${mediana === '—' ? '—' : mediana + ' días'}</span>
        </div>
        <div class="medico-stat">
          <span>Participación</span>
          <span class="medico-stat-val">${pct}%</span>
        </div>
      </div>
      <div class="medico-bar">
        <div class="medico-bar-fill" style="width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════
   TABS
═══════════════════════════════════ */
function switchTab(id, btn) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b  => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

/* ═══════════════════════════════════
   VISTA SEMÁFORO (FR5.1, fase 4)
═══════════════════════════════════ */
// Ventanas de FR5.1 (% en SLA de los últimos N días), no umbrales de semáforo.
const VENTANAS_SLA_DIAS = [7, 30];
// B3c: fecha desde la que la demora se muestra sin tope de días.
const FECHA_DEMORA_SIN_TOPE = '25/09/2026';
const AVISO_UMBRALES = 'Umbrales provisorios — en revisión';

function pintarNotasDemora() {
  document.querySelectorAll('.nota-demora').forEach(el => {
    el.textContent = 'Desde ' + FECHA_DEMORA_SIN_TOPE + ': demora sin tope de días';
  });
}

/* Líneas del aviso B1, generadas desde SLA_DEFAULT: la vista no tiene números propios. */
function textoUmbrales() {
  const lineas = Object.keys(SLA_DEFAULT).map(mod => {
    const u = SLA_DEFAULT[mod].AMB;
    const verde = u.verde === 'mismoDia' ? 'verde mismo día' : `verde ≤ ${u.verde} h`;
    return `${mod}: ${verde} · amarillo ≤ ${u.amarillo} h · rojo > ${u.amarillo} h`;
  });
  return lineas.concat('INT/URG: sin umbral');
}

/* B1: SLA_APROBADO (medico-metricas.js) es la única marca. Provisorio: abre en
   Resumen y muestra el aviso con los valores; aprobado: abre en Semáforo, sin aviso. */
function aplicarPortada() {
  // El aviso se muestra en Semáforo y en Pendientes (pedido del usuario, fase 4).
  const avisos = ['sla-aviso', 'sla-aviso-pend'].map(id => document.getElementById(id)).filter(Boolean);
  if (SLA_APROBADO) {
    switchTab('tab-semaforo', document.getElementById('tab-btn-semaforo'));
    avisos.forEach(a => { a.style.display = 'none'; });
  } else {
    const html = `<div class="sla-aviso-titulo">${esc(AVISO_UMBRALES)}</div>`
      + textoUmbrales().map(l => `<div>${esc(l)}</div>`).join('');
    avisos.forEach(a => { a.innerHTML = html; a.style.display = ''; });
  }
  pintarNotasDemora();
}

const fmtPct = v => v === null ? '—' : v.toFixed(1) + '%';

function renderTabSemaforo(data) {
  const grid = document.getElementById('semaforo-grid');
  if (!fechaCorteActual) { grid.innerHTML = emptyState('🚦', 'Sin datos'); return; }
  const bk = backlog(data, fechaCorteActual);
  const ventanas = VENTANAS_SLA_DIAS.map(v => ({ v, r: pctEnSlaVentana(data, fechaCorteActual, v) }));
  grid.innerHTML = Object.keys(bk.porModalidad).map(label => {
    const b = bk.porModalidad[label];
    const bloques = ventanas.map(({ v, r }) => {
      const m = r.porModalidad[label];
      return `<div class="sem-ventana">
        <div class="sem-ventana-titulo">Últimos ${v} días</div>
        <div class="sem-pct sem-pct-${v}">${fmtPct(m.pctEnSla)}</div>
        <div class="sem-meta sem-sinsla-${v}">${m.nSinSla} sin SLA</div>
        <div class="sem-meta sem-enplazo-${v}">${m.nPendientesEnPlazo} pendientes en plazo</div>
      </div>`;
    }).join('');
    return `<div class="sem-card" data-modalidad="${escAttr(label)}">
      <div class="sem-card-titulo">${esc(label)}</div>
      <div class="sem-backlog">
        <span class="sem-bk sem-bk-verde">${b.verde}</span>
        <span class="sem-bk sem-bk-amarillo">${b.amarillo}</span>
        <span class="sem-bk sem-bk-rojo">${b.rojo}</span>
        <span class="sem-bk-leyenda">pendientes · <span class="sem-bk-sinsla">${b.nSinSla}</span> sin SLA</span>
      </div>
      <div class="sem-ventanas">${bloques}</div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════
   UTILS
═══════════════════════════════════ */
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  const d = new Date(val);
  return isNaN(d) ? null : d;
}
function toDateStr(d) { return d ? (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')) : null; }
function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item) || 'Sin datos';
    (acc[k] = acc[k]||[]).push(item); return acc;
  }, {});
}
function emptyState(icon, text) {
  return `<div class="empty-state"><div class="e-icon">${icon}</div><div class="e-text">${text}</div></div>`;
}
function tieneInformeIF(r) {
  // Alineado con tecnico.html y chatbot: "con informe" = campo Informe no vacío
  return String(r['Informe']||'').trim() !== '';
}

const MEDICOS_EXCLUIDOS = new Set(['ADMINVM','DALONSO']);
function medicoValido(med) {
  return med && !MEDICOS_EXCLUIDOS.has(med.trim().toUpperCase());
}

/* ═══════════════════════════════════
   GRUPOS DE EQUIPOS (A10)
   RAYOS X queda solo (ya no comparte grupo con Eco residente); ECOG-DOPP
   H.ITALIANO RESIDENTE pasa al final de ECOGRAFÍA / DOPPLER. Por decisión
   A12(b) del usuario se suman los equipos que hoy caían en OTROS: 4
   ECOG-DOPP a ECOGRAFÍA / DOPPLER y CGAMMA - H.ITALIANO a CÁMARA GAMMA.
   Ninguno de esos 5 es residente. Esta lista sirve de FALLBACK cuando
   Servicio falta o viene vacío (A6/A11) -- ver modalidad() más abajo.
═══════════════════════════════════ */
const EQUIPO_GROUPS = [
  { label: 'RAYOS X',
    equipos: ['RX-H.ITALIANO-GBA','RX-H.ITALIANO-MERATE'] },
  { label: 'ECOGRAFÍA / DOPPLER',
    equipos: ['ECOG-DOPP H.ITALIANO SHERRERA','ECOG-DOPP H.ITALIAN CHAVEZ MA','ECOG-DOPP H.ITALIANO CCUESTA',
              'ECOG-DOPP H.ITALIANO AAGUADO','ECOG-DOPP H.ITALIAN CHAVEZ ME','ECOG-DOPP H.ITALIANO MSZWALBER',
              'ECOG-H.ITALIANO DIMARCO','ECOG-DOPP H.ITALIANO RESIDENTE',
              'ECOG-DOPP H.ITALIANO RFARAH','ECOG-DOPP H.ITALIAN GUAJARDO','ECOG-DOPP H.ITALIANO KSITA',
              'ECOG-DOPP H.ITALIANO LBASTIAS'] },
  { label: 'TOMOGRAFÍA',
    equipos: ['TCMC PHIL.-BRILLANCE 64 HITALI'] },
  { label: 'RESONANCIA MAGNÉTICA',
    equipos: ['RMN -H ITALIA-GE SIGNA HORIZON','RMN-H ITALIA-SIEMENS FLOW'] },
  { label: 'CÁMARA GAMMA',
    equipos: ['CGAM- H.ITALIANO GENERALES','CGAM- H.ITALIANO CARDIOLOGICOS','CGAMMA - H.ITALIANO'] }
];
const EQUIPO_SET = new Set();
EQUIPO_GROUPS.forEach(g => g.equipos.forEach(e => EQUIPO_SET.add(e.toUpperCase())));

/* A10: equipos de eco de residentes. Se basa en el Equipo, no en Servicio,
   para que la fase 4 pueda filtrar o subagrupar "Eco residentes". */
const EQUIPOS_RESIDENTE = ['ECOG-DOPP H.ITALIANO RESIDENTE'];
function esResidente(r) {
  return EQUIPOS_RESIDENTE.includes(String((r && r['Equipo']) || '').trim().toUpperCase());
}

/* A6: gemela de normalizar() de baseline.py. NFD, quita marcas diacríticas,
   trim(), colapsa espacios internos a uno, upper(). */
function normalizarClave(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().replace(/\s+/g, ' ').toUpperCase();
}

/* A6/A10: Servicio normalizado (sin tildes) -> label de A10. Cada valor
   tiene que ser exactamente un g.label de EQUIPO_GROUPS. */
const SERVICIO_A_MODALIDAD = {
  'RAYOS X': 'RAYOS X',
  'ECOGRAFIA': 'ECOGRAFÍA / DOPPLER',
  'ECOGRAFIA DOPPLER': 'ECOGRAFÍA / DOPPLER',
  'TOMOGRAFIA': 'TOMOGRAFÍA',
  'RESONANCIA MAGNETICA': 'RESONANCIA MAGNÉTICA',
  'CAMARA GAMMA': 'CÁMARA GAMMA'
};

/* FR1.5/A6/A10/A11: función pura -- reemplaza el matcheo por Equipo/
   EQUIPO_GROUPS que antes estaba duplicado dentro de handleExportClick y
   getExportRows. Lee Servicio primero (A6); si falta o viene vacío, cae al
   fallback por Equipo/EQUIPO_GROUPS (A11), que devuelve los mismos 5 labels.
   Un Servicio no vacío pero desconocido da OTROS y NO cae al fallback (A12a). */
function modalidad(r) {
  const serv = normalizarClave(r['Servicio']);
  if (serv) return SERVICIO_A_MODALIDAD[serv] || 'OTROS';
  // fallback A6/A11: sólo si Servicio falta o viene vacío
  const eq = (r['Equipo']||'').trim().toUpperCase();
  const grupo = EQUIPO_GROUPS.find(g => g.equipos.some(e => e.toUpperCase() === eq));
  return grupo ? grupo.label : 'OTROS';
}

/* A12(a): Servicio no vacío y fuera de los 6 conocidos -- se cuenta y se
   muestra qué valor fue (sin fallback, ver modalidad() arriba). Pura y
   global: no toca el DOM ni loguea por fila. */
function serviciosDesconocidos(rows) {
  const out = {};
  (rows || []).forEach(r => {
    const original = String((r && r['Servicio']) || '').trim();
    if (!original) return;
    if (SERVICIO_A_MODALIDAD[normalizarClave(original)]) return;
    out[original] = (out[original] || 0) + 1;
  });
  return out;
}

/* ═══════════════════════════════════
   INCONSISTENTES (FR1.7, D10)
   Une, sin descartar nada, las tres categorías de estudio inconsistente:
   centinela (informe cargado con Fecha Informe = centinela), informe
   cargado con fecha anterior al estudio (dias<0, sin ser el centinela) y
   fecha ilegible (Turno Fecha no parseable, o Informe cargado con Fecha
   Informe no parseable). Cada estudio cuenta en a lo sumo una categoría,
   con esa misma prioridad -- port textual de categorizar_inconsistencia()
   de _test/medico/baseline.py.
═══════════════════════════════════ */
function categorizarInconsistencia(r) {
  const informe = String(r['Informe']||'').trim();
  const fi = parseDate(r['Fecha Informe']);
  if (informe && esCentinela(fi)) return 'centinela';
  const fe = parseDate(r['Turno Fecha']);
  if (!fe) return 'fecha_ilegible';
  if (informe) {
    if (!fi) return 'fecha_ilegible';
    const dias = (fi - fe) / 86400000;
    if (dias < 0) return 'informe_antes_del_estudio';
  }
  return null;
}
function getInconsistentes(data) {
  return data.filter(r => categorizarInconsistencia(r) !== null);
}

/* ═══════════════════════════════════
   MODAL
═══════════════════════════════════ */
let modalRows = [], modalFiltered = [], modalTitle = '', modalTipo = '';

function openModal(tipo) {
  if (!filtered.length) return;
  modalTipo = tipo;
  switch(tipo) {
    case 'pendientes': {
      // Mismo orden que la pestaña Pendientes: días de demora descendente.
      const sinInf = filtered.filter(r => !tieneInformeIF(r));
      modalRows = fechaCorteActual ? ordenarPendientes(sinInf, fechaCorteActual).map(x => x.r) : sinInf;
      break;
    }
    case 'realizados':
    case 'tiempo':
    case 'medicos':        modalRows = filtered.filter(r => tieneInformeIF(r)); break;
    case 'cobertura':      modalRows = [...filtered]; break;
    // lo dispara #kpi-inconsistentes-link desde la tarjeta ámbar (FR1.7)
    case 'inconsistentes': modalRows = getInconsistentes(filtered); break;
    default:               modalRows = [...filtered];
  }
  // filtered sale de realizados, que ya pasó por esEstudio (Estado = REA)
  const labels = {pendientes:'Informes Pendientes',realizados:'Informes Realizados',tiempo:'Estudios con Informe',medicos:'Estudios por Médico',cobertura:'Todos los Estudios',inconsistentes:'Estudios Inconsistentes'};
  const colors = {pendientes:'var(--red)',realizados:'var(--cyan)',tiempo:'var(--blue)',medicos:'var(--green)',cobertura:'var(--amber)',inconsistentes:'var(--red)'};
  modalTitle = labels[tipo] || 'Detalle';
  document.getElementById('modal-title').textContent = modalTitle;
  document.getElementById('modal-bar').style.background = colors[tipo] || 'var(--green)';
  document.getElementById('modal-search').value = '';
  modalFiltered = [...modalRows];
  renderModalTable(modalFiltered);
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('modal-search').focus(), 400);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => {
  if(e.key==='Escape') {
    if(document.getElementById('tiempo-page').classList.contains('open')) closeTiempoPage();
    else if(document.getElementById('realizados-page').classList.contains('open')) closeRealizadosPage();
    else closeModal();
  }
});

function filterModal(query) {
  const q = query.toLowerCase().trim();
  if(!q) { modalFiltered = [...modalRows]; }
  else {
    modalFiltered = modalRows.filter(r =>
      (r['Paciente']||'').toLowerCase().includes(q) ||
      String(r['Documento']||'').toLowerCase().includes(q) ||
      (r['Prestación']||'').toLowerCase().includes(q) ||
      // B9: sin permiso no se busca por médico (el conteo sería un agregado por médico).
      (puedeVerRankingMedicos() && (r['Médico Informante']||'').toLowerCase().includes(q))
    );
  }
  renderModalTable(modalFiltered);
}

function renderModalTable(rows) {
  const MAX = 500;
  const display = rows.slice(0, MAX);
  document.getElementById('modal-count').textContent = rows.length.toLocaleString() + ' registros' + (rows.length > MAX ? ' (mostrando '+MAX+')' : '');
  document.getElementById('modal-footer-count').textContent = rows.length.toLocaleString() + ' registros' + (rows.length !== modalRows.length ? ' filtrados de '+modalRows.length.toLocaleString() : '');
  document.getElementById('modal-tbody').innerHTML = display.map(r => {
    const fecha = parseDate(r['Turno Fecha']);
    let fechaStr = fecha ? fecha.toLocaleDateString('es-AR') : '—';
    // FR1.6: a medianoche exacta la hora no se guardó (o se perdió en el
    // camino) -- sin esta marca, una fecha así se ve igual que una con hora
    // real, aunque su precisión es sólo de día, no de minuto.
    if (fecha && fecha.getHours() === 0 && fecha.getMinutes() === 0) {
      fechaStr += ' <span class="fecha-sin-hora" title="Precisión: día">(día)</span>';
    }
    const tieneInf = tieneInformeIF(r);
    const infVal = (r['Informe']||'').trim();
    const edadD = !tieneInf ? edadEnDias(r, fechaCorteActual) : null;
    const dias = edadD === null ? '—' : Math.floor(edadD);
    const claseDias = edadD === null ? '' : CLASE_BANDA[bandaPendiente(r, fechaCorteActual)];
    return '<tr>' +
      '<td>'+fechaStr+'</td>' +
      '<td style="color:var(--muted)">'+esc(r['Turno N°']||'—')+'</td>' +
      '<td style="font-weight:600">'+esc(r['Paciente']||'—')+'</td>' +
      '<td style="color:var(--muted)">'+esc(r['Documento']||'—')+'</td>' +
      '<td>'+esc(r['Prestación']||'—')+'</td>' +
      '<td style="color:'+(tieneInf?'var(--green)':'var(--red)')+'">'+(tieneInf?'I/F':esc(infVal||'Sin I/F'))+'</td>' +
      '<td'+(claseDias ? ' class="'+claseDias+'"' : ' style="color:var(--muted)"')+'>'+dias+'</td>' +
    '</tr>';
  }).join('');
}

function deduplicarPorTurno(rows) {
  const seen = new Set();
  return rows.filter(r => {
    const t = r['Turno N°'];
    if (!t || t==='') return true;
    if (seen.has(t)) return false;
    seen.add(t); return true;
  });
}

/* ═══════════════════════════════════
   REALIZADOS PAGE
═══════════════════════════════════ */
let realizadosData = [];

function openRealizadosPage() {
  if (!filtered.length) return;

  const conInforme = filtered.filter(r => tieneInformeIF(r));
  realizadosData = conInforme;

  // Agrupar por médico informante (conteo de informes)
  const byMed = {};
  conInforme.forEach(r => {
    const med = (r['Médico Informante']||'').trim();
    if (!medicoValido(med)) return;
    if (!byMed[med]) byMed[med] = [];
    byMed[med].push(r);
  });
  const medData = Object.entries(byMed).map(([med, rows]) => ({ medico: med, count: rows.length }))
    .sort((a,b) => b.count - a.count);

  const maxCount = medData[0]?.count || 1;

  // B5: demora mediana y P90 generales, sin tope (agregados del motor)
  const demora = resumenDemora(conInforme);
  const conDias = v => v === '—' ? '—' : v + ' días';

  // Summary cards
  document.getElementById('real-total').textContent = conInforme.length.toLocaleString();
  document.getElementById('real-medicos').textContent = medData.length;
  document.getElementById('real-tiempo').textContent = conDias(demora.mediana);
  document.getElementById('real-p90').textContent = conDias(demora.p90);

  // Tabla (B9: sin permiso, el aviso en lugar del detalle por médico)
  const tbody = document.getElementById('real-tbody');
  tbody.innerHTML = !puedeVerRankingMedicos() ? filaAvisoRanking(4) : medData.map((m, i) => {
    const pct = ((m.count / maxCount) * 100).toFixed(0);

    return `<tr>
      <td class="rank-col">${i + 1}</td>
      <td class="name-col">${esc(m.medico)}</td>
      <td class="num-col">${m.count}</td>
      <td class="bar-col">
        <div class="real-bar-wrap">
          <div class="real-bar" style="width:${pct}%"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Mostrar página
  document.getElementById('realizados-page').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeRealizadosPage() {
  document.getElementById('realizados-page').classList.remove('open');
  document.body.style.overflow = '';
}

async function exportRealizadosExcel(share) {
  if (!puedeVerRankingMedicos()) { showToast(AVISO_RANKING); return; }   // B9
  if (!realizadosData.length) return;
  try {
    await SpcdExcel.ready();

    const conInforme = realizadosData;
    const byMed = {};
    conInforme.forEach(r => {
      const med = (r['Médico Informante']||'').trim();
      if (!medicoValido(med)) return;
      if (!byMed[med]) byMed[med] = [];
      byMed[med].push(r);
    });

    const medData = Object.entries(byMed).map(([med, rows]) => ({ medico: med, count: rows.length }))
      .sort((a,b) => b.count - a.count);

    const totInfs = medData.reduce((s,m) => s + m.count, 0);
    const top    = medData[0] ? medData[0].count : 0;
    const cols   = ['#','Médico Informante','Informes'];
    const widths = [6, 38, 14];

    const subtitle = 'INFORMES REALIZADOS POR MÉDICO';
    const { wb, ws } = SpcdExcel.createBook({ subtitle, sheetName:'Realizados' });

    const h = SpcdExcel.buildHeader(ws, {
      subtitle, totalCols: cols.length,
      meta:{ modulo:'MEDICO', sede:SpcdExcel.getCurrentSede(), usuario:SpcdExcel.getCurrentUser(), registros: medData.length, extra:`${conInforme.length} estudios` }
    });
    const k = SpcdExcel.buildKPIs(ws, [
      { label:'Médicos',         value: medData.length,                   tone:'cyan' },
      { label:'Estudios totales',value: conInforme.length.toLocaleString('es-AR'), tone:'silver' },
      { label:'Top informante',  value: top,                              tone:'emerald', hint: medData[0]?medData[0].medico.split(' ')[0]:'' }
    ], { startRow:h.nextRow, totalCols:cols.length });
    const s = SpcdExcel.buildSection(ws, { startRow:k.nextRow, totalCols:cols.length, title:'RANKING POR MÉDICO INFORMANTE' });
    const t = SpcdExcel.buildTable(ws, {
      columns: cols, widths,
      rows: medData.map((m, i) => [i+1, m.medico, m.count]),
      startRow: s.nextRow, totalCols: cols.length,
      formatter: (cell, v, rd, idx, ci, cName) => {
        if (cName==='#' || cName==='Informes') SpcdExcel.Fmt.center(cell);
        if (cName==='Informes') SpcdExcel.Fmt.success(cell);
      }
    });
    const tot = SpcdExcel.buildTotals(ws, {
      startRow:t.nextRow, totalCols:cols.length,
      items:[
        { label:'Médicos', value: medData.length },
        { label:'Estudios', value: totInfs }
      ]
    });
    SpcdExcel.buildFooter(ws, { startRow:tot.nextRow, totalCols:cols.length, hash:h.hash });

    const fileName = `SPCD_Medico_Informes_Realizados_${SpcdExcel.nowIsoDate()}.xlsx`;
    await SpcdExcel.exportAndShare(wb, fileName, share ? {
      titulo:'Informes Realizados por Médico',
      periodo: SpcdExcel.dateAr(),
      cantidad: realizadosData.length,
      modulo:'medico', tipoExport:'realizados'
    } : null);
  } catch(err) {
    console.error('Export error:', err);
    if (typeof spcdAlert === 'function') {
      spcdAlert('Error al exportar: ' + err.message, { type:'error', title:'Error al exportar' });
    } else {
      alert('Error al exportar: ' + err.message);
    }
  }
}

/* ═══════════════════════════════════
   TIEMPO PAGE
═══════════════════════════════════ */
let tiempoData = [];
let tiempoFilas = [];

function openTiempoPage() {
  if (!filtered.length) return;

  const conInforme = filtered.filter(r => tieneInformeIF(r));
  tiempoFilas = conInforme;

  // Conteo de informes por médico informante
  const byMed = {};
  conInforme.forEach(r => {
    const med = (r['Médico Informante']||'').trim();
    if (!medicoValido(med)) return;
    byMed[med] = (byMed[med] || 0) + 1;
  });

  // B5: demora mediana y P90 por médico (agregados del motor, sin tope),
  // los más demorados primero.
  const porMed = demoraPorMedico(conInforme);
  const medData = Object.entries(porMed).filter(([, a]) => a.n)
    .map(([med, a]) => ({ medico: med, count: byMed[med] || 0, medianaHoras: a.medianaHoras,
                          mediana: fmtDias(a.medianaHoras), p90: fmtDias(a.p90Horas) }))
    .sort((a, b) => (b.medianaHoras - a.medianaHoras) || cmpTexto(a.medico, b.medico));

  tiempoData = medData;

  // Demora mediana y P90 generales
  const demora = resumenDemora(conInforme);
  const conDias = v => v === '—' ? '—' : v + ' días';

  // Summary cards
  document.getElementById('tiempo-avg').textContent = conDias(demora.mediana);
  document.getElementById('tiempo-p90').textContent = conDias(demora.p90);
  document.getElementById('tiempo-medicos').textContent = medData.length;
  document.getElementById('tiempo-total').textContent = demora.n.toLocaleString();

  const maxMed = medData.reduce((m, x) => Math.max(m, x.medianaHoras), 0) || 1;

  // Tabla (B6: sin color por médico hasta la fase 5)
  const tbody = document.getElementById('tiempo-tbody');
  tbody.innerHTML = !puedeVerRankingMedicos() ? filaAvisoRanking(6) : medData.map((m, i) => {
    const pct = ((m.medianaHoras / maxMed) * 100).toFixed(0);
    return `<tr>
      <td class="rank-col">${i + 1}</td>
      <td class="name-col">${esc(m.medico)}</td>
      <td class="time-col">${m.mediana}d</td>
      <td class="time-col">${m.p90}d</td>
      <td class="num-col">${m.count}</td>
      <td class="bar-col">
        <div class="real-bar-wrap">
          <div class="real-bar bar-neutra" style="width:${pct}%"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Mostrar página
  document.getElementById('tiempo-page').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeTiempoPage() {
  document.getElementById('tiempo-page').classList.remove('open');
  document.body.style.overflow = '';
}

async function exportTiempoExcel(share) {
  if (!puedeVerRankingMedicos()) { showToast(AVISO_RANKING); return; }   // B9
  if (!tiempoData.length) return;
  try {
    await SpcdExcel.ready();

    const cols   = ['#','Médico Informante','Demora mediana (días)','P90 (días)','Informes'];
    const widths = [6, 32, 22, 14, 14];
    const avgGen = document.getElementById('tiempo-avg').textContent;

    /* KPIs */
    const totMeds = tiempoData.length;
    const totInfs = tiempoData.reduce((s,m) => s + m.count, 0);
    // B7: fuera de SLA = estudios en banda amarillo o rojo de semaforo() (SLA provisorio).
    const demora = resumenDemora(tiempoFilas);
    const fueraSLA = demora.bandas.amarillo + demora.bandas.rojo;

    const subtitle = 'DEMORA MEDIANA DE INFORME';
    const { wb, ws } = SpcdExcel.createBook({ subtitle, sheetName:'Demora' });

    const h = SpcdExcel.buildHeader(ws, {
      subtitle, totalCols: cols.length,
      meta:{ modulo:'MEDICO', sede:SpcdExcel.getCurrentSede(), usuario:SpcdExcel.getCurrentUser(), registros: totMeds, extra:`MEDIANA GLOBAL: ${avgGen}` }
    });
    const k = SpcdExcel.buildKPIs(ws, [
      { label:'Médicos',        value: totMeds,                         tone:'cyan' },
      { label:'Informes',       value: totInfs.toLocaleString('es-AR'), tone:'silver' },
      { label:'Demora mediana', value: avgGen,                          tone:'emerald' },
      { label:'Fuera de SLA',   value: fueraSLA, tone: fueraSLA ? 'rose' : 'cyan', hint:'amarillo + rojo (SLA provisorio)' }
    ], { startRow:h.nextRow, totalCols:cols.length });
    const s = SpcdExcel.buildSection(ws, { startRow:k.nextRow, totalCols:cols.length, title:'DEMORA MEDIANA POR MÉDICO · DÍAS' });
    const t = SpcdExcel.buildTable(ws, {
      columns: cols, widths,
      rows: tiempoData.map((m,i) => [i+1, m.medico, Number(m.mediana), Number(m.p90), m.count]),
      startRow: s.nextRow, totalCols: cols.length,
      formatter: (cell, v, rd, idx, ci, cName) => {
        if (cName !== 'Médico Informante') SpcdExcel.Fmt.center(cell);
        // B6: sin color por médico hasta la fase 5.
        if ((cName==='Demora mediana (días)' || cName==='P90 (días)') && typeof v === 'number') cell.numFmt = '0.0 "días"';
        if (cName==='Informes') SpcdExcel.Fmt.accent(cell);
      }
    });
    const tot = SpcdExcel.buildTotals(ws, {
      startRow:t.nextRow, totalCols:cols.length,
      items:[
        { label:'Médicos', value: totMeds },
        { label:'Informes', value: totInfs },
        { label:'Mediana global', value: avgGen },
        fueraSLA ? { label:'Fuera SLA', value: fueraSLA } : null
      ].filter(Boolean)
    });
    SpcdExcel.buildFooter(ws, { startRow:tot.nextRow, totalCols:cols.length, hash:h.hash });

    const fileName = `SPCD_Medico_Demora_Mediana_${SpcdExcel.nowIsoDate()}.xlsx`;
    await SpcdExcel.exportAndShare(wb, fileName, share ? {
      titulo:'Demora mediana de informe',
      periodo: SpcdExcel.dateAr(),
      cantidad: tiempoData.length,
      modulo:'medico', tipoExport:'tiempo'
    } : null);
  } catch(err) {
    console.error('Export error:', err);
    if (typeof spcdAlert === 'function') {
      spcdAlert('Error al exportar: ' + err.message, { type:'error', title:'Error al exportar' });
    } else {
      alert('Error al exportar: ' + err.message);
    }
  }
}

/* ── Menú de exportación ── */
function handleExportClick() {
  if (!modalFiltered.length) { spcdAlert('No hay datos para exportar', { type:'alert', title:'Sin datos' }); return; }
  const menu = document.getElementById('export-menu');

  // Si NO es pendientes → menú simple con 2 opciones (descargar / compartir)
  if (modalTipo !== 'pendientes') {
    if (menu.classList.contains('open')) { menu.classList.remove('open'); return; }
    menu.innerHTML =
      '<div class="em-row">' +
        '<button class="em-part em-dl" onclick="exportExcel(\'all\', false);closeExportMenu()">' +
          '<span class="em-ic">⬇</span><span class="em-label">Descargar Excel</span>' +
        '</button>' +
        '<button class="em-part em-sh" title="Descargar y abrir diálogo de compartir" onclick="exportExcel(\'all\', true);closeExportMenu()">📤</button>' +
      '</div>';
    menu.classList.add('open');
    return;
  }

  // Si ya está abierto → cerrar
  if (menu.classList.contains('open')) { menu.classList.remove('open'); return; }

  // Construir menú con grupos
  const dataRows = deduplicarPorTurno(modalFiltered);
  let html = '<div class="em-row em-all">' +
    '<button class="em-part em-dl" onclick="exportExcel(\'all\', false);closeExportMenu()">' +
      '<span class="em-ic">⬇</span><span class="em-label">EXPORTAR TODO</span><span class="em-count">' + dataRows.length + ' reg.</span>' +
    '</button>' +
    '<button class="em-part em-sh" title="Descargar y compartir" onclick="exportExcel(\'all\', true);closeExportMenu()">📤</button>' +
  '</div>';

  EQUIPO_GROUPS.forEach((g, idx) => {
    const cnt = dataRows.filter(r => modalidad(r) === g.label).length;
    if (cnt > 0) {
      html += '<div class="em-row">' +
        '<button class="em-part em-dl" onclick="exportExcel('+idx+', false);closeExportMenu()">' +
          '<span class="em-label">' + g.label + '</span><span class="em-count">' + cnt + ' reg.</span>' +
        '</button>' +
        '<button class="em-part em-sh" title="Descargar y compartir" onclick="exportExcel('+idx+', true);closeExportMenu()">📤</button>' +
      '</div>';
    }
  });

  // Otros
  const otherCnt = dataRows.filter(r => modalidad(r) === 'OTROS').length;
  if (otherCnt > 0) {
    html += '<div class="em-row">' +
      '<button class="em-part em-dl" onclick="exportExcel(\'otros\', false);closeExportMenu()">' +
        '<span class="em-label">OTROS</span><span class="em-count">' + otherCnt + ' reg.</span>' +
      '</button>' +
      '<button class="em-part em-sh" title="Descargar y compartir" onclick="exportExcel(\'otros\', true);closeExportMenu()">📤</button>' +
    '</div>';
  }

  menu.innerHTML = html;
  menu.classList.add('open');
}

function closeExportMenu() {
  document.getElementById('export-menu').classList.remove('open');
}
// Cerrar menú al hacer click fuera
document.addEventListener('click', e => {
  const wrap = document.querySelector('.export-wrap');
  if (wrap && !wrap.contains(e.target)) closeExportMenu();
});

/* ── Filtrar datos por grupo ── */
function getExportRows(groupFilter) {
  const dataRows = deduplicarPorTurno(modalFiltered);
  if (groupFilter === 'all') return dataRows;
  if (groupFilter === 'otros') return dataRows.filter(r => modalidad(r) === 'OTROS');
  // groupFilter es un índice numérico
  const group = EQUIPO_GROUPS[groupFilter];
  if (!group) return dataRows;
  return dataRows.filter(r => modalidad(r) === group.label);
}

function getExportLabel(groupFilter) {
  if (groupFilter === 'all') return '';
  if (groupFilter === 'otros') return '_OTROS';
  const group = EQUIPO_GROUPS[groupFilter];
  return group ? '_' + group.label.replace(/[\s\/]+/g,'_') : '';
}

function getExportSubtitle(groupFilter) {
  if (groupFilter === 'all') return null;
  if (groupFilter === 'otros') return 'OTROS EQUIPOS';
  const group = EQUIPO_GROUPS[groupFilter];
  return group ? group.label : null;
}

/* ── Generar y descargar Excel. share=true abre diálogo compartir ── */
async function exportExcel(groupFilter, share) {
  if (!modalFiltered.length) { spcdAlert('No hay datos para exportar', { type:'alert', title:'Sin datos' }); return; }
  try {
    await SpcdExcel.ready();

    const isPend = (modalTipo === 'pendientes');
    const allCols   = ['Turno Fecha','Turno N°','Paciente','Documento','Prestación','Equipo','Informe','Días Pendiente'];
    const allShortH = ['Fecha','Turno N°','Paciente','DNI','Prestación','Equipo','Informe','Días'];
    const allColW   = [11,12,24,12,30,16,10,8];

    const excludeCols = isPend ? new Set([]) : new Set(['Equipo']);
    const indices = [];
    allCols.forEach((c,i) => { if (!excludeCols.has(c)) indices.push(i); });
    const cols   = indices.map(i => allCols[i]);
    const shortH = indices.map(i => allShortH[i]);
    const colW   = indices.map(i => allColW[i]);

    const dataRows = isPend ? getExportRows(groupFilter) : deduplicarPorTurno(modalFiltered);
    const subtitleSuf = isPend ? getExportSubtitle(groupFilter) : null;
    if (!dataRows.length) { spcdAlert('No hay datos en este grupo', { type:'alert', title:'Sin datos' }); return; }

    /* KPIs */
    const hoy = fechaCorteActual;
    const conI = dataRows.filter(r => tieneInformeIF(r)).length;
    const sinI = dataRows.length - conI;
    const pendientes = isPend ? dataRows : dataRows.filter(r => !tieneInformeIF(r));
    const dias = pendientes.map(r => {
      const d = edadEnDias(r, hoy);
      return d === null ? 0 : Math.floor(d);
    });
    const maxDias = dias.reduce((a, b) => (a > b ? a : b), 0);
    const equipos = new Set(dataRows.map(r => r['Equipo']||'—'));
    // Tono del KPI según la peor banda de semaforo() entre los pendientes (FR5.2).
    const TONO_BANDA = { rojo: 'rose', amarillo: 'amber' };
    const tonoMax = TONO_BANDA[peorBanda(pendientes, hoy)] || 'emerald';

    const kpis = [
      { label:'Registros',        value: dataRows.length.toLocaleString('es-AR'), tone:'cyan' },
      { label:'Con informe',      value: conI,                                    tone:'emerald' },
      { label:'Sin informe',      value: sinI, tone: sinI>0 ? 'rose' : 'cyan' },
      isPend
        ? { label:'Máx. días pend.', value: maxDias, tone: tonoMax }
        : { label:'Equipos',         value: equipos.size, tone:'silver' }
    ];

    const subtitle = `INFORME MÉDICO · ${modalTitle.toUpperCase()}` + (subtitleSuf ? ` · ${subtitleSuf.toUpperCase()}` : '');
    const { wb, ws } = SpcdExcel.createBook({ subtitle, sheetName:'Detalle' });

    const h = SpcdExcel.buildHeader(ws, {
      subtitle, totalCols: cols.length,
      meta:{
        modulo:'MEDICO',
        sede: SpcdExcel.getCurrentSede(),
        usuario: SpcdExcel.getCurrentUser(),
        registros: dataRows.length,
        extra: subtitleSuf ? `GRUPO: ${subtitleSuf.toUpperCase()}` : null
      }
    });
    const k = SpcdExcel.buildKPIs(ws, kpis, { startRow:h.nextRow, totalCols:cols.length });
    const s = SpcdExcel.buildSection(ws, { startRow:k.nextRow, totalCols:cols.length, title:`DETALLE · ${modalTitle.toUpperCase()}` });

    const t = SpcdExcel.buildTable(ws, {
      columns: shortH, widths: colW,
      rows: dataRows.map(r => {
        const tieneInf = tieneInformeIF(r);
        const edadD = !tieneInf ? edadEnDias(r, hoy) : null;
        const d = edadD === null ? null : Math.floor(edadD);
        const valMap = {
          'Turno Fecha': r['Turno Fecha']||'',
          'Turno N°':    r['Turno N°']||'',
          'Paciente':    r['Paciente']||'',
          'Documento':   r['Documento']||'',
          'Prestación':  r['Prestación']||r['Prestacion']||'',
          'Equipo':      r['Equipo']||'—',
          'Informe':     tieneInf ? 'I/F' : (r['Informe']||'Sin I/F'),
          'Días Pendiente': d !== null ? d : ''
        };
        return cols.map(c => valMap[c]);
      }),
      startRow: s.nextRow, totalCols: cols.length,
      formatter: (cell, v, rd, idx, ci) => {
        const c = cols[ci];
        const r = dataRows[idx];
        const tieneInf = tieneInformeIF(r);
        if (c === 'Informe' && !tieneInf) SpcdExcel.Fmt.error(cell);
        if (c === 'Días Pendiente' && isPend && typeof v === 'number') {
          SpcdExcel.Fmt.center(cell);
          // Color por la banda de semaforo() (FR5.2), no por días fijos.
          const banda = bandaPendiente(r, hoy);
          if (banda === 'rojo')          SpcdExcel.Fmt.error(cell);
          else if (banda === 'amarillo') SpcdExcel.Fmt.warn(cell);
          else if (banda === 'verde')    SpcdExcel.Fmt.success(cell);
        }
        if (c === 'Turno N°' || c === 'Documento') SpcdExcel.Fmt.center(cell);
      }
    });
    const tot = SpcdExcel.buildTotals(ws, {
      startRow:t.nextRow, totalCols:cols.length,
      items:[
        { label:'Registros', value: dataRows.length },
        { label:'Con informe', value: conI },
        sinI>0 ? { label:'Sin informe', value: sinI } : null,
        isPend && maxDias>0 ? { label:'Máx. días', value: maxDias } : null
      ].filter(Boolean)
    });
    SpcdExcel.buildFooter(ws, { startRow:tot.nextRow, totalCols:cols.length, hash:h.hash });

    const suffix = isPend ? getExportLabel(groupFilter) : '';
    const fileName = `SPCD_Medico_${modalTitle.replace(/\s+/g,'_')}${suffix}_${SpcdExcel.nowIsoDate()}.xlsx`;
    await SpcdExcel.exportAndShare(wb, fileName, share ? {
      titulo: modalTitle + (suffix ? ' · ' + suffix.replace(/^_/,'').replace(/_/g,' ') : ''),
      periodo: SpcdExcel.dateAr(),
      cantidad: dataRows.length,
      modulo:'medico', tipoExport: modalTipo
    } : null);
  } catch(err) {
    console.error('Export error:', err);
    if (typeof spcdAlert === 'function') {
      spcdAlert('Error al exportar: ' + err.message, { type:'error', title:'Error al exportar' });
    } else {
      alert('Error al exportar: ' + err.message);
    }
  }
}

