-- ============================================================
-- LUMEN MENSAJERIA - RPC anular_retiro_pendiente
-- Fecha: 2026-05-18
-- ------------------------------------------------------------
-- Permite a un usuario authenticated anular un retiro que aun
-- esta PENDIENTE_FIRMA. NO permite anular retiros ya firmados
-- ni los ya anulados.
--
-- Usa SECURITY DEFINER para que la validacion del estado actual
-- y el UPDATE pasen como una sola operacion atomica (evita race
-- conditions con el mensajero firmando justo al mismo tiempo).
--
-- Retorna jsonb con { ok: true } o { ok: false, error: 'X' }.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.anular_retiro_pendiente(p_retiro_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado text;
  v_uid uuid := auth.uid();
BEGIN
  -- 1) Solo authenticated
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTH');
  END IF;

  -- 2) Buscar estado actual + lock optimista
  SELECT estado INTO v_estado
  FROM mensajeria_retiros
  WHERE id = p_retiro_id
  FOR UPDATE;

  IF v_estado IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_estado <> 'PENDIENTE_FIRMA' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ESTADO_INVALIDO', 'estado_actual', v_estado);
  END IF;

  -- 3) Anular
  UPDATE mensajeria_retiros
  SET estado = 'ANULADO'
  WHERE id = p_retiro_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.anular_retiro_pendiente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anular_retiro_pendiente(uuid) TO authenticated;

COMMENT ON FUNCTION public.anular_retiro_pendiente(uuid) IS
  'Anula un retiro de mensajeria solo si esta PENDIENTE_FIRMA. Solo authenticated. Atomico con FOR UPDATE para evitar race con firma concurrente.';

-- ============================================================
-- VERIFICACION
-- ============================================================
-- (correr aparte, reemplazando el uuid por uno real)
--   SELECT anular_retiro_pendiente('00000000-0000-0000-0000-000000000000'::uuid);
-- Devuelve {"ok": false, "error": "NOT_FOUND"} si el uuid no existe.
-- ============================================================
