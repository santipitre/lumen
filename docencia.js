/* Docencia - Dashboard Imágenes H.Italiano (Lumen).
 * Módulo montado por imagenes.js en la pestaña #docencia. Contenido: RPC doc_contenido (tabla docencia_contenido, Supabase).
 * Mismo orden que la Plataforma Docente DxI: Explorar (Inicio, Estoy informando, Urgencias, Herramientas, Fichas, Protocolos),
 * Áreas (7) y Residencia (Clases, Cronograma, Material docente).
 * Todo texto de la base entra al DOM con textContent (nunca como HTML). Rutas: #docencia/<sub> con sub de un solo tramo [a-z0-9-]. */
(function(){
'use strict';
if(!window.__img_user) return;

/* == constantes == */
const EXPLORAR = [
  { sub: 'inicio',       txt: 'Inicio',            ic: 'capas' },
  { sub: 'ahora',        txt: 'Estoy informando',  ic: 'pulso' },
  { sub: 'urgencias',    txt: 'Urgencias',         ic: 'alerta' },
  { sub: 'herramientas', txt: 'Herramientas',      ic: 'calc' },
  { sub: 'fichas',       txt: 'Fichas docentes',   ic: 'libro' },
  { sub: 'protocolos',   txt: 'Protocolos',        ic: 'hoja' }
];
const AREAS_BASE = ['Neuro', 'Tórax', 'Abdomen y pelvis', 'Vascular', 'Musculoesquelético', 'Cabeza y cuello', 'Columna'];
const RESIDENCIA = [
  { sub: 'clases',     txt: 'Clases',           ic: 'gorro' },
  { sub: 'cronograma', txt: 'Cronograma',       ic: 'cal' },
  { sub: 'material',   txt: 'Material docente', ic: 'carpeta' }
];
const NOMBRE_TOOL = { aspects: 'ASPECTS', 'pc-aspects': 'pc-ASPECTS', fisher: 'Fisher modificada', abc2: 'ABC/2', 'linea-media': 'Línea media' };
const CALCULADORAS = ['aspects', 'pc-aspects'];
const KIND_SEC = {
  intro:  { cls: 'intro',  rot: null },
  main:   { cls: 'main',   rot: null },
  safety: { cls: 'safety', rot: 'Antes de cerrar' },
  urgent: { cls: 'urgent', rot: 'Comunicación' },
  error:  { cls: 'error',  rot: 'Error frecuente' },
  deep:   { cls: 'deep',   rot: 'Para profundizar' }
};
const VISTAS = [
  { k: 'quick', txt: 'Guía rápida',        ic: 'pulso' },
  { k: 'det',   txt: 'Análisis detallado', ic: 'lupa' },
  { k: 'learn', txt: 'Aprendizaje',        ic: 'libro' },
  { k: 'prot',  txt: 'Protocolos',         ic: 'hoja' }
];

/* == estado == */
const D = { promesa: null, datos: null, error: null, modalidad: '', consulta: '', areaFicha: '', vista: {}, previo: null, actual: null, el: null, puente: null };

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
function vaciar(el){ while(el.firstChild) el.removeChild(el.firstChild); }

/* Íconos: trazos fijos del código (nunca datos de la base) */
const IC = {
  capas:   ['M12 3 3 8l9 5 9-5-9-5Z', 'm3 13 9 5 9-5', 'm3 17.5 9 5 9-5'],
  pulso:   ['M3 12h4l3-8 4 16 3-8h4'],
  alerta:  ['M12 3 2 20h20L12 3Z', 'M12 10v4', 'M12 17h.01'],
  calc:    ['M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z', 'M8 7h8', 'M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01M16 18h.01'],
  libro:   ['M3 5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2H3V5Z', 'M21 5a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v15a2 2 0 0 1 2-2h7V5Z'],
  hoja:    ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z', 'M14 3v5h5', 'M8 13h8M8 17h5'],
  gorro:   ['m2 9 10-5 10 5-10 5L2 9Z', 'M6 11v5c3 2 9 2 12 0v-5', 'M22 9v6'],
  cal:     ['M4 5h16v16H4z', 'M4 10h16', 'M9 3v4M15 3v4'],
  carpeta: ['M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z'],
  area:    ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
  lupa:    ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z', 'm20 20-4-4'],
  flecha:  ['M5 12h14', 'm13 6 6 6-6 6'],
  volver:  ['M19 12H5', 'm11 6-6 6 6 6'],
  escudo:  ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z']
};
function icono(n, cls){
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'doc-ic' + (cls ? ' ' + cls : ''));
  (IC[n] || IC.area).forEach(function(d){ const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
  return svg;
}

/* == utilidades == */
function norm(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function slug(s){ return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function ir(sub){ location.hash = '#docencia' + (sub && sub !== 'inicio' ? '/' + sub : ''); }
function enlace(sub, attrs, hijos){
  const a = h('a', Object.assign({ href: '#docencia' + (sub && sub !== 'inicio' ? '/' + sub : '') }, attrs || {}), hijos);
  return a;
}
function fecha(iso){
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}
function areas(){
  const c = D.datos && D.datos.config && Array.isArray(D.datos.config.areas) ? D.datos.config.areas : [];
  return c.length ? c : AREAS_BASE;
}
function modalidades(){
  const c = D.datos && D.datos.config && Array.isArray(D.datos.config.modalities) ? D.datos.config.modalities : [];
  return c;
}
function areaDeSlug(s){ return areas().find(function(a){ return slug(a) === s; }) || null; }
function modulos(){ return (D.datos && D.datos.modulos) || []; }
function colecciones(){ return (D.datos && D.datos.colecciones) || []; }
function modulo(id){ return modulos().find(function(m){ return m.id === id; }) || null; }
function pasaModalidad(m){ return !D.modalidad || (m.modalities || []).indexOf(D.modalidad) >= 0; }
function esTool(m){ return m.kind === 'tool'; }
function delArea(a){ return modulos().filter(function(m){ return m.area === a; }); }
function sistematica(a){
  const c = colecciones().find(function(c){ return c.area === a && c.category === 'systematic'; });
  return c && c.moduleIds && c.moduleIds.length ? modulo(c.moduleIds[0]) : null;
}
function coleccionesClinicas(a){
  return colecciones().filter(function(c){ return c.area === a && c.category !== 'systematic' && (c.moduleIds || []).length; });
}
function coleccionDe(m){
  return colecciones().find(function(c){ return c.category !== 'systematic' && (c.moduleIds || []).indexOf(m.id) >= 0; }) || null;
}
function nombreTool(m){ return NOMBRE_TOOL[m.id] || m.title; }

/* == markdown mínimo → DOM (### títulos, - listas, 1. listas, | tablas, **negrita**) == */
function inline(txt){
  const frag = document.createDocumentFragment();
  String(txt).split(/(\*\*[^*]+\*\*)/).forEach(function(t){
    if(!t) return;
    if(/^\*\*[^*]+\*\*$/.test(t)) frag.append(h('strong', { texto: t.slice(2, -2) }));
    else frag.append(document.createTextNode(t));
  });
  return frag;
}
function md(body){
  const raiz = h('div', { class: 'doc-md' });
  const lineas = String(body || '').replace(/\r/g, '').split('\n');
  let par = null, lista = null, tabla = null;
  function cerrar(){ par = null; lista = null; tabla = null; }
  lineas.forEach(function(l0){
    const l = l0.replace(/\s+$/, '');
    if(!l.trim()){ cerrar(); return; }
    let m;
    if((m = l.match(/^#{2,4}\s+(.*)$/))){ cerrar(); raiz.append(h('h4', null, [inline(m[1])])); return; }
    if(/^\s*\|/.test(l)){
      if(/^\s*\|[\s:|-]+\|?\s*$/.test(l)) return;
      const celdas = l.trim().replace(/^\||\|$/g, '').split('|').map(function(c){ return c.trim(); });
      if(!tabla){
        cerrar();
        tabla = h('table', { class: 'doc-tabla' });
        const tr = h('tr', null, celdas.map(function(c){ return h('th', null, [inline(c)]); }));
        tabla.append(h('thead', null, [tr]), h('tbody'));
        raiz.append(h('div', { class: 'doc-tabla-wrap' }, [tabla]));
        return;
      }
      tabla.tBodies[0].append(h('tr', null, celdas.map(function(c){ return h('td', null, [inline(c)]); })));
      return;
    }
    tabla = null;
    const ul = l.match(/^\s*[-•]\s+(.*)$/), ol = l.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if(ul || ol){
      const tipo = ul ? 'ul' : 'ol';
      if(!lista || lista.tagName.toLowerCase() !== tipo){ par = null; lista = h(tipo); raiz.append(lista); }
      lista.append(h('li', null, [inline(ul ? ul[1] : ol[2])]));
      return;
    }
    lista = null;
    if(!par){ par = h('p'); raiz.append(par); }
    else par.append(h('br'));
    par.append(inline(l.trim()));
  });
  return raiz;
}

/* == piezas de UI == */
function kicker(t){ return h('div', { class: 'doc-kicker', texto: t }); }
function cabecera(k, titulo, sub){
  return h('header', { class: 'doc-cab' }, [kicker(k), h('h2', { class: 'doc-h', texto: titulo }), sub ? h('p', { class: 'doc-sub', texto: sub }) : null]);
}
function vacio(t){ return h('div', { class: 'doc-vacio' }, [icono('libro'), h('p', { texto: t })]); }
function selModalidad(){
  const s = h('select', { class: 'doc-sel', 'aria-label': 'Modalidad' }, [h('option', { value: '', texto: 'Todas' })].concat(modalidades().map(function(m){
    return h('option', { value: m, texto: m });
  })));
  s.value = D.modalidad;
  s.addEventListener('change', function(){ D.modalidad = s.value; pintar(); });
  return h('label', { class: 'doc-campo' }, [h('span', { texto: 'Modalidad' }), s]);
}
function selArea(){
  const s = h('select', { class: 'doc-sel', 'aria-label': 'Área' }, [h('option', { value: '', texto: 'Todas' })].concat(areas().map(function(a){
    return h('option', { value: a, texto: a });
  })));
  s.value = D.areaFicha;
  s.addEventListener('change', function(){ D.areaFicha = s.value; pintar(); });
  return h('label', { class: 'doc-campo' }, [h('span', { texto: 'Área' }), s]);
}
function barra(hijos){ return h('div', { class: 'doc-barra' }, hijos); }
function meta(m){
  const partes = [(m.modalities || []).join(' · '), m.level].filter(Boolean);
  return h('div', { class: 'doc-meta' }, partes.map(function(p, i){ return h('span', { class: i ? 'doc-nivel' : 'tag', texto: p }); }));
}
function tarjetaModulo(m, rotulo){
  const a = enlace('m-' + m.id, { class: 'doc-mod' + (m.urgent ? ' urg' : '') }, [
    rotulo ? h('span', { class: 'doc-mod-rot', texto: rotulo }) : null,
    h('b', { texto: esTool(m) ? m.title : (m.scenario && m.scenario !== m.title && !/^(Urgencias|Lectura sistemática|Base de lectura)$/.test(m.scenario) ? m.scenario : m.title) }),
    !esTool(m) && m.scenario && m.scenario !== m.title && !/^(Urgencias|Lectura sistemática|Base de lectura)$/.test(m.scenario) ? h('small', { texto: m.title }) : (m.subtitle ? h('small', { texto: m.subtitle }) : null),
    meta(m),
    h('span', { class: 'doc-mod-ir' }, [esTool(m) ? (CALCULADORAS.indexOf(m.id) >= 0 ? 'Calcular' : 'Consultar') : 'Abrir módulo', icono('flecha')])
  ]);
  return a;
}
function tiraHerramientas(lista){
  if(!lista.length) return null;
  return h('section', { class: 'doc-tira' }, [
    h('div', { class: 'doc-tira-t' }, [icono('calc'), h('h3', { texto: 'Herramientas durante la lectura' })]),
    h('div', { class: 'doc-tira-b' }, lista.map(function(t){ return enlace('m-' + t.id, { class: 'doc-chip' }, [nombreTool(t)]); }))
  ]);
}

/* == vistas == */
function vInicio(){
  const out = [cabecera('Docencia para residentes', '¿Qué estás interpretando?', 'Un recorrido claro para mirar, razonar e integrar.')];
  const q = h('input', { type: 'search', class: 'doc-buscar', placeholder: 'Buscá un estudio, patología, signo o recurso…', 'aria-label': 'Buscar en Docencia' });
  q.value = D.consulta;
  const res = h('div', { class: 'doc-res' });
  function buscar(){
    D.consulta = q.value;
    vaciar(res);
    const t = norm(q.value.trim());
    if(!t) return;
    const hits = modulos().filter(function(m){
      if(!pasaModalidad(m)) return false;
      const bolsa = norm([m.title, m.subtitle, m.scenario, m.area, (m.tags || []).join(' '), (m.sections || []).map(function(s){ return s.title + ' ' + s.body; }).join(' ')].join(' '));
      return t.split(/\s+/).every(function(p){ return bolsa.indexOf(p) >= 0; });
    });
    res.append(h('div', { class: 'doc-res-n', texto: hits.length ? hits.length + (hits.length === 1 ? ' resultado' : ' resultados') : 'Sin resultados para esa búsqueda.' }));
    if(hits.length) res.append(h('div', { class: 'doc-grid' }, hits.map(function(m){ return tarjetaModulo(m, m.area); })));
  }
  q.addEventListener('input', buscar);
  out.push(barra([h('label', { class: 'doc-campo doc-campo-q' }, [h('span', { texto: 'Buscar' }), h('div', { class: 'doc-q' }, [icono('lupa'), q])]), selModalidad()]), res);
  out.push(enlace('ahora', { class: 'doc-hero' }, [
    h('div', null, [h('div', { class: 'doc-hero-k' }, [icono('pulso'), 'Consulta durante la lectura']), h('h3', { texto: 'Estoy informando ahora' }), h('p', { texto: 'Elegí el área del estudio y encontrá el recorrido que necesitás.' })]),
    h('span', { class: 'doc-btn' }, ['Elegir área', icono('flecha')])
  ]));
  const accesos = [
    ['urgencias', 'pulso', 'Guías rápidas', 'Ayudas memoria durante la interpretación.'],
    ['protocolos', 'hoja', 'Protocolos', 'Modelos de informe publicados.'],
    ['fichas', 'libro', 'Fichas docentes', 'Conceptos, signos y claves de estudio.'],
    ['herramientas', 'calc', 'Herramientas útiles', 'Escalas, mediciones y clasificaciones.']
  ];
  out.push(h('h3', { class: 'doc-sec-t', texto: 'Accesos directos' }), h('div', { class: 'doc-grid doc-grid-4' }, accesos.map(function(x){
    return enlace(x[0], { class: 'doc-acc' }, [h('span', { class: 'doc-acc-ic' }, [icono(x[1])]), h('b', { texto: x[2] }), h('small', { texto: x[3] }), h('span', { class: 'doc-mod-ir' }, ['Explorar', icono('flecha')])]);
  })));
  out.push(h('h3', { class: 'doc-sec-t', texto: 'Áreas de conocimiento' }), h('p', { class: 'doc-sub doc-sub-s', texto: 'Explorá por especialidad' }), gridAreas(false));
  return out;
}

function gridAreas(conteo){
  return h('div', { class: 'doc-grid doc-grid-areas' }, areas().map(function(a){
    const n = delArea(a).filter(function(m){ return !esTool(m) && pasaModalidad(m); }).length;
    return enlace('area-' + slug(a), { class: 'doc-area' + (n ? '' : ' sin') }, [
      h('span', { class: 'doc-acc-ic' }, [icono('area')]),
      h('b', { texto: a }),
      h('small', { texto: conteo ? (n ? n + (n === 1 ? ' módulo disponible' : ' módulos disponibles') : 'Sin módulos cargados') : 'Contenidos y recursos del área.' })
    ]);
  }));
}

function vAhora(){
  return [cabecera('Docencia para residentes', 'Estoy informando ahora', 'Elegí el área del estudio.'), barra([selModalidad()]), gridAreas(true)];
}

function vUrgencias(){
  const out = [cabecera('Consulta frente al PACS', 'Urgencias', 'Elegí la situación clínica y empezá el recorrido de lectura.'), barra([selModalidad()])];
  const cols = colecciones().filter(function(c){ return c.category !== 'systematic' && /urgenc/i.test(c.name || ''); });
  let total = 0;
  cols.forEach(function(c){
    const ms = (c.moduleIds || []).map(modulo).filter(function(m){ return m && pasaModalidad(m); });
    if(!ms.length) return;
    total += ms.length;
    out.push(h('div', { class: 'doc-grupo' }, [h('h3', { class: 'doc-sec-t', texto: c.area }), c.description ? h('p', { class: 'doc-sub doc-sub-s', texto: c.description }) : null,
      h('div', { class: 'doc-grid' }, ms.map(function(m){ return tarjetaModulo(m, m.scenario === 'Urgencias' ? 'Urgencias' : 'Recorrido operativo'); }))]));
  });
  if(!total) out.push(vacio('Todavía no hay escenarios de urgencia publicados.'));
  out.push(tiraHerramientas(modulos().filter(esTool).filter(pasaModalidad)));
  return out;
}

function vHerramientas(){
  const ts = modulos().filter(esTool).filter(pasaModalidad);
  return [cabecera('Docencia para residentes', 'Herramientas rápidas', 'Mediciones y escalas, junto al estudio.'), barra([selModalidad()]),
    ts.length ? h('div', { class: 'doc-grid' }, ts.map(function(t){
      return tarjetaModulo(t, CALCULADORAS.indexOf(t.id) >= 0 ? 'Calculadora interactiva' : 'Herramienta rápida');
    })) : vacio('Todavía no hay herramientas publicadas.')];
}

function vBiblioteca(titulo, sub, kind){
  const ms = modulos().filter(function(m){ return m.kind === kind && (!D.areaFicha || m.area === D.areaFicha); });
  return [cabecera('Biblioteca docente', titulo, sub), barra([selArea()]),
    ms.length ? h('div', { class: 'doc-grid' }, ms.map(function(m){ return tarjetaModulo(m, m.area); })) : vacio('Todavía no hay contenidos disponibles.')];
}

function vArea(a){
  const out = [];
  const sis = sistematica(a);
  out.push(cabecera('Área de conocimiento', a, 'Método de lectura, escenarios clínicos y herramientas.'));
  if(sis) out.push(enlace('m-' + sis.id, { class: 'doc-hero doc-hero-s' }, [
    h('div', null, [h('div', { class: 'doc-hero-k' }, [icono('capas'), 'Lectura sistemática']), h('h3', { texto: sis.title }), h('p', { texto: 'Cómo leer el estudio: recorrido de interpretación paso a paso.' })]),
    h('span', { class: 'doc-btn' }, ['Abrir estudio', icono('flecha')])
  ]));
  out.push(barra([selModalidad()]));
  const ms = delArea(a).filter(function(m){ return !esTool(m) && pasaModalidad(m); });
  if(!ms.length){ out.push(vacio('Todavía no hay contenidos publicados en esta área.')); return out; }
  const cols = coleccionesClinicas(a);
  if(cols.length) out.push(h('div', { class: 'doc-grid' }, cols.map(function(c){
    return enlace('col-' + slug(c.id), { class: 'doc-acc doc-col' }, [h('span', { class: 'doc-acc-ic' }, [icono('alerta')]), h('b', { texto: c.name }), h('small', { texto: c.description || '' }),
      h('span', { class: 'doc-mod-ir' }, [c.moduleIds.length + ' escenarios', icono('flecha')])]);
  })));
  out.push(h('h3', { class: 'doc-sec-t', texto: 'Todos los módulos del área' }), h('p', { class: 'doc-sub doc-sub-s', texto: 'Un contenido, distintos accesos' }),
    h('div', { class: 'doc-grid' }, ms.map(function(m){ const c = coleccionDe(m); return tarjetaModulo(m, m === sis ? 'Lectura sistemática' : (c ? c.name : m.scenario)); })));
  out.push(tiraHerramientas(delArea(a).filter(esTool).filter(pasaModalidad)));
  return out;
}

function vColeccion(c){
  const ms = (c.moduleIds || []).map(modulo).filter(function(m){ return m && pasaModalidad(m); });
  return [miga([['area-' + slug(c.area), c.area], [null, c.name]]), cabecera(c.area, c.name, c.description || ''), barra([selModalidad()]),
    ms.length ? h('div', { class: 'doc-grid' }, ms.map(function(m){ return tarjetaModulo(m, m.scenario); })) : vacio('Sin módulos para esta selección.'),
    tiraHerramientas(delArea(c.area).filter(esTool).filter(pasaModalidad))];
}

function vResidencia(sub){
  const out = [cabecera('Actividad docente y académica', 'Residencia', null)];
  out.push(h('nav', { class: 'subtabs doc-res-tabs', 'aria-label': 'Residencia' }, RESIDENCIA.map(function(r){
    return enlace(r.sub, r.sub === sub ? { 'aria-current': 'page' } : null, [r.txt]);
  })));
  if(sub === 'clases') out.push(vacio('Todavía no hay clases publicadas.'));
  if(sub === 'cronograma') out.push(h('div', { class: 'seg doc-seg' }, [h('button', { type: 'button', 'aria-pressed': 'true', texto: 'Listado' }), h('button', { type: 'button', 'aria-pressed': 'false', texto: 'Calendario', disabled: true })]), vacio('No hay actividades para esta selección.'));
  if(sub === 'material') out.push(vacio('No hay materiales disponibles en esta selección.'));
  return out;
}

function miga(pasos){
  const hijos = [enlace('inicio', null, ['Docencia'])];
  pasos.forEach(function(p){
    hijos.push(h('span', { texto: '›' }));
    hijos.push(p[0] ? enlace(p[0], null, [p[1]]) : h('span', { class: 'act', texto: p[1] }));
  });
  return h('nav', { class: 'doc-miga', 'aria-label': 'Ubicación en Docencia' }, hijos);
}

/* == módulo == */
function vModulo(m){
  const out = [];
  const prev = D.previo && D.previo !== 'm-' + m.id ? D.previo : 'area-' + slug(m.area);
  out.push(h('div', { class: 'doc-volver-fila' }, [enlace(prev, { class: 'doc-volver' }, [icono('volver'), 'Volver'])]));
  const c = coleccionDe(m);
  out.push(miga([['area-' + slug(m.area), m.area]].concat(c ? [['col-' + slug(c.id), c.name]] : []).concat([[null, m.title]])));
  out.push(h('div', { class: 'doc-mod-cab' }, [
    h('div', { class: 'doc-meta' }, [h('span', { class: 'tag', texto: m.area })].concat((m.modalities || []).map(function(x){ return h('span', { class: 'tag', texto: x }); }))
      .concat(m.level ? [h('span', { class: 'doc-nivel', texto: m.level })] : [])),
    h('h2', { class: 'doc-h doc-h-mod', texto: m.title }),
    m.subtitle ? h('p', { class: 'doc-sub', texto: m.subtitle }) : null
  ]));
  if(esTool(m)){
    if(CALCULADORAS.indexOf(m.id) >= 0) out.push(h('div', { class: 'doc-aviso' }, [icono('calc'), h('span', { texto: 'La calculadora interactiva se suma en la próxima etapa. Mientras tanto, acá está la referencia.' })]));
    out.push(h('div', { class: 'doc-secs' }, (m.sections || []).map(seccion)));
    out.push(pie(m));
    return out;
  }
  const disp = { quick: !!(m.guide && m.guide.length), det: !!(m.sections && m.sections.some(function(s){ return s.kind !== 'intro' || s.body; })), learn: true, prot: true };
  let v = D.vista[m.id] || (disp.quick ? 'quick' : 'det');
  if(!disp[v]) v = disp.quick ? 'quick' : 'det';
  const tabs = h('div', { class: 'tabs doc-vistas', role: 'tablist', 'aria-label': 'Vistas del módulo' }, VISTAS.filter(function(x){ return disp[x.k]; }).map(function(x){
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': x.k === v ? 'true' : 'false' }, [icono(x.ic), x.txt]);
    b.addEventListener('click', function(){ D.vista[m.id] = x.k; pintar(); });
    return b;
  }));
  out.push(tabs);
  if(v === 'quick') out.push(vGuia(m));
  else if(v === 'det') out.push(vDetalle(m));
  else if(v === 'learn') out.push(m.learning && m.learning.length ? h('div', { class: 'doc-secs' }, m.learning.map(seccion)) : vacio('Contenido de aprendizaje todavía no disponible.'), lateral(m, true));
  else out.push(vacio('Todavía no hay protocolos disponibles para este módulo.'));
  out.push(pie(m));
  return out;
}

function vGuia(m){
  return h('section', { class: 'doc-guia' }, [
    kicker('Guía rápida · frente al PACS'),
    h('div', { class: 'doc-guia-g' }, m.guide.map(function(b){
      return h('div', { class: 'doc-guia-b' }, [h('h4', { texto: b.title || '' }), b.subtitle ? h('small', { texto: b.subtitle }) : null, md(b.body)]);
    }))
  ]);
}

function seccion(s, i){
  const k = KIND_SEC[s.kind] || KIND_SEC.main;
  const hijos = [];
  if(s.kind === 'main' && typeof i === 'number') hijos.push(h('h3', null, [h('span', { class: 'doc-num', texto: String(i).padStart(2, '0') }), s.title || '']));
  else if(s.kind !== 'intro') hijos.push(h('h3', null, [k.rot && k.rot !== s.title ? h('span', { class: 'doc-rot', texto: k.rot }) : null, s.title || '']));
  hijos.push(md(s.body));
  const links = (s.links || []).map(modulo).filter(Boolean);
  if(links.length) hijos.push(h('div', { class: 'doc-links' }, [h('span', { texto: 'Ver también' })].concat(links.map(function(l){ return enlace('m-' + l.id, { class: 'doc-chip' }, [esTool(l) ? nombreTool(l) : l.title]); }))));
  return h('section', { class: 'doc-s doc-s-' + k.cls, id: 'doc-s-' + slug(s.id || s.title || '') }, hijos);
}

function vDetalle(m){
  const out = h('div', { class: 'doc-det' });
  if(m.path && m.path.length) out.append(h('div', { class: 'doc-path' }, [kicker('Recorrido de lectura'), h('ol', null, m.path.map(function(p, i){
    return h('li', null, [h('span', { texto: String(i + 1).padStart(2, '0') }), h('b', { texto: p })]);
  }))]));
  const secs = m.sections || [];
  let n = 0;
  const cuerpo = secs.map(function(s){ return seccion(s, s.kind === 'main' ? ++n : undefined); });
  const indice = h('nav', { class: 'doc-indice', 'aria-label': 'En este módulo' }, [kicker('En este módulo')].concat(secs.filter(function(s){ return s.kind !== 'intro'; }).map(function(s){
    const b = h('button', { type: 'button', texto: s.title || '' });
    b.addEventListener('click', function(){ const t = document.getElementById('doc-s-' + slug(s.id || s.title || '')); if(t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    return b;
  })));
  out.append(h('div', { class: 'doc-det-g' }, [indice, h('div', { class: 'doc-secs' }, cuerpo), lateral(m, false)]));
  return out;
}

function lateral(m, suelto){
  const rel = (m.relations || []).map(modulo).filter(Boolean);
  const tools = delArea(m.area).filter(esTool);
  return h('aside', { class: 'doc-lat' + (suelto ? ' suelto' : '') }, [
    tools.length ? h('div', { class: 'doc-lat-b' }, [icono('calc'), h('b', { texto: 'Durante la lectura' }), h('small', { texto: 'Consultá las herramientas disponibles para esta área.' }),
      h('div', { class: 'doc-lat-l' }, tools.map(function(t){ return enlace('m-' + t.id, null, [nombreTool(t)]); }))]) : null,
    rel.length ? h('div', { class: 'doc-lat-b' }, [icono('libro'), h('b', { texto: 'Continuá el recorrido' }),
      h('div', { class: 'doc-lat-l' }, rel.map(function(r){ return enlace('m-' + r.id, null, [r.title]); }))]) : null
  ]);
}

function pie(m){
  const partes = [m.source ? 'Fuente: ' + m.source : null, m.updatedAt ? 'Actualizado ' + fecha(m.updatedAt) : null].filter(Boolean);
  return h('footer', { class: 'doc-pie' }, [
    partes.length ? h('span', { texto: partes.join(' · ') }) : null,
    m.reviewNote ? h('span', { class: 'doc-pie-rev' }, [icono('escudo'), m.reviewNote]) : null
  ]);
}

/* == navegación lateral (mismo orden que la plataforma DxI) == */
function navLateral(sub){
  function item(s, txt, ic){
    const act = sub === s || (s === 'inicio' && !sub);
    return enlace(s, act ? { 'aria-current': 'page' } : null, [icono(ic), h('span', { texto: txt })]);
  }
  return h('nav', { class: 'doc-nav', 'aria-label': 'Docencia' }, [
    h('div', { class: 'doc-nav-g' }, [h('div', { class: 'doc-nav-t', texto: 'Explorar' })].concat(EXPLORAR.map(function(x){ return item(x.sub, x.txt, x.ic); }))),
    h('div', { class: 'doc-nav-g' }, [h('div', { class: 'doc-nav-t', texto: 'Áreas' })].concat(areas().map(function(a){ return item('area-' + slug(a), a, 'area'); }))),
    h('div', { class: 'doc-nav-g' }, [h('div', { class: 'doc-nav-t', texto: 'Residencia' })].concat(RESIDENCIA.map(function(x){ return item(x.sub, x.txt, x.ic); })))
  ]);
}

/* sub de la ruta → qué ítem del menú queda marcado */
function marcaDe(sub){
  if(/^m-/.test(sub)){
    const m = modulo(sub.slice(2));
    return m ? (esTool(m) ? 'herramientas' : 'area-' + slug(m.area)) : 'inicio';
  }
  if(/^col-/.test(sub)){
    const c = colecciones().find(function(c){ return 'col-' + slug(c.id) === sub; });
    return c ? 'area-' + slug(c.area) : 'inicio';
  }
  return sub;
}

/* == pintado == */
function contenido(sub){
  if(sub === 'inicio') return vInicio();
  if(sub === 'ahora') return vAhora();
  if(sub === 'urgencias') return vUrgencias();
  if(sub === 'herramientas') return vHerramientas();
  if(sub === 'fichas') return vBiblioteca('Fichas docentes', 'Conceptos breves, vinculados al recorrido de lectura.', 'card');
  if(sub === 'protocolos') return vBiblioteca('Protocolos de informe', 'Modelos de informe reutilizables.', 'protocol');
  if(RESIDENCIA.some(function(r){ return r.sub === sub; })) return vResidencia(sub);
  if(/^area-/.test(sub)){ const a = areaDeSlug(sub.slice(5)); if(a) return vArea(a); }
  if(/^col-/.test(sub)){ const c = colecciones().find(function(c){ return 'col-' + slug(c.id) === sub; }); if(c) return vColeccion(c); }
  if(/^m-/.test(sub)){ const m = modulo(sub.slice(2)); if(m) return vModulo(m); }
  return [vacio('Ese contenido no existe o ya no está publicado.'), h('p', { class: 'doc-sub' }, [enlace('inicio', null, ['Volver al inicio de Docencia'])])];
}

function pintar(){
  const el = D.el;
  if(!el) return;
  const sub = D.actual || 'inicio';
  const foco = document.activeElement && el.contains(document.activeElement) && document.activeElement.classList.contains('doc-buscar');
  vaciar(el);
  const cuerpo = h('div', { class: 'doc-main' });
  if(D.error){
    cuerpo.append(h('div', { class: 'vacio error' }, [h('h2', { texto: 'NO SE PUDO LEER DOCENCIA' }), h('p', { texto: D.error })]));
  }else if(!D.datos){
    cuerpo.append(h('div', { class: 'doc-cargando', texto: 'Cargando Docencia…' }));
  }else{
    contenido(sub).forEach(function(n){ if(n) cuerpo.append(n); });
  }
  el.append(h('div', { class: 'doc' }, [navLateral(D.datos ? marcaDe(sub) : sub), cuerpo]));
  if(foco){ const q = el.querySelector('.doc-buscar'); if(q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}

function cargar(){
  if(D.promesa) return D.promesa;
  D.promesa = D.puente.rpc('doc_contenido', {}).then(function(r){
    D.datos = { modulos: Array.isArray(r.modulos) ? r.modulos : [], colecciones: Array.isArray(r.colecciones) ? r.colecciones : [], config: r.config || {} };
    D.error = null;
  }).catch(function(e){
    const c = D.puente.codigoDe ? D.puente.codigoDe(e) : String(e && e.message);
    D.error = D.puente.mensajeDe ? D.puente.mensajeDe(c, e && e.detalle) : 'Error ' + c;
    D.promesa = null;
  }).then(pintar);
  return D.promesa;
}

function mostrar(el, sub, puente){
  const nuevo = sub || 'inicio';
  if(D.actual && D.actual !== nuevo){ D.previo = D.actual; window.scrollTo(0, 0); }
  D.el = el; D.puente = puente; D.actual = nuevo;
  pintar();
  if(!D.datos) cargar();
}

window.LumenDocencia = { mostrar: mostrar, _md: md, _slug: slug };

/* == enganche propio con imagenes.js ==
 * Funciona aunque imagenes.js no llame a LumenDocencia: conserva #docencia/<sub> en la URL (imagenes.js la recorta a #docencia)
 * y reemplaza el cartel «Próximamente» de #v-docencia por la vista. Si imagenes.js ya llama a mostrar(), esto no hace nada. */
const RE_SUB = /^#docencia\/([a-z0-9-]{1,80})$/;
const MENSAJES = {
  SIN_SESION: 'Tu sesión venció. Volvé a ingresar a Lumen.',
  SIN_PERMISO: 'Tu usuario no tiene acceso a Docencia.',
  RED: 'No se pudo conectar con la base de datos de Lumen.'
};
const PUENTE_PROPIO = {
  rpc: function(fn, args){
    if(typeof window.sbRpc !== 'function') return Promise.reject(Object.assign(new Error('RED'), { codigo: 'RED' }));
    return Promise.resolve(window.sbRpc(fn, args || {})).then(function(r){
      if(!r || r.ok !== true){ const c = (r && r.error) || 'RESPUESTA'; throw Object.assign(new Error(c), { codigo: c }); }
      return r;
    }, function(){ throw Object.assign(new Error('RED'), { codigo: 'RED' }); });
  },
  codigoDe: function(e){ return (e && (e.codigo || e.message)) || 'ERROR'; },
  mensajeDe: function(c){ return MENSAJES[c] || ('No se pudo leer el contenido (' + c + ').'); }
};
(function(){
  const orig = history.replaceState.bind(history);
  history.replaceState = function(st, t, url){
    if(url === '#docencia' && RE_SUB.test(location.hash)) return;
    return orig(st, t, url);
  };
  function subDeHash(){ const m = location.hash.match(RE_SUB); return m ? m[1] : null; }
  function montar(){
    const el = document.getElementById('v-docencia'), tab = document.getElementById('tab-docencia');
    if(!el || !tab || tab.hidden) return;
    const primero = el.firstElementChild;
    if(primero && primero.classList.contains('doc')) return;
    mostrar(el, subDeHash(), D.puente || PUENTE_PROPIO);
  }
  function iniciar(){
    const el = document.getElementById('v-docencia'), tab = document.getElementById('tab-docencia');
    if(!el || !tab) return;
    new MutationObserver(montar).observe(el, { childList: true });
    new MutationObserver(montar).observe(tab, { attributes: true, attributeFilter: ['hidden'] });
    montar();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
})();
