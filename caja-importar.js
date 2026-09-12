/* ============================================================
   caja-importar.js — parte de caja.html
   ------------------------------------------------------------
   Importar listados y mirarlos. La lectura del Excel y su
   previsualización, la vista Días con su desglose, y la vista Reportes.

   Se carga DESPUÉS de caja-datos.js.
   El orden importa: los archivos se cortaron en orden de aparición
   y se cargan en ese mismo orden, así la evaluación es idéntica a
   la del archivo único que había antes.
   Separado de caja.html el 2026-09-12 (paso 3, rebanada 2).
   ============================================================ */
"use strict";

/* ============================================================
   VISTA: IMPORTAR
   ============================================================ */
function vistaImportar(){
  const c=el("div",{}); banners().forEach(b=>c.append(b));
  const p=el("div",{class:"panel"});
  p.append(el("h2",{},"Importar listados de caja"));
  p.append(el("p",{class:"hint"},"Arrastrá acá los archivos del sistema. Podés soltar varios a la vez. Formatos: .xls, .xlsx, .csv. El PDF no sirve para importar: usá siempre la exportación a Excel."));

  const inp=el("input",{type:"file",accept:".xls,.xlsx,.csv,.txt",multiple:"multiple",style:"display:none",onchange:e=>{leerArchivos([...e.target.files]);e.target.value=""}});
  const drop=el("div",{class:"drop",onclick:()=>inp.click()},
    el("b",{},"Soltá los archivos acá"),
    el("small",{},"o hacé clic para elegirlos · .xls · .xlsx · .csv"));
  ["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("hot")}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("hot")}));
  drop.addEventListener("drop",e=>{const f=[...(e.dataTransfer?.files||[])];if(f.length)leerArchivos(f)});
  p.append(drop,inp);

  p.append(el("p",{class:"hint",style:"margin:14px 0 0"},
    "Se leen las columnas Fecha, Cajero, Medio Cancelación y Monto. Los nombres de pacientes y los DNI no se guardan: sólo quedan los números de comprobante para poder auditar."));
  c.append(p);

  if(db.importaciones.length){
    const p2=el("div",{class:"panel"});
    p2.append(el("h2",{},"Importaciones hechas"));
    const t=el("table",{class:"data"});
    t.append(el("thead",{},el("tr",{},el("th",{},"Cuándo"),el("th",{},"Archivo"),el("th",{},"Días"),el("th",{class:"num"},"Filas"),el("th",{class:"num"},"Total"),el("th",{},""))));
    const tb=el("tbody",{});
    for(const i of db.importaciones.slice().reverse()){
      tb.append(el("tr",{},
        el("td",{},new Date(i.cuando).toLocaleString("es-AR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})),
        el("td",{style:"max-width:280px;overflow:hidden;text-overflow:ellipsis"},i.archivo),
        el("td",{},i.rango||"—"),
        el("td",{class:"num"},numero(i.filas)),
        el("td",{class:"num"},plata(i.total)),
        el("td",{},el("button",{class:"btn ghost small",type:"button",onclick:async()=>{
          const n=db.grupos.filter(g=>g.imp===i.id).length;
          if(!await confirmar("Deshacer importación",
            `Se eliminan ${n} grupos de movimientos cargados desde este archivo. Los comprobantes adjuntos no se tocan.`,
            {ok:"Deshacer",peligro:true}))return;
          db.grupos=db.grupos.filter(g=>g.imp!==i.id);
          db.importaciones=db.importaciones.filter(x=>x.id!==i.id);
          guardar();toast("Importación deshecha.");render();
        }},"Deshacer"))
      ));
    }
    t.append(tb); p2.append(el("div",{class:"tabla-scroll"},t)); c.append(p2);
  }
  return c;
}

/* --- lectura y normalización ------------------------------- */
function leerArchivos(files){
  const pendientes=[]; let leidos=0;
  for(const f of files){
    const fr=new FileReader();
    fr.onload=()=>{
      try{
        const wb=XLSX.read(new Uint8Array(fr.result),{type:"array",cellDates:false});
        const hoja=wb.Sheets[wb.SheetNames[0]];
        const filas=XLSX.utils.sheet_to_json(hoja,{header:1,raw:true,defval:""});
        pendientes.push({nombre:f.name,filas});
      }catch(e){ toast(`No se pudo leer ${f.name}: ${e.message}`); }
      if(++leidos===files.length) procesar(pendientes);
    };
    fr.onerror=()=>{ toast(`No se pudo abrir ${f.name}.`); if(++leidos===files.length) procesar(pendientes); };
    fr.readAsArrayBuffer(f);
  }
}
function procesar(archivos){
  if(!archivos.length){toast("Ningún archivo legible.");return}
  const grupos=new Map(); const rechazos=[]; let filasOK=0; const nombres=[];
  const medios=new Set();
  const otrasSuc=new Map();   // sucursal -> filas dejadas afuera (cajero ajeno)
  let sinColumnaSuc=false;
  /* Un cajero de otra sucursal que YA trabajó en esta caja es un reemplazo:
     probablemente vino a cubrir una licencia y no se pidió el cambio de caja
     en el sistema, así que su plata figura en la sucursal equivocada. No se
     descarta ni se importa sola: se muestra aparte y decide el usuario. */
  const conHistoria=new Set([...db.cajeros,...db.grupos.map(g=>g.cajero)]);
  const reGrupos=new Map(); let reFilas=0; const reSuc=new Set();

  for(const a of archivos){
    nombres.push(a.nombre);
    // encontrar la fila de cabecera
    let hi=-1, idx=null;
    for(let i=0;i<Math.min(a.filas.length,12);i++){
      const m=mapear(a.filas[i]);
      if(m.fecha>=0&&m.cajero>=0&&(m.monto>=0||m.total>=0)){hi=i;idx=m;break}
    }
    if(hi<0){ rechazos.push({archivo:a.nombre,linea:1,motivo:"no encontré las columnas Fecha / Cajero / Monto"}); continue; }
    if(idx.sucursal<0) sinColumnaSuc=true;

    for(let i=hi+1;i<a.filas.length;i++){
      const r=a.filas[i]; if(!r||!r.length)continue;
      const f=parseFecha(r[idx.fecha]);
      const cj=String(r[idx.cajero]||"").trim().toUpperCase();
      /* Otra sucursal: no es un rechazo, es plata de otra caja. Se cuenta aparte
         y se muestra en la previsualización para que nunca desaparezca en silencio. */
      let esReemplazo=false;
      if(idx.sucursal>=0){
        const suc=normSucursal(r[idx.sucursal]);
        if(suc&&!esDeLaSede(suc)){
          if(cj&&conHistoria.has(cj)){ esReemplazo=true; reSuc.add(suc); }
          else { otrasSuc.set(suc,(otrasSuc.get(suc)||0)+1); continue; }
        }
      }
      if(!f||!cj){ if(r.some(v=>String(v).trim())) rechazos.push({archivo:a.nombre,linea:i+1,motivo:!f?"fecha ilegible":"sin cajero"}); continue; }
      if(idx.anulada>=0&&String(r[idx.anulada]||"").trim()){ rechazos.push({archivo:a.nombre,linea:i+1,motivo:"comprobante anulado"}); continue; }
      const monto=parseMonto(idx.monto>=0?r[idx.monto]:r[idx.total]);
      const medio=normMedio(idx.medio>=0?r[idx.medio]:"");
      medios.add(medio);
      const nro=idx.numero>=0?String(r[idx.numero]||"").replace(/\.0$/,""):"";
      const k=[f,cj,medio].join("|");
      const mapa=esReemplazo?reGrupos:grupos;
      if(!mapa.has(k)) mapa.set(k,{fecha:f,cajero:cj,medio,categoria:categoriaDe(medio),monto:0,n:0,comps:[]});
      const g=mapa.get(k); g.monto+=monto; g.n++; if(g.comps.length<400)g.comps.push({n:nro||"",m:monto});
      if(esReemplazo) reFilas++; else filasOK++;
    }
  }
  const reemplazos={grupos:[...reGrupos.values()],filas:reFilas,sucursales:[...reSuc]};
  if(!grupos.size&&!reemplazos.filas){
    modal({titulo:"No se importó nada",cuerpo:el("div",{},
      el("p",{},"No pude leer ninguna fila válida."),
      rechazos.length?el("p",{class:"hint"},`Ejemplo: ${rechazos[0].archivo}, línea ${rechazos[0].linea} — ${rechazos[0].motivo}.`):null,
      el("p",{class:"hint"},"Verificá que el archivo sea la exportación a Excel del Listado de Caja, no el PDF.")
    ),acciones:[{texto:"Cerrar"}]});
    return;
  }
  previsualizar([...grupos.values()],rechazos,nombres,filasOK,[...medios],otrasSuc,sinColumnaSuc,reemplazos,false);
}

function previsualizar(nuevos,rechazos,nombres,filasOK,medios,otrasSuc,sinColumnaSuc,reemplazos,incluirRe){
  otrasSuc=otrasSuc||new Map();
  reemplazos=reemplazos||{grupos:[],filas:0,sucursales:[]};
  const nuevosOriginal=nuevos, filasOKOriginal=filasOK;
  const reTot=totales(reemplazos.grupos);
  const reCajeros=[...new Set(reemplazos.grupos.map(g=>g.cajero))];
  /* Si el usuario los incluye, los grupos del reemplazo se suman a los normales
     por la misma clave fecha|cajero|medio (puede haber días con la caja bien
     puesta en algunas filas y mal en otras). */
  if(incluirRe&&reemplazos.grupos.length){
    /* copias: el usuario puede destildar y hay que volver a los originales */
    const m=new Map(nuevos.map(g=>[g.fecha+"|"+g.cajero+"|"+g.medio,
                                   {...g,comps:(g.comps||[]).slice()}]));
    for(const g of reemplazos.grupos){
      const k=g.fecha+"|"+g.cajero+"|"+g.medio, y=m.get(k);
      if(y){ y.monto+=g.monto; y.n+=g.n; y.comps=(y.comps||[]).concat(g.comps||[]).slice(0,400); }
      else m.set(k,{...g});
    }
    nuevos=[...m.values()]; filasOK+=reemplazos.filas;
  }
  const dias=porDia(nuevos);
  const t=totales(nuevos);
  const cajerosNuevos=[...new Set(nuevos.map(g=>g.cajero))].filter(c=>!db.cajeros.includes(c));
  const yaExisten=dias.filter(d=>db.grupos.some(g=>g.fecha===d.fecha&&g.cajero===d.cajero));
  const mediosRaros=medios.filter(m=>categoriaDe(m)==="otros");
  const fechas=dias.map(d=>d.fecha).sort();
  const rango=fechas.length?(fechas[0]===fechas[fechas.length-1]?fechaCorta(fechas[0]):`${fechaCorta(fechas[0])} → ${fechaCorta(fechas[fechas.length-1])}`):"—";

  const tab=el("table",{class:"data"});
  tab.append(el("thead",{},el("tr",{},el("th",{},"Fecha"),el("th",{},"Cajero"),
    el("th",{class:"num"},"Efectivo"),el("th",{class:"num"},"Tarjetas"),el("th",{class:"num"},"Billetera"),
    el("th",{class:"num"},"Otros"),el("th",{class:"num"},"Total"))));
  const tb=el("tbody",{});
  for(const d of dias) tb.append(el("tr",{},
    el("td",{},fechaCorta(d.fecha)), el("td",{},el("span",{class:"cajero-tag"},d.cajero)),
    el("td",{class:"num chip-ef"},plata(d.efectivo)), el("td",{class:"num chip-ta"},plata(d.tarjeta)),
    el("td",{class:"num chip-bi"},plata(d.billetera)), el("td",{class:"num chip-ot"},d.otros?plata(d.otros):"—"),
    el("td",{class:"num",style:"font-weight:600"},plata(d.total))));
  tab.append(tb);

  const cuerpo=el("div",{},
    el("div",{class:"kpis",style:"margin-bottom:14px"},
      kpi("Comprobantes",numero(filasOK)),
      kpi("Efectivo",plata(t.efectivo),"var(--efectivo)"),
      kpi("Tarjetas",plata(t.tarjeta),"var(--tarjeta)"),
      kpi("Billetera",plata(t.billetera),"var(--billetera)"),
      kpi("Total valores",plata(t.total))),
    el("p",{class:"hint",style:"margin:0 0 12px"},`${nombres.length} archivo(s) · ${rango} · ${dias.length} combinación(es) día + cajero`),
    reemplazos.filas?el("div",{class:"banner rojo"},
      el("b",{},reemplazos.filas+" fila(s) de "+reemplazos.sucursales.join(" / ")+" son de "+
        reCajeros.join(", ")+", que ya trabajó en esta caja. "),
      "Puede ser un reemplazo al que no se le pidió el cambio de caja en el sistema: "+
      "en ese caso la plata estuvo acá aunque figure en la otra sucursal. "+
      plata(reTot.efectivo)+" de efectivo · "+plata(reTot.total)+" en total.",
      el("label",{class:"row",style:"gap:7px;margin-top:9px;align-items:center;cursor:pointer"},
        el("input",{type:"checkbox",checked:incluirRe?"checked":null,
          onchange:()=>previsualizar(nuevosOriginal,rechazos,nombres,filasOKOriginal,medios,
                                     otrasSuc,sinColumnaSuc,reemplazos,!incluirRe)}),
        el("b",{},"Incluir estas "+reemplazos.filas+" filas en la importación"))):null,
    otrasSuc.size?el("div",{class:"banner"},
      el("b",{},[...otrasSuc.values()].reduce((x,y)=>x+y,0)+" fila(s) de otras sucursales quedaron afuera: "),
      [...otrasSuc.entries()].sort((x,y)=>y[1]-x[1]).map(([s2,n2])=>s2+" ("+n2+")").join(" · ")):null,
    sinColumnaSuc?el("div",{class:"banner ambar"},el("b",{},"El archivo no trae columna Sucursal: "),
      "no pude filtrar por sede. Verificá que sea el listado del Hospital Italiano."):null,
    cajerosNuevos.length?el("div",{class:"banner ambar"},el("b",{},"Cajeros nuevos: "),cajerosNuevos.join(", ")):null,
    mediosRaros.length?el("div",{class:"banner ambar"},el("b",{},"Medios fuera de lo común: "),mediosRaros.join(", ")+". Van a la columna Otros valores y quedan para revisar."):null,
    yaExisten.length?el("div",{class:"banner rojo"},el("b",{},`${yaExisten.length} día(s) ya cargados`),"Si importás igual, esos días quedan duplicados. Elegí Reemplazar."):null,
    rechazos.length?el("div",{class:"banner ambar"},el("b",{},`${rechazos.length} fila(s) descartadas`),`ej. ${rechazos[0].archivo} línea ${rechazos[0].linea}: ${rechazos[0].motivo}`):null,
    el("div",{class:"tabla-scroll",style:"max-height:300px"},tab)
  );

  const commit=(reemplazar)=>{
    const impId=uid();
    if(reemplazar){
      const claves=new Set(dias.map(d=>d.fecha+"|"+d.cajero));
      db.grupos=db.grupos.filter(g=>!claves.has(g.fecha+"|"+g.cajero));
    }
    for(const c of cajerosNuevos) db.cajeros.push(c);
    for(const g of nuevos) db.grupos.push({id:uid(),imp:impId,...g});
    db.importaciones.push({id:impId,archivo:nombres.join(", "),cuando:Date.now(),filas:filasOK,total:t.total,rango});
    guardar(); toast(`${filasOK} comprobantes importados · ${plata(t.total)}`);
    vista="dias"; render();
  };
  const acciones=[{texto:"Cancelar"}];
  if(yaExisten.length) acciones.push({texto:"Importar igual (duplica)",accion:()=>commit(false)});
  acciones.push({texto:yaExisten.length?"Reemplazar esos días":`Importar ${filasOK} comprobantes`,clase:"",accion:()=>commit(!!yaExisten.length)});
  modal({titulo:"Previsualizar importación",cuerpo,acciones});
}

/* ============================================================
   VISTA: DÍAS
   ============================================================ */
/* Un comprobante viejo es solo el n\u00famero (string); uno nuevo trae {n,m}.
   compsNorm unifica los dos. sm=true significa "tiene importe propio". */
let filtro={desde:"",hasta:"",cajero:""};
let abiertos=new Set();
function vistaDias(sinTotalForzado){
  const c=el("div",{}); banners().forEach(b=>c.append(b));
  const p=el("div",{class:"panel"});
  p.append(el("h2",{},"Días cargados"));

  const iD=el("input",{type:"date",value:filtro.desde}),iH=el("input",{type:"date",value:filtro.hasta});
  const sC=el("select",{},el("option",{value:""},"Todos"),...db.cajeros.map(x=>el("option",{value:x,selected:filtro.cajero===x?"selected":null},x)));
  const ap=()=>{filtro={desde:iD.value,hasta:iH.value,cajero:sC.value};render()};
  [iD,iH,sC].forEach(i=>i.addEventListener("change",ap));
  p.append(el("div",{class:"row",style:"margin-bottom:14px"},
    el("label",{class:"f"},"Desde",iD),el("label",{class:"f"},"Hasta",iH),el("label",{class:"f"},"Cajero",sC),
    el("button",{class:"btn ghost small",type:"button",onclick:()=>{filtro={desde:"",hasta:"",cajero:""};render()}},"Limpiar"),
    el("button",{class:"btn ghost small",type:"button",onclick:()=>exportarCSV(filtrados())},"Exportar a Excel")));

  const filtrados=()=>db.grupos.filter(g=>(!filtro.desde||g.fecha>=filtro.desde)&&(!filtro.hasta||g.fecha<=filtro.hasta)&&(!filtro.cajero||g.cajero===filtro.cajero));
  const gr=filtrados(); const dias=porDia(gr);
  if(!dias.length){
    p.append(el("div",{class:"vacio"},el("b",{},"No hay nada en ese rango"),"Importá un listado o revisá los filtros."));
    c.append(p); return c;
  }
  const rets=retirosOrd().filter(r=>(!filtro.desde||r.fecha>=filtro.desde)&&(!filtro.hasta||r.fecha<=filtro.hasta)&&!filtro.cajero);
  // el día más reciente va arriba; dentro del día, los cajeros y al final el retiro/depósito
  const eventos=[...dias.map(d=>({t:"d",x:d})),...rets.map(r=>({t:"r",x:r}))]
    .sort((a,b)=>a.x.fecha===b.x.fecha
      ? (a.t===b.t?0:(a.t==="r"?1:-1))
      : b.x.fecha.localeCompare(a.x.fecha));

  /* "Otros valores" casi siempre está vacío: si nadie lo usó en el rango, la
     columna no se dibuja y la tabla entra sin barra horizontal. */
  const hayOtros=dias.some(d=>d.otros>0);
  /* En pantallas angostas también se cae la columna Total: es la suma de las
     otras tres y es lo primero que sobra cuando no entra sin barra. */
  const hayTotal=!sinTotalForzado;
  const NC=7+(hayOtros?1:0)+(hayTotal?1:0);
  const tab=el("table",{class:"data compacta"});
  tab.append(el("thead",{},el("tr",{},el("th",{},"Fecha"),el("th",{},"Cajero"),
    el("th",{class:"num"},"Efectivo"),el("th",{class:"num"},"Tarjetas"),el("th",{class:"num"},"Billetera"),
    hayOtros?el("th",{class:"num"},"Otros"):null,
    hayTotal?el("th",{class:"num"},"Total"):null,
    el("th",{class:"num"},"Comp."),el("th",{},""))));
  const tb=el("tbody",{});
  const yaRet=diasRetirados();   // una sola vez: se consulta por cada día
  let fSep=null;
  for(const ev of eventos){
    if(ev.x.fecha!==fSep){
      fSep=ev.x.fecha;
      const dd=dias.filter(x=>x.fecha===fSep);
      const efe=dd.reduce((a,x)=>a+x.efectivo,0);
      const salio=yaRet.has(fSep);
      const ret=rets.filter(x=>x.fecha===fSep&&!esDeposito(x)).reduce((a,x)=>a+x.monto,0);
      const dep=rets.filter(x=>x.fecha===fSep&&esDeposito(x)).reduce((a,x)=>a+x.monto,0);
      const sub=[dd.length?dd.length+(dd.length===1?" cajero":" cajeros"):null,
                 salio?"ya retirado":null,
                 ret?"Retiros "+plata(ret):null,
                 dep?"Depósitos "+plata(dep):null].filter(Boolean).join("  ·  ");
      tb.append(el("tr",{class:"dia-sep"},
        el("td",{colspan:"2"},
          el("div",{class:"dsep-f",title:fechaLarga(fSep)},fechaSep(fSep))),
        el("td",{class:"num",title:dd.length?(salio?"Efectivo del día · ya salió en un retiro"
              :"Efectivo del día · todavía está en caja"):null},
          dd.length?el("span",{class:"dsep-tot"},el("i",{},"Total"),plata(efe)):""),
        // la bajada va en el hueco del medio: en la primera celda arrastraba
        // el ancho de las columnas Fecha y Cajero
        el("td",{colspan:String(NC-4)},sub?el("div",{class:"dsep-sub"},sub):null),
        el("td",{},dd.length?el("div",{class:"acciones"},tildeDia(dd)):null)));
    }
    if(ev.t==="r"){
      const r=ev.x;
      const dp=esDeposito(r);
      const rot=(dp?"BOLETA · ":"RETIRO · ")+r.responsable+(dp&&clavePer(r)?"  ("+perTexto(r)+")":"");
      tb.append(el("tr",{class:"fila-retiro"},el("td",{title:fechaCorta(r.fecha)},fechaDM(r.fecha)),
        el("td",{title:rot},rot),
        // la boleta no descuenta: la plata ya salió con el retiro del período
        el("td",{class:"num",title:dp?"Rinde el retiro de ese período; no vuelve a bajar el saldo":null},
          (dp?"":"− ")+plata(r.monto)),
        ...Array.from({length:NC-4},()=>el("td",{class:"num"},"—")),
        el("td",{},"")));
      continue;
    }
    const d=ev.x, k=d.fecha+"|"+d.cajero, mot=anomaliasDia(d), ver=estaRevisado(d);
    tb.append(el("tr",{class:ver?"fila-verif":""},
      el("td",{title:fechaCorta(d.fecha)},fechaDM(d.fecha)),
      el("td",{},el("span",{class:"cajero-tag"},d.cajero)," ",
        (!ver&&mot.length)?el("span",{class:"badge rev",title:mot.join(" \u00b7 ")},"revisar"):null),
      el("td",{class:"num chip-ef"+(d.efectivo<0?" neg":"")},plata(d.efectivo)),
      el("td",{class:"num chip-ta"},d.tarjeta?plata(d.tarjeta):"—"),
      el("td",{class:"num chip-bi"},d.billetera?plata(d.billetera):"—"),
      hayOtros?el("td",{class:"num chip-ot"},d.otros?plata(d.otros):"—"):null,
      hayTotal?el("td",{class:"num",style:"font-weight:600"},plata(d.total)):null,
      el("td",{class:"num",style:"color:var(--ink-3)"},String(d.comps)),
      el("td",{},el("div",{class:"acciones"},
        el("button",{class:"btn ghost small",type:"button",onclick:()=>{abiertos.has(k)?abiertos.delete(k):abiertos.add(k);render()}},abiertos.has(k)?"Ocultar":"Medios"),
        tildeVerificado(d)))
    ));
    if(abiertos.has(k)){
      // el orden es el de los medios en la cabecera: efectivo, tarjetas, billetera, otros
      for(const g of d.grupos.slice().sort((a,b)=>
            (ORDEN_CAT.indexOf(a.categoria)-ORDEN_CAT.indexOf(b.categoria))||(b.monto-a.monto))){
        const cls=(CATS[g.categoria]||{}).clase||"";
        tb.append(el("tr",{class:"detalle"},el("td",{}),el("td",{colspan:"2",class:"medio "+cls},g.medio),
          el("td",{class:"num "+cls,colspan:String(NC-5)},plata(g.monto)),
          el("td",{class:"num"},String(g.n)),
          el("td",{},el("div",{class:"acciones"},
            g.comps&&g.comps.length?el("button",{class:"btn ghost small",type:"button",onclick:()=>verComps(g,d)},"Comprobantes"):null,
            tildeMedio(d,g)))));
      }
    }
  }
  tab.append(tb);

  /* Pie fijo: el total de lo filtrado, a la vista. Los mismos numeros
     estaban solo en los KPIs de abajo de todo, a un scroll de distancia:
     se filtraba arriba y el resultado quedaba fuera de pantalla. */
  const t=totales(gr);
  const rot=[];
  if(filtro.desde||filtro.hasta){
    rot.push((filtro.desde?fechaCorta(filtro.desde):"el inicio")+" al "+(filtro.hasta?fechaCorta(filtro.hasta):"hoy"));
  }else{ rot.push("todo lo cargado"); }
  rot.push(filtro.cajero?filtro.cajero:"todos los cajeros");
  rot.push(dias.length+(dias.length===1?" jornada":" jornadas"));
  tab.append(el("tfoot",{class:"pie-total"},el("tr",{},
    el("td",{colspan:"2"},
      el("div",{class:"pie-rot"},"Total del filtro"),
      el("div",{class:"pie-sub"},rot.join(" \u00b7 "))),
    el("td",{class:"num"},el("span",{class:"pie-efe"},plata(t.efectivo))),
    el("td",{class:"num",style:"color:var(--tarjeta)"},plata(t.tarjeta)),
    el("td",{class:"num",style:"color:var(--billetera)"},plata(t.billetera)),
    hayOtros?el("td",{class:"num",style:"color:var(--otros)"},plata(t.otros)):null,
    hayTotal?el("td",{class:"num"},plata(t.total)):null,
    el("td",{class:"num"},numero(t.comps)),
    el("td",{}))));

  const cajaTabla=el("div",{class:"tabla-scroll"},tab); p.append(cajaTabla); if(hayTotal){ requestAnimationFrame(()=>{ if(vista!=="dias"||!cajaTabla.isConnected)return; if(cajaTabla.scrollWidth>cajaTabla.clientWidth+1){ $("#main").replaceChildren(vistaDias(true)); } }); }
  /* Los KPIs repiten el pie, con el reparto porcentual. */
  p.append(el("div",{class:"kpis",style:"margin-top:12px"},
    kpi("Días",numero(dias.length)),kpi("Comprobantes",numero(t.comps)),
    kpi("Efectivo",plata(t.efectivo),"var(--efectivo)",t.total?t.efectivo/t.total*100:0),
    kpi("Tarjetas",plata(t.tarjeta),"var(--tarjeta)",t.total?t.tarjeta/t.total*100:0),
    kpi("Billetera",plata(t.billetera),"var(--billetera)",t.total?t.billetera/t.total*100:0),
    kpi("Total",plata(t.total))));
  c.append(p); return c;
}
function verComps(g,d){
  const cs=compsNorm(g.comps).map((x,i)=>Object.assign({},x,{k:x.n||("#"+i)}));
  const conM=cs.filter(x=>x.sm), sum=conM.reduce((a,x)=>a+x.m,0);
  const cls=(CATS[g.categoria]||{}).clase||"";
  const orden=cs.slice().sort((a,b)=>b.m-a.m||a.n.localeCompare(b.n,"es",{numeric:true}));
  const tab=el("table",{class:"data"});
  tab.append(el("thead",{},el("tr",{},el("th",{},"N\u00ba"),el("th",{class:"num"},"Importe"),
    d?el("th",{style:"width:1%"},""):null)));
  const tb=el("tbody",{});
  for(const x of orden)
    tb.append(el("tr",{},
      el("td",{style:"font-family:var(--mono)"},x.n||"sin n\u00famero"),
      el("td",{class:"num "+(x.sm?cls:"")},x.sm?plata(x.m):"\u2014"),
      d?el("td",{style:"text-align:right"},tildeComp(d,g,x.k)):null));
  tab.append(tb);
  tab.append(el("tfoot",{},el("tr",{},
    el("th",{},conM.length===cs.length?"Total":`Total (${conM.length} de ${cs.length})`),
    el("th",{class:"num"},plata(sum)),
    d?el("th",{},""):null)));
  const dif=Math.round((g.monto-sum)*100)/100;
  const aviso=!conM.length
    ? el("p",{class:"hint",style:"color:var(--aviso)"},
        "Este grupo se import\u00f3 antes de que se guardaran los importes por comprobante. Reimportando el listado de ese d\u00eda aparecen.")
    : (Math.abs(dif)>.5
        ? el("p",{class:"hint",style:"color:var(--aviso)"},
            `El grupo suma ${plata(g.monto)}: hay una diferencia de ${plata(dif)} con el desglose.`)
        : null);
  const dlg=modal({titulo:`${g.medio} \u00b7 ${fechaCorta(g.fecha)} \u00b7 ${g.cajero}`,
    cuerpo:el("div",{},
      el("p",{class:"hint"},`${g.n} comprobantes por ${plata(g.monto)}`),
      aviso,
      el("div",{class:"tabla-scroll",style:"max-height:330px"},tab)),
    acciones:[
      {texto:"Copiar",accion:()=>{
        const txt=orden.map(x=>[x.n,x.sm?String(x.m).replace(".",","):""].join("\t")).join("\n");
        (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject())
          .then(()=>toast("Desglose copiado. Pegalo en Excel."))
          .catch(()=>toast("No se pudo copiar al portapapeles."));
        return false}},
      {texto:"Cerrar"}]});
  // al cerrar se repinta la tabla: si quedaron todos tildados, el medio
  // (y el cajero, y el dia) ya aparecen en verde
  if(d) dlg.addEventListener("close",()=>render(),{once:true});
}

/* ============================================================
   VISTA: REPORTES
   ============================================================ */
let rango={desde:"",hasta:""};
function vistaReportes(){
  const c=el("div",{}); const p=el("div",{class:"panel"});
  p.append(el("h2",{},"Reporte por período"));
  const iD=el("input",{type:"date",value:rango.desde}),iH=el("input",{type:"date",value:rango.hasta});
  const set=(d,h)=>{rango={desde:d,hasta:h};render()};
  [iD,iH].forEach(i=>i.addEventListener("change",()=>set(iD.value,iH.value)));
  const hoy=new Date(),iso=d=>d.toLocaleDateString("sv-SE");
  p.append(el("div",{class:"row",style:"margin-bottom:6px"},
    el("label",{class:"f"},"Desde",iD),el("label",{class:"f"},"Hasta",iH),
    el("div",{class:"row",style:"gap:6px"},
      el("button",{class:"btn ghost small",type:"button",onclick:()=>set(iso(new Date(hoy.getFullYear(),hoy.getMonth(),1)),iso(hoy))},"Este mes"),
      el("button",{class:"btn ghost small",type:"button",onclick:()=>set(iso(new Date(hoy.getFullYear(),hoy.getMonth()-1,1)),iso(new Date(hoy.getFullYear(),hoy.getMonth(),0)))},"Mes pasado"),
      el("button",{class:"btn ghost small",type:"button",onclick:()=>set(iso(new Date(hoy-29*864e5)),iso(hoy))},"Últimos 30 días"),
      el("button",{class:"btn ghost small",type:"button",onclick:()=>set(periodoAbierto().desde||"",iso(hoy))},"Desde el último retiro"),
      el("button",{class:"btn ghost small",type:"button",onclick:()=>set("","")},"Todo"))));

  const gr=db.grupos.filter(g=>(!rango.desde||g.fecha>=rango.desde)&&(!rango.hasta||g.fecha<=rango.hasta));
  const rets=retirosOrd().filter(r=>(!rango.desde||r.fecha>=rango.desde)&&(!rango.hasta||r.fecha<=rango.hasta));
  const t=totales(gr); const dias=new Set(gr.map(g=>g.fecha)).size;
  p.append(el("p",{class:"hint"},gr.length?`${dias} días con actividad · ${numero(t.comps)} comprobantes`:"Sin datos en el rango elegido."));
  p.append(el("div",{class:"kpis"},
    kpi("Efectivo",plata(t.efectivo),"var(--efectivo)"),
    kpi("Tarjetas",plata(t.tarjeta),"var(--tarjeta)"),
    kpi("Billetera virtual",plata(t.billetera),"var(--billetera)"),
    kpi("Otros valores",plata(t.otros),t.otros?"var(--otros)":null),
    kpi("Total valores",plata(t.total)),
    kpi("Retirado",plata(rets.filter(r=>!esDeposito(r)).reduce((s,r)=>s+r.monto,0))),
    kpi("Depositado en boletas",plata(rets.filter(esDeposito).reduce((s,r)=>s+r.monto,0)))));
  c.append(p);
  if(!gr.length) return c;

  const leyenda=el("div",{class:"leyenda"},...Object.entries(CATS).map(([k,v])=>el("span",{},el("i",{style:`background:${v.color}`}),v.nombre)));
  const barra=(o,max)=>el("div",{class:"bar-track"},...Object.keys(CATS).map(k=>o[k]>0?el("div",{style:`width:${o[k]/max*100}%;background:${CATS[k].color}`}):null));

  // por cajero
  const pc={};
  for(const g of gr){pc[g.cajero]||={efectivo:0,tarjeta:0,billetera:0,otros:0,total:0,dias:new Set(),comps:0};
    const o=pc[g.cajero];o[g.categoria]+=g.monto;o.total+=g.monto;o.dias.add(g.fecha);o.comps+=g.n||0}
  const lista=Object.entries(pc).sort((a,b)=>b[1].total-a[1].total);
  const max=lista[0][1].total||1;
  const p2=el("div",{class:"panel"}); p2.append(el("h2",{},"Por cajero"),leyenda.cloneNode(true));
  const bars=el("div",{class:"bars"});
  for(const[k,o]of lista) bars.append(el("div",{class:"bar-row"},el("span",{class:"cajero-tag"},k),barra(o,max),el("span",{class:"bar-val"},plata(o.total))));
  p2.append(bars);
  const tc=el("table",{class:"data",style:"margin-top:18px"});
  tc.append(el("thead",{},el("tr",{},el("th",{},"Cajero"),el("th",{class:"num"},"Efectivo"),el("th",{class:"num"},"Tarjetas"),
    el("th",{class:"num"},"Billetera"),el("th",{class:"num"},"Otros"),el("th",{class:"num"},"Total"),
    el("th",{class:"num"},"Días"),el("th",{class:"num"},"Prom./día"),el("th",{class:"num"},"% total"))));
  const tcb=el("tbody",{});
  for(const[k,o]of lista) tcb.append(el("tr",{},el("td",{},el("span",{class:"cajero-tag"},k)),
    el("td",{class:"num chip-ef"},plata(o.efectivo)),el("td",{class:"num chip-ta"},plata(o.tarjeta)),
    el("td",{class:"num chip-bi"},plata(o.billetera)),el("td",{class:"num chip-ot"},o.otros?plata(o.otros):"—"),
    el("td",{class:"num",style:"font-weight:600"},plata(o.total)),el("td",{class:"num"},String(o.dias.size)),
    el("td",{class:"num"},plata(o.total/o.dias.size)),el("td",{class:"num"},(o.total/t.total*100).toFixed(1)+"%")));
  tcb.append(el("tr",{style:"border-top:2px solid var(--ink)"},el("td",{style:"font-weight:700"},"TOTAL"),
    ...["efectivo","tarjeta","billetera","otros","total"].map(k=>el("td",{class:"num",style:"font-weight:700"},plata(t[k]))),
    el("td",{class:"num",style:"font-weight:700"},String(dias)),el("td",{class:"num",style:"font-weight:700"},plata(t.total/dias)),
    el("td",{class:"num",style:"font-weight:700"},"100%")));
  tc.append(tcb); p2.append(el("div",{class:"tabla-scroll",style:"max-height:none;border:0"},tc)); c.append(p2);

  // por mes
  const pm={};
  for(const g of gr){const k=g.fecha.slice(0,7);pm[k]||={efectivo:0,tarjeta:0,billetera:0,otros:0,total:0};pm[k][g.categoria]+=g.monto;pm[k].total+=g.monto}
  const meses=Object.entries(pm).sort();
  if(meses.length>1){
    const maxM=Math.max(...meses.map(x=>x[1].total));
    const p3=el("div",{class:"panel"}); p3.append(el("h2",{},"Por mes"),leyenda.cloneNode(true));
    const bm=el("div",{class:"bars"});
    for(const[k,o]of meses){const[a,m]=k.split("-");
      bm.append(el("div",{class:"bar-row"},el("span",{style:"font-family:var(--mono);font-size:12px"},new Date(+a,+m-1,1).toLocaleDateString("es-AR",{month:"short",year:"2-digit"})),barra(o,maxM),el("span",{class:"bar-val"},plata(o.total))))}
    p3.append(bm); c.append(p3);
  }
  // por medio
  const pmd={};
  for(const g of gr){pmd[g.medio]||={monto:0,n:0,cat:g.categoria};pmd[g.medio].monto+=g.monto;pmd[g.medio].n+=g.n||0}
  const p4=el("div",{class:"panel"}); p4.append(el("h2",{},"Por medio de cancelación"));
  const tm=el("table",{class:"data"});
  tm.append(el("thead",{},el("tr",{},el("th",{},"Medio"),el("th",{},"Categoría"),el("th",{class:"num"},"Comprobantes"),el("th",{class:"num"},"Monto"),el("th",{class:"num"},"%"))));
  const tmb=el("tbody",{});
  for(const[m,o]of Object.entries(pmd).sort((a,b)=>b[1].monto-a[1].monto))
    tmb.append(el("tr",{},el("td",{},m),el("td",{},el("span",{style:`color:${CATS[o.cat].color};font-weight:600`},CATS[o.cat].nombre)),
      el("td",{class:"num"},numero(o.n)),el("td",{class:"num"},plata(o.monto)),el("td",{class:"num"},(o.monto/t.total*100).toFixed(1)+"%")));
  tm.append(tmb); p4.append(el("div",{class:"tabla-scroll",style:"max-height:none;border:0"},tm)); c.append(p4);

  const p5=el("div",{class:"panel"});
  p5.append(el("div",{class:"row"},
    el("button",{class:"btn ghost",type:"button",onclick:()=>window.print()},"Imprimir o guardar en PDF"),
    el("button",{class:"btn ghost",type:"button",onclick:()=>exportarCSV(gr)},"Exportar el período a Excel")));
  c.append(p5);
  return c;
}
