/* ============================================================
   spcd-google.js · Ingreso con Google y Microsoft (Lumen)
   ------------------------------------------------------------
   (El nombre del archivo quedó de la v1; ahora maneja los dos.)
   Va ANTES del SDK de Supabase: guarda la URL de vuelta antes
   de que el SDK la limpie, para poder leer el error si el
   proveedor o Supabase rechazaron el ingreso.

   API (window.SpcdGoogle):
     entrar(pagina, prov)  → ingreso con 'google' (default) o 'azure'
     vincular(prov)        → suma el proveedor a la cuenta logueada
                             (requiere "manual linking" activo)
     tiene(prov)           → Promise<bool|null>
     tieneGoogle()         → compat v1
     volvioDeGoogle()      → bool: esta carga viene de un proveedor
     venidaPara()          → 'entrar' | 'vincular' | null
     errorDeRetorno()      → texto en castellano o null
     navegadorBloqueado()  → WebView de WhatsApp/Instagram/Facebook
     montarEnBarra()       → botones «Vincular …» en la barra de
                             sesión (#spcd-sb), si corresponde

   Seguridad (del lado de Supabase, no de este archivo):
     - "Allow new users to sign up" APAGADO: una cuenta externa que
       no esté vinculada a un usuario existente es rechazada.
     - Microsoft: limitado al tenant de FUESMEN (Azure Tenant URL).
     - usuario_por_auth_id filtra por auth.uid() y activo=true.
   ============================================================ */
(function () {
  'use strict';
  if (window.SpcdGoogle) return;

  var PROV = {
    google: { nombre: 'Google', opts: { queryParams: { prompt: 'select_account' } } },
    azure:  { nombre: 'Microsoft', opts: { scopes: 'email', queryParams: { prompt: 'select_account' } } }
  };

  var URL_ENTRADA = String(location.href);
  var MARCA = 'spcd_google_pendiente';   /* sessionStorage: 'entrar|prov' | 'vincular|prov' */

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
  var M0 = String(marca() || '');
  marca(null);
  var MARCA_INICIAL = M0 ? M0.split('|')[0] : null;           /* compat v1: 'entrar' sin proveedor */
  var PROV_INICIAL = (M0.split('|')[1]) || 'google';

  function nombre(p) { return (PROV[p] || PROV.google).nombre; }

  function navegadorBloqueado() {
    var ua = navigator.userAgent || '';
    return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|; wv\)|MicroMessenger|TikTok/i.test(ua);
  }

  function base() {
    return location.origin + location.pathname.replace(/[^/]*$/, '');
  }

  function traducir(codigo, desc, p) {
    var n = nombre(p || PROV_INICIAL);
    var t = (codigo || '') + ' ' + (desc || '');
    if (/signup|sign.?ups? not allowed|user_not_found/i.test(t))
      return 'Esa cuenta de ' + n + ' no está habilitada en Lumen. Entrá con tu usuario y PIN y vinculala desde la barra de abajo.';
    if (/identity_already_exists|already linked|already registered/i.test(t))
      return 'Esa cuenta de ' + n + ' ya está vinculada a otro usuario de Lumen.';
    if (/manual_linking_disabled|manual linking/i.test(t))
      return 'La vinculación con ' + n + ' todavía no está activada. Avisá al administrador.';
    if (/access_denied|cancel/i.test(t))
      return 'Se canceló el ingreso con ' + n + '.';
    if (/provider is not enabled|unsupported provider/i.test(t))
      return 'El ingreso con ' + n + ' todavía no está activado. Avisá al administrador.';
    if (/email/i.test(t) && /missing|not.*(found|provided)|unverified/i.test(t))
      return n + ' no entregó un correo verificado para esta cuenta. Avisá al administrador.';
    return 'No se pudo entrar con ' + n + (desc ? ': ' + desc : '.');
  }

  function errorDeRetorno() {
    if (!PARAMS.error && !PARAMS.error_code && !PARAMS.error_description) return null;
    return traducir(PARAMS.error_code || PARAMS.error, PARAMS.error_description, PROV_INICIAL);
  }

  function volvioDeGoogle() {
    return !!MARCA_INICIAL || !!PARAMS.access_token || !!errorDeRetorno();
  }

  function cliente() {
    if (!window.sbAuth || !window.sbAuth.auth) throw new Error('No cargó el cliente de Supabase. Recargá la página.');
    return window.sbAuth.auth;
  }

  function opciones(p, redirectTo) {
    var base0 = (PROV[p] || PROV.google).opts, o = { redirectTo: redirectTo };
    if (base0.scopes) o.scopes = base0.scopes;
    if (base0.queryParams) o.queryParams = base0.queryParams;
    return o;
  }

  async function entrar(pagina, p) {
    p = PROV[p] ? p : 'google';
    if (navegadorBloqueado())
      throw new Error(nombre(p) + ' no deja entrar desde el navegador de WhatsApp o Instagram. Abrí este link en Chrome o Safari.');
    marca('entrar|' + p);
    var r = await cliente().signInWithOAuth({ provider: p, options: opciones(p, base() + (pagina || 'app.html')) });
    if (r && r.error) { marca(null); throw new Error(traducir(r.error.code, r.error.message, p)); }
  }

  async function vincular(p) {
    p = PROV[p] ? p : 'google';
    if (navegadorBloqueado())
      throw new Error(nombre(p) + ' no deja vincular desde el navegador de WhatsApp o Instagram. Abrí Lumen en Chrome o Safari.');
    marca('vincular|' + p);
    var r = await cliente().linkIdentity({ provider: p, options: opciones(p, location.origin + location.pathname) });
    if (r && r.error) { marca(null); throw new Error(traducir(r.error.code, r.error.message, p)); }
  }

  async function proveedores() {
    try {
      var s = await cliente().getSession();
      if (!s || !s.data || !s.data.session) return null;          /* sin sesión de Auth: no aplica */
      var u = await cliente().getUser();
      var ids = (u && u.data && u.data.user && u.data.user.identities) || [];
      return ids.map(function (i) { return i.provider; });
    } catch (e) { return null; }
  }
  async function tiene(p) {
    var l = await proveedores();
    return l === null ? null : l.indexOf(p) >= 0;
  }

  /* ---------- botones «Vincular …» en la barra de sesión ---------- */
  var enCurso = false;
  function montarEnBarra() {
    if (enCurso) return;
    var barra0 = document.getElementById('spcd-sb');
    if (!barra0 || barra0.getAttribute('data-vinc')) return;
    enCurso = true;
    (async function () {
      var l = await proveedores();
      enCurso = false;
      var barra = document.getElementById('spcd-sb');
      if (!barra || barra.getAttribute('data-vinc')) return;
      if (l === null) return;                                     /* sin sesión de Auth */
      barra.setAttribute('data-vinc', '1');
      var salir = barra.querySelector('.sb-salir');
      ['azure'].forEach(function (p) {
        if (l.indexOf(p) >= 0) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sb-vinc sb-vinc-' + p + (p === 'google' ? ' sb-google' : '');
        b.textContent = 'Vincular ' + nombre(p);
        b.title = 'Sumá tu cuenta de ' + nombre(p) + ' para entrar sin PIN la próxima vez';
        b.style.color = '#22DBAE';
        b.addEventListener('click', async function () {
          b.disabled = true; b.textContent = 'Abriendo ' + nombre(p) + '…';
          try { await vincular(p); }
          catch (e) { b.disabled = false; b.textContent = 'Vincular ' + nombre(p); avisar(e.message, true); }
        });
        barra.insertBefore(b, salir || null);
      });
    })();
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
      else tiene(PROV_INICIAL).then(function (t) {
        if (t) avisar('Listo: tu cuenta de ' + nombre(PROV_INICIAL) + ' quedó vinculada. La próxima vez podés entrar con «Entrar con ' + nombre(PROV_INICIAL) + '».', false);
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fin); else setTimeout(fin, 0);
  }

  window.SpcdGoogle = {
    entrar: entrar,
    vincular: vincular,
    tiene: tiene,
    tieneGoogle: function () { return tiene('google'); },
    volvioDeGoogle: volvioDeGoogle,
    venidaPara: function () { return MARCA_INICIAL; },
    proveedorDeRetorno: function () { return PROV_INICIAL; },
    errorDeRetorno: errorDeRetorno,
    navegadorBloqueado: navegadorBloqueado,
    montarEnBarra: montarEnBarra,
    avisar: avisar
  };
})();
