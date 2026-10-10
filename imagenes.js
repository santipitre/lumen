(function(){
'use strict';
if(!window.__img_user) return;

/* == constantes == */
const TABS = ['medicos','residentes','tecnicos','administrativos'];
const SUBS = ['staff','eco','rm'];
const TITULOS = { medicos:'Médicos', residentes:'Residentes', tecnicos:'Técnicos', administrativos:'Administrativos' };
const BASE = 'Dashboard Imágenes H.Italiano';
const TIPO_DE = { medicos:'medico', residentes:'residente', tecnicos:'tecnico', administrativos:'administrativo' };
const RPC_LECTURA = ['img_mi_acceso','img_catalogos','img_listar','img_ficha','img_cronograma'];
const NIVELES_CONTACTOS = ['ver_contactos','editar','admin'];
const NIVELES_SOLO_LECTURA = ['ver','ver_contactos'];
const ANIOS = [1, 2, 3, 4];
const HORA_INI = 8;
const HORA_FIN = 17;
const CONSULTORIOS = [1, 2];
const DIAS_BASE = [0, 1, 2, 3, 4];
const MENSAJES = {
  NO_CLIENTE: 'No se pudo conectar con la base de datos de Lumen.',
  SIN_AUTH: 'Este módulo requiere ingresar a Lumen con email.',
  SIN_SESION: 'Este módulo requiere ingresar a Lumen con email.',
  NO_COINCIDE: 'Tu sesión no coincide con tu usuario de Lumen: cerrá sesión y volvé a ingresar.',
  SIN_PERMISO: 'No tenés acceso a esta sección.',
  NO_EXISTE: 'No se encontró la persona.',
  INVALIDO: 'No se pudo leer la base. Probá recargar la página.',
  RESPUESTA: 'No se pudo leer la base. Probá recargar la página.',
  RED: 'No se pudo leer la base. Probá recargar la página.'
};

/* Estado único del módulo */
const E = { identidadOk:false, nivel:null, contactos:false, pestanas:[], catalogos:null, personas:{}, turnos:[], errores:{}, cargando:true, filtros:{}, consulta:'', hoy:'', vista:'tabla' };
const REFS = {};

/* == lógica pura == */
function sinTildes(s){
  if(s === null || s === undefined) return '';
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function hayContactos(nivel){
  return NIVELES_CONTACTOS.indexOf(nivel) >= 0;
}

function parseHash(h){
  const partes = String(h || '').replace(/^#/, '').split('/');
  return { tab: partes[0], sub: partes[1] };
}

function resolverHash(hash, pestanas){
  if(!pestanas || !pestanas.length) return null;
  const p = parseHash(hash);
  const tab = pestanas.indexOf(p.tab) >= 0 && TABS.indexOf(p.tab) >= 0 ? p.tab : pestanas[0];
  if(tab !== 'medicos') return { tab: tab, sub: null };
  return { tab: tab, sub: (tab === p.tab && SUBS.indexOf(p.sub) >= 0) ? p.sub : 'staff' };
}

function estadoIdentidad(hayCliente, authId, user){
  if(!hayCliente) return 'NO_CLIENTE';
  if(!authId) return 'SIN_AUTH';
  if(!user || !user.auth_user_id || user.auth_user_id !== authId) return 'NO_COINCIDE';
  return 'OK';
}

function hashDe(r){
  return '#' + r.tab + (r.sub ? '/' + r.sub : '');
}

/* Listado: espejo de _test/imagenes/lectura_ref.py (reciben todo por parámetro; no tocan DOM ni E) */
function digitoAnio(p){
  const m = String((p.datos || {}).anio || '').match(/\d/);
  return m ? m[0] : null;
}

function textoBuscable(p, contactos){
  const d = p.datos || {};
  let partes = [p.apellido, p.nombre, (p.nombre || '') + ' ' + (p.apellido || ''), d.anio, d.nota];
  partes = partes.concat(p.servicios || []);
  ['subespecialidades', 'equipos', 'sedesInforma'].forEach(function(k){ partes = partes.concat(d[k] || []); });
  partes = partes.concat((p.estudios || []).map(function(e){ return e.estudio; }));
  if(contactos){
    const cel = p.celular;
    partes = partes.concat([p.matricula, cel, String(cel || '').replace(/\D/g, ''), p.email]);
  }
  return partes.filter(Boolean).map(sinTildes).join(' ');
}

function ordenar(personas){
  function clave(p){ return (p.apellido || '') + ', ' + (p.nombre || ''); }
  return personas.slice().sort(function(a, b){
    const c = clave(a).localeCompare(clave(b), 'es', { sensitivity: 'base' });
    if(c) return c;
    const ia = a.id || '';
    const ib = b.id || '';
    return ia < ib ? -1 : (ia > ib ? 1 : 0);
  });
}

function coincide(p, consulta, contactos){
  const palabras = sinTildes(consulta).split(/\s+/).filter(Boolean);
  if(!palabras.length) return true;
  const texto = textoBuscable(p, contactos);
  return palabras.every(function(w){ return texto.indexOf(w) >= 0; });
}

function licenciaActiva(p, hoy){
  return (p.licencias || []).some(function(l){
    return l.desde <= hoy && (!l.hasta || l.hasta >= hoy);
  });
}

function filtrar(personas, f, hoy, contactos){
  const admitidos = { A: ['A', 'A+I'], I: ['I', 'A+I'] };
  const lista = [];
  let sinTipo = 0;
  personas.forEach(function(p){
    if(!coincide(p, f.consulta || '', contactos)) return;
    if(f.servicio && (p.servicios || []).indexOf(f.servicio) < 0) return;
    if(f.anio !== null && f.anio !== undefined && digitoAnio(p) !== String(f.anio)) return;
    if(f.conLicenciaHoy && !licenciaActiva(p, hoy)) return;
    if(f.estudio){
      const tipos = (p.estudios || []).filter(function(e){ return e.estudio === f.estudio; }).map(function(e){ return e.tipo_paciente; });
      if(!tipos.length) return;
      if(f.paciente !== null && f.paciente !== undefined){
        if(tipos.indexOf('?') >= 0) sinTipo += 1;
        const ok = tipos.some(function(t){ return (admitidos[f.paciente] || []).indexOf(t) >= 0; });
        if(!ok) return;
      }
    }
    lista.push(p);
  });
  return { lista: lista, sinTipo: sinTipo };
}

function opcionesServicio(personas, catalogoServicio){
  const usados = {};
  personas.forEach(function(p){ (p.servicios || []).forEach(function(s){ usados[s] = true; }); });
  return catalogoServicio.filter(function(s){ return usados[s] === true; });
}

function diasSemana(p, turnos){
  const dias = {};
  (p.horarios || []).forEach(function(x){ dias[x.dia] = true; });
  turnos.forEach(function(t){
    if(t.persona_id === p.id) dias[t.dia] = true;
    if((t.residentes || []).some(function(r){ return r.persona_id === p.id; })) dias[t.dia] = true;
  });
  return Object.keys(dias).map(Number).sort(function(a, b){ return a - b; });
}

function alertasContacto(p, contactos){
  if(!contactos) return [];
  function vacio(k){ return !String(p[k] === null || p[k] === undefined ? '' : p[k]).trim(); }
  const alertas = [];
  if(p.tipo !== 'administrativo' && vacio('matricula')) alertas.push('Falta matrícula');
  if(vacio('celular')) alertas.push('Falta celular');
  if(vacio('email')) alertas.push('Falta email');
  return alertas;
}

const TIPO_PACIENTE = { 'A': 'Ambulatorios', 'I': 'Internados', 'A+I': 'Ambos', '?': 'Sin especificar' };

function estadoLicencia(l, hoy){
  if(l.desde > hoy) return 'Próxima';
  if(!l.hasta || l.hasta >= hoy) return 'En curso';
  return 'Finalizada';
}

function fechaCorta(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
}

function agruparEstudios(estudios, catalogoEstudio, catalogoServicio){
  const grupoDe = Object.create(null);
  catalogoEstudio.forEach(function(e){ grupoDe[e.valor] = e.grupo; });
  const grupos = Object.create(null);
  estudios.forEach(function(e){
    const g = grupoDe[e.estudio] || 'Otros';
    if(!grupos[g]) grupos[g] = [];
    grupos[g].push({ estudio: e.estudio, tipo_paciente: e.tipo_paciente });
  });
  const conocidos = catalogoServicio.filter(function(g){ return g in grupos && g !== 'Otros'; });
  const desconocidos = Object.keys(grupos).filter(function(g){
    return catalogoServicio.indexOf(g) < 0 && g !== 'Otros';
  }).sort(function(a, b){ return a.localeCompare(b, 'es', { sensitivity: 'base' }); });
  const orden = conocidos.concat(desconocidos).concat('Otros' in grupos ? ['Otros'] : []);
  return orden.map(function(g){
    return {
      grupo: g,
      items: grupos[g].sort(function(a, b){
        const ta = sinTildes(a.estudio);
        const tb = sinTildes(b.estudio);
        if(ta !== tb) return ta < tb ? -1 : 1;
        return a.estudio < b.estudio ? -1 : (a.estudio > b.estudio ? 1 : 0);
      })
    };
  });
}

function cmp(a, b){
  return a < b ? -1 : (a > b ? 1 : 0);
}

function armarCronograma(turnos, medicos, residentes, hoy){
  const dias = DIAS_BASE.slice();
  [5, 6].forEach(function(extra){
    if(turnos.some(function(t){ return t.dia === extra; })) dias.push(extra);
  });
  const porMed = Object.create(null);
  medicos.forEach(function(m){ porMed[m.id] = m; });
  const porRes = Object.create(null);
  residentes.forEach(function(r){ porRes[r.id] = r; });
  const celdas = {};
  const fuera = [];
  turnos.slice().sort(function(a, b){
    return cmp(a.dia, b.dia) || cmp(a.cons, b.cons) || cmp(a.desde, b.desde) || cmp(a.id, b.id);
  }).forEach(function(t){
    const nombres = [];
    let licencia = false;
    let rotulo;
    if(t.es_residentes){
      rotulo = 'Residentes';
      const asignados = (t.residentes || []).filter(function(r){ return r.persona_id in porRes; }).map(function(r){ return porRes[r.persona_id]; });
      ordenar(asignados).forEach(function(r){
        const d = digitoAnio(r);
        nombres.push(d ? r.apellido + ' R' + d : r.apellido);
      });
    } else {
      const m = porMed[t.persona_id];
      rotulo = m ? m.apellido : '?';
      licencia = !!m && licenciaActiva(m, hoy);
    }
    const bloque = {
      id: t.id, cons: t.cons, desde: t.desde, hasta: t.hasta, residentes: !!t.es_residentes,
      persona_id: t.persona_id === undefined ? null : t.persona_id, rotulo: rotulo, nombres: nombres, licencia: licencia
    };
    const hora = parseInt(String(t.desde).slice(0, 2), 10);
    if(hora >= HORA_INI && hora < HORA_FIN){
      const k = t.dia + '-' + hora;
      if(!celdas[k]) celdas[k] = [];
      celdas[k].push(bloque);
    } else {
      fuera.push(bloque);
    }
  });
  const horas = [];
  for(let hh = HORA_INI; hh < HORA_FIN; hh++) horas.push(hh);
  return { dias: dias, horas: horas, celdas: celdas, fuera: fuera };
}

function armarInformantes(medicos, catalogoSubesp){
  function subesp(p){
    return ((p.datos || {}).subespecialidades || []).slice();
  }
  const elegidos = medicos.filter(function(m){
    return (m.servicios || []).some(function(s){ return sinTildes(s).indexOf('resonancia') >= 0; }) || subesp(m).length > 0;
  });
  const columnas = catalogoSubesp.map(function(c){
    return { titulo: c.valor, nota: c.nota === undefined ? null : c.nota };
  });
  const conocidas = {};
  columnas.forEach(function(c){ conocidas[c.titulo] = true; });
  const extras = {};
  elegidos.forEach(function(m){
    subesp(m).forEach(function(s){ if(conocidas[s] !== true) extras[s] = true; });
  });
  Object.keys(extras).sort(function(a, b){ return a.localeCompare(b, 'es', { sensitivity: 'base' }); }).forEach(function(e){
    columnas.push({ titulo: e, nota: null });
  });
  const resultado = columnas.map(function(c){
    const ids = ordenar(elegidos.filter(function(m){ return subesp(m).indexOf(c.titulo) >= 0; })).map(function(m){ return m.id; });
    return { titulo: c.titulo, nota: c.nota, ids: ids };
  });
  const sin = ordenar(elegidos.filter(function(m){ return !subesp(m).length; })).map(function(m){ return m.id; });
  if(sin.length) resultado.push({ titulo: 'Sin subespecialidad', nota: null, ids: sin });
  return resultado;
}

/* == DOM == */
function h(tag, attrs, hijos){
  const el = document.createElement(tag);
  if(attrs){
    Object.keys(attrs).forEach(function(k){
      const v = attrs[k];
      if(k === 'texto'){ el.textContent = v; return; }
      if(k.indexOf('on') === 0 || k === 'style') return;
      if(v === null || v === undefined || v === false) return;
      el.setAttribute(k, v === true ? '' : String(v));
    });
  }
  (hijos || []).forEach(function(c){
    if(c === null || c === undefined || c === false) return;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}

function vaciar(el){
  while(el.firstChild) el.removeChild(el.firstChild);
}

function estado(el, titulo, texto, esError){
  vaciar(el);
  el.classList.toggle('error', !!esError);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  ['viewBox:0 0 24 24', 'fill:none', 'stroke-width:1.6', 'stroke-linecap:round', 'stroke-linejoin:round', 'aria-hidden:true'].forEach(function(par){
    const i = par.indexOf(':');
    svg.setAttribute(par.slice(0, i), par.slice(i + 1));
  });
  const e = document.createElementNS(NS, 'ellipse');
  e.setAttribute('cx', '12'); e.setAttribute('cy', '6'); e.setAttribute('rx', '7'); e.setAttribute('ry', '2.6');
  svg.appendChild(e);
  ['M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6', 'M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6'].forEach(function(d){
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  });
  el.append(svg, h('h2', { texto: titulo }), h('p', { texto: texto }));
}

/* == datos == */
function err(c){
  const e = new Error(String(c));
  e.codigo = String(c);
  return e;
}

async function verificarIdentidad(){
  const hayCliente = !!(window.sbAuth && window.sbAuth.auth && typeof window.sbRpc === 'function');
  let authId = null;
  if(hayCliente){
    try{
      const r = await window.sbAuth.auth.getSession();
      authId = r && r.data && r.data.session && r.data.session.user ? r.data.session.user.id : null;
    }catch(e){ authId = null; }
  }
  const codigo = estadoIdentidad(hayCliente, authId, window.__img_user);
  E.identidadOk = codigo === 'OK';
  return codigo;
}

async function rpc(fn, args){
  if(!E.identidadOk) throw err('NO_IDENTIDAD');
  if(RPC_LECTURA.indexOf(fn) < 0) throw err('RPC_NO_PERMITIDA');
  let r;
  try{
    r = await window.sbRpc(fn, args || {});
  }catch(e){
    throw err('RED');
  }
  if(!r || r.ok !== true) throw err(r && r.error || 'RESPUESTA');
  return r;
}

function codigoDe(e){
  return e && e.codigo ? e.codigo : 'RESPUESTA';
}

function mensajeDe(c){
  return MENSAJES[c] || MENSAJES.RESPUESTA;
}

async function cargar(){
  E.cargando = true;
  E.errores = {};
  try{
    const a = await rpc('img_mi_acceso');
    E.nivel = a.nivel || null;
    const asignadas = Array.isArray(a.pestanas) ? a.pestanas : [];
    E.pestanas = TABS.filter(function(t){ return asignadas.indexOf(t) >= 0; });
    E.contactos = hayContactos(E.nivel);
  }catch(e){
    E.errores.acceso = codigoDe(e);
    E.pestanas = [];
    E.cargando = false;
    return;
  }
  const tareas = [rpc('img_catalogos')];
  E.pestanas.forEach(function(t){ tareas.push(rpc('img_listar', { p_tipo: TIPO_DE[t] })); });
  const conCrono = E.pestanas.indexOf('medicos') >= 0;
  if(conCrono) tareas.push(rpc('img_cronograma', { p_vista: 'eco' }));
  const res = await Promise.allSettled(tareas);
  if(res[0].status === 'fulfilled') E.catalogos = res[0].value.catalogos || null; else E.errores.catalogos = codigoDe(res[0].reason);
  E.pestanas.forEach(function(t, i){
    const x = res[i + 1];
    if(x.status === 'fulfilled') E.personas[t] = Array.isArray(x.value.personas) ? x.value.personas : [];
    else E.errores[t] = codigoDe(x.reason);
  });
  if(conCrono){
    const x = res[res.length - 1];
    if(x.status === 'fulfilled') E.turnos = Array.isArray(x.value.turnos) ? x.value.turnos : []; else E.errores.cronograma = codigoDe(x.reason);
  }
  E.cargando = false;
}

/* == vistas == */
const DIAS_LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS_NOMBRES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

function contenedor(tab, sub){
  return document.getElementById('v-' + (tab === 'medicos' ? sub : tab));
}

function filtrosDe(tab){
  if(!E.filtros[tab]) E.filtros[tab] = { servicio: null, anio: null, estudio: null, paciente: null, conLicenciaHoy: false };
  return E.filtros[tab];
}

function resultadoDe(tab){
  const f = filtrosDe(tab);
  return filtrar(E.personas[tab] || [], {
    consulta: E.consulta, servicio: f.servicio, anio: f.anio, estudio: f.estudio, paciente: f.paciente, conLicenciaHoy: f.conLicenciaHoy
  }, E.hoy, E.contactos);
}

function textoCuenta(n){
  return n + (n === 1 ? ' persona' : ' personas');
}

function sincronizarBarra(tab){
  const r = REFS[tab];
  if(!r) return;
  const f = filtrosDe(tab);
  if(r.input.value !== E.consulta) r.input.value = E.consulta;
  if(r.selServ) r.selServ.value = f.servicio || '';
  if(r.selAnio) r.selAnio.value = f.anio ? String(f.anio) : '';
  if(r.selEst) r.selEst.value = f.estudio || '';
  if(r.selPac){
    r.selPac.hidden = !f.estudio;
    r.selPac.value = f.paciente || '';
  }
  r.btnLic.setAttribute('aria-pressed', f.conLicenciaHoy ? 'true' : 'false');
  r.btnTabla.setAttribute('aria-pressed', E.vista === 'tabla' ? 'true' : 'false');
  r.btnTarj.setAttribute('aria-pressed', E.vista === 'tarjetas' ? 'true' : 'false');
}

function sincronizarBarras(){
  Object.keys(REFS).forEach(sincronizarBarra);
}

function pintarContadores(){
  TABS.forEach(function(k){
    if(E.pestanas.indexOf(k) < 0) return;
    const t = document.getElementById('t-' + k);
    const n = t.querySelector('.n');
    const lista = E.personas[k];
    if(!lista){
      if(n) n.textContent = '—';
      t.classList.remove('atenuada');
      return;
    }
    const c = lista.filter(function(p){ return coincide(p, E.consulta, E.contactos); }).length;
    if(n) n.textContent = String(c);
    t.classList.toggle('atenuada', c === 0);
  });
}

function opcion(valor, texto){
  return h('option', { value: valor, texto: texto });
}

function selector(etiqueta, primera, valores, alElegir){
  const hijos = [opcion('', primera)].concat(valores.map(function(v){ return opcion(v.valor, v.texto); }));
  const s = h('select', { 'aria-label': etiqueta }, hijos);
  s.addEventListener('change', function(){ alElegir(s.value); });
  return s;
}

function boton(texto, clase, alClic){
  const b = h('button', { type: 'button', class: clase, 'aria-pressed': 'false', texto: texto });
  b.addEventListener('click', alClic);
  return b;
}

function guardarVista(v){
  E.vista = v;
  try{ localStorage.setItem('img_vista', v); }catch(e){}
}

function construirBarra(tab, cont){
  vaciar(cont);
  const cat = E.catalogos || {};
  const lista = E.personas[tab] || [];
  const f = filtrosDe(tab);
  const r = { tab: tab };
  function alCambiar(){
    sincronizarBarras();
    pintarResultados(tab);
    pintarContadores();
  }
  r.input = h('input', {
    type: 'search',
    class: 'buscar',
    placeholder: 'Buscar en todo el personal: nombre, ' + (E.contactos ? 'matrícula, ' : '') + 'servicio o estudio',
    'aria-label': 'Buscar en todo el personal'
  });
  r.input.addEventListener('input', function(){
    E.consulta = r.input.value;
    pintarResultados(tab);
    pintarContadores();
  });
  const tool = [r.input];
  if(tab === 'medicos' || tab === 'tecnicos'){
    r.selServ = selector('Servicio', 'Todos los servicios', opcionesServicio(lista, cat.servicio || []).map(function(s){ return { valor: s, texto: s }; }), function(v){
      f.servicio = v || null;
      alCambiar();
    });
    tool.push(r.selServ);
  }
  if(tab === 'residentes'){
    r.selAnio = selector('Año', 'Todos los años', ANIOS.map(function(n){ return { valor: String(n), texto: n + 'º año' }; }), function(v){
      f.anio = v ? Number(v) : null;
      alCambiar();
    });
    tool.push(r.selAnio);
  }
  if(tab === 'medicos'){
    const estudios = (cat.estudio || []).map(function(e){ return e.valor; }).sort(function(a, b){
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });
    const grupos = agruparEstudios(estudios.map(function(e){ return { estudio: e, tipo_paciente: '?' }; }), cat.estudio || [], cat.servicio || []);
    r.selEst = h('select', { 'aria-label': '¿Quién hace este estudio?' }, [opcion('', '¿Quién hace este estudio?')].concat(grupos.map(function(g){
      return h('optgroup', { label: g.grupo }, g.items.map(function(i){ return opcion(i.estudio, i.estudio); }));
    })));
    r.selEst.addEventListener('change', function(){
      f.estudio = r.selEst.value || null;
      if(!f.estudio) f.paciente = null;
      alCambiar();
    });
    r.selPac = selector('Tipo de paciente', 'Todos los pacientes', [{ valor: 'A', texto: 'Ambulatorios' }, { valor: 'I', texto: 'Internados' }], function(v){
      f.paciente = v || null;
      alCambiar();
    });
    r.selPac.hidden = true;
    r.aux = h('span', { class: 'aux' });
    r.aux.hidden = true;
    tool.push(r.selEst, r.selPac, r.aux);
  }
  r.btnLic = boton('Con licencia hoy', 'btn-chip', function(){
    f.conLicenciaHoy = !f.conLicenciaHoy;
    alCambiar();
  });
  r.btnLimpiar = boton('Limpiar filtros', 'btn-chip', function(){
    E.consulta = '';
    Object.assign(f, { servicio: null, anio: null, estudio: null, paciente: null, conLicenciaHoy: false });
    alCambiar();
  });
  r.btnLimpiar.removeAttribute('aria-pressed');
  r.btnTabla = boton('Tabla', '', function(){ guardarVista('tabla'); sincronizarBarras(); pintarResultados(tab); });
  r.btnTarj = boton('Tarjetas', '', function(){ guardarVista('tarjetas'); sincronizarBarras(); pintarResultados(tab); });
  r.cont = h('span', { class: 'cont', 'aria-live': 'polite' });
  tool.push(r.btnLic, r.btnLimpiar, h('div', { class: 'seg', role: 'group', 'aria-label': 'Vista' }, [r.btnTabla, r.btnTarj]), r.cont);
  r.resultados = h('div', { class: 'resultados' });
  cont.append(h('div', { class: 'tool', role: 'search' }, tool), r.resultados);
  REFS[tab] = r;
  sincronizarBarra(tab);
}

function iniciales(p){
  return ((p.nombre || '').charAt(0) + (p.apellido || '').charAt(0)).toUpperCase();
}

function avatar(p){
  const a = h('span', { class: 'av', 'aria-hidden': 'true', texto: iniciales(p) });
  const base = (p.nombre || '') + ' ' + (p.apellido || '');
  let suma = 0;
  for(let i = 0; i < base.length; i++) suma += base.charCodeAt(i);
  a.style.background = 'hsl(' + ((suma * 37) % 360) + ' 70% 70%)';
  return a;
}

function nombreLista(p){
  return (p.apellido || '') + ', ' + (p.nombre || '');
}

function etiquetas(p){
  return (p.servicios || []).map(function(s){ return h('span', { class: 'tag', texto: s }); });
}

function pillLicencia(p){
  return licenciaActiva(p, E.hoy) ? h('span', { class: 'pill lic', texto: 'Licencia' }) : null;
}

function semanaMini(p){
  const dias = diasSemana(p, E.turnos);
  const cuenta = DIAS_LETRAS.map(function(l, i){ return { l: l, i: i }; }).filter(function(x){
    return x.i < 5 || dias.indexOf(x.i) >= 0;
  });
  const nombres = dias.map(function(d){ return DIAS_NOMBRES[d]; }).filter(Boolean);
  return h('span', { class: 'mini', role: 'img', 'aria-label': nombres.length ? 'Días: ' + nombres.join(', ') : 'Sin días cargados' },
    cuenta.map(function(x){ return h('span', { class: dias.indexOf(x.i) >= 0 ? 'si' : '', texto: x.l }); }));
}

/* == ficha == */
const FICHA = { velo: null, panel: null, cuerpo: null, cerrar: null, origen: null };
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CLASE_TIPO = { 'A': 'a', 'I': 'i', 'A+I': 'ai', '?': 'q' };
const CLASE_ESTADO = { 'Próxima': 'prox', 'En curso': 'curso', 'Finalizada': 'fin' };

function focosFicha(){
  return Array.prototype.slice.call(FICHA.panel.querySelectorAll('button, [href], input, select, [tabindex]')).filter(function(el){
    return el.tabIndex >= 0 && !el.disabled;
  });
}

function cerrarFicha(){
  if(!FICHA.velo || FICHA.velo.hidden) return;
  FICHA.velo.hidden = true;
  document.documentElement.classList.remove('ficha-abierta');
  const o = FICHA.origen;
  FICHA.origen = null;
  if(o && document.contains(o) && typeof o.focus === 'function') o.focus();
}

function teclasFicha(ev){
  if(!FICHA.velo || FICHA.velo.hidden) return;
  if(ev.key === 'Escape'){
    ev.preventDefault();
    cerrarFicha();
    return;
  }
  if(ev.key !== 'Tab') return;
  const f = focosFicha();
  if(!f.length){
    ev.preventDefault();
    FICHA.panel.focus();
    return;
  }
  const a = document.activeElement;
  const primero = f[0];
  const ultimo = f[f.length - 1];
  if(!FICHA.panel.contains(a)){
    ev.preventDefault();
    primero.focus();
  } else if(ev.shiftKey && (a === primero || a === FICHA.panel)){
    ev.preventDefault();
    ultimo.focus();
  } else if(!ev.shiftKey && a === ultimo){
    ev.preventDefault();
    primero.focus();
  }
}

function asegurarFicha(){
  if(FICHA.velo) return;
  FICHA.cerrar = h('button', { type: 'button', class: 'ficha-x', 'aria-label': 'Cerrar ficha', texto: '✕' });
  FICHA.cerrar.addEventListener('click', cerrarFicha);
  FICHA.cuerpo = h('div', { class: 'ficha-cuerpo' });
  FICHA.panel = h('aside', { class: 'ficha', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ficha-titulo', tabindex: '-1' }, [FICHA.cerrar, FICHA.cuerpo]);
  FICHA.velo = h('div', { class: 'velo', hidden: true }, [FICHA.panel]);
  FICHA.velo.addEventListener('click', function(ev){
    if(ev.target === FICHA.velo) cerrarFicha();
  });
  document.addEventListener('keydown', teclasFicha);
  document.body.append(FICHA.velo);
}

function buscarPersona(id){
  for(let i = 0; i < E.pestanas.length; i++){
    const lista = E.personas[E.pestanas[i]] || [];
    for(let j = 0; j < lista.length; j++){
      if(lista[j].id === id) return lista[j];
    }
  }
  return null;
}

function rangoHora(x){
  return String(x.desde || '').slice(0, 5) + '–' + String(x.hasta || '').slice(0, 5);
}

function seccion(titulo, hijos){
  return h('section', { class: 'sec' }, [h('h3', { texto: titulo })].concat(hijos));
}

function listaDatos(filas){
  const dl = h('dl', { class: 'dl' });
  filas.forEach(function(f){
    dl.append(h('dt', { texto: f[0] }), typeof f[1] === 'string' ? h('dd', { texto: f[1] }) : h('dd', {}, f[1]));
  });
  return dl;
}

function semanaFicha(items){
  const dias = [0, 1, 2, 3, 4];
  [5, 6].forEach(function(d){
    if(items.some(function(x){ return x.dia === d; })) dias.push(d);
  });
  const g = h('div', { class: 'sem', role: 'list' }, dias.map(function(d){
    const del = items.filter(function(x){ return x.dia === d; }).sort(function(a, b){
      return a.desde < b.desde ? -1 : (a.desde > b.desde ? 1 : 0);
    });
    return h('div', { class: del.length ? 'si' : '', role: 'listitem' },
      [h('b', { texto: DIAS_CORTOS[d] })].concat(del.map(function(x){ return h('span', { texto: x.texto }); })));
  }));
  g.style.setProperty('--dias', String(dias.length));
  return g;
}

function itemsHorario(p, clase){
  return (p.horarios || []).filter(function(x){ return x.clase === clase; }).map(function(x){
    return { dia: Number(x.dia), desde: String(x.desde || ''), texto: rangoHora(x) };
  });
}

function seccionDatos(p){
  const filas = [];
  if(E.contactos){
    filas.push(['Celular', p.celular || '—'], ['Email', p.email || '—']);
    if(p.tipo !== 'administrativo') filas.push(['Matrícula', p.matricula || '—']);
  }
  const anio = (p.datos || {}).anio;
  if(p.tipo === 'residente' && anio) filas.push(['Año', String(anio)]);
  return filas.length ? seccion('Datos', [listaDatos(filas)]) : null;
}

function seccionAgenda(p){
  if(p.tipo === 'medico'){
    const items = itemsHorario(p, 'agenda');
    E.turnos.forEach(function(t){
      if(t.persona_id === p.id) items.push({ dia: Number(t.dia), desde: String(t.desde || ''), texto: 'Eco C' + t.cons + ' ' + rangoHora(t) });
    });
    return seccion('Agenda semanal', [items.length ? semanaFicha(items) : h('p', { class: 'nota', texto: p.tiene_agenda ? 'Sí, sin horarios cargados' : 'Sin agenda' })]);
  }
  if(p.tipo === 'administrativo'){
    const items = itemsHorario(p, 'trabajo');
    return seccion('Horarios de trabajo', [items.length ? semanaFicha(items) : h('p', { class: 'nota', texto: 'Sin horarios cargados' })]);
  }
  return null;
}

function seccionInformes(p){
  if(p.tipo !== 'medico') return null;
  const d = p.datos || {};
  const filas = [];
  function tags(arr){ return arr.map(function(x){ return h('span', { class: 'tag', texto: x }); }); }
  [['Subespecialidad', 'subespecialidades'], ['Equipos', 'equipos'], ['Sedes que informa', 'sedesInforma']].forEach(function(par){
    const arr = Array.isArray(d[par[1]]) ? d[par[1]] : [];
    if(arr.length) filas.push([par[0], tags(arr)]);
  });
  if(d.nota) filas.push(['Nota', String(d.nota)]);
  return filas.length ? seccion('Informes', [listaDatos(filas)]) : null;
}

function seccionEstudios(p){
  if(p.tipo !== 'medico' || !(p.estudios || []).length) return null;
  const cat = E.catalogos || {};
  const grupos = agruparEstudios(p.estudios, cat.estudio || [], cat.servicio || []);
  const hijos = [];
  grupos.forEach(function(g){
    hijos.push(h('h4', { texto: g.grupo }));
    hijos.push(h('div', { class: 'tags' }, g.items.map(function(i){
      const t = TIPO_PACIENTE[i.tipo_paciente] ? i.tipo_paciente : '?';
      return h('span', { class: 'tag', title: TIPO_PACIENTE[t] }, [i.estudio + ' · ', h('span', { class: 'pill tp tp-' + CLASE_TIPO[t], texto: t })]);
    })));
  });
  return seccion('Estudios que realiza (' + p.estudios.length + ')', hijos);
}

function seccionLicencias(p){
  const ls = (p.licencias || []).slice().sort(function(a, b){
    return a.desde < b.desde ? 1 : (a.desde > b.desde ? -1 : 0);
  });
  if(!ls.length) return seccion('Licencias', [h('p', { class: 'nota', texto: 'Sin licencias registradas' })]);
  return seccion('Licencias', [h('ul', { class: 'lics' }, ls.map(function(l){
    const est = estadoLicencia(l, E.hoy);
    const fechas = l.hasta ? fechaCorta(l.desde) + ' – ' + fechaCorta(l.hasta) : 'desde ' + fechaCorta(l.desde);
    return h('li', {}, [h('span', { class: 'lic-t', texto: l.tipo || '' }), h('span', { class: 'lic-f', texto: fechas }), h('span', { class: 'pill est est-' + CLASE_ESTADO[est], texto: est })]);
  }))]);
}

function contenidoFicha(p){
  const etiq = etiquetas(p);
  if(p.tipo === 'residente' && (p.datos || {}).anio) etiq.push(h('span', { class: 'tag', texto: String(p.datos.anio) }));
  const cab = h('header', { class: 'ficha-cab' }, [avatar(p), h('div', { class: 'ficha-id' }, [
    h('h2', { id: 'ficha-titulo', texto: (p.nombre || '') + ' ' + (p.apellido || '') }),
    h('div', { class: 'tags' }, etiq)
  ])]);
  return [cab, seccionDatos(p), seccionAgenda(p), seccionInformes(p), seccionEstudios(p), seccionLicencias(p), h('p', { class: 'pie', texto: 'Solo lectura.' })];
}

function abrirFicha(id){
  asegurarFicha();
  const p = buscarPersona(id);
  vaciar(FICHA.cuerpo);
  if(p){
    contenidoFicha(p).forEach(function(n){ if(n) FICHA.cuerpo.append(n); });
  } else {
    FICHA.cuerpo.append(h('h2', { id: 'ficha-titulo', texto: 'Ficha' }), h('p', { class: 'nota', texto: MENSAJES.NO_EXISTE }), h('p', { class: 'pie', texto: 'Solo lectura.' }));
  }
  if(FICHA.velo.hidden){
    FICHA.origen = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    FICHA.velo.hidden = false;
    document.documentElement.classList.add('ficha-abierta');
  }
  FICHA.panel.scrollTop = 0;
  FICHA.cerrar.focus();
}

function filaTabla(tab, p){
  const celdas = [h('td', {}, [avatar(p), h('span', { class: 'nom', texto: nombreLista(p) }), pillLicencia(p)])];
  if(tab === 'residentes') celdas.push(h('td', { texto: (p.datos || {}).anio ? String(p.datos.anio) : '—' }));
  else if(tab !== 'administrativos') celdas.push(h('td', {}, etiquetas(p)));
  if(E.contactos){
    if(tab !== 'administrativos') celdas.push(h('td', { class: 'col-x', texto: p.matricula || '' }));
    celdas.push(h('td', { class: 'col-x', texto: p.celular || '' }), h('td', { class: 'col-x', texto: p.email || '' }));
  }
  celdas.push(h('td', {}, [semanaMini(p)]));
  const tr = h('tr', { class: 'fila', tabindex: '0', 'data-id': p.id }, celdas);
  tr.addEventListener('click', function(){ abrirFicha(p.id); });
  tr.addEventListener('keydown', function(ev){
    if(ev.key === 'Enter'){ ev.preventDefault(); abrirFicha(p.id); }
  });
  return tr;
}

function tablaDe(tab, lista){
  const cab = [h('th', { scope: 'col', texto: 'Nombre' })];
  if(tab === 'residentes') cab.push(h('th', { scope: 'col', texto: 'Año' }));
  else if(tab !== 'administrativos') cab.push(h('th', { scope: 'col', texto: 'Servicios' }));
  if(E.contactos){
    if(tab !== 'administrativos') cab.push(h('th', { scope: 'col', class: 'col-x', texto: 'Matrícula' }));
    cab.push(h('th', { scope: 'col', class: 'col-x', texto: 'Celular' }), h('th', { scope: 'col', class: 'col-x', texto: 'Email' }));
  }
  cab.push(h('th', { scope: 'col', texto: 'Semana' }));
  return h('div', { class: 'tabla-wrap' }, [h('table', {}, [
    h('thead', {}, [h('tr', {}, cab)]),
    h('tbody', {}, lista.map(function(p){ return filaTabla(tab, p); }))
  ])]);
}

function tarjetaDe(p){
  const hijos = [
    h('span', { class: 'tj-cab' }, [avatar(p), h('span', { class: 'nom', texto: nombreLista(p) })]),
    h('span', { class: 'tj-tags' }, etiquetas(p).concat([pillLicencia(p)])),
    h('span', { class: 'tj-d' }, [semanaMini(p)])
  ];
  if(E.contactos && p.celular) hijos.push(h('span', { class: 'tj-d', texto: p.celular }));
  const b = h('button', { type: 'button', class: 'tj', 'data-id': p.id }, hijos);
  b.addEventListener('click', function(){ abrirFicha(p.id); });
  return b;
}

function pintarResultados(tab){
  const r = REFS[tab];
  if(!r) return;
  vaciar(r.resultados);
  if(E.errores[tab]){
    r.resultados.append(h('div', { class: 'vacio error' }, [h('p', { texto: mensajeDe(E.errores[tab]) })]));
    return;
  }
  const res = resultadoDe(tab);
  const lista = ordenar(res.lista);
  const total = (E.personas[tab] || []).length;
  r.cont.textContent = lista.length === total ? textoCuenta(total) : lista.length + ' de ' + total;
  if(r.aux){
    r.aux.hidden = !(res.sinTipo > 0);
    r.aux.textContent = res.sinTipo > 0 ? res.sinTipo + ' más lo hacen sin tipo de paciente definido' : '';
  }
  if(!lista.length){
    r.resultados.append(h('div', { class: 'vacio' }, [h('p', { texto: 'Ninguna persona coincide con la búsqueda y los filtros.' })]));
    return;
  }
  if(E.vista === 'tarjetas') r.resultados.append(h('div', { class: 'grid' }, lista.map(tarjetaDe)));
  else r.resultados.append(tablaDe(tab, lista));
}

/* == cronograma e informantes == */
const DIAS_ENCAB = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

function dosDig(n){
  return (n < 10 ? '0' : '') + n;
}

function bloqueCrono(b, cantidad){
  const clase = b.residentes ? 'res' : (b.cons === 2 ? 'c2' : 'c1');
  const hijos = [];
  if(b.residentes){
    hijos.push(h('b', { texto: 'Residentes · C' + b.cons }));
    hijos.push(h('small', { texto: rangoHora(b) }));
    const n = b.nombres.length || cantidad;
    if(b.nombres.length) hijos.push(h('small', { class: 'res-lista', texto: b.nombres.join(', ') }));
    hijos.push(h('small', { texto: n + (n === 1 ? ' residente' : ' residentes') }));
    return h('div', { class: 'blk ' + clase }, hijos);
  }
  hijos.push(h('b', { texto: b.rotulo + ' · C' + b.cons }));
  hijos.push(h('small', { texto: rangoHora(b) }));
  if(b.licencia) hijos.push(h('span', { class: 'pill lic', texto: 'Licencia' }));
  const abre = b.persona_id !== null && buscarPersona(b.persona_id) !== null;
  const el = h('div', abre ? { class: 'blk ' + clase + ' abre', role: 'button', tabindex: '0' } : { class: 'blk ' + clase }, hijos);
  if(abre){
    el.addEventListener('click', function(){ abrirFicha(b.persona_id); });
    el.addEventListener('keydown', function(ev){
      if(ev.key === 'Enter'){ ev.preventDefault(); abrirFicha(b.persona_id); }
    });
  }
  return el;
}

function pintarCronograma(el){
  vaciar(el);
  const c = armarCronograma(E.turnos, E.personas.medicos || [], E.personas.residentes || [], E.hoy);
  const cantidad = Object.create(null);
  const diaDe = Object.create(null);
  E.turnos.forEach(function(t){
    cantidad[t.id] = (t.residentes || []).length;
    diaDe[t.id] = t.dia;
  });
  const rango = 'Lun a Vie · ' + HORA_INI + ' a ' + HORA_FIN + ' h' + (c.dias.indexOf(5) >= 0 ? ' · Sáb' : '') + (c.dias.indexOf(6) >= 0 ? ' · Dom' : '');
  function item(clase, texto){
    return h('span', {}, [h('i', { class: clase }), texto]);
  }
  el.append(h('div', { class: 'leg' }, [
    item('c1', 'Consultorio Eco/Doppler ' + CONSULTORIOS[0]),
    item('c2', 'Consultorio Eco/Doppler ' + CONSULTORIOS[1]),
    item('res', 'Residentes'),
    h('span', { texto: rango })
  ]));
  const celdas = [h('div', { class: 'h' })];
  c.dias.forEach(function(d){ celdas.push(h('div', { class: 'h', texto: DIAS_ENCAB[d] })); });
  c.horas.forEach(function(hh){
    celdas.push(h('div', { class: 'h', texto: dosDig(hh) + ':00' }));
    c.dias.forEach(function(d){
      celdas.push(h('div', { class: 'celda' }, (c.celdas[d + '-' + hh] || []).map(function(b){ return bloqueCrono(b, cantidad[b.id] || 0); })));
    });
  });
  const grilla = h('div', { class: 'crono', 'aria-label': 'Cronograma Eco/Doppler' }, celdas);
  grilla.style.setProperty('--dias', String(c.dias.length));
  el.append(h('div', { class: 'crono-wrap' }, [grilla]));
  if(!E.turnos.length) el.append(h('p', { class: 'nota-vista', texto: 'El cronograma todavía no tiene turnos cargados.' }));
  if(c.fuera.length){
    el.append(h('section', { class: 'fuera' }, [
      h('h3', { texto: 'Fuera de ' + HORA_INI + ' a ' + HORA_FIN + ' h' }),
      h('ul', {}, c.fuera.map(function(b){
        const dia = DIAS_CORTOS[diaDe[b.id]] || '';
        const quien = b.residentes ? 'Residentes' + (b.nombres.length ? ': ' + b.nombres.join(', ') : '') : b.rotulo;
        return h('li', { texto: dia + ' ' + rangoHora(b) + ' · C' + b.cons + ' · ' + quien });
      }))
    ]));
  }
}

function pintarInformantes(el){
  vaciar(el);
  const medicos = E.personas.medicos || [];
  const cat = E.catalogos || {};
  const cols = armarInformantes(medicos, cat.subespecialidad || []);
  const porId = Object.create(null);
  medicos.forEach(function(m){ porId[m.id] = m; });
  const unicos = Object.create(null);
  cols.forEach(function(c){ c.ids.forEach(function(id){ unicos[id] = true; }); });
  const n = Object.keys(unicos).length;
  el.append(h('p', { class: 'resumen', texto: n + (n === 1 ? ' informante' : ' informantes') + ' de Resonancia' }));
  el.append(h('div', { class: 'cols' }, cols.map(function(c){
    const hijos = [h('h3', {}, [c.titulo.toUpperCase(), h('span', { texto: String(c.ids.length) })])];
    if(c.nota) hijos.push(h('p', { class: 'col-nota', texto: c.nota }));
    if(!c.ids.length) hijos.push(h('p', { class: 'col-nota', texto: 'Sin médicos' }));
    c.ids.forEach(function(id){
      const p = porId[id];
      if(!p) return;
      const d = p.datos || {};
      const pills = [];
      (d.equipos || []).forEach(function(x){ pills.push(h('span', { class: 'tag', texto: x })); });
      (d.sedesInforma || []).forEach(function(x){ pills.push(h('span', { class: 'tag sede', texto: x })); });
      if(licenciaActiva(p, E.hoy)) pills.push(h('span', { class: 'pill lic', texto: 'De licencia' }));
      alertasContacto(p, E.contactos).forEach(function(a){ pills.push(h('span', { class: 'pill alerta', texto: a })); });
      const partes = [h('b', { texto: nombreLista(p) })];
      if(pills.length) partes.push(h('span', { class: 'med-tags' }, pills));
      if(d.nota) partes.push(h('small', { texto: String(d.nota) }));
      const b = h('button', { type: 'button', class: 'med', 'data-id': p.id }, partes);
      b.addEventListener('click', function(){ abrirFicha(p.id); });
      hijos.push(b);
    });
    return h('div', { class: 'col' }, hijos);
  })));
}

function pintarVista(tab, sub){
  const el = contenedor(tab, sub);
  if(!el) return;
  const clave = tab === 'medicos' && sub === 'eco' ? 'cronograma' : tab;
  const listado = tab !== 'medicos' || sub === 'staff';
  if(E.errores[clave]){
    if(listado) delete REFS[tab];
    estado(el, 'NO SE PUDO LEER', mensajeDe(E.errores[clave]), true);
    return;
  }
  if(tab === 'medicos' && sub === 'eco'){
    pintarCronograma(el);
    return;
  }
  if(tab === 'medicos' && sub === 'rm'){
    pintarInformantes(el);
    return;
  }
  if(!listado){
    const n = (E.personas[tab] || []).length;
    estado(el, TITULOS[tab].toUpperCase(), n + ' personas');
    return;
  }
  if(!REFS[tab]) construirBarra(tab, el);
  sincronizarBarra(tab);
  pintarResultados(tab);
}

function render(){
  const r = resolverHash(location.hash, E.pestanas);
  if(r === null) return;
  if(hashDe(r) !== location.hash) history.replaceState(null, '', hashDe(r));
  TABS.forEach(function(k){
    const t = document.getElementById('t-' + k);
    const p = document.getElementById('tab-' + k);
    const asignada = E.pestanas.indexOf(k) >= 0;
    const activa = asignada && k === r.tab;
    t.hidden = !asignada;
    t.setAttribute('aria-selected', activa ? 'true' : 'false');
    t.tabIndex = activa ? 0 : -1;
    p.hidden = !activa;
  });
  pintarContadores();
  SUBS.forEach(function(k){
    const a = document.querySelector('.subtabs a[href="#medicos/' + k + '"]');
    const d = document.getElementById('sub-' + k);
    const activa = r.tab === 'medicos' && k === r.sub;
    if(activa) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    d.hidden = !activa;
  });
  pintarVista(r.tab, r.sub);
  document.title = TITULOS[r.tab] + ' · ' + BASE;
}

/* == arranque == */
function ocultarTodo(){
  document.querySelector('[role="tablist"]').hidden = true;
  TABS.forEach(function(k){ document.getElementById('tab-' + k).hidden = true; });
}

function avisar(titulo, texto, esError){
  const av = document.getElementById('aviso');
  estado(av, titulo, texto, esError);
  av.hidden = false;
}

function teclasTablist(ev){
  const ps = E.pestanas;
  if(!ps.length) return;
  const k = ev.key;
  if(k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
  const r = resolverHash(location.hash, ps);
  const i = Math.max(0, ps.indexOf(r ? r.tab : ps[0]));
  let n;
  if(k === 'Home') n = 0;
  else if(k === 'End') n = ps.length - 1;
  else n = (i + (k === 'ArrowRight' ? 1 : ps.length - 1)) % ps.length;
  ev.preventDefault();
  location.hash = '#' + ps[n];
  document.getElementById('t-' + ps[n]).focus();
}

function pintarModo(){
  const chip = document.getElementById('modo-chip');
  if(NIVELES_SOLO_LECTURA.indexOf(E.nivel) >= 0){
    chip.textContent = 'Solo lectura';
    document.documentElement.dataset.modo = 'view';
  } else {
    chip.textContent = '';
  }
}

function hoyLocal(){
  const d = new Date();
  function dos(n){ return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
}

async function iniciar(){
  const user = window.__img_user;
  E.hoy = hoyLocal();
  try{ E.vista = localStorage.getItem('img_vista') === 'tarjetas' ? 'tarjetas' : 'tabla'; }catch(e){ E.vista = 'tabla'; }
  document.getElementById('ses-chip').textContent = user.nombre || user.username || '';

  const btn = document.getElementById('tema-btn');
  function pintarBoton(){
    const claro = document.documentElement.dataset.tema === 'claro';
    btn.setAttribute('aria-pressed', claro ? 'true' : 'false');
    btn.setAttribute('aria-label', claro ? 'Tema claro' : 'Tema oscuro');
    btn.title = claro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';
  }
  btn.addEventListener('click', function(){
    const t = document.documentElement.dataset.tema === 'claro' ? 'oscuro' : 'claro';
    document.documentElement.dataset.tema = t;
    try{ localStorage.setItem('img_tema', t); }catch(e){}
    pintarBoton();
  });
  pintarBoton();

  window.addEventListener('hashchange', render);
  document.querySelector('[role="tablist"]').addEventListener('keydown', teclasTablist);

  const codigo = await verificarIdentidad();
  if(codigo !== 'OK'){
    ocultarTodo();
    avisar('SIN CONEXIÓN SEGURA', mensajeDe(codigo), true);
    return;
  }
  avisar('CARGANDO', 'Cargando…', false);
  await cargar();
  pintarModo();
  if(E.errores.acceso){
    ocultarTodo();
    avisar('NO SE PUDO LEER', mensajeDe(E.errores.acceso), true);
    return;
  }
  if(!E.pestanas.length){
    ocultarTodo();
    avisar('SIN PESTAÑAS', 'No tenés pestañas asignadas en este módulo.', false);
    return;
  }
  document.getElementById('aviso').hidden = true;
  document.querySelector('[role="tablist"]').hidden = false;
  render();
}

iniciar();
})();
