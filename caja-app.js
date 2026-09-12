/* ============================================================
   caja-app.js — parte de caja.html
   ------------------------------------------------------------
   El armazón. El render y las pestañas, las marcas de revisado y
   los comprobantes adjuntos, el modo solo lectura, la frescura de los
   datos (realtime + polling) y el arranque.

   Se carga DESPUÉS de caja-revisar.js.
   El orden importa: los archivos se cortaron en orden de aparición
   y se cargan en ese mismo orden, así la evaluación es idéntica a
   la del archivo único que había antes.
   Separado de caja.html el 2026-09-12 (paso 3, rebanada 2).
   ============================================================ */
"use strict";

/* ============================================================
   RENDER
   ============================================================ */
function pintarCinta(){
  const s=saldoEfectivo(); const{desde,gr}=periodoAbierto(); const t=totales(gr);
  $("#saldo-monto").textContent=plata(s);
  $("#saldo-monto").style.color=s<0?"var(--alerta)":"var(--efectivo)";
  $("#saldo-desde").textContent=desde?`Período abierto desde el ${fechaCorta(desde)}`:(db.grupos.length?"Desde el inicio":"Sin movimientos todavía");
  /* replaceChildren() convierte null en el texto "null": hay que filtrar. */
  $("#cinta-rows").replaceChildren(...[
    el("div",{class:"cr"},el("span",{},"Efectivo"),el("b",{style:"color:var(--efectivo)"},plata(t.efectivo))),
    el("div",{class:"cr"},el("span",{},"Tarjetas"),el("b",{style:"color:var(--tarjeta)"},plata(t.tarjeta))),
    el("div",{class:"cr"},el("span",{},"Billetera"),el("b",{style:"color:var(--billetera)"},plata(t.billetera))),
    t.otros?el("div",{class:"cr"},el("span",{},"Otros valores"),el("b",{style:"color:var(--otros)"},plata(t.otros))):null,
    el("div",{class:"cr",style:"border-top:1px dashed var(--linea);padding-top:7px"},el("span",{},"Facturado"),el("b",{},plata(t.total))),

    el("div",{class:"cr"},el("span",{},"Días"),el("b",{},String(new Set(gr.map(g=>g.fecha)).size))),
    hayPendientes()?el("div",{class:"cr",style:"border-top:1px dashed var(--linea);padding-top:7px",
      title:"Retiros anotados que todavía no firmó ningún mensajero: no bajan el saldo hasta que se firman"},
      el("span",{},"Espera firma"),el("b",{style:"color:var(--aviso)"},plata(enEsperaDeFirma()))):null
  ].filter(Boolean));
  const r=diasARevisar().filter(x=>!estaRevisado(x.d)).length; $("#cnt-rev").textContent=r?`(${r})`:"";
  $("#btn-retirar").disabled=!diasPendientes().length; $("#btn-depositar").disabled=!hayQueRendir();
}
const TITULOS={importar:"Importar listados",dias:"D\u00edas cargados",reportes:"Reportes",retiros:"Retiros y dep\u00f3sitos",revisar:"Revisar",manual:"Cargar a mano",datos:"Datos y respaldo"};
const VISTAS={importar:vistaImportar,dias:vistaDias,reportes:vistaReportes,retiros:vistaRetiros,revisar:vistaRevisar,manual:vistaManual,datos:vistaDatos};
function render(){
  $("#main").replaceChildren(VISTAS[vista]());
  limpiarBotonesEdicion();
  for(const b of $("#tabs").children) b.setAttribute("aria-current",b.dataset.v===vista?"true":"false");
  const tv=$("#titulo-vista");
  tv.textContent=TITULOS[vista]||"";
  tv.classList.remove("entra"); void tv.offsetWidth; tv.classList.add("entra");
  pintarCinta();
}
$("#tabs").addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b)return;vista=b.dataset.v;render();window.scrollTo({top:0})});
$("#btn-retirar").addEventListener("click",dialogoRetiro);
$("#btn-depositar").addEventListener("click",dialogoDeposito);
$("#btn-backup").addEventListener("click",exportarJSON);
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();exportarJSON()}});

// soltar archivos en cualquier lado
["dragover","drop"].forEach(ev=>document.addEventListener(ev,e=>{
  if(!e.dataTransfer||![...e.dataTransfer.types].includes("Files"))return;
  e.preventDefault();
  if(ev==="drop"){vista="importar";render();leerArchivos([...e.dataTransfer.files])}
}));
/* --- escudo (identidad local, sólo pantalla) --------------- */
const ESC_KEY="caja.escudo.v1";
/* BANNER_DEF (34 KB de PNG en base64) se sacó el 2026-09-12: estaba declarada y no la usaba nadie. La imagen quedó guardada en banner-caja-def.png. */
function leerEscudo(){try{return localStorage.getItem(ESC_KEY)||""}catch(e){return ""}}
function pintarEscudo(){
  const img=$("#escudo"), mk=$("#marca"); if(!img) return;
  const propio=leerEscudo();
  const sede=$("#marca-sede"); if(sede) sede.textContent=SEDE;
  if(propio){ img.src=propio; img.classList.add("on"); if(mk) mk.style.display="none"; }
  else      { img.classList.remove("on"); img.removeAttribute("src"); if(mk) mk.style.display=""; }
}
function cargarEscudo(f){
  if(!f) return;
  if(!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(f.type)){toast("Tiene que ser una imagen (png, jpg, svg o webp).");return}
  if(f.size>300*1024){toast("La imagen pesa "+(f.size/1024|0)+" KB. Máximo 300 KB.");return}
  const fr=new FileReader();
  fr.onload=()=>{
    try{localStorage.setItem(ESC_KEY,fr.result)}catch(e){toast("No se pudo guardar la imagen.");return}
    pintarEscudo();toast("Encabezado reemplazado.");render();
  };
  fr.onerror=()=>toast("No se pudo leer la imagen.");
  fr.readAsDataURL(f);
}
function quitarEscudo(){try{localStorage.removeItem(ESC_KEY)}catch(e){}pintarEscudo();toast("Encabezado original restaurado.");render()}


/* ============================================================
   BORRADO TOTAL — segundo paso
   ============================================================ */
function borrarPaso2(){
  const inp=el("input",{type:"text",placeholder:"BORRAR",style:"width:180px;letter-spacing:.14em;font-family:var(--mono)"});
  const est=el("p",{class:"hint",style:"margin:10px 0 0"},"Escribí la palabra exacta, en mayúsculas.");
  const d=modal({titulo:"Paso 2 de 2 — confirmación escrita",cuerpo:el("div",{},
    el("p",{},el("b",{},"Esto borra la caja de la NUBE."),
      " No es sólo esta computadora: desaparece para todas las sedes y todos los usuarios, al instante y sin deshacer."),
    el("p",{},"Para confirmar, escribí BORRAR y presioná el botón rojo."),
    el("label",{class:"f"},"Confirmación",inp),est),
    acciones:[{texto:"Cancelar"},
      {texto:"Borrar definitivamente",clase:"danger",accion:()=>{
        if(inp.value.trim()!=="BORRAR"){est.textContent="No coincide. Escribí BORRAR, en mayúsculas.";est.style.color="var(--alerta)";inp.focus();return false}
        if(!esAdmin()){toast("S\u00f3lo un administrador puede borrar todo.");return false}
        db.grupos=[];db.retiros=[];db.importaciones=[];db.revisados={};
        db.cajeros=CAJEROS_INI.slice();db.responsables=RESP_INI.slice();db.depositantes=DEPOS_INI.slice();
        guardar();toast("Todo borrado de la nube.");render();
      }}]});
  inp.focus();
}

/* ============================================================
   REVISADOS Y COMPROBANTES
   ============================================================ */
const MAX_ARCH=5*1024*1024, TOPE_DB=Infinity;
function claveDia(d){return d.fecha+"|"+d.cajero}
function estaRevisado(d){return !!db.revisados[claveDia(d)]}
/* La marca vive en caja_revisados. medio="" es el cajero entero del dia;
   con medio cargado es la tilde de ese medio de pago. */
function claveRev(f,c,m,x){return f+"|"+c+(m?"|"+m:"")+(x?"|"+x:"")}
function estaRevisadoMedio(d,g){return !!db.revisados[claveRev(d.fecha,d.cajero,g.medio)]}
function estaRevisadoComp(d,g,x){return !!db.revisados[claveRev(d.fecha,d.cajero,g.medio,x)]}
function ponerRev(f,c,m,x,nota){db.revisados[claveRev(f,c,m,x)]=
  {ts:Date.now(),fecha:f,cajero:c,medio:m||"",comp:x||"",nota:nota||""}}
function sacarRev(f,c,m,x){delete db.revisados[claveRev(f,c,m,x)]}
/* La identidad de un comprobante es su numero; los que vinieron sin numero
   caen a su posicion dentro del grupo. compsClaves y verComps tienen que
   generar la misma clave o la tilde no se encuentra a si misma. */
function compsClaves(g){return compsNorm(g.comps).map((x,i)=>x.n||("#"+i))}
function tildarGrupo(d,g,on){
  const f=on?ponerRev:sacarRev;
  f(d.fecha,d.cajero,g.medio);
  compsClaves(g).forEach(k=>f(d.fecha,d.cajero,g.medio,k));
}
function recalcularMedio(d,g){
  const ks=compsClaves(g);
  if(!ks.length) return;   // grupo sin desglose: su tilde se pone a mano
  if(ks.every(k=>estaRevisadoComp(d,g,k))) ponerRev(d.fecha,d.cajero,g.medio);
  else sacarRev(d.fecha,d.cajero,g.medio);
}
function recalcularCajero(d){
  const nota=(db.revisados[claveDia(d)]||{}).nota;
  if(d.grupos.length&&d.grupos.every(x=>estaRevisadoMedio(d,x)))
    ponerRev(d.fecha,d.cajero,"","",nota);
  else sacarRev(d.fecha,d.cajero,"");
}
function marcarComp(d,g,k,on){
  if(!puedeEditar()){toast("Tu usuario es de solo lectura.");return}
  on?ponerRev(d.fecha,d.cajero,g.medio,k):sacarRev(d.fecha,d.cajero,g.medio,k);
  recalcularMedio(d,g); recalcularCajero(d); guardar();
}
function marcarMedio(d,g,on){
  if(!puedeEditar()){toast("Tu usuario es de solo lectura.");return}
  tildarGrupo(d,g,on);
  recalcularCajero(d);
  guardar();render();
}
function marcarDiaEntero(dd,on){
  if(!puedeEditar()){toast("Tu usuario es de solo lectura.");return}
  for(const d of dd){
    if(on) ponerRev(d.fecha,d.cajero,""); else sacarRev(d.fecha,d.cajero,"");
    d.grupos.forEach(g=>tildarGrupo(d,g,on));
  }
  guardar();toast(on?"D\u00eda verificado completo.":"D\u00eda reabierto.");render();
}
function tildeComp(d,g,k){
  const pinta=b=>{const ok=estaRevisadoComp(d,g,k);
    b.className="tick chico"+(ok?" on":"");
    b.setAttribute("aria-pressed",ok?"true":"false");
    b.title=ok?"Verificado \u00b7 Clic para desmarcar":"Marcar este comprobante como verificado"};
  const b=el("button",{class:"tick chico",type:"button",onclick:()=>{
    marcarComp(d,g,k,!estaRevisadoComp(d,g,k)); pinta(b)}},"\u2713");
  pinta(b);
  if(!puedeEditar()) b.disabled=true;
  return b;
}
function tildeMedio(d,g){
  const ok=estaRevisadoMedio(d,g);
  const t=ok?"Verificado \u00b7 Clic para desmarcar":"Marcar este medio como verificado";
  const b=el("button",{class:"tick chico"+(ok?" on":""),type:"button",title:t,"aria-label":t,
    "aria-pressed":ok?"true":"false",onclick:()=>marcarMedio(d,g,!ok)},"\u2713");
  if(!puedeEditar()) b.disabled=true;
  return b;
}
function tildeDia(dd){
  const ok=dd.length>0&&dd.every(x=>estaRevisado(x));
  const t=ok?"Todo el d\u00eda verificado \u00b7 Clic para reabrirlo":"Verificar el d\u00eda entero";
  const b=el("button",{class:"tick"+(ok?" on":""),type:"button",title:t,"aria-label":t,
    "aria-pressed":ok?"true":"false",onclick:()=>marcarDiaEntero(dd,!ok)},"\u2713");
  if(!puedeEditar()) b.disabled=true;
  return b;
}
function compsDe(d){return db.comprobantes[claveDia(d)]||[]}
function tamDB(){return 0}
function tildeVerificado(d){
  const k=claveDia(d), ok=estaRevisado(d), mot=anomaliasDia(d), r=ok?db.revisados[k]:null;
  const t=ok
    ? "Verificado el "+new Date(r.ts).toLocaleDateString("es-AR")
      +(r.nota?" \u2014 "+r.nota:"")+" \u00b7 Clic para reabrir"
    : (mot.length?"Sin verificar \u00b7 "+mot.join(" \u00b7 "):"Marcar como verificado");
  const b=el("button",{class:"tick"+(ok?" on":""),type:"button",title:t,"aria-label":t,
    "aria-pressed":ok?"true":"false",onclick:()=>marcarRevisado(d,!ok)},"\u2713");
  if(!puedeEditar()) b.disabled=true;
  return b;
}
async function marcarRevisado(d,on){
  if(!puedeEditar()){toast("Tu usuario es de solo lectura.");return}
  const k=claveDia(d);
  if(on){
    let nota="";
    if(!compsDe(d).length&&anomaliasDia(d).length){
      const r=await confirmar("Revisar sin comprobantes",
        [`El ${fechaCorta(d.fecha)} de ${d.cajero} no tiene ningún comprobante adjunto.`,
         "Podés darlo por revisado igual, pero dejá constancia de en qué te basaste. Queda guardado junto a la marca."],
        {ok:"Marcar revisado", kicker:"Requiere observaci\u00f3n",
         campo:{etiqueta:"Observaci\u00f3n de la revisi\u00f3n",
                ejemplo:"Ej: contado con planilla de caja del turno tarde, cierra con el sistema.",
                minimo:8,
                error:"Escrib\u00ed en qué te basaste para darlo por revisado."}});
      if(!r) return;
      nota=r;
    }
    db.revisados[k]={ts:Date.now(),fecha:d.fecha,cajero:d.cajero,medio:"",comp:"",nota};
    (d.grupos||[]).forEach(g=>tildarGrupo(d,g,true));
  }else{
    delete db.revisados[k];
    (d.grupos||[]).forEach(g=>tildarGrupo(d,g,false));
  }
  guardar();toast(on?"Marcado como verificado.":"Reabierto para revisión.");render();
}
/* Los campos de plata se separan en miles mientras se escribe:
   8258782,5 -> 8.258.782,5. parseMonto ya entiende ese formato
   (puntos de miles + coma decimal), así que nada río abajo cambia. */
function procesarArchivo(file,cb){
  if(!file)return;
  const esImg=/^image\/(png|jpeg|webp)$/.test(file.type);
  if(!esImg&&file.type!=="application/pdf"){toast("S\u00f3lo PNG, JPG, WEBP o PDF.");return}
  if(file.size>MAX_ARCH){toast("El archivo pesa "+Math.round(file.size/1024)+" KB y el m\u00e1ximo es "+Math.round(MAX_ARCH/1024)+" KB.");return}
  cb({nombre:file.name.slice(0,120),bytes:file.size,blob:file});
}

function rutaComp(clave,nombre){
  const carpeta=clave.replace(/[^A-Za-z0-9_-]+/g,"_");
  const limpio=nombre.replace(/[^A-Za-z0-9._-]+/g,"_").slice(-80);
  return SEDE_SLUG+"/"+carpeta+"/"+uid()+"_"+limpio;
}

/* Sube UN comprobante ya validado por procesarArchivo. Devuelve true/false.
   Es la única vía real de subida: la usan el botón "Adjuntar" de la tabla y
   los diálogos de retiro/depósito. */
async function subirComp(clave,c){
  const path=rutaComp(clave,c.nombre);
  try{
    await stSubir(path,c.blob);
    const fila=await sbInsert("caja_comprobantes",
      {sede:SEDE,clave,path,nombre:c.nombre,bytes:c.bytes,creado_por:AUTHUID});
    const r=Array.isArray(fila)?fila[0]:fila;
    (db.comprobantes[clave]=db.comprobantes[clave]||[]).push(
      {id:r.id,nombre:c.nombre,bytes:c.bytes,path});
    return true;
  }catch(e){
    await stBorrar(path);
    toast("No se pudo adjuntar "+c.nombre+": "+e.message);
    return false;
  }
}
function adjuntar(clave,file){
  if(!puedeEditar()){toast("Tu usuario es de solo lectura.");return}
  procesarArchivo(file,async c=>{
    if(await subirComp(clave,c)){
      toast("Comprobante adjuntado ("+Math.round(c.bytes/1024)+" KB).");
      render();
    }
  });
}

function abrirComp(c){
  const w=window.open("","_blank","noopener");
  stFirmar(c.path).then(u=>{ if(w) w.location=u; else window.open(u,"_blank","noopener"); })
    .catch(e=>{ if(w)w.close(); toast(e.message); });
}

async function quitarComp(clave,id){
  if(!puedeEditar()){toast("Tu usuario es de solo lectura.");return}
  const lista=db.comprobantes[clave]||[], c=lista.find(x=>x.id===id);
  if(!c)return;
  if(!await confirmar("Quitar comprobante",
    `Se elimina "${c.nombre}" de forma definitiva. No hay deshacer.`,
    {ok:"Quitar",peligro:true}))return;
  try{
    await sbDel("caja_comprobantes","id=eq."+id);
    await stBorrar(c.path);
    db.comprobantes[clave]=lista.filter(x=>x.id!==id);
    if(!db.comprobantes[clave].length)delete db.comprobantes[clave];
    toast("Comprobante quitado.");render();
  }catch(e){toast("No se pudo quitar: "+e.message)}
}

function chipsComps(clave,quitar){
  const out=[];
  for(const c of (db.comprobantes[clave]||[]))
    out.push(el("span",{class:"comp-chip"},
      el("a",{title:c.nombre+" \u00b7 "+Math.round(c.bytes/1024)+" KB",onclick:()=>abrirComp(c)},c.nombre),
      quitar?el("button",{type:"button",title:"Quitar",onclick:()=>quitar(c.id)},"\u00d7"):null));
  return out;
}
function celdaComps(clave){
  const cont=el("td",{style:"white-space:normal;min-width:190px"});
  chipsComps(clave,puedeEditar()?(id=>quitarComp(clave,id)):null).forEach(x=>cont.append(x));
  if(!puedeEditar()){
    if(!cont.childNodes.length)cont.append(el("span",{class:"hint"},"\u2014"));
    return cont;
  }
  const inp=el("input",{type:"file",accept:"image/png,image/jpeg,image/webp,application/pdf",style:"display:none",
    onchange:e=>{adjuntar(clave,e.target.files[0]);e.target.value=""}});
  cont.append(el("button",{class:"btn ghost small",type:"button",onclick:()=>inp.click()},"Adjuntar"),inp);
  return cont;
}

function reloj(){$("#reloj").textContent=new Date().toLocaleDateString("es-AR",{weekday:"short",day:"2-digit",month:"short",year:"numeric"}).toUpperCase()+" \u00b7 "+new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit",hourCycle:"h23"})}

/* ============================================================
   MODO SOLO LECTURA
   El servidor ya rechaza toda escritura sin nivel edit/admin
   (pol\u00edticas RLS). Esto s\u00f3lo evita que la persona clickee
   botones que van a fallar.
   ============================================================ */
const TABS_EDICION=["importar","manual","datos"];
const BOTONES_EDICION=["adjuntar","registrar retiro","registrar depósito","eliminar","marcar revisado",
  "reabrir","deshacer","guardar","borrar","agregar","importar","reemplazar","sumar","\u00d7"];

function aplicarModo(){
  const ro=!puedeEditar();
  document.body.classList.toggle("ro",ro);
  document.querySelectorAll("#tabs button").forEach(b=>{
    if(ro&&TABS_EDICION.includes(b.dataset.v)) b.remove();
  });
  $("#btn-retirar").style.display=ro?"none":"";
  $("#btn-depositar").style.display=ro?"none":"";
  $("#btn-backup").textContent=ro?"Exportar respaldo":"Guardar respaldo";
  if(ro&&TABS_EDICION.includes(vista)) vista="dias";
}
function limpiarBotonesEdicion(){
  if(puedeEditar())return;
  document.querySelectorAll("#main button").forEach(b=>{
    const t=(b.textContent||"").trim().toLowerCase();
    if(BOTONES_EDICION.some(x=>t===x||t.startsWith(x))) b.remove();
  });
}

/* ============================================================
   ACCESO POR CODIGO (OTP 6 digitos)
   ============================================================ */
const gate=()=>$("#gate");
function mostrarGate(msg,clase){
  gate().classList.add("on");
  document.body.classList.add("gated");
  document.body.classList.remove("cargando");
  if(msg){const h=$("#gate-hint");h.textContent=msg;h.className="gate-hint "+(clase||"")}
}
function ocultarGate(){gate().classList.remove("on");document.body.classList.remove("gated")}

let MAIL_OTP="";

async function enviarCodigo(){
  const mail=$("#gate-mail").value.trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){mostrarGate("Ese correo no parece v\u00e1lido.","err");return}
  if(!window.sbAuth){mostrarGate("No carg\u00f3 el cliente de Supabase. Revis\u00e1 la conexi\u00f3n.","err");return}
  const btn=$("#gate-btn");btn.disabled=true;btn.textContent="Enviando\u2026";
  try{
    const {error}=await window.sbAuth.auth.signInWithOtp({email:mail,options:{shouldCreateUser:false}});
    if(error)throw error;
    MAIL_OTP=mail;
    $("#gate-form").style.display="none";
    $("#gate-form2").style.display="flex";
    $("#gate-msg").textContent="Te enviamos un c\u00f3digo a "+mail+". Escribilo ac\u00e1 abajo.";
    mostrarGate("Revis\u00e1 tu correo. El c\u00f3digo vence en una hora.","ok");
    setTimeout(function(){$("#gate-code").focus()},80);
  }catch(e){
    mostrarGate("No se pudo enviar: "+(e.message||e),"err");
    btn.disabled=false;btn.textContent="Enviarme el c\u00f3digo";
  }
}

async function verificarCodigo(){
  const code=$("#gate-code").value.replace(/\D/g,"");
  if(code.length<6){mostrarGate("Escrib\u00ed el c\u00f3digo completo tal cual figura en el correo.","err");return}
  const btn=$("#gate-btn2");btn.disabled=true;btn.textContent="Verificando\u2026";
  try{
    const {error}=await window.sbAuth.auth.verifyOtp({email:MAIL_OTP,token:code,type:"email"});
    if(error)throw error;
    location.reload();
  }catch(e){
    mostrarGate("C\u00f3digo incorrecto o vencido. Revis\u00e1 el \u00faltimo correo que recibiste.","err");
    btn.disabled=false;btn.textContent="Entrar";
    $("#gate-code").select();
  }
}

function volverAlMail(){
  MAIL_OTP="";
  $("#gate-form2").style.display="none";
  $("#gate-form").style.display="flex";
  $("#gate-code").value="";
  $("#gate-btn").disabled=false;$("#gate-btn").textContent="Enviarme el c\u00f3digo";
  $("#gate-msg").textContent="Ingres\u00e1 tu correo institucional. Te enviamos un c\u00f3digo num\u00e9rico para entrar.";
  mostrarGate(" ","");
}

async function cerrarSesion(){
  try{await window.sbAuth.auth.signOut()}catch(e){}
  location.href=location.pathname;
}

/* ============================================================
   FRESCURA DE LOS DATOS
   caja.html cargaba de la nube UNA sola vez, al entrar. Quien deja
   la pestana abierta se queda mirando la foto del momento en que
   entro y no tiene como saberlo. Tres capas:
     1. Realtime sobre las tablas de caja -> repinta al toque.
     2. Poll de respaldo, por si el canal se muere sin avisar.
     3. Un sello en la cinta que dice de cuando son los numeros.
   El refresco NUNCA pisa un dialogo abierto: queda pendiente.
   ============================================================ */
const RT_TABLAS=["caja_grupos","caja_retiros","caja_revisados","caja_comprobantes","caja_importaciones"];
let RT_CANAL=null, RT_VIVO=false, RT_TIMER=null, RT_POLL=null;
let ULTIMA_CARGA=0, RT_PENDIENTE=false, RT_ERROR="", YO_GUARDE=0;


function pintarSello(){
  const s=$("#cinta-sello"); if(!s) return;
  if(!ULTIMA_CARGA){s.textContent="";s.className="cinta-sello";return}
  if(RT_ERROR){
    s.className="cinta-sello alerta";
    s.textContent="Sin conexi\u00f3n \u00b7 dato de las "+hhmm(ULTIMA_CARGA);
    s.title="No se pudo traer la ultima version: "+RT_ERROR+". Actualiza la pagina.";
    return;
  }
  s.className="cinta-sello"+(RT_VIVO?" vivo":"");
  s.textContent=RT_VIVO?"En vivo \u00b7 "+hhmm(ULTIMA_CARGA):"Datos al "+hhmm(ULTIMA_CARGA);
  s.title=RT_VIVO?"La pantalla se actualiza sola cuando alguien carga o corrige algo."
                 :"Sin conexion en vivo: se refresca cada un minuto.";
}

const ocupado=()=>!!document.querySelector("dialog[open]");

async function refrescar(motivo){
  if(ocupado()){RT_PENDIENTE=true;return}
  RT_PENDIENTE=false;
  const y=window.scrollY;
  try{
    await cargarDesdeNube();
    ULTIMA_CARGA=Date.now(); RT_ERROR="";
    render();
    window.scrollTo(0,y);
  }catch(e){
    RT_ERROR=e.message||String(e);
    console.warn("[caja] refrescar("+motivo+")",e);
  }
  pintarSello();
}

function pedirRefresco(motivo){
  /* Lo que acabo de guardar yo ya esta en pantalla: no me repinto solo. */
  if(Date.now()-YO_GUARDE<4000) return;
  clearTimeout(RT_TIMER);
  RT_TIMER=setTimeout(function(){refrescar(motivo)},800);
}

async function arrancarRealtime(){
  if(!window.sbAuth||typeof window.sbAuth.channel!=="function") return;
  try{
    const {data}=await window.sbAuth.auth.getSession();
    const tok=data&&data.session&&data.session.access_token;
    if(tok&&window.sbAuth.realtime&&window.sbAuth.realtime.setAuth) window.sbAuth.realtime.setAuth(tok);
  }catch(e){}
  let ch=window.sbAuth.channel("caja-"+String(SEDE).replace(/\W+/g,"-").toLowerCase());
  RT_TABLAS.forEach(function(t){
    ch=ch.on("postgres_changes",{event:"*",schema:"public",table:t},function(){pedirRefresco(t)});
  });
  RT_CANAL=ch.subscribe(function(st){
    RT_VIVO=(st==="SUBSCRIBED");
    if(!RT_VIVO&&st) console.warn("[caja] realtime:",st);
    pintarSello();
  });
  window.addEventListener("beforeunload",function(){
    try{window.sbAuth.removeChannel(RT_CANAL)}catch(e){}
  });
}

function arrancarRed(){
  clearInterval(RT_POLL);
  RT_POLL=setInterval(function(){
    if(RT_PENDIENTE&&!ocupado()){refrescar("pendiente");return}
    const limite=RT_VIVO?300000:60000;
    if(Date.now()-ULTIMA_CARGA>=limite) refrescar("poll");
  },20000);
  document.addEventListener("visibilitychange",function(){
    if(document.visibilityState==="visible"&&Date.now()-ULTIMA_CARGA>30000) refrescar("volver");
  });
}

async function arrancar(){
  document.body.classList.add("cargando","gated");
  reloj();setInterval(reloj,30000);
  pintarEscudo();
  $("#gate-btn").addEventListener("click",enviarCodigo);
  $("#gate-mail").addEventListener("keydown",e=>{if(e.key==="Enter")enviarCodigo()});
  $("#gate-btn2").addEventListener("click",verificarCodigo);
  $("#gate-otro").addEventListener("click",volverAlMail);
  $("#gate-code").addEventListener("input",e=>{
    e.target.value=e.target.value.replace(/\D/g,"").slice(0,10);
  });
  $("#gate-code").addEventListener("keydown",e=>{if(e.key==="Enter")verificarCodigo()});

  if(!window.sbAuth){mostrarGate("No se pudo iniciar el cliente de Supabase.","err");return}

  let sesion=null;
  try{
    const {data}=await window.sbAuth.auth.getSession();
    sesion=data&&data.session;
  }catch(e){}
  if(!sesion){mostrarGate();return}

  AUTHUID=sesion.user.id;
  try{
    const filas=await sbRpc("usuario_por_auth_id",{p_auth_user_id:AUTHUID});
    USUARIO=Array.isArray(filas)?filas[0]:filas;
  }catch(e){
    mostrarGate("No pude verificar tu usuario: "+e.message,"err");return;
  }
  if(!USUARIO){
    $("#gate-form").style.display="none";
    mostrarGate("Tu correo entr\u00f3 bien, pero no tiene un usuario asignado en el sistema. Ped\u00ed que te den de alta.","err");return;
  }
  NIVEL=(USUARIO.permisos&&USUARIO.permisos.modulos&&USUARIO.permisos.modulos.caja)||null;
  if(USUARIO.rol==="admin"&&!NIVEL) NIVEL="admin";
  if(!NIVEL){
    $("#gate-form").style.display="none";
    mostrarGate("Tu usuario no tiene acceso al m\u00f3dulo de Caja.","err");return;
  }

  ocultarGate();
  aplicarModo();
  try{
    await cargarDesdeNube();
  }catch(e){
    document.body.classList.remove("cargando");
    toast("No pude traer los datos: "+e.message);
    console.error("[caja] carga",e);
  }
  document.body.classList.remove("cargando");
  if(db.grupos.length&&vista==="importar") vista="dias";
  render();
  ULTIMA_CARGA=ULTIMA_CARGA||Date.now();
  pintarSello();
  arrancarRealtime();
  arrancarRed();
}
