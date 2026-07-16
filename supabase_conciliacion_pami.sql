-- ============================================================
--  LUMEN · MÓDULO CONCILIACIÓN PAMI — MIGRACIÓN SUPABASE
--  Proyecto: erjdncsnomwymjiaslpx
--  Correr en: Supabase → SQL Editor (una sola vez).
--  ------------------------------------------------------------
--  Persiste cada corrida de conciliación (lote) y sus ítems
--  (un turno FUESMEN con su estado PAMI y estado de trabajo).
--
--  SEGURIDAD (leer antes de Fase 3 / Tampermonkey):
--   - RLS ESTRICTA: cada usuario sólo ve/escribe SUS lotes e
--     ítems (auth.uid()). No hay policy para el rol `anon`, así
--     que la anon/publishable key NO puede leer estas tablas.
--   - El puente Tampermonkey (Fase 3) NO debe usar la anon key
--     desnuda contra estas tablas. Cuando se implemente, la cola
--     se expone vía un RPC SECURITY DEFINER acotado o con el JWT
--     del usuario — decisión pendiente (ver plan §6.3).
-- ============================================================

-- ── LOTE: una corrida (par de archivos) ─────────────────────
create table if not exists public.pami_conciliacion_lotes (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references auth.users(id) on delete cascade,
  sede              text,
  archivo_fuesmen   text,
  archivo_pami      text,
  u_acepto          text,
  ventana_dias      int  not null default 3,
  umbral_nombre     int  not null default 82,
  total_fuesmen     int,
  total_pami        int,
  creado_en         timestamptz not null default now()
);

-- ── ITEM: un turno FUESMEN + su mejor candidato PAMI ────────
create table if not exists public.pami_conciliacion_items (
  id                uuid primary key default gen_random_uuid(),
  lote_id           uuid not null references public.pami_conciliacion_lotes(id) on delete cascade,
  usuario_asignado  uuid references auth.users(id) on delete set null,

  -- snapshots (para no depender del archivo original al re-exportar)
  datos_turno       jsonb not null,   -- fila/turno FUESMEN completo
  datos_transmision jsonb,            -- mejor candidato PAMI (null si sin registro)
  candidatos_alt    jsonb,            -- array de alternativas

  -- claves de acción
  nro_turno         text,             -- FUESMEN → hturno
  nro_orden         text,             -- PAMI    → transmision.php
  afiliado_norm     text,
  nombre_norm       text,
  fecha_turno       date,

  -- resultado del matching
  score             int  not null default 0,
  semaforo          text not null default 'SIN_REGISTRO'
                    check (semaforo in ('VALIDADO','PENDIENTE','TRANSMITIDO_SIN_VALIDAR','SIN_REGISTRO')),
  confianza         text not null default 'sin_match'
                    check (confianza in ('fuerte','dudoso','sin_match')),

  -- flujo de trabajo
  decision_manual   text not null default 'pendiente'
                    check (decision_manual in ('pendiente','confirmado','descartado')),
  estado_proceso    text not null default 'pendiente'
                    check (estado_proceso in ('pendiente','listo','en_fuesmen','en_pami','finalizado','error')),
  nota              text,
  actualizado_en    timestamptz not null default now()
);

create index if not exists idx_pcp_items_lote     on public.pami_conciliacion_items(lote_id);
create index if not exists idx_pcp_items_estado   on public.pami_conciliacion_items(estado_proceso);
create index if not exists idx_pcp_items_asignado on public.pami_conciliacion_items(usuario_asignado);
create index if not exists idx_pcp_lotes_usuario  on public.pami_conciliacion_lotes(usuario_id);

-- ── trigger: bump actualizado_en ────────────────────────────
create or replace function public.pcp_touch() returns trigger
language plpgsql as $$
begin new.actualizado_en = now(); return new; end; $$;

drop trigger if exists trg_pcp_touch on public.pami_conciliacion_items;
create trigger trg_pcp_touch before update on public.pami_conciliacion_items
  for each row execute function public.pcp_touch();

-- ── RLS ─────────────────────────────────────────────────────
alter table public.pami_conciliacion_lotes enable row level security;
alter table public.pami_conciliacion_items enable row level security;

-- LOTES: el dueño (usuario_id = auth.uid())
drop policy if exists pcp_lotes_sel on public.pami_conciliacion_lotes;
create policy pcp_lotes_sel on public.pami_conciliacion_lotes
  for select to authenticated using (usuario_id = auth.uid());
drop policy if exists pcp_lotes_ins on public.pami_conciliacion_lotes;
create policy pcp_lotes_ins on public.pami_conciliacion_lotes
  for insert to authenticated with check (usuario_id = auth.uid());
drop policy if exists pcp_lotes_upd on public.pami_conciliacion_lotes;
create policy pcp_lotes_upd on public.pami_conciliacion_lotes
  for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
drop policy if exists pcp_lotes_del on public.pami_conciliacion_lotes;
create policy pcp_lotes_del on public.pami_conciliacion_lotes
  for delete to authenticated using (usuario_id = auth.uid());

-- ITEMS: el asignado (usuario_asignado = auth.uid())
--        (fallback: dueño del lote, por si el ítem quedó sin asignar)
drop policy if exists pcp_items_sel on public.pami_conciliacion_items;
create policy pcp_items_sel on public.pami_conciliacion_items
  for select to authenticated using (
    usuario_asignado = auth.uid()
    or exists (select 1 from public.pami_conciliacion_lotes l where l.id = lote_id and l.usuario_id = auth.uid())
  );
drop policy if exists pcp_items_ins on public.pami_conciliacion_items;
create policy pcp_items_ins on public.pami_conciliacion_items
  for insert to authenticated with check (
    exists (select 1 from public.pami_conciliacion_lotes l where l.id = lote_id and l.usuario_id = auth.uid())
  );
drop policy if exists pcp_items_upd on public.pami_conciliacion_items;
create policy pcp_items_upd on public.pami_conciliacion_items
  for update to authenticated using (
    usuario_asignado = auth.uid()
    or exists (select 1 from public.pami_conciliacion_lotes l where l.id = lote_id and l.usuario_id = auth.uid())
  );
drop policy if exists pcp_items_del on public.pami_conciliacion_items;
create policy pcp_items_del on public.pami_conciliacion_items
  for delete to authenticated using (
    exists (select 1 from public.pami_conciliacion_lotes l where l.id = lote_id and l.usuario_id = auth.uid())
  );

-- ── GRANTS ──────────────────────────────────────────────────
-- Sólo authenticated. NO se otorga a anon (la anon key no toca estas tablas).
grant select, insert, update, delete on public.pami_conciliacion_lotes to authenticated;
grant select, insert, update, delete on public.pami_conciliacion_items to authenticated;
revoke all on public.pami_conciliacion_lotes from anon;
revoke all on public.pami_conciliacion_items from anon;

-- (Opcional Fase 2) Realtime en items para reflejar la cola en vivo:
-- alter publication supabase_realtime add table public.pami_conciliacion_items;

-- ============================================================
--  Fin. Verificar en Table Editor que ambas tablas tienen el
--  candado RLS activo y las policies pcp_* listadas.
-- ============================================================
