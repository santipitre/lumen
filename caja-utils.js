/* ============================================================
   caja-utils.js — la capa sin estado de caja.html
   ------------------------------------------------------------
   Formato de plata y fechas, parseo del Excel, categorías de
   medio de pago, predicados de retiro y helpers de DOM/diálogo.
   NADA de acá toca `db`, `vista` ni la nube.

   Se carga ANTES que el script de caja.html. Los const/let de
   nivel superior de scripts clásicos comparten scope, así que
   caja.html los ve sin declarar nada global.

   Separado de caja.html el 2026-09-12 (paso 3, rebanada 1).
   ============================================================ */
"use strict";

const CATS={
  efectivo:{nombre:"Efectivo",color:"var(--efectivo-soft)",clase:"chip-ef"},
  tarjeta:{nombre:"Tarjetas",color:"var(--tarjeta-soft)",clase:"chip-ta"},
  billetera:{nombre:"Billetera virtual",color:"var(--billetera-soft)",clase:"chip-bi"},
  otros:{nombre:"Otros valores",color:"var(--otros-soft)",clase:"chip-ot"}
};
const ORDEN_CAT=Object.keys(CATS);
function categoriaDe(medio){
  const m=(medio||"").toUpperCase().trim();
  if(m==="EFECTIVO"||m==="FONDO FIJO") return "efectivo";
  if(m.startsWith("TARJETA")) return "tarjeta";
  if(m.startsWith("BILLETERA")) return "billetera";
  return "otros";
}
const normMedio=m=>(m||"SIN MEDIO").toUpperCase().replace(/\s+/g," ").trim();
const uid=()=>(crypto.randomUUID?crypto.randomUUID():
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;
    return (c==="x"?r:(r&0x3|0x8)).toString(16)}));
const nf0=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:0,maximumFractionDigits:0});
const nf2=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:2,maximumFractionDigits:2});
const plata=n=>(Math.abs((n||0)%1)>.004?nf2:nf0).format(n||0);
const numero=n=>new Intl.NumberFormat("es-AR").format(n||0);
function parseMonto(t){
  if(typeof t==="number")return t; if(!t)return 0;
  let s=String(t).trim().replace(/\s|\$|ARS/gi,""); if(!s)return 0;
  const neg=/^-/.test(s)||/\)$/.test(s); s=s.replace(/[-()]/g,"");
  if(s.includes(",")) s=s.replace(/\./g,"").replace(",",".");
  else if((s.match(/\./g)||[]).length>1) s=s.replace(/\./g,"");
  else if(s.includes(".")){const[a,b]=s.split(".");if(b.length===3)s=a+b}
  const n=parseFloat(s); if(!isFinite(n))return 0; return neg?-n:n;
}
const hoyISO=()=>new Date().toLocaleDateString("sv-SE");
const fechaCorta=i=>i?i.split("-").reverse().join("/"):"";
const fechaDM=i=>i?i.split("-").reverse().slice(0,2).join("/"):"";
const DIA_S=["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"];
const MES_S=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const fechaSep=i=>{if(!i)return"";const d=new Date(i+"T12:00:00");
  return DIA_S[d.getDay()]+" "+d.getDate()+" "+MES_S[d.getMonth()]+" "+d.getFullYear()};
const fechaLarga=i=>i?new Date(i+"T12:00:00").toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):"";
function parseFecha(v){
  if(v instanceof Date&&!isNaN(v)) return new Date(Date.UTC(v.getUTCFullYear(),v.getUTCMonth(),v.getUTCDate())).toISOString().slice(0,10);
  if(typeof v==="number"&&v>20000&&v<80000){ // serial de Excel
    const d=new Date(Date.UTC(1899,11,30)+v*864e5);
    return d.toISOString().slice(0,10);
  }
  const s=String(v||"").trim(); if(!s)return null;
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m)return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if(m){let a=m[3];if(a.length===2)a=(+a>70?"19":"20")+a;return `${a}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`}
  return null;
}
const esDeposito=r=>r.tipo==="deposito";
const estadoRet=r=>r.estado||"FIRMADO";
const retiroVivo=r=>!esDeposito(r)&&estadoRet(r)!=="ANULADO"&&estadoRet(r)!=="EXPIRADO";
const retiroFirmado=r=>retiroVivo(r)&&estadoRet(r)!=="PENDIENTE_FIRMA";
const esperaFirma=r=>!esDeposito(r)&&estadoRet(r)==="PENDIENTE_FIRMA";
function totales(gr){
  const t={efectivo:0,tarjeta:0,billetera:0,otros:0,total:0,n:0,comps:0};
  for(const g of gr){t[g.categoria]+=g.monto;t.total+=g.monto;t.n++;t.comps+=g.n||0}
  return t;
}
function porDia(gr){
  const m=new Map();
  for(const g of gr){
    const k=g.fecha+"|"+g.cajero;
    if(!m.has(k))m.set(k,{fecha:g.fecha,cajero:g.cajero,efectivo:0,tarjeta:0,billetera:0,otros:0,total:0,comps:0,grupos:[]});
    const o=m.get(k); o[g.categoria]+=g.monto; o.total+=g.monto; o.comps+=g.n||0; o.grupos.push(g);
  }
  return [...m.values()].sort((a,b)=>a.fecha===b.fecha?a.cajero.localeCompare(b.cajero):a.fecha.localeCompare(b.fecha));
}
const diaSig=i=>{const d=new Date(i+"T12:00:00");d.setDate(d.getDate()+1);return d.toLocaleDateString("sv-SE")};
const clavePer=o=>o&&o.desde&&o.hasta?o.desde+"|"+o.hasta:"";
const perTexto=o=>clavePer(o)?fechaCorta(o.desde)+" \u2192 "+fechaCorta(o.hasta):"\u2014";
const $=s=>document.querySelector(s);
function el(t,p={},...kids){
  const n=document.createElement(t);
  for(const[k,v]of Object.entries(p)){
    if(k==="class")n.className=v; else if(k==="html")n.innerHTML=v;
    else if(k.startsWith("on"))n.addEventListener(k.slice(2),v);
    else if(v!==null&&v!==undefined&&v!==false)n.setAttribute(k,v);
  }
  for(const kid of kids.flat()){if(kid===null||kid===undefined||kid===false)continue;n.append(kid.nodeType?kid:document.createTextNode(kid))}
  return n;
}
const kpi=(k,v,c,pct)=>el("div",{class:"kpi"},
  el("div",{class:"k"},c?el("i",{class:"kpi-pt",style:`background:${c}`}):null,k),
  el("div",{class:"v",style:c?`color:${c}`:null},v),
  pct==null?null:el("div",{class:"kpi-barra"},
    el("i",{style:`width:${Math.max(0,Math.min(100,pct))}%;background:${c||"var(--ink-3)"}`})),
  pct==null?null:el("div",{class:"kpi-pct"},Math.round(pct)+"% del facturado"));
function modal({titulo,cuerpo,acciones}){
  const d=$("#dlg"); $("#dlg-t").textContent=titulo; $("#dlg-b").replaceChildren(cuerpo);
  const f=$("#dlg-f"); f.replaceChildren();
  for(const a of acciones) f.append(el("button",{class:"btn "+(a.clase==null?"ghost":a.clase),type:"button",onclick:async()=>{if(a.accion&&await a.accion()===false)return;d.close()}},a.texto));
  d.showModal(); const x=$("#dlg-b").querySelector("input,select,button"); if(x)x.focus(); return d;
}
function _dlg2({titulo,texto,acciones,peligro,kicker,campo}){
  return new Promise(resolve=>{
    const d=$("#dlg2");
    d.classList.toggle("peligro",!!peligro);
    $("#dlg2-t").parentElement.replaceChildren(
      el("div",{class:"dlg-kicker"},kicker||(peligro?"Acci\u00f3n irreversible":"Confirmaci\u00f3n")),
      el("h2",{id:"dlg2-t"},titulo));

    const cuerpo=$("#dlg2-b"); cuerpo.replaceChildren();
    for(const t of (Array.isArray(texto)?texto:[texto])) cuerpo.append(el("p",{},t));

    let ta=null, err=null;
    if(campo){
      ta=el("textarea",{placeholder:campo.ejemplo||"",rows:"3",maxlength:"400"});
      err=el("p",{class:"err"});
      cuerpo.append(el("div",{class:"dlg-campo"},
        el("label",{},campo.etiqueta),ta,err));
    }

    const f=$("#dlg2-f"); f.replaceChildren();
    let resuelto=false;
    const cerrar=v=>{if(resuelto)return;resuelto=true;d.close();resolve(v)};
    for(const a of acciones){
      f.append(el("button",{class:"btn "+(a.clase==null?"ghost":a.clase),type:"button",onclick:()=>{
        if(a.valor&&campo){
          const v=ta.value.trim();
          if(v.length<(campo.minimo||1)){
            err.textContent=campo.error||"Escrib\u00ed una observaci\u00f3n.";
            ta.focus(); return;
          }
          cerrar(v); return;
        }
        cerrar(a.valor);
      }},a.texto));
    }
    d.addEventListener("close",()=>cerrar(false),{once:true});
    d.showModal();
    if(ta) ta.focus();
    else { const b=f.querySelector("button:last-child"); if(b)b.focus(); }
  });
}
const confirmar=(titulo,texto,{ok="Continuar",cancelar="Cancelar",peligro=false,kicker,campo}={})=>
  _dlg2({titulo,texto,peligro,kicker,campo,acciones:[
    {texto:cancelar,valor:false},
    {texto:ok,valor:true,clase:peligro?"danger":""}]});
const avisar=(titulo,texto)=>
  _dlg2({titulo,texto,kicker:"Aviso",acciones:[{texto:"Entendido",valor:true,clase:""}]});
const COLS={
  fecha:["fecha","f/ comprobante","fecha comprobante"],
  cajero:["cajero","operador","usuario"],
  medio:["medio cancelación","medio cancelacion","medio de cancelación","medio","forma de pago"],
  monto:["monto","importe"],
  total:["total"],
  letra:["letra"], numero:["numero","número","nro","n° comprobante"], tc:["tc","tipo comprobante"],
  anulada:["anulada"]
};
function mapear(cab){
  const norm=cab.map(h=>String(h||"").toLowerCase().replace(/\s+/g," ").trim());
  const idx={};
  for(const[campo,alias]of Object.entries(COLS)){
    idx[campo]=norm.findIndex(h=>alias.some(a=>h===a));
    if(idx[campo]<0) idx[campo]=norm.findIndex(h=>alias.some(a=>h.includes(a)));
  }
  return idx;
}
const compsNorm=cs=>(cs||[]).map(x=>(x&&typeof x==="object")
  ?{n:String(x.n==null?"":x.n),m:Number(x.m)||0,sm:x.m!=null&&x.m!==""}
  :{n:String(x),m:0,sm:false});
const escHTML=t=>String(t==null?"":t).replace(/[&<>"]/g,
  c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const nroComprobante=r=>"R-"+fechaCorta(r.fecha).split("/").reverse().join("")+
  "-"+String(r.id).replace(/[^a-zA-Z0-9]/g,"").slice(0,6).toUpperCase();
function bajar(nombre,contenido,tipo){
  const b=new Blob(["\ufeff"+contenido],{type:tipo+";charset=utf-8"});
  const u=URL.createObjectURL(b); const a=el("a",{href:u,download:nombre});
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);
}
const FMT_PESOS='"$" #,##0;[Red]-"$" #,##0';
const FMT_FECHA='dd/mm/yyyy';
const aFecha=i=>{const[a,m,d]=i.split("-").map(Number);return new Date(a,m-1,d)};
const miles=e=>e.replace(/\B(?=(\d{3})+(?!\d))/g,".");
function montoTexto(n){
  const v=Number(n)||0, [e,d]=Math.abs(v).toFixed(2).split(".");
  return (v<0?"-":"")+miles(e)+(d==="00"?"":","+d);
}
const sigMonto=c=>/[\d,-]/.test(c);
function formatearMonto(inp){
  const pos=inp.selectionStart==null?inp.value.length:inp.selectionStart;
  // contar dígitos Y coma: si sólo se cuentan dígitos, al escribir la coma
  // el cursor vuelve delante de ella y el dígito siguiente entra en los enteros
  const antes=(inp.value.slice(0,pos).match(/[\d,-]/g)||[]).length;
  let v=inp.value.replace(/[^\d,.-]/g,"");
  const neg=v.startsWith("-"); v=v.replace(/-/g,"");
  const coma=v.indexOf(",");
  const ent=(coma<0?v:v.slice(0,coma)).replace(/\./g,"").replace(/^0+(?=\d)/,"");
  const dec=coma<0?"":v.slice(coma+1).replace(/\D/g,"").slice(0,2);
  let out=miles(ent)+(coma<0?"":","+dec);
  if(neg) out="-"+out;
  inp.value=out;
  // dejar el cursor después de la misma cantidad de dígitos que había antes
  let n=0,i=0;
  while(i<out.length&&n<antes){ if(sigMonto(out[i])) n++; i++ }
  try{ inp.setSelectionRange(i,i) }catch(e){}
}
function pesos(inp){
  inp.addEventListener("input",()=>formatearMonto(inp));
  inp.addEventListener("blur",()=>{ if(inp.value.trim()) inp.value=montoTexto(parseMonto(inp.value)) });
  if(inp.value) formatearMonto(inp);
  return el("span",{class:"money-wrap"},inp);
}
const hhmm=ts=>new Date(ts).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
