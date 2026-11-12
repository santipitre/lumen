const V='salud-v2';
const SHELL=['./','index.html','manifest.webmanifest','sd/icon-180.png','sd/icon-192.png','sd/icon-512.png'];
const ASSETS=['sd/data.json','sd/muscles.webp','sd/thumbs.webp','sd/pack-0.webp','sd/pack-1.webp','sd/pack-2.webp','sd/pack-3.webp','sd/pack-4.webp','sd/pack-5.webp','sd/pack-6.webp'];
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(V).then(async c=>{ await c.addAll(SHELL); await Promise.allSettled(ASSETS.map(a=>c.add(a))); })); });
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{ const r=e.request; if(r.method!=='GET') return; const u=new URL(r.url); if(u.origin!==location.origin) return;
  if(r.mode==='navigate'||u.pathname.endsWith('.html')||u.pathname.endsWith('/')){
    e.respondWith(fetch(r).then(x=>{ const c=x.clone(); caches.open(V).then(k=>k.put(r,c)); return x; }).catch(()=>caches.match(r).then(m=>m||caches.match('index.html')||caches.match('./')))); return; }
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(x=>{ if(x.ok){ const c=x.clone(); caches.open(V).then(k=>k.put(r,c)); } return x; }))); });
