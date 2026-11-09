-- =============================================================
-- Fase 1: hogares, integrantes, invitaciones y suscripciones push
-- Todo dato de la app cuelga de un hogar (household_id) para que,
-- a futuro, varias familias puedan usar la misma base sin verse.
-- =============================================================

create type public.member_role as enum ('admin', 'member');

-- Perfil público de cada usuario (1 a 1 con auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  avatar text not null default '🧽',
  color text not null default '#C9B8FF',
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  -- Zona IANA: respeta los cambios de horario de Chile automáticamente
  timezone text not null default 'America/Santiago',
  -- Lunes en que parte el ciclo de rotación (se define en la Fase 3)
  rotation_start date,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  -- false = administra pero no recibe turnos (ej: padre y madre)
  participates boolean not null default true,
  -- Posición en la rotación; se asigna con el sorteo de la Fase 3
  rotation_order int,
  -- Hora del recordatorio del día del turno (hora local del hogar)
  reminder_time time not null default '10:00',
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);
create index on public.household_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null unique,
  role public.member_role not null default 'member',
  participates boolean not null default true,
  created_by uuid not null references auth.users (id),
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses int not null default 10,
  uses int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.invitations (household_id);

-- Cada celular/navegador registrado para recibir notificaciones
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);

-- -------------------------------------------------------------
-- Funciones de ayuda para RLS. Son SECURITY DEFINER para poder
-- consultar household_members sin caer en recursión de políticas.
-- -------------------------------------------------------------
create or replace function public.is_member(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_admin(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household and user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ¿Comparto algún hogar con este usuario? (para ver su perfil)
create or replace function public.shares_household(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.household_members a
    join public.household_members b on a.household_id = b.household_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  );
$$;

-- -------------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invitations enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "ver perfiles propios o del hogar" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_household(id));
create policy "editar mi perfil" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "ver mi hogar" on public.households
  for select to authenticated using (public.is_member(id));
create policy "admin edita hogar" on public.households
  for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));

create policy "ver integrantes de mi hogar" on public.household_members
  for select to authenticated using (public.is_member(household_id));
-- Cada uno solo puede cambiar su propia hora de recordatorio (ver GRANT abajo);
-- rol y participación se cambian con la función update_member.
create policy "editar mi membresía" on public.household_members
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "admin ve invitaciones" on public.invitations
  for select to authenticated using (public.is_admin(household_id));
create policy "admin borra invitaciones" on public.invitations
  for delete to authenticated using (public.is_admin(household_id));

create policy "mis suscripciones" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Permisos por columna: el cliente solo puede tocar estas columnas
revoke update on public.household_members from authenticated, anon;
grant update (reminder_time) on public.household_members to authenticated;
revoke update on public.profiles from authenticated, anon;
grant update (display_name, avatar, color) on public.profiles to authenticated;
revoke update on public.households from authenticated, anon;
grant update (name) on public.households to authenticated;

-- -------------------------------------------------------------
-- Perfil automático al crear una cuenta
-- -------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'display_name', 40), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------
-- Acciones (RPC). Se ejecutan en el servidor con validaciones,
-- así el celular no puede saltarse las reglas.
-- -------------------------------------------------------------

-- Crea un hogar y deja a quien lo crea como administrador
create or replace function public.create_household(p_name text, p_participates boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'No has iniciado sesión'; end if;
  insert into public.households (name, created_by) values (trim(p_name), v_uid) returning id into v_id;
  insert into public.household_members (household_id, user_id, role, participates)
  values (v_id, v_uid, 'admin', p_participates);
  return v_id;
end;
$$;

-- Genera un código de 6 caracteres sin letras confusas (sin 0/O, 1/I/L)
create or replace function public.generate_invite_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.invitations where code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.create_invitation(
  p_household uuid,
  p_role public.member_role default 'member',
  p_participates boolean default true
) returns text language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if not public.is_admin(p_household) then raise exception 'Solo un administrador puede invitar'; end if;
  v_code := public.generate_invite_code();
  insert into public.invitations (household_id, code, role, participates, created_by)
  values (p_household, v_code, p_role, p_participates, auth.uid());
  return v_code;
end;
$$;

-- Muestra a qué hogar lleva un código antes de unirse
create or replace function public.preview_invitation(p_code text)
returns table (household_name text, role public.member_role, participates boolean)
language sql stable security definer set search_path = '' as $$
  select h.name, i.role, i.participates
  from public.invitations i join public.households h on h.id = i.household_id
  where i.code = upper(trim(p_code)) and i.expires_at > now() and i.uses < i.max_uses;
$$;

create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations;
begin
  if v_uid is null then raise exception 'No has iniciado sesión'; end if;
  select * into v_inv from public.invitations
  where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Código no válido'; end if;
  if v_inv.expires_at <= now() then raise exception 'El código expiró, pide uno nuevo'; end if;
  if v_inv.uses >= v_inv.max_uses then raise exception 'El código ya se usó demasiadas veces'; end if;

  if exists (select 1 from public.household_members where household_id = v_inv.household_id and user_id = v_uid) then
    return v_inv.household_id; -- ya era integrante: no hace nada
  end if;

  insert into public.household_members (household_id, user_id, role, participates)
  values (v_inv.household_id, v_uid, v_inv.role, v_inv.participates);
  update public.invitations set uses = uses + 1 where id = v_inv.id;
  return v_inv.household_id;
end;
$$;

-- El admin cambia rol o participación de un integrante.
-- Regla: el hogar nunca puede quedar sin administrador.
create or replace function public.update_member(
  p_member uuid,
  p_role public.member_role,
  p_participates boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_m public.household_members;
begin
  select * into v_m from public.household_members where id = p_member for update;
  if not found or not public.is_admin(v_m.household_id) then
    raise exception 'Solo un administrador puede hacer este cambio';
  end if;
  if v_m.role = 'admin' and p_role = 'member' and (
    select count(*) from public.household_members where household_id = v_m.household_id and role = 'admin'
  ) <= 1 then
    raise exception 'El hogar necesita al menos un administrador';
  end if;
  update public.household_members set role = p_role, participates = p_participates where id = p_member;
end;
$$;

-- Las funciones de acción solo para usuarios con sesión
revoke execute on function public.create_household(text, boolean) from public, anon;
revoke execute on function public.create_invitation(uuid, public.member_role, boolean) from public, anon;
revoke execute on function public.preview_invitation(text) from public, anon;
revoke execute on function public.join_household(text) from public, anon;
revoke execute on function public.update_member(uuid, public.member_role, boolean) from public, anon;
revoke execute on function public.generate_invite_code() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.create_household(text, boolean) to authenticated;
grant execute on function public.create_invitation(uuid, public.member_role, boolean) to authenticated;
grant execute on function public.preview_invitation(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.update_member(uuid, public.member_role, boolean) to authenticated;
