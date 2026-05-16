/* ============================================================
   SPCD — CONFIG Y HELPERS DE SUPABASE (Fase 5 del refactor)
   ------------------------------------------------------------
   Credenciales y wrappers sobre la API REST de Supabase.
   Expuestas como globales para que cualquier módulo las use:

     sbQuery(tabla, 'select=*&col=eq.valor')  → GET
     sbInsert(tabla, data)                     → POST (return=representation)
     sbUpdate(tabla, id, data)                 → PATCH por id
     sbDelete(tabla, id)                       → DELETE por id
     sbRpc(nombreFuncion, args)                → POST /rpc/<fn>

   AUTH (Fase 2.C Etapa 3 · 2026-05-15):
     Para `signInWithOtp` y el callback del magic link se usa el
     SDK oficial de Supabase (cargado desde CDN). Se inicializa
     bajo `window.sbAuth` solo si el SDK ya está disponible.

         <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
         <script src="spcd-supabase.js"></script>

   Cómo incluir:
       <script src="spcd-supabase.js"></script>

   Nota de seguridad: SUPABASE_KEY es la "anon key" (pública por
   diseño). La seguridad real debe venir de las Row Level Security
   policies + funciones SECURITY DEFINER en el backend.
   ============================================================ */

const SUPABASE_URL = 'https://erjdncsnomwymjiaslpx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5qeVvqQO26a70lAj8dMXhw_fL_Cdu-2';

const SB_HEADERS = {
  'apikey':        SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation'
};

/* ── SELECT ──────────────────────────────────────────────── */
async function sbQuery(table, params = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: SB_HEADERS
  });
  if (!r.ok) throw new Error(`DB error: ${r.status}`);
  return r.json();
}

/* ── INSERT ──────────────────────────────────────────────── */
async function sbInsert(table, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(data)
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `Insert error: ${r.status}`);
  }
  return r.json();
}

/* ── UPDATE (por id) ─────────────────────────────────────── */
async function sbUpdate(table, id, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: SB_HEADERS,
    body: JSON.stringify(data)
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `Update error: ${r.status}`);
  }
  return r.json();
}

/* ── DELETE (por id) ─────────────────────────────────────── */
async function sbDelete(table, id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: SB_HEADERS
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `Delete error: ${r.status}`);
  }
  return r.status === 204 ? null : r.json().catch(() => null);
}

/* ── RPC (llamar función SQL) ─────────────────────────────── */
async function sbRpc(fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(args)
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `RPC error: ${r.status}`);
  }
  return r.json();
}

/* ============================================================
   AUTH CLIENT (Fase 2.C Etapa 3) — Magic Link / OTP
   ------------------------------------------------------------
   Se inicializa SOLO si `window.supabase.createClient` está
   disponible (SDK oficial cargado desde CDN). Si no está, no
   se rompe nada y los módulos que solo usan REST siguen
   funcionando igual.
   ============================================================ */
(function initSupabaseAuthClient() {
  if (typeof window === 'undefined') return;
  if (window.sbAuth) return; // ya inicializado
  const sdk = window.supabase;
  if (!sdk || typeof sdk.createClient !== 'function') {
    // SDK no cargado en este HTML — OK, solo se usa REST aquí.
    return;
  }
  try {
    const client = sdk.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true, // captura el token del fragment cuando volvés del magic link
        storage: window.localStorage,
        storageKey: 'spcd_supabase_auth',
        flowType: 'implicit'
      }
    });
    window.sbAuth = client;
  } catch (e) {
    console.warn('[spcd-supabase] No se pudo inicializar sbAuth:', e);
  }
})();
