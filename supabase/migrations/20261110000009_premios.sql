-- =============================================================
-- Fase 5: premios configurables. Un premio se gana al juntar sus
-- puntos dentro del mes (el ranking se calcula desde points_ledger).
-- =============================================================
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default '🎁',
  points_needed int not null check (points_needed between 1 and 1000),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.rewards (household_id);

alter table public.rewards enable row level security;
create policy "integrantes leen" on public.rewards for select to authenticated using (public.is_member(household_id));
create policy "admins crean" on public.rewards for insert to authenticated with check (public.is_admin(household_id));
create policy "admins editan" on public.rewards for update to authenticated using (public.is_admin(household_id)) with check (public.is_admin(household_id));
create policy "admins borran" on public.rewards for delete to authenticated using (public.is_admin(household_id));

alter publication supabase_realtime add table public.rewards, public.activity_log;

-- El historial de "no hecho" ahora guarda a quién le tocaba
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
      values (v_s.household_id, 'turno_no_hecho',
              jsonb_build_object('turno', v_s.id, 'fecha', v_s.date, 'puntos', v_delta, 'integrante', v_s.assigned_member_id));
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
