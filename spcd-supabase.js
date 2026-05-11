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
