-- =============================================================
-- Fase 6: intercambios de turno.
-- Flujo: quien pide -> la otra persona acepta -> un admin aprueba.
-- Dos tipos:
--   * Intercambio: se cambian un turno por otro.
--   * Cubrir: la otra persona hace tu turno y quedas debiéndole uno
--     (se devuelve solo con la rotación, igual que las ausencias).
-- Si quien aprueba es parte del cambio, debe aprobarlo OTRO admin
-- (salvo que sea el único admin del hogar).
-- =============================================================

create type public.swap_status as enum ('pending_target', 'pending_admin', 'approved', 'rejected', 'cancelled', 'expired');

create table public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  requester_member_id uuid not null references public.household_members (id) on delete cascade,
  target_member_id uuid not null references public.household_members (id) on delete cascade,
  -- null = "cúbreme" (sin turno a cambio, queda una deuda)
  target_shift_id uuid references public.shifts (id) on delete cascade,
  note text check (char_length(note) <= 120),
  status public.swap_status not null default 'pending_target',
  target_responded_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.swap_requests (household_id, created_at desc);
create unique index swap_one_open_per_shift on public.swap_requests (shift_id) where status in ('pending_target', 'pending_admin');

alter table public.swap_requests enable row level security;
create policy "integrantes leen" on public.swap_requests for select to authenticated using (public.is_member(household_id));

-- Deudas: de dónde vienen. Recalcular una semana solo rehace las de ausencias.
alter table public.rotation_debts add column source text not null default 'ausencia';

-- Integrante (de este hogar) del usuario con sesión
create or replace function public.my_member_id(p_household uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.household_members where household_id = p_household and user_id = auth.uid();
$$;

-- ¿Este turno ya está en una solicitud abierta?
create or replace function public.shift_in_open_swap(p_shift uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.swap_requests
    where status in ('pending_target', 'pending_admin') and (shift_id = p_shift or target_shift_id = p_shift)
  );
$$;

create or replace function public.log_swap(p_r public.swap_requests, p_verb text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_log (household_id, actor_user_id, verb, payload)
  values (p_r.household_id, auth.uid(), p_verb, jsonb_build_object(
    'solicitud', p_r.id,
    'integrante', p_r.requester_member_id,
    'otro', p_r.target_member_id,
    'fecha', (select date from public.shifts where id = p_r.shift_id),
    'fecha_otro', (select date from public.shifts where id = p_r.target_shift_id)
  ));
end;
$$;

create or replace function public.request_swap(p_shift uuid, p_target_member uuid, p_target_shift uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_s public.shifts;
  v_t public.shifts;
  v_me uuid;
  v_today date;
  v_r public.swap_requests;
begin
  select * into v_s from public.shifts where id = p_shift for update;
  if not found or not public.is_member(v_s.household_id) then raise exception 'Turno no encontrado'; end if;
  v_me := public.my_member_id(v_s.household_id);
  if v_s.assigned_member_id is distinct from v_me then raise exception 'Solo puedes pedir cambio de tus turnos'; end if;
  v_today := public.household_today(v_s.household_id);
  if v_s.status <> 'pending' or v_s.date < v_today then raise exception 'Este turno ya no se puede cambiar'; end if;
  if p_target_member = v_me then raise exception 'Elige a otra persona'; end if;
  if not exists (
    select 1 from public.household_members where id = p_target_member and household_id = v_s.household_id and participates
  ) then
    raise exception 'Esa persona no hace turnos en este hogar';
  end if;
  if public.shift_in_open_swap(p_shift) then raise exception 'Ya hay una solicitud abierta para este turno'; end if;

  if p_target_shift is not null then
    select * into v_t from public.shifts where id = p_target_shift for update;
    if not found or v_t.household_id <> v_s.household_id or v_t.assigned_member_id is distinct from p_target_member then
      raise exception 'Ese turno no es de esa persona';
    end if;
    if v_t.status <> 'pending' or v_t.date < v_today then raise exception 'Ese turno ya no se puede cambiar'; end if;
    if public.shift_in_open_swap(p_target_shift) then raise exception 'Ese turno ya tiene una solicitud abierta'; end if;
  end if;

  insert into public.swap_requests (household_id, shift_id, requester_member_id, target_member_id, target_shift_id, note)
  values (v_s.household_id, p_shift, v_me, p_target_member, p_target_shift, nullif(trim(p_note), ''))
  returning * into v_r;
  perform public.log_swap(v_r, 'cambio_pedido');
  return v_r.id;
end;
$$;

-- La otra persona acepta o rechaza
create or replace function public.respond_swap(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_r public.swap_requests;
begin
  select * into v_r from public.swap_requests where id = p_id for update;
  if not found or v_r.target_member_id is distinct from public.my_member_id(v_r.household_id) then
    raise exception 'Esta solicitud no es para ti';
  end if;
  if v_r.status <> 'pending_target' then raise exception 'Esta solicitud ya fue respondida'; end if;
  update public.swap_requests
  set status = case when p_accept then 'pending_admin'::public.swap_status else 'rejected'::public.swap_status end,
      target_responded_at = now()
  where id = p_id returning * into v_r;
  perform public.log_swap(v_r, case when p_accept then 'cambio_aceptado' else 'cambio_rechazado' end);
end;
$$;

-- Un admin aprueba o rechaza; al aprobar se cambian los turnos
create or replace function public.decide_swap(p_id uuid, p_approve boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_r public.swap_requests;
  v_s public.shifts;
  v_t public.shifts;
  v_me uuid;
  v_today date;
begin
  select * into v_r from public.swap_requests where id = p_id for update;
  if not found or not public.is_admin(v_r.household_id) then raise exception 'Solo un administrador puede aprobar cambios'; end if;
  if v_r.status <> 'pending_admin' then raise exception 'Esta solicitud no está esperando aprobación'; end if;
  v_me := public.my_member_id(v_r.household_id);
  if v_me in (v_r.requester_member_id, v_r.target_member_id) and exists (
    select 1 from public.household_members
    where household_id = v_r.household_id and role = 'admin' and id <> v_me
  ) then
    raise exception 'Eres parte de este cambio: lo debe aprobar otro admin';
  end if;

  if not p_approve then
    update public.swap_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = p_id returning * into v_r;
    perform public.log_swap(v_r, 'cambio_no_aprobado');
    return 'rejected';
  end if;

  -- Revisa que nada haya cambiado desde que se pidió
  v_today := public.household_today(v_r.household_id);
  select * into v_s from public.shifts where id = v_r.shift_id for update;
  if v_r.target_shift_id is not null then
    select * into v_t from public.shifts where id = v_r.target_shift_id for update;
  end if;
  if v_s.status <> 'pending' or v_s.date < v_today or v_s.assigned_member_id is distinct from v_r.requester_member_id
     or (v_r.target_shift_id is not null and (
       v_t.status <> 'pending' or v_t.date < v_today or v_t.assigned_member_id is distinct from v_r.target_member_id)) then
    update public.swap_requests set status = 'expired', decided_by = auth.uid(), decided_at = now() where id = p_id;
    return 'expired';
  end if;

  update public.shifts
  set assigned_member_id = v_r.target_member_id, original_member_id = v_r.requester_member_id, reason = 'intercambio'
  where id = v_s.id;
  if v_r.target_shift_id is not null then
    update public.shifts
    set assigned_member_id = v_r.requester_member_id, original_member_id = v_r.target_member_id, reason = 'intercambio'
    where id = v_t.id;
  else
    -- "Cúbreme": queda una deuda que la rotación devuelve sola
    insert into public.rotation_debts (household_id, debtor_member_id, creditor_member_id, origin_shift_id, origin_week, source)
    values (v_r.household_id, v_r.requester_member_id, v_r.target_member_id, v_s.id, v_s.week_start, 'intercambio');
  end if;

  update public.swap_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = p_id returning * into v_r;
  perform public.log_swap(v_r, 'cambio_aprobado');
  return 'approved';
end;
$$;

-- Quien pidió puede cancelar mientras esté abierta
create or replace function public.cancel_swap(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_r public.swap_requests;
begin
  select * into v_r from public.swap_requests where id = p_id for update;
  if not found or v_r.requester_member_id is distinct from public.my_member_id(v_r.household_id) then
    raise exception 'Solo quien pidió el cambio puede cancelarlo';
  end if;
  if v_r.status not in ('pending_target', 'pending_admin') then raise exception 'Esta solicitud ya está cerrada'; end if;
  update public.swap_requests set status = 'cancelled' where id = p_id returning * into v_r;
  perform public.log_swap(v_r, 'cambio_cancelado');
end;
$$;

-- Tarea programada: solicitudes cuyo turno ya pasó o se cerró quedan vencidas
create or replace function public.expire_swaps()
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update public.swap_requests r set status = 'expired'
  where r.status in ('pending_target', 'pending_admin')
    and exists (
      select 1 from public.shifts s
      where s.id in (r.shift_id, r.target_shift_id)
        and (s.status <> 'pending' or s.date < public.household_today(s.household_id))
    );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.my_member_id(uuid) from public, anon;
revoke execute on function public.shift_in_open_swap(uuid) from public, anon, authenticated;
revoke execute on function public.log_swap(public.swap_requests, text) from public, anon, authenticated;
revoke execute on function public.request_swap(uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.respond_swap(uuid, boolean) from public, anon;
revoke execute on function public.decide_swap(uuid, boolean) from public, anon;
revoke execute on function public.cancel_swap(uuid) from public, anon;
revoke execute on function public.expire_swaps() from public, anon, authenticated;
grant execute on function public.my_member_id(uuid) to authenticated;
grant execute on function public.request_swap(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.respond_swap(uuid, boolean) to authenticated;
grant execute on function public.decide_swap(uuid, boolean) to authenticated;
grant execute on function public.cancel_swap(uuid) to authenticated;

select cron.schedule('cambios-vencidos', '2 * * * *', $$ select public.expire_swaps(); $$);

alter publication supabase_realtime add table public.swap_requests;
