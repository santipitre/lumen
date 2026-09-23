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
  const zone = document.getElementById('upload-zone');
  zone.classList.add('has-data');
  const uploadDate = localStorage.getItem('spcd_upload_date') || '';
  document.getElementById('upload-sub-text').textContent =
    `✅  ${data.length.toLocaleString()} registros cargados`;
  document.getElementById('data-status').textContent = uploadDate ? `Última actualización: ${uploadDate}` : '';

  // Solo estudios realizados (D4: unidad = estudio, no renglón)
  realizados = deduplicarPorTurno(data.filter(esEstudio));

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

  const medicos = [...new Set(rea.map(r => r['Médico Informante']).filter(m => medicoValido(m)))].sort();
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

  // Tiempo promedio: Fecha Informe - Turno Fecha (en días)
  const tiempos = conInforme.map(r => {
    const fEstudio = parseDate(r['Turno Fecha']);
    const fInforme = parseDate(r['Fecha Informe']);
    if (!fEstudio || !fInforme) return null;
    const dias = (fInforme - fEstudio) / 86400000;
    return (dias >= 0 && dias < 60) ? dias : null;
  }).filter(t => t !== null);

  const avgDias = tiempos.length
    ? (tiempos.reduce((a,b)=>a+b,0)/tiempos.length).toFixed(1)
    : '—';
  document.getElementById('kpi-tiempo').textContent = avgDias;

  // D10/FR1.7: el centinela -1 (Fecha Informe -> Date año<1900) cuenta en
  // "con informe" pero queda afuera del cálculo de demora. Antes se perdía
  // en silencio dentro del guard dias>=0; ahora se cuenta aparte y se
  // muestra explícito junto al KPI de demora (D3 de CONTEXT-2.md).
  const informadosSinFecha = conInforme.filter(r => esCentinela(parseDate(r['Fecha Informe']))).length;
  document.getElementById('kpi-tiempo-sub').textContent =
    `sobre ${tiempos.length.toLocaleString()} informes con fecha registrada` +
    (informadosSinFecha > 0 ? ` · ${informadosSinFecha.toLocaleString()} informados sin fecha` : '');

  const linkInconsistentes = document.getElementById('kpi-inconsistentes-link');
  if (linkInconsistentes) {
    const totalInconsistentes = getInconsistentes(data).length;
    linkInconsistentes.style.display = totalInconsistentes > 0 ? 'block' : 'none';
  }

  const medActivos = new Set(conInforme.map(r => r['Médico Informante']).filter(m => medicoValido(m)));
  document.getElementById('kpi-medicos').textContent = medActivos.size;
  document.getElementById('kpi-med-sub').textContent =
    `${[...medActivos].slice(0,2).join(', ') || 'en el período'}`;
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
      `${sinInforme.length} estudio${sinInforme.length>1?'s':''} realizado${sinInforme.length>1?'s':''} sin informe registrado en el sistema`;
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

function renderRankTiempos(data) {
  const conInforme = data.filter(r => tieneInformeIF(r) && medicoValido(r['Médico Informante']));
  const byMed = groupBy(conInforme, r => r['Médico Informante']);
  const tiemposMap = {};
  Object.entries(byMed).forEach(([med, rows]) => {
    const ts = rows.map(r => {
      const fe = parseDate(r['Turno Fecha']);
      const fi = parseDate(r['Fecha Informe']);
      if (!fe || !fi) return null;
      const d = (fi - fe) / 86400000;
      return (d >= 0 && d < 60) ? d : null;
    }).filter(t => t !== null);
    if (ts.length) tiemposMap[med] = ts.reduce((a,b)=>a+b,0)/ts.length;
  });

  const sorted = Object.entries(tiemposMap).sort((a,b)=>a[1]-b[1]).slice(0,8);
  const maxVal = sorted[sorted.length-1]?.[1] || 1;
  const container = document.getElementById('rank-tiempos');
  if (!sorted.length) { container.innerHTML = emptyState('⏱','Sin datos'); return; }
  container.innerHTML = sorted.map(([med, avg], i) => {
    const color = avg < 1 ? 'var(--green)' : avg < 3 ? 'var(--amber)' : 'var(--red)';
    return `<div class="rank-item">
      <div class="rank-num">${i+1}</div>
      <div class="rank-label"><span title="${escAttr(med)}">${esc(med)}</span></div>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${(avg/maxVal*100).toFixed(0)}%;background:${color}60"></div></div>
      <div class="rank-val" style="color:${color}">${avg.toFixed(1)}d</div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════
   TAB PENDIENTES
═══════════════════════════════════ */
function renderTabPendientes(data) {
  const sinInforme = data
    .filter(r => !tieneInformeIF(r))
    .sort((a,b) => {
      const da = parseDate(a['Turno Fecha']);
      const db = parseDate(b['Turno Fecha']);
      return (da||0) - (db||0);
    });

  document.getElementById('count-pend').textContent =
    `${sinInforme.length.toLocaleString()} registros`;

  const hoy = fechaCorteActual;
  const tbody = document.getElementById('tbody-pendientes');
  if (!sinInforme.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="e-icon">✅</div><div class="e-text">¡Sin informes pendientes!</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = sinInforme.slice(0,300).map(r => {
    const fEstudio = parseDate(r['Turno Fecha']);
    const diasStr  = fEstudio ? ((hoy - fEstudio)/86400000).toFixed(0) : '—';
    const dias     = fEstudio ? Math.floor((hoy - fEstudio)/86400000)  : null;
    let urgCls = 'urgencia-na', urgLabel = '—';
    if (dias !== null) {
      if (dias > 7)      { urgCls = 'urgencia-alta';   urgLabel = '⚠ Crítico';  }
      else if (dias > 3) { urgCls = 'urgencia-media';  urgLabel = '● Medio';    }
      else               { urgCls = 'urgencia-normal'; urgLabel = '● Normal';   }
    }
    return `<tr>
      <td>${fEstudio ? fEstudio.toLocaleDateString('es-AR') : '—'}</td>
      <td style="color:var(--muted)">${esc(r['Turno N°']||'—')}</td>
      <td>${esc((r['Paciente']||'').slice(0,24))}</td>
      <td title="${escAttr(r['Prestación']||'')}">${esc((r['Prestación']||'').slice(0,32))}…</td>
      <td>${esc(r['Médico']||'—')}</td>
      <td>${r['Informante Sugerido'] ? esc(r['Informante Sugerido']) : '<span style="color:var(--muted)">No asignado</span>'}</td>
      <td style="text-align:center;font-family:'Rajdhani',sans-serif;font-size:15px;font-weight:700">${diasStr}</td>
      <td class="${urgCls}">${urgLabel}</td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════
   TAB MÉDICOS
═══════════════════════════════════ */
function renderTabMedicos(data) {
  const conInforme = data.filter(r => tieneInformeIF(r) && medicoValido(r['Médico Informante']));
  const byMed = groupBy(conInforme, r => r['Médico Informante']);
  const sorted = Object.entries(byMed).sort((a,b)=>b[1].length-a[1].length);
  const maxInf = sorted[0]?.[1].length || 1;
  const grid = document.getElementById('medicos-grid');

  if (!sorted.length) {
    grid.innerHTML = emptyState('👨‍⚕️','Sin médicos informantes registrados');
    return;
  }

  grid.innerHTML = sorted.map(([med, rows]) => {
    const ts = rows.map(r => {
      const fe = parseDate(r['Turno Fecha']);
      const fi = parseDate(r['Fecha Informe']);
      if (!fe || !fi) return null;
      const d = (fi-fe)/86400000;
      return (d>=0 && d<60) ? d : null;
    }).filter(t=>t!==null);
    const avgTiempo = ts.length ? (ts.reduce((a,b)=>a+b,0)/ts.length).toFixed(1) : '—';
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
          <span>Tiempo promedio</span>
          <span class="medico-stat-val">${avgTiempo} días</span>
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
   GRUPOS DE EQUIPOS
═══════════════════════════════════ */
const EQUIPO_GROUPS = [
  { label: 'RAYOS X / ECOGRAFÍA RESIDENTE',
    equipos: ['RX-H.ITALIANO-GBA','RX-H.ITALIANO-MERATE','ECOG-DOPP H.ITALIANO RESIDENTE'] },
  { label: 'ECOGRAFÍA / DOPPLER',
    equipos: ['ECOG-DOPP H.ITALIANO SHERRERA','ECOG-DOPP H.ITALIAN CHAVEZ MA','ECOG-DOPP H.ITALIANO CCUESTA',
              'ECOG-DOPP H.ITALIANO AAGUADO','ECOG-DOPP H.ITALIAN CHAVEZ ME','ECOG-DOPP H.ITALIANO MSZWALBER',
              'ECOG-H.ITALIANO DIMARCO'] },
  { label: 'TOMOGRAFÍA',
    equipos: ['TCMC PHIL.-BRILLANCE 64 HITALI'] },
  { label: 'RESONANCIA MAGNÉTICA',
    equipos: ['RMN -H ITALIA-GE SIGNA HORIZON','RMN-H ITALIA-SIEMENS FLOW'] },
  { label: 'CÁMARA GAMMA',
    equipos: ['CGAM- H.ITALIANO GENERALES','CGAM- H.ITALIANO CARDIOLOGICOS'] }
];
const EQUIPO_SET = new Set();
EQUIPO_GROUPS.forEach(g => g.equipos.forEach(e => EQUIPO_SET.add(e.toUpperCase())));

/* FR1.5: función pura -- reemplaza el matcheo por Equipo/EQUIPO_GROUPS que
   antes estaba duplicado dentro de handleExportClick y getExportRows. */
function modalidad(r) {
  const eq = (r['Equipo']||'').trim().toUpperCase();
  const grupo = EQUIPO_GROUPS.find(g => g.equipos.some(e => e.toUpperCase() === eq));
  return grupo ? grupo.label : 'OTROS';
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
    case 'pendientes':     modalRows = filtered.filter(r => !tieneInformeIF(r)); break;
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
      (r['Médico Informante']||'').toLowerCase().includes(q)
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
    const dias = !tieneInf && fecha ? Math.floor((fechaCorteActual - fecha)/(1000*60*60*24)) : '—';
    return '<tr>' +
      '<td>'+fechaStr+'</td>' +
      '<td style="color:var(--muted)">'+esc(r['Turno N°']||'—')+'</td>' +
      '<td style="font-weight:600">'+esc(r['Paciente']||'—')+'</td>' +
      '<td style="color:var(--muted)">'+esc(r['Documento']||'—')+'</td>' +
      '<td>'+esc(r['Prestación']||'—')+'</td>' +
      '<td style="color:'+(tieneInf?'var(--green)':'var(--red)')+'">'+(tieneInf?'I/F':esc(infVal||'Sin I/F'))+'</td>' +
      '<td style="color:'+(typeof dias==='number'&&dias>7?'var(--red)':typeof dias==='number'&&dias>3?'var(--amber)':'var(--muted)')+'">'+dias+'</td>' +
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

  // Agrupar por médico informante
  const byMed = {};
  conInforme.forEach(r => {
    const med = (r['Médico Informante']||'').trim();
    if (!medicoValido(med)) return;
    if (!byMed[med]) byMed[med] = [];
    byMed[med].push(r);
  });

  // Calcular tiempos promedio por médico
  const medData = Object.entries(byMed).map(([med, rows]) => {
    const tiempos = rows.map(r => {
      const fe = parseDate(r['Turno Fecha']);
      const fi = parseDate(r['Fecha Informe']);
      if (!fe || !fi) return null;
      const d = (fi - fe) / 86400000;
      return (d >= 0 && d < 120) ? d : null;
    }).filter(t => t !== null);

    const avgDias = tiempos.length ? tiempos.reduce((a,b) => a+b, 0) / tiempos.length : null;
    return { medico: med, count: rows.length, avgDias, tiemposCount: tiempos.length };
  }).sort((a,b) => b.count - a.count);

  const maxCount = medData[0]?.count || 1;

  // Tiempo promedio general
  const allTiempos = conInforme.map(r => {
    const fe = parseDate(r['Turno Fecha']);
    const fi = parseDate(r['Fecha Informe']);
    if (!fe || !fi) return null;
    const d = (fi - fe) / 86400000;
    return (d >= 0 && d < 120) ? d : null;
  }).filter(t => t !== null);
  const avgGeneral = allTiempos.length ? (allTiempos.reduce((a,b) => a+b, 0) / allTiempos.length).toFixed(1) : '—';

  // Summary cards
  document.getElementById('real-total').textContent = conInforme.length.toLocaleString();
  document.getElementById('real-medicos').textContent = medData.length;
  document.getElementById('real-tiempo').textContent = avgGeneral !== '—' ? avgGeneral + ' días' : '—';

  // Tabla
  const tbody = document.getElementById('real-tbody');
  tbody.innerHTML = medData.map((m, i) => {
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

    const medData = Object.entries(byMed).map(([med, rows]) => {
      const tiempos = rows.map(r => {
        const fe = parseDate(r['Turno Fecha']);
        const fi = parseDate(r['Fecha Informe']);
        if (!fe || !fi) return null;
        const d = (fi - fe) / 86400000;
        return (d >= 0 && d < 120) ? d : null;
      }).filter(t => t !== null);
      const avgDias = tiempos.length ? (tiempos.reduce((a,b) => a+b, 0) / tiempos.length).toFixed(1) : '—';
      return { medico: med, count: rows.length, avgDias };
    }).sort((a,b) => b.count - a.count);

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

function openTiempoPage() {
  if (!filtered.length) return;

  const conInforme = filtered.filter(r => tieneInformeIF(r));

  // Agrupar por médico informante y calcular tiempos
  const byMed = {};
  conInforme.forEach(r => {
    const med = (r['Médico Informante']||'').trim();
    if (!medicoValido(med)) return;
    if (!byMed[med]) byMed[med] = [];
    byMed[med].push(r);
  });

  const medData = Object.entries(byMed).map(([med, rows]) => {
    const tiempos = rows.map(r => {
      const fe = parseDate(r['Turno Fecha']);
      const fi = parseDate(r['Fecha Informe']);
      if (!fe || !fi) return null;
      const d = (fi - fe) / 86400000;
      return (d >= 0 && d < 120) ? d : null;
    }).filter(t => t !== null);

    const avgDias = tiempos.length ? tiempos.reduce((a,b) => a+b, 0) / tiempos.length : null;
    return { medico: med, count: rows.length, avgDias, tiemposCount: tiempos.length };
  }).filter(m => m.avgDias !== null).sort((a,b) => b.avgDias - a.avgDias);

  tiempoData = medData;

  // Tiempo promedio general
  const allTiempos = conInforme.map(r => {
    const fe = parseDate(r['Turno Fecha']);
    const fi = parseDate(r['Fecha Informe']);
    if (!fe || !fi) return null;
    const d = (fi - fe) / 86400000;
    return (d >= 0 && d < 120) ? d : null;
  }).filter(t => t !== null);
  const avgGeneral = allTiempos.length ? (allTiempos.reduce((a,b) => a+b, 0) / allTiempos.length).toFixed(1) : '—';

  // Summary cards
  document.getElementById('tiempo-avg').textContent = avgGeneral !== '—' ? avgGeneral + ' días' : '—';
  document.getElementById('tiempo-medicos').textContent = medData.length;
  document.getElementById('tiempo-total').textContent = allTiempos.length.toLocaleString();

  // Max avgDias for bar proportion
  const maxAvg = medData.length ? Math.max(...medData.map(m => m.avgDias)) : 1;

  // Tabla
  const tbody = document.getElementById('tiempo-tbody');
  tbody.innerHTML = medData.map((m, i) => {
    const tiempoStr = m.avgDias.toFixed(1);
    const tiempoColor = m.avgDias < 1 ? 'var(--green)'
      : m.avgDias < 3 ? 'var(--cyan)'
      : m.avgDias < 7 ? 'var(--amber)'
      : 'var(--red)';
    const pct = ((m.avgDias / maxAvg) * 100).toFixed(0);
    const barColor = m.avgDias < 1 ? 'var(--green)'
      : m.avgDias < 3 ? 'var(--cyan)'
      : m.avgDias < 7 ? 'var(--amber)'
      : 'var(--red)';

    return `<tr>
      <td class="rank-col">${i + 1}</td>
      <td class="name-col">${esc(m.medico)}</td>
      <td class="time-col" style="color:${tiempoColor}">${tiempoStr}d</td>
      <td class="num-col">${m.count}</td>
      <td class="bar-col">
        <div class="real-bar-wrap">
          <div class="real-bar" style="width:${pct}%;background:${barColor}"></div>
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
  if (!tiempoData.length) return;
  try {
    await SpcdExcel.ready();

    const cols   = ['#','Médico Informante','Tiempo Prom. (días)','Informes'];
    const widths = [6, 32, 22, 14];
    const avgGen = document.getElementById('tiempo-avg').textContent;

    /* KPIs */
    const totMeds = tiempoData.length;
    const totInfs = tiempoData.reduce((s,m) => s + m.count, 0);
    const fueraSLA = tiempoData.filter(m => m.avgDias >= 7).length;
    const enRiesgo = tiempoData.filter(m => m.avgDias >= 3 && m.avgDias < 7).length;

    const subtitle = 'TIEMPO PROMEDIO DE INFORME';
    const { wb, ws } = SpcdExcel.createBook({ subtitle, sheetName:'Tiempo' });

    const h = SpcdExcel.buildHeader(ws, {
      subtitle, totalCols: cols.length,
      meta:{ modulo:'MEDICO', sede:SpcdExcel.getCurrentSede(), usuario:SpcdExcel.getCurrentUser(), registros: totMeds, extra:`PROM. GLOBAL: ${avgGen}` }
    });
    const k = SpcdExcel.buildKPIs(ws, [
      { label:'Médicos',     value: totMeds,                       tone:'cyan' },
      { label:'Informes',    value: totInfs.toLocaleString('es-AR'), tone:'silver' },
      { label:'Promedio',    value: avgGen,                        tone:'emerald' },
      { label:'Fuera de SLA',value: fueraSLA, tone: fueraSLA>0 ? 'rose' : 'cyan', hint:'≥ 7 días' }
    ], { startRow:h.nextRow, totalCols:cols.length });
    const s = SpcdExcel.buildSection(ws, { startRow:k.nextRow, totalCols:cols.length, title:'PERFORMANCE INDIVIDUAL · DÍAS PROMEDIO' });
    const t = SpcdExcel.buildTable(ws, {
      columns: cols, widths,
      rows: tiempoData.map((m,i) => [i+1, m.medico, parseFloat(m.avgDias.toFixed(1)), m.count]),
      startRow: s.nextRow, totalCols: cols.length,
      formatter: (cell, v, rd, idx, ci, cName) => {
        if (cName==='#' || cName==='Tiempo Prom. (días)' || cName==='Informes') SpcdExcel.Fmt.center(cell);
        if (cName==='Tiempo Prom. (días)' && typeof v === 'number') {
          cell.numFmt = '0.0 "días"';
          if (v >= 7)      SpcdExcel.Fmt.error(cell);
          else if (v >= 3) SpcdExcel.Fmt.warn(cell);
          else             SpcdExcel.Fmt.success(cell);
        }
        if (cName==='Informes') SpcdExcel.Fmt.accent(cell);
      }
    });
    const tot = SpcdExcel.buildTotals(ws, {
      startRow:t.nextRow, totalCols:cols.length,
      items:[
        { label:'Médicos', value: totMeds },
        { label:'Informes', value: totInfs },
        { label:'Promedio global', value: avgGen },
        fueraSLA>0 ? { label:'Fuera SLA', value: fueraSLA } : null
      ].filter(Boolean)
    });
    SpcdExcel.buildFooter(ws, { startRow:tot.nextRow, totalCols:cols.length, hash:h.hash });

    const fileName = `SPCD_Medico_Tiempo_Promedio_${SpcdExcel.nowIsoDate()}.xlsx`;
    await SpcdExcel.exportAndShare(wb, fileName, share ? {
      titulo:'Tiempo Promedio de Informe',
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
      const f = parseDate(r['Turno Fecha']);
      return f ? Math.floor((hoy - f)/(86400000)) : 0;
    });
    const maxDias = dias.length ? Math.max(...dias) : 0;
    const equipos = new Set(dataRows.map(r => r['Equipo']||'—'));

    const kpis = [
      { label:'Registros',        value: dataRows.length.toLocaleString('es-AR'), tone:'cyan' },
      { label:'Con informe',      value: conI,                                    tone:'emerald' },
      { label:'Sin informe',      value: sinI, tone: sinI>0 ? 'rose' : 'cyan' },
      isPend
        ? { label:'Máx. días pend.', value: maxDias, tone: maxDias>=7 ? 'rose' : maxDias>=4 ? 'amber' : 'emerald' }
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
        const f = parseDate(r['Turno Fecha']);
        const tieneInf = tieneInformeIF(r);
        const d = !tieneInf && f ? Math.floor((hoy - f)/86400000) : null;
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
          if (v >= 7)      SpcdExcel.Fmt.error(cell);
          else if (v >= 4) SpcdExcel.Fmt.warn(cell);
          else             SpcdExcel.Fmt.success(cell);
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

