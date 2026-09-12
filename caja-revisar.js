/* ============================================================
   caja-revisar.js — parte de caja.html
   ------------------------------------------------------------
   Verificar y mantener. La vista Revisar, la carga a mano y la
   vista Datos y respaldo.

   Se carga DESPUÉS de caja-retiros.js.
   El orden importa: los archivos se cortaron en orden de aparición
   y se cargan en ese mismo orden, así la evaluación es idéntica a
   la del archivo único que había antes.
   Separado de caja.html el 2026-09-12 (paso 3, rebanada 2).
   ============================================================ */
"use strict";

/* ============================================================
   VISTA: REVISAR
   ============================================================ */
function vistaRevisar(){
  const c=el("div",{}); 
  const todos=diasARevisar().sort((a,b)=>b.d.fecha.localeCompare(a.d.fecha));
  const pend=todos.filter(x=>!estaRevisado(x.d));
  const hechos=todos.filter(x=>estaRevisado(x.d));

  const tabla=(lista,revisado)=>{
    const t=el("table",{class:"data"});
    t.append(el("thead",{},el("tr",{},el("th",{},"Fecha"),el("th",{},"Cajero"),
      el("th",{class:"num"},"Efectivo"),el("th",{class:"num"},"Tarjetas"),el("th",{class:"num"},"Billetera"),
      el("th",{class:"num"},"Otros"),el("th",{},"Motivo"),el("th",{},"Comprobantes"),el("th",{},""))));
    const tb=el("tbody",{});
    for(const{d,motivos}of lista){
      const marca=db.revisados[claveDia(d)];
      tb.append(el("tr",{class:revisado?"fila-ok":""},
        el("td",{},fechaCorta(d.fecha)),
        el("td",{},el("span",{class:"cajero-tag"},d.cajero)),
        el("td",{class:"num chip-ef"+(d.efectivo<0?" neg":"")},plata(d.efectivo)),
        el("td",{class:"num chip-ta"},plata(d.tarjeta)),
        el("td",{class:"num chip-bi"},plata(d.billetera)),
        el("td",{class:"num chip-ot"},d.otros?plata(d.otros):"\u2014"),
        el("td",{style:"white-space:normal;min-width:220px"},
          revisado?el("span",{class:"badge ok",title:"Revisado el "+new Date(marca.ts).toLocaleString("es-AR")},"Revisado"):null,
          revisado&&marca.nota?el("div",{class:"hint",style:"margin-top:5px;font-style:italic"},"\u201c"+marca.nota+"\u201d"):null,
          " ",
          ...motivos.map(m=>el("span",{class:"badge "+(revisado?"info":"rev"),style:"margin:1px 3px 1px 0"},m))),
        celdaComps(claveDia(d)),
        el("td",{},el("button",{class:"btn "+(revisado?"ghost ":"")+"small",type:"button",
          onclick:()=>marcarRevisado(d,!revisado)},revisado?"Reabrir":"Marcar revisado"))));
    }
    t.append(tb);
    return el("div",{class:"tabla-scroll"},t);
  };

  const p1=el("div",{class:"panel"});
  p1.append(el("h2",{},"Pendientes de revisar"+(pend.length?" ("+pend.length+")":"")));
  p1.append(el("p",{class:"hint"},"Nada se bloquea: se marca. Aparecen ac\u00e1 los d\u00edas con efectivo neto negativo, valores fuera de los tres medios comunes, fechas imposibles, o cargados desde dos importaciones distintas. Los montos no se comparan contra ning\u00fan promedio. Adjunt\u00e1 el comprobante y marcalo revisado para que deje de aparecer ac\u00e1."));
  if(pend.length) p1.append(tabla(pend,false));
  else p1.append(el("div",{class:"vacio"},el("b",{},todos.length?"Todo revisado":"No hay nada raro"),
    todos.length?"Los "+todos.length+" d\u00edas marcados ya fueron revisados.":"Todos los d\u00edas pasan los controles."));
  c.append(p1);

  if(hechos.length){
    const p2=el("div",{class:"panel"});
    p2.append(el("h2",{},"Revisados ("+hechos.length+")"));
    p2.append(el("p",{class:"hint"},"Quedan ac\u00e1 como historial. Los comprobantes viajan dentro del respaldo .json."));
    p2.append(tabla(hechos,true));
    c.append(p2);
  }
  return c;
}

/* ============================================================
   VISTA: CARGAR A MANO
   ============================================================ */
let fechaManual=hoyISO();
function vistaManual(){
  const c=el("div",{}); const p=el("div",{class:"panel"});
  p.append(el("h2",{},"Cargar a mano"));
  p.append(el("p",{class:"hint"},"Sólo para cuando no tengas el listado del sistema. Enter pasa al siguiente campo, Ctrl+Enter guarda."));
  const iF=el("input",{type:"date",value:fechaManual,max:hoyISO(),onchange:e=>{fechaManual=e.target.value;render()}});
  p.append(el("div",{class:"row",style:"margin-bottom:16px"},el("label",{class:"f"},"Fecha",iF),
    el("div",{style:"font-size:12.5px;color:var(--ink-2);padding-bottom:8px"},fechaLarga(fechaManual))));

  const tab=el("table",{class:"data"});
  tab.append(el("thead",{},el("tr",{},el("th",{},"Cajero"),el("th",{class:"num"},"Efectivo"),
    el("th",{class:"num"},"Tarjetas"),el("th",{class:"num"},"Billetera"),el("th",{class:"num"},"Total"))));
  const tb=el("tbody",{}); const filas=[];
  for(const cj of db.cajeros){
    const ya=db.grupos.some(g=>g.fecha===fechaManual&&g.cajero===cj);
    const i1=el("input",{class:"money",type:"text",placeholder:"0"}),i2=el("input",{class:"money",type:"text",placeholder:"0"}),i3=el("input",{class:"money",type:"text",placeholder:"0"});
    const td=el("td",{class:"num",style:"color:var(--ink-3);font-family:var(--mono)"},"—");
    const rc=()=>{const t=parseMonto(i1.value)+parseMonto(i2.value)+parseMonto(i3.value);td.textContent=t?plata(t):"—";td.style.color=t?"var(--ink)":"var(--ink-3)"};
    [i1,i2,i3].forEach(i=>i.addEventListener("input",rc));
    filas.push({cj,i1,i2,i3});
    tb.append(el("tr",{},el("td",{},el("span",{class:"cajero-tag"},cj),ya?el("div",{style:"font-size:11px;color:var(--aviso);font-weight:600"},"ya cargado"):null),
      el("td",{class:"num"},pesos(i1)),el("td",{class:"num"},pesos(i2)),el("td",{class:"num"},pesos(i3)),td));
  }
  tab.append(tb); p.append(el("div",{class:"tabla-scroll",style:"max-height:none"},tab));
  const guardarDia=()=>{
    const nuevos=[];
    for(const f of filas){
      for(const[inp,medio,cat]of[[f.i1,"EFECTIVO","efectivo"],[f.i2,"TARJETA (CARGA MANUAL)","tarjeta"],[f.i3,"BILLETERA VIRTUAL","billetera"]]){
        const v=parseMonto(inp.value); if(inp.value.trim()==="")continue;
        if(v===0)continue;
        nuevos.push({id:uid(),imp:"manual",fecha:fechaManual,cajero:f.cj,medio,categoria:cat,monto:v,n:0,comps:[]});
      }
    }
    if(!nuevos.length){toast("No hay nada para guardar.");return}
    const claves=new Set(nuevos.map(n=>n.fecha+"|"+n.cajero));
    const choca=db.grupos.some(g=>claves.has(g.fecha+"|"+g.cajero));
    const commit=rep=>{
      if(rep)db.grupos=db.grupos.filter(g=>!claves.has(g.fecha+"|"+g.cajero));
      db.grupos.push(...nuevos);guardar();toast(`${nuevos.length} línea(s) guardadas.`);vista="dias";render()};
    if(choca) modal({titulo:"Ese día ya tiene datos",cuerpo:el("div",{},el("p",{},"Algunos cajeros ya tienen movimientos ese día."),el("p",{class:"hint"},"Reemplazar borra lo anterior de esos cajeros. Sumar deja los dos y queda marcado para revisar.")),
      acciones:[{texto:"Cancelar"},{texto:"Sumar",accion:()=>commit(false)},{texto:"Reemplazar",clase:"",accion:()=>commit(true)}]});
    else commit(false);
  };
  p.append(el("div",{class:"row",style:"margin-top:16px"},
    el("button",{class:"btn",type:"button",onclick:guardarDia},"Guardar el día"),
    el("button",{class:"btn ghost",type:"button",onclick:()=>render()},"Limpiar")));
  const inputs=filas.flatMap(f=>[f.i1,f.i2,f.i3]);
  inputs.forEach((x,i)=>x.addEventListener("keydown",e=>{
    if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();guardarDia()}
    else if(e.key==="Enter"){e.preventDefault();(inputs[i+1]||inputs[0]).focus()}}));
  c.append(p); if(filas.length)setTimeout(()=>filas[0].i1.focus(),0);
  return c;
}

/* ============================================================
   VISTA: DATOS
   ============================================================ */
function vistaDatos(){
  const c=el("div",{}); banners().forEach(b=>c.append(b));
  const p=el("div",{class:"panel"});
  p.append(el("h2",{},"Respaldo"));
  p.append(el("p",{class:"hint"},
    "Los datos viven en la nube (sede: "+SEDE+") y los ve todo el que tenga permiso al m\u00f3dulo. "+
    "El archivo .json sirve como copia hist\u00f3rica, no como \u00fanica copia."));
  const bytes=(()=>{try{return new Blob([JSON.stringify(db)]).size}catch(e){return 0}})();
  p.append(el("div",{class:"kpis",style:"margin-bottom:14px"},
    kpi("Grupos",numero(db.grupos.length)),kpi("Días",numero(new Set(db.grupos.map(g=>g.fecha)).size)),
    kpi("Retiros",numero(db.retiros.length)),kpi("Sin respaldar",numero(db.sinRespaldo)),
    kpi("Espacio usado",(bytes/1048576).toFixed(2)+" MB",bytes>3.5e6?"var(--alerta)":null)));
  const fj=el("input",{type:"file",accept:".json",style:"display:none",onchange:e=>importarJSON(e.target.files[0])});
  p.append(el("div",{class:"row"},
    el("button",{class:"btn",type:"button",onclick:exportarJSON},"Guardar respaldo (.json)"),
    el("button",{class:"btn ghost",type:"button",onclick:()=>fj.click()},"Restaurar desde respaldo"),fj));
  c.append(p);

  /* --- Apariencia: encabezado --- */
  const pe=el("div",{class:"panel"});
  pe.append(el("h2",{},"Encabezado"));
  pe.append(el("p",{class:"hint"},"El encabezado institucional viene incrustado en el archivo y aparece también como membrete al imprimir o exportar a PDF. Podés reemplazarlo por otra imagen: se guarda sólo en este navegador y no entra en el respaldo .json. Máximo 300 KB."));
  const fe=el("input",{type:"file",accept:"image/*",style:"display:none",onchange:e=>{cargarEscudo(e.target.files[0]);e.target.value=""}});
  const propio=!!leerEscudo();
  pe.append(el("div",{class:"row",style:"align-items:center"},
    propio
      ? el("img",{src:leerEscudo(),alt:"",style:"height:46px;width:auto;border:1px solid var(--linea);border-radius:var(--r)"})
      : el("span",{style:"display:inline-flex;align-items:center;gap:10px;border:1px solid var(--linea);border-radius:var(--r);padding:7px 12px;background:var(--panel)"},
          el("img",{src:"fuesmen-logo.png",alt:"",style:"height:30px;width:auto"}),
          el("b",{style:"font-size:15px;letter-spacing:-.02em;text-transform:uppercase"},"Rendición ",
            el("span",{style:"color:var(--marca)"},"de Caja")),
          el("img",{src:"hitaliano-logo.png",alt:"",style:"height:34px;width:auto"})),
    el("button",{class:"btn ghost",type:"button",onclick:()=>fe.click()},"Reemplazar imagen"),
    propio?el("button",{class:"btn ghost small",type:"button",onclick:quitarEscudo},"Volver al original"):null,
    fe));
  c.append(pe);

  const p2=el("div",{class:"panel"});
  p2.append(el("h2",{},"Cajeros"));
  const lc=el("div",{class:"row",style:"margin-bottom:12px"},
    ...db.cajeros.map(x=>el("span",{style:"display:inline-flex;gap:6px;align-items:center;border:1px solid var(--linea);border-radius:99px;padding:3px 6px 3px 11px"},
      el("span",{class:"cajero-tag"},x),
      el("button",{class:"btn ghost small",type:"button",style:"border:0;padding:0 4px",title:"Quitar",onclick:async()=>{
        if(db.grupos.some(g=>g.cajero===x)&&!await confirmar("Sacar de la lista",
          `${x} tiene movimientos cargados. Sacarlo de la lista no borra nada: sólo deja de aparecer en los desplegables.`,
          {ok:"Sacar"}))return;
        db.cajeros=db.cajeros.filter(y=>y!==x);guardar();render()}},"×"))));
  const inv=el("input",{type:"text",placeholder:"NUEVOCAJERO",style:"width:160px"});
  const add=()=>{const v=inv.value.trim().toUpperCase();if(!v)return;
    if(db.cajeros.includes(v)){toast("Ya está en la lista.");return}db.cajeros.push(v);guardar();render()};
  inv.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();add()}});
  p2.append(lc,el("div",{class:"row"},el("label",{class:"f"},"Agregar cajero",inv),el("button",{class:"btn ghost",type:"button",onclick:add},"Agregar")));
  c.append(p2);

  const p3=el("div",{class:"panel"});
  p3.append(el("h2",{},"Borrar todo"));
  p3.append(el("p",{class:"hint"},"Elimina movimientos, retiros e importaciones de este navegador. No hay deshacer."));
  p3.append(el("button",{class:"btn danger",type:"button",onclick:()=>{
    modal({titulo:"Paso 1 de 2 — esto no se puede deshacer",cuerpo:el("div",{},
      el("p",{},`Vas a eliminar ${numero(db.grupos.length)} grupos, ${numero(db.retiros.length)} retiros y ${numero(Object.values(db.comprobantes).reduce((a,x)=>a+x.length,0))} comprobantes de este navegador.`),
      el("p",{class:"hint"},db.sinRespaldo
        ? `Tenés ${numero(db.sinRespaldo)} cambios sin respaldar. Si borrás ahora, esos cambios no existen en ningún lado.`
        : "El último respaldo está al día, pero verificá que el archivo .json siga en tu disco antes de seguir."),
      el("p",{class:"hint"},"No hay papelera. No hay deshacer.")),
      acciones:[{texto:"Cancelar"},
        {texto:"Guardar respaldo primero",accion:()=>{exportarJSON();return false}},
        {texto:"Entiendo, continuar",clase:"danger",accion:()=>{setTimeout(borrarPaso2,120)}}]});
  }},"Borrar todos los datos"));
  c.append(p3);
  return c;
}

/* ============================================================
   IMPORT / EXPORT
   ============================================================ */
function exportarJSON(){
  const n=`caja-respaldo-${hoyISO()}.json`;
  bajar(n,JSON.stringify(db),"application/json");
  toast("Respaldo descargado: "+n);
  pintarCinta(); if(vista==="datos")render();
}
function importarJSON(f){
  if(!f)return; const fr=new FileReader();
  fr.onload=()=>{
    let d;try{d=JSON.parse(fr.result)}catch(e){avisar("Archivo ilegible","Ese archivo no es un respaldo válido de la caja. Buscá el .json que descargaste desde Datos y respaldo.");return}
    const gr=d.grupos||d.movimientos;
    if(!Array.isArray(gr)){avisar("Respaldo vacío","El archivo se leyó bien pero no contiene movimientos.");return}
    modal({titulo:"Restaurar respaldo",cuerpo:el("div",{},
      el("p",{},`El respaldo trae ${gr.length} grupos y ${(d.retiros||[]).length} retiros.`),
      el("p",{},`Ahora tenés ${db.grupos.length} grupos y ${db.retiros.length} retiros.`),
      el("p",{class:"hint"},"Reemplazar descarta lo actual. Sumar une los dos y descarta duplicados exactos.")),
      acciones:[{texto:"Cancelar"},
      {texto:"Sumar",accion:()=>{
        const k=new Set(db.grupos.map(g=>[g.fecha,g.cajero,g.medio,g.monto].join("|")));
        let n=0;for(const g of gr){const kk=[g.fecha,g.cajero,g.medio,g.monto].join("|");
          if(k.has(kk))continue;k.add(kk);db.grupos.push({...g,id:uid(),imp:"manual"});n++}
        const kr=new Set(db.retiros.map(r=>[r.fecha,r.monto,r.tipo||"retiro"].join("|")));
        for(const r of(d.retiros||[]))if(!kr.has([r.fecha,r.monto,r.tipo||"retiro"].join("|")))db.retiros.push({...r,id:uid()});
        for(const c of(d.cajeros||[]))if(!db.cajeros.includes(c))db.cajeros.push(c);
        Object.assign(db.revisados,d.revisados||{});
        guardar();
        toast(`${n} grupos nuevos subidos a la nube.`+
          (Object.keys(d.comprobantes||{}).length?" Los comprobantes del respaldo no se migran: adjuntalos de nuevo.":""));
        render()}},
      {texto:"Reemplazar todo",clase:"danger",accion:async()=>{
        if(!await confirmar("Reemplazar toda la caja",
          ["Esto borra la caja de la nube para todas las sedes y todos los usuarios, no sólo en esta computadora.",
           "No hay forma de deshacerlo."],
          {ok:"Reemplazar todo",peligro:true}))return false;
        db.grupos=gr.map(g=>({...g,id:uid(),imp:"manual"}));
        db.retiros=(d.retiros||[]).map(r=>({...r,id:uid()}));
        db.importaciones=[];
        db.revisados=d.revisados||{};
        guardar();toast("Respaldo subido a la nube.");render()}}]});
  };
  fr.readAsText(f,"utf-8");
}
/* ============================================================
   EXPORTACI\u00d3N A EXCEL
   Mismo formato que la pantalla: fechas dd/mm/aaaa, importes en
   pesos con separador de miles. Los importes van como N\u00daMERO con
   formato aplicado, no como texto: se leen igual y se pueden sumar.
   ============================================================ */

function hojaDeDias(dias){
  const cab=["Fecha","Cajero","Efectivo","Tarjetas","Billetera","Otros valores","Total","Comprobantes","Estado"];
  const filas=dias.map(d=>[
    aFecha(d.fecha), d.cajero,
    d.efectivo||0, d.tarjeta||0, d.billetera||0, d.otros||0, d.total||0,
    d.comps||0, estaRevisado(d)?"Revisado":""
  ]);
  const tot=dias.reduce((a,d)=>({ef:a.ef+(d.efectivo||0),ta:a.ta+(d.tarjeta||0),
    bi:a.bi+(d.billetera||0),ot:a.ot+(d.otros||0),to:a.to+(d.total||0),n:a.n+(d.comps||0)}),
    {ef:0,ta:0,bi:0,ot:0,to:0,n:0});
  filas.push([]);
  filas.push(["TOTAL","",tot.ef,tot.ta,tot.bi,tot.ot,tot.to,tot.n,""]);
  filas.push([]);
  filas.push(["CONFIDENCIAL - uso interno de FUESMEN / Hospital Italiano de Mendoza. No difundir fuera de la institucion."]);

  const ws=XLSX.utils.aoa_to_sheet([cab,...filas],{cellDates:true});
  ws["!cols"]=[{wch:12},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:15},{wch:14},{wch:11}];
  ws["!freeze"]={xSplit:0,ySplit:1};
  const rango=XLSX.utils.decode_range(ws["!ref"]);
  for(let r=1;r<=rango.e.r;r++){
    const cf=ws[XLSX.utils.encode_cell({r,c:0})];
    if(cf&&cf.t==="d") cf.z=FMT_FECHA;
    for(let c=2;c<=6;c++){
      const ref=XLSX.utils.encode_cell({r,c}), cel=ws[ref];
      if(cel&&cel.t==="n") cel.z=FMT_PESOS;
    }
  }
  return ws;
}

function exportarCSV(gr){
  const dias=porDia(gr);
  if(!dias.length){toast("No hay nada para exportar en ese rango.");return}
  try{
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,hojaDeDias(dias),"Rendici\u00f3n de caja");

    const rt=db.retiros.filter(r=>{
      const f=dias.map(d=>d.fecha);
      return r.fecha>=f[0] && r.fecha<=f[f.length-1];
    }).sort((a,b)=>a.fecha.localeCompare(b.fecha));
    if(rt.length){
      // ojo con los índices: fecha=0, período desde=1 / hasta=2, monto=5
      const ws2=XLSX.utils.aoa_to_sheet([["Fecha","Período desde","Período hasta","Tipo","Responsable","Monto","Banco","N° de boleta","Detalle"],
        ...rt.map(r=>{
          const pe=esDeposito(r)?{desde:r.desde,hasta:r.hasta}:periodoDe(r);
          return [aFecha(r.fecha),pe.desde?aFecha(pe.desde):"",pe.hasta?aFecha(pe.hasta):"",
                  esDeposito(r)?"Depósito":"Retiro",r.responsable,r.monto||0,
                  r.banco||"",r.referencia||"",r.detalle||""];
        })],{cellDates:true});
      ws2["!cols"]=[{wch:12},{wch:14},{wch:14},{wch:11},{wch:18},{wch:15},{wch:16},{wch:18},{wch:34}];
      const rr=XLSX.utils.decode_range(ws2["!ref"]);
      for(let r=1;r<=rr.e.r;r++){
        for(const c of [0,1,2]){
          const cf=ws2[XLSX.utils.encode_cell({r,c})];
          if(cf&&cf.t==="d") cf.z=FMT_FECHA;
        }
        const cel=ws2[XLSX.utils.encode_cell({r,c:5})];
        if(cel&&cel.t==="n") cel.z=FMT_PESOS;
      }
      XLSX.utils.book_append_sheet(wb,ws2,"Retiros y depósitos");
    }

    XLSX.writeFile(wb,`caja-${hoyISO()}.xlsx`,{cellStyles:true,cellDates:true});
    toast(`${dias.length} d\u00edas exportados a Excel.`);
  }catch(e){
    console.error("[caja] export",e);
    toast("No se pudo generar el Excel: "+e.message);
  }
}
