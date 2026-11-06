/* ============================================================
   SPCD — UTILITARIOS JS COMPARTIDOS (Fase 3 del refactor)
   ------------------------------------------------------------
   Funciones reusables que antes estaban duplicadas en múltiples
   módulos. Se carga con:
       <script src="spcd-utils.js"></script>
   ANTES del bloque <script> inline de cada HTML, así las
   funciones quedan disponibles globalmente cuando el módulo
   arranca.

   Cambios en este archivo impactan los 5 módulos a la vez.
   ============================================================ */

/* ── IndexedDB (almacenamiento cliente-side) ─────────────── */
const SPCD_DB    = 'spcd_storage';
const SPCD_STORE = 'data';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SPCD_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SPCD_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function dbSave(key, value) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(SPCD_STORE, 'readwrite');
    tx.objectStore(SPCD_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  }));
}

function dbLoad(key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(SPCD_STORE, 'readonly');
    const req = tx.objectStore(SPCD_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

/* ── Escape HTML seguro ──────────────────────────────────── */
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

/* ── Formato de fechas (locale es-AR) ────────────────────── */
function fmtDate(d) {
  if (!d) return '-';
  // Acepta "YYYY-MM-DD" o ISO completo
  const dateStr = String(d);
  const dateObj = dateStr.length === 10
    ? new Date(dateStr + 'T00:00:00')
    : new Date(dateStr);
  return dateObj.toLocaleDateString('es-AR');
}

function fmtDateTime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('es-AR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   '2-digit',
    hour:   '2-digit',
    minute: '2-digit'
  });
}

/* ── Navegación "atrás" ────────────────────────────────────
   Usa history.back() si hay historial previo en la pestaña.
   Si se abrió la pantalla directo (sin navegación previa)
   o ya se fue todo el historial, cae al fallback (index.html
   por default). Así nunca queda "colgado" un botón sin efecto.
*/
function spcdVolverAtras(fallbackUrl) {
  /* vuelve a la página anterior solo si se llegó desde Lumen; si no, al destino fijo (nunca a la portada) */
  var destino = String(fallbackUrl || 'app.html?screen=roles').replace(/^index\.html(\?screen=)?/, function (m, q) { return q ? 'app.html?screen=' : 'app.html?screen=roles'; });
  try {
    var ref = document.referrer || '';
    if (ref && ref.indexOf(window.location.origin) === 0 && window.history.length > 1) {
      window.history.back();
      return;
    }
  } catch(e) { /* silencioso */ }
  window.location.href = destino;
}

/* ── Toast de notificación (requiere <div id="toast"> en HTML) */
function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) { console.warn('[showToast] no existe elemento #toast en este HTML'); return; }
  t.textContent = msg;
  t.className = 'toast ' + (type || '');
  t.style.display = 'block';
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { t.style.display = 'none'; }, 3500);
}
