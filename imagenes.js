(function(){
'use strict';
if(!window.__img_user) return;

const TABS = ['medicos','residentes','tecnicos','administrativos'];
const SUBS = ['staff','eco','rm'];
const TITULOS = { medicos:'Médicos', residentes:'Residentes', tecnicos:'Técnicos', administrativos:'Administrativos' };
const BASE = 'Dashboard Imágenes H.Italiano';

function parseHash(h){
  const partes = String(h || '').replace(/^#/, '').split('/');
  const tab = TABS.indexOf(partes[0]) >= 0 ? partes[0] : null;
  if(tab === null) return { tab: null, sub: null };
  if(tab !== 'medicos') return { tab: tab, sub: null };
  const sub = SUBS.indexOf(partes[1]) >= 0 ? partes[1] : 'staff';
  return { tab: tab, sub: sub };
}

function render(){
  let r = parseHash(location.hash);
  if(r.tab === null){
    history.replaceState(null, '', '#medicos');
    r = parseHash('#medicos');
  } else {
    // Subvista inválida (o segmento extra en otra pestaña): se normaliza a la pestaña sola.
    const sub = String(location.hash).replace(/^#/, '').split('/')[1];
    if(sub !== undefined && sub !== r.sub) history.replaceState(null, '', '#' + r.tab);
  }
  TABS.forEach(function(k){
    const t = document.getElementById('t-' + k);
    const p = document.getElementById('tab-' + k);
    const activa = k === r.tab;
    t.setAttribute('aria-selected', activa ? 'true' : 'false');
    t.tabIndex = activa ? 0 : -1;
    p.hidden = !activa;
  });
  SUBS.forEach(function(k){
    const a = document.querySelector('.subtabs a[href="#medicos/' + k + '"]');
    const d = document.getElementById('sub-' + k);
    const activa = r.tab === 'medicos' && k === r.sub;
    if(activa) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    d.hidden = !activa;
  });
  document.title = TITULOS[r.tab] + ' · ' + BASE;
}

window.IMG = { parseHash: parseHash, TABS: TABS, SUBS: SUBS };

window.addEventListener('hashchange', render);

const tablist = document.querySelector('[role="tablist"]');
tablist.addEventListener('keydown', function(ev){
  if(ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
  const actual = parseHash(location.hash).tab || 'medicos';
  const i = TABS.indexOf(actual);
  const n = (i + (ev.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
  ev.preventDefault();
  location.hash = '#' + TABS[n];
  document.getElementById('t-' + TABS[n]).focus();
});

const user = window.__img_user;
document.getElementById('ses-chip').textContent = user.nombre || user.username || '';
document.getElementById('modo-chip').textContent = 'Solo lectura';

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

render();
})();
