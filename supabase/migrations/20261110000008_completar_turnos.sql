-- =============================================================
-- Fase 4: marcar turnos como hechos, puntos y "no hechos".
-- Mismas reglas que src/core/completion.ts:
--   el día del turno           -> puntos completos
--   después, antes del siguiente turno de la casa -> la mitad
--   llega el siguiente turno y sigue pendiente     -> resta la mitad
-- Todo se decide en el servidor con la hora de Chile del hogar.
-- =============================================================

-- Ítems de la lista de "limpio" marcados en un turno
create table public.shift_checks (
  shift_id uuid not null references public.shifts (id) on delete cascade,
  item_id text not null,
  household_id uuid not null references public.households (id) on delete cascade,
  -- Al desmarcar se deja en false (no se borra la fila)
  checked boolean not null default true,
  checked_by uuid references auth.users (id) on delete set null,
  checked_at timestamptz not null default now(),
  primary key (shift_id, item_id)
);
create index on public.shift_checks (household_id);

-- Libro de puntos: solo se agregan filas, nunca se editan (base del ranking)
create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,
  shift_id uuid references public.shifts (id) on delete set null,
  delta int not null,
  -- turno_hecho | turno_tarde | turno_no_hecho | deshacer
  kind text not null,
  created_at timestamptz not null default now()
);
create index on public.points_ledger (household_id, created_at);
create index on public.points_ledger (member_id);

alter table public.shift_checks enable row level security;
alter table public.points_ledger enable row level security;
create policy "integrantes leen" on public.shift_checks for select to authenticated using (public.is_member(household_id));
create policy "integrantes leen" on public.points_ledger for select to authenticated using (public.is_member(household_id));

-- Fecha de hoy en la zona horaria del hogar
create or replace function public.household_today(p_household uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone timezone)::date from public.households where id = p_household;
$$;

-- Siguiente día con turno en la casa después de p_date (o una semana después)
create or replace function public.shift_cutoff(p_household uuid, p_date date)
returns date language sql stable security definer set search_path = '' as $$
  select coalesce(min(g.d)::date, p_date + 7)
  from generate_series(p_date + 1, p_date + 60, interval '1 day') as g(d)
  join public.shift_templates t on t.household_id = p_household and t.active
  where (t.recurrence = 'weekly' and extract(isodow from g.d)::int = any (t.weekdays))
     or (t.recurrence = 'every_n_days' and g.d::date >= t.anchor_date
         and (g.d::date - t.anchor_date) % t.interval_days = 0);
$$;

-- Turno que puede tocar el usuario: le pertenece y está pendiente y en plazo
create or replace function public.lock_own_shift(p_shift uuid)
returns public.shifts language plpgsql security definer set search_path = '' as $$
declare
  v_s public.shifts;
  v_today date;
begin
  select * into v_s from public.shifts where id = p_shift for update;
  if not found or not public.is_member(v_s.household_id) then raise exception 'Turno no encontrado'; end if;
  if not exists (
    select 1 from public.household_members
    where id = v_s.assigned_member_id and user_id = auth.uid()
  ) then
    raise exception 'Este turno no es tuyo';
  end if;
  if v_s.status <> 'pending' then raise exception 'Este turno ya está cerrado'; end if;
  v_today := public.household_today(v_s.household_id);
  if v_today < v_s.date then raise exception 'Este turno aún no llega'; end if;
  if v_today >= public.shift_cutoff(v_s.household_id, v_s.date) then raise exception 'El plazo de este turno terminó'; end if;
  return v_s;
end;
$$;

-- Marca o desmarca un ítem de la lista de "limpio"
create or replace function public.toggle_shift_item(p_shift uuid, p_item text, p_checked boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_s public.shifts;
begin
  v_s := public.lock_own_shift(p_shift);
  if not exists (
    select 1 from jsonb_array_elements(v_s.snapshot -> 'spaces') sp,
                  jsonb_array_elements(coalesce(sp -> 'items', '[]')) it
    where it ->> 'id' = p_item
  ) then
    raise exception 'Ese ítem no es parte de este turno';
  end if;
  insert into public.shift_checks (shift_id, item_id, household_id, checked, checked_by)
  values (p_shift, p_item, v_s.household_id, p_checked, auth.uid())
  on conflict (shift_id, item_id) do update
    set checked = excluded.checked, checked_by = excluded.checked_by, checked_at = now();
end;
$$;

-- Termina el turno: exige la lista completa y calcula los puntos
create or replace function public.complete_shift(p_shift uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s public.shifts;
  v_today date;
  v_status public.shift_status;
  v_delta int;
  v_missing int;
begin
  v_s := public.lock_own_shift(p_shift);
  select count(*) into v_missing
  from jsonb_array_elements(v_s.snapshot -> 'spaces') sp,
       jsonb_array_elements(coalesce(sp -> 'items', '[]')) it
  where not exists (select 1 from public.shift_checks c where c.shift_id = p_shift and c.item_id = it ->> 'id' and c.checked);
  if v_missing = 1 then raise exception 'Te falta 1 cosa de la lista'; end if;
  if v_missing > 1 then raise exception 'Te faltan % cosas de la lista', v_missing; end if;

  v_today := public.household_today(v_s.household_id);
  if v_today = v_s.date then
    v_status := 'done';
    v_delta := v_s.points;
  else
    v_status := 'late_done';
    v_delta := round(v_s.points / 2.0);
  end if;

  update public.shifts set status = v_status, completed_at = now(), completed_by = auth.uid() where id = p_shift;
  insert into public.points_ledger (household_id, member_id, shift_id, delta, kind)
  values (v_s.household_id, v_s.assigned_member_id, p_shift, v_delta,
          case when v_status = 'done' then 'turno_hecho' else 'turno_tarde' end);
  insert into public.activity_log (household_id, actor_user_id, verb, payload)
  values (v_s.household_id, auth.uid(), case when v_status = 'done' then 'turno_hecho' else 'turno_tarde' end,
          jsonb_build_object('turno', p_shift, 'fecha', v_s.date, 'puntos', v_delta));
  return jsonb_build_object('status', v_status, 'points', v_delta);
end;
$$;

-- Deshacer por si se marcó sin querer: solo quien lo marcó, dentro de 10 minutos
create or replace function public.undo_complete_shift(p_shift uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_s public.shifts;
  v_delta int;
begin
  select * into v_s from public.shifts where id = p_shift for update;
  if not found or v_s.completed_by is distinct from auth.uid() or v_s.status not in ('done', 'late_done') then
    raise exception 'No puedes deshacer este turno';
  end if;
  if v_s.completed_at < now() - interval '10 minutes' then
    raise exception 'Solo se puede deshacer dentro de 10 minutos';
  end if;
  -- El libro no se edita: se agrega la resta equivalente
  select coalesce(sum(delta), 0) into v_delta from public.points_ledger where shift_id = p_shift;
  if v_delta <> 0 then
    insert into public.points_ledger (household_id, member_id, shift_id, delta, kind)
    values (v_s.household_id, v_s.assigned_member_id, p_shift, -v_delta, 'deshacer');
  end if;
  update public.shifts set status = 'pending', completed_at = null, completed_by = null where id = p_shift;
  insert into public.activity_log (household_id, actor_user_id, verb, payload)
  values (v_s.household_id, auth.uid(), 'turno_deshecho', jsonb_build_object('turno', p_shift, 'fecha', v_s.date));
end;
$$;

-- Tarea programada: los pendientes cuyo plazo terminó pasan a "no hecho"
create or replace function public.mark_missed_shifts()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_s record;
  v_n int := 0;
  v_delta int;
begin
  for v_s in
    select s.* from public.shifts s
    where s.status = 'pending'
      and public.household_today(s.household_id) >= public.shift_cutoff(s.household_id, s.date)
    for update skip locked
  loop
    update public.shifts set status = 'missed' where id = v_s.id;
    if v_s.assigned_member_id is not null then
      v_delta := -round(v_s.points / 2.0);
      insert into public.points_ledger (household_id, member_id, shift_id, delta, kind)
      values (v_s.household_id, v_s.assigned_member_id, v_s.id, v_delta, 'turno_no_hecho');
      insert into public.activity_log (household_id, verb, payload)
      values (v_s.household_id, 'turno_no_hecho', jsonb_build_object('turno', v_s.id, 'fecha', v_s.date, 'puntos', v_delta));
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.household_today(uuid) from public, anon;
revoke execute on function public.shift_cutoff(uuid, date) from public, anon;
revoke execute on function public.lock_own_shift(uuid) from public, anon, authenticated;
revoke execute on function public.toggle_shift_item(uuid, text, boolean) from public, anon;
revoke execute on function public.complete_shift(uuid) from public, anon;
revoke execute on function public.undo_complete_shift(uuid) from public, anon;
revoke execute on function public.mark_missed_shifts() from public, anon, authenticated;
grant execute on function public.household_today(uuid) to authenticated;
grant execute on function public.shift_cutoff(uuid, date) to authenticated;
grant execute on function public.toggle_shift_item(uuid, text, boolean) to authenticated;
grant execute on function public.complete_shift(uuid) to authenticated;
grant execute on function public.undo_complete_shift(uuid) to authenticated;

-- Cada hora, al minuto 1 (justo después de medianoche cierra los vencidos)
select cron.schedule('turnos-no-hechos', '1 * * * *', $$ select public.mark_missed_shifts(); $$);

alter publication supabase_realtime add table public.shift_checks, public.points_ledger;
