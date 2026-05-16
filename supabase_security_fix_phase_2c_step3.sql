-- ═══════════════════════════════════════════════════════════════════
--  SPCD · Security Hardening · Fase 2.C · Etapa 3 · HELPERS para login dual
--  Fecha: 2026-05-15
--
--  CONTEXTO
--  Etapa 1 agregó `usuarios.auth_user_id` (FK a auth.users) — nullable.
--  Etapa 2 vinculó manualmente los primeros usuarios (SPITRELLA listo).
--  ESTA ETAPA 3 agrega las funciones que necesita el código del browser
--  para ejecutar el "login dual":
--
--    1. Si el usuario ingresa un username vinculado a auth_user_id,
--       el cliente llama `email_para_otp(p_username)` y obtiene el
--       email registrado en auth.users → dispara magic link OTP.
--
--    2. Si el usuario NO está vinculado (auth_user_id IS NULL),
--       el flujo cae al `verificar_pin` original (sin breaking change).
--
--    3. Cuando el usuario vuelve del email link y Supabase Auth crea
--       la sesión en el browser, el cliente llama
--       `usuario_por_auth_id(session.user.id)` (que ya existe desde
--       Etapa 1) y carga el row de `usuarios` correspondiente.
--
--  ESTE SCRIPT ES NO DESTRUCTIVO
--  · Solo crea funciones nuevas. No toca datos ni schemas existentes.
--  · No remueve el login con PIN. Sigue funcionando para usuarios legacy.
-- ═══════════════════════════════════════════════════════════════════


-- ─── FUNCIÓN · email_para_otp(p_username) ─────────────────────────
-- Recibe un username (case-insensitive). Si está vinculado a un
-- auth.users.id, devuelve el email. Si no, devuelve NULL.
--
-- SECURITY DEFINER porque consulta auth.users que es restringida.
-- GRANT a anon porque el form de login se ejecuta sin sesión.
--
-- NO expone más datos: solo el email del username que se preguntó
-- (no se puede listar emails arbitrariamente sin saber el username).
CREATE OR REPLACE FUNCTION email_para_otp(p_username TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT au.email
    FROM usuarios u
    JOIN auth.users au ON au.id = u.auth_user_id
   WHERE UPPER(u.username) = UPPER(p_username)
     AND u.activo = true
   LIMIT 1;
$$;

COMMENT ON FUNCTION email_para_otp(TEXT) IS
  'Recibe username de usuarios y devuelve email de auth.users si está vinculado, o NULL. Usado por el cliente para disparar signInWithOtp.';

GRANT EXECUTE ON FUNCTION email_para_otp(TEXT) TO anon;


-- ─── (OPCIONAL) FUNCIÓN · esta_migrado(p_username) ────────────────
-- Helper más liviano por si solo queremos saber si está vinculado
-- sin exponer el email.
CREATE OR REPLACE FUNCTION esta_migrado(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM usuarios u
     WHERE UPPER(u.username) = UPPER(p_username)
       AND u.auth_user_id IS NOT NULL
       AND u.activo = true
  );
$$;

COMMENT ON FUNCTION esta_migrado(TEXT) IS
  'Devuelve true si el username está vinculado a auth.users (migrado a OTP). Útil para UI antes de pedir email.';

GRANT EXECUTE ON FUNCTION esta_migrado(TEXT) TO anon;


-- ═══════════════════════════════════════════════════════════════════
--  VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════════

-- 1. Confirmar que las funciones existen:
SELECT proname, prosecdef AS security_definer
  FROM pg_proc
 WHERE proname IN ('email_para_otp','esta_migrado','usuario_por_auth_id');

-- 2. Test rápido con SPITRELLA (debe devolver el email asociado):
SELECT email_para_otp('SPITRELLA') AS email_spitrella;
SELECT esta_migrado('SPITRELLA') AS spitrella_migrado;

-- 3. Test con un username inexistente (debe devolver NULL/false):
SELECT email_para_otp('USUARIO_INEXISTENTE') AS email_inexistente;
SELECT esta_migrado('USUARIO_INEXISTENTE') AS inexistente_migrado;

-- 4. Test con un username legacy (sin auth_user_id, debe devolver NULL/false):
-- Reemplazar IBORONI por cualquier user que todavía NO esté migrado
SELECT email_para_otp('IBORONI') AS email_legacy;
SELECT esta_migrado('IBORONI') AS legacy_migrado;
