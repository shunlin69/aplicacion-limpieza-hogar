-- =============================================================
-- Fase 3: turnos concretos, ausencias, deudas e historial.
-- Los turnos los crea el servidor (Edge Function "schedule"); el
-- celular solo los lee. Así el reparto es neutral.
-- =============================================================

create type public.shift_status as enum ('pending', 'done', 'late_done', 'missed');

-- Semanas ya repartidas (evita generar dos veces)
create table public.schedule_weeks (
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null,
  week_index int not null,
  generated_at timestamptz not null default now(),
  primary key (household_id, week_start)
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  template_id uuid not null references public.shift_templates (id) on delete cascade,
  week_start date not null,
  date date not null,
  assigned_member_id uuid references public.household_members (id) on delete set null,
  -- A quién le tocaba por rotación si hubo cambio (ausencia, deuda, intercambio)
  original_member_id uuid references public.household_members (id) on delete set null,
  reason text not null default 'rotacion',
  status public.shift_status not null default 'pending',
  -- Copia fija al momento de repartir: el historial no cambia si se editan los espacios
  weight int not null,
  points int not null,
  snapshot jsonb not null default '{}',
  completed_at timestamptz,
  completed_by uuid references auth.users (id),
  -- Reservado para la fase de verificación
  verification_status text,
  created_at timestamptz not null default now(),
  unique (template_id, date)
);
create index on public.shifts (household_id, week_start);
create index on public.shifts (assigned_member_id, date);

create table public.member_unavailability (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  reason text check (char_length(reason) <= 80),
  created_by uuid not null references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (member_id, week_start)
);

create table public.rotation_debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  debtor_member_id uuid not null references public.household_members (id) on delete cascade,
  creditor_member_id uuid not null references public.household_members (id) on delete cascade,
  origin_shift_id uuid references public.shifts (id) on delete set null,
  origin_week date not null,
  settled_shift_id uuid references public.shifts (id) on delete set null,
  settled_week date,
  created_at timestamptz not null default now()
);
create index on public.rotation_debts (household_id);

-- Historial visible para todos: quién hizo qué y cuándo
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null, -- null = la app (automático)
  verb text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.activity_log (household_id, created_at desc);

-- RLS: todos leen; nadie escribe directo salvo admins en ausencias
alter table public.schedule_weeks enable row level security;
alter table public.shifts enable row level security;
alter table public.member_unavailability enable row level security;
alter table public.rotation_debts enable row level security;
alter table public.activity_log enable row level security;

create policy "integrantes leen" on public.schedule_weeks for select to authenticated using (public.is_member(household_id));
create policy "integrantes leen" on public.shifts for select to authenticated using (public.is_member(household_id));
create policy "integrantes leen" on public.member_unavailability for select to authenticated using (public.is_member(household_id));
create policy "integrantes leen" on public.rotation_debts for select to authenticated using (public.is_member(household_id));
create policy "integrantes leen" on public.activity_log for select to authenticated using (public.is_member(household_id));

create policy "admins marcan ausencias" on public.member_unavailability for insert to authenticated
  with check (public.is_admin(household_id) and exists (
    select 1 from public.household_members m where m.id = member_id and m.household_id = member_unavailability.household_id));
create policy "admins quitan ausencias" on public.member_unavailability for delete to authenticated
  using (public.is_admin(household_id));

-- El sorteo del orden de rotación lo hace la Edge Function "schedule"
-- (acción 'draw'): valida que seas admin, mezcla al azar y deja el
-- resultado en el historial.

-- Quien se une después (o pasa a hacer turnos) entra al final de la rotación
create or replace function public.assign_rotation_order()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.participates and new.rotation_order is null and exists (
    select 1 from public.households where id = new.household_id and rotation_start is not null
  ) then
    select coalesce(max(rotation_order) + 1, 0) into new.rotation_order
    from public.household_members where household_id = new.household_id;
  elsif not new.participates then
    new.rotation_order := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.assign_rotation_order() from public, anon, authenticated;
create trigger assign_rotation_order before insert or update of participates on public.household_members
  for each row execute function public.assign_rotation_order();

-- Secreto para que la tarea programada (pg_cron) llame a la Edge Function
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'Secreto de tareas programadas');

create or replace function public.get_cron_secret()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
$$;
revoke execute on function public.get_cron_secret() from public, anon, authenticated;
grant execute on function public.get_cron_secret() to service_role;

alter publication supabase_realtime add table public.shifts, public.member_unavailability, public.rotation_debts, public.schedule_weeks;
