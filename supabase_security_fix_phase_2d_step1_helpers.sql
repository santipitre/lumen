-- ═══════════════════════════════════════════════════════════════════
--  SPCD · Security Hardening · Fase 2.D · Etapa 1 · HELPERS para RLS
--  Fecha: 2026-05-16
--
--  CONTEXTO
--  Fase 2.C migró el login de PIN bcrypt a Supabase Auth (magic link).
--  Esta etapa prepara las funciones que las policies RLS van a usar
--  para resolver "quién es el usuario autenticado" sin romper nada.
--
--  ESTE SCRIPT NO MODIFICA NINGUNA POLICY EXISTENTE.
--  Solo agrega funciones SECURITY DEFINER. Las policies actuales
--  (anon FOR ALL USING true) siguen funcionando exactamente igual.
--
--  Una vez probadas estas funciones (con SPITRELLA logueado), la
--  etapa D.2 modifica el cliente JS para que pase el JWT, y las
--  etapas D.3/D.4 agregan/reemplazan policies usando estas funciones.
-- ═══════════════════════════════════════════════════════════════════


-- ─── auth_usuario_id() ─────────────────────────────────────
-- Devuelve el id (UUID) del row en `usuarios` que está vinculado
-- al user autenticado actual. NULL si no hay sesión o el user
-- no está vinculado (auth_user_id IS NULL).
CREATE OR REPLACE FUNCTION auth_usuario_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
    FROM usuarios u
   WHERE u.auth_user_id = auth.uid()
     AND u.activo = true
   LIMIT 1;
$$;

COMMENT ON FUNCTION auth_usuario_id() IS
  'Devuelve usuarios.id del user autenticado actual (vinculado por auth_user_id = auth.uid()). NULL si no hay sesión.';

GRANT EXECUTE ON FUNCTION auth_usuario_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_usuario_id() TO anon;


-- ─── auth_usuario_rol() ────────────────────────────────────
-- Devuelve el rol del user autenticado ('admin', 'consultor',
-- 'mixto', 'solicitante', 'licencias', etc.). NULL si no hay sesión.
CREATE OR REPLACE FUNCTION auth_usuario_rol()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.rol
    FROM usuarios u
   WHERE u.auth_user_id = auth.uid()
     AND u.activo = true
   LIMIT 1;
$$;

COMMENT ON FUNCTION auth_usuario_rol() IS
  'Devuelve usuarios.rol del user autenticado actual. NULL si no hay sesión.';

GRANT EXECUTE ON FUNCTION auth_usuario_rol() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_usuario_rol() TO anon;


-- ─── auth_usuario_permisos() ───────────────────────────────
-- Devuelve el JSONB con permisos { sedes: [...], modulos: {...} }
-- del user autenticado. Útil para policies más granulares que
-- chequean acceso a sede/módulo específico.
CREATE OR REPLACE FUNCTION auth_usuario_permisos()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.permisos
    FROM usuarios u
   WHERE u.auth_user_id = auth.uid()
     AND u.activo = true
   LIMIT 1;
$$;

COMMENT ON FUNCTION auth_usuario_permisos() IS
  'Devuelve usuarios.permisos (JSONB) del user autenticado. NULL si no hay sesión.';

GRANT EXECUTE ON FUNCTION auth_usuario_permisos() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_usuario_permisos() TO anon;


-- ─── auth_es_admin() ────────────────────────────────────────
-- Devuelve true si el user autenticado tiene rol='admin'.
-- false si tiene otro rol o no hay sesión.
CREATE OR REPLACE FUNCTION auth_es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM usuarios u
     WHERE u.auth_user_id = auth.uid()
       AND u.activo = true
       AND u.rol = 'admin'
  );
$$;

COMMENT ON FUNCTION auth_es_admin() IS
  'Devuelve true si el user autenticado es admin. False en cualquier otro caso (incluyendo sin sesión).';

GRANT EXECUTE ON FUNCTION auth_es_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_es_admin() TO anon;


-- ─── auth_puede_modulo(modulo, niveles) ───────────────────
-- Devuelve true si el user autenticado tiene acceso al módulo
-- especificado en uno de los niveles aceptados.
--
-- Ejemplos:
--   auth_puede_modulo('operativo', ARRAY['admin','edit','view','pedidos'])
--     -> true para cualquier user que tenga ALGÚN acceso a operativo
--   auth_puede_modulo('admin', ARRAY['edit'])
--     -> true solo para admins de ese módulo
--   auth_puede_modulo('medico', ARRAY['edit','admin'])
--     -> true para users con acceso de escritura
CREATE OR REPLACE FUNCTION auth_puede_modulo(p_modulo TEXT, p_niveles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM usuarios u
     WHERE u.auth_user_id = auth.uid()
       AND u.activo = true
       AND (u.permisos -> 'modulos' ->> p_modulo) = ANY(p_niveles)
  );
$$;

COMMENT ON FUNCTION auth_puede_modulo(TEXT, TEXT[]) IS
  'Chequea si el user autenticado tiene acceso al módulo en alguno de los niveles dados.';

GRANT EXECUTE ON FUNCTION auth_puede_modulo(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION auth_puede_modulo(TEXT, TEXT[]) TO anon;


-- ═══════════════════════════════════════════════════════════════════
--  VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════════

-- 1. Confirmar que las 5 funciones existen:
SELECT proname, prosecdef AS security_definer
  FROM pg_proc
 WHERE proname IN ('auth_usuario_id','auth_usuario_rol','auth_usuario_permisos','auth_es_admin','auth_puede_modulo')
 ORDER BY proname;

-- 2. Test con la sesión actual del SQL editor (anon, sin auth):
--    Todas deberían devolver NULL o false porque no hay user autenticado.
SELECT
  auth_usuario_id()         AS user_id_sin_sesion,
  auth_usuario_rol()        AS rol_sin_sesion,
  auth_es_admin()           AS es_admin_sin_sesion,
  auth_puede_modulo('operativo', ARRAY['admin','edit','view','pedidos']) AS puede_op_sin_sesion;

-- 3. Probar simulando que el JWT es el de SPITRELLA.
--    En el dashboard de Supabase NO hay forma directa de impersonar un user
--    desde el SQL editor (la session ahí es la del owner del proyecto).
--    El test real se hace desde el browser después de loguearse con OTP:
--      const { data } = await window.sbAuth.rpc('auth_usuario_id');
--    Debería devolver el UUID de SPITRELLA en usuarios.

-- 4. Para validar el setup desde el server con un user específico, usar:
--    SET request.jwt.claims = '{"sub":"b3264757-e339-4087-9682-6c50a3d71cf2"}';
--    SELECT auth_usuario_id();  -- debería devolver el UUID de SPITRELLA en usuarios
--    SELECT auth_usuario_rol(); -- debería devolver 'admin'
--    SELECT auth_es_admin();    -- debería devolver true
--    RESET request.jwt.claims;
