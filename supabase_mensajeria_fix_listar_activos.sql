-- ============================================================
-- LUMEN MENSAJERIA — Fix mensajero-historial.html (post Fase 2.D)
-- Fecha: 2026-05-18
-- ------------------------------------------------------------
-- Problema:
--   `mensajero-historial.html` la usa un mensajero EXTERNO (sin
--   sesion OTP) que se identifica solo con nombre + PIN.
--   Necesita poblar el dropdown leyendo de la tabla `mensajeros`,
--   pero post Fase 2.D la policy es `authenticated USING (true)`
--   → el GET con anon key devuelve [] y el dropdown queda vacio.
--
-- Solucion:
--   Funcion SECURITY DEFINER que devuelve SOLO los campos
--   necesarios para el dropdown (id, nombre) de los mensajeros
--   activos. NO expone pin_hash, dni, telefono ni intentos.
--   Se otorga EXECUTE a anon + authenticated.
--
-- Idempotente: se puede correr varias veces.
-- ============================================================

CREATE OR REPLACE FUNCTION public.listar_mensajeros_activos()
RETURNS TABLE (id uuid, nombre text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.nombre
  FROM public.mensajeros m
  WHERE m.activo = true
  ORDER BY m.nombre ASC;
$$;

-- Permisos: cualquiera puede listarlos (es solo nombre, no es PII sensible)
REVOKE ALL ON FUNCTION public.listar_mensajeros_activos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_mensajeros_activos() TO anon;
GRANT EXECUTE ON FUNCTION public.listar_mensajeros_activos() TO authenticated;

COMMENT ON FUNCTION public.listar_mensajeros_activos() IS
  'Devuelve id+nombre de mensajeros activos para el dropdown publico de mensajero-historial.html. SECURITY DEFINER bypassea RLS de la tabla mensajeros (que es authenticated-only post Fase 2.D).';

-- ============================================================
-- VERIFICACION
-- ============================================================
-- Despues de correr este script, ejecuta para validar:
--   SELECT * FROM listar_mensajeros_activos();
--
-- Tiene que devolver filas. Si esta vacio, revisa que existan
-- mensajeros con activo=true en la tabla mensajeros.
-- ============================================================
