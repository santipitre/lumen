/* ============================================================
   spcd-google.js · Ingreso con Google (Lumen)
   ------------------------------------------------------------
   Va ANTES del SDK de Supabase: guarda la URL de vuelta antes
   de que el SDK la limpie, para poder leer el error si Google
   o Supabase rechazaron el ingreso.

   API (window.SpcdGoogle):
     entrar(pagina)        → ingreso con Google; vuelve a <pagina>
     vincular()            → suma Google a la cuenta ya logueada
                             (requiere "manual linking" activo)
     tieneGoogle()         → Promise<bool>: la sesión actual ya
                             tiene Google vinculado
     volvioDeGoogle()      → bool: esta carga viene de Google
     errorDeRetorno()      → texto en castellano o null
     navegadorBloqueado()  → bool: WebView de WhatsApp/Instagram/
                             Facebook, donde Google no deja entrar
     montarEnBarra()       → botón "Vincular Google" en la barra
                             de sesión (#spcd-sb), si corresponde

   Reglas de seguridad (del lado de Supabase, no de este archivo):
     - "Allow new users to sign up" APAGADO: una cuenta de Google
       que no esté vinculada a un usuario existente es rechazada.
     - usuario_por_auth_id filtra por auth.uid() y activo=true.
   ============================================================ */
(function () {
  'use strict';
  if (window.SpcdGoogle) return;

  var URL_ENTRADA = String(location.href);
  var MARCA = 'spcd_google_pendiente';   /* sessionStorage: 'entrar' | 'vincular' */

  function leerParams() {
    var out = {};
    var partes = [];
    var i = URL_ENTRADA.indexOf('?'), j = URL_ENTRADA.indexOf('#');
    if (i >= 0) partes.push(URL_ENTRADA.slice(i + 1, j > i ? j : undefined));
    if (j >= 0) partes.push(URL_ENTRADA.slice(j + 1));
    partes.forEach(function (p) {
      p.split('&').forEach(function (kv) {
        if (!kv) return;
        var k = kv.split('=')[0], v = kv.slice(k.length + 1);
        try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
      });
    });
    return out;
  }
  var PARAMS = leerParams();

  function marca(v) {
    try {
      if (v === undefined) return sessionStorage.getItem(MARCA);
      if (v === null) sessionStorage.removeItem(MARCA); else sessionStorage.setItem(MARCA, v);
    } catch (e) { return null; }
  }
  var MARCA_INICIAL = marca();
  marca(null);

  function navegadorBloqueado() {
    var ua = navigator.userAgent || '';
    return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|; wv\)|MicroMessenger|TikTok/i.test(ua);
  }

  function base() {
    return location.origin + location.pathname.replace(/[^/]*$/, '');
  }

  function traducir(codigo, desc) {
    var t = (codigo || '') + ' ' + (desc || '');
    if (/signup|sign.?ups? not allowed|user_not_found/i.test(t))
      return 'Esa cuenta de Google no está habilitada en Lumen. Entrá con tu usuario y PIN y vinculala desde la barra de abajo.';
    if (/identity_already_exists|already linked|already registered/i.test(t))
      return 'Esa cuenta de Google ya está vinculada a otro usuario de Lumen.';
    if (/manual_linking_disabled|manual linking/i.test(t))
      return 'La vinculación con Google todavía no está activada. Avisá al administrador.';
    if (/access_denied/i.test(t))
      return 'Cancelaste el ingreso con Google.';
    if (/provider is not enabled|unsupported provider/i.test(t))
      return 'El ingreso con Google todavía no está activado. Avisá al administrador.';
    return 'No se pudo entrar con Google' + (desc ? ': ' + desc : '.');
  }

  function errorDeRetorno() {
    if (!PARAMS.error && !PARAMS.error_code && !PARAMS.error_description) return null;
    return traducir(PARAMS.error_code || PARAMS.error, PARAMS.error_description);
  }

  function volvioDeGoogle() {
    return !!MARCA_INICIAL || !!PARAMS.access_token || !!errorDeRetorno();
  }

  function cliente() {
    if (!window.sbAuth || !window.sbAuth.auth) throw new Error('No cargó el cliente de Supabase. Recargá la página.');
    return window.sbAuth.auth;
  }

  async function entrar(pagina) {
    if (navegadorBloqueado())
      throw new Error('Google no deja entrar desde el navegador de WhatsApp o Instagram. Abrí este link en Chrome o Safari.');
    marca('entrar');
    var r = await cliente().signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: base() + (pagina || 'app.html'),
        queryParams: { prompt: 'select_account' }
      }
    });
    if (r && r.error) { marca(null); throw new Error(traducir(r.error.code, r.error.message)); }
  }

  async function vincular() {
    if (navegadorBloqueado())
      throw new Error('Google no deja vincular desde el navegador de WhatsApp o Instagram. Abrí Lumen en Chrome o Safari.');
    marca('vincular');
    var r = await cliente().linkIdentity({
      provider: 'google',
      options: {
        redirectTo: location.origin + location.pathname,
        queryParams: { prompt: 'select_account' }
      }
    });
    if (r && r.error) { marca(null); throw new Error(traducir(r.error.code, r.error.message)); }
  }

  async function tieneGoogle() {
    try {
      var s = await cliente().getSession();
      if (!s || !s.data || !s.data.session) return null;          /* sin sesión de Auth: no aplica */
      var u = await cliente().getUser();
      var ids = (u && u.data && u.data.user && u.data.user.identities) || [];
      return ids.some(function (i) { return i.provider === 'google'; });
    } catch (e) { return null; }
  }

  /* ---------- botón "Vincular Google" en la barra de sesión ---------- */
  var enCurso = false;
  function montarEnBarra() {
    if (enCurso) return;
    var barra0 = document.getElementById('spcd-sb');
    if (!barra0 || barra0.querySelector('.sb-google')) return;
    enCurso = true;
    var poner = async function () {
      var tiene = await tieneGoogle();
      enCurso = false;
      var barra = document.getElementById('spcd-sb');
      if (!barra || barra.querySelector('.sb-google')) return;
      if (tiene !== false) return;   /* ya vinculado, o sin sesión de Auth */
      var salir = barra.querySelector('.sb-salir');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sb-google';
      b.textContent = 'Vincular Google';
      b.title = 'Sumá tu cuenta de Google para entrar sin PIN la próxima vez';
      b.style.color = '#22DBAE';
      b.addEventListener('click', async function () {
        b.disabled = true; b.textContent = 'Abriendo Google…';
        try { await vincular(); }
        catch (e) { b.disabled = false; b.textContent = 'Vincular Google'; avisar(e.message, true); }
      });
      barra.insertBefore(b, salir || null);
    };
    poner();
  }

  function avisar(texto, esError) {
    var d = document.createElement('div');
    d.setAttribute('role', 'alert');
    d.textContent = texto;
    d.style.cssText = 'position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,520px);' +
      'padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);' +
      (esError ? 'background:#3B0D0D;color:#FECACA;border:1px solid #F87171' : 'background:#062B22;color:#A7F3D0;border:1px solid #22DBAE');
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 7000);
  }

  /* Resultado de una vinculación (vuelve a la misma página) */
  if (MARCA_INICIAL === 'vincular') {
    var fin = function () {
      var err = errorDeRetorno();
      if (err) avisar(err, true);
      else tieneGoogle().then(function (t) {
        if (t) avisar('Listo: tu cuenta de Google quedó vinculada. La próxima vez podés entrar con «Entrar con Google».', false);
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fin); else setTimeout(fin, 0);
  }

  window.SpcdGoogle = {
    entrar: entrar,
    vincular: vincular,
    tieneGoogle: tieneGoogle,
    volvioDeGoogle: volvioDeGoogle,
    venidaPara: function () { return MARCA_INICIAL; },
    errorDeRetorno: errorDeRetorno,
    navegadorBloqueado: navegadorBloqueado,
    montarEnBarra: montarEnBarra,
    avisar: avisar
  };
})();
