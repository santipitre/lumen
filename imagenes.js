(function(){
'use strict';
if(!window.__img_user) return;

/* == constantes == */
const TABS = ['medicos','residentes','tecnicos','administrativos'];
const SUBS = ['staff','eco','rm'];
const TITULOS = { medicos:'Médicos', residentes:'Residentes', tecnicos:'Técnicos', administrativos:'Administrativos', cronogramas:'Cronogramas' };
const TAB_CRON = 'cronogramas';
const BASE = 'Dashboard Imágenes H.Italiano';
const TIPO_DE = { medicos:'medico', residentes:'residente', tecnicos:'tecnico', administrativos:'administrativo' };
const RPC_LECTURA = ['img_mi_acceso','img_catalogos','img_listar','img_ficha','img_cronograma','img_cron_leer'];
const RPC_ESCRITURA = ['img_persona_guardar','img_persona_borrar','img_catalogo_guardar','img_turno_guardar','img_turno_borrar','img_cron_guardar','img_cron_borrar'];
const RPC_ADMIN = ['img_respaldo'];
const NIVELES_EDICION =['editar','admin'];
const TIPOS_CATALOGO = ['servicio','estudio','tipo_licencia','subespecialidad','equipo','sede_informa'];
const TIPOS_PACIENTE_ED = ['A','I','A+I'];
const CAMPOS_DIFF = ['apellido','nombre','matricula','celular','email','nota','anio','servicios','estudios','turnos','horarios','licencias'];
const AVISO_NOTA = 'no escribir teléfonos ni emails acá (la ve el nivel Ver)';
const NIVELES_VALIDOS = ['ver','ver_contactos','editar','admin'];
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
  RED: 'No se pudo leer la base. Probá recargar la página.',
  NO_IDENTIDAD: 'No se pudo confirmar tu sesión: no se guardó nada. Cerrá sesión y volvé a ingresar.',
  RPC_NO_PERMITIDA: 'Operación no permitida.',
  SIN_PERMISO_ESCRITURA: 'No tenés permiso para modificar datos en este módulo.',
  CONFLICTO: 'Otra persona guardó cambios en esta ficha mientras la editabas. Tu guardado no se aplicó.',
  RED_ESCRITURA: 'No se pudo confirmar el guardado. Puede haberse aplicado: se recarga antes de reintentar.',
  RESPALDO_NO_DISPONIBLE: 'Respaldo no disponible: falta aplicar la RPC',
  INVALIDO_apellido: 'El apellido es obligatorio y no puede superar los 200 caracteres.',
  INVALIDO_nombre: 'El nombre es obligatorio y no puede superar los 200 caracteres.',
  INVALIDO_contacto: 'Revisá celular, email y matrícula: algún valor es demasiado largo.',
  INVALIDO_extra: 'Alguno de los datos adicionales no es válido.',
  INVALIDO_licencias: 'Revisá las licencias: tipo, fechas de inicio y fin (el fin no puede ser anterior al inicio).',
  INVALIDO_estudios: 'Revisá los estudios: hay alguno repetido o con tipo de paciente inválido.',
  INVALIDO_horarios: 'Revisá los horarios cargados.',
  INVALIDO_horario: 'Revisá el turno: día, consultorio y horas (el fin debe ser posterior al inicio).',
  INVALIDO_residentes: 'Los residentes asignados al turno no son válidos.',
  INVALIDO_duplicado: 'Hay un valor repetido.',
  INVALIDO_en_uso: 'Ese valor está en uso por personas: no se puede quitar ni renombrar.',
  INVALIDO_id: 'El identificador no es válido. Recargá la página.',
  INVALIDO_nota: 'La nota no es válida o es demasiado larga.',
  INVALIDO_servicios: 'Revisá los servicios: alguno no es válido.',
  INVALIDO_orden: 'El orden de la ficha no es válido.',
  INVALIDO_persona: 'Los datos de la ficha no son válidos.',
  INVALIDO_tipo: 'El tipo no es válido.',
  INVALIDO_items: 'La lista no es válida.',
  INVALIDO_valor: 'Algún valor está vacío o es demasiado largo.',
  INVALIDO_turno: 'Los datos del turno no son válidos.',
  INVALIDO_dia: 'El día del turno no es válido.',
  INVALIDO_cons: 'El consultorio del turno no es válido.',
  CONFLICTO_TURNO: 'Otra persona cambió este turno.',
  INVALIDO_otro: 'Algún dato no es válido. Revisá los campos.'
};

/* Estado único del módulo */
const E = { identidadOk:false, nivel:null, contactos:false, pestanas:[], catalogos:null, versionCatalogo:{}, personas:{}, turnos:[], errores:{}, cargando:true, filtros:{}, consulta:'', hoy:'', vista:'tabla', hashActual:'' };
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
  const tab = pestanas.indexOf(p.tab) >= 0 && (TABS.indexOf(p.tab) >= 0 || p.tab === TAB_CRON) ? p.tab : pestanas[0];
  if(tab === TAB_CRON) return { tab: tab, sub: (tab === p.tab && /^[a-z]{2,20}$/.test(p.sub || '')) ? p.sub : null };
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

/* == edición: lógica pura == */
/* Espejo de _test/imagenes/edicion_ref.py: mismos nombres (camelCase), mismos parámetros y reglas.
   Sin DOM, sin reloj y sin E: todo entra por parámetro. */
const ESCALARES_ED = ['apellido', 'nombre', 'matricula', 'celular', 'email'];
const CONTACTOS_ED = ['celular', 'email', 'matricula'];
const MAX_ARRAY = 200;
const MAX_TEXTO = 200;
const AUS = { ausente: true };

function sEd(x){
  if(x === null || x === undefined) return '';
  return String(x).trim();
}

function nz(x){
  return x === undefined ? null : x;
}

function clon(x){
  return x === undefined || x === null ? null : JSON.parse(JSON.stringify(x));
}

function largoEd(t){
  return Array.from(String(t)).length;
}

function puedeEditar(nivel){
  return NIVELES_EDICION.indexOf(nivel) >= 0;
}

function esAdmin(nivel){
  return nivel === 'admin';
}

/* Ausente != vacío: img_persona_guardar pone NULL a todo contacto que no recibe, así que una ficha sin las tres claves no se edita. */
function tieneContactos(p){
  return !!p && typeof p === 'object' && CONTACTOS_ED.every(function(k){ return Object.prototype.hasOwnProperty.call(p, k); });
}

function borradorDe(p, turnos){
  const b = {};
  ['id', 'tipo', 'orden', 'apellido', 'nombre', 'celular', 'email', 'matricula', 'servicios', 'tiene_agenda',
    'datos', 'estudios', 'horarios', 'licencias', 'version', 'updated_at'].forEach(function(k){
    if(CONTACTOS_ED.indexOf(k) >= 0 && !Object.prototype.hasOwnProperty.call(p, k)) return;
    b[k] = clon(p[k]);
  });
  if(b.servicios === null) b.servicios = [];
  if(b.datos === null) b.datos = {};
  ['estudios', 'horarios', 'licencias'].forEach(function(k){ if(b[k] === null) b[k] = []; });
  b.turnos = (turnos || []).filter(function(t){
    return nz(t.persona_id) === nz(p.id) && !t.es_residentes;
  }).map(function(t){
    return { id: nz(t.id), version: nz(t.version), dia: nz(t.dia), cons: nz(t.cons), desde: nz(t.desde), hasta: nz(t.hasta) };
  });
  return b;
}

function borradorNuevo(tipo, orden){
  return { id: null, tipo: tipo, orden: orden, apellido: '', nombre: '', celular: '', email: '', matricula: '',
    servicios: [], tiene_agenda: false, datos: {}, estudios: [], horarios: [], licencias: [], version: null,
    updated_at: null, turnos: [] };
}

function ordenAlta(personas){
  const ords = (personas || []).map(function(p){ return p.orden; }).filter(function(o){ return Number.isInteger(o); });
  if(!ords.length) return 0;
  return Math.max.apply(null, ords) + 1;
}

function esEditado(p){
  return Number.isInteger(p.version) && p.version > 1;
}

function textoEdicion(updatedAt, version, desfaseMin){
  if(!updatedAt) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(String(updatedAt));
  if(!m) return '—';
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const hh = parseInt(m[4], 10);
  const mi = parseInt(m[5], 10);
  let off = 0;
  const z = m[7];
  if(z && z !== 'Z'){
    const sgn = z.charAt(0) === '-' ? -1 : 1;
    const dig = z.slice(1).replace(':', '');
    off = sgn * (parseInt(dig.slice(0, 2), 10) * 60 + parseInt(dig.slice(2), 10));
  }
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  dt.setUTCHours(hh, mi, 0, 0);
  if(y < 1 || hh > 23 || mi > 59 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '—';
  const t = new Date(dt.getTime() - off * 60000 + (desfaseMin || 0) * 60000);
  function dos(n){ return (n < 10 ? '0' : '') + n; }
  const txt = dos(t.getUTCDate()) + '/' + dos(t.getUTCMonth() + 1) + '/' + String(t.getUTCFullYear()).padStart(4, '0') + ' ' + dos(t.getUTCHours()) + ':' + dos(t.getUTCMinutes());
  if(version === null || version === undefined) return txt;
  return txt + ' · v' + version;
}

function confirmaBaja(escrito, apellido){
  const a = sinTildes(sEd(escrito));
  if(!a) return false;
  return a === sinTildes(sEd(apellido));
}

function payloadPersona(b){
  function contacto(x){
    const t = sEd(x);
    return t ? t : null;
  }
  const pl = {
    tipo: nz(b.tipo),
    apellido: sEd(b.apellido),
    nombre: sEd(b.nombre),
    orden: b.orden !== null && b.orden !== undefined ? b.orden : 0,
    servicios: clon(b.servicios || []),
    tiene_agenda: nz(b.tiene_agenda),
    datos: clon(b.datos || {}),
    estudios: (b.estudios || []).map(function(e){ return { estudio: nz(e.estudio), tipo_paciente: e.tipo_paciente || '?' }; }),
    horarios: (b.horarios || []).map(function(x){ return { clase: nz(x.clase), dia: nz(x.dia), desde: nz(x.desde), hasta: nz(x.hasta) }; }),
    licencias: (b.licencias || []).map(function(x){ return { tipo: nz(x.tipo), desde: nz(x.desde), hasta: nz(x.hasta) }; })
  };
  CONTACTOS_ED.forEach(function(k){
    if(Object.prototype.hasOwnProperty.call(b, k)) pl[k] = contacto(b[k]);
  });
  if(b.id) pl.id = b.id;
  return pl;
}

function fechaOk(s){
  const m = typeof s === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
  if(!m) return false;
  const y = parseInt(m[1], 10);
  const dt = new Date(0);
  dt.setUTCFullYear(y, parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return y >= 1 && dt.getUTCFullYear() === y && dt.getUTCMonth() === parseInt(m[2], 10) - 1 && dt.getUTCDate() === parseInt(m[3], 10);
}

function horaOk(s){
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function validarBorrador(b, catalogos){
  const errores = [];
  function add(campo, codigo){
    const ya = errores.some(function(e){ return e.campo === campo && e.codigo === codigo; });
    if(!ya) errores.push({ campo: campo, codigo: codigo });
  }
  ['apellido', 'nombre'].forEach(function(campo){
    const t = sEd(b[campo]);
    if(!t) add(campo, 'requerido');
    else if(largoEd(t) > MAX_TEXTO) add(campo, 'largo');
  });
  ['celular', 'email', 'matricula'].forEach(function(campo){
    if(largoEd(sEd(b[campo])) > MAX_TEXTO) add(campo, 'largo');
  });

  const est = b.estudios || [];
  if(est.length > MAX_ARRAY) add('estudios', 'largo');
  const vistos = Object.create(null);
  est.forEach(function(e){
    const nombre = sEd(e.estudio);
    if(!nombre) add('estudios', 'requerido');
    else if(vistos[nombre] === true) add('estudios', 'duplicado');
    vistos[nombre] = true;
    if(TIPOS_PACIENTE_ED.concat(['?']).indexOf(e.tipo_paciente || '?') < 0) add('estudios', 'invalido');
  });

  const lic = b.licencias || [];
  if(lic.length > MAX_ARRAY) add('licencias', 'largo');
  const cat = catalogos || {};
  const tiposLic = (cat.catalogos || cat).tipo_licencia || [];
  lic.forEach(function(x){
    if(tiposLic.indexOf(x.tipo) < 0) add('licencias', 'catalogo');
    const d = x.desde;
    const hasta = x.hasta;
    if(!d || !hasta){
      add('licencias', 'requerido');
      return;
    }
    if(!fechaOk(d) || !fechaOk(hasta)) add('licencias', 'requerido');
    else if(hasta < d) add('licencias', 'rango');
  });

  const hor = b.horarios || [];
  if(hor.length > MAX_ARRAY) add('horarios', 'largo');
  hor.forEach(function(x){
    const d = x.dia;
    if((x.clase !== 'agenda' && x.clase !== 'trabajo') || !Number.isInteger(d) || d < 0 || d > 6
      || !horaOk(x.desde) || !horaOk(x.hasta) || x.hasta <= x.desde) add('horarios', 'horario');
  });

  const tur = b.turnos || [];
  if(tur.length > MAX_ARRAY) add('turnos', 'largo');
  tur.forEach(function(x){
    const d = x.dia;
    if(!Number.isInteger(d) || d < 0 || d > 6 || [1, 2].indexOf(x.cons) < 0
      || !horaOk(x.desde) || !horaOk(x.hasta) || x.hasta <= x.desde) add('turnos', 'horario');
  });
  return errores;
}

function claveEd(campo, x){
  if(campo === 'licencias') return nz(x.tipo) + '|' + nz(x.desde) + '|' + nz(x.hasta);
  if(campo === 'horarios') return nz(x.clase) + '|' + nz(x.dia) + '|' + nz(x.desde) + '|' + nz(x.hasta);
  if(campo === 'turnos') return nz(x.dia) + '|' + nz(x.cons) + '|' + nz(x.desde) + '|' + nz(x.hasta);
  return null;
}

function estadoEd(campo, b){
  const out = Object.create(null);
  if(ESCALARES_ED.indexOf(campo) >= 0){
    out['*'] = sEd(b[campo]);
  } else if(campo === 'nota' || campo === 'anio'){
    out['*'] = sEd((b.datos || {})[campo]);
  } else if(campo === 'servicios'){
    (b.servicios || []).forEach(function(s){ out[s] = true; });
  } else if(campo === 'estudios'){
    (b.estudios || []).forEach(function(e){ out[sEd(e.estudio)] = e.tipo_paciente || '?'; });
  } else {
    (b[campo] || []).forEach(function(x){ const k = claveEd(campo, x); out[k] = k; });
  }
  return out;
}

function valEd(o, k){
  return k in o ? o[k] : AUS;
}

function igualEstado(a, b){
  const ka = Object.keys(a);
  if(ka.length !== Object.keys(b).length) return false;
  return ka.every(function(k){ return k in b && a[k] === b[k]; });
}

function unionClaves(a, b){
  const ks = Object.keys(a);
  Object.keys(b).forEach(function(k){ if(!(k in a)) ks.push(k); });
  return ks;
}

function valorOriginal(campo, b){
  if(ESCALARES_ED.indexOf(campo) >= 0) return sEd(b[campo]);
  if(campo === 'nota' || campo === 'anio') return sEd((b.datos || {})[campo]);
  return clon(b[campo] || []);
}

function diferencias(a, b){
  const out = [];
  CAMPOS_DIFF.forEach(function(campo){
    if(!igualEstado(estadoEd(campo, a), estadoEd(campo, b))){
      out.push({ campo: campo, antes: valorOriginal(campo, a), despues: valorOriginal(campo, b) });
    }
  });
  return out;
}

function contarCambios(base, b){
  return diferencias(base, b).length;
}

function camposDifEd(a, b){
  return diferencias(a, b).map(function(d){ return d.campo; });
}

function chocaEd(campo, base, mio, actual){
  const eb = estadoEd(campo, base);
  const em = estadoEd(campo, mio);
  const ea = estadoEd(campo, actual);
  const ks = unionClaves(eb, em);
  for(let i = 0; i < ks.length; i++){
    const k = ks[i];
    if(valEd(eb, k) === valEd(em, k)) continue;
    if(valEd(ea, k) === valEd(eb, k)) continue;
    if(valEd(ea, k) !== valEd(em, k)) return true;
  }
  return false;
}

function rebaseTurnos(base, mio, res){
  let choque = false;
  const eb = estadoEd('turnos', base);
  const em = estadoEd('turnos', mio);
  const quitados = Object.keys(eb).filter(function(k){ return !(k in em); });
  const agregados = Object.keys(em).filter(function(k){ return !(k in eb); });
  const baseCl = Object.create(null);
  (base.turnos || []).forEach(function(t){ baseCl[claveEd('turnos', t)] = t; });
  const mioCl = Object.create(null);
  (mio.turnos || []).forEach(function(t){ mioCl[claveEd('turnos', t)] = t; });
  const idsQuitados = Object.create(null);
  quitados.forEach(function(k){ if(baseCl[k].id) idsQuitados[baseCl[k].id] = true; });
  const modIds = Object.create(null);
  agregados.forEach(function(k){
    const id = mioCl[k].id;
    if(id && idsQuitados[id] === true) modIds[id] = true;
  });
  const lista = res.turnos;
  quitados.forEach(function(k){
    const t = baseCl[k];
    if(t.id && modIds[t.id] === true) return;
    let objetivo = null;
    for(let i = 0; i < lista.length; i++){
      const x = lista[i];
      if((t.id && x.id === t.id) || (!t.id && claveEd('turnos', x) === k)){ objetivo = x; break; }
    }
    if(objetivo !== null){
      if(claveEd('turnos', objetivo) !== k) choque = true;
      lista.splice(lista.indexOf(objetivo), 1);
    }
  });
  agregados.forEach(function(k){
    const m = mioCl[k];
    if(m.id && modIds[m.id] === true){
      const objetivo = lista.filter(function(x){ return x.id === m.id; })[0] || null;
      if(objetivo !== null){
        const prev = (base.turnos || []).filter(function(t){ return t.id === m.id; })[0] || null;
        if(prev !== null && claveEd('turnos', objetivo) !== claveEd('turnos', prev)) choque = true;
        ['dia', 'cons', 'desde', 'hasta'].forEach(function(c){ objetivo[c] = nz(m[c]); });
      } else {
        const nuevo = clon(m);
        nuevo.id = null;
        nuevo.version = null;
        lista.push(nuevo);
      }
    } else if(!lista.some(function(x){ return claveEd('turnos', x) === k; })){
      lista.push(clon(m));
    }
  });
  return choque;
}

function rebase(base, mio, actual){
  const res = clon(actual);
  if(res.datos === undefined || res.datos === null) res.datos = {};
  const dm = camposDifEd(base, mio);
  let choques = [];
  CAMPOS_DIFF.forEach(function(campo){
    if(dm.indexOf(campo) < 0) return;
    if(chocaEd(campo, base, mio, actual)) choques.push(campo);
    if(ESCALARES_ED.indexOf(campo) >= 0){
      res[campo] = sEd(mio[campo]);
    } else if(campo === 'nota' || campo === 'anio'){
      const v = sEd((mio.datos || {})[campo]);
      if(v || Object.prototype.hasOwnProperty.call(res.datos, campo)) res.datos[campo] = v;
    } else if(campo === 'servicios'){
      const eb = estadoEd(campo, base);
      const em = estadoEd(campo, mio);
      const lista = (res.servicios || []).filter(function(s){ return !(s in eb && !(s in em)); });
      (mio.servicios || []).forEach(function(s){
        if(!(s in eb) && lista.indexOf(s) < 0) lista.push(s);
      });
      res.servicios = lista;
    } else if(campo === 'estudios'){
      const eb = estadoEd(campo, base);
      const em = estadoEd(campo, mio);
      const lista = res.estudios || [];
      const mioPor = Object.create(null);
      (mio.estudios || []).forEach(function(e){ mioPor[sEd(e.estudio)] = e; });
      unionClaves(eb, em).forEach(function(k){
        if(valEd(eb, k) === valEd(em, k)) return;
        let pos = -1;
        for(let i = 0; i < lista.length; i++){
          if(sEd(lista[i].estudio) === k){ pos = i; break; }
        }
        if(k in em){
          const nuevo = { estudio: nz(mioPor[k].estudio), tipo_paciente: mioPor[k].tipo_paciente || '?' };
          if(pos < 0) lista.push(nuevo); else lista[pos] = nuevo;
        } else if(pos >= 0){
          lista.splice(pos, 1);
        }
      });
      res.estudios = lista;
    } else if(campo === 'licencias' || campo === 'horarios'){
      const eb = estadoEd(campo, base);
      const em = estadoEd(campo, mio);
      let lista = res[campo] || [];
      const mioPor = Object.create(null);
      (mio[campo] || []).forEach(function(x){ mioPor[claveEd(campo, x)] = x; });
      unionClaves(eb, em).forEach(function(k){
        if(valEd(eb, k) === valEd(em, k)) return;
        if(k in em){
          if(!lista.some(function(x){ return claveEd(campo, x) === k; })) lista.push(clon(mioPor[k]));
        } else {
          lista = lista.filter(function(x){ return claveEd(campo, x) !== k; });
        }
      });
      res[campo] = lista;
    } else if(campo === 'turnos'){
      res.turnos = res.turnos || [];
      if(rebaseTurnos(base, mio, res) && choques.indexOf('turnos') < 0) choques.push('turnos');
    }
  });
  choques = CAMPOS_DIFF.filter(function(c){ return choques.indexOf(c) >= 0; });
  return { borrador: res, choques: choques };
}

function textoValor(campo, valor){
  if(ESCALARES_ED.indexOf(campo) >= 0 || campo === 'nota' || campo === 'anio'){
    const t = sEd(valor);
    return t ? t : '—';
  }
  const lista = valor || [];
  if(!lista.length) return '—';
  const nula = ['0000', '00', '00'].join('-'); /* fecha ausente (armada así para no parecer un teléfono al check de privacidad) */
  function dm(f){ return f.slice(8, 10) + '/' + f.slice(5, 7); }
  return lista.map(function(x){
    if(campo === 'servicios') return String(x);
    if(campo === 'estudios') return x.estudio + ' (' + (x.tipo_paciente || '?') + ')';
    if(campo === 'licencias') return x.tipo + ' ' + dm(x.desde || nula) + '–' + dm(x.hasta || nula);
    if(campo === 'turnos') return DIAS_CORTOS[x.dia] + ' ' + x.desde + '–' + x.hasta + ' · C' + x.cons;
    if(campo === 'horarios') return DIAS_CORTOS[x.dia] + ' ' + x.desde + '–' + x.hasta + ' (' + x.clase + ')';
    return String(x);
  }).join(' · ');
}

function planTurnos(antes, despues){
  const antesPorId = Object.create(null);
  (antes || []).forEach(function(t){ if(t.id) antesPorId[t.id] = t; });
  const idsDespues = Object.create(null);
  (despues || []).forEach(function(t){ if(t.id) idsDespues[t.id] = true; });
  const crear = [];
  const modificar = [];
  const borrar = [];
  (despues || []).forEach(function(t){
    const campos = { dia: nz(t.dia), cons: nz(t.cons), desde: nz(t.desde), hasta: nz(t.hasta) };
    const a = t.id ? antesPorId[t.id] : undefined;
    if(a === undefined){
      crear.push(campos);
    } else if(['dia', 'cons', 'desde', 'hasta'].some(function(c){ return nz(a[c]) !== campos[c]; })){
      modificar.push({ id: t.id, version: nz(a.version), dia: campos.dia, cons: campos.cons, desde: campos.desde, hasta: campos.hasta });
    }
  });
  (antes || []).forEach(function(t){
    if(t.id && idsDespues[t.id] !== true) borrar.push({ id: t.id, version: nz(t.version) });
  });
  return { crear: crear, modificar: modificar, borrar: borrar };
}

function esReintentoExitoso(b, actual){
  if(b.version === null || b.version === undefined || actual.version !== b.version + 1) return false;
  return diferencias(b, actual).length === 0;
}

function usoCatalogo(tipo, personas){
  const cuenta = Object.create(null);
  (personas || []).forEach(function(p){
    const d = p.datos || {};
    let vals;
    if(tipo === 'servicio') vals = p.servicios || [];
    else if(tipo === 'estudio') vals = (p.estudios || []).map(function(e){ return e.estudio; });
    else if(tipo === 'tipo_licencia') vals = (p.licencias || []).map(function(x){ return x.tipo; });
    else if(tipo === 'subespecialidad') vals = d.subespecialidades || [];
    else if(tipo === 'equipo') vals = d.equipos || [];
    else if(tipo === 'sede_informa') vals = d.sedesInforma || [];
    else vals = [];
    const unicos = Object.create(null);
    vals.forEach(function(v){ if(v) unicos[v] = true; });
    Object.keys(unicos).forEach(function(v){ cuenta[v] = (cuenta[v] || 0) + 1; });
  });
  return cuenta;
}

function itemsCatalogo(tipo, lista){
  return (lista || []).map(function(x){
    const esObj = x !== null && typeof x === 'object';
    const item = { valor: esObj ? nz(x.valor) : x };
    if(tipo === 'estudio') item.grupo = esObj ? nz(x.grupo) : null;
    else if(tipo === 'subespecialidad') item.nota = esObj ? nz(x.nota) : null;
    return item;
  });
}

function valorCatEd(x){
  return x !== null && typeof x === 'object' ? nz(x.valor) : x;
}

function validarCatalogo(antes, despues, uso){
  const errores = [];
  const vistos = Object.create(null);
  const nuevos = Object.create(null);
  (despues || []).forEach(function(x){
    const v = valorCatEd(x);
    const t = sEd(v);
    nuevos[t] = true;
    if(!t){
      errores.push({ valor: v !== null && v !== undefined ? v : '', codigo: 'vacio' });
      return;
    }
    if(largoEd(t) > MAX_TEXTO) errores.push({ valor: v, codigo: 'largo' });
    const k = sinTildes(t);
    if(vistos[k] === true) errores.push({ valor: v, codigo: 'duplicado' });
    vistos[k] = true;
  });
  (antes || []).forEach(function(x){
    const v = valorCatEd(x);
    if(((uso || {})[v] || 0) > 0 && nuevos[sEd(v)] !== true) errores.push({ valor: v, codigo: 'en_uso' });
  });
  return errores;
}

/* == export CSV: lógica pura (espejo de _test/imagenes/exportar_ref.py) == */
const CSV_FORMULA = '=+-@\t\r';

function celdaCsv(v){
  if(v === null || v === undefined) return '';
  let s = String(v);
  const base = s.replace(/^ +/, '');
  if(base.length > 0 && CSV_FORMULA.indexOf(base.charAt(0)) >= 0) s = "'" + s;
  if(/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function lineaCsv(celdas){
  return celdas.map(celdaCsv).join(';');
}

function columnasCsv(tab, contactos, editar){
  const cols = ['Nombre'];
  if(tab === 'residentes') cols.push('Año');
  else if(tab !== 'administrativos') cols.push('Servicios');
  if(contactos){
    if(tab !== 'administrativos') cols.push('Matrícula');
    cols.push('Celular', 'Email');
  }
  cols.push('Semana');
  if(editar) cols.push('Última edición');
  return cols;
}

function filaCsv(p, tab, contactos, editar, turnos, desfaseMin){
  const fila = [nombreLista(p)];
  if(tab === 'residentes'){
    const anio = (p.datos || {}).anio;
    fila.push(anio ? String(anio) : '');
  } else if(tab !== 'administrativos'){
    fila.push((p.servicios || []).join(', '));
  }
  if(contactos){
    if(tab !== 'administrativos') fila.push(p.matricula || '');
    fila.push(p.celular || '', p.email || '');
  }
  fila.push(diasSemana(p, turnos).filter(function(d){ return d >= 0 && d < DIAS_CORTOS.length; }).map(function(d){ return DIAS_CORTOS[d]; }).join(' '));
  if(editar) fila.push(textoEdicion(p.updated_at, p.version, desfaseMin));
  return fila;
}

function textoCsv(tab, personas, contactos, editar, turnos, desfaseMin){
  const lineas = [lineaCsv(columnasCsv(tab, contactos, editar))];
  personas.forEach(function(p){ lineas.push(lineaCsv(filaCsv(p, tab, contactos, editar, turnos, desfaseMin))); });
  return '﻿' + lineas.join('\r\n') + '\r\n';
}

function nombreCsv(tab, hoy){
  return 'imagenes-' + tab + '-' + hoy + '.csv';
}

function textoDescarga(nombre, n){
  return 'Descargado · ' + nombre + ' · ' + n + (n === 1 ? ' fila' : ' filas');
}

function codigoErrorRpc(fn, mensaje){
  if(RPC_ADMIN.indexOf(fn) >= 0 && mensaje != null && /Could not find the function|PGRST202|\b404\b/i.test(String(mensaje))) return 'RESPALDO_NO_DISPONIBLE';
  if(RPC_ESCRITURA.indexOf(fn) >= 0) return 'RED_ESCRITURA';
  return 'RED';
}

function nombreRespaldo(hoy){
  return 'imagenes-respaldo-' + hoy + '.json';
}

function filasRespaldo(conteos, hoy){
  const c = conteos || {};
  const pers = c.personas || {};
  const cats = c.catalogos || {};
  return [
    ['Personas', pers.total || 0],
    ['Cat\u00e1logos', (cats.total || 0) + ' valores'],
    ['Turnos / licencias', (c.turnos || 0) + ' / ' + (c.licencias || 0)],
    ['Archivo', nombreRespaldo(hoy)]
  ];
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
function err(c, detalle){
  const e = new Error(String(c));
  e.codigo = String(c);
  e.detalle = detalle || null;
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
  const escritura = RPC_ESCRITURA.indexOf(fn) >= 0;
  const admin = RPC_ADMIN.indexOf(fn) >= 0;
  if(!escritura && !admin && RPC_LECTURA.indexOf(fn) < 0) throw err('RPC_NO_PERMITIDA');
  if(admin && !esAdmin(E.nivel)) throw err('SIN_PERMISO');
  if(escritura){
    if(!puedeEditar(E.nivel)) throw err('SIN_PERMISO_ESCRITURA');
    if(fn === 'img_catalogo_guardar' && !esAdmin(E.nivel)) throw err('SIN_PERMISO_ESCRITURA');
    const codigoId = await verificarIdentidad();
    if(codigoId !== 'OK') throw err('NO_IDENTIDAD');
  }
  let r;
  try{
    r = await window.sbRpc(fn, args || {});
  }catch(e){
    throw err(codigoErrorRpc(fn, e && e.message));
  }
  if(escritura && (!r || typeof r !== 'object' || Array.isArray(r) || (r.ok !== true && !r.error))) throw err('RED_ESCRITURA');
  if(!r || r.ok !== true){
    const detalle = r ? { version: r.version, campo: r.campo } : null;
    throw err(r && r.error || 'RESPUESTA', detalle);
  }
  return r;
}

function codigoDe(e){
  return e && e.codigo ? e.codigo : 'RESPUESTA';
}

function mensajeDe(c, detalle){
  const propio = function(k){ return Object.prototype.hasOwnProperty.call(MENSAJES, k); };
  if(c === 'INVALIDO' && detalle){
    const k = typeof detalle.campo === 'string' ? 'INVALIDO_' + detalle.campo : 'INVALIDO_otro';
    return propio(k) ? MENSAJES[k] : MENSAJES.INVALIDO_otro;
  }
  return propio(c) && MENSAJES[c] ? MENSAJES[c] : MENSAJES.RESPUESTA;
}

async function cargar(){
  E.cargando = true;
  E.errores = {};
  try{
    const a = await rpc('img_mi_acceso');
    if(NIVELES_VALIDOS.indexOf(a.nivel) < 0){
      E.errores.acceso = 'SIN_PERMISO';
      E.pestanas = [];
      E.cargando = false;
      return;
    }
    E.nivel = a.nivel;
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
  if(res[0].status === 'fulfilled'){
    E.catalogos = res[0].value.catalogos || null;
    E.versionCatalogo = res[0].value.version || {};
  } else E.errores.catalogos = codigoDe(res[0].reason);
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

/* == export CSV: menú y descarga == */
const EXP = { abierto: null, n: 0 };

function expFilas(n){
  return n + (n === 1 ? ' fila' : ' filas');
}

function expItems(tab){
  const titulo = TITULOS[tab] || tab;
  const enVista = ordenar(resultadoDe(tab).lista).length;
  const total = (E.personas[tab] || []).length;
  const items = [];
  /* Con error de carga en la pestaña no hay filas que exportar: el respaldo (que no depende de la pestaña) sigue disponible para admin. */
  if(!E.errores[tab]){
    items.push({ titulo: 'CSV de esta vista', sub: titulo + ' · ' + expFilas(enVista) + ' (con el filtro activo) · columnas visibles', clase: '', alElegir: function(){ expDescargar(tab, 'vista'); } });
    items.push({ titulo: 'CSV de toda la pestaña', sub: titulo + ' · ' + expFilas(total) + ' · sin filtros', clase: '', alElegir: function(){ expDescargar(tab, 'todo'); } });
  }
  if(esAdmin(E.nivel)){
    items.push({ titulo: 'Respaldo completo (JSON)', sub: 'Solo admin · las 4 pestañas, catálogos, agenda y licencias', clase: 'adm', alElegir: function(){ if(esAdmin(E.nivel)) respaldoAbrir(); } });
  }
  return items;
}

const RESP = { ocupado: false };

async function respaldoAbrir(){
  if(!esAdmin(E.nivel)) return;
  if(RESP.ocupado) return;
  RESP.ocupado = true;
  expCerrar(true);
  try{
    const r = await rpc('img_respaldo');
    if(esAdmin(E.nivel)) dlgRespaldo(r);
  }catch(e){
    edToast(mensajeDe(codigoDe(e), e.detalle));
  }finally{
    RESP.ocupado = false;
  }
}

function dlgRespaldo(r){
  if(!esAdmin(E.nivel)) return;
  let datos = r;
  let ocupado = false;
  let ctlResp = null;
  const kv = h('dl', { class: 'kv' });
  filasRespaldo(datos && datos.conteos, E.hoy).forEach(function(f){
    kv.append(h('dt', { texto: f[0] }), h('dd', { texto: String(f[1]) }));
  });
  const chk = h('input', { type: 'checkbox' });
  const cuerpo = [
    h('p', { texto: 'El archivo tiene celulares, emails y matrículas de todo el personal. Guardalo en un lugar seguro, fuera de carpetas compartidas.' }),
    kv,
    h('label', { class: 'chk' }, [chk, h('span', { texto: 'Entiendo que el archivo tiene datos personales' })])
  ];

  function habilitar(){
    const b = ctlResp ? ctlResp.botones[1] : null;
    if(b) b.disabled = ocupado || !chk.checked;
  }

  chk.addEventListener('change', habilitar);
  ctlResp = dlgAbrir({
    titulo: 'Respaldo completo',
    clase: 'aviso',
    cuerpo: cuerpo,
    botones: [
      { texto: 'Cancelar', clase: 'ed-btn', alClic: function(c){ datos = null; c.cerrar(); } },
      { texto: 'Descargar respaldo', clase: 'ed-btn prim', alClic: function(c){
        if(ocupado || !chk.checked || !datos || !esAdmin(E.nivel)) return;
        ocupado = true;
        habilitar();
        const nombre = nombreRespaldo(E.hoy);
        descargarBlob(JSON.stringify(datos, null, 2), 'application/json', nombre);
        datos = null;
        c.cerrar();
        edToast('Descargado · ' + nombre);
      } }
    ],
    alCancelar: function(c){ datos = null; c.cerrar(); }
  });
  habilitar();
}

function expBoton(tab){
  EXP.n += 1;
  const idMenu = 'exp-menu-' + EXP.n;
  const btn = h('button', { type: 'button', class: 'exp-btn ed-btn', texto: '⬇ Exportar ▾', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': idMenu, disabled: !!E.errores[tab] && !esAdmin(E.nivel) });
  const menu = h('div', { class: 'exp-menu', role: 'menu', id: idMenu, 'aria-label': 'Exportar', hidden: true });
  const cont = h('span', { class: 'exp' }, [btn, menu]);
  const ctl = { tab: tab, cont: cont, btn: btn, menu: menu };
  btn.addEventListener('click', function(){
    if(EXP.abierto && EXP.abierto.btn === btn) expCerrar(true);
    else { expCerrar(false); expAbrir(ctl); }
  });
  return cont;
}

function expAbrir(ctl){
  vaciar(ctl.menu);
  expItems(ctl.tab).forEach(function(it){
    if(it.clase === 'adm' && ctl.menu.firstChild) ctl.menu.append(h('div', { class: 'exp-sep', role: 'separator' }));
    const b =h('button', { type: 'button', role: 'menuitem', class: 'exp-it' + (it.clase ? ' ' + it.clase : '') }, [
      h('b', { texto: it.titulo }),
      h('span', { texto: it.sub })
    ]);
    b.addEventListener('click', function(){
      expCerrar(true);
      it.alElegir();
    });
    ctl.menu.append(b);
  });
  ctl.alTecla = function(ev){
    if(ev.key === 'Escape'){
      ev.stopPropagation();
      ev.preventDefault();
      expCerrar(true);
      return;
    }
    if(ev.key === 'ArrowDown' || ev.key === 'ArrowUp'){
      const its = Array.prototype.slice.call(ctl.menu.querySelectorAll('button'));
      if(!its.length) return;
      ev.preventDefault();
      const i = its.indexOf(document.activeElement);
      const sig = ev.key === 'ArrowDown' ? (i + 1) % its.length : (i <= 0 ? its.length - 1 : i - 1);
      its[sig].focus();
      return;
    }
    if(ev.key === 'Tab') expCerrar(false);
  };
  ctl.alPuntero = function(ev){
    if(!ctl.cont.contains(ev.target)) expCerrar(false);
  };
  document.addEventListener('keydown', ctl.alTecla, true);
  document.addEventListener('pointerdown', ctl.alPuntero, true);
  ctl.menu.hidden = false;
  ctl.btn.setAttribute('aria-expanded', 'true');
  EXP.abierto = ctl;
  const primero = ctl.menu.querySelector('button');
  if(primero) primero.focus();
}

function expCerrar(devolverFoco){
  const ctl = EXP.abierto;
  if(!ctl) return;
  EXP.abierto = null;
  document.removeEventListener('keydown', ctl.alTecla, true);
  document.removeEventListener('pointerdown', ctl.alPuntero, true);
  ctl.menu.hidden = true;
  vaciar(ctl.menu);
  ctl.btn.setAttribute('aria-expanded', 'false');
  if(devolverFoco) ctl.btn.focus();
}

function descargarBlob(texto, tipo, nombre){
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = h('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

function expDescargar(tab, modo){
  const lista = modo === 'vista' ? ordenar(resultadoDe(tab).lista) : ordenar(E.personas[tab] || []);
  if(!lista.length){
    edToast('Nada para exportar');
    return;
  }
  const nombre = nombreCsv(tab, E.hoy);
  descargarBlob(textoCsv(tab, lista, E.contactos, puedeEditar(E.nivel), E.turnos, -new Date().getTimezoneOffset()), 'text/csv;charset=utf-8', nombre);
  edToast(textoDescarga(nombre, lista.length));
}

function construirBarra(tab, cont){
  expCerrar(false);
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
  if(puedeEditar(E.nivel)) edBarra(tab, tool);
  const exp = expBoton(tab);
  const iEsp = tool.findIndex(function(el){ return el && el.classList && el.classList.contains('ed-espacio'); });
  if(iEsp >= 0) tool.splice(iEsp + 1, 0, exp);
  else { exp.classList.add('exp-solo'); tool.push(exp); }
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
const FICHA = { velo: null, panel: null, cuerpo: null, cerrar: null, origen: null, edicion: null };
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CLASE_TIPO = { 'A': 'a', 'I': 'i', 'A+I': 'ai', '?': 'q' };
const CLASE_ESTADO = { 'Próxima': 'prox', 'En curso': 'curso', 'Finalizada': 'fin' };

function focosFicha(){
  return Array.prototype.slice.call(FICHA.panel.querySelectorAll('button, [href], input, select, textarea, [role="button"], [tabindex]')).filter(function(el){
    return el.tabIndex >= 0 && !el.disabled;
  });
}

/* Primitivas de UI de edición: solo se llaman desde funciones ed*, cat* y dlg* (con nivel ver no se crea nada). */
const DLG = { pila: [], n: 0 };
const TOAST = { el: null, timer: null };

function edToast(texto){
  if(!TOAST.el){
    TOAST.el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite', hidden: true });
    document.body.append(TOAST.el);
  }
  TOAST.el.textContent = texto;
  TOAST.el.hidden = false;
  clearTimeout(TOAST.timer);
  TOAST.timer = setTimeout(function(){ TOAST.el.hidden = true; }, 4000);
}

function dlgAbrir(op){
  const previo = document.activeElement;
  DLG.n += 1;
  const idTitulo = 'dlg-titulo-' + DLG.n;
  const ctl = { cerrar: null, botones: [] };
  const botones = (op.botones || []).map(function(b){
    const el = h('button', { type: 'button', class: b.clase || 'ed-btn', texto: b.texto });
    el.addEventListener('click', function(){ if(typeof b.alClic === 'function') b.alClic(ctl); });
    return el;
  });
  ctl.botones = botones;
  const caja = h('div', { class: 'dlg' + (op.clase ? ' ' + op.clase : ''), role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': idTitulo, tabindex: '-1' },
    [h('h3', { id: idTitulo, texto: op.titulo || '' })].concat(op.cuerpo || [], [h('div', { class: 'dlg-botones' }, botones)], op.pie || []));
  const velo = h('div', { class: 'dlg-velo' }, [caja]);
  const item = { velo: velo };
  let cerrado = false;

  function focos(){
    return Array.prototype.slice.call(caja.querySelectorAll('button, [href], input, select, textarea, [role="button"], [tabindex]')).filter(function(el){
      return el.tabIndex >= 0 && !el.disabled;
    });
  }

  function tecla(ev){
    if(DLG.pila[DLG.pila.length - 1] !== item) return;
    if(ev.key === 'Escape'){
      ev.preventDefault();
      ev.stopPropagation();
      if(typeof op.alCancelar === 'function') op.alCancelar(ctl); else ctl.cerrar();
      return;
    }
    if(ev.key !== 'Tab') return;
    const f = focos();
    if(!f.length){
      ev.preventDefault();
      caja.focus();
      return;
    }
    const a = document.activeElement;
    if(!caja.contains(a)){
      ev.preventDefault();
      f[0].focus();
    } else if(ev.shiftKey && (a === f[0] || a === caja)){
      ev.preventDefault();
      f[f.length - 1].focus();
    } else if(!ev.shiftKey && a === f[f.length - 1]){
      ev.preventDefault();
      f[0].focus();
    }
  }

  ctl.cerrar = function(){
    if(cerrado) return;
    cerrado = true;
    document.removeEventListener('keydown', tecla, true);
    const i = DLG.pila.indexOf(item);
    if(i >= 0) DLG.pila.splice(i, 1);
    if(velo.parentNode) velo.parentNode.removeChild(velo);
    if(previo && document.contains(previo) && typeof previo.focus === 'function') previo.focus();
  };

  DLG.pila.push(item);
  document.addEventListener('keydown', tecla, true);
  document.body.append(velo);
  if(botones.length) botones[0].focus(); else caja.focus();
  return ctl;
}

function dlgConfirmar(titulo, texto, textoOk, clase){
  return new Promise(function(resolver){
    let ctl = null;
    function fin(v){
      if(ctl) ctl.cerrar();
      resolver(v);
    }
    ctl = dlgAbrir({
      titulo: titulo,
      clase: 'aviso',
      cuerpo: [h('p', { texto: texto })],
      botones: [
        { texto: 'Cancelar', clase: 'ed-btn', alClic: function(){ fin(false); } },
        { texto: textoOk || 'Aceptar', clase: 'ed-btn ' + (clase || 'prim'), alClic: function(){ fin(true); } }
      ],
      alCancelar: function(){ fin(false); }
    });
  });
}

function edSucio(){
  if(!FICHA.edicion) return false;
  if(FICHA.edicion.catalogo === true) return catSucio(FICHA.edicion);
  return contarCambios(FICHA.edicion.base, FICHA.edicion.borrador) > 0;
}

function fichaAbierta(){
  return !!FICHA.velo && !FICHA.velo.hidden;
}

function cerrarFichaYa(){
  if(!fichaAbierta()) return;
  FICHA.edicion = null;
  FICHA.velo.hidden = true;
  document.documentElement.classList.remove('ficha-abierta');
  const o = FICHA.origen;
  FICHA.origen = null;
  if(o && document.contains(o) && typeof o.focus === 'function') o.focus();
}

/* Devuelve una promesa con true si la ficha quedó cerrada (con cambios sin guardar pide confirmación). */
function cerrarFicha(){
  if(!fichaAbierta()) return Promise.resolve(true);
  if(FICHA.edicion && FICHA.edicion.guardando) return Promise.resolve(false);
  if(edSucio()){
    return dlgConfirmar('Cambios sin guardar', 'Si cerrás se pierden los cambios.', 'Cerrar sin guardar', 'peligro').then(function(ok){
      if(ok) cerrarFichaYa();
      return ok;
    });
  }
  cerrarFichaYa();
  return Promise.resolve(true);
}

function teclasFicha(ev){
  if(!FICHA.velo || FICHA.velo.hidden) return;
  if(DLG.pila.length) return;
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
  const cabHijos = [avatar(p), h('div', { class: 'ficha-id' }, [
    h('h2', { id: 'ficha-titulo', texto: (p.nombre || '') + ' ' + (p.apellido || '') }),
    h('div', { class: 'tags' }, etiq)
  ])];
  if(puedeEditar(E.nivel)) cabHijos.push(edBotonEditar(p));
  const cab = h('header', { class: 'ficha-cab' }, cabHijos);
  return [cab, seccionDatos(p), seccionAgenda(p), seccionInformes(p), seccionEstudios(p), seccionLicencias(p), puedeEditar(E.nivel) ? null : h('p', { class: 'pie', texto: 'Solo lectura.' })];
}

function mostrarVelo(){
  if(FICHA.velo.hidden){
    FICHA.origen = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    FICHA.velo.hidden = false;
    document.documentElement.classList.add('ficha-abierta');
  }
  FICHA.panel.scrollTop = 0;
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
  mostrarVelo();
  FICHA.cerrar.focus();
}

function filaTabla(tab, p){
  const celdas = [h('td', {}, [avatar(p), h('span', { class: 'nom', texto: nombreLista(p) }), pillLicencia(p), puedeEditar(E.nivel) && esEditado(p) ? edMarca() : null])];
  if(tab === 'residentes') celdas.push(h('td', { texto: (p.datos || {}).anio ? String(p.datos.anio) : '—' }));
  else if(tab !== 'administrativos') celdas.push(h('td', {}, etiquetas(p)));
  if(E.contactos){
    if(tab !== 'administrativos') celdas.push(h('td', { class: 'col-x', texto: p.matricula || '' }));
    celdas.push(h('td', { class: 'col-x', texto: p.celular || '' }), h('td', { class: 'col-x', texto: p.email || '' }));
  }
  celdas.push(h('td', {}, [semanaMini(p)]));
  if(puedeEditar(E.nivel)) celdas.push(edColumna(tab, p));
  const tr =h('tr', { class: 'fila', tabindex: '0', 'data-id': p.id }, celdas);
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
  if(puedeEditar(E.nivel)) cab.push(edColumna(tab, null));
  return h('div', { class: 'tabla-wrap' }, [h('table', {}, [
    h('thead', {}, [h('tr', {}, cab)]),
    h('tbody', {}, lista.map(function(p){ return filaTabla(tab, p); }))
  ])]);
}

function tarjetaDe(p){
  const hijos = [
    h('span', { class: 'tj-cab' }, [avatar(p), h('span', { class: 'nom', texto: nombreLista(p) }), puedeEditar(E.nivel) && esEditado(p) ? edMarca() : null]),
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

/* == edición: interfaz == */
/* Todo lo que construye controles de edición vive en funciones ed*, cat* y dlg*, y solo se llama con nivel editar/admin. */
const NOMBRE_TIPO = { medicos: 'médico', residentes: 'residente', tecnicos: 'técnico', administrativos: 'administrativo' };
const ED_MSG = { apellido: 'apellido', nombre: 'nombre', celular: 'contacto', email: 'contacto', matricula: 'contacto', estudios: 'estudios', licencias: 'licencias', horarios: 'horarios', turnos: 'horario' };
let ED_N = 0;

function edId(){
  ED_N += 1;
  return 'ed-c-' + ED_N;
}

function edTabDe(tipo){
  const ks = Object.keys(TIPO_DE).filter(function(k){ return TIPO_DE[k] === tipo; });
  return ks.length ? ks[0] : null;
}

function edMarca(){
  return h('span', { class: 'ed-marca', texto: 'editado' });
}

function edColumna(tab, p){
  if(!p) return h('th', { scope: 'col', class: 'ed-col', texto: 'Última edición' });
  return h('td', { class: 'ed-col', texto: textoEdicion(p.updated_at, p.version, -new Date().getTimezoneOffset()) });
}

function edBarra(tab, tool){
  tool.push(h('span', { class: 'ed-espacio' }));
  if(esAdmin(E.nivel)){
    const c = boton('⚙ Catálogos', 'ed-btn contorno', function(){ catAbrir(); });
    c.removeAttribute('aria-pressed');
    tool.push(c);
  }
  const n = boton('+ Nuevo ' + (NOMBRE_TIPO[tab] || ''), 'ed-btn prim', function(){ edAbrirAlta(tab); });
  n.removeAttribute('aria-pressed');
  tool.push(n);
}

function edBotonEditar(p){
  const b = h('button', { type: 'button', class: 'ed-btn contorno', texto: '✏ Editar' });
  b.addEventListener('click', function(){ edAbrir(p.id); });
  return b;
}

/* Catálogos (solo admin): se muestran en la ficha lateral con FICHA.edicion = { catalogo: true, ... }. */
const CAT_TIPOS = [
  { tipo: 'servicio', rotulo: 'Servicios' },
  { tipo: 'estudio', rotulo: 'Estudios' },
  { tipo: 'tipo_licencia', rotulo: 'Tipos de licencia' },
  { tipo: 'subespecialidad', rotulo: 'Subespecialidades' },
  { tipo: 'equipo', rotulo: 'Equipos' },
  { tipo: 'sede_informa', rotulo: 'Sedes que informa' }
];

function catRotulo(tipo){
  const t = CAT_TIPOS.filter(function(x){ return x.tipo === tipo; })[0];
  return t ? t.rotulo : tipo;
}

function catPersonas(){
  let todas = [];
  E.pestanas.forEach(function(t){ todas = todas.concat(E.personas[t] || []); });
  return todas;
}

function catCompleto(){
  return E.pestanas.length >= TABS.length;
}

function catLista(tipo){
  return itemsCatalogo(tipo, (E.catalogos || {})[tipo] || []);
}

function catSucio(ed){
  return JSON.stringify(ed.base) !== JSON.stringify(ed.borrador);
}

function catCargarTipo(ed, tipo){
  ed.tipo = tipo;
  ed.base = catLista(tipo);
  ed.borrador = clon(ed.base);
  ed.errores = [];
  ed.editIdx = -1;
  ed.editTxt = '';
  ed.nuevoTxt = '';
  ed.foco = null;
}

function catAbrir(){
  if(!esAdmin(E.nivel)) return;
  if(!E.catalogos){
    edToast('No se pudieron cargar los catálogos. Recargá la página.');
    return;
  }
  asegurarFicha();
  FICHA.edicion = { catalogo: true, guardando: false, tipo: null, base: [], borrador: [], errores: [], editIdx: -1, editTxt: '', nuevoTxt: '', foco: null, arrastre: -1, pie: null, elAviso: null };
  catCargarTipo(FICHA.edicion, CAT_TIPOS[0].tipo);
  mostrarVelo();
  catPintar();
}

/* Releé img_catalogos (catálogos y versiones) y repinta las barras y vistas que los usan. true si se pudo leer. */
async function catRecargar(){
  try{
    const r = await rpc('img_catalogos');
    E.catalogos = r.catalogos || null;
    E.versionCatalogo = r.version || {};
    delete E.errores.catalogos;
  }catch(e){
    return false;
  }
  Object.keys(REFS).forEach(function(k){ delete REFS[k]; });
  render();
  return true;
}

function catMover(ed, de, a){
  if(ed.guardando || de === a || a < 0 || a >= ed.borrador.length) return;
  const it = ed.borrador.splice(de, 1)[0];
  ed.borrador.splice(a, 0, it);
  ed.editIdx = -1;
  ed.errores = [];
  ed.foco = 'f' + a;
  catPintar();
}

function catAgregar(ed){
  if(ed.guardando) return;
  const v = sEd(ed.nuevoTxt);
  if(!v){
    ed.errores = [{ valor: '', codigo: 'vacio' }];
    catPintar();
    return;
  }
  ed.borrador.push(itemsCatalogo(ed.tipo, [v])[0]);
  ed.nuevoTxt = '';
  ed.errores = [];
  ed.foco = 'nuevo';
  catPintar();
}

function catBorrar(ed, i){
  if(ed.guardando) return;
  ed.borrador.splice(i, 1);
  ed.editIdx = -1;
  ed.errores = [];
  ed.foco = 'nuevo';
  catPintar();
}

function catRenombrar(ed, i){
  const v = sEd(ed.editTxt);
  if(!v){
    ed.errores = [{ valor: '', codigo: 'vacio' }];
    catPintar();
    return;
  }
  ed.borrador[i].valor = v;
  ed.editIdx = -1;
  ed.errores = [];
  ed.foco = 'f' + i;
  catPintar();
}

async function catCambiarTipo(ed, tipo){
  if(ed.guardando || tipo === ed.tipo) return;
  if(catSucio(ed)){
    const ok = await dlgConfirmar('Cambios sin guardar', 'Si cambiás de catálogo se pierden los cambios de este.', 'Descartar cambios', 'peligro');
    if(!ok || FICHA.edicion !== ed) return;
  }
  catCargarTipo(ed, tipo);
  catPintar();
}

function catTextoError(e){
  const m = { vacio: 'hay un valor vacío', largo: 'es demasiado largo', duplicado: 'está repetido', en_uso: 'está en uso por personas: no se puede quitar ni renombrar' };
  const motivo = Object.prototype.hasOwnProperty.call(m, e.codigo) ? m[e.codigo] : 'no es válido';
  return (e.valor ? '«' + e.valor + '»: ' : '') + motivo;
}

function catFila(ed, x, i, uso, enBase, completo){
  const n = enBase[x.valor] === true ? (uso[x.valor] || 0) : 0;
  const nueva = enBase[x.valor] !== true;
  const libre = nueva || (completo && n === 0);
  const editando = ed.editIdx === i;
  const li = h('li', { class: 'cat-fila' });
  const grip = h('span', { class: 'cat-grip', draggable: 'true', 'aria-hidden': 'true', texto: '⋮⋮' });
  grip.addEventListener('dragstart', function(ev){
    if(ed.guardando){ ev.preventDefault(); return; }
    ed.arrastre = i;
    if(ev.dataTransfer){
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(i));
      if(typeof ev.dataTransfer.setDragImage === 'function') ev.dataTransfer.setDragImage(li, 0, 0);
    }
  });
  li.addEventListener('dragover', function(ev){
    if(ed.arrastre >= 0) ev.preventDefault();
  });
  li.addEventListener('drop', function(ev){
    ev.preventDefault();
    const de = ed.arrastre;
    ed.arrastre = -1;
    if(de >= 0) catMover(ed, de, i);
  });
  const subir = h('button', { type: 'button', class: 'ed-btn contorno', 'aria-label': 'Subir', 'data-foco': 'u' + i, texto: '↑', disabled: i === 0 });
  subir.addEventListener('click', function(){ catMover(ed, i, i - 1); });
  const bajar = h('button', { type: 'button', class: 'ed-btn contorno', 'aria-label': 'Bajar', 'data-foco': 'd' + i, texto: '↓', disabled: i === ed.borrador.length - 1 });
  bajar.addEventListener('click', function(){ catMover(ed, i, i + 1); });
  li.append(grip, subir, bajar);
  if(editando){
    const inp = h('input', { type: 'text', class: 'ed-inp', 'aria-label': 'Nuevo nombre del valor', 'data-foco': 'edit', autocomplete: 'off' });
    inp.value = ed.editTxt;
    inp.addEventListener('input', function(){ ed.editTxt = inp.value; });
    inp.addEventListener('keydown', function(ev){
      if(ev.key === 'Enter'){
        ev.preventDefault();
        catRenombrar(ed, i);
      } else if(ev.key === 'Escape'){
        ev.preventDefault();
        ev.stopPropagation();
        ed.editIdx = -1;
        ed.foco = 'f' + i;
        catPintar();
      }
    });
    const ok = h('button', { type: 'button', class: 'ed-btn prim', 'aria-label': 'Aplicar nombre', texto: '✓' });
    ok.addEventListener('click', function(){ catRenombrar(ed, i); });
    const no = h('button', { type: 'button', class: 'ed-btn', 'aria-label': 'Cancelar renombrar', texto: '✕' });
    no.addEventListener('click', function(){ ed.editIdx = -1; ed.foco = 'f' + i; catPintar(); });
    li.append(inp, ok, no);
    return li;
  }
  const extra = ed.tipo === 'estudio' ? x.grupo : (ed.tipo === 'subespecialidad' ? x.nota : null);
  const val = h('span', { class: 'cat-val' }, [x.valor]);
  if(extra) val.append(h('small', { class: 'cat-extra', texto: ' · ' + extra }));
  li.append(val);
  li.append(h('span', { class: 'cat-uso', texto: nueva ? 'nuevo' : (n > 0 ? 'usado por ' + n : (completo ? 'sin uso' : 'uso desconocido')) }));
  if(libre){
    const ren = h('button', { type: 'button', class: 'ed-btn contorno', 'aria-label': 'Renombrar', 'data-foco': 'f' + i, texto: '✏' });
    ren.addEventListener('click', function(){
      if(ed.guardando) return;
      ed.editIdx = i;
      ed.editTxt = x.valor;
      ed.errores = [];
      ed.foco = 'edit';
      catPintar();
    });
    const bor = h('button', { type: 'button', class: 'ed-btn peligro', 'aria-label': 'Borrar', texto: '🗑' });
    bor.addEventListener('click', function(){ catBorrar(ed, i); });
    li.append(ren, bor);
  }
  return li;
}

function catPintarPie(){
  const ed = FICHA.edicion;
  if(!ed || !ed.catalogo || !ed.pie) return;
  const sucio = catSucio(ed);
  ed.elSucio.textContent = '● cambios sin guardar';
  ed.elSucio.hidden = !sucio;
  ed.btnGuardar.disabled = !!ed.guardando;
  ed.btnGuardar.textContent = ed.guardando ? 'Guardando…' : 'Guardar';
  ed.btnCancelar.disabled = !!ed.guardando;
}

function catPintar(){
  const ed = FICHA.edicion;
  if(!ed || !ed.catalogo) return;
  const uso = usoCatalogo(ed.tipo, catPersonas());
  const completo = catCompleto();
  const enBase = Object.create(null);
  ed.base.forEach(function(x){ enBase[x.valor] = true; });
  vaciar(FICHA.cuerpo);
  ed.elAviso = null;

  const lado = h('nav', { class: 'cat-lado', 'aria-label': 'Tipos de catálogo' }, CAT_TIPOS.map(function(t){
    const n = ((E.catalogos || {})[t.tipo] || []).length;
    const b = h('button', { type: 'button', 'aria-current': t.tipo === ed.tipo ? 'true' : false, texto: t.rotulo + ' (' + n + ')' });
    b.addEventListener('click', function(){ catCambiarTipo(ed, t.tipo); });
    return b;
  }));

  const inpNuevo = h('input', { type: 'text', class: 'ed-inp', placeholder: 'Nuevo valor…', 'aria-label': 'Nuevo valor', 'data-foco': 'nuevo', autocomplete: 'off' });
  inpNuevo.value = ed.nuevoTxt;
  inpNuevo.addEventListener('input', function(){ ed.nuevoTxt = inpNuevo.value; });
  inpNuevo.addEventListener('keydown', function(ev){
    if(ev.key === 'Enter'){
      ev.preventDefault();
      catAgregar(ed);
    }
  });
  const btnAgregar = h('button', { type: 'button', class: 'ed-btn prim', texto: '+ Agregar' });
  btnAgregar.addEventListener('click', function(){ catAgregar(ed); });

  const main = h('div', { class: 'cat-main' }, [
    h('div', { class: 'cat-fila' }, [inpNuevo, btnAgregar])
  ]);
  ed.errores.forEach(function(e){ main.append(h('p', { class: 'ed-error', role: 'alert', texto: catTextoError(e) })); });
  if(!completo){
    main.append(h('p', { class: 'nota', texto: 'Conteo sobre las pestañas que tenés asignadas: por eso no se puede borrar ni renombrar valores ya guardados.' }));
  } else {
    main.append(h('p', { class: 'nota', texto: 'Un valor en uso no se borra ni se renombra. Arrastrá ⋮⋮ o usá ↑ ↓ para ordenar.' }));
  }
  main.append(h('ul', { class: 'cat-lista' }, ed.borrador.map(function(x, i){ return catFila(ed, x, i, uso, enBase, completo); })));

  ed.elSucio = h('span', { class: 'ed-sucio' });
  ed.btnCancelar = h('button', { type: 'button', class: 'ed-btn', texto: 'Cancelar' });
  ed.btnCancelar.addEventListener('click', function(){ cerrarFicha(); });
  ed.btnGuardar = h('button', { type: 'button', class: 'ed-btn prim', texto: 'Guardar' });
  ed.btnGuardar.addEventListener('click', function(){ catGuardar(); });
  ed.pie = h('div', { class: 'ed-pie' }, [ed.elSucio, ed.btnCancelar, ed.btnGuardar]);

  FICHA.cuerpo.append(
    h('header', { class: 'ficha-cab' }, [h('div', { class: 'ficha-id' }, [
      h('h2', { id: 'ficha-titulo', texto: 'CATÁLOGOS' }),
      h('p', { class: 'nota', texto: catRotulo(ed.tipo) })
    ])]),
    h('div', { class: 'cat-panel' }, [lado, main]),
    ed.pie
  );
  catPintarPie();
  if(ed.foco){
    const el = FICHA.cuerpo.querySelector('[data-foco="' + ed.foco + '"]');
    ed.foco = null;
    if(el) el.focus();
  }
}

/* Falla al guardar un catálogo (ya se informó por edAviso). */
async function catFallo(ed, e){
  const c = codigoDe(e);
  if(c === 'CONFLICTO'){
    await catRecargar();
    if(FICHA.edicion !== ed) return;
    catCargarTipo(ed, ed.tipo);
    catPintar();
    edAviso('Otro admin cambió este catálogo; se recargó. Volvé a aplicar tu cambio.');
    return;
  }
  if(c === 'RED_ESCRITURA'){
    await catRecargar();
    if(FICHA.edicion !== ed) return;
    ed.base = catLista(ed.tipo);
    catPintar();
    edAviso(MENSAJES.RED_ESCRITURA);
    return;
  }
  edAviso(mensajeDe(c, e.detalle));
}

async function catGuardar(){
  const ed = FICHA.edicion;
  if(!ed || !ed.catalogo || ed.guardando || !esAdmin(E.nivel)) return;
  const uso = usoCatalogo(ed.tipo, catPersonas());
  const errores = validarCatalogo(ed.base, ed.borrador, uso);
  ed.editIdx = -1;
  ed.errores = errores;
  if(errores.length){
    catPintar();
    return;
  }
  catPintar();
  const tipo = ed.tipo;
  ed.guardando = true;
  catPintarPie();
  try{
    let r = null;
    try{
      r = await rpc('img_catalogo_guardar', { p_tipo: tipo, p_items: itemsCatalogo(tipo, ed.borrador), p_version: E.versionCatalogo[tipo] || 0 });
    }catch(e){
      await catFallo(ed, e);
      return;
    }
    E.versionCatalogo[tipo] = r.version;
    const recargado = await catRecargar();
    if(FICHA.edicion === ed){
      ed.base = recargado ? catLista(tipo) : itemsCatalogo(tipo, ed.borrador);
      ed.borrador = clon(ed.base);
      catPintar();
    }
    edToast('Catálogo guardado · ' + catRotulo(tipo) + ' · v' + r.version + (recargado ? '' : ' · recargá la página para ver los cambios'));
  }finally{
    ed.guardando = false;
    if(FICHA.edicion === ed) catPintarPie();
  }
}

function edAbrir(id){
  if(!puedeEditar(E.nivel)) return;
  const p = buscarPersona(id);
  if(!p) return;
  /* Ausente != vacío: sin las tres claves de contacto, guardar las borraría en silencio; la ficha queda en solo lectura. */
  if(!tieneContactos(p)){
    edToast('Esta ficha se cargó sin celular, email ni matrícula: queda en solo lectura. Recargá la página.');
    return;
  }
  asegurarFicha();
  const base = borradorDe(p, E.turnos);
  FICHA.edicion = { base: base, borrador: clon(base), guardando: false, alta: false, tab: edTabDe(p.tipo), campos: {}, form: null, pie: null };
  mostrarVelo();
  edFormulario();
}

function edAbrirAlta(tab){
  if(!puedeEditar(E.nivel)) return;
  asegurarFicha();
  const b = borradorNuevo(TIPO_DE[tab], ordenAlta(E.personas[tab] || []));
  FICHA.edicion = { base: clon(b), borrador: b, guardando: false, alta: true, tab: tab, campos: {}, form: null, pie: null };
  mostrarVelo();
  edFormulario();
}

function edRegistrar(campo, ctl, caja){
  FICHA.edicion.campos[campo] = { ctl: ctl, caja: caja, err: null };
}

function edQuitarError(c){
  if(c.err && c.err.parentNode) c.err.parentNode.removeChild(c.err);
  c.err = null;
  c.ctl.removeAttribute('aria-invalid');
}

function edError(campo, texto){
  const ed = FICHA.edicion;
  const c = ed ? ed.campos[campo] : null;
  if(!c) return null;
  edQuitarError(c);
  c.ctl.setAttribute('aria-invalid', 'true');
  c.err = h('p', { class: 'ed-error', role: 'alert', texto: texto });
  c.caja.append(c.err);
  return c.ctl;
}

function edCambio(campo){
  const ed = FICHA.edicion;
  if(!ed) return;
  const c = ed.campos[campo];
  if(c) edQuitarError(c);
  edPintarPie();
}

/* Marca los campos inválidos (mensaje por campo, sin valores del usuario) y lleva el foco al primero en pantalla. */
function edMostrarErrores(lista){
  const ed = FICHA.edicion;
  if(!ed) return;
  Object.keys(ed.campos).forEach(function(k){ edQuitarError(ed.campos[k]); });
  const vistos = {};
  const ctls = [];
  lista.forEach(function(e){
    if(vistos[e.campo] === true) return;
    vistos[e.campo] = true;
    const ctl = edError(e.campo, mensajeDe('INVALIDO', { campo: ED_MSG[e.campo] || 'otro' }));
    if(ctl) ctls.push(ctl);
  });
  let primero = null;
  ctls.forEach(function(c){
    if(!primero || (primero.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_PRECEDING)) primero = c;
  });
  if(primero) primero.focus();
}

function edCampo(campo, etiqueta, id, control, extra){
  const caja = h('div', { class: 'ed-campo' }, [h('label', { for: id, texto: etiqueta }), control].concat(extra || []));
  edRegistrar(campo, control, caja);
  return caja;
}

function edInput(campo, etiqueta, modo){
  const ed = FICHA.edicion;
  const id = edId();
  const inp = h('input', { id: id, class: 'ed-inp', type: 'text', autocomplete: 'off', placeholder: etiqueta });
  if(modo) inp.setAttribute('inputmode', modo);
  const v = ed.borrador[campo];
  inp.value = v === null || v === undefined ? '' : String(v);
  inp.addEventListener('input', function(){
    ed.borrador[campo] = inp.value;
    edCambio(campo);
  });
  return edCampo(campo, etiqueta, id, inp);
}

function edSecDatos(){
  const ed = FICHA.edicion;
  const tipo = ed.borrador.tipo;
  const hijos = [h('h3', { texto: 'Datos' }), h('div', { class: 'ed-g2' }, [edInput('apellido', 'Apellido'), edInput('nombre', 'Nombre')]),
    h('div', { class: 'ed-g2' }, [edInput('celular', 'Celular', 'tel'), edInput('email', 'Email', 'email')])];
  if(tipo !== 'administrativo') hijos.push(edInput('matricula', 'Matrícula'));
  if(tipo === 'residente'){
    const id = edId();
    const actual = (ed.borrador.datos || {}).anio;
    const valores = ANIOS.map(function(n){ return n + 'º año'; });
    if(actual && valores.indexOf(String(actual)) < 0) valores.push(String(actual));
    const sel = h('select', { id: id, class: 'ed-inp' }, [opcion('', 'Sin año')].concat(valores.map(function(t){ return opcion(t, t); })));
    sel.value = actual ? String(actual) : '';
    sel.addEventListener('change', function(){
      if(sel.value) ed.borrador.datos.anio = sel.value; else delete ed.borrador.datos.anio;
      edCambio('anio');
    });
    hijos.push(edCampo('anio', 'Año', id, sel));
  }
  const idNota = edId();
  const ta = h('textarea', { id: idNota, class: 'ed-inp', rows: '4' });
  ta.value = (ed.borrador.datos || {}).nota ? String(ed.borrador.datos.nota) : '';
  ta.addEventListener('input', function(){
    if(ta.value === '') delete ed.borrador.datos.nota; else ed.borrador.datos.nota = ta.value;
    edCambio('nota');
  });
  hijos.push(edCampo('nota', 'Nota', idNota, ta, [h('span', { class: 'ed-aviso', texto: AVISO_NOTA.charAt(0).toUpperCase() + AVISO_NOTA.slice(1) })]));
  return h('section', { class: 'ed-sec' }, hijos);
}

function edSecServicios(){
  const b = FICHA.edicion.borrador;
  if(b.tipo !== 'medico' && b.tipo !== 'tecnico') return null;
  const todos = ((E.catalogos || {}).servicio || []).slice();
  b.servicios.forEach(function(s){ if(todos.indexOf(s) < 0) todos.push(s); });
  const caja = h('div', { class: 'ed-chips', role: 'group', 'aria-label': 'Servicios', tabindex: '-1' });
  todos.forEach(function(s){
    const c = h('button', { type: 'button', class: 'ed-chip', 'aria-pressed': b.servicios.indexOf(s) >= 0 ? 'true' : 'false', texto: s });
    c.addEventListener('click', function(){
      const i = b.servicios.indexOf(s);
      if(i >= 0) b.servicios.splice(i, 1); else b.servicios.push(s);
      c.setAttribute('aria-pressed', i >= 0 ? 'false' : 'true');
      edCambio('servicios');
    });
    caja.append(c);
  });
  const sec = h('section', { class: 'ed-sec' }, [h('h3', { texto: 'Servicios' }), caja]);
  edRegistrar('servicios', caja, sec);
  return sec;
}

function edSecEstudios(){
  const b = FICHA.edicion.borrador;
  if(b.tipo !== 'medico') return null;
  const catalogo = (E.catalogos || {}).estudio || [];
  const filas = h('div', { class: 'ed-filas', tabindex: '-1' });
  const lista = h('datalist', { id: edId() });
  catalogo.forEach(function(e){ lista.append(h('option', { value: e.valor })); });
  const buscar = h('input', { id: edId(), class: 'ed-inp', type: 'text', list: lista.id, autocomplete: 'off', placeholder: 'Agregar estudio…', 'aria-label': 'Agregar estudio' });
  const sec = h('section', { class: 'ed-sec' }, [h('h3', { texto: 'Estudios que realiza' }), filas, buscar, lista]);
  edRegistrar('estudios', buscar, sec);

  function pintar(){
    vaciar(filas);
    b.estudios.forEach(function(e){
      const botones = TIPOS_PACIENTE_ED.map(function(t){
        const bt = h('button', { type: 'button', 'aria-pressed': e.tipo_paciente === t ? 'true' : 'false', title: TIPO_PACIENTE[t], 'aria-label': e.estudio + ': ' + TIPO_PACIENTE[t], texto: t });
        bt.addEventListener('click', function(){
          e.tipo_paciente = t;
          botones.forEach(function(x, i){ x.setAttribute('aria-pressed', TIPOS_PACIENTE_ED[i] === t ? 'true' : 'false'); });
          edCambio('estudios');
        });
        return bt;
      });
      const quitar = h('button', { type: 'button', class: 'ed-x', 'aria-label': 'Quitar ' + e.estudio, texto: '✕' });
      quitar.addEventListener('click', function(){
        const i = b.estudios.indexOf(e);
        if(i >= 0) b.estudios.splice(i, 1);
        pintar();
        edCambio('estudios');
      });
      filas.append(h('div', { class: 'ed-est' }, [h('span', { texto: e.estudio }), h('div', { class: 'ed-seg', role: 'group', 'aria-label': 'Tipo de paciente' }, botones), quitar]));
    });
  }

  function agregar(){
    const v = buscar.value.trim();
    if(!v) return;
    const oficial = catalogo.filter(function(e){ return sinTildes(e.valor) === sinTildes(v); })[0];
    if(!oficial){ edError('estudios', 'Elegí un estudio de la lista.'); return; }
    if(b.estudios.some(function(x){ return x.estudio === oficial.valor; })){ edError('estudios', 'Ese estudio ya está cargado.'); return; }
    b.estudios.push({ estudio: oficial.valor, tipo_paciente: '?' });
    buscar.value = '';
    pintar();
    edCambio('estudios');
  }

  buscar.addEventListener('change', agregar);
  buscar.addEventListener('keydown', function(ev){
    if(ev.key === 'Enter'){ ev.preventDefault(); agregar(); }
  });
  pintar();
  return sec;
}

function edHora(t, campo, etiqueta, nodoCampo){
  const inp = h('input', { type: 'time', class: 'ed-inp', 'aria-label': etiqueta });
  inp.value = t[campo] ? String(t[campo]) : '';
  inp.addEventListener('input', function(){ t[campo] = inp.value; edCambio(nodoCampo); });
  return inp;
}

function edSecAgenda(){
  const b = FICHA.edicion.borrador;
  if(b.tipo === 'administrativo'){
    const items = itemsHorario(b, 'trabajo');
    const cont = h('div', { tabindex: '-1' }, [items.length ? semanaFicha(items) : h('p', { class: 'nota', texto: 'Sin horarios cargados' })]);
    const sec = h('section', { class: 'ed-sec' }, [h('h3', { texto: 'Horarios de trabajo' }), cont, h('p', { class: 'nota', texto: 'Solo lectura: los horarios no se editan acá.' })]);
    edRegistrar('horarios', cont, sec);
    return sec;
  }
  if(b.tipo !== 'medico') return null;
  const filas = h('div', { class: 'ed-filas', tabindex: '-1' });
  const agregarTurno = h('button', { type: 'button', class: 'ed-chip add', texto: '+ Turno' });
  const sec = h('section', { class: 'ed-sec' }, [h('h3', { texto: 'Agenda Eco/Doppler' }), filas, h('div', { class: 'ed-chips' }, [agregarTurno]),
    h('p', { class: 'nota', texto: 'Consultorio 1 o 2 · se ve en el Cronograma al guardar' })]);
  edRegistrar('turnos', filas, sec);

  function pintar(){
    vaciar(filas);
    b.turnos.forEach(function(t){
      const opsDia = DIAS_CORTOS.map(function(n, i){ return i < 6 || t.dia === i ? opcion(String(i), n) : null; }).filter(Boolean);
      const sDia = h('select', { class: 'ed-inp', 'aria-label': 'Día' }, opsDia);
      sDia.value = t.dia === null || t.dia === undefined ? '' : String(t.dia);
      sDia.addEventListener('change', function(){ t.dia = Number(sDia.value); edCambio('turnos'); });
      const sCons = h('select', { class: 'ed-inp', 'aria-label': 'Consultorio' }, CONSULTORIOS.map(function(c){ return opcion(String(c), 'Consultorio ' + c); }));
      sCons.value = t.cons === null || t.cons === undefined ? '' : String(t.cons);
      sCons.addEventListener('change', function(){ t.cons = Number(sCons.value); edCambio('turnos'); });
      const quitar = h('button', { type: 'button', class: 'ed-x', 'aria-label': 'Quitar turno', texto: '✕' });
      quitar.addEventListener('click', function(){
        const i = b.turnos.indexOf(t);
        if(i >= 0) b.turnos.splice(i, 1);
        pintar();
        edCambio('turnos');
      });
      filas.append(h('div', { class: 'ed-fila t5' }, [sDia, sCons, edHora(t, 'desde', 'Desde', 'turnos'), edHora(t, 'hasta', 'Hasta', 'turnos'), quitar]));
    });
  }

  agregarTurno.addEventListener('click', function(){
    b.turnos.push({ id: null, version: null, dia: 0, cons: 1, desde: '08:00', hasta: '09:00' });
    pintar();
    edCambio('turnos');
  });
  pintar();
  return sec;
}

function edSecLicencias(){
  const b = FICHA.edicion.borrador;
  const tipos = ((E.catalogos || {}).tipo_licencia || []).slice();
  const filas = h('div', { class: 'ed-filas', tabindex: '-1' });
  const agregarLic = h('button', { type: 'button', class: 'ed-chip add', texto: '+ Licencia' });
  const sec = h('section', { class: 'ed-sec' }, [h('h3', { texto: 'Licencias' }), filas, h('div', { class: 'ed-chips' }, [agregarLic]),
    h('p', { class: 'nota', texto: 'Inicio y fin son obligatorios.' })]);
  edRegistrar('licencias', filas, sec);

  function fecha(l, campo, etiqueta){
    const inp = h('input', { type: 'date', class: 'ed-inp', 'aria-label': etiqueta });
    inp.value = l[campo] ? String(l[campo]) : '';
    inp.addEventListener('input', function(){ l[campo] = inp.value; edCambio('licencias'); });
    return inp;
  }

  function pintar(){
    vaciar(filas);
    b.licencias.forEach(function(l){
      const valores = tipos.slice();
      if(l.tipo && valores.indexOf(l.tipo) < 0) valores.push(l.tipo);
      const sTipo = h('select', { class: 'ed-inp', 'aria-label': 'Tipo de licencia' }, [opcion('', 'Tipo…')].concat(valores.map(function(v){ return opcion(v, v); })));
      sTipo.value = l.tipo || '';
      sTipo.addEventListener('change', function(){ l.tipo = sTipo.value; edCambio('licencias'); });
      const quitar = h('button', { type: 'button', class: 'ed-x', 'aria-label': 'Quitar licencia', texto: '✕' });
      quitar.addEventListener('click', function(){
        const i = b.licencias.indexOf(l);
        if(i >= 0) b.licencias.splice(i, 1);
        pintar();
        edCambio('licencias');
      });
      filas.append(h('div', { class: 'ed-fila' }, [sTipo, fecha(l, 'desde', 'Desde'), fecha(l, 'hasta', 'Hasta (obligatorio)'), quitar]));
    });
  }

  agregarLic.addEventListener('click', function(){
    b.licencias.push({ tipo: tipos.length ? tipos[0] : '', desde: '', hasta: '' });
    pintar();
    edCambio('licencias');
  });
  pintar();
  return sec;
}

/* Baja: confirmación escribiendo el apellido (el de la base, no el editado). */
function edSecBaja(){
  if(FICHA.edicion.alta) return null;
  const btn = h('button', { type: 'button', class: 'ed-btn peligro', texto: '🗑 Dar de baja a esta persona' });
  btn.addEventListener('click', function(){ edBaja(); });
  return h('section', { class: 'ed-sec' }, [h('h3', { texto: 'Baja' }), h('p', { class: 'nota', texto: 'Pide confirmación escribiendo el apellido.' }), btn]);
}

function edBaja(){
  const ed = FICHA.edicion;
  if(!ed || ed.alta || ed.guardando) return;
  const base = ed.base;
  const n = (E.turnos || []).filter(function(t){ return !t.es_residentes && t.persona_id === base.id; }).length;
  const idInp = edId();
  const inp = h('input', { id: idInp, class: 'ed-inp', type: 'text', autocomplete: 'off', placeholder: 'Apellido' });
  const texto = 'Se borra la ficha de forma definitiva' + (n > 0 ? ' y sus ' + n + (n === 1 ? ' turno' : ' turnos') + ' del Cronograma Eco' : '') + '. No se puede deshacer.';
  const cuerpo = [h('p', { texto: texto })];
  if(edSucio()) cuerpo.push(h('p', { class: 'nota', texto: 'Los cambios sin guardar de esta ficha también se descartan.' }));
  cuerpo.push(h('div', { class: 'ed-campo' }, [h('label', { for: idInp, texto: 'Escribí el apellido para confirmar' }), inp]));
  let ocupado = false;
  let ctlBaja = null;

  function habilitar(){
    const b = ctlBaja ? ctlBaja.botones[1] : null;
    if(b) b.disabled = ocupado || !confirmaBaja(inp.value, base.apellido);
  }

  inp.addEventListener('input', habilitar);
  inp.addEventListener('keydown', function(ev){
    if(ev.key !== 'Enter') return;
    ev.preventDefault();
    if(ctlBaja && !ctlBaja.botones[1].disabled) ctlBaja.botones[1].click();
  });
  ctlBaja = dlgAbrir({
    titulo: 'Dar de baja',
    clase: 'aviso',
    cuerpo: cuerpo,
    botones: [
      { texto: 'Cancelar', clase: 'ed-btn', alClic: function(c){ if(!ocupado) c.cerrar(); } },
      { texto: 'Dar de baja', clase: 'ed-btn peligro', alClic: async function(c){
        if(ocupado || !confirmaBaja(inp.value, base.apellido)) return;
        ocupado = true;
        habilitar();
        c.botones[0].disabled = true;
        inp.disabled = true;
        let fallo = null;
        try{
          await rpc('img_persona_borrar', { p_id: base.id, p_version: base.version });
        }catch(e){
          fallo = e;
        }
        c.cerrar();
        if(fallo === null) await edBajaHecha(ed, base); else await edBajaFallo(ed, base, fallo);
      } }
    ],
    alCancelar: function(c){ if(!ocupado) c.cerrar(); }
  });
  habilitar();
  inp.focus();
}

async function edBajaHecha(ed, base){
  edToast('Dado de baja · ' + sEd(base.apellido) + ', ' + sEd(base.nombre));
  if(FICHA.edicion === ed) cerrarFichaYa();
  await edRecargar(edTabDe(base.tipo) || ed.tab, ed.tab);
}

async function edBajaFallo(ed, base, e){
  const c = codigoDe(e);
  if(c === 'NO_EXISTE'){
    edFichaBorrada(ed);
    return;
  }
  if(c === 'CONFLICTO'){
    edAviso('Otra persona cambió esta ficha; recargala antes de darla de baja.');
    await edConflicto(ed, ed.borrador, 'persona');
    return;
  }
  if(c === 'RED_ESCRITURA'){
    try{
      await rpc('img_ficha', { p_id: base.id });
    }catch(e2){
      if(codigoDe(e2) === 'NO_EXISTE'){
        await edBajaHecha(ed, base);
        return;
      }
    }
    edAviso(MENSAJES.RED_ESCRITURA);
    return;
  }
  edAviso(mensajeDe(c, e.detalle));
}

function edFormulario(){
  const ed = FICHA.edicion;
  ed.campos = {};
  ed.pie = null;
  ed.elAviso = null;
  vaciar(FICHA.cuerpo);
  const titulo = ed.alta ? 'NUEVO ' + String(NOMBRE_TIPO[ed.tab] || ed.borrador.tipo).toUpperCase() : 'EDITANDO';
  const sub = ed.alta ? 'Se agrega a ' + (TITULOS[ed.tab] || '') : ((ed.base.nombre || '') + ' ' + (ed.base.apellido || '')).trim();
  const form = h('form', { class: 'ed-form', novalidate: true }, [
    h('header', { class: 'ficha-cab' }, [h('div', { class: 'ficha-id' }, [h('h2', { id: 'ficha-titulo', texto: titulo }), h('p', { class: 'nota', texto: sub })])])
  ]);
  ed.form = form;
  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    edGuardar();
  });
  FICHA.cuerpo.append(form);
  [edSecDatos(), edSecServicios(), edSecEstudios(), edSecAgenda(), edSecLicencias(), edSecBaja()].forEach(function(s){
    if(s) form.append(s);
  });
  edPintarPie();
  FICHA.panel.scrollTop = 0;
  if(ed.campos.apellido) ed.campos.apellido.ctl.focus();
}

function edPintarPie(){
  const ed = FICHA.edicion;
  if(!ed || !ed.form) return;
  if(!ed.pie){
    ed.elSucio = h('span', { class: 'ed-sucio' });
    ed.elUltima = h('span', { class: 'aux', texto: ed.alta ? 'Nueva' : 'Última edición: ' + textoEdicion(ed.base.updated_at, ed.base.version, -new Date().getTimezoneOffset()) });
    ed.btnCancelar = h('button', { type: 'button', class: 'ed-btn', texto: 'Cancelar' });
    ed.btnCancelar.addEventListener('click', function(){ cerrarFicha(); });
    ed.btnGuardar = h('button', { type: 'submit', class: 'ed-btn prim', texto: 'Guardar' });
    ed.pie = h('div', { class: 'ed-pie' }, [ed.elSucio, ed.elUltima, ed.btnCancelar, ed.btnGuardar]);
    ed.form.append(ed.pie);
  }
  const n = contarCambios(ed.base, ed.borrador);
  ed.elSucio.textContent = '● ' + n + (n === 1 ? ' cambio' : ' cambios') + ' sin guardar';
  ed.elSucio.hidden = n === 0;
  ed.btnGuardar.disabled = !!ed.guardando;
  ed.btnGuardar.textContent = ed.guardando ? 'Guardando…' : 'Guardar';
  ed.btnCancelar.disabled = !!ed.guardando;
}

/* Aviso en el pie de la ficha (errores de guardado que no son de un campo). */
function edAviso(texto){
  const ed = FICHA.edicion;
  if(!ed || !ed.pie) return;
  if(!ed.elAviso){
    ed.elAviso = h('p', { class: 'ed-error', role: 'alert' });
    ed.pie.insertBefore(ed.elAviso, ed.pie.firstChild);
  }
  ed.elAviso.textContent = texto || '';
  ed.elAviso.hidden = !texto;
}

function edEtiquetaCampo(campo){
  const m = { apellido: 'Apellido', nombre: 'Nombre', matricula: 'Matrícula', celular: 'Celular', email: 'Email', nota: 'Nota', anio: 'Año',
    servicios: 'Servicios', estudios: 'Estudios', licencias: 'Licencias', horarios: 'Horarios', turnos: 'Turnos Eco' };
  return Object.prototype.hasOwnProperty.call(m, campo) ? m[campo] : campo;
}

/* Relee las listas afectadas (y el cronograma si es médico) y repinta; nunca recarga la página. true si todo se pudo leer. */
async function edRecargar(tab, origen){
  const tabs = [];
  [tab, origen].forEach(function(t){
    if(t && E.pestanas.indexOf(t) >= 0 && tabs.indexOf(t) < 0) tabs.push(t);
  });
  const conCrono = E.pestanas.indexOf('medicos') >= 0 && tabs.indexOf('medicos') >= 0;
  const tareas = tabs.map(function(t){ return rpc('img_listar', { p_tipo: TIPO_DE[t] }); });
  if(conCrono) tareas.push(rpc('img_cronograma', { p_vista: 'eco' }));
  const res = await Promise.allSettled(tareas);
  let ok = true;
  tabs.forEach(function(t, i){
    const x = res[i];
    if(x.status === 'fulfilled'){
      E.personas[t] = Array.isArray(x.value.personas) ? x.value.personas : [];
      delete E.errores[t];
    } else ok = false;
  });
  if(conCrono){
    const x = res[res.length - 1];
    if(x.status === 'fulfilled'){
      E.turnos = Array.isArray(x.value.turnos) ? x.value.turnos : [];
      delete E.errores.cronograma;
    } else ok = false;
  }
  render();
  return ok;
}

/* Turnos de un médico: persona -> turnos en secuencia, sin abortar; devuelve la lista de fallas. */
async function edTurnosAplicar(id, antes, despues){
  const plan = planTurnos(antes, despues);
  const fallas = [];
  async function uno(fn, args, turno){
    try{
      await rpc(fn, args);
    }catch(e){
      fallas.push({ codigo: codigoDe(e), detalle: e.detalle || null, texto: turno ? textoValor('turnos', [turno]) : 'turno' });
    }
  }
  for(let i = 0; i < plan.crear.length; i++){
    const t = plan.crear[i];
    await uno('img_turno_guardar', { p_turno: { es_residentes: false, persona_id: id, dia: t.dia, cons: t.cons, desde: t.desde, hasta: t.hasta }, p_version: null }, t);
  }
  for(let i = 0; i < plan.modificar.length; i++){
    const t = plan.modificar[i];
    await uno('img_turno_guardar', { p_turno: { id: t.id, es_residentes: false, persona_id: id, dia: t.dia, cons: t.cons, desde: t.desde, hasta: t.hasta }, p_version: t.version }, t);
  }
  for(let i = 0; i < plan.borrar.length; i++){
    const t = plan.borrar[i];
    const previo = (antes || []).filter(function(x){ return x.id === t.id; })[0] || null;
    await uno('img_turno_borrar', { p_id: t.id, p_version: t.version }, previo);
  }
  return fallas;
}

/* La ficha ya no existe (otra persona la dio de baja): aviso y se cierra la edición sin guardar. */
function edFichaBorrada(ed){
  function fin(c){
    c.cerrar();
    if(FICHA.edicion === ed) cerrarFichaYa();
    edRecargar(ed.tab, ed.tab);
  }
  dlgAbrir({
    titulo: 'La ficha ya no existe',
    clase: 'aviso',
    cuerpo: [h('p', { texto: 'La ficha fue dada de baja por otra persona.' })],
    botones: [{ texto: 'Entendido', clase: 'ed-btn prim', alClic: fin }],
    alCancelar: fin
  });
}

/* Modal del conflicto (boceto): diferencias campo por campo; sin nombre de la otra persona. Devuelve 'descartar', 'reaplicar' o null (Esc). */
function dlgConflicto(base, mio, actual){
  return new Promise(function(resolver){
    let ctl = null;
    function fin(v){
      if(ctl) ctl.cerrar();
      resolver(v);
    }
    const dm = diferencias(base, mio).map(function(d){ return d.campo; });
    const da = diferencias(base, actual).map(function(d){ return d.campo; });
    const filas = [h('div', { class: 'diff-fila h' }, [h('div', { texto: 'Campo' }), h('div', { texto: 'Tu cambio' }), h('div', { texto: 'Lo que quedó guardado' })])];
    CAMPOS_DIFF.filter(function(c){ return dm.indexOf(c) >= 0 || da.indexOf(c) >= 0; }).forEach(function(c){
      filas.push(h('div', { class: 'diff-fila' }, [
        h('div', { texto: edEtiquetaCampo(c) }),
        h('div', { class: 'mio', texto: textoValor(c, valorOriginal(c, mio)) }),
        h('div', { class: 'suyo', texto: textoValor(c, valorOriginal(c, actual)) })
      ]));
    });
    ctl = dlgAbrir({
      titulo: '⚠ Alguien guardó antes que vos',
      clase: 'aviso ancho',
      cuerpo: [
        h('p', { texto: 'Otra persona guardó cambios en esta ficha mientras la editabas. Tu guardado no se aplicó para no pisar lo suyo.' }),
        h('div', { class: 'diff' }, filas),
        h('p', { texto: 'Elegí qué hacer:' })
      ],
      botones: [
        { texto: 'Descartar lo mío', clase: 'ed-btn', alClic: function(){ fin('descartar'); } },
        { texto: 'Recargar y volver a aplicar lo mío', clase: 'ed-btn prim', alClic: function(){ fin('reaplicar'); } }
      ],
      pie: [h('p', { class: 'nota', texto: '"Recargar y volver a aplicar" trae lo guardado por la otra persona y repone encima solo los campos que cambiaste vos; después revisás y guardás de nuevo.' })],
      alCancelar: function(){ fin(null); }
    });
  });
}

/* CONFLICTO (de persona o de turno): relee la ficha, muestra las diferencias y deja elegir. Nunca guarda solo. */
async function edConflicto(ed, mio, origen){
  const aviso = mensajeDe(origen === 'turno' ? 'CONFLICTO_TURNO' : 'CONFLICTO');
  const recargado = await edRecargar(edTabDe(mio.tipo) || ed.tab, ed.tab);
  let actual = null;
  try{
    const a = await rpc('img_ficha', { p_id: mio.id });
    actual = a.persona;
  }catch(e){
    if(codigoDe(e) === 'NO_EXISTE'){
      edFichaBorrada(ed);
      return;
    }
    edAviso(mensajeDe(codigoDe(e), e.detalle));
    return;
  }
  if(!recargado || !tieneContactos(actual)){
    edAviso('No se pudo recargar la ficha para comparar. ' + aviso);
    return;
  }
  const nuevo = borradorDe(actual, E.turnos);
  const dec = await dlgConflicto(ed.base, mio, nuevo);
  if(FICHA.edicion !== ed) return;
  if(dec === 'descartar'){
    ed.base = nuevo;
    ed.borrador = clon(nuevo);
    ed.alta = false;
    edFormulario();
    return;
  }
  if(dec === 'reaplicar'){
    const r = rebase(ed.base, mio, nuevo);
    ed.base = nuevo;
    ed.borrador = r.borrador;
    ed.alta = false;
    edFormulario();
    if(r.choques.length){
      dlgAbrir({
        titulo: 'Revisá antes de guardar',
        clase: 'aviso',
        cuerpo: [h('p', { texto: 'En estos campos ganó tu valor: ' + r.choques.map(edEtiquetaCampo).join(', ') + '. Revisalos y guardá de nuevo.' })],
        botones: [{ texto: 'Entendido', clase: 'ed-btn prim', alClic: function(c){ c.cerrar(); } }]
      });
    } else if(diferencias(nuevo, r.borrador).length === 0){
      edAviso('Tus cambios ya estaban guardados.');
    }
    return;
  }
  edAviso(aviso);
}

/* Falla al guardar la persona. Devuelve { id, version } si en realidad se aplicó (reintento exitoso); null si no hay que seguir. */
async function edFalloGuardado(ed, b, e){
  const c = codigoDe(e);
  if(c === 'CONFLICTO'){
    await edConflicto(ed, b, 'persona');
    return null;
  }
  if(c === 'NO_EXISTE' && !ed.alta){
    edFichaBorrada(ed);
    return null;
  }
  if(c === 'INVALIDO'){
    const campo = e.detalle && typeof e.detalle.campo === 'string' ? e.detalle.campo : null;
    if(campo && ed.campos[campo]) edMostrarErrores([{ campo: campo }]); else edAviso(mensajeDe('INVALIDO', e.detalle));
    return null;
  }
  if(c === 'RED_ESCRITURA'){
    if(ed.alta){
      await edRecargar(ed.tab, ed.tab);
      edAviso('Revisá la lista antes de volver a guardar: el alta puede haberse aplicado.');
      return null;
    }
    try{
      const a = await rpc('img_ficha', { p_id: b.id });
      const act = borradorDe(a.persona, []);
      const mio = clon(b);
      mio.turnos = [];
      if(esReintentoExitoso(mio, act)) return { id: b.id, version: act.version };
    }catch(e2){
      /* no se pudo releer: se trata como no confirmado */
    }
    edAviso(MENSAJES.RED_ESCRITURA);
    return null;
  }
  edAviso(mensajeDe(c, e.detalle));
  return null;
}

async function edGuardar(){
  const ed = FICHA.edicion;
  if(!ed || ed.guardando) return;
  const errores = validarBorrador(ed.borrador, E.catalogos || {});
  if(errores.length){
    edMostrarErrores(errores);
    return;
  }
  if(!ed.alta && !tieneContactos(ed.base)){
    edAviso('Esta ficha se cargó sin celular, email ni matrícula: no se puede guardar para no borrarlos.');
    return;
  }
  edMostrarErrores([]);
  edAviso('');
  ed.guardando = true;
  edPintarPie();
  if(ed.btnGuardar){
    ed.btnGuardar.disabled = true;
    ed.btnGuardar.textContent = 'Guardando…';
  }
  const b = clon(ed.borrador);
  const alta = ed.alta;
  try{
    let r = null;
    try{
      r = await rpc('img_persona_guardar', { p_persona: payloadPersona(b), p_version: alta ? null : b.version });
    }catch(e){
      r = await edFalloGuardado(ed, b, e);
    }
    if(r === null) return;
    const fallas = b.tipo === 'medico' ? await edTurnosAplicar(r.id, ed.base.turnos, b.turnos) : [];
    const recargado = await edRecargar(edTabDe(b.tipo) || ed.tab, ed.tab);
    if(!fallas.length){
      edToast('Guardado · ' + sEd(b.apellido) + ', ' + sEd(b.nombre) + ' · v' + r.version + (recargado ? '' : ' · recargá la página para ver los cambios'));
      if(FICHA.edicion === ed){
        FICHA.edicion = null;
        abrirFicha(r.id);
      }
      return;
    }
    if(FICHA.edicion !== ed){
      edToast('Se guardó la ficha, pero ' + fallas.length + ' turno(s) no se aplicaron');
      return;
    }
    if(fallas.some(function(f){ return f.codigo === 'CONFLICTO'; })){
      await edConflicto(ed, b, 'turno');
      return;
    }
    const p = buscarPersona(r.id);
    if(p && tieneContactos(p)){
      const nueva = borradorDe(p, E.turnos);
      const rb = rebase(ed.base, b, nueva);
      ed.base = nueva;
      ed.borrador = rb.borrador;
      ed.alta = false;
      edFormulario();
    }
    const items = fallas.map(function(f){
      return h('li', { texto: f.texto + ': ' + mensajeDe(f.codigo === 'CONFLICTO' ? 'CONFLICTO_TURNO' : f.codigo, f.detalle) });
    });
    dlgAbrir({
      titulo: 'Guardado con avisos',
      clase: 'aviso',
      cuerpo: [h('p', { texto: 'Se guardó la ficha, pero ' + fallas.length + ' turno(s) no se aplicaron.' }), h('ul', {}, items)],
      botones: [{ texto: 'Entendido', clase: 'ed-btn prim', alClic: function(c){ c.cerrar(); } }]
    });
  }finally{
    ed.guardando = false;
    if(FICHA.edicion === ed) edPintarPie();
  }
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

/* Cronogramas (cronogramas.js): pestaña propia, siempre visible para quien tiene alguna pestaña asignada; los permisos por dato los aplica la base. */
function pestanasVisibles(){
  return E.pestanas.length && window.LumenCronogramas ? E.pestanas.concat([TAB_CRON]) : E.pestanas;
}

const PUENTE_CRON = {
  rpc: function(fn, args){ return rpc(fn, args); },
  codigoDe: function(e){ return codigoDe(e); },
  mensajeDe: function(c, d){ return mensajeDe(c, d); },
  nivel: function(){ return E.nivel; },
  hoy: function(){ return E.hoy; },
  personas: function(t){ return E.personas[t] || null; },
  aviso: function(t){ edToast(t); },
  dialogo: function(o){ return dlgAbrir(o); }
};

function pintarVista(tab, sub){
  const el = contenedor(tab, sub);
  if(!el) return;
  if(tab === TAB_CRON){
    window.LumenCronogramas.mostrar(el, sub, PUENTE_CRON);
    return;
  }
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

/* Cambio de pestaña con la ficha en edición: pasa por cerrarFicha() (pide confirmar si hay cambios). */
function alCambiarHash(){
  if(FICHA.edicion && fichaAbierta()){
    const nuevo = location.hash;
    if(edSucio()){
      history.replaceState(null, '', E.hashActual || '#');
      cerrarFicha().then(function(ok){ if(ok) location.hash = nuevo; });
      return;
    }
    cerrarFichaYa();
  }
  render();
}

function render(){
  expCerrar(false);
  const r = resolverHash(location.hash, pestanasVisibles());
  if(r === null) return;
  if(hashDe(r) !== location.hash) history.replaceState(null, '', hashDe(r));
  E.hashActual = location.hash;
  TABS.concat([TAB_CRON]).forEach(function(k){
    const t = document.getElementById('t-' + k);
    const p = document.getElementById('tab-' + k);
    const asignada = pestanasVisibles().indexOf(k) >= 0;
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
  TABS.concat([TAB_CRON]).forEach(function(k){ document.getElementById('tab-' + k).hidden = true; });
}

function avisar(titulo, texto, esError){
  const av = document.getElementById('aviso');
  estado(av, titulo, texto, esError);
  av.hidden = false;
}

function teclasTablist(ev){
  const ps = pestanasVisibles();
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
    document.documentElement.dataset.modo = 'edit';
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

  window.addEventListener('hashchange', alCambiarHash);
  window.addEventListener('beforeunload', function(ev){
    if(edSucio()){
      ev.preventDefault();
      ev.returnValue = '';
    }
  });
  document.querySelector('[role="tablist"]').addEventListener('keydown', teclasTablist);

  const codigo = await verificarIdentidad();
  if(codigo !== 'OK'){
    ocultarTodo();
    avisar('SIN CONEXIÓN SEGURA', mensajeDe(codigo), true);
    return;
  }
  avisar('CARGANDO', 'Cargando…', false);
  await cargar();
  if(E.errores.acceso === 'SIN_PERMISO' || E.errores.acceso === 'SIN_SESION'){ location.replace('app.html'); return; }
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
  pintarModo();
  document.getElementById('aviso').hidden = true;
  document.querySelector('[role="tablist"]').hidden = false;
  render();
}

iniciar();
})();
