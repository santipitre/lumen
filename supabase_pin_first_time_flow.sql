-- ═══════════════════════════════════════════════════════════════════
--  FASE 2.E · OTP solo PRIMERA VEZ → después PIN siempre
--  ------------------------------------------------------------------
--  Fecha: 2026-05-19
--  Issue: spitrella (y cualquier usuario migrado) recibía magic link
--         CADA login. El UX deseado es:
--           · Primera vez (post-migración): magic link al email
--             + obligar a setear PIN propio de 6 dígitos.
--           · Siguientes logins: usuario + PIN directo.
--             (PIN se valida via Supabase signInWithPassword para
--             mantener la sesión auth + RLS funcionando).
--
--  CAMBIOS NO DESTRUCTIVOS:
--    1. Nueva columna usuarios.pin_set_at TIMESTAMPTZ
--    2. email_para_otp() ahora solo devuelve email si pin_set_at IS NULL
--    3. esta_migrado() ahora solo devuelve true si pin_set_at IS NULL
--    4. NUEVA email_para_login() devuelve email si pin_set_at IS NOT NULL
--       (para signInWithPassword después de primera vez)
--    5. NUEVA setear_pin_inicial(p_pin) marca pin_set_at + actualiza
--       usuarios.pin + limpia debe_cambiar_pin
--    6. usuario_por_auth_id() recreada para incluir pin_set_at
--       en el row que devuelve al cliente.
-- ═══════════════════════════════════════════════════════════════════


-- ─── 1. NUEVA COLUMNA ────────────────────────────────────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ;

COMMENT ON COLUMN usuarios.pin_set_at IS
  'Timestamp del momento en que el usuario seteó su PIN propio post-OTP. NULL = aún no completó primer login. NOT NULL = login con PIN directo a partir de ahora.';


-- ─── 2. ACTUALIZAR email_para_otp ────────────────────────────────────
-- Devuelve email SOLO si el usuario está migrado (auth_user_id NOT NULL)
-- Y todavía NO seteó su PIN propio (pin_set_at IS NULL).
-- Una vez que setea el PIN, esta función devuelve NULL y el cliente
-- ya no dispara magic link.
CREATE OR REPLACE FUNCTION email_para_otp(p_username TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT (SELECT email FROM auth.users WHERE id = u.auth_user_id)
    FROM usuarios u
   WHERE UPPER(u.username) = UPPER(p_username)
     AND u.activo = true
     AND u.auth_user_id IS NOT NULL
     AND u.pin_set_at IS NULL
   LIMIT 1;
$$;

COMMENT ON FUNCTION email_para_otp(TEXT) IS
  'Devuelve email de auth.users SOLO si usuario está migrado Y no completó setup inicial. NULL en cualquier otro caso.';

GRANT EXECUTE ON FUNCTION email_para_otp(TEXT) TO anon;


-- ─── 3. ACTUALIZAR esta_migrado ──────────────────────────────────────
-- Mismo criterio: true SOLO si necesita pasar por OTP (primera vez).
CREATE OR REPLACE FUNCTION esta_migrado(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS(
    SELECT 1 FROM usuarios u
     WHERE UPPER(u.username) = UPPER(p_username)
       AND u.activo = true
       AND u.auth_user_id IS NOT NULL
       AND u.pin_set_at IS NULL
  );
$$;

COMMENT ON FUNCTION esta_migrado(TEXT) IS
  'Devuelve true si el usuario aún debe pasar por OTP (primera vez). false si ya tiene PIN propio O si nunca se migró.';

GRANT EXECUTE ON FUNCTION esta_migrado(TEXT) TO anon;


-- ─── 4. NUEVA · email_para_login(username) ───────────────────────────
-- Para el flujo PIN normal (post-primera-vez). El cliente la usa para
-- obtener el email vinculado y llamar a signInWithPassword(email, pin).
-- No expone email arbitrariamente: solo lo devuelve si el usuario ya
-- pasó por OTP y seteó PIN (pin_set_at IS NOT NULL).
CREATE OR REPLACE FUNCTION email_para_login(p_username TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT (SELECT email FROM auth.users WHERE id = u.auth_user_id)
    FROM usuarios u
   WHERE UPPER(u.username) = UPPER(p_username)
     AND u.activo = true
     AND u.auth_user_id IS NOT NULL
     AND u.pin_set_at IS NOT NULL
   LIMIT 1;
$$;

COMMENT ON FUNCTION email_para_login(TEXT) IS
  'Devuelve email de auth.users si el usuario ya completó setup inicial (pin_set_at NOT NULL). Usado por el cliente para signInWithPassword(email, pin).';

GRANT EXECUTE ON FUNCTION email_para_login(TEXT) TO anon;


-- ─── 5. NUEVA · setear_pin_inicial(p_pin) ────────────────────────────
-- Se llama DESPUÉS del magic link OTP (sesión auth activa).
-- 1) Actualiza usuarios.pin con bcrypt del nuevo PIN
-- 2) Marca pin_set_at = now()
-- 3) Limpia debe_cambiar_pin
--
-- NOTA: el cliente DEBE ADEMÁS llamar a window.sbAuth.auth.updateUser({password: pin})
-- para setear el mismo PIN como password de Supabase Auth. Esto permite
-- que los próximos logins usen signInWithPassword(email, pin) y mantengan
-- la sesión auth viva (las RLS de Fase 2.D requieren authenticated).
CREATE OR REPLACE FUNCTION setear_pin_inicial(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_auth_id UUID;
BEGIN
  v_auth_id := auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa. Necesitás logearte vía OTP primero.';
  END IF;

  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'El PIN debe tener entre 4 y 6 dígitos numéricos.';
  END IF;

  UPDATE usuarios
     SET pin               = crypt(p_pin, gen_salt('bf')),
         pin_set_at        = COALESCE(pin_set_at, now()),
         debe_cambiar_pin  = false
   WHERE auth_user_id = v_auth_id
     AND activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró usuario activo vinculado a esta sesión.';
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION setear_pin_inicial(TEXT) IS
  'Setea PIN propio del usuario post-OTP. Requiere sesión auth activa (auth.uid() válido). Marca pin_set_at = now() para que próximos logins usen PIN directo.';

GRANT EXECUTE ON FUNCTION setear_pin_inicial(TEXT) TO authenticated;


-- ─── 6. RECREAR usuario_por_auth_id PARA INCLUIR pin_set_at ──────────
-- Esta función ya existía desde Fase 2.C Etapa 1. La recreamos para que
-- el row que devuelve al cliente incluya pin_set_at (lo necesita para
-- decidir si mostrar el modal "Crear tu PIN" post-OTP).
CREATE OR REPLACE FUNCTION usuario_por_auth_id(p_auth_user_id UUID)
RETURNS TABLE (
  id                INT,
  username          TEXT,
  nombre            TEXT,
  rol               TEXT,
  permisos          JSONB,
  debe_cambiar_pin  BOOLEAN,
  activo            BOOLEAN,
  auth_user_id      UUID,
  pin_set_at        TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.username, u.nombre, u.rol, u.permisos,
         u.debe_cambiar_pin, u.activo, u.auth_user_id, u.pin_set_at
    FROM usuarios u
   WHERE u.auth_user_id = p_auth_user_id
     AND u.activo = true
   LIMIT 1;
$$;

COMMENT ON FUNCTION usuario_por_auth_id(UUID) IS
  'Devuelve el row de usuarios vinculado a este auth_user_id (sesión activa). Incluye pin_set_at para que el cliente decida si forzar creación de PIN post-OTP.';

GRANT EXECUTE ON FUNCTION usuario_por_auth_id(UUID) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════
--  VERIFICACIÓN (correr DESPUÉS del DEPLOY del script)
-- ═══════════════════════════════════════════════════════════════════

-- 1. La columna existe y los usuarios migrados arrancan con pin_set_at = NULL
SELECT username, auth_user_id IS NOT NULL AS migrado, pin_set_at
  FROM usuarios
 WHERE activo = true AND auth_user_id IS NOT NULL
 ORDER BY username;

-- 2. SPITRELLA debería estar marcado como "necesita OTP" (primera vez post-fix)
SELECT email_para_otp('SPITRELLA') AS email_otp_spitrella;
-- Esperado: el email de spitrella

SELECT email_para_login('SPITRELLA') AS email_pin_spitrella;
-- Esperado: NULL (todavía no seteó PIN propio)

SELECT esta_migrado('SPITRELLA') AS spitrella_necesita_otp;
-- Esperado: true

-- 3. Después de que spitrella complete el flujo (OTP → setear PIN):
-- Los próximos selects deberían dar:
--   email_para_otp('SPITRELLA')   → NULL
--   email_para_login('SPITRELLA') → el email
--   esta_migrado('SPITRELLA')     → false
