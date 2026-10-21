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
const KPI_MEDICOS_CANDADO = '<span class="kpi-candado">🔒 Requiere permiso de edición</span>';
const avisoRankingHTML = () => `<div class="aviso-ranking">${esc(AVISO_RANKING)}</div>`;
const filaAvisoRanking = columnas => `<tr><td colspan="${columnas}">${avisoRankingHTML()}</td></tr>`;

/* Sin permiso: el filtro global Médico no aparece y los exports por médico
   quedan deshabilitados. */
function aplicarPermisosRanking() {
  if (puedeVerRankingMedicos()) return;
  // C10/N-A1: sin permiso no hay pestaña Médicos: ni botón, ni panel, ni aviso.
  const bm = document.getElementById('tab-btn-medicos'); if (bm) bm.style.display = 'none';
  const pm = document.getElementById('tab-medicos'); if (pm) pm.style.display = 'none';
  const fm = document.getElementById('f-medico');
  if (fm) { const g = fm.closest('.filter-group'); if (g) g.style.display = 'none'; }
  // M4 (REVIEW-3.1): sin permiso la tarjeta "Demora por médico" no tiene contenido; se oculta entera.
  const rt = document.getElementById('rank-tiempos');
  if (rt) { const c = rt.closest('.chart-card'); if (c) c.style.display = 'none'; }
  // N-A1 (boceto aprobado 2026-10-12): sin permiso Pendientes no tiene columna Informante Sugerido y la tarjeta
  // "Médicos Informantes" queda con candado, sin cifra y sin "ver detalle" (no se oculta: se reemplaza el valor).
  const thIs = document.getElementById('th-informante-sugerido'); if (thIs) thIs.remove();
  const kpiMed = document.getElementById('kpi-medicos');
  if (kpiMed) {
    const card = kpiMed.closest('.kpi-card');
    if (card) {
      card.removeAttribute('onclick'); card.style.cursor = 'default';
      const hint = card.querySelector('.kpi-hint'); if (hint) hint.style.display = 'none';
    }
    kpiMed.innerHTML = KPI_MEDICOS_CANDADO;
  }
  // C5 (fase 5): el export de Tiempo ya no tiene nombres; sólo el de Realizados queda bajo permiso.
  document.querySelectorAll('button[onclick^="exportRealizadosExcel"]')
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
// C15 (fase 5): universo de Semáforo y Pendientes (sólo modalidad, tipo de turno y prestación; ver filtrarBacklog).
let filtradoBacklog = [];
let fechaCorteActual = null;
// C15: el rango que pone populateFilters; las fechas cuentan como filtro activo sólo si difieren de él.
let rangoFechasCompleto = { desde: '', hasta: '' };
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
   N-A1 (fase 6, D2): las dos columnas con nombres de médico (COLUMNAS_CON_PERMISO) sólo las
   exige y las guarda quien tiene `edit`. Sin permiso se recortan antes de asignar rawData y
   de guardar spcd_data_medico, y su ausencia en la fuente no dispara el aviso (cambio de SC4
   de la fase 2, OK de Santiago 2026-10-12). NO es garantía real: spcd_data_full (que escriben
   app.html, jefe.html y admin.html) sigue trayendo la columna.
═══════════════════════════════════ */
const COLUMNAS_MEDICAS_REQUERIDAS = ['Estado','Turno Fecha','Turno N°','Paciente','Documento',
  'Prestación','Médico','Informe','Fecha Informe','Equipo'];
const COLUMNAS_CON_PERMISO = ['Médico Informante','Informante Sugerido'];

function columnasFaltantes(data) {
  const presentes = new Set();
  data.forEach(r => Object.keys(r).forEach(k => presentes.add(k)));
  const requeridas = puedeVerRankingMedicos()
    ? COLUMNAS_MEDICAS_REQUERIDAS.concat(COLUMNAS_CON_PERMISO) : COLUMNAS_MEDICAS_REQUERIDAS;
  return requeridas.filter(c => !presentes.has(c));
}

/* N-A1: sin permiso devuelve copias de las filas sin las claves de COLUMNAS_CON_PERMISO (no toca
   spcd_data_full ni las filas de origen); con permiso devuelve las mismas filas. */
function recortarSinPermiso(rows) {
  if (puedeVerRankingMedicos()) return rows;
  return rows.map(r => {
    const c = Object.assign({}, r);
    COLUMNAS_CON_PERMISO.forEach(k => { delete c[k]; });
    return c;
  });
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
   UMBRALES DE SLA DESDE LA BASE (fase 7b, D7 = A)
   Lee TODAS las filas de medico_sla (modalidad × tipo de turno); SLA_VIGENTE las pone sobre SLA_DEFAULT
   (medico-metricas.js). sbQuery usa el token de la sesión de Auth si la hay y, si no (quien entra sólo con PIN), la anon
   key pública: desde el 2026-10-20 la policy medico_sla_sel_anon deja leer la tabla a `anon`. Sin spcd-supabase.js,
   con error, con tope de tiempo, sin filas o con filas inválidas, rige SLA_DEFAULT y la página sigue igual.
   Nunca rechaza: devuelve 'tabla' o 'codigo'.
═══════════════════════════════════ */
const SLA_COLUMNAS = 'modalidad,turno,verde_h,amarillo_h,mismo_dia,amarillo_dias_sin_hora';
const SLA_LECTURA_TOPE_MS = 3000;
function cargarSlaVigente() {
  let timer = null;
  const tope = new Promise(res => { timer = setTimeout(() => res(null), SLA_LECTURA_TOPE_MS); });
  const lectura = (async () => {
    if (typeof sbQuery !== 'function') return null;
    return sbQuery('medico_sla', 'select=' + SLA_COLUMNAS + '&order=modalidad.asc,turno.asc');
  })().catch(err => { console.warn('medico_sla: no se pudo leer, rigen los plazos del código:', err && err.message); return null; });
  return Promise.race([lectura, tope]).then(filas => {
    clearTimeout(timer);
    return aplicarSlaTabla(filas) ? 'tabla' : 'codigo';
  }, () => { clearTimeout(timer); return 'codigo'; });
}

/* ═══════════════════════════════════
   INIT
═══════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  aplicarPortada();
  aplicarPermisosRanking();
  const slaListo = cargarSlaVigente();
  const sede = localStorage.getItem('spcd_sede') || '';
  document.getElementById('bc-sede').textContent  = sede || 'Sede';
  document.getElementById('top-sede').textContent = sede || '—';

  const uploadDate = localStorage.getItem('spcd_upload_date') || '';
  function mostrarErrorCarga(msg) {
    document.getElementById('upload-sub-text').textContent = msg;
    if (uploadDate) document.getElementById('data-status').textContent = `Última actualización: ${uploadDate}`;
  }
  function tryLoad(retries) {
    // 7b: el render espera (con tope) a que los umbrales estén resueltos, para no pintar con SLA_DEFAULT y repintar.
    Promise.all([dbLoad('spcd_data_full'), slaListo]).then(([data, fuenteSla]) => {
      if (fuenteSla === 'tabla') aplicarPortada();   // el aviso de umbrales se armó al abrir la página con SLA_DEFAULT
      if (data && data.length > 0) {
        if (columnasFaltantes(data).length === 0) {
          // N-A1: sin permiso rawData y la copia propia se guardan sin los nombres (la copia vieja con nombres se pisa acá).
          rawData = recortarSinPermiso(data);
          // 7b (REVIEW-5.1 M3): conNombres registra con qué permiso se guardó la copia (true sólo si trae los nombres).
          dbSave('spcd_data_medico', { meta: { copiadoEn: new Date().toISOString(), conNombres: puedeVerRankingMedicos() }, rows: rawData })
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
            // 7b (REVIEW-5.1 M3): con `edit`, una copia guardada recortada (conNombres === false) no sirve: se descarta y se
            // actúa como sin copia (aviso de columnas). Sin la marca (copias anteriores a 7b) se conserva el comportamiento de siempre.
            if (datosViejos && datosViejos.rows && puedeVerRankingMedicos() && datosViejos.meta && datosViejos.meta.conNombres === false) {
              datosViejos = null;
            }
            if (datosViejos && datosViejos.rows) {
              // N-A1: una copia vieja con nombres (de antes del recorte) no se usa tal cual sin permiso: se recorta y se vuelve a guardar.
              const copiaConNombres = !puedeVerRankingMedicos()
                && datosViejos.rows.some(r => COLUMNAS_CON_PERMISO.some(k => k in r));
              rawData = recortarSinPermiso(datosViejos.rows);
              if (copiaConNombres) {
                dbSave('spcd_data_medico', { meta: Object.assign({}, datosViejos.meta, { conNombres: false }), rows: rawData })
                  .catch(err => console.error('Error guardando spcd_data_medico recortada:', err));
              }
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
  aplicarColumnaTipoTurno(data);
  limpiarFiltrosDeCarga();
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
  rangoFechasCompleto = { desde: document.getElementById('f-desde').value, hasta: document.getElementById('f-hasta').value };

  // C15 (FR5.6): modalidad global, con los mismos labels que modalidad().
  document.getElementById('f-modalidad').innerHTML = opcionesModalidadHTML(LABELS_MODALIDAD(), true);

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
/* REVIEW-4.1 (Important): los filtros cuentan recién al aplicarlos. applyFilters, resetFilters y la carga guardan
   esta foto; la línea "Filtros: …" y el backlog leen de acá, no de los selects (que pueden tener cambios sin aplicar). */
let filtrosAplicados = { desde: '', hasta: '', medico: '', mod: '', tipo: '', informe: '', informeTexto: '', prest: '' };
function leerFiltrosDelDOM() {
  const v = id => document.getElementById(id).value;
  const inf = document.getElementById('f-informe');
  return { desde: v('f-desde'), hasta: v('f-hasta'), medico: v('f-medico'), mod: v('f-modalidad'),
           tipo: v('f-tipo-turno'), informe: inf.value,
           informeTexto: inf.value ? inf.options[inf.selectedIndex].textContent : '', prest: v('f-prest') };
}

function applyFilters() {
  filtrosAplicados = leerFiltrosDelDOM();
  const { desde, hasta, medico, mod, tipo, informe, prest } = filtrosAplicados;

  filtered = realizados.filter(r => {
    const fd = parseDate(r['Turno Fecha']);
    if (!fd) return false;
    const ds = toDateStr(fd);
    if (desde && ds < desde) return false;
    if (hasta && ds > hasta) return false;
    if (medico && r['Médico Informante'] !== medico) return false;
    if (mod    && modalidad(r) !== mod) return false;
    if (tipo   && tipoTurno(r) !== tipo) return false;
    if (prest  && r['Prestación'] !== prest) return false;
    if (informe === 'CON' && !tieneInformeIF(r)) return false;
    if (informe === 'SIN' && tieneInformeIF(r))  return false;
    return true;
  });
  render(filtered);
}

/* C15/C25 (fase 5): Semáforo y Pendientes miden el backlog de hoy contra fechaCorte. Sólo los filtran modalidad,
   tipo de turno y prestación (los mismos filtros aplicados que applyFilters); fechas, médico y estado de informe no. */
function filtrarBacklog(data) {
  const { mod, tipo, prest } = filtrosAplicados;
  return data.filter(r => {
    if (mod && modalidad(r) !== mod) return false;
    if (tipo && tipoTurno(r) !== tipo) return false;
    if (prest && r['Prestación'] !== prest) return false;
    return true;
  });
}

/* REVIEW-4.1: la carga arranca sin filtros aunque el navegador haya restaurado algún select al recargar
   (tipo de turno, estado de informe, modalidad y el de Pendientes, que queda desbloqueado), y guarda la foto. */
function limpiarFiltrosDeCarga() {
  ['f-tipo-turno', 'f-informe', 'f-modalidad'].forEach(id => { document.getElementById(id).value = ''; });
  const pm = document.getElementById('f-pend-modalidad');
  pm.innerHTML = opcionesModalidadHTML(LABELS_MODALIDAD(), true);
  pm.value = '';
  pm.disabled = false;
  filtrosAplicados = leerFiltrosDelDOM();
}

function resetFilters() {
  populateFilters(rawData);
  document.getElementById('f-medico').value  = '';
  document.getElementById('f-tipo-turno').value = '';
  document.getElementById('f-informe').value = '';
  document.getElementById('f-prest').value   = '';
  filtrosAplicados = leerFiltrosDelDOM();
  filtered = [...realizados];
  render(filtered);
}

/* C15: modalidades de A10 más OTROS, en el orden de EQUIPO_GROUPS (lo mismo que puede devolver modalidad()). */
const LABELS_MODALIDAD = () => EQUIPO_GROUPS.map(g => g.label).concat('OTROS');
function opcionesModalidadHTML(labels, conTodas) {
  return (conTodas ? '<option value="">Todas</option>' : '')
    + labels.map(l => `<option value="${escAttr(l)}">${esc(l)}</option>`).join('');
}

/* C25: con una modalidad global, el filtro de Pendientes ofrece sólo esa y queda bloqueado; sin global, vuelve a
   ofrecer todas, arranca en Todas y funciona como siempre (conserva la elección mientras no haya global). */
function sincronizarPendModalidad() {
  const global = document.getElementById('f-modalidad').value;
  const sel = document.getElementById('f-pend-modalidad');
  if (global) {
    sel.innerHTML = opcionesModalidadHTML([global], false);
    sel.value = global;
    sel.disabled = true;
  } else if (sel.disabled) {
    sel.innerHTML = opcionesModalidadHTML(LABELS_MODALIDAD(), true);
    sel.value = '';
    sel.disabled = false;
  }
}

/* C15: dataset sin la columna Tipo Turno (p. ej. datos de la nube): sin select y con una nota. No es una columna
   médica requerida (no dispara el aviso D6). */
const NOTA_SIN_TIPO_TURNO = 'Filtro por tipo de turno no disponible con estos datos';
function tieneColumnaTipoTurno(data) {
  return data.some(r => Object.prototype.hasOwnProperty.call(r, 'Tipo Turno'));
}
function aplicarColumnaTipoTurno(data) {
  const hay = tieneColumnaTipoTurno(data);
  const sel = document.getElementById('f-tipo-turno');
  if (!hay) sel.value = '';
  sel.closest('.filter-group').style.display = hay ? '' : 'none';
  const nota = document.getElementById('f-tipo-turno-nota');
  nota.textContent = hay ? '' : NOTA_SIN_TIPO_TURNO;
  nota.style.display = hay ? 'none' : '';
}

/* C15/C25: la línea "Filtros: …" (una sola función; las waves 5 y 6 la usan como primera fila de los exports).
   En Semáforo y Pendientes aclara los filtros activos que esa vista no aplica. */
const ACLARACION_BACKLOG = { uno: 'no aplica en esta vista', varios: 'no aplican en esta vista' };
const VISTAS_BACKLOG = ['tab-semaforo', 'tab-pendientes'];
function textoFiltros(vista) {
  const f = filtrosAplicados;
  const ddmm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '…';
  const partes = [], ignorados = [];
  const fechasActivas = f.desde !== rangoFechasCompleto.desde || f.hasta !== rangoFechasCompleto.hasta;
  if (fechasActivas) { partes.push(ddmm(f.desde) + '–' + ddmm(f.hasta)); ignorados.push('fechas'); }
  const mod = f.mod;
  if (mod) partes.push(mod);
  // Sin la columna Tipo Turno el select queda en Todos y oculto (aplicarColumnaTipoTurno): f.tipo es ''.
  if (f.tipo) partes.push(f.tipo);
  if (f.informe) { partes.push(f.informeTexto); ignorados.push('estado de informe'); }
  if (f.prest) partes.push(f.prest);
  if (f.medico) { partes.push(f.medico); ignorados.push('médico'); }
  let texto = 'Filtros: ' + (partes.length ? partes.join(' · ') : 'sin filtros');
  if (VISTAS_BACKLOG.includes(vista) && ignorados.length) {
    // Orden fijo (fechas, médico, estado de informe); "fechas" es plural aunque sea el único.
    const [primero, ...resto] = ['fechas', 'médico', 'estado de informe'].filter(x => ignorados.includes(x));
    const lista = resto.length ? [primero, ...resto.slice(0, -1)].join(', ') + ' y ' + resto[resto.length - 1] : primero;
    const plural = resto.length || primero === 'fechas';
    texto += ' · ' + lista.charAt(0).toUpperCase() + lista.slice(1) + ' '
      + (plural ? ACLARACION_BACKLOG.varios : ACLARACION_BACKLOG.uno);
  }
  return texto;
}
function pintarResumenFiltros() {
  const activa = document.querySelector('.tab-pane.active');
  document.getElementById('filtros-resumen').textContent = textoFiltros(activa ? activa.id : '');
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
/* C15 (fase 5): dos universos. `data` (todos los filtros) alimenta KPIs, gráficos, rankings, Médicos y modales;
   Semáforo y Pendientes usan el backlog (sólo modalidad, tipo de turno y prestación). Sin segundo argumento, el
   backlog sale de `realizados`. fechaCorte se toma de todo el dataset: ni fechas ni médico mueven la edad. */
function render(data, backlogData) {
  filtradoBacklog = backlogData || filtrarBacklog(realizados);
  fechaCorteActual = calcFechaCorte(realizados);
  renderProtegidoConservando('kpi-vista', () => calcKPIs(data));
  renderProtegidoConservando('alert-pendientes', () => renderAlertPendientes(data));
  renderProtegidoConservando('chart-dias-vista', () => renderChartDias(data));
  renderProtegidoConservando('chart-donut-vista', () => renderChartDonut(data));
  renderProtegidoConservando('rank-medicos-vista', () => renderRankMedicos(data));
  renderProtegidoConservando('rank-tiempos-vista', () => renderRankTiempos());
  renderProtegidoConservando('tab-pendientes', () => { sincronizarPendModalidad(); renderTabPendientes(filtradoBacklog); });
  renderProtegido('medicos-vista', () => renderTabMedicos(data));
  renderProtegido('prestaciones-vista', () => renderTabPrestaciones(data));
  renderProtegido('mapa-calor-vista', () => renderMapaCalor(data));
  renderProtegido('tendencia-vista', () => renderTendencia(data));
  renderProtegidoConservando('tab-semaforo', () => renderTabSemaforo(filtradoBacklog));
  pintarResumenFiltros();
}

/* C21: una vista que falla no corta el resto de la página. La reusan Prestaciones, el mapa de calor y la tendencia. */
const AVISO_VISTA_FALLO = 'No se pudo mostrar esta vista con estos datos. El resto de la página sigue disponible.';
function renderProtegido(panelId, fn) {
  try { fn(); }
  catch (e) {
    // Mensaje y stack como texto: quedan legibles en la consola y en la red (no sólo "Error").
    console.error('Vista ' + panelId + ' no se pudo renderizar: ' + (e && e.message), '\n' + ((e && e.stack) || ''));
    const p = document.getElementById(panelId);
    if (p) p.innerHTML = `<div class="aviso-vista">${esc(AVISO_VISTA_FALLO)}</div>`;
  }
}

/* PLAN-3.1 (C21, D3): variante para las vistas viejas de Resumen, Pendientes y Semáforo. No pisa el panel: sus canvas,
   selects y tbody tienen que seguir en el DOM para que el render limpio siguiente funcione. Si la vista falla, oculta
   el contenido (clase vista-fallida) y pone el aviso como primer hijo; un render sin error lo quita. */
function renderProtegidoConservando(panelId, fn) {
  const p = document.getElementById(panelId);
  try {
    fn();
    if (p) {
      p.classList.remove('vista-fallida');
      const previo = p.querySelector(':scope > .aviso-vista');
      if (previo) previo.remove();
    }
  } catch (e) {
    console.error('Vista ' + panelId + ' no se pudo renderizar: ' + (e && e.message), '\n' + ((e && e.stack) || ''));
    if (p) {
      p.classList.add('vista-fallida');
      let aviso = p.querySelector(':scope > .aviso-vista');
      if (!aviso) { aviso = document.createElement('div'); aviso.className = 'aviso-vista'; p.insertBefore(aviso, p.firstChild); }
      aviso.textContent = AVISO_VISTA_FALLO;
    }
  }
}

/* ═══════════════════════════════════
   KPIs
═══════════════════════════════════ */
function calcKPIs(data) {
  const conInforme = data.filter(r => tieneInformeIF(r));
  const sinInforme = data.filter(r => !tieneInformeIF(r));

  document.getElementById('kpi-pendientes').textContent = sinInforme.length.toLocaleString();
  // C18c: "del período" (sigue los filtros globales), para no confundirlo con la tarjeta "Informes Realizados".
  document.getElementById('kpi-pend-sub').textContent =
    `de ${data.length.toLocaleString()} estudios del período`;

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

  // N-A1: sin permiso no hay cifra (los nombres ni se cargan): la tarjeta queda con el candado.
  if (puedeVerRankingMedicos()) {
    const medActivos = new Set(conInforme.map(r => r['Médico Informante']).filter(m => medicoValido(m)));
    document.getElementById('kpi-medicos').textContent = medActivos.size;
  } else {
    document.getElementById('kpi-medicos').innerHTML = KPI_MEDICOS_CANDADO;
  }
  // B9/C18e: el subtítulo no nombra médicos, con y sin permiso.
  document.getElementById('kpi-med-sub').textContent = 'con al menos un informe en el período';
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
// C19: el único "X días" de las páginas Realizados y Tiempo (antes un helper duplicado en cada una).
const fmtDiasTexto = horas => horas === null ? '—' : fmtDias(horas) + ' días';

function resumenDemora(filas) {
  const a = agregados(filas);
  return { n: a.n, mediana: fmtDias(a.medianaHoras), p90: fmtDias(a.p90Horas), bandas: a.bandas,
           medianaHoras: a.medianaHoras, p90Horas: a.p90Horas };
}

/* agregados() por Médico Informante válido (sin ADMINVM/DALONSO ni vacío). */
function demoraPorMedico(filas) {
  const g = agrupar(filas.filter(r => medicoValido(r['Médico Informante'])), 'medicoInformante');
  delete g['(vacío)'];
  return g;
}

const cmpTexto = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

/* C5 (fase 5): el top 8 de demora de Resumen se retira; el único ranking de demora por médico es la vista
   Médicos (P90 desc, C3). Con permiso queda un acceso; sin permiso, el contenedor vacío (ni acceso ni aviso). */
function renderRankTiempos() {
  const container = document.getElementById('rank-tiempos');
  container.innerHTML = !puedeVerRankingMedicos() ? ''
    : `<button class="rank-acceso" onclick="switchTab('tab-medicos', document.getElementById('tab-btn-medicos'))">`
      + `Ver demora por médico, por modalidad →</button>`;
}

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
    tbody.innerHTML = `<tr><td colspan="${puedeVerRankingMedicos() ? 8 : 7}"><div class="empty-state"><div class="e-icon">✅</div><div class="e-text">${msg}</div></div></td></tr>`;
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
      ${puedeVerRankingMedicos() ? `<td>${r['Informante Sugerido'] ? esc(r['Informante Sugerido']) : '<span style="color:var(--muted)">No asignado</span>'}</td>` : ''}
      <td style="text-align:center;font-family:'Rajdhani',sans-serif;font-size:15px;font-weight:700">${diasStr}</td>
      <td class="${CLASE_BANDA[banda]}">${ETIQUETA_BANDA[banda]}</td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════
   TAB MÉDICOS
═══════════════════════════════════ */
/* ═══════════════════════════════════
   MÉDICOS POR MODALIDAD (C3/C4/C6, fase 5)
   N_MIN_INFORMES y RESIDENTES viven en medico-metricas.js (junto a SLA_DEFAULT).
═══════════════════════════════════ */
const NOTA_VOLUMEN = 'Volumen (sin ponderar): cuenta informes y no compara complejidad entre modalidades.';
// C13: una sola constante; se pinta en #medicos-aviso-pend y en #modal-nota del drill-down.
const NOTA_PENDIENTES_NO_ATRIBUIDOS = 'La demora se calcula sobre estudios ya informados. Los pendientes no se pueden atribuir a un médico porque el HIS no carga el informante asignado; un médico con muchos pendientes puede verse más rápido de lo que es.';
const NOTA_SLA_PROVISORIO ='* % en SLA calculado con umbrales provisorios: ver el aviso «Umbrales provisorios — en revisión».';
const AVISO_POCOS_DATOS = () => `Menos de ${N_MIN_INFORMES} informes con demora en el período filtrado`;
// Estado para el drill-down (wave 3): sólo se llena con permiso (C10, N-A1). M1 (REVIEW-3.1): { ranking, filas },
// con filas = el mismo data con que se armó el ranking, así el drill cuenta sobre los datos de la fila.
let medicosVista = null;

// C6: compara el nombre normalizado (trim + mayúsculas) contra RESIDENTES normalizada igual. No usa esResidente() (por equipo).
function esResidenteMedico(nombre) {
  return RESIDENTES.map(x => String(x).trim().toUpperCase()).includes(String(nombre).trim().toUpperCase());
}

// C3: P90 desc (provisorio) o % en SLA asc (aprobado); desempate P90 desc → n desc → nombre.
const cmpPorP90C3 = (x, y) => (y.p90Horas - x.p90Horas) || (y.n - x.n) || cmpTexto(x.medico, y.medico);
const cmpPorSlaC3 = (x, y) => {
  if ((x.pctEnSla === null) !== (y.pctEnSla === null)) return x.pctEnSla === null ? 1 : -1;
  return ((x.pctEnSla || 0) - (y.pctEnSla || 0)) || cmpPorP90C3(x, y);
};
const cmpPocosC4 = (x, y) => (y.n - x.n) || cmpTexto(x.medico, y.medico);

/* → { [modalidad]: { staff, staffPocos, residentes, residentesPocos } } con entradas
   { medico, n, p90Horas, medianaHoras, pctEnSla, volumen }. Sólo recibe el `filtered` vigente:
   así el n es el del período filtrado (C4). */
function rankingPorModalidad(filas) {
  const cmpRankingMedicos = SLA_APROBADO ? cmpPorSlaC3 : cmpPorP90C3;
  const informados = filas.filter(r => tieneInformeIF(r));
  const porMod = {};
  informados.forEach(r => { const m = modalidad(r); (porMod[m] = porMod[m] || []).push(r); });
  const salida = {};
  EQUIPO_GROUPS.map(g => g.label).concat('OTROS').forEach(mod => {
    const rows = porMod[mod];
    if (!rows || !rows.length) return;
    const volumen = new Map();
    rows.forEach(r => { const k = String(r['Médico Informante'] || '').trim(); volumen.set(k, (volumen.get(k) || 0) + 1); });
    const bloques = { staff: [], staffPocos: [], residentes: [], residentesPocos: [] };
    Object.entries(demoraPorMedico(rows)).forEach(([medico, a]) => {
      if (!a.n) return;
      const e = { medico, n: a.n, p90Horas: a.p90Horas, medianaHoras: a.medianaHoras, pctEnSla: a.pctEnSla,
                  volumen: volumen.get(medico) || 0 };
      const esRes = esResidenteMedico(medico);
      if (a.n >= N_MIN_INFORMES) (esRes ? bloques.residentes : bloques.staff).push(e);
      else (esRes ? bloques.residentesPocos : bloques.staffPocos).push(e);
    });
    bloques.staff.sort(cmpRankingMedicos);
    bloques.residentes.sort(cmpRankingMedicos);
    bloques.staffPocos.sort(cmpPocosC4);
    bloques.residentesPocos.sort(cmpPocosC4);
    if (Object.values(bloques).some(l => l.length)) salida[mod] = bloques;
  });
  return salida;
}

const COLUMNAS_MEDICOS = [
  ['medico', 'Médico', ''], ['n', 'n', 'num'], ['p90', 'P90 (días)', 'num'], ['mediana', 'Mediana (días)', 'num'],
  ['pct', '% en SLA', 'num'], ['volumen', 'Volumen (sin ponderar)', 'num'],
];

// Posición de ranking de la fila i: "—" si el médico no tiene % en SLA (pctEnSla null); el resto numera de 1 sin saltos.
function posicionRankingTxt(lista, i) {
  if (lista[i].pctEnSla === null) return '—';
  return lista.slice(0, i + 1).filter(e => e.pctEnSla !== null).length;
}

// C13: el nombre es un botón que abre el drill-down; médico y modalidad viajan en data-* (nunca en un onclick).
function tablaMedicosHTML(lista, bloque, mod) {
  const marca = SLA_APROBADO ? '' : '*';
  const ths = COLUMNAS_MEDICOS.map(([k, t, c]) =>
    `<th class="${c}" data-sort="${k}">${esc(t + (k === 'pct' ? marca : ''))}</th>`).join('');
  const filas = lista.map((e, i) => `<tr>
      <td class="num med-pos">${posicionRankingTxt(lista, i)}</td>
      <td class="med-nombre" data-v="${escAttr(e.medico)}" title="${escAttr(e.medico)}"><button type="button" class="med-drill" data-medico="${escAttr(e.medico)}" data-modalidad="${escAttr(mod)}">${esc(e.medico)}</button></td>
      <td class="num" data-v="${e.n}">${e.n}</td>
      <td class="num" data-v="${e.p90Horas}">${fmtDias(e.p90Horas)}</td>
      <td class="num" data-v="${e.medianaHoras}">${fmtDias(e.medianaHoras)}</td>
      <td class="num med-pct" data-v="${e.pctEnSla === null ? '' : e.pctEnSla}">${fmtPct(e.pctEnSla)}</td>
      <td class="num" data-v="${e.volumen}">${e.volumen}</td>
    </tr>`).join('');
  return `<table class="med-tabla"${bloque ? ` data-bloque="${bloque}"` : ''}><thead><tr><th class="num">#</th>${ths}</tr></thead><tbody>${filas}</tbody></table>`;
}

function pocosHTML(lista, bloque, titulo) {
  if (!lista.length) return '';
  return `<div class="med-pocos" data-bloque="${bloque}"><div class="med-sub-titulo">${esc(titulo)}</div>
    <div>${esc(AVISO_POCOS_DATOS())}</div><ul>${lista.map(e =>
      `<li><span title="${escAttr(e.medico)}">${esc(e.medico)}</span> — ${e.n}</li>`).join('')}</ul></div>`;
}

const avisoSinRankingHTML = (bloque) =>
  `<div class="med-sin-ranking"${bloque ? ` data-bloque="${bloque}"` : ''}>${esc(AVISO_POCOS_DATOS())}</div>`;

function renderTabMedicos(data) {
  const cont = document.getElementById('medicos-vista');
  const avisoPend = document.getElementById('medicos-aviso-pend');
  // M4 (REVIEW-2.1): si el cálculo falla, el drill-down no puede quedar leyendo el ranking anterior.
  medicosVista = null;
  // C10/N-A1: sin permiso ni se calcula ni se pinta nada.
  if (!puedeVerRankingMedicos()) { cont.innerHTML = ''; if (avisoPend) avisoPend.textContent = ''; return; }
  if (avisoPend) avisoPend.textContent = NOTA_PENDIENTES_NO_ATRIBUIDOS;   // C13
  const ranking = rankingPorModalidad(data);
  medicosVista = { ranking, filas: data };
  const mods = Object.keys(ranking);
  if (!mods.length) { cont.innerHTML = emptyState('👨‍⚕️', 'Sin médicos informantes registrados'); return; }
  const notas = `<div class="med-nota" id="medicos-nota-volumen">${esc(NOTA_VOLUMEN)}</div>`
    + (SLA_APROBADO ? '' : `<div class="med-nota" id="medicos-nota-sla">${esc(NOTA_SLA_PROVISORIO)}</div>`);
  cont.innerHTML = notas + mods.map(mod => {
    const b = ranking[mod];
    const staff = b.staff.length ? tablaMedicosHTML(b.staff, 'staff', mod) : avisoSinRankingHTML('staff');
    const hayRes = b.residentes.length || b.residentesPocos.length;
    const res = hayRes
      ? `<div data-bloque="residentes"><div class="med-sub-titulo">Residentes</div>`
        + (b.residentes.length ? tablaMedicosHTML(b.residentes, '', mod) : avisoSinRankingHTML(''))
        + `</div>` + pocosHTML(b.residentesPocos, 'residentes-pocos', 'Residentes · pocos datos')
      : '';
    return `<section class="med-mod" data-modalidad="${escAttr(mod)}"><div class="med-mod-titulo">${esc(mod)}</div>`
      + staff + res + pocosHTML(b.staffPocos, 'pocos', 'Pocos datos') + `</section>`;
  }).join('');
}

// FR4.3: reordena una tabla desde su encabezado, sin recalcular (sólo mueve filas).
function ordenarTablaMedicos(th) {
  const tabla = th.closest('table');
  const idx = th.cellIndex;
  const asc = th.dataset.dir !== 'asc';
  tabla.querySelectorAll('th').forEach(t => { delete t.dataset.dir; });
  th.dataset.dir = asc ? 'asc' : 'desc';
  const esTexto = th.dataset.sort === 'medico';
  const val = tr => { const v = tr.cells[idx].dataset.v; return v === '' ? null : esTexto ? v : Number(v); };
  const filas = [...tabla.tBodies[0].rows];
  filas.sort((a, b) => {
    const x = val(a), y = val(b);
    if ((x === null) !== (y === null)) return x === null ? 1 : -1;
    const c = esTexto ? cmpTexto(x, y) : (x - y);
    return asc ? c : -c;
  });
  filas.forEach((tr, i) => { tr.cells[0].textContent = i + 1; tabla.tBodies[0].appendChild(tr); });
}
document.addEventListener('click', ev => {
  const th = ev.target.closest && ev.target.closest('#medicos-vista th[data-sort]');
  if (th) ordenarTablaMedicos(th);
  const b = ev.target.closest && ev.target.closest('#medicos-vista button.med-drill');
  if (b) openModal('medico-modalidad', { medico: b.dataset.medico, modalidad: b.dataset.modalidad });   // C13
});

/* ═══════════════════════════════════
   PRESTACIONES (C9, fase 5)
   Por modalidad, dos tops agrupados por el texto de Prestación (el Código va como columna informativa, sin
   agrupar). Sobre el `filtered` vigente; unidad = estudio. Sin export en la fase 5 (C16).
   N_MIN_INFORMES (C4) y TOP_PRESTACIONES viven en medico-metricas.js.
═══════════════════════════════════ */
const NOTA_PRIMERA_PRESTACION = 'Si un turno tiene dos o más prestaciones no accesorias, sólo cuenta la primera.';
// C1: el volumen de Prestaciones cuenta estudios (informados o no), no informes como NOTA_VOLUMEN de Médicos.
const NOTA_VOLUMEN_PRESTACIONES = 'Volumen (sin ponderar): cuenta estudios del período, informados o no, y no compara complejidad entre modalidades.';

// El valor más frecuente de la columna Código dentro del grupo; si empatan, el menor por texto. '' si no hay.
function codigoMasFrecuente(rows) {
  const cuenta = new Map();
  rows.forEach(r => { const c = String(r['Código'] == null ? '' : r['Código']).trim(); cuenta.set(c, (cuenta.get(c) || 0) + 1); });
  let mejor = '', n = 0;
  cuenta.forEach((v, c) => { if (v > n || (v === n && cmpTexto(c, mejor) < 0)) { mejor = c; n = v; } });
  return mejor;
}

/* → { [modalidad]: { porP90, porVolumen } }. porP90: { prestacion, codigo, n, p90Horas, medianaHoras, volumen } con
   n >= N_MIN_INFORMES, P90 desc → n desc → nombre. porVolumen: { prestacion, codigo, volumen }, volumen desc →
   nombre, sin mínimo. Nunca mezcla modalidades. */
function prestacionesPorModalidad(filas) {
  const porMod = new Map();
  filas.forEach(r => { const m = modalidad(r); if (!porMod.has(m)) porMod.set(m, []); porMod.get(m).push(r); });
  const salida = Object.create(null);
  EQUIPO_GROUPS.map(g => g.label).concat('OTROS').forEach(mod => {
    const rows = porMod.get(mod);
    if (!rows || !rows.length) return;
    const agr = agrupar(rows.filter(r => tieneInformeIF(r)), 'prestacion');
    const grupos = new Map();   // Map: el texto del Excel no puede chocar con Object.prototype
    rows.forEach(r => { const k = textoOVacio(r['Prestación']); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); });
    const todas = [...grupos].map(([prestacion, g]) => ({ prestacion, codigo: codigoMasFrecuente(g), volumen: g.length }));
    const porP90 = todas.filter(e => agr[e.prestacion] && agr[e.prestacion].n >= N_MIN_INFORMES)
      .map(e => ({ ...e, n: agr[e.prestacion].n, p90Horas: agr[e.prestacion].p90Horas,
                   medianaHoras: agr[e.prestacion].medianaHoras }))
      .sort((x, y) => (y.p90Horas - x.p90Horas) || (y.n - x.n) || cmpTexto(x.prestacion, y.prestacion))
      .slice(0, TOP_PRESTACIONES);
    const porVolumen = todas.map(e => ({ prestacion: e.prestacion, codigo: e.codigo, volumen: e.volumen }))
      .sort((x, y) => (y.volumen - x.volumen) || cmpTexto(x.prestacion, y.prestacion))
      .slice(0, TOP_PRESTACIONES);
    salida[mod] = { porP90, porVolumen };
  });
  return salida;
}

const celdaPrestacion = e =>
  `<td title="${escAttr(e.prestacion)}">${esc(e.prestacion)}</td><td title="${escAttr(e.codigo)}">${esc(e.codigo)}</td>`;

function tablaPrestacionesP90HTML(lista) {
  if (!lista.length) return `<div class="med-sin-ranking" data-tabla="p90">${esc(AVISO_POCOS_DATOS())}</div>`;
  const filas = lista.map(e => `<tr>${celdaPrestacion(e)}
      <td class="num">${e.n}</td><td class="num">${fmtDias(e.p90Horas)}</td><td class="num">${fmtDias(e.medianaHoras)}</td></tr>`).join('');
  return `<table class="med-tabla" data-tabla="p90"><thead><tr><th>Prestación</th><th>Código</th><th class="num">n</th>`
    + `<th class="num">P90 (días)</th><th class="num">Mediana (días)</th></tr></thead><tbody>${filas}</tbody></table>`;
}

function tablaPrestacionesVolumenHTML(lista) {
  const filas = lista.map(e => `<tr>${celdaPrestacion(e)}<td class="num">${e.volumen}</td></tr>`).join('');
  return `<table class="med-tabla" data-tabla="volumen"><thead><tr><th>Prestación</th><th>Código</th>`
    + `<th class="num">Volumen (sin ponderar)</th></tr></thead><tbody>${filas}</tbody></table>`;
}

function renderTabPrestaciones(data) {
  const cont = document.getElementById('prestaciones-vista');
  const res = prestacionesPorModalidad(data);
  const mods = Object.keys(res);
  if (!mods.length) { cont.innerHTML = emptyState('🩻', 'Sin estudios en el período'); return; }
  const notas = `<div class="med-nota" id="prestaciones-nota-volumen">${esc(NOTA_VOLUMEN_PRESTACIONES)}</div>`
    + `<div class="med-nota" id="prestaciones-nota-primera">${esc(NOTA_PRIMERA_PRESTACION)}</div>`;
  cont.innerHTML = notas + mods.map(mod => {
    const b = res[mod];
    return `<section class="prest-mod med-mod" data-modalidad="${escAttr(mod)}"><div class="med-mod-titulo">${esc(mod)}</div>`
      + `<div class="med-sub-titulo">Top por P90</div>` + tablaPrestacionesP90HTML(b.porP90)
      + `<div class="med-sub-titulo">Top por volumen</div>` + tablaPrestacionesVolumenHTML(b.porVolumen) + `</section>`;
  }).join('');
}

/* ═══════════════════════════════════
   DEMORA: MAPA DE CALOR (C7, fase 5)
   P90 por día de semana (de Turno Fecha, hora local) × modalidad, sobre los informados con demora válida del
   `filtered` vigente (C4). La escala de color es relativa dentro de cada modalidad. Sin Chart.js: grilla HTML/CSS.
═══════════════════════════════════ */
// Paleta del mapa (no es un umbral de semáforo): una clase por nivel, de menor a mayor P90 dentro de la modalidad.
const NIVELES_CALOR = ['calor-0', 'calor-1', 'calor-2', 'calor-3', 'calor-4'];
// Función, como AVISO_POCOS_DATOS: medico-metricas.js carga después de medico.js y N_MIN_INFORMES no existe todavía.
const LEYENDA_CALOR = () => `El color compara días dentro de la misma modalidad, no entre modalidades. En gris: menos de ${N_MIN_INFORMES} estudios con demora en el período filtrado.`;
const AVISO_SIN_DATOS_PERIODO = 'Sin datos en el período';
// M3 (REVIEW-4.1): el Excel no lleva color; la leyenda habla de «—» y de la tabla n.
const LEYENDA_CALOR_EXCEL = () => `Los números comparan días dentro de la misma modalidad, no entre modalidades. «—»: sin estudios con demora. Con menos de ${N_MIN_INFORMES} estudios (ver la tabla n) el dato es poco confiable.`;
const DIAS_CALOR = [['1', 'Lun'], ['2', 'Mar'], ['3', 'Mié'], ['4', 'Jue'], ['5', 'Vie'], ['6', 'Sáb'], ['7', 'Dom']];

// Máximo de P90 (horas) entre las celdas dadas; null si no hay ninguna.
const maxP90Fila = celdas => celdas.length ? Math.max(...celdas.map(a => a.p90Horas)) : null;

/* → { [modalidad]: { dias: { '1'..'7': agregados }, maxP90 } }. Las 5 modalidades de EQUIPO_GROUPS siempre (con
   n = 0 si no tienen estudios) y OTROS sólo si hay. maxP90 sale sólo de las celdas con escala (n >= N_MIN_INFORMES). */
function mapaCalor(filas) {
  const porMod = new Map();
  filas.filter(r => tieneInformeIF(r) && parseDate(r['Turno Fecha'])).forEach(r => {
    const m = modalidad(r);
    if (!porMod.has(m)) porMod.set(m, []);
    porMod.get(m).push(r);
  });
  const salida = Object.create(null);
  EQUIPO_GROUPS.map(g => g.label).concat('OTROS').forEach(mod => {
    const rows = porMod.get(mod) || [];
    if (mod === 'OTROS' && !rows.length) return;
    const agr = agrupar(rows, 'diaSemana');
    const dias = {};
    const celdasConEscala = [];
    DIAS_CALOR.forEach(([dia]) => {
      const a = agr[dia] || agregados([]);
      dias[dia] = a;
      if (a.n >= N_MIN_INFORMES) celdasConEscala.push(a);
    });
    const maxP90 = maxP90Fila(celdasConEscala);
    salida[mod] = { dias, maxP90 };
  });
  return salida;
}

function celdaCalorHTML(dia, a, maxP90) {
  let clase = 'calor-gris', texto = '—', title = 'n = 0';
  if (a.n > 0) {
    texto = fmtDias(a.p90Horas);
    title = `n = ${a.n} · mediana ${fmtDias(a.medianaHoras)} días`;
    if (a.n >= N_MIN_INFORMES) {
      const x = maxP90 > 0 ? a.p90Horas / maxP90 : 0;
      clase = NIVELES_CALOR[Math.min(NIVELES_CALOR.length - 1, Math.round(x * (NIVELES_CALOR.length - 1)))];
    }
  }
  return `<td class="mapa-celda ${clase}" data-dia="${dia}" title="${escAttr(title)}">${esc(texto)}</td>`;
}

function renderMapaCalor(data) {
  const cont = document.getElementById('mapa-calor-vista');
  const mapa = mapaCalor(data);
  const ths = DIAS_CALOR.map(([, t]) => `<th class="num">${esc(t)}</th>`).join('');
  const filas = Object.keys(mapa).map(mod => {
    const m = mapa[mod];
    return `<tr data-modalidad="${escAttr(mod)}"><th class="mapa-modalidad">${esc(mod)}</th>`
      + DIAS_CALOR.map(([dia]) => celdaCalorHTML(dia, m.dias[dia], m.maxP90)).join('') + `</tr>`;
  }).join('');
  // Se arma entera cada vez: si una falla anterior dejó el aviso en el panel, el próximo render lo reemplaza.
  cont.innerHTML = `<table class="mapa-calor" id="mapa-calor"><thead><tr><th>Modalidad</th>${ths}</tr></thead>`
    + `<tbody>${filas}</tbody></table>`
    + `<div class="med-nota" id="mapa-calor-leyenda">${esc(LEYENDA_CALOR())}</div>`;
}

/* ═══════════════════════════════════
   DEMORA: TENDENCIA (C14, fase 5)
   P90 semanal (semana ISO de Turno Fecha, hora local) por modalidad: un gráfico por modalidad, cada uno con su eje Y
   desde 0. Maduración (D7): una semana se dibuja si sus pendientes son <= MADURACION_MAX_PENDIENTE del total de la
   semana; la semana en curso nunca. Universo (C41): fechas, modalidad, tipo de turno y prestación filtran; Médico y
   "Con informe" no (los pendientes no tienen informante, C2). Sin línea de umbral mientras SLA_APROBADO sea false.
═══════════════════════════════════ */
const chartsTendencia = {};
const ACLARACION_TENDENCIA = 'Médico e informe no aplican en esta vista';
// Función, como AVISO_POCOS_DATOS: medico-metricas.js carga después de medico.js y N_MIN_INFORMES no existe todavía.
const AVISO_SIN_SEMANAS = () => `Menos de ${N_MIN_INFORMES} estudios con demora por semana en el período filtrado`;
const ddmmLunes = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
const lunesDe = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

/* → { [modalidad]: { semanas, dibujable, serie, cortadas, hasta, inmaduras, pocas } }. Las 5 modalidades de
   EQUIPO_GROUPS siempre y OTROS sólo si hay estudios. `semanas` es un eje de calendario continuo, de la primera a la
   última semana con estudios de la modalidad (una semana sin estudios queda con n = 0, estado 'pocos'). Estado de cada
   semana, en este orden: 'en-curso', 'inmadura', 'pocos', 'ok'. `serie` llega hasta la última 'ok'; `cortadas` es lo que
   viene después; `hasta` es el lunes de la última 'ok' si entre lo cortado hay una 'inmadura'; `inmaduras` son las
   inmaduras de la serie; `pocas` son todas las 'pocos' (de la serie y cortadas) si hay alguna 'ok'. */
function tendenciaPorModalidad(filas, fechaCorte) {
  const semCorte = semanaIso(fechaCorte);
  const porMod = new Map();
  filas.forEach(r => {
    if (!parseDate(r['Turno Fecha'])) return;
    const m = modalidad(r);
    if (!porMod.has(m)) porMod.set(m, []);
    porMod.get(m).push(r);
  });
  const salida = Object.create(null);
  EQUIPO_GROUPS.map(g => g.label).concat('OTROS').forEach(mod => {
    const rows = porMod.get(mod) || [];
    if (mod === 'OTROS' && !rows.length) return;
    const agr = agrupar(rows, 'semana');
    const semanas = [];
    if (rows.length) {
      const lunes = rows.map(r => lunesDe(parseDate(r['Turno Fecha'])).getTime());
      const primero = lunes.reduce((a, b) => (a < b ? a : b));
      const ultimo = lunes.reduce((a, b) => (a > b ? a : b));
      for (let l = new Date(primero); l.getTime() <= ultimo; l = new Date(l.getFullYear(), l.getMonth(), l.getDate() + 7)) {
        const clave = semanaIso(l);
        const a = agr[clave] || agregados([]);
        const excluidos = Object.values(a.excluidos).reduce((s, x) => s + x, 0);
        const total = a.n + a.pendientes + excluidos;
        const pctPend = total ? a.pendientes / total : 0;
        let estado = 'ok';
        if (clave === semCorte) estado = 'en-curso';
        else if (pctPend > MADURACION_MAX_PENDIENTE) estado = 'inmadura';
        else if (a.n < N_MIN_INFORMES) estado = 'pocos';
        semanas.push({ semana: clave, lunes: new Date(l), a, total, pctPend, estado });
      }
    }
    const dibujable = semanas.some(s => s.estado === 'ok');
    const corte = dibujable ? semanas.map(s => s.estado).lastIndexOf('ok') + 1 : 0;
    const serie = semanas.slice(0, corte);
    const cortadas = semanas.slice(corte);
    salida[mod] = {
      semanas, dibujable, serie, cortadas,
      hasta: (dibujable && cortadas.some(s => s.estado === 'inmadura')) ? serie[serie.length - 1].lunes : null,
      inmaduras: serie.filter(s => s.estado === 'inmadura'),
      pocas: dibujable ? semanas.filter(s => s.estado === 'pocos') : [],
    };
  });
  return salida;
}

// Universo de la tendencia (C41): el backlog filtrado por modalidad, tipo de turno y prestación, más fechas. null si no hay
// fecha de corte. Lo usan la pantalla (renderTendencia) y el export (exportTendenciaExcel): el mismo cálculo.
function tendenciaVigente() {
  if (!fechaCorteActual) return null;
  const { desde, hasta } = filtrosAplicados;
  const filas = filtradoBacklog.filter(r => {
    const fd = parseDate(r['Turno Fecha']);
    if (!fd) return false;
    const ds = toDateStr(fd);
    return !(desde && ds < desde) && !(hasta && ds > hasta);
  });
  return tendenciaPorModalidad(filas, fechaCorteActual);
}

// → [[clase, texto]] con las notas de maduración de una modalidad; la pantalla las pinta como HTML y el export, como texto.
function notasTendencia(t) {
  const notas = [];
  if (t.hasta) notas.push(['tend-nota-hasta', `Serie hasta la semana del ${ddmmLunes(t.hasta)}; las posteriores todavía tienen estudios sin informar`]);
  if (t.inmaduras.length) {
    notas.push(['tend-nota-inmaduras', 'Semanas con estudios sin informar: '
      + t.inmaduras.map(s => `${ddmmLunes(s.lunes)} (${s.a.pendientes} de ${s.total})`).join(', ')]);
  }
  if (t.pocas.length) {
    notas.push(['tend-nota-pocas', `Semanas con menos de ${N_MIN_INFORMES} estudios con demora: `
      + t.pocas.map(s => `${ddmmLunes(s.lunes)} (n = ${s.a.n})`).join(', ')]);
  }
  return notas;
}

function notasTendenciaHTML(t) {
  return notasTendencia(t).map(([clase, texto]) => `<div class="${clase} med-nota">${esc(texto)}</div>`).join('');
}

function graficoTendencia(canvas, t) {
  const tips = t.serie.map(s => (s.estado === 'ok'
    ? `P90 ${fmtDias(s.a.p90Horas)} días · mediana ${fmtDias(s.a.medianaHoras)} días · n = ${s.a.n}` : ''));
  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: t.serie.map(s => ddmmLunes(s.lunes)),
      datasets: [{ label: 'P90 (días)', data: t.serie.map(s => (s.estado === 'ok' ? Number(fmtDias(s.a.p90Horas)) : null)),
                   spanGaps: false, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,.2)', pointRadius: 3, borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => tips[ctx.dataIndex] } } },
      scales: {
        x: { ticks: { color: '#64748B', font: { size: 10 } }, grid: { color: 'rgba(30,58,138,.2)' } },
        y: { min: 0, title: { display: true, text: 'días', color: '#64748B' },
             ticks: { color: '#64748B', font: { size: 10 } }, grid: { color: 'rgba(30,58,138,.2)' } },
      },
    },
  });
}

// `data` (la de todos los filtros, con Médico e informe) no se usa: el universo es el de C41 (backlog filtrado por
// modalidad, tipo de turno y prestación, más fechas).
function renderTendencia(data) {
  const cont = document.getElementById('tendencia-vista');
  Object.keys(chartsTendencia).forEach(k => { chartsTendencia[k].destroy(); delete chartsTendencia[k]; });
  const tend = tendenciaVigente();
  if (!tend) { cont.innerHTML = emptyState('📈', 'Sin datos'); return; }
  const aclara = filtrosAplicados.medico || filtrosAplicados.informe;
  const resumen = textoFiltros('') + (aclara ? ' · ' + ACLARACION_TENDENCIA : '');
  // Se arma entera cada vez: si una falla anterior dejó el aviso en el panel, el próximo render lo reemplaza.
  cont.innerHTML = `<div class="tend-resumen med-nota">${esc(resumen)}</div><div id="tendencia-grid" class="tend-grid">`
    + Object.keys(tend).map(mod => {
      const t = tend[mod];
      const cuerpo = t.dibujable ? '<div class="tend-lienzo"><canvas></canvas></div>'
        : `<div class="tend-aviso med-nota">${esc(AVISO_SIN_SEMANAS())}</div>`;
      return `<section class="tend-mod" data-modalidad="${escAttr(mod)}"><div class="med-mod-titulo">${esc(mod)}</div>`
        + cuerpo + notasTendenciaHTML(t) + `</section>`;
    }).join('') + `</div>`;
  cont.querySelectorAll('section.tend-mod').forEach(sec => {
    const mod = sec.dataset.modalidad;
    if (tend[mod].dibujable) chartsTendencia[mod] = graficoTendencia(sec.querySelector('canvas'), tend[mod]);
  });
}

/* ═══════════════════════════════════
   TABS
═══════════════════════════════════ */
function switchTab(id, btn) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b  => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
  if (rawData.length) pintarResumenFiltros();   // C15: la aclaración depende de la pestaña
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
  const nv = document.getElementById('rank-medicos-nota');
  if (nv) nv.textContent = NOTA_VOLUMEN;
}

/* Líneas del aviso B1, generadas desde SLA_VIGENTE (SLA_DEFAULT más medico_sla, fase 7b): la vista no tiene números propios.
   Sin filas en la tabla sale exactamente lo de siempre: una línea AMB por modalidad y "INT/URG: sin umbral". */
function textoUmbrales() {
  const linea = u => {
    const verde = u.verde === 'mismoDia' ? 'verde mismo día' : `verde ≤ ${u.verde} h`;
    return `${verde} · amarillo ≤ ${u.amarillo} h · rojo > ${u.amarillo} h`;
  };
  const mods = Object.keys(SLA_VIGENTE);
  const lineas = mods.map(mod => `${mod}: ${linea(SLA_VIGENTE[mod].AMB)}`);
  const otros = [];
  mods.forEach(mod => ['INT', 'URG'].forEach(t => { if (SLA_VIGENTE[mod][t]) otros.push(`${mod} ${t}: ${linea(SLA_VIGENTE[mod][t])}`); }));
  return lineas.concat(otros.length ? otros.concat('Resto de INT/URG: sin umbral') : 'INT/URG: sin umbral');
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
  }, Object.create(null));   // sin prototipo: un Médico Informante '__proto__' es una clave más (N-A2)
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

/* A10: equipos de eco de residentes (por Equipo, no por Servicio).
   Sin callers de producción; se conserva porque la red la exige (A10, A12b).
   La vista Médicos usa esResidenteMedico(). */
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
  const out = Object.create(null);   // C19/N-A2: las claves son texto libre del Excel
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
let modalDrill = null;   // { medico, modalidad } del drill-down abierto (C13); lo usa exportDrillMedico

const COLUMNAS_MODAL = ['Fecha', 'Turno N°', 'Paciente', 'Documento', 'Prestación', 'Informe', 'Días Pendiente'];
// C13: el drill-down no muestra Paciente ni Documento.
const COLUMNAS_DRILL = ['Fecha', 'Turno N°', 'Prestación', 'Demora (días)', 'Semáforo'];

// Misma clave que agrupar()/rankingPorModalidad: el Médico Informante sin espacios alrededor.
const claveMedico = r => String(r['Médico Informante'] || '').trim();

/* Banda de un estudio informado (C13; la wave 5 la reusa en el export): la de semaforo(), con null → 'sin SLA'
   y 'sin fecha' si el estudio no tiene demora válida (inconsistente). */
function bandaEstudio(r) {
  const h = tatHoras(r);
  if (h === null) return 'sin fecha';
  const b = semaforo(modalidad(r), r['Tipo Turno'], h,
    { inicio: parseDate(r['Turno Fecha']), fin: parseDate(r['Fecha Informe']) });
  return b === null ? 'sin SLA' : b;
}

function openModal(tipo, extra) {
  // Minor 4 (REVIEW-5.1): el menú genérico (exportExcel, con Paciente y Documento) no sigue abierto en el modal
  // nuevo; en el drill-down no tiene que quedar a mano (C13).
  closeExportMenu();
  if (!filtered.length) return;
  // C13/C10: sin permiso, el drill-down no abre ni pinta nada (antes de tocar ningún estado del modal).
  // M3 (REVIEW-3.1): tampoco sin médico o modalidad. El permiso no depende de medicosVista.
  if (tipo === 'medico-modalidad' && (!puedeVerRankingMedicos() || !extra || !extra.medico || !extra.modalidad)) return;
  modalTipo = tipo;
  switch(tipo) {
    case 'medico-modalidad': {
      // Informados del médico en esa modalidad, sobre las filas del ranking (M1). Fecha asc; si empatan, turno.
      modalRows = (medicosVista ? medicosVista.filas : []).filter(r => tieneInformeIF(r) && modalidad(r) === extra.modalidad && claveMedico(r) === extra.medico)
        .map(r => ({ r, t: (parseDate(r['Turno Fecha']) || { getTime: () => Infinity }).getTime() }))
        .sort((a, b) => (a.t - b.t) || cmpTexto(String(a.r['Turno N°']), String(b.r['Turno N°'])))
        .map(x => x.r);
      break;
    }
    case 'pendientes': {
      // C25 (opción b): lo abre la tarjeta KPI, así que usa su universo (filtered, con fechas y médico), no el
      // backlog de la pestaña Pendientes. Mismo orden que la pestaña: días de demora descendente.
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
  const esDrill = tipo === 'medico-modalidad';
  modalDrill = esDrill ? { medico: extra.medico, modalidad: extra.modalidad } : null;
  modalTitle = esDrill ? `${extra.medico} · ${extra.modalidad}` : (labels[tipo] || 'Detalle');
  document.getElementById('modal-title').textContent = modalTitle;   // textContent: el nombre viene del Excel
  document.getElementById('modal-bar').style.background = colors[tipo] || 'var(--green)';
  document.getElementById('modal-thead').innerHTML =
    `<tr>${(esDrill ? COLUMNAS_DRILL : COLUMNAS_MODAL).map(c => `<th>${esc(c)}</th>`).join('')}</tr>`;
  const nota = document.getElementById('modal-nota');
  nota.textContent = esDrill ? NOTA_PENDIENTES_NO_ATRIBUIDOS : '';
  nota.style.display = esDrill ? '' : 'none';
  // C13/C16 (wave 5): el drill-down exporta con exportDrillMedico (columnas de pantalla, sin Paciente ni Documento).
  document.getElementById('modal-export').style.display = '';
  document.getElementById('modal-search').placeholder = esDrill
    ? '🔍  Buscar por turno o prestación…' : '🔍  Buscar por paciente, médico, prestación…';
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
  else if (modalTipo === 'medico-modalidad') {
    // C13: el drill-down busca sólo por Turno N° y Prestación (sin Paciente, Documento ni médico).
    modalFiltered = modalRows.filter(r =>
      String(r['Turno N°']||'').toLowerCase().includes(q) || (r['Prestación']||'').toLowerCase().includes(q));
  }
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
  if (modalTipo === 'medico-modalidad') { renderModalMedico(rows, display); return; }
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

/* C13: filas del drill-down (Fecha · Turno N° · Prestación · Demora (días) · Semáforo). El conteo del modal es el
   Volumen de la fila (todos los informados); "n con demora" es el n del ranking (los que tienen demora válida).
   M2 (REVIEW-3.1): "n con demora" se cuenta sobre todas las filas del drill, no sobre lo que filtra el buscador. */
function renderModalMedico(rows, display) {
  const conDemora = modalRows.filter(r => tatHoras(r) !== null).length;
  document.getElementById('modal-footer-count').textContent += ' · n con demora: ' + conDemora.toLocaleString();
  document.getElementById('modal-tbody').innerHTML = display.map(r => {
    const fecha = parseDate(r['Turno Fecha']);
    const banda = bandaEstudio(r);
    return '<tr>' +
      '<td>' + (fecha ? fecha.toLocaleDateString('es-AR') : '—') + '</td>' +
      '<td style="color:var(--muted)">' + esc(r['Turno N°'] || '—') + '</td>' +
      '<td>' + esc(r['Prestación'] || '—') + '</td>' +
      '<td>' + fmtDias(tatHoras(r)) + '</td>' +
      '<td class="' + CLASE_BANDA[banda] + '">' + ETIQUETA_BANDA[banda] + '</td>' +
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

  // Agrupar por médico informante (conteo de informes); sin prototipo, como groupBy (N-A2)
  const byMed = Object.create(null);
  conInforme.forEach(r => {
    const med = (r['Médico Informante']||'').trim();
    if (!medicoValido(med)) return;
    if (!byMed[med]) byMed[med] = [];
    byMed[med].push(r);
  });
  const medData = Object.entries(byMed).map(([med, rows]) => ({ medico: med, count: rows.length }))
    .sort((a,b) => b.count - a.count);

  // D6: Participación = % del total de informes con médico válido (la columna suma 100 %)
  const totalMed = medData.reduce((a, m) => a + m.count, 0) || 1;

  // B5: demora mediana y P90 generales, sin tope (agregados del motor)
  const demora = resumenDemora(conInforme);

  // Summary cards
  document.getElementById('real-total').textContent = conInforme.length.toLocaleString();
  document.getElementById('real-medicos').textContent = medData.length;
  document.getElementById('real-tiempo').textContent = fmtDiasTexto(demora.medianaHoras);
  document.getElementById('real-p90').textContent = fmtDiasTexto(demora.p90Horas);

  // Tabla (B9: sin permiso, el aviso en lugar del detalle por médico)
  const tbody = document.getElementById('real-tbody');
  tbody.innerHTML = !puedeVerRankingMedicos() ? filaAvisoRanking(4) : medData.map((m, i) => {
    // La suma de las celdas visibles es 100 ± el redondeo de cada fila (un decimal).
    const pct = (m.count / totalMed) * 100;
    const pctTxt = pct.toFixed(1);

    return `<tr>
      <td class="rank-col">${i + 1}</td>
      <td class="name-col">${esc(m.medico)}</td>
      <td class="num-col">${m.count}</td>
      <td class="bar-col">
        <div class="real-bar-wrap">
          <div class="real-bar" style="width:${pctTxt}%"></div>
        </div>
        <span class="real-pct">${pctTxt} %</span>
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

/* ═══════════════════════════════════
   EXPORTS: SANEO (C17)
   Formula injection: un string que empieza con = + - @ tab o CR se escribe con ' adelante, así Excel lo trata
   como texto. Sólo strings: números y fechas pasan intactos y siguen siendo numéricos. Todas las filas que este
   módulo le pasa a SpcdExcel.buildTable pasan por sanearFilaExport (spcd-excel-template.js no sanea).
═══════════════════════════════════ */
const PREFIJOS_FORMULA = ['=', '+', '-', '@', '\t', '\r'];
const sanearCelda = v => (typeof v === 'string' && PREFIJOS_FORMULA.some(p => v.startsWith(p))) ? "'" + v : v;
const sanearFilaExport = fila => fila.map(sanearCelda);

// C15/C16 (C26): la línea "Filtros: …" de la pantalla, en la primera fila debajo del encabezado de la plantilla.
// `vista` (opcional, C27): la vista para la que se arma el texto; sin ella se usa la pestaña activa (el drill-down).
function escribirLineaFiltros(ws, fila, totalCols, vista) {
  const activa = document.querySelector('.tab-pane.active');
  const cell = ws.getCell(fila, 1);
  cell.value = sanearCelda(textoFiltros(vista !== undefined ? vista : (activa ? activa.id : '')));
  cell.font = { name:'Calibri', size:10, italic:true };
  ws.mergeCells(fila, 1, fila, totalCols);
  return { nextRow: fila + 1 };
}

async function exportRealizadosExcel(share) {
  if (!puedeVerRankingMedicos()) { showToast(AVISO_RANKING); return; }   // B9
  if (!realizadosData.length) return;
  try {
    await SpcdExcel.ready();

    const conInforme = realizadosData;
    const byMed = Object.create(null);   // N-A2
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
      { label:'Top informante',  value: top,                              tone:'emerald', hint: medData[0]?sanearCelda(medData[0].medico.split(' ')[0]):'' }
    ], { startRow:h.nextRow, totalCols:cols.length });
    const s = SpcdExcel.buildSection(ws, { startRow:k.nextRow, totalCols:cols.length, title:'RANKING POR MÉDICO INFORMANTE' });
    const t = SpcdExcel.buildTable(ws, {
      columns: cols, widths,
      rows: medData.map((m, i) => [i+1, m.medico, m.count]).map(sanearFilaExport),
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
/* C5 (fase 5): la página Tiempo ya no nombra médicos (el único ranking de demora es la vista Médicos).
   Totales generales y una fila por modalidad; sin nombres, así que tampoco lleva guard de permiso. */
let tiempoPorModalidad = [];
let tiempoResumen = null;

function openTiempoPage() {
  if (!filtered.length) return;

  const conInforme = filtered.filter(r => tieneInformeIF(r));
  const porMod = Object.create(null);
  conInforme.forEach(r => { const mod = modalidad(r); (porMod[mod] = porMod[mod] || []).push(r); });
  // Las 5 modalidades siempre (vacías con '—'); OTROS sólo si tiene informes. Mismo orden que la vista Médicos.
  tiempoPorModalidad = EQUIPO_GROUPS.map(g => g.label).concat(porMod.OTROS ? ['OTROS'] : [])
    .map(mod => ({ modalidad: mod, ...resumenDemora(porMod[mod] || []) }));

  const demora = resumenDemora(conInforme);
  tiempoResumen = demora;

  // Summary cards
  document.getElementById('tiempo-avg').textContent = fmtDiasTexto(demora.medianaHoras);
  document.getElementById('tiempo-p90').textContent = fmtDiasTexto(demora.p90Horas);
  document.getElementById('tiempo-modalidades').textContent = tiempoPorModalidad.filter(m => m.n).length;
  document.getElementById('tiempo-total').textContent = demora.n.toLocaleString();

  // Tabla (B6: sin colores de umbral)
  document.getElementById('tiempo-tbody').innerHTML = tiempoPorModalidad.map(m => `<tr>
      <td class="name-col">${esc(m.modalidad)}</td>
      <td class="time-col">${m.mediana}</td>
      <td class="time-col">${m.p90}</td>
      <td class="num-col">${m.n.toLocaleString()}</td>
    </tr>`).join('');

  // Mostrar página
  document.getElementById('tiempo-page').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeTiempoPage() {
  document.getElementById('tiempo-page').classList.remove('open');
  document.body.style.overflow = '';
}

// C5/C16: totales y desglose por modalidad, sin nombres ni banda; sin guard de permiso (no hay datos por médico).
async function exportTiempoExcel(share) {
  if (!tiempoPorModalidad.length || !tiempoResumen) return;
  try {
    await SpcdExcel.ready();

    const cols   = ['Modalidad','Demora mediana (días)','P90 (días)','Informes analizados'];
    const widths = [30, 22, 14, 20];
    const numero = v => v === '—' ? '—' : Number(v);
    const avgGen = fmtDiasTexto(tiempoResumen.medianaHoras);

    const subtitle = 'DEMORA MEDIANA DE INFORME POR MODALIDAD';
    const { wb, ws } = SpcdExcel.createBook({ subtitle, sheetName:'Demora' });

    const h = SpcdExcel.buildHeader(ws, {
      subtitle, totalCols: cols.length,
      meta:{ modulo:'MEDICO', sede:SpcdExcel.getCurrentSede(), usuario:SpcdExcel.getCurrentUser(), registros: tiempoPorModalidad.length, extra:`MEDIANA GLOBAL: ${avgGen}` }
    });
    // C16/C27: la línea de filtros va en la fila 5 con textoFiltros(''): esta página usa `filtered`, así que aplica todos
    // los filtros, sin la aclaración de "no aplica" de Semáforo y Pendientes. Los KPIs bajan a lf.nextRow.
    const lf = escribirLineaFiltros(ws, h.nextRow, cols.length, '');
    const k = SpcdExcel.buildKPIs(ws, [
      { label:'Informes analizados', value: tiempoResumen.n.toLocaleString('es-AR'), tone:'silver' },
      { label:'Demora mediana',      value: avgGen,                                   tone:'emerald' },
      { label:'P90',                 value: fmtDiasTexto(tiempoResumen.p90Horas),     tone:'cyan' }
    ], { startRow:lf.nextRow, totalCols:cols.length });
    const s = SpcdExcel.buildSection(ws, { startRow:k.nextRow, totalCols:cols.length, title:'DEMORA MEDIANA POR MODALIDAD · DÍAS' });
    const t = SpcdExcel.buildTable(ws, {
      columns: cols, widths,
      rows: tiempoPorModalidad.map(m => [m.modalidad, numero(m.mediana), numero(m.p90), m.n]).map(sanearFilaExport),
      startRow: s.nextRow, totalCols: cols.length,
      formatter: (cell, v, rd, idx, ci, cName) => {
        if (cName !== 'Modalidad') SpcdExcel.Fmt.center(cell);
        if ((cName==='Demora mediana (días)' || cName==='P90 (días)') && typeof v === 'number') cell.numFmt = '0.0 "días"';
        if (cName==='Informes analizados') SpcdExcel.Fmt.accent(cell);
      }
    });
    const tot = SpcdExcel.buildTotals(ws, {
      startRow:t.nextRow, totalCols:cols.length,
      items:[
        { label:'Informes analizados', value: tiempoResumen.n },
        { label:'Mediana global', value: avgGen }
      ]
    });
    SpcdExcel.buildFooter(ws, { startRow:tot.nextRow, totalCols:cols.length, hash:h.hash });

    const fileName = `SPCD_Medico_Demora_Mediana_${SpcdExcel.nowIsoDate()}.xlsx`;
    await SpcdExcel.exportAndShare(wb, fileName, share ? {
      titulo:'Demora mediana de informe por modalidad',
      periodo: SpcdExcel.dateAr(),
      cantidad: tiempoResumen.n,
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
  // C13/C16: el drill-down tiene su propio export (columnas de pantalla, sin Paciente ni Documento).
  if (modalTipo === 'medico-modalidad') { exportDrillMedico(false); return; }
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

/* ── Columnas del libro de exportExcel: fijas, sin Equipo si el modal no es de pendientes (C19) ── */
function columnasExportModal(isPend) {
  const allCols   = ['Turno Fecha','Turno N°','Paciente','Documento','Prestación','Equipo','Informe','Días Pendiente'];
  const allShortH = ['Fecha','Turno N°','Paciente','DNI','Prestación','Equipo','Informe','Días'];
  const allColW   = [11,12,24,12,30,16,10,8];

  const excludeCols = isPend ? new Set([]) : new Set(['Equipo']);
  const indices = [];
  allCols.forEach((c,i) => { if (!excludeCols.has(c)) indices.push(i); });
  return {
    cols:   indices.map(i => allCols[i]),
    shortH: indices.map(i => allShortH[i]),
    colW:   indices.map(i => allColW[i])
  };
}

/* ── KPIs del libro de exportExcel (C19) ── */
function kpisExportModal(dataRows, isPend, hoy) {
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
  return { kpis, conI, sinI, maxDias };
}

/* ── Formatter de la tabla de exportExcel: color por banda de semaforo() en los días pendientes (C19) ── */
function formatterExportModal(cols, dataRows, isPend, hoy) {
  return (cell, v, rd, idx, ci) => {
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
  };
}

/* ── Generar y descargar Excel. share=true abre diálogo compartir ── */
async function exportExcel(groupFilter, share) {
  if (!modalFiltered.length) { spcdAlert('No hay datos para exportar', { type:'alert', title:'Sin datos' }); return; }
  try {
    await SpcdExcel.ready();

    const isPend = (modalTipo === 'pendientes');
    const { cols, shortH, colW } = columnasExportModal(isPend);

    const dataRows = isPend ? getExportRows(groupFilter) : deduplicarPorTurno(modalFiltered);
    const subtitleSuf = isPend ? getExportSubtitle(groupFilter) : null;
    if (!dataRows.length) { spcdAlert('No hay datos en este grupo', { type:'alert', title:'Sin datos' }); return; }

    const hoy = fechaCorteActual;
    const { kpis, conI, sinI, maxDias } = kpisExportModal(dataRows, isPend, hoy);

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
      }).map(sanearFilaExport),
      startRow: s.nextRow, totalCols: cols.length,
      formatter: formatterExportModal(cols, dataRows, isPend, hoy)
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

/* ── Export de Médicos por modalidad (C16, C27, C28) ──
   Filas 1-4: encabezado de la plantilla. Fila 5: la línea de filtros (textoFiltros('tab-medicos')). Con
   SLA_APROBADO=false, una fila con AVISO_UMBRALES y una por cada línea de textoUmbrales() (7 filas, igual que
   #sla-aviso); después, la nota de pendientes. Por modalidad, una sección y los bloques en el orden de la pantalla
   (C10): staff, Residentes, Residentes · pocos datos y pocos datos del staff. Los datos salen de
   rankingPorModalidad(filtered), la misma estructura que la pantalla. Sin Fmt de banda (C12). Todas las buildTable
   llevan freezeHeader:false y una sola asignación de ws.views congela hasta la fila 5 (C28). */
const WIDTHS_MEDICOS = [26, 30, 10, 14, 16, 14, 22];
const COLUMNAS_POCOS_EXPORT = ['Médico', 'n'];

async function exportMedicosExcel(share) {
  if (!puedeVerRankingMedicos()) return;   // C10: sin permiso no hay pestaña y, por lo tanto, no hay export
  try {
    await SpcdExcel.ready();
    const ranking = rankingPorModalidad(filtered);
    const mods = Object.keys(ranking);
    if (!mods.length) {
      if (typeof spcdAlert === 'function') spcdAlert('No hay datos para exportar', { type:'alert', title:'Sin datos' });
      return;
    }
    const marca = SLA_APROBADO ? '' : '*';
    const cols = ['#'].concat(COLUMNAS_MEDICOS.map(([k, t]) => t + (k === 'pct' ? marca : '')));
    const totalCols = cols.length;
    const dias = h => h === null ? null : Number(fmtDias(h));
    const filasRank = lista => lista.map((e, i) => [posicionRankingTxt(lista, i), e.medico, e.n, dias(e.p90Horas), dias(e.medianaHoras),
      e.pctEnSla === null ? null : Number(e.pctEnSla.toFixed(1)), e.volumen]).map(sanearFilaExport);
    const filasPocos = lista => lista.map(e => [e.medico, e.n]).map(sanearFilaExport);
    const nRegistros = mods.reduce((a, m) => a + ranking[m].staff.length + ranking[m].staffPocos.length
      + ranking[m].residentes.length + ranking[m].residentesPocos.length, 0);

    const subtitle = 'DEMORA POR MÉDICO Y MODALIDAD';
    const { wb, ws } = SpcdExcel.createBook({ subtitle, sheetName:'Médicos' });
    const h = SpcdExcel.buildHeader(ws, {
      subtitle, totalCols,
      meta:{ modulo:'MEDICO', sede:SpcdExcel.getCurrentSede(), usuario:SpcdExcel.getCurrentUser(), registros: nRegistros }
    });

    let fila = escribirLineaFiltros(ws, h.nextRow, totalCols, 'tab-medicos').nextRow;
    const texto = (valor, alto) => {
      const c = ws.getCell(fila, 1);
      c.value = sanearCelda(valor);
      c.alignment = { wrapText:true, vertical:'top' };
      ws.mergeCells(fila, 1, fila, totalCols);
      if (alto) ws.getRow(fila).height = alto;
      fila++;
    };
    if (!SLA_APROBADO) {                                  // C27: una fila por línea, igual que #sla-aviso
      texto(AVISO_UMBRALES);
      textoUmbrales().forEach(l => texto(l));
    }
    texto(NOTA_PENDIENTES_NO_ATRIBUIDOS, 30);             // C13: la misma constante que en pantalla
    const seccion = titulo => {
      fila = SpcdExcel.buildSection(ws, { startRow:fila, totalCols, title: sanearCelda(titulo) }).nextRow;
    };
    const tabla = (columns, rows, formatter) => {
      fila = SpcdExcel.buildTable(ws, { columns, widths: WIDTHS_MEDICOS, rows, startRow:fila, totalCols,
                                        freezeHeader:false, formatter }).nextRow;
    };
    const fmtRank = (cell, v, rd, idx, ci, cName) => {
      if (cName !== 'Médico') SpcdExcel.Fmt.center(cell);
      if (typeof v === 'number' && (cName === 'P90 (días)' || cName === 'Mediana (días)' || cName.startsWith('% en SLA'))) {
        cell.numFmt = '0.0';
      }
    };

    mods.forEach(mod => {
      const b = ranking[mod];
      seccion(mod);
      if (b.staff.length) tabla(cols, filasRank(b.staff), fmtRank); else texto(AVISO_POCOS_DATOS());
      if (b.residentes.length || b.residentesPocos.length) {
        seccion('Residentes');
        if (b.residentes.length) tabla(cols, filasRank(b.residentes), fmtRank); else texto(AVISO_POCOS_DATOS());
      }
      if (b.residentesPocos.length) { seccion('Residentes · pocos datos'); tabla(COLUMNAS_POCOS_EXPORT, filasPocos(b.residentesPocos)); }
      if (b.staffPocos.length)      { seccion('Pocos datos');              tabla(COLUMNAS_POCOS_EXPORT, filasPocos(b.staffPocos)); }
    });

    if (!SLA_APROBADO) texto(NOTA_SLA_PROVISORIO);
    texto(NOTA_VOLUMEN);
    SpcdExcel.buildFooter(ws, { startRow:fila, totalCols, hash:h.hash });
    // C28: cada buildTable pisaría ws.views; con freezeHeader:false esta es la única asignación (encabezado y filtros).
    ws.views = [{ state:'frozen', xSplit:0, ySplit:5, showGridLines:false, zoomScale:100 }];

    const fileName = `SPCD_Medico_Medicos_por_Modalidad_${SpcdExcel.nowIsoDate()}.xlsx`;
    await SpcdExcel.exportAndShare(wb, fileName, share ? {
      titulo:'Demora por médico y modalidad',
      periodo: SpcdExcel.dateAr(),
      cantidad: nRegistros,
      modulo:'medico', tipoExport:'medicos'
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

/* ── Exports de Prestaciones, mapa de calor y tendencia (fase 6, C16, C9, C17, C28) ──
   Mismo modelo que exportMedicosExcel: filas 1-4 el encabezado de la plantilla, fila 5 la línea de filtros de su
   pestaña (escribirLineaFiltros con la vista), texto y tablas después, todas las buildTable con freezeHeader:false y una
   sola asignación de ws.views (congela hasta la fila 5). Los datos salen de las mismas funciones que la pantalla
   (prestacionesPorModalidad, mapaCalor, tendenciaVigente) y no se calcula nada aparte. Agregados: sin nombres de médicos,
   sin banda ni color (C12; el mapa de calor lleva el número y la leyenda como texto). Cada fila pasa por sanearFilaExport
   y cada texto por sanearCelda (C17). Los botones viven fuera de los paneles que renderProtegido pisa. */
const diasExport = h => (h === null || h === undefined) ? null : Number(fmtDias(h));
const fechaLunesExport = d => ddmmLunes(d) + '/' + d.getFullYear();
const ESTADO_SEMANA_EXPORT = { ok: 'Con datos', inmadura: 'Con estudios sin informar', pocos: 'Pocos datos', 'en-curso': 'En curso' };
const COLUMNAS_PRESTACIONES_P90 = ['Prestación', 'Código', 'n', 'P90 (días)', 'Mediana (días)'];
const COLUMNAS_PRESTACIONES_VOL = ['Prestación', 'Código', 'Volumen (sin ponderar)'];
const COLUMNAS_TENDENCIA_EXPORT = ['Semana (lunes)', 'P90 (días)', 'Mediana (días)', 'n', 'Estado'];

function alertaErrorExport(err) {
  console.error('Export error:', err);
  if (typeof spcdAlert === 'function') {
    spcdAlert('Error al exportar: ' + err.message, { type:'error', title:'Error al exportar' });
  } else {
    alert('Error al exportar: ' + err.message);
  }
}

function alertaSinDatosExport() {
  if (typeof spcdAlert === 'function') spcdAlert('No hay datos para exportar', { type:'alert', title:'Sin datos' });
}

/* Alto de una fila de texto combinada y con wrapText: ExcelJS no autoajusta filas combinadas, así que se estima por el
   largo (caracteres por línea = suma de los anchos de columna). Una sola línea → undefined (alto por defecto). */
const ALTO_LINEA_EXCEL = 15;
function altoFilaTexto(texto, anchos) {
  const porLinea = anchos.reduce((a, b) => a + b, 0);
  const lineas = Math.max(Math.ceil(String(texto == null ? '' : texto).length / porLinea), 1);
  return lineas - 1 ? lineas * ALTO_LINEA_EXCEL : undefined;   // sin comparar: el SC2 (P1) busca umbrales con > / <
}

// Escribe texto y tablas desde la fila `fila` (la siguiente a la de filtros). `e.fila` avanza con cada escritura.
function escritorVista(ws, fila, totalCols, widths) {
  const e = { fila };
  e.texto = (valor, alto) => {
    const c = ws.getCell(e.fila, 1);
    c.value = sanearCelda(valor);
    c.alignment = { wrapText:true, vertical:'top' };
    ws.mergeCells(e.fila, 1, e.fila, totalCols);
    if (alto) ws.getRow(e.fila).height = alto;
    e.fila++;
  };
  e.seccion = titulo => {
    e.fila = SpcdExcel.buildSection(ws, { startRow:e.fila, totalCols, title: sanearCelda(titulo) }).nextRow;
  };
  e.tabla = (columns, rows, formatter) => {
    e.fila = SpcdExcel.buildTable(ws, { columns, widths, rows, startRow:e.fila, totalCols,
                                        freezeHeader:false, formatter }).nextRow;
  };
  return e;
}

// Pie del libro: nota de SLA provisorio donde hay demora, pie de plantilla y la única asignación de ws.views (C28).
function cerrarLibroVista(ws, e, totalCols, hash) {
  if (!SLA_APROBADO) e.texto(NOTA_SLA_PROVISORIO);
  SpcdExcel.buildFooter(ws, { startRow:e.fila, totalCols, hash });
  ws.views = [{ state:'frozen', xSplit:0, ySplit:5, showGridLines:false, zoomScale:100 }];
}

async function exportPrestacionesExcel(share) {
  try {
    await SpcdExcel.ready();
    const res = prestacionesPorModalidad(filtered);
    const mods = Object.keys(res);
    if (!mods.length) { alertaSinDatosExport(); return; }
    const totalCols = COLUMNAS_PRESTACIONES_P90.length;
    const filasP90 = lista => lista.map(e => [e.prestacion, e.codigo, e.n, diasExport(e.p90Horas), diasExport(e.medianaHoras)]).map(sanearFilaExport);
    const filasVol = lista => lista.map(e => [e.prestacion, e.codigo, e.volumen]).map(sanearFilaExport);
    // M5(1) (REVIEW-4.1): prestaciones distintas por modalidad (una que está en los dos tops cuenta una vez).
    const nRegistros = mods.reduce((a, m) => a + new Set(res[m].porP90.concat(res[m].porVolumen).map(e => e.prestacion)).size, 0);

    const subtitle = 'PRESTACIONES POR MODALIDAD';
    const { wb, ws } = SpcdExcel.createBook({ subtitle, sheetName:'Prestaciones' });
    const h = SpcdExcel.buildHeader(ws, {
      subtitle, totalCols,
      meta:{ modulo:'MEDICO', sede:SpcdExcel.getCurrentSede(), usuario:SpcdExcel.getCurrentUser(), registros: nRegistros }
    });
    const lf = escribirLineaFiltros(ws, h.nextRow, totalCols, 'tab-prestaciones');
    const w = escritorVista(ws, lf.nextRow, totalCols, [40, 16, 12, 14, 16]);
    w.texto(NOTA_PRIMERA_PRESTACION);                    // C9: la misma constante que en pantalla
    w.texto(NOTA_VOLUMEN_PRESTACIONES);
    const fmtNum = (cell, v, rd, idx, ci, cName) => {
      if (cName !== 'Prestación' && cName !== 'Código') SpcdExcel.Fmt.center(cell);
      if (typeof v === 'number' && (cName === 'P90 (días)' || cName === 'Mediana (días)')) cell.numFmt = '0.0';
    };
    mods.forEach(mod => {
      const b = res[mod];
      w.seccion(`${mod} · Top por P90`);
      if (b.porP90.length) w.tabla(COLUMNAS_PRESTACIONES_P90, filasP90(b.porP90), fmtNum); else w.texto(AVISO_POCOS_DATOS());
      w.seccion(`${mod} · Top por volumen`);
      w.tabla(COLUMNAS_PRESTACIONES_VOL, filasVol(b.porVolumen), fmtNum);
    });
    cerrarLibroVista(ws, w, totalCols, h.hash);

    const fileName = `SPCD_Medico_Prestaciones_${SpcdExcel.nowIsoDate()}.xlsx`;
    await SpcdExcel.exportAndShare(wb, fileName, share ? {
      titulo:'Prestaciones por modalidad', periodo: SpcdExcel.dateAr(), cantidad: nRegistros,
      modulo:'medico', tipoExport:'prestaciones'
    } : null);
  } catch(err) { alertaErrorExport(err); }
}

async function exportMapaCalorExcel(share) {
  try {
    await SpcdExcel.ready();
    const mapa = mapaCalor(filtered);
    const mods = Object.keys(mapa);
    const cols = ['Modalidad'].concat(DIAS_CALOR.map(([, t]) => t));
    const totalCols = cols.length;
    const filasP90 = mods.map(mod => [mod].concat(DIAS_CALOR.map(([dia]) => {
      const a = mapa[mod].dias[dia];
      return a.n === 0 ? '—' : diasExport(a.p90Horas);      // la misma marca que la pantalla para n = 0
    }))).map(sanearFilaExport);
    const filasN = mods.map(mod => [mod].concat(DIAS_CALOR.map(([dia]) => mapa[mod].dias[dia].n))).map(sanearFilaExport);
    const nRegistros = mods.reduce((a, m) => a + DIAS_CALOR.reduce((s, [dia]) => s + mapa[m].dias[dia].n, 0), 0);

    const subtitle = 'DEMORA · MAPA DE CALOR (P90 EN DÍAS)';
    const { wb, ws } = SpcdExcel.createBook({ subtitle, sheetName:'Mapa de calor' });
    const h = SpcdExcel.buildHeader(ws, {
      subtitle, totalCols,
      meta:{ modulo:'MEDICO', sede:SpcdExcel.getCurrentSede(), usuario:SpcdExcel.getCurrentUser(), registros: nRegistros }
    });
    const lf = escribirLineaFiltros(ws, h.nextRow, totalCols, 'tab-demora');
    const w = escritorVista(ws, lf.nextRow, totalCols, [26, 10, 10, 10, 10, 10, 10, 10]);
    w.texto(LEYENDA_CALOR_EXCEL());                      // la leyenda va como texto: el Excel no lleva color por nivel
    if (nRegistros === 0) w.texto(AVISO_SIN_DATOS_PERIODO);   // M5(2) (REVIEW-4.1): sin modalidades o todo n = 0
    const fmtCelda = (cell, v, rd, idx, ci) => {
      if (ci > 0) SpcdExcel.Fmt.center(cell);
      if (ci > 0 && typeof v === 'number') cell.numFmt = '0.0';
    };
    w.tabla(cols, filasP90, fmtCelda);
    w.seccion('Estudios con demora (n) por día');
    w.tabla(cols, filasN, (cell, v, rd, idx, ci) => { if (ci > 0) SpcdExcel.Fmt.center(cell); });
    cerrarLibroVista(ws, w, totalCols, h.hash);

    const fileName = `SPCD_Medico_Mapa_de_Calor_${SpcdExcel.nowIsoDate()}.xlsx`;
    await SpcdExcel.exportAndShare(wb, fileName, share ? {
      titulo:'Demora · mapa de calor', periodo: SpcdExcel.dateAr(), cantidad: nRegistros,
      modulo:'medico', tipoExport:'mapa-calor'
    } : null);
  } catch(err) { alertaErrorExport(err); }
}

async function exportTendenciaExcel(share) {
  try {
    await SpcdExcel.ready();
    const tend = tendenciaVigente();                     // el mismo universo y cálculo que renderTendencia
    if (!tend) { alertaSinDatosExport(); return; }
    const mods = Object.keys(tend);
    const totalCols = COLUMNAS_TENDENCIA_EXPORT.length;
    // El eje es `serie` (labels del gráfico): hasta la última semana 'ok'; lo cortado y la semana en curso no van.
    const filasTendencia = serie => serie.map(s => [fechaLunesExport(s.lunes),
      s.estado === 'ok' ? diasExport(s.a.p90Horas) : null, s.estado === 'ok' ? diasExport(s.a.medianaHoras) : null,
      s.a.n, ESTADO_SEMANA_EXPORT[s.estado]]).map(sanearFilaExport);
    const nRegistros = mods.reduce((a, m) => a + tend[m].serie.length, 0);

    const subtitle = 'DEMORA · TENDENCIA SEMANAL (P90 EN DÍAS)';
    const { wb, ws } = SpcdExcel.createBook({ subtitle, sheetName:'Tendencia' });
    const h = SpcdExcel.buildHeader(ws, {
      subtitle, totalCols,
      meta:{ modulo:'MEDICO', sede:SpcdExcel.getCurrentSede(), usuario:SpcdExcel.getCurrentUser(), registros: nRegistros }
    });
    const lf = escribirLineaFiltros(ws, h.nextRow, totalCols, 'tab-demora');
    const anchosTend = [26, 14, 16, 10, 28];
    const w = escritorVista(ws, lf.nextRow, totalCols, anchosTend);
    w.texto(ACLARACION_TENDENCIA);
    const fmtSemana = (cell, v, rd, idx, ci) => {
      if ([1, 2, 3].includes(ci)) SpcdExcel.Fmt.center(cell);
      if ((ci === 1 || ci === 2) && typeof v === 'number') cell.numFmt = '0.0';
    };
    mods.forEach(mod => {
      const t = tend[mod];
      w.seccion(mod);
      if (!t.dibujable) w.texto(AVISO_SIN_SEMANAS());
      notasTendencia(t).forEach(([, nota]) => w.texto(nota, altoFilaTexto(nota, anchosTend)));
      if (t.serie.length) w.tabla(COLUMNAS_TENDENCIA_EXPORT, filasTendencia(t.serie), fmtSemana);
    });
    cerrarLibroVista(ws, w, totalCols, h.hash);

    const fileName = `SPCD_Medico_Tendencia_${SpcdExcel.nowIsoDate()}.xlsx`;
    await SpcdExcel.exportAndShare(wb, fileName, share ? {
      titulo:'Demora · tendencia semanal', periodo: SpcdExcel.dateAr(), cantidad: nRegistros,
      modulo:'medico', tipoExport:'tendencia'
    } : null);
  } catch(err) { alertaErrorExport(err); }
}

/* ── Export del drill-down (C13/C16): las columnas de la pantalla (sin Paciente ni Documento), la banda por estudio
   de bandaEstudio (la misma función que pinta el modal), la línea de filtros y la nota de pendientes. ── */
const FMT_BANDA = { rojo: 'error', amarillo: 'warn', verde: 'success' };

async function exportDrillMedico(share) {
  if (!puedeVerRankingMedicos()) return;   // C13: sin permiso no hay drill-down
  if (!modalDrill || !modalFiltered.length) return;
  try {
    await SpcdExcel.ready();
    const dataRows = modalFiltered;
    const cols   = COLUMNAS_DRILL;
    const widths = [12, 12, 36, 14, 14];
    const conDemora = dataRows.filter(r => tatHoras(r) !== null).length;
    const subtitle = sanearCelda(`DEMORA POR ESTUDIO · ${modalDrill.medico} · ${modalDrill.modalidad}`.toUpperCase());
    const { wb, ws } = SpcdExcel.createBook({ subtitle, sheetName:'Drill-down' });

    const h = SpcdExcel.buildHeader(ws, {
      subtitle, totalCols: cols.length,
      meta:{ modulo:'MEDICO', sede:SpcdExcel.getCurrentSede(), usuario:SpcdExcel.getCurrentUser(),
             registros: dataRows.length, extra: sanearCelda(`MODALIDAD: ${modalDrill.modalidad}`) }
    });
    const lf = escribirLineaFiltros(ws, h.nextRow, cols.length);
    const nota = ws.getCell(lf.nextRow, 1);
    nota.value = NOTA_PENDIENTES_NO_ATRIBUIDOS;
    nota.alignment = { wrapText:true, vertical:'top' };
    ws.mergeCells(lf.nextRow, 1, lf.nextRow, cols.length);
    ws.getRow(lf.nextRow).height = 30;
    const k = SpcdExcel.buildKPIs(ws, [
      { label:'Estudios informados', value: dataRows.length, tone:'cyan' },
      { label:'Con demora',          value: conDemora,       tone:'silver' }
    ], { startRow: lf.nextRow + 1, totalCols: cols.length });
    const s = SpcdExcel.buildSection(ws, { startRow:k.nextRow, totalCols:cols.length,
                                           title: sanearCelda(`ESTUDIOS · ${modalDrill.modalidad}`) });
    const t = SpcdExcel.buildTable(ws, {
      columns: cols, widths,
      rows: dataRows.map(r => {
        const fecha = parseDate(r['Turno Fecha']);
        const hs = tatHoras(r);
        return [fecha || '', r['Turno N°'] || '', r['Prestación'] || '',
                hs === null ? null : Number(fmtDias(hs)), ETIQUETA_BANDA[bandaEstudio(r)]];
      }).map(sanearFilaExport),
      startRow: s.nextRow, totalCols: cols.length,
      formatter: (cell, v, rd, idx, ci, cName) => {
        if (cName === 'Fecha' && v instanceof Date) cell.numFmt = 'dd/mm/yyyy';
        if (cName === 'Turno N°') SpcdExcel.Fmt.center(cell);
        if (cName === 'Demora (días)' && typeof v === 'number') { SpcdExcel.Fmt.center(cell); cell.numFmt = '0.0'; }
        if (cName === 'Semáforo') {
          const fmt = FMT_BANDA[bandaEstudio(dataRows[idx])];
          if (fmt) SpcdExcel.Fmt[fmt](cell);
        }
      }
    });
    const tot = SpcdExcel.buildTotals(ws, {
      startRow:t.nextRow, totalCols:cols.length,
      items:[ { label:'Estudios', value: dataRows.length }, { label:'Con demora', value: conDemora } ]
    });
    SpcdExcel.buildFooter(ws, { startRow:tot.nextRow, totalCols:cols.length, hash:h.hash });

    const fileName = `SPCD_Medico_Drill_${String(modalDrill.modalidad).replace(/[\s\/]+/g,'_')}_${SpcdExcel.nowIsoDate()}.xlsx`;
    await SpcdExcel.exportAndShare(wb, fileName, share ? {
      titulo: 'Demora por estudio · ' + modalDrill.modalidad,
      periodo: SpcdExcel.dateAr(),
      cantidad: dataRows.length,
      modulo:'medico', tipoExport:'medico-modalidad'
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

