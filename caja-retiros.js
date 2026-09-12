/* ============================================================
   caja-retiros.js — parte de caja.html
   ------------------------------------------------------------
   Las salidas de caja. La vista Retiros y sus diálogos, el circuito
   de firma del mensajero (QR + PIN) y el comprobante de retiro.

   Se carga DESPUÉS de caja-importar.js.
   El orden importa: los archivos se cortaron en orden de aparición
   y se cargan en ese mismo orden, así la evaluación es idéntica a
   la del archivo único que había antes.
   Separado de caja.html el 2026-09-12 (paso 3, rebanada 2).
   ============================================================ */
"use strict";

/* ============================================================
   VISTA: RETIROS
   ============================================================ */
/* ============================================================
   FIRMA DEL MENSAJERO
   El retiro queda PENDIENTE_FIRMA y se muestra un QR. El mensajero lo escanea
   con el celular, abre caja-firmar.html y tipea su PIN: el PIN es lo que dice
   si es Sergio o Maxi, no hay mensajero asignado de antemano. La firma la
   resuelve la funcion caja_firmar_retiro en la base (SECURITY DEFINER), asi
   que el hash del PIN nunca llega al navegador.
   ============================================================ */
const VENCE_QR=5*60*1000;
const urlFirma=r=>location.origin+location.pathname.replace(/\/[^\/]*$/,"")+
  "/caja-firmar.html?token="+encodeURIComponent(r.qr_token||"");
let qrTimers=[];
const pararQR=()=>{qrTimers.forEach(t=>clearInterval(t));qrTimers=[]};

function dialogoQR(r){
  if(!r.qr_token){toast("Este retiro no tiene QR. Eliminalo y registralo de nuevo.");return}
  const url=urlFirma(r);
  const lienzo=el("div",{style:"display:flex;justify-content:center;padding:14px;background:#fff;"+
    "border:1px solid var(--linea);border-radius:14px"});
  const reloj=el("div",{style:"text-align:center;font-family:var(--mono);font-size:22px;font-weight:700;margin-top:10px"});
  const pieReloj=el("p",{class:"hint",style:"text-align:center;margin:2px 0 0"},"El QR vence a los 5 minutos");
  const pinCampo=()=>el("input",{type:"password",inputmode:"numeric",maxlength:"6",placeholder:"••••",
    style:"width:120px;text-align:center;font-family:var(--mono);font-size:19px;letter-spacing:.3em"});
  const iPin=pinCampo();
  const errPin=el("p",{class:"err-campo",style:"display:none"});
  const tituloAsis=el("div",{class:"f",style:"margin-bottom:5px"},"Firma asistida");
  const hintAsis=el("p",{class:"hint",style:"margin:0 0 9px"},
    "Si el mensajero no tiene el celular a mano, que tipee el PIN acá. También firmás vos con tu PIN si estás cargando un movimiento viejo.");
  const filaAsis=el("div",{style:"display:flex;gap:9px;align-items:center;flex-wrap:wrap"});
  const bloqueAsistida=el("div",{style:"margin-top:16px;border-top:1px dashed var(--linea);padding-top:12px"},
    tituloAsis,hintAsis,filaAsis,errPin);
  let pinMemo="";   // PIN actual, para el cambio obligatorio de la primera vez
  function pasoPin(){
    tituloAsis.textContent="Firma asistida";
    filaAsis.replaceChildren(iPin,
      el("button",{class:"btn ghost small",type:"button",onclick:()=>firmarAsistida()},"Confirmar firma"));
  }
  function pasoCambioPin(quien){
    tituloAsis.textContent="Primera vez: pon\u00e9 tu PIN personal";
    hintAsis.textContent=(quien?quien+", el":"El")+" PIN gen\u00e9rico sirve una sola vez. Eleg\u00ed uno propio de 4 a 6 d\u00edgitos.";
    const p1=pinCampo(), p2=pinCampo();
    filaAsis.replaceChildren(p1,p2,
      el("button",{class:"btn ghost small",type:"button",onclick:()=>{
        const a=(p1.value||"").trim(), b=(p2.value||"").trim();
        if(a.length<4) return falla("El PIN nuevo tiene al menos 4 dígitos.");
        if(a!==b) return falla("Los dos PIN no coinciden.");
        cambiarYFirmar(a);
      }},"Guardar y firmar"));
    p1.focus();
  }
  function pasoRetira(firmante,opciones){
    tituloAsis.textContent="\u00bfQui\u00e9n se llev\u00f3 la plata?";
    hintAsis.textContent="Firma "+firmante+". Indic\u00e1 qui\u00e9n retir\u00f3 en realidad; si la plata la llevaste vos, eleg\u00ed tu propio nombre y queda asentado como RETIRO EXCEPCIONAL.";
    const sQ=el("select",{style:"min-width:190px"},
      el("option",{value:""},"Elegí quién retiró"),
      ...(opciones||[]).map(n=>el("option",{value:n},n===firmante?(n+" — retiro excepcional"):n)));
    filaAsis.replaceChildren(sQ,
      el("button",{class:"btn ghost small",type:"button",onclick:()=>{
        if(!sQ.value) return falla("Elegí quién se llevó la plata.");
        firmarAsistida(pinMemo,sQ.value);
      }},"Confirmar"));
  }
  const falla=t=>{errPin.textContent=t;errPin.style.display=""};
  pasoPin();

  try{
    if(typeof QRCode==="undefined") throw new Error("sin libreria");
    new QRCode(lienzo,{text:url,width:224,height:224,
      colorDark:"#2B2721",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});
  }catch(e){
    lienzo.append(el("p",{class:"hint",style:"margin:0;text-align:center"},
      "No se pudo dibujar el QR. Pasale el link de abajo al mensajero."));
  }

  const dlg=modal({titulo:"Esperando la firma del mensajero",cuerpo:el("div",{},
      el("p",{class:"hint",style:"margin:0 0 12px"},
        "Que escanee el QR con el celular y firme con su PIN. El efectivo baja de la caja reci\u00e9n cuando firma."),
      el("div",{style:"display:flex;justify-content:space-between;gap:14px;font-family:var(--mono);"+
        "font-size:13.5px;margin-bottom:12px"},
        el("span",{},(r.dias||[]).length+" d\u00eda(s)"),
        el("span",{},"Retira ",el("b",{style:"color:var(--efectivo)"},plata(r.monto)))),
      lienzo,reloj,pieReloj,
      el("p",{style:"margin:12px 0 0;font-family:var(--mono);font-size:11px;color:var(--ink-3);"+
        "word-break:break-all;text-align:center"},url),
      bloqueAsistida),
    acciones:[
      {texto:"Cancelar el retiro",clase:"danger",accion:async()=>{
        if(!await confirmar("Cancelar el retiro",
          [`Se borra el retiro de ${plata(r.monto)} que est\u00e1 esperando firma.`,
           "Los d\u00edas vuelven a quedar disponibles."],{ok:"Cancelar el retiro",peligro:true})) return false;
        pararQR();
        db.retiros=db.retiros.filter(x=>x.id!==r.id);
        guardar();toast("Retiro cancelado.");render();
      }},
      {texto:"Seguir despu\u00e9s"}]});
  dlg.addEventListener("close",pararQR,{once:true});

  /* cuenta regresiva */
  const vence=Date.parse(r.qr_expires_at)||(Date.now()+VENCE_QR);
  const pintarReloj=()=>{
    const q=Math.max(0,Math.round((vence-Date.now())/1000));
    reloj.textContent=Math.floor(q/60)+":"+String(q%60).padStart(2,"0");
    reloj.style.color=q<=60?"var(--alerta)":(q<=120?"var(--aviso)":"var(--ink-2)");
    if(q<=0){pararQR();pieReloj.textContent="El QR venci\u00f3. Cancelalo y registralo de nuevo.";}
  };
  pintarReloj(); qrTimers.push(setInterval(pintarReloj,1000));

  /* espera de la firma */
  qrTimers.push(setInterval(async()=>{
    try{
      const f=await sbQuery("caja_retiros","select=*&id=eq."+r.id);
      const fila=f&&f[0]; if(!fila) return;
      if(fila.estado==="FIRMADO"){pararQR();aplicarFirma(r,fila);}
      else if(fila.estado==="EXPIRADO"){pararQR();pieReloj.textContent="El QR venci\u00f3.";}
    }catch(e){console.warn("[caja] espera firma",e)}
  },2500));

  async function trasFirmar(j){
    pararQR();
    const f=await sbQuery("caja_retiros","select=*&id=eq."+r.id).catch(()=>null);
    aplicarFirma(r,(f&&f[0])||{estado:"FIRMADO",responsable:j.mensajero_nombre,
      firmado_at:j.firmado_at,firma_modo:j.firma_modo||"ASISTIDA",
      firmado_por_nombre:j.firmante,retira_nombre:j.mensajero_nombre,mensajero_id:j.mensajero_id});
  }
  function traducir(j){
    const e=j&&j.error;
    if(e==="RETIRA_INVALIDO") return "Ese nombre no está habilitado para retirar.";
    return e==="PIN_INCORRECTO"?"PIN incorrecto. Quedan "+(j.intentos_restantes!=null?j.intentos_restantes:"pocos")+" intento(s).":
      e==="DEMASIADOS_INTENTOS"?"Demasiados intentos con este QR. Cancelalo y registrá el retiro de nuevo.":
      e==="BLOQUEADO_TEMPORALMENTE"?"Ese usuario está bloqueado unos minutos por intentos fallidos.":
      e==="EXPIRADO"?"El QR venció. Cancelalo y registrá el retiro de nuevo.":
      e==="YA_PROCESADO"?"Este retiro ya estaba firmado.":
      e==="PIN_CORTO"?"El PIN tiene al menos 4 dígitos.":
      e==="PIN_NUEVO_CORTO"?"El PIN nuevo tiene al menos 4 dígitos.":
      e==="PIN_IGUAL"?"El PIN nuevo tiene que ser distinto del genérico.":
      ("No se pudo firmar: "+(e||"error desconocido"));
  }
  async function firmarAsistida(pinDado,retira){
    errPin.style.display="none";
    const pin=(pinDado!=null?pinDado:(iPin.value||"")).trim();
    if(pin.length<4){falla("El PIN tiene al menos 4 dígitos.");iPin.focus();return}
    let j;
    try{ j=await sbRpc("caja_firmar_retiro",
      {p_token:r.qr_token,p_pin:pin,p_ip:null,p_modo:"ASISTIDA",p_retira:retira||null}); }
    catch(e){ falla("No se pudo conectar: "+e.message); return }
    iPin.value="";
    if(j&&j.ok) return trasFirmar(j);
    if(j&&j.error==="DEBE_CAMBIAR_PIN"){pinMemo=pin;return pasoCambioPin(j.mensajero_nombre)}
    if(j&&j.error==="NECESITA_RETIRA"){pinMemo=pin;return pasoRetira(j.firmante,j.opciones)}
    falla(traducir(j));
  }
  async function cambiarYFirmar(nuevo){
    errPin.style.display="none";
    let j;
    try{ j=await sbRpc("caja_cambiar_pin_y_firmar",
      {p_token:r.qr_token,p_pin_actual:pinMemo,p_pin_nuevo:nuevo,p_ip:null,p_modo:"ASISTIDA",p_retira:null}); }
    catch(e){ falla("No se pudo conectar: "+e.message); return }
    if(j&&j.ok){toast("PIN guardado.");return trasFirmar(j)}
    if(j&&j.error==="NECESITA_RETIRA"){pinMemo=nuevo;toast("PIN guardado.");return pasoRetira(j.firmante,j.opciones)}
    falla(traducir(j));
  }
}

/* la firma vuelve de la base: se copia a la fila local sin re-insertarla */
function aplicarFirma(r,fila){
  r.estado="FIRMADO";
  r.responsable=fila.responsable||r.responsable;
  r.retira_nombre=fila.retira_nombre||fila.responsable||r.responsable;
  r.firmado_por_nombre=fila.firmado_por_nombre||fila.responsable||"";
  r.mensajero_id=fila.mensajero_id||"";
  r.firmado_at=fila.firmado_at||new Date().toISOString();
  r.firma_modo=fila.firma_modo||"QR";
  snapshot();render();
  toast("Firmó "+(r.responsable||"el mensajero")+".");
  setTimeout(()=>dialogoTesorero(r),200);
}

/* despues de la firma: a que tesorero le entrega el mensajero esa plata */
function dialogoTesorero(r){
  const sT=el("select",{style:"width:100%"},
    el("option",{value:""},"Elegí el tesorero"),
    ...db.depositantes.map(t=>el("option",{value:t},t)));
  if(r.tesorero) sT.value=r.tesorero;
  const err=el("p",{class:"err-campo",style:"display:none"});
  modal({titulo:"¿A qué tesorero va?",cuerpo:el("div",{},
      el("p",{class:"hint",style:"margin:0 0 12px"},
        "Firmó "+escHTML(r.responsable||"")+" y se lleva "+plata(r.monto)+
        ". Indicá a qué tesorero le entrega esa plata: es quien después hace el depósito bancario."),
      el("label",{class:"f"},"Tesorero que recibe",sT),err),
    acciones:[{texto:"Ahora no"},{texto:"Guardar",clase:"",accion:async()=>{
      if(!sT.value){err.textContent="Elegí el tesorero.";err.style.display="";return false}
      try{ await sbPatch("caja_retiros","id=eq."+r.id,{tesorero:sT.value}); }
      catch(e){ err.textContent="No se pudo guardar: "+e.message; err.style.display=""; return false }
      r.tesorero=sT.value;
      db.depositantes=[...new Set([...db.depositantes,sT.value])].sort();
      render();toast("Entregado a "+sT.value+".");
      setTimeout(()=>dialogoComprobante(r),180);
    }}]});
}

/* ============================================================
   COMPROBANTE DE RETIRO
   Se arma como HTML con los estilos en linea: el mismo string sirve para la
   ventana de impresion y para el cuerpo del mail (los clientes de correo
   descartan las hojas de estilo).
   ============================================================ */
function comprobanteHTML(r){
  const ds=detalleDias(r), suma=ds.reduce((a,d)=>a+d.monto,0), dif=r.monto-suma;
  const TH="text-align:left;padding:7px 10px;border-bottom:1px solid #D9D4C9;font:600 11px/1.4 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6B6558";
  const TD="padding:7px 10px;border-bottom:1px solid #EDE9E0;font:14px/1.45 Arial,sans-serif;color:#2B2721";
  const TN="padding:7px 10px;border-bottom:1px solid #EDE9E0;font:600 14px/1.45 Consolas,monospace;color:#2E775C;text-align:right;white-space:nowrap";
  const dato=(k,v)=>'<tr><td style="padding:3px 0;font:12px Arial,sans-serif;color:#6B6558;white-space:nowrap">'+k+
    '</td><td style="padding:3px 0 3px 16px;font:600 14px Arial,sans-serif;color:#2B2721">'+v+'</td></tr>';
  const rango=ds.length?fechaCorta(ds[0].fecha)+" a "+fechaCorta(ds[ds.length-1].fecha):"\u2014";
  return '<div style="max-width:660px;margin:0 auto;padding:26px 30px;background:#fff;color:#2B2721;font-family:Arial,Helvetica,sans-serif">'+
  '<div style="border-top:3px solid #B99A54;padding-top:14px">'+
    '<div style="font:700 12px/1 Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#6B6558">FUESMEN &middot; Hospital Italiano de Mendoza</div>'+
    '<h1 style="margin:9px 0 3px;font:700 25px/1.15 Georgia,serif;color:#2B2721">Comprobante de retiro de efectivo</h1>'+
    '<div style="font:12px Consolas,monospace;color:#6B6558">N&deg; '+escHTML(nroComprobante(r))+' &middot; '+escHTML(SEDE)+'</div>'+
  '</div>'+
  '<table style="border-collapse:collapse;margin:18px 0 4px">'+
    dato("Fecha del retiro",escHTML(fechaLarga(r.fecha)))+
    dato("Mensajero que retira",escHTML(r.retira_nombre||r.responsable||"\u2014"))+
    (r.firmado_at?dato("Firma",
      escHTML(r.firmado_por_nombre||r.responsable||"")+
      '<span style="font-weight:400;color:#6B6558"> &middot; '+
      escHTML(new Date(r.firmado_at).toLocaleString("es-AR"))+' &middot; '+
      (r.firma_modo==="CARGA"?"carga administrativa":
       r.firma_modo==="EXCEPCIONAL"?"retiro excepcional":
       r.firma_modo==="ASISTIDA"?"firma asistida":"QR + PIN")+'</span>'):"")+
    (r.tesorero?dato("Entregado al tesorero",escHTML(r.tesorero)):"")+
    dato("D\u00edas que cubre",escHTML(ds.length+(ds.length===1?" d\u00eda":" d\u00edas")+"  \u00b7  "+rango))+
    (r.detalle?dato("Detalle",escHTML(r.detalle)):"")+
  '</table>'+
  '<table style="width:100%;border-collapse:collapse;margin-top:16px"><thead><tr>'+
    '<th style="'+TH+'">D\u00eda de caja</th>'+
    '<th style="'+TH+';text-align:right">Efectivo</th></tr></thead><tbody>'+
    ds.map(d=>'<tr><td style="'+TD+'">'+escHTML(fechaLarga(d.fecha))+'</td>'+
      '<td style="'+TN+'">'+escHTML(plata(d.monto))+'</td></tr>').join("")+
    '</tbody><tfoot><tr>'+
    '<td style="padding:12px 10px;font:700 14px Arial,sans-serif">Total retirado</td>'+
    '<td style="padding:12px 10px;text-align:right;font:700 19px Consolas,monospace;color:#2E775C">'+escHTML(plata(r.monto))+'</td>'+
    '</tr>'+(Math.abs(dif)>.5?'<tr><td colspan="2" style="padding:0 10px 10px;font:12px Arial,sans-serif;color:#8A5A00">'+
      'Los d\u00edas detallados suman '+escHTML(plata(suma))+': hay una diferencia de '+escHTML(plata(dif))+' con el monto retirado.</td></tr>':"")+
    '</tfoot></table>'+
  '<table style="width:100%;margin-top:54px;border-collapse:collapse"><tr>'+
    '<td style="width:50%;padding-right:20px"><div style="border-top:1px solid #2B2721;padding-top:6px;font:12px Arial,sans-serif;color:#6B6558">Entrega &mdash; Caja</div></td>'+
    '<td style="width:50%;padding-left:20px"><div style="border-top:1px solid #2B2721;padding-top:6px;font:12px Arial,sans-serif;color:#6B6558">Recibe &mdash; '+escHTML(r.responsable)+'</div></td>'+
  '</tr></table>'+
  '<p style="margin-top:26px;font:11px Arial,sans-serif;color:#9A9488">Emitido por Lumen &middot; Rendici\u00f3n de Caja el '+
    escHTML(new Date().toLocaleString("es-AR"))+'.</p>'+
  '<p style="margin-top:8px;padding-top:8px;border-top:1px solid #EDE9E0;font:10px Arial,sans-serif;color:#8A5A00">'+
    'Documento confidencial de uso interno de FUESMEN &middot; Hospital Italiano de Mendoza. '+
    'No difundir fuera de la instituci\u00f3n.</p></div>';
}
function imprimirComprobante(r){
  const z=$("#impresion"); z.innerHTML=comprobanteHTML(r);
  document.body.classList.add("imprimiendo");
  window.addEventListener("afterprint",()=>{
    document.body.classList.remove("imprimiendo"); z.innerHTML="";
  },{once:true});
  setTimeout(()=>window.print(),60);
}
/* El envio sale por la edge function enviar-comprobante del proyecto: el
   navegador no puede mandar mails y la clave del servicio no puede vivir en
   un HTML publico. Si el secreto no esta cargado, la funcion contesta 503 con
   el mensaje que se muestra tal cual. */
const MAIL_GUARDADO="lumen_caja_mail";
const leerMail=()=>{try{return localStorage.getItem(MAIL_GUARDADO)||""}catch(e){return""}};
/* ------------------------------------------------------------
   Mandar por Outlook, a mano. Sin servicio de envío ni secretos:
   Lumen arma el mail (destinatario, asunto, cuerpo en texto) y lo
   abre en Outlook web con la cuenta institucional; el comprobante
   completo con formato queda copiado al portapapeles para pegar
   con Ctrl+V. Lo manda una persona, desde su casilla, y queda en
   sus Enviados. Para plata, eso es una ventaja, no un defecto.
   ------------------------------------------------------------ */
function resumenComprobanteTexto(r){
  const ds=detalleDias(r);
  const L=[];
  L.push("COMPROBANTE DE RETIRO DE EFECTIVO  "+nroComprobante(r));
  L.push("FUESMEN · Hospital Italiano de Mendoza · "+SEDE);
  L.push("");
  L.push("Fecha del retiro:     "+fechaLarga(r.fecha));
  L.push("Mensajero que retira: "+(r.retira_nombre||r.responsable||"—"));
  if(r.tesorero) L.push("Entregado a:          "+r.tesorero);
  L.push("Total retirado:       "+plata(r.monto));
  if(ds.length){
    L.push("");
    L.push("Días que cubre ("+ds.length+"):");
    for(const d of ds) L.push("  · "+fechaCorta(d.fecha)+"   "+plata(d.monto));
  }
  if(r.detalle){ L.push(""); L.push("Detalle: "+r.detalle); }
  L.push("");
  L.push("El comprobante completo va pegado debajo de esta línea (o adjunto en PDF).");
  L.push("Emitido por Lumen · Rendición de Caja.");
  return L.join("\n");
}
/* El cuerpo del mail es corto a propósito: el comprobante va pegado como imagen. */
function cuerpoMailComprobante(r){
  const ds=detalleDias(r);
  const rango=ds.length?(ds.length===1?fechaCorta(ds[0].fecha):fechaCorta(ds[0].fecha)+" a "+fechaCorta(ds[ds.length-1].fecha)):"";
  return "Comprobante de retiro de efectivo "+nroComprobante(r)+" por "+plata(r.monto)+
    (ds.length?" ("+ds.length+(ds.length===1?" día":" días")+(rango?": "+rango:"")+")":"")+
    ", retirado por "+(r.retira_nombre||r.responsable||"—")+".\n\n"+
    "El comprobante va pegado debajo.\n\nEmitido por Lumen · Rendición de Caja.";
}
/* Outlook web: los espacios van como %20, no como + (encodeURIComponent lo hace bien). */
const urlOutlook=(r,para,copia)=>"https://outlook.office.com/mail/deeplink/compose"+
  "?to="+encodeURIComponent(para)+
  (copia?"&cc="+encodeURIComponent(copia):"")+
  "&subject="+encodeURIComponent("Comprobante de retiro "+nroComprobante(r)+" · "+plata(r.monto))+
  "&body="+encodeURIComponent(cuerpoMailComprobante(r))+
  "&online=1";
/* El comprobante como IMAGEN (PNG). Es el mismo HTML que se imprime, dibujado
   en un lienzo a través de un SVG con foreignObject: sin librerías, sin red,
   y se ve igual que el PDF. Sólo usa fuentes del sistema, así que el SVG no
   necesita cargar nada de afuera (y el lienzo no queda "sucio"). */
const ANCHO_COMPROBANTE=720;
async function imagenComprobante(r,escala){
  escala=escala||2;
  const host=el("div",{style:"position:fixed;left:-20000px;top:0;width:"+ANCHO_COMPROBANTE+"px;background:#fff"});
  host.innerHTML=comprobanteHTML(r);
  document.body.append(host);
  const w=ANCHO_COMPROBANTE, h=Math.ceil(host.getBoundingClientRect().height);
  /* XMLSerializer da XHTML válido: cierra los tags y convierte las entidades. */
  const xhtml=new XMLSerializer().serializeToString(host);
  host.remove();
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">'+
    '<foreignObject width="100%" height="100%">'+
    xhtml.replace(/position:\s*fixed;left:-20000px;top:0;/,"")+
    '</foreignObject></svg>';
  const img=new Image();
  await new Promise((ok,ko)=>{img.onload=ok;img.onerror=()=>ko(new Error("no se pudo dibujar el comprobante"));
    img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg)});
  const c=document.createElement("canvas"); c.width=w*escala; c.height=h*escala;
  const g=c.getContext("2d"); g.scale(escala,escala);
  g.fillStyle="#fff"; g.fillRect(0,0,w,h); g.drawImage(img,0,0,w,h);
  const blob=await new Promise(res=>c.toBlob(res,"image/png"));
  if(!blob) throw new Error("el navegador no dejó exportar la imagen");
  return {blob,w:c.width,h:c.height};
}
/* Copia la IMAGEN del comprobante al portapapeles. Si no se puede, cae al
   HTML con formato, y en último caso al texto. Devuelve qué quedó copiado. */
async function copiarComprobante(r){
  if(!navigator.clipboard) return "";
  try{
    if(window.ClipboardItem){
      let png=null;
      try{ png=(await imagenComprobante(r)).blob; }catch(e){ console.warn("[caja] imagen",e); }
      if(png){
        await navigator.clipboard.write([new ClipboardItem({"image/png":png})]);
        return "imagen";
      }
      await navigator.clipboard.write([new ClipboardItem({
        "text/html":new Blob([comprobanteHTML(r)],{type:"text/html"}),
        "text/plain":new Blob([resumenComprobanteTexto(r)],{type:"text/plain"})})]);
      return "html";
    }
    await navigator.clipboard.writeText(resumenComprobanteTexto(r));
    return "texto";
  }catch(e){ console.warn("[caja] portapapeles",e); return ""; }
}
function dialogoMail(r){
  const iP=el("input",{type:"text",placeholder:"tesoreria@ejemplo.com",
    value:leerMail(),style:"width:100%"});
  const iC=el("input",{type:"text",placeholder:"Opcional",style:"width:100%"});
  const iA=el("input",{type:"text",style:"width:100%",
    value:"Comprobante de retiro "+nroComprobante(r)+" \u00b7 "+plata(r.monto)});
  const err=el("p",{class:"err-campo",style:"display:none"});
  const fallar=(t,f)=>{err.textContent=t;err.style.display="";if(f)f.focus();return false};
  modal({titulo:"Enviar el comprobante",cuerpo:el("div",{},
      el("p",{class:"hint",style:"margin:0 0 12px"},
        "Abrir en Outlook arma el mail con tu cuenta y deja la imagen del comprobante copiada: en el cuerpo, peg\u00e1s con Ctrl+V y envi\u00e1s. "+
        "Pod\u00e9s poner varios destinatarios separados por coma."),
      el("label",{class:"f"},"Para *",iP),
      el("label",{class:"f",style:"margin-top:10px"},"Copia a",iC),
      el("label",{class:"f",style:"margin-top:10px"},"Asunto",iA),
      err),
    acciones:[{texto:"Cancelar"},
      {texto:"Abrir en Outlook",clase:"",accion:async()=>{
        err.style.display="none";
        const para=iP.value.trim();
        if(!para) return fallar("Falta el destinatario.",iP);
        const copiado=await copiarComprobante(r);
        const w=window.open(urlOutlook(r,para,iC.value.trim()),"_blank","noopener");
        if(!w){ return fallar("El navegador bloque\u00f3 la ventana de Outlook. Permit\u00ed las ventanas emergentes para esta p\u00e1gina y volv\u00e9 a intentar.",null); }
        toast(copiado==="imagen"
          ?"Se abri\u00f3 Outlook. La imagen del comprobante est\u00e1 copiada: pegala en el cuerpo con Ctrl+V."
          :copiado
          ?"Se abri\u00f3 Outlook. No pude armar la imagen; qued\u00f3 copiado el comprobante con formato: pegalo con Ctrl+V."
          :"Se abri\u00f3 Outlook. No pude copiar el comprobante: guardalo en PDF y adjuntalo.");
      }},
      {texto:"Enviar autom\u00e1tico",accion:async()=>{
      err.style.display="none";
      const para=iP.value.trim();
      if(!para) return fallar("Falta el destinatario.",iP);
      toast("Enviando el comprobante\u2026");
      let rs,j;
      try{
        const h=await getSBHeaders();
        rs=await fetch(SUPABASE_URL+"/functions/v1/enviar-comprobante",{
          method:"POST",headers:h,body:JSON.stringify({
            para,copia:iC.value.trim(),asunto:iA.value.trim(),html:comprobanteHTML(r)})});
        j=await rs.json().catch(()=>({}));
      }catch(e){
        return fallar("No se pudo llegar al servicio de env\u00edo: "+e.message,null);
      }
      if(!rs.ok){
        if(j&&j.error==="sin_clave"){
          avisar("Falta configurar el env\u00edo",
            [j.mensaje,"Us\u00e1 Abrir en Outlook: arma el mail con tu cuenta y no necesita ninguna clave."]);
          return true;
        }
        return fallar((j&&j.mensaje)||("El env\u00edo fall\u00f3 ("+rs.status+")."),null);
      }
      try{localStorage.setItem(MAIL_GUARDADO,para)}catch(e){}
      toast("Comprobante enviado a "+para+".");
    }}]});
}
function dialogoComprobante(r){
  if(esperaFirma(r)){dialogoQR(r);return}
  const vista=el("div",{style:"border:1px solid var(--linea);border-radius:12px;"+
    "overflow:auto;max-height:52vh;background:#fff"});
  vista.innerHTML=comprobanteHTML(r);
  modal({titulo:"Comprobante de retiro",cuerpo:el("div",{},
      el("p",{class:"hint",style:"margin:0 0 10px"},
        "Guardalo en PDF para archivarlo o adjuntarlo, o mandalo por mail desde ac\u00e1."),
      vista),
    acciones:[{texto:"Cerrar"},
      {texto:"Enviar por mail",accion:()=>{setTimeout(()=>dialogoMail(r),140)}},
      {texto:"Imprimir o guardar en PDF",clase:"",accion:()=>{setTimeout(()=>imprimirComprobante(r),160)}}]});
}

function vistaRetiros(){
  const c=el("div",{}); const p=el("div",{class:"panel"});
  p.append(el("h2",{},"Salidas de caja"));
  p.append(el("p",{class:"hint"},"El efectivo sale de la caja con el retiro: el tesorero se lleva la plata de un período y ese período queda cerrado. El depósito bancario es la boleta que rinde ese retiro, así que no vuelve a bajar el saldo; un mismo período puede rendirse con varias boletas que entre todas suman lo retirado. Tarjetas, billetera y otros valores no se tocan porque nunca entraron a la caja física."));
  p.append(el("div",{class:"row",style:"gap:8px"},
    el("button",{class:"btn",type:"button",onclick:dialogoRetiro,
      disabled:diasPendientes().length?null:""},"Registrar retiro"),
    el("button",{class:"btn ghost",type:"button",onclick:dialogoDeposito,disabled:hayQueRendir()?null:""},"Registrar depósito")));

  const rets=retirosOrd().filter(retiroVivo);
  const deps=retirosOrd().filter(esDeposito);
  if(!rets.length&&!deps.length){
    p.append(el("div",{class:"vacio"},el("b",{},"Todavía no hay salidas"),
      "Cuando el tesorero se lleve la plata o la deposites en el banco, anotalo acá."));
    c.append(p);return c;
  }
  const rotulo=t=>el("div",{class:"f",style:"margin:22px 0 8px"},t);
  const borrar=r=>async()=>{
    const dep=esDeposito(r);
    if(!await confirmar(dep?"Eliminar depósito":"Eliminar retiro",
      `${dep?"Depósito":"Retiro"} del ${fechaCorta(r.fecha)} por ${plata(r.monto)}. Al eliminarlo, ese efectivo vuelve al saldo de caja.`,
      {ok:"Eliminar",peligro:true}))return;
    db.retiros=db.retiros.filter(x=>x.id!==r.id);delete db.comprobantes["retiro|"+r.id];
    guardar();toast(dep?"Depósito eliminado.":"Retiro eliminado.");render();
  };

  if(rets.length){
    p.append(rotulo("Retiros de efectivo"));
    const tab=el("table",{class:"data"});
    tab.append(el("thead",{},el("tr",{},el("th",{},"Fecha"),el("th",{},"Período"),el("th",{},"Firma / Tesorero"),el("th",{class:"num"},"Monto"),
      el("th",{class:"num"},"Días"),el("th",{class:"num"},"Efectivo del período"),el("th",{class:"num"},"Diferencia"),
      el("th",{class:"num"},"Depositado"),el("th",{},"Detalle"),el("th",{},"Comprobante"),el("th",{},""))));
    const tb=el("tbody",{});
    for(let i=rets.length-1;i>=0;i--){
      const r=rets[i], pe=periodoDe(r);
      const gp=db.grupos.filter(g=>g.fecha>=pe.desde&&g.fecha<=pe.hasta);
      const tp=totales(gp);
      const dif=tp.efectivo-r.monto;
      const bol=boletasPeriodo(pe), ren=bol.reduce((a,d)=>a+d.monto,0), falta=r.monto-ren;
      const cerrado=Math.abs(falta)<.005;
      tb.append(el("tr",{},el("td",{},fechaCorta(r.fecha)),
        el("td",{style:"font-family:var(--mono);font-size:12px",
          title:r.desde&&r.hasta?null:"Período deducido del retiro anterior: esta fila es vieja y no lo tiene guardado"},
          perTexto(pe)+(r.desde&&r.hasta?"":" *")),
        el("td",{style:"white-space:normal;min-width:150px"},
          esperaFirma(r)
            ? el("span",{class:"badge rev",title:"Todavía no firmó el mensajero: este monto no bajó del saldo"},"espera firma")
            : el("span",{class:"cajero-tag",
                title:r.firmado_at?("Firmó "+(r.firmado_por_nombre||r.responsable||"")+" el "+
                  new Date(r.firmado_at).toLocaleString("es-AR")+
                  (r.firma_modo==="CARGA"?" · carga administrativa":
                   r.firma_modo==="EXCEPCIONAL"?" · retiro excepcional":
                   r.firma_modo==="ASISTIDA"?" · firma asistida":" · QR + PIN")):null},
                (r.retira_nombre||r.responsable||"—")+(r.firma_modo==="CARGA"?" *":r.firma_modo==="EXCEPCIONAL"?" **":"")),
          r.tesorero?el("div",{class:"hint",style:"margin-top:3px"},"→ "+r.tesorero):null),
        el("td",{class:"num",style:"font-weight:700"+(esperaFirma(r)?";color:var(--aviso)":"")},plata(r.monto)),
        el("td",{class:"num"},String(new Set(gp.map(g=>g.fecha)).size)),
        el("td",{class:"num chip-ef"},plata(tp.efectivo)),
        el("td",{class:"num"+(Math.abs(dif)>0.5?" neg":"")},Math.abs(dif)<0.5?"—":plata(dif)),
        /* mismo criterio que el diálogo: retiro − depositado. Positivo es
           faltante (rojo), negativo es sobrante (ámbar). */
        el("td",{class:"num"+(ren&&!cerrado&&falta>0?" neg":""),
          style:ren&&falta<-.005?"color:var(--aviso);font-weight:700":null,
          title:(bol.length?bol.length+" boleta(s) de depósito en este período":"Todavía sin boletas de depósito")+
            (ren&&!cerrado?"  ·  "+(falta>0?"faltante "+plata(falta):"sobrante "+plata(-falta)):"")},
          !ren?"—":(cerrado?plata(ren):plata(ren)+" / "+plata(r.monto))),
        el("td",{},r.detalle||"—"),
        celdaComps("retiro|"+r.id),
        el("td",{},el("div",{class:"acciones"},
          esperaFirma(r)
            ? el("button",{class:"btn small",type:"button",onclick:()=>dialogoQR(r)},"Ver QR")
            : el("button",{class:"btn ghost small",type:"button",
                onclick:()=>dialogoComprobante(r)},"Comprobante"),
          el("button",{class:"btn ghost small",type:"button",onclick:borrar(r)},"Eliminar")))));
    }
    tab.append(tb); p.append(el("div",{class:"tabla-scroll"},tab));
  }

  if(deps.length){
    p.append(rotulo("Depósitos bancarios"));
    const tab=el("table",{class:"data"});
    tab.append(el("thead",{},el("tr",{},el("th",{},"Fecha"),el("th",{},"Período depositado"),el("th",{},"Depositó"),el("th",{class:"num"},"Monto"),
      el("th",{},"Banco"),el("th",{},"N° de boleta"),el("th",{},"Detalle"),el("th",{},"Comprobante"),el("th",{},""))));
    const tb=el("tbody",{});
    for(let i=deps.length-1;i>=0;i--){
      const r=deps[i];
      tb.append(el("tr",{},el("td",{},fechaCorta(r.fecha)),
        el("td",{style:"font-family:var(--mono);font-size:12px"},perTexto(r)),
        el("td",{},el("span",{class:"cajero-tag"},r.responsable)),
        el("td",{class:"num",style:"font-weight:700"},plata(r.monto)),
        el("td",{},r.banco||"—"),
        el("td",{style:"font-family:var(--mono)"},r.referencia||"—"),
        el("td",{},r.detalle||"—"),
        celdaComps("retiro|"+r.id),
        el("td",{},el("button",{class:"btn ghost small",type:"button",onclick:borrar(r)},"Eliminar"))));
    }
    tab.append(tb); p.append(el("div",{class:"tabla-scroll"},tab));
    const tot=deps.reduce((a,d)=>a+d.monto,0);
    p.append(el("p",{class:"hint",style:"margin-top:10px"},`${deps.length} depósito${deps.length===1?"":"s"} por ${plata(tot)} en total.`));
  }
  c.append(p); return c;
}

/* Retiro y depósito comparten formulario. Difieren en quién figura, si piden
   banco + N° de boleta, y en qué campos son obligatorios. El retiro saca la
   plata de la caja y cierra el período; el depósito es la boleta que rinde un
   retiro ya hecho, así que no vuelve a bajar el saldo. */
const SALIDA={
  retiro:{
    titulo:"Registrar retiro", boton:"Registrar retiro",
    quien:"Tesorero", gente:()=>db.responsables,
    sinSaldo:"No hay efectivo para retirar.",
    detallePh:"Entrega de plata", pideBanco:false, compObligatorio:false,
    rotuloPer:"Período que se retira",
    hintPer:"Los días de caja que cubre esta plata. Se cierra con el retiro: el próximo empieza al día siguiente.",
    comp:"Comprobante del retiro",
    compHint:"Recibo firmado, foto del sobre o comprobante de transferencia. PNG, JPG, WEBP o PDF, hasta 400 KB.",
    todo:"Retira todo. El saldo queda en cero.",
    exceso:["Estás retirando %M% más de lo que hay registrado en caja.",
            "Puede ser un error de carga, o efectivo que todavía no importaste."],
    ok:m=>`Retiro de ${plata(m)} registrado`},
  deposito:{
    titulo:"Registrar depósito bancario", boton:"Registrar depósito",
    quien:"Depositó", gente:()=>db.depositantes,
    detallePh:"Opcional: aclaración interna", pideBanco:true, compObligatorio:true,
    rotuloPer:"Período que se deposita",
    hintPer:"El retiro que estás depositando con esta boleta. Un mismo período puede tener varias boletas que entre todas suman el monto retirado.",
    comp:"Comprobante del depósito",
    compHint:"Boleta de depósito, ticket del cajero automático o captura del homebanking. PNG, JPG, WEBP o PDF, hasta 400 KB.",
    ok:m=>`Depósito de ${plata(m)} registrado`}
};
const dialogoRetiro=()=>dialogoSalida("retiro");
const dialogoDeposito=()=>dialogoSalida("deposito");
/* hay algo para depositar cuando existe al menos un retiro */
const hayQueRendir=()=>db.retiros.some(retiroFirmado);

function dialogoSalida(tipo){
  const S=SALIDA[tipo];
  const dep=tipo==="deposito";
  const saldo=saldoEfectivo();
  const pend=dep?[]:diasPendientes();
  if(!dep&&!pend.length){toast(saldo>0
    ?"Todos los d\u00edas cargados ya salieron en un retiro. Import\u00e1 los listados de los d\u00edas nuevos."
    :S.sinSaldo);return}
  /* los retiros son los períodos que una boleta puede depositar, del más nuevo al más viejo */
  const rets=retirosOrd().filter(retiroFirmado).reverse();
  if(dep&&!rets.length){toast("Primero registrá el retiro que vas a depositar con esta boleta.");return}
  const req=S.pideBanco?" *":"";
  const iF=el("input",{type:"date",value:hoyISO(),max:hoyISO()});
  const sR=el("select",{},...S.gente().map(r=>el("option",{value:r},r)));
  // los centavos importan: con Math.round() el remanente daba -$0,50
  const iM=el("input",{class:"money",type:"text",
    value:dep?"":montoTexto(pend.reduce((a,d)=>a+d.monto,0)),
    style:"width:170px;font-size:16px"});
  const iD=el("input",{type:"text",placeholder:S.detallePh,style:"width:100%"});
  const sB=S.pideBanco?el("select",{},el("option",{value:""},"Elegí el banco"),
    ...BANCOS.map(b=>el("option",{value:b},b))):null;
  const iB=S.pideBanco?el("input",{type:"text",placeholder:"Ej.: 0012345",
    style:"width:100%;font-family:var(--mono)"}):null;
  const av=el("div",{style:"font-size:12.5px;margin-top:10px"});
  const err=el("p",{class:"err-campo",style:"display:none"});
  const cab=el("div",{style:"font-family:var(--mono);font-size:13px;margin-bottom:14px;color:var(--ink-2)"});

  /* --- período ------------------------------------------------
     En el retiro se elige a mano (viene prellenado con el período abierto).
     En la boleta se elige el retiro que rinde y las fechas salen de ahí; la
     opción "Otro período" las desbloquea para casos sueltos. */
  const iDe=el("input",{type:"date"}), iHa=el("input",{type:"date"});
  const filaFechas=el("div",{class:"row",style:"margin-top:9px"},
    el("label",{class:"f",style:"flex:0 1 200px"},"Desde"+req,iDe),
    el("label",{class:"f",style:"flex:0 1 200px"},"Hasta"+req,iHa));
  /* Un retiro ya depositado no se vuelve a ofrecer arriba: la boleta que
     lo rinde ya se cargó. Queda abajo, en "Ya depositados" y sin preseleccionar,
     porque corregir un período cerrado por "Otro período…" obliga a tipear
     el par (desde,hasta) exacto o la boleta nueva queda huérfana. Si se borra
     la boleta, el retiro vuelve solo al grupo de arriba. */
  const faltaDe=r=>r.monto-rendidoDe(r);
  /* El color dice el estado de un vistazo, y son TRES, no dos: verde solo el
     que cerró clavado; rojo el faltante; ámbar el sobrante, que
     está cerrado pero descuadrado y no merece luz verde. */
  const optRet=(r,i)=>{
    const falta=faltaDe(r), ok=Math.abs(falta)<.005;
    return el("option",{value:String(i),
      style:"font-weight:700;color:var(--"+(ok?"efectivo":falta<0?"aviso":"alerta")+")"},
      perTexto(periodoDe(r))+"  ·  retiro de "+plata(r.monto)+
      (ok?"  ·  sin diferencia"
       :falta<0?"  ·  sobrante "+plata(-falta)
       :"  ·  faltante "+plata(falta)));
  };
  const opsPend=[],opsRend=[];
  rets.forEach((r,i)=>(faltaDe(r)>.005?opsPend:opsRend).push(optRet(r,i)));
  const sPer=dep?el("select",{style:"width:100%"},
    ...opsPend,
    ...(opsRend.length?[el("optgroup",{label:"Ya depositados"},...opsRend)]:[]),
    el("option",{value:"otro"},"Otro período…")):null;
  // sin períodos abiertos no se preselecciona uno cerrado: arranca en "Otro período…"
  if(sPer&&!opsPend.length) sPer.value="otro";

  const retSel=()=>(dep&&sPer.value!=="otro")?rets[+sPer.value]:null;
  function aplicarPer(){
    const r=retSel();
    if(r){
      const p=periodoDe(r);
      iDe.value=p.desde; iHa.value=p.hasta;
      // el rango ya se lee en el select: mostrarlo dos veces sobra
      filaFechas.style.display="none";
      iM.value=montoTexto(Math.max(0,r.monto-rendidoDe(r)));
    }else{
      filaFechas.style.display="";
    }
    ck();
  }

  /* --- dias que se retiran -------------------------------------
     Se tildan los dias con efectivo que todavia no salio de la caja. El monto
     sigue a lo tildado mientras no lo escriban a mano, y desde/hasta se
     derivan del primero y el ultimo dia elegido: asi la boleta de deposito
     sigue encontrando su retiro por el par (desde,hasta) de siempre. */
  const sel=new Set(pend.map(d=>d.fecha));
  let haTocadoMonto=false;
  const totSel=()=>pend.filter(d=>sel.has(d.fecha)).reduce((a,d)=>a+d.monto,0);
  const tbDias=el("tbody",{});
  const resumen=el("div",{style:"display:flex;justify-content:space-between;align-items:baseline;"+
    "gap:12px;margin-top:9px;font-family:var(--mono);font-size:13px;color:var(--ink-2)"});
  const alternar=f=>{sel.has(f)?sel.delete(f):sel.add(f);pintarDias();sincroMonto();ck()};
  function pintarDias(){
    tbDias.replaceChildren();
    for(const d of pend){
      const on=sel.has(d.fecha);
      tbDias.append(el("tr",{class:on?"fila-verif":"",style:"cursor:pointer",
        onclick:()=>alternar(d.fecha)},
        el("td",{},fechaLarga(d.fecha)),
        el("td",{class:"num chip-ef"},plata(d.monto)),
        el("td",{style:"text-align:right;width:1%"},
          el("button",{class:"tick chico"+(on?" on":""),type:"button","aria-pressed":on?"true":"false",
            title:on?"Sacar este d\u00eda del retiro":"Incluir este d\u00eda en el retiro",
            onclick:e=>{e.stopPropagation();alternar(d.fecha)}},"\u2713"))));
    }
    resumen.replaceChildren(
      el("span",{},sel.size+" de "+pend.length+(pend.length===1?" d\u00eda":" d\u00edas")),
      el("span",{},"Suman ",el("b",{style:"color:var(--efectivo)"},plata(totSel()))));
  }
  function sincroMonto(){
    const ds=[...sel].sort();
    iDe.value=ds[0]||""; iHa.value=ds[ds.length-1]||"";
    if(!haTocadoMonto) iM.value=montoTexto(totSel());
  }
  const tabDias=el("table",{class:"data"});
  tabDias.append(el("thead",{},el("tr",{},el("th",{},"D\u00eda"),
    el("th",{class:"num"},"Efectivo"),el("th",{},""))));
  tabDias.append(tbDias);
  const bloqueDias=el("div",{style:"margin-top:14px;border-top:1px dashed var(--linea);padding-top:12px"},
    el("div",{style:"display:flex;justify-content:space-between;align-items:center;gap:10px"},
      el("div",{class:"f"},"D\u00edas que se retiran *"),
      el("div",{style:"display:flex;gap:7px"},
        el("button",{class:"btn ghost small",type:"button",
          onclick:()=>{pend.forEach(d=>sel.add(d.fecha));pintarDias();sincroMonto();ck()}},"Todos"),
        el("button",{class:"btn ghost small",type:"button",
          onclick:()=>{sel.clear();pintarDias();sincroMonto();ck()}},"Ninguno"))),
    el("p",{class:"hint",style:"margin:6px 0 8px"},
      "Cada d\u00eda suma el efectivo de todos sus cajeros. Los d\u00edas que ya salieron en un retiro anterior no aparecen ac\u00e1."),
    el("div",{class:"tabla-scroll",style:"max-height:260px"},tabDias),
    resumen);

  /* --- comprobante: click o arrastrar --- */
  const buf=[]; const chips=el("div",{style:"margin-bottom:9px"});
  const fi=el("input",{type:"file",multiple:"multiple",
    accept:"image/png,image/jpeg,image/webp,application/pdf",style:"display:none",
    onchange:e=>{[...e.target.files].forEach(f=>procesarArchivo(f,c=>{buf.push(c);pintarBuf()}));e.target.value=""}});
  const zona=el("div",{class:"drop mini",onclick:()=>fi.click()},
    el("b",{},"Arrastrá el comprobante acá"),
    el("small",{},"o hacé clic para buscarlo"));
  // sin stopPropagation el archivo lo agarra el drop global y se va a "Importar listados"
  ["dragenter","dragover"].forEach(ev=>zona.addEventListener(ev,e=>{
    e.preventDefault();e.stopPropagation();zona.classList.add("hot")}));
  ["dragleave","dragend"].forEach(ev=>zona.addEventListener(ev,e=>{
    e.preventDefault();e.stopPropagation();zona.classList.remove("hot")}));
  zona.addEventListener("drop",e=>{
    e.preventDefault();e.stopPropagation();zona.classList.remove("hot");
    const fs=e.dataTransfer&&e.dataTransfer.files;
    if(fs&&fs.length)[...fs].forEach(f=>procesarArchivo(f,c=>{buf.push(c);pintarBuf()}));
  });
  const pintarBuf=()=>{
    chips.replaceChildren();
    buf.forEach((c,i)=>chips.append(el("span",{class:"comp-chip"},
      el("a",{title:Math.round(c.bytes/1024)+" KB",onclick:e=>{e.stopPropagation();abrirComp(c)}},c.nombre),
      el("button",{type:"button",title:"Quitar",onclick:e=>{e.stopPropagation();buf.splice(i,1);pintarBuf()}},"×"))));
    zona.classList.remove("falta");
    if(buf.length) err.style.display="none";
    zona.firstChild.textContent=buf.length?"Arrastrá otro comprobante":"Arrastrá el comprobante acá";
  };
  pintarBuf();

  /* aviso vivo: en el retiro habla del saldo, en la boleta del faltante/sobrante */
  function ck(){
    const m=parseMonto(iM.value);
    if(!dep){
      const t=totSel(), pendTot=efectivoPendiente(), queda=pendTot-m;
      if(!sel.size){av.textContent="Tild\u00e1 al menos un d\u00eda.";av.style.color="var(--alerta)"}
      else if(Math.abs(m-t)>=.005){
        av.textContent=`Los d\u00edas tildados suman ${plata(t)} y est\u00e1s registrando ${plata(m)}.`;
        av.style.color="var(--aviso)"}
      else if(queda<.005){av.textContent=S.todo;av.style.color="var(--efectivo)"}
      else{av.textContent=`Quedan ${plata(queda)} en caja, en ${pend.length-sel.size} d\u00eda(s) sin retirar.`;
        av.style.color="var(--aviso)"}
      cab.replaceChildren("Efectivo en caja: ",el("b",{style:"color:var(--efectivo)"},plata(saldo)),
        Math.abs(saldo-pendTot)>.5?"  \u00b7  por d\u00edas sin retirar "+plata(pendTot):"");
      return;
    }
    const r=retSel();
    if(!r){
      cab.replaceChildren("Boleta suelta, sin retiro asociado.");
      av.textContent=m>0?`Se registra una boleta de ${plata(m)}.`:"";
      av.style.color="var(--ink-2)";
      return;
    }
    const ya=rendidoDe(r), falta=r.monto-ya-m;
    cab.replaceChildren("Retiro del período: ",el("b",{},plata(r.monto)),
      ya?"  ·  ya depositado "+plata(ya):"  ·  sin depositar todavía");
    /* mismo criterio que el select: retiro − depositado. Positivo = faltante,
       negativo = sobrante. El aviso usa las mismas dos palabras a propósito. */
    if(Math.abs(falta)<.005){av.textContent="Con esta boleta el período queda sin diferencia.";av.style.color="var(--efectivo)"}
    else if(falta>0){av.textContent=`Con esta boleta queda un faltante de ${plata(falta)} en ese período.`;av.style.color="var(--alerta)"}
    else{av.textContent=`Con esta boleta queda un sobrante de ${plata(-falta)}: depositás más de lo que se retiró.`;av.style.color="var(--aviso)"}
  }
  iM.addEventListener("input",()=>{haTocadoMonto=true;ck()});
  if(sPer) sPer.addEventListener("change",aplicarPer);
  [iF,sR,iM,sB,iB,iDe,iHa].forEach(c=>c&&c.addEventListener("input",()=>{err.style.display="none"}));
  if(dep) aplicarPer();
  else{ pintarDias(); sincroMonto(); ck() }

  const fallar=(txt,foco)=>{err.textContent=txt;err.style.display="";if(foco)foco.focus();return false};

  const bloquePer=el("div",{style:"margin-top:14px;border-top:1px dashed var(--linea);padding-top:12px"},
    el("div",{class:"f",style:"margin-bottom:5px"},S.rotuloPer+req),
    el("p",{class:"hint",style:"margin:0 0 8px"},S.hintPer),
    sPer,filaFechas);

  modal({titulo:S.titulo,cuerpo:el("div",{},
    cab,
    dep?bloquePer:null,
    el("div",{class:"row",style:dep?"margin-top:14px":null},
      el("label",{class:"f"},"Fecha"+req,iF),
      dep?el("label",{class:"f"},S.quien+req,sR)
         :el("div",{class:"f",style:"align-self:flex-end;padding-bottom:11px;color:var(--ink-2);font-weight:500"},
             "Firma el mensajero con su PIN"),
      el("label",{class:"f"},"Monto"+req,pesos(iM))),
    S.pideBanco?el("div",{class:"row",style:"margin-top:12px"},
      el("label",{class:"f",style:"flex:1 1 190px"},"Banco *",sB),
      el("label",{class:"f",style:"flex:1 1 190px"},"N° de boleta *",iB)):null,
    dep?null:bloqueDias,
    el("label",{class:"f",style:"margin-top:12px"},"Detalle"+(S.pideBanco?" (opcional)":""),iD),
    av,
    el("div",{style:"margin-top:16px;border-top:1px dashed var(--linea);padding-top:12px"},
      el("div",{class:"f",style:"margin-bottom:7px"},S.comp+(S.compObligatorio?" *":"")),
      el("p",{class:"hint",style:"margin:0 0 9px"},S.compHint),
      chips,zona,fi),
    S.pideBanco?el("p",{class:"hint",style:"margin:12px 0 0"},"Los campos con * son obligatorios."):null,
    err),
    acciones:[{texto:"Cancelar"},{texto:S.boton,clase:"",accion:async()=>{
      err.style.display="none"; zona.classList.remove("falta");
      const m=parseMonto(iM.value);
      if(!iF.value) return fallar("Falta la fecha.",iF);
      if(dep&&!sR.value) return fallar("Falta indicar quién.",sR);
      if(m<=0)      return fallar("El monto tiene que ser mayor a cero.",iM);
      if(S.pideBanco){
        if(!sB.value)         return fallar("Elegí el banco.",sB);
        if(!iB.value.trim())  return fallar("Falta el N° de boleta.",iB);
      }
      if(!dep&&!sel.size) return fallar("Tildá al menos un día para retirar.",null);
      if(!iDe.value) return fallar("Falta la fecha de inicio del período.",iDe);
      if(!iHa.value) return fallar("Falta la fecha de cierre del período.",iHa);
      if(iDe.value>iHa.value) return fallar("El período arranca después de terminar.",iDe);
      if(!dep&&iHa.value>iF.value)
        return fallar("Estás retirando días posteriores a la fecha del retiro.",iF);
      if(S.compObligatorio&&!buf.length){
        zona.classList.add("falta");
        return fallar("Adjuntá el comprobante del depósito.",null);
      }
      if(!dep&&m>saldo+.5&&!await confirmar("El monto supera el saldo",
        S.exceso.map(t=>t.replace("%M%",plata(m-saldo))),
        {ok:"Registrar igual"}))return false;
      if(dep){
        const r=retSel();
        const ya=r?rendidoDe(r):boletasPeriodo({desde:iDe.value,hasta:iHa.value}).reduce((a,d)=>a+d.monto,0);
        const tope=r?r.monto:0;
        if(r&&ya+m>tope+.5&&!await confirmar("La boleta supera el retiro",
          [`Entre las boletas de ese período vas a depositar ${plata(ya+m)} contra un retiro de ${plata(tope)}, o sea un sobrante de ${plata(ya+m-tope)}.`,
           "Puede ser un error de carga, o plata de otro período que entró en la misma boleta."],
          {ok:"Registrar igual"}))return false;
      }
      const rid=uid();
      /* El retiro nace PENDIENTE_FIRMA: no baja el saldo hasta que el
         mensajero firma con su PIN. El token del QR se genera acá. */
      db.retiros.push({id:rid,fecha:iF.value,responsable:dep?sR.value:"",monto:m,
        detalle:iD.value.trim(),tipo:tipo,
        banco:sB?sB.value:"",referencia:iB?iB.value.trim():"",
        desde:iDe.value,hasta:iHa.value,dias:dep?[]:[...sel].sort(),
        estado:dep?"FIRMADO":"PENDIENTE_FIRMA",tesorero:"",
        qr_token:dep?"":uid(),qr_expires_at:dep?"":new Date(Date.now()+VENCE_QR).toISOString(),
        creado:Date.now()});
      guardar();
      let subidos=0;
      if(buf.length){
        toast(buf.length===1?"Subiendo el comprobante…":"Subiendo "+buf.length+" comprobantes…");
        for(const c of buf) if(await subirComp("retiro|"+rid,c)) subidos++;
      }
      render();
      if(dep){toast(S.ok(m)+(buf.length?` con ${subidos} de ${buf.length} comprobante(s)`:"")+".");return}
      toast("Retiro anotado. Falta la firma del mensajero.");
      setTimeout(()=>{
        const nr=db.retiros.find(x=>x.id===rid); if(nr) dialogoQR(nr);
      },220);
    }}]});
}
