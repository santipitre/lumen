-- ============================================================
-- LUMEN MENSAJERIA - Restore policies authenticated
-- Fecha: 2026-05-18
-- ------------------------------------------------------------
-- Contexto:
--   En alguna migracion intermedia (Fase 2.D.X) se dropearon
--   las policies de las 4 tablas de mensajeria, pero NUNCA se
--   recrearon. Quedo RLS habilitado sin policies, lo que en
--   Postgres equivale a "deny all": ni anon ni authenticated
--   podian leer/escribir nada. La UI de mensajeria.html mostraba
--   0 retiros aun con sesion OTP valida (JWT con role authenticated).
--
-- Diagnostico realizado el 2026-05-18:
--   - JWT del cliente: role=authenticated, aud=authenticated OK
--   - SELECT directo a mensajeria_retiros: status 200 + count 0
--   - SELECT en pg_policies WHERE tablename='mensajeria_retiros': 0 rows
--   - Mismo problema en mensajeros, mensajeria_destinos, mensajeria_sobres
--
-- Fix:
--   Restauramos las policies tal como estaban en el archivo
--   original supabase_mensajeria_migration.sql:
--     FOR ALL TO authenticated USING (true) WITH CHECK (true)
--
--   El acceso publico (sin login) sigue siendo via funciones
--   SECURITY DEFINER:
--     - consultar_retiro_por_token, firmar_retiro, cambiar_pin_y_firmar
--       (para mensajeria-firmar.html)
--     - mis_retiros_mensajero
--       (para mensajero-historial.html)
--     - listar_mensajeros_activos
--       (agregada el mismo dia para poblar el dropdown del PIN)
--
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================

-- Asegurar RLS habilitado (por si acaso)
ALTER TABLE public.mensajeros          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajeria_destinos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajeria_retiros  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajeria_sobres   ENABLE ROW LEVEL SECURITY;

-- Drop si existen (idempotente)
DROP POLICY IF EXISTS auth_all_mensajeros          ON public.mensajeros;
DROP POLICY IF EXISTS auth_all_mensajeria_destinos ON public.mensajeria_destinos;
DROP POLICY IF EXISTS auth_all_mensajeria_retiros  ON public.mensajeria_retiros;
DROP POLICY IF EXISTS auth_all_mensajeria_sobres   ON public.mensajeria_sobres;

-- Recrear
CREATE POLICY auth_all_mensajeros
  ON public.mensajeros
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY auth_all_mensajeria_destinos
  ON public.mensajeria_destinos
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY auth_all_mensajeria_retiros
  ON public.mensajeria_retiros
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY auth_all_mensajeria_sobres
  ON public.mensajeria_sobres
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ============================================================
-- VERIFICACION (correr aparte para confirmar)
-- ============================================================
-- SELECT tablename, policyname, cmd, roles::text AS roles
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('mensajeros','mensajeria_destinos','mensajeria_retiros','mensajeria_sobres')
-- ORDER BY tablename, policyname;
--
-- Debe devolver 4 filas, una por tabla, todas con cmd=ALL y roles={authenticated}.
-- ============================================================
