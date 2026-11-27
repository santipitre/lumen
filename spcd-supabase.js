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
     SDK oficial de Supabase (cargado desde vendor/). Se inicializa
     bajo `window.sbAuth` solo si el SDK ya está disponible.

         <script src="vendor/supabase.js"></script>
         <script src="spcd-supabase.js"></script>

   Cómo incluir:
       <script src="spcd-supabase.js"></script>

   Nota de seguridad: SUPABASE_KEY es la "anon key" (pública por
   diseño). La seguridad real debe venir de las Row Level Security
   policies + funciones SECURITY DEFINER en el backend.
   ============================================================ */

const SUPABASE_URL = 'https://erjdncsnomwymjiaslpx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5qeVvqQO26a70lAj8dMXhw_fL_Cdu-2';

// SB_HEADERS estatico (compat): se sigue usando como FALLBACK si alguien lo importa directo.
const SB_HEADERS = {
  'apikey':        SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation'
};

/*  Headers dinamicos (Fase 2.D.2): si hay sesion Supabase Auth (post login OTP),
    usa el access_token del usuario en vez de la anon key. Eso habilita que las RLS
    policies basadas en auth.uid() funcionen contra el usuario real.
    Sigue mandando 'apikey' con la anon key porque Supabase la requiere para identificar el proyecto. */
async function getSBHeaders() {
  let token = SUPABASE_KEY;
  try {
    if (window.sbAuth && window.sbAuth.auth) {
      const { data } = await window.sbAuth.auth.getSession();
      if (data && data.session && data.session.access_token) {
        token = data.session.access_token;
      }
    }
  } catch (e) { /* sin sesion: fallback a anon */ }
  return {
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + token,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation'
  };
}

/* ── SELECT ──────────────────────────────────────────────── */
async function sbQuery(table, params = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: await getSBHeaders()
  });
  if (!r.ok) throw new Error(`DB error: ${r.status}`);
  return r.json();
}

/* ── INSERT ──────────────────────────────────────────────── */
async function sbInsert(table, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: await getSBHeaders(),
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
    headers: await getSBHeaders(),
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
    headers: await getSBHeaders()
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
    headers: await getSBHeaders(),
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


/* ============================================================
   Registro de errores del navegador (M7)
   ------------------------------------------------------------
   Manda a la RPC `log_error_cliente` los errores de JavaScript y
   las promesas sin atrapar. Sólo con sesión iniciada (la RPC no
   admite anon). Nunca rompe la página: todo va dentro de try/catch.
   Antes de enviar saca de URLs los parámetros (?...) y el fragmento
   (#...), y tapa tokens tipo JWT. El servidor además tapa mails y
   números largos, y limita la cantidad por usuario.
   ============================================================ */
(function initClientErrorLogger() {
  if (typeof window === 'undefined' || window.__lumenErrLog) return;
  window.__lumenErrLog = true;

  var MAX_POR_CARGA = 10;   // tope de envíos por carga de página
  var ESPERA_MS = 2000;     // separación mínima entre envíos
  var vistos = {};
  var enviados = 0;
  var ultimoEnvio = 0;

  function limpiar(s, n) {
    if (s === undefined || s === null) return '';
    s = String(s);
    s = s.replace(/https?:\/\/[^\s)'"]+/g, function (u) { return u.split(/[?#]/)[0]; });
    s = s.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]');
    return s.slice(0, n);
  }

  function ignorable(msg, archivo) {
    if (!msg) return true;
    if (/^Script error\.?$/i.test(msg)) return true;            // error de otro origen, sin datos útiles
    if (/ResizeObserver loop/i.test(msg)) return true;          // ruido conocido del navegador
    if (archivo && /^(chrome|moz|safari)-extension:/i.test(archivo)) return true;
    return false;
  }

  function enviar(origen, mensaje, detalle, archivo) {
    try {
      if (!window.sbAuth || !window.sbAuth.rpc || !window.sbAuth.auth) return;
      if (enviados >= MAX_POR_CARGA) return;
      var msg = limpiar(mensaje, 300);
      if (ignorable(msg, archivo)) return;
      var clave = origen + '|' + msg;
      if (vistos[clave]) return;
      var ahora = Date.now();
      if (ahora - ultimoEnvio < ESPERA_MS) return;
      vistos[clave] = 1;
      enviados++;
      ultimoEnvio = ahora;

      var pagina = (location.pathname.split('/').pop() || 'index.html');
      var meta = document.querySelector('meta[name="lumen-ver"]');
      var version = meta ? meta.getAttribute('content') : '';
      var args = {
        p_pagina: pagina,
        p_version: version || '',
        p_origen: origen,
        p_mensaje: msg,
        p_detalle: limpiar(detalle, 2000),
        p_ua: limpiar(navigator.userAgent, 200)
      };

      window.sbAuth.auth.getSession().then(function (r) {
        if (!r || !r.data || !r.data.session) return null;   // sin sesión no se manda (anon no puede)
        return window.sbAuth.rpc('log_error_cliente', args);
      }).catch(function () { /* nunca propagar */ });
    } catch (e) { /* nunca romper la página */ }
  }

  window.addEventListener('error', function (ev) {
    try {
      var det = (ev && ev.error && ev.error.stack) ? ev.error.stack
        : ((ev && ev.filename) ? (ev.filename + ':' + ev.lineno + ':' + ev.colno) : '');
      enviar('error', ev && ev.message, det, ev && ev.filename);
    } catch (e) { /* nada */ }
  });

  window.addEventListener('unhandledrejection', function (ev) {
    try {
      var r = ev && ev.reason;
      var msg = (r && r.message) ? r.message : (typeof r === 'string' ? r : 'Promesa rechazada');
      enviar('promesa', msg, (r && r.stack) ? r.stack : '', '');
    } catch (e) { /* nada */ }
  });

  // Uso manual desde cualquier módulo: lumenLogError('mensaje', 'detalle opcional')
  window.lumenLogError = function (mensaje, detalle) { enviar('manual', mensaje, detalle || '', ''); };
})();
