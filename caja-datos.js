/* ============================================================
   caja-datos.js — parte de caja.html
   ------------------------------------------------------------
   El estado y la nube. `db`, el snapshot, la sincronización con
   Supabase, la carga inicial y las agregaciones que dependen de `db`
   (saldo, períodos, días pendientes, anomalías).

   Se carga DESPUÉS de caja-utils.js.
   El orden importa: los archivos se cortaron en orden de aparición
   y se cargan en ese mismo orden, así la evaluación es idéntica a
   la del archivo único que había antes.
   Separado de caja.html el 2026-09-12 (paso 3, rebanada 2).
   ============================================================ */

"use strict";

/* ============================================================
   ALMACENAMIENTO
   ============================================================ */
/* ============================================================
   NUBE — sesión, sede y permisos
   ============================================================ */
const SEDE="Sede Hospital Italiano";
const SEDE_SLUG="sede-hospital-italiano";
const BUCKET="caja-comprobantes";
let USUARIO=null, NIVEL=null, AUTHUID=null;
const puedeEditar=()=>NIVEL==="edit"||NIVEL==="admin";
const esAdmin=()=>NIVEL==="admin";

async function sbPatch(tabla,filtro,datos){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?${filtro}`,
    {method:"PATCH",headers:await getSBHeaders(),body:JSON.stringify(datos)});
  if(!r.ok) throw new Error("PATCH "+tabla+": "+r.status+" "+(await r.text()));
  return r.json().catch(()=>[]);
}
async function sbDel(tabla,filtro){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?${filtro}`,{method:"DELETE",headers:await getSBHeaders()});
  if(!r.ok) throw new Error("Borrado "+r.status);
}
async function stSubir(path,blob){
  const h=await getSBHeaders();
  const r=await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`,
    {method:"POST",headers:{apikey:h.apikey,Authorization:h.Authorization},body:blob});
  if(!r.ok) throw new Error("No se pudo subir el archivo ("+r.status+")");
}
async function stBorrar(path){
  const h=await getSBHeaders();
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`,
    {method:"DELETE",headers:{apikey:h.apikey,Authorization:h.Authorization}}).catch(()=>{});
}
async function stFirmar(path){
  const r=await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodeURI(path)}`,
    {method:"POST",headers:await getSBHeaders(),body:JSON.stringify({expiresIn:3600})});
  if(!r.ok) throw new Error("No se pudo abrir el comprobante ("+r.status+")");
  const j=await r.json();
  return SUPABASE_URL+"/storage/v1"+j.signedURL;
}



/* ============================================================
   MEDIOS DE CANCELACIÓN
   Sólo EFECTIVO mueve la caja física.
   ============================================================ */

/* ============================================================
   DATOS
   Un grupo = fecha + cajero + medio. Sin nombres ni DNI.
   ============================================================ */
const CAJEROS_INI=["ITORRES","JMONICA","ZABRAHAM","JAVILA","ASOSA","CMAIDA"];
const RESP_INI=["SERGIO","MAXI"];      // se llevan el efectivo
const DEPOS_INI=["LALIAS","OGARCIA"];  // tesoreros: reciben del mensajero y depositan
const BANCOS=["SANTANDER"];
let db={version:3,cajeros:CAJEROS_INI.slice(),responsables:RESP_INI.slice(),depositantes:DEPOS_INI.slice(),
        grupos:[],retiros:[],importaciones:[],revisados:{},comprobantes:{},sinRespaldo:0};

let vista="importar";
let SNAP={grupos:new Set(),retiros:new Set(),importaciones:new Set(),revisados:new Set()};
function snapshot(){
  SNAP={grupos:new Set(db.grupos.map(g=>g.id)),
        retiros:new Set(db.retiros.map(r=>r.id)),
        importaciones:new Set(db.importaciones.map(i=>i.id)),
        revisados:new Set(Object.keys(db.revisados))};
}
const filaGrupo=g=>({id:g.id,sede:SEDE,fecha:g.fecha,cajero:g.cajero,medio:g.medio,
  categoria:g.categoria,monto:g.monto,n:g.n||0,comps:g.comps||[],
  imp:(g.imp&&g.imp!=="manual")?g.imp:null,creado_por:AUTHUID});
const filaRetiro=r=>({id:r.id,sede:SEDE,fecha:r.fecha,responsable:r.responsable,
  monto:r.monto,detalle:r.detalle||null,tipo:r.tipo||"retiro",
  banco:r.banco||null,referencia:r.referencia||null,
  desde:r.desde||null,hasta:r.hasta||null,dias:r.dias||[],
  estado:r.estado||"FIRMADO",tesorero:r.tesorero||null,
  qr_token:r.qr_token||null,qr_expires_at:r.qr_expires_at||null,
  creado_por:AUTHUID});
const filaImport=i=>({id:i.id,sede:SEDE,archivos:i.archivo||null,filas_ok:i.filas||0,
  rango:i.rango||null,creado_por:AUTHUID});
const enLista=ids=>"id=in.("+[...ids].join(",")+")";

async function sincronizar(){
  const tareas=[];
  const dif=(coll,snap,fila,tabla)=>{
    const ahora=new Set(coll.map(x=>x.id));
    const nuevos=coll.filter(x=>!snap.has(x.id));
    const fuera=[...snap].filter(id=>!ahora.has(id));
    if(nuevos.length) tareas.push(sbInsert(tabla,nuevos.map(fila)));
    if(fuera.length)  tareas.push(sbDel(tabla,enLista(fuera)));
  };
  dif(db.grupos,SNAP.grupos,filaGrupo,"caja_grupos");
  dif(db.retiros,SNAP.retiros,filaRetiro,"caja_retiros");
  dif(db.importaciones,SNAP.importaciones,filaImport,"caja_importaciones");

  const rvAhora=new Set(Object.keys(db.revisados));
  const rvNuevos=[...rvAhora].filter(k=>!SNAP.revisados.has(k));
  const rvFuera =[...SNAP.revisados].filter(k=>!rvAhora.has(k));
  if(rvNuevos.length) tareas.push(sbInsert("caja_revisados",rvNuevos.map(k=>{
    const v=db.revisados[k];
    return {sede:SEDE,fecha:v.fecha,cajero:v.cajero,medio:v.medio||"",comp:v.comp||"",
            nota:v.nota||null,revisado_por:AUTHUID};
  })));
  for(const k of rvFuera){
    const [f,c,m,x]=k.split("|");
    tareas.push(sbDel("caja_revisados",`sede=eq.${encodeURIComponent(SEDE)}&fecha=eq.${f}`+
      `&cajero=eq.${encodeURIComponent(c)}&medio=eq.${encodeURIComponent(m||"")}`+
      `&comp=eq.${encodeURIComponent(x||"")}`));
  }
  await Promise.all(tareas);
  snapshot();
}

function guardar(cambio=true){
  if(!puedeEditar()){toast("Tu usuario es de solo lectura.");return}
  YO_GUARDE=Date.now(); ULTIMA_CARGA=Date.now(); pintarSello();
  sincronizar().catch(e=>{
    toast("No se guard\u00f3 en la nube: "+e.message+". Actualiz\u00e1 la p\u00e1gina.");
    console.error("[caja] sync",e);
  });
}

async function cargarDesdeNube(){
  const q="sede=eq."+encodeURIComponent(SEDE);
  const [gr,re,rv,im,cp]=await Promise.all([
    sbQuery("caja_grupos","select=*&"+q+"&order=fecha.asc"),
    sbQuery("caja_retiros","select=*&"+q+"&order=fecha.asc"),
    sbQuery("caja_revisados","select=*&"+q),
    sbQuery("caja_importaciones","select=*&"+q+"&order=creado_en.desc"),
    sbQuery("caja_comprobantes","select=*&"+q)
  ]);
  db.grupos=gr.map(r=>({id:r.id,imp:r.imp||"manual",fecha:r.fecha,cajero:r.cajero,
    medio:r.medio,categoria:r.categoria,monto:Number(r.monto),n:r.n||0,comps:r.comps||[]}));
  db.retiros=re.map(r=>({id:r.id,fecha:r.fecha,responsable:r.responsable,
    monto:Number(r.monto),detalle:r.detalle||"",tipo:r.tipo||"retiro",
    banco:r.banco||"",referencia:r.referencia||"",
    desde:r.desde||"",hasta:r.hasta||"",dias:Array.isArray(r.dias)?r.dias:[],
    estado:r.estado||"FIRMADO",tesorero:r.tesorero||"",
    mensajero_id:r.mensajero_id||"",firmado_at:r.firmado_at||"",firma_modo:r.firma_modo||"",
    firmado_por_nombre:r.firmado_por_nombre||"",retira_nombre:r.retira_nombre||"",
    qr_token:r.qr_token||"",qr_expires_at:r.qr_expires_at||"",
    creado:Date.parse(r.creado_en)||Date.now()}));
  db.revisados={};
  rv.forEach(r=>{db.revisados[claveRev(r.fecha,r.cajero,r.medio,r.comp)]=
    {ts:Date.parse(r.revisado_en)||Date.now(),fecha:r.fecha,cajero:r.cajero,
     medio:r.medio||"",comp:r.comp||"",nota:r.nota||""}});
  db.importaciones=im.map(r=>({id:r.id,archivo:r.archivos||"",cuando:Date.parse(r.creado_en)||Date.now(),
    filas:r.filas_ok||0,rango:r.rango||"",total:0}));
  db.importaciones.forEach(i=>{i.total=db.grupos.filter(g=>g.imp===i.id).reduce((a,g)=>a+g.monto,0)});
  db.comprobantes={};
  cp.forEach(c=>{(db.comprobantes[c.clave]=db.comprobantes[c.clave]||[]).push(
    {id:c.id,nombre:c.nombre,bytes:c.bytes||0,path:c.path})});
  db.cajeros=[...new Set([...CAJEROS_INI,...db.grupos.map(g=>g.cajero)])].sort();
  db.responsables=[...new Set([...RESP_INI,...db.retiros.filter(r=>!esDeposito(r)).map(r=>r.responsable)])].sort();
  db.depositantes=[...new Set([...DEPOS_INI,...db.retiros.filter(esDeposito).map(r=>r.responsable)])].sort();
  db.sinRespaldo=0;
  snapshot();
}

/* ============================================================
   FORMATO
   ============================================================ */
/* en la lista de días el año ya está en el separador: la columna va sin año */
/* el separador usa la fecha abreviada: la larga forzaba el ancho de la tabla */

/* ============================================================
   AGREGACIONES
   ============================================================ */
const gruposOrd=()=>db.grupos.slice().sort((a,b)=>a.fecha===b.fecha?a.cajero.localeCompare(b.cajero):a.fecha.localeCompare(b.fecha));
const retirosOrd=()=>db.retiros.slice().sort((a,b)=>a.fecha.localeCompare(b.fecha));
/* Una salida de caja es retiro (se la lleva el tesorero, cierra periodo) o
   deposito bancario (va a la cuenta). Las dos restan del efectivo. */
/* Un retiro nace PENDIENTE_FIRMA y no baja el saldo hasta que el mensajero
   firma: la plata se va cuando se la lleva. Igual bloquea sus dias, para que
   nadie arme otro retiro con los mismos mientras espera. */
const retirosFirmados=()=>db.retiros.filter(retiroFirmado);
const hayPendientes=()=>db.retiros.some(esperaFirma);
/* El retiro saca la plata de la caja. El deposito bancario NO: es la boleta que
   rinde un retiro que ya salio, asi que no vuelve a bajar el saldo. Un mismo
   retiro puede depositarse con varias boletas que entre todas suman su monto. */
const saldoEfectivo=()=>db.grupos.filter(g=>g.categoria==="efectivo").reduce((s,g)=>s+g.monto,0)-retirosFirmados().reduce((s,r)=>s+r.monto,0);
const enEsperaDeFirma=()=>db.retiros.filter(esperaFirma).reduce((s,r)=>s+r.monto,0);
const ultimoRetiro=()=>{const r=retirosOrd().filter(retiroFirmado);return r.length?r[r.length-1]:null};

/* --- periodo -----------------------------------------------
   Retiro y boleta se atan por el par (desde,hasta): o son identicos o no son
   el mismo periodo. Las filas viejas no lo tienen guardado, asi que el de un
   retiro se deriva del retiro anterior; la derivacion es estable mientras no
   se borren retiros del medio. */
function periodoDe(r){
  if(r.desde&&r.hasta) return {desde:r.desde,hasta:r.hasta};
  const rs=retirosOrd().filter(retiroFirmado);
  const i=rs.findIndex(x=>x.id===r.id);
  const pr=i>0?rs[i-1]:null;
  const ini=pr?diaSig(pr.hasta||pr.fecha):(db.grupos.map(g=>g.fecha).sort()[0]||r.fecha);
  return {desde:ini<=r.fecha?ini:r.fecha,hasta:r.fecha};
}
/* --- efectivo dia por dia ------------------------------------
   El retiro se lleva dias concretos y los guarda en r.dias. Los retiros
   viejos no tienen esa lista: se les atribuyen los dias de su periodo, asi
   ningun dia queda disponible dos veces despues de haber salido de la caja. */
function efectivoPorDia(){
  const m=new Map();
  for(const g of db.grupos) if(g.categoria==="efectivo") m.set(g.fecha,(m.get(g.fecha)||0)+g.monto);
  return [...m].map(([fecha,monto])=>({fecha,monto})).sort((a,b)=>a.fecha.localeCompare(b.fecha));
}
function diasCubiertos(r){
  if(Array.isArray(r.dias)&&r.dias.length) return r.dias;
  const p=periodoDe(r);
  return efectivoPorDia().map(d=>d.fecha).filter(f=>f>=p.desde&&f<=p.hasta);
}
const diasRetirados=()=>new Set(db.retiros.filter(retiroVivo).flatMap(diasCubiertos));
function diasPendientes(){const y=diasRetirados();return efectivoPorDia().filter(d=>!y.has(d.fecha))}
const efectivoPendiente=()=>diasPendientes().reduce((s,d)=>s+d.monto,0);
/* el efectivo de los dias que se lleva un retiro, para el comprobante */
function detalleDias(r){
  const ef=new Map(efectivoPorDia().map(d=>[d.fecha,d.monto]));
  return diasCubiertos(r).slice().sort().map(f=>({fecha:f,monto:ef.get(f)||0}));
}
const boletasPeriodo=p=>{const k=clavePer(p);return k?db.retiros.filter(d=>esDeposito(d)&&clavePer(d)===k):[]};
const rendidoDe=r=>boletasPeriodo(periodoDe(r)).reduce((a,d)=>a+d.monto,0);
/* arranque del periodo abierto: el dia siguiente al cierre del ultimo retiro */
function proxDesde(){
  const ur=ultimoRetiro();
  if(ur) return diaSig(ur.hasta||ur.fecha);
  const f=db.grupos.map(g=>g.fecha).sort();
  return f.length?f[0]:hoyISO();
}
function periodoAbierto(){const ur=ultimoRetiro();const d=ur?proxDesde():null;return{desde:d,gr:db.grupos.filter(g=>!d||g.fecha>=d)}}

/* --- Anomalías, ahora a nivel día+cajero ------------------- */
function anomaliasDia(d){
  const out=[]; const hoy=hoyISO();
  if(d.fecha>hoy) out.push("Fecha futura");
  if(d.fecha<"2020-01-01") out.push("Fecha imposible");
  if(!db.cajeros.includes(d.cajero)) out.push("Cajero fuera de la lista");
  if(d.efectivo<0) out.push("Efectivo neto negativo");
  if(d.otros!==0) out.push("Valores fuera de efectivo, tarjeta y billetera");
  const origenes=new Set(d.grupos.map(g=>g.imp||"—"));
  if(origenes.size>1) out.push("Cargado desde dos orígenes distintos");
  return out;
}
const diasARevisar=()=>porDia(db.grupos).map(d=>({d,motivos:anomaliasDia(d)})).filter(x=>x.motivos.length);

/* ============================================================
   UI helpers
   ============================================================ */
/* la tabla de días saca la columna Total según el ancho: hay que repintar al
   cruzar ese umbral, pero solo al cruzarlo */
let _resizeT=null;
window.addEventListener("resize",()=>{
  if(vista!=="dias")return;
  clearTimeout(_resizeT);
  _resizeT=setTimeout(()=>{ if(typeof render==="function") render() },150);
});
let tT; function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(tT);tT=setTimeout(()=>t.classList.remove("on"),3400)}
/* ============================================================
   CONFIRMAR / AVISAR
   Reemplazan a confirm() y alert() del navegador. Usan su propio
   <dialog>, así se pueden abrir encima de un modal ya abierto.
   ============================================================ */

function banners(){
  const o=[];
  if(db.sinRespaldo>=20) o.push(el("div",{class:"banner ambar"},el("b",{},`${db.sinRespaldo} cambios sin respaldar.`),"El archivo .json es lo único que sobrevive a un borrado de caché.",el("button",{class:"btn small",type:"button",onclick:exportarJSON},"Guardar respaldo")));
  return o;
}
