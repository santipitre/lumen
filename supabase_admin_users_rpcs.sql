-- ═══════════════════════════════════════════════════════════════════
--  SPCD · Fase 2.D.5 · RPCs para gestión de usuarios desde la UI
--  Fecha: 2026-05-16
--
--  Agrega columna email a usuarios + 4 RPCs SECURITY DEFINER que solo
--  pueden ejecutarse si auth_es_admin() = true. La UI del módulo admin
--  va a usar estas para listar/editar/crear/reset PIN de usuarios.
--
--  No invitar usuarios via UI todavía (Approach A): el admin crea el
--  row en usuarios y después manda el invite manualmente desde el
--  Dashboard de Supabase. Approach B (Edge Function) queda para después.
-- ═══════════════════════════════════════════════════════════════════


-- ─── 1. AGREGAR COLUMNA email ─────────────────────────────────
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email
  ON usuarios(LOWER(email)) WHERE email IS NOT NULL AND email != '';

COMMENT ON COLUMN usuarios.email IS
  'Email del usuario. Usado para vincular con auth.users al invitarlo via magic link.';


-- ─── 2. RPC admin_listar_usuarios() ───────────────────────────
-- Devuelve todos los usuarios. Solo admins pueden ejecutarla.
CREATE OR REPLACE FUNCTION admin_listar_usuarios()
RETURNS TABLE(
  id UUID,
  username TEXT,
  nombre TEXT,
  email TEXT,
  rol TEXT,
  permisos JSONB,
  activo BOOLEAN,
  debe_cambiar_pin BOOLEAN,
  auth_user_id UUID,
  auth_email TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT auth_es_admin() THEN
    RAISE EXCEPTION 'No autorizado: solo administradores pueden listar usuarios';
  END IF;

  RETURN QUERY
    SELECT u.id, u.username, u.nombre, u.email, u.rol, u.permisos,
           u.activo, u.debe_cambiar_pin, u.auth_user_id, au.email AS auth_email,
           u.created_at, u.updated_at
      FROM usuarios u
      LEFT JOIN auth.users au ON au.id = u.auth_user_id
     ORDER BY u.activo DESC, u.username;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_listar_usuarios() TO authenticated;


-- ─── 3. RPC admin_actualizar_usuario(...) ─────────────────────
-- Actualiza rol, permisos y estado. Solo admins.
CREATE OR REPLACE FUNCTION admin_actualizar_usuario(
  p_usuario_id UUID,
  p_nombre TEXT,
  p_email TEXT,
  p_rol TEXT,
  p_permisos JSONB,
  p_activo BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old RECORD;
  v_new RECORD;
BEGIN
  IF NOT auth_es_admin() THEN
    RAISE EXCEPTION 'No autorizado: solo administradores pueden modificar usuarios';
  END IF;

  IF p_rol NOT IN ('admin','consultor','mixto','solicitante','licencias') THEN
    RAISE EXCEPTION 'Rol inválido: %', p_rol;
  END IF;

  SELECT * INTO v_old FROM usuarios WHERE id = p_usuario_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado: %', p_usuario_id;
  END IF;

  -- No permitir auto-desactivar al último admin activo
  IF v_old.rol = 'admin' AND v_old.activo = true AND (p_activo = false OR p_rol != 'admin') THEN
    IF (SELECT count(*) FROM usuarios WHERE rol = 'admin' AND activo = true AND id != p_usuario_id) = 0 THEN
      RAISE EXCEPTION 'No se puede desactivar/degradar al último administrador activo';
    END IF;
  END IF;

  UPDATE usuarios
     SET nombre   = COALESCE(p_nombre, nombre),
         email    = NULLIF(p_email, ''),
         rol      = p_rol,
         permisos = COALESCE(p_permisos, permisos),
         activo   = COALESCE(p_activo, activo),
         updated_at = now()
   WHERE id = p_usuario_id
   RETURNING * INTO v_new;

  -- Log en audit_log (si existe la tabla)
  BEGIN
    INSERT INTO audit_log (usuario_id, accion, detalle)
    VALUES (auth_usuario_id(), 'admin_actualizar_usuario',
            jsonb_build_object('target_id', p_usuario_id, 'target_username', v_new.username,
                               'before', to_jsonb(v_old) - 'pin', 'after', to_jsonb(v_new) - 'pin'));
  EXCEPTION WHEN OTHERS THEN
    -- audit_log puede no existir o tener otra estructura, ignorar
    NULL;
  END;

  RETURN to_jsonb(v_new) - 'pin'; -- nunca devolver el PIN hasheado
END;
$$;

GRANT EXECUTE ON FUNCTION admin_actualizar_usuario(UUID, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO authenticated;


-- ─── 4. RPC admin_crear_usuario(...) ──────────────────────────
-- Crea un row nuevo en usuarios sin auth_user_id (admin invita después
-- manualmente desde Dashboard de Supabase con el email). PIN inicial: 1234.
CREATE OR REPLACE FUNCTION admin_crear_usuario(
  p_username TEXT,
  p_nombre TEXT,
  p_email TEXT,
  p_rol TEXT,
  p_permisos JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new RECORD;
  v_pin_default TEXT := '1234'; -- PIN temporal hasta que el user lo cambie
BEGIN
  IF NOT auth_es_admin() THEN
    RAISE EXCEPTION 'No autorizado: solo administradores pueden crear usuarios';
  END IF;

  IF p_username IS NULL OR length(trim(p_username)) = 0 THEN
    RAISE EXCEPTION 'username es obligatorio';
  END IF;
  IF p_rol NOT IN ('admin','consultor','mixto','solicitante','licencias') THEN
    RAISE EXCEPTION 'Rol inválido: %', p_rol;
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE UPPER(username) = UPPER(p_username)) THEN
    RAISE EXCEPTION 'Ya existe un usuario con username: %', UPPER(p_username);
  END IF;
  IF p_email IS NOT NULL AND p_email != '' AND
     EXISTS (SELECT 1 FROM usuarios WHERE LOWER(email) = LOWER(p_email)) THEN
    RAISE EXCEPTION 'Ya existe un usuario con email: %', LOWER(p_email);
  END IF;

  INSERT INTO usuarios(username, nombre, email, rol, permisos, pin, activo, debe_cambiar_pin)
  VALUES (UPPER(trim(p_username)), p_nombre, NULLIF(p_email, ''), p_rol,
          COALESCE(p_permisos, '{}'::jsonb), crypt(v_pin_default, gen_salt('bf')),
          true, true)
  RETURNING * INTO v_new;

  BEGIN
    INSERT INTO audit_log (usuario_id, accion, detalle)
    VALUES (auth_usuario_id(), 'admin_crear_usuario',
            jsonb_build_object('new_id', v_new.id, 'username', v_new.username, 'rol', v_new.rol));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN to_jsonb(v_new) - 'pin';
END;
$$;

GRANT EXECUTE ON FUNCTION admin_crear_usuario(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;


-- ─── 5. RPC admin_reset_pin(...) ──────────────────────────────
-- Resetea el PIN del usuario a 1234 + marca debe_cambiar_pin=true.
-- Útil para usuarios legacy que olvidaron su PIN.
CREATE OR REPLACE FUNCTION admin_reset_pin(p_usuario_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target RECORD;
BEGIN
  IF NOT auth_es_admin() THEN
    RAISE EXCEPTION 'No autorizado: solo administradores pueden resetear PINs';
  END IF;

  UPDATE usuarios
     SET pin = crypt('1234', gen_salt('bf')),
         debe_cambiar_pin = true,
         updated_at = now()
   WHERE id = p_usuario_id
  RETURNING id, username, nombre INTO v_target;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado: %', p_usuario_id;
  END IF;

  BEGIN
    INSERT INTO audit_log (usuario_id, accion, detalle)
    VALUES (auth_usuario_id(), 'admin_reset_pin',
            jsonb_build_object('target_id', v_target.id, 'target_username', v_target.username));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'usuario_id', v_target.id, 'username', v_target.username,
                            'mensaje', 'PIN reseteado a 1234. El usuario deberá cambiarlo al loguearse.');
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_pin(UUID) TO authenticated;


-- ─── 6. RPC admin_vincular_auth_id(...) ───────────────────────
-- Cuando el admin manda el invite desde Supabase Dashboard, el usuario
-- acepta y se crea su row en auth.users. Este RPC linkea ese auth_user_id
-- con el row de usuarios pre-existente (por email).
CREATE OR REPLACE FUNCTION admin_vincular_auth_id(p_usuario_id UUID, p_auth_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_target RECORD;
BEGIN
  IF NOT auth_es_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE usuarios SET auth_user_id = p_auth_user_id, updated_at = now()
   WHERE id = p_usuario_id
  RETURNING * INTO v_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  BEGIN
    INSERT INTO audit_log (usuario_id, accion, detalle)
    VALUES (auth_usuario_id(), 'admin_vincular_auth_id',
            jsonb_build_object('target_id', v_target.id, 'auth_user_id', p_auth_user_id));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN to_jsonb(v_target) - 'pin';
END;
$$;

GRANT EXECUTE ON FUNCTION admin_vincular_auth_id(UUID, UUID) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════
--  VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════════

-- 1. Confirmar columna email creada:
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name='usuarios' AND column_name='email';

-- 2. Confirmar las 5 RPCs creadas:
SELECT proname, prosecdef AS security_definer FROM pg_proc
 WHERE proname LIKE 'admin_%' ORDER BY proname;

-- 3. Test: admin_listar_usuarios() con JWT de SPITRELLA
SET request.jwt.claims = '{"sub":"b3264757-e339-4087-9682-6c50a3d71cf2"}';
SELECT count(*) AS total_usuarios FROM admin_listar_usuarios();
RESET request.jwt.claims;
