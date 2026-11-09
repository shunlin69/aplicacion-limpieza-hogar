-- =============================================================
-- Fase 2: espacios, lista de "limpio" y moldes de turno
-- =============================================================

create type public.recurrence_kind as enum ('weekly', 'every_n_days');

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default '🧹',
  difficulty int not null default 2 check (difficulty between 1 and 3),
  minutes int not null default 20 check (minutes between 5 and 240),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.spaces (household_id);

-- Lo que significa "limpio" en cada espacio
create table public.space_checklist_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  sort_order int not null default 0,
  active boolean not null default true
);
create index on public.space_checklist_items (space_id);

-- Molde de turno: qué días se repite y qué espacios incluye
create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  recurrence public.recurrence_kind not null default 'weekly',
  -- Días ISO: 1 = lunes ... 7 = domingo (para recurrence = weekly)
  weekdays int[] not null default '{}' check (weekdays <@ array[1,2,3,4,5,6,7]),
  -- Para recurrence = every_n_days: cada X días contando desde anchor_date
  interval_days int check (interval_days between 1 and 60),
  anchor_date date,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (recurrence = 'weekly' and cardinality(weekdays) > 0)
    or (recurrence = 'every_n_days' and interval_days is not null and anchor_date is not null)
  )
);
create index on public.shift_templates (household_id);

create table public.shift_template_spaces (
  household_id uuid not null references public.households (id) on delete cascade,
  shift_template_id uuid not null references public.shift_templates (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  primary key (shift_template_id, space_id)
);

-- -------------------------------------------------------------
-- RLS: todos los integrantes leen; solo admins editan
-- -------------------------------------------------------------
alter table public.spaces enable row level security;
alter table public.space_checklist_items enable row level security;
alter table public.shift_templates enable row level security;
alter table public.shift_template_spaces enable row level security;

do $$
declare t text;
begin
  foreach t in array array['spaces', 'space_checklist_items', 'shift_templates', 'shift_template_spaces'] loop
    execute format('create policy "integrantes leen" on public.%I for select to authenticated using (public.is_member(household_id))', t);
    execute format('create policy "admins crean" on public.%I for insert to authenticated with check (public.is_admin(household_id))', t);
    execute format('create policy "admins editan" on public.%I for update to authenticated using (public.is_admin(household_id)) with check (public.is_admin(household_id))', t);
    execute format('create policy "admins borran" on public.%I for delete to authenticated using (public.is_admin(household_id))', t);
  end loop;
end $$;

-- Un ítem o turno-espacio debe pertenecer al mismo hogar que su espacio/turno
create or replace function public.check_same_household()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'space_checklist_items' then
    if not exists (select 1 from public.spaces where id = new.space_id and household_id = new.household_id) then
      raise exception 'El espacio no pertenece a este hogar';
    end if;
  elsif tg_table_name = 'shift_template_spaces' then
    if not exists (select 1 from public.spaces where id = new.space_id and household_id = new.household_id)
       or not exists (select 1 from public.shift_templates where id = new.shift_template_id and household_id = new.household_id) then
      raise exception 'El turno o el espacio no pertenecen a este hogar';
    end if;
  end if;
  return new;
end;
$$;
create trigger same_household before insert or update on public.space_checklist_items
  for each row execute function public.check_same_household();
create trigger same_household before insert or update on public.shift_template_spaces
  for each row execute function public.check_same_household();

-- -------------------------------------------------------------
-- Lista inicial editable: 4 espacios, sus ítems y 3 turnos
-- (lunes: baño + living; miércoles: living + comedor + cocina; viernes: baño + living)
-- -------------------------------------------------------------
create or replace function public.seed_household_defaults(p_household uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_cocina uuid; v_living uuid; v_comedor uuid; v_bano uuid;
  v_lun uuid; v_mie uuid; v_vie uuid;
begin
  if exists (select 1 from public.spaces where household_id = p_household) then
    return; -- ya tiene espacios: no duplica
  end if;

  insert into public.spaces (household_id, name, icon, difficulty, minutes, sort_order)
    values (p_household, 'Cocina', '🍳', 3, 40, 1) returning id into v_cocina;
  insert into public.spaces (household_id, name, icon, difficulty, minutes, sort_order)
    values (p_household, 'Baño', '🛁', 3, 30, 2) returning id into v_bano;
  insert into public.spaces (household_id, name, icon, difficulty, minutes, sort_order)
    values (p_household, 'Living', '🛋️', 2, 25, 3) returning id into v_living;
  insert into public.spaces (household_id, name, icon, difficulty, minutes, sort_order)
    values (p_household, 'Comedor', '🍽️', 1, 20, 4) returning id into v_comedor;

  insert into public.space_checklist_items (household_id, space_id, label, sort_order)
  select p_household, s, l, o from (values
    (v_cocina, 'Lavar y guardar la loza', 1),
    (v_cocina, 'Limpiar mesón y cocina (encimera)', 2),
    (v_cocina, 'Limpiar lavaplatos', 3),
    (v_cocina, 'Limpiar puertas del refrigerador y microondas', 4),
    (v_cocina, 'Sacar la basura y cambiar bolsa', 5),
    (v_cocina, 'Barrer y trapear el piso', 6),
    (v_bano, 'Limpiar WC por dentro y por fuera', 1),
    (v_bano, 'Limpiar lavamanos y llave', 2),
    (v_bano, 'Limpiar espejo', 3),
    (v_bano, 'Limpiar ducha o tina', 4),
    (v_bano, 'Vaciar papelero', 5),
    (v_bano, 'Reponer papel higiénico', 6),
    (v_bano, 'Barrer y trapear el piso', 7),
    (v_living, 'Ordenar cosas fuera de lugar', 1),
    (v_living, 'Sacudir muebles y superficies', 2),
    (v_living, 'Ordenar cojines y mantas', 3),
    (v_living, 'Aspirar o barrer el piso', 4),
    (v_living, 'Trapear el piso', 5),
    (v_comedor, 'Limpiar la mesa', 1),
    (v_comedor, 'Limpiar sillas', 2),
    (v_comedor, 'Barrer bajo la mesa', 3),
    (v_comedor, 'Trapear el piso', 4)
  ) as t(s, l, o);

  insert into public.shift_templates (household_id, name, weekdays, sort_order)
    values (p_household, 'Lunes', '{1}', 1) returning id into v_lun;
  insert into public.shift_templates (household_id, name, weekdays, sort_order)
    values (p_household, 'Miércoles', '{3}', 2) returning id into v_mie;
  insert into public.shift_templates (household_id, name, weekdays, sort_order)
    values (p_household, 'Viernes', '{5}', 3) returning id into v_vie;

  insert into public.shift_template_spaces (household_id, shift_template_id, space_id) values
    (p_household, v_lun, v_bano), (p_household, v_lun, v_living),
    (p_household, v_mie, v_living), (p_household, v_mie, v_comedor), (p_household, v_mie, v_cocina),
    (p_household, v_vie, v_bano), (p_household, v_vie, v_living);
end;
$$;
revoke execute on function public.seed_household_defaults(uuid) from public, anon, authenticated;
revoke execute on function public.check_same_household() from public, anon, authenticated;

-- Los hogares nuevos parten con la lista inicial
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
  perform public.seed_household_defaults(v_id);
  return v_id;
end;
$$;

-- Hogares que ya existían también reciben la lista inicial
select public.seed_household_defaults(id) from public.households;

alter publication supabase_realtime add table public.spaces, public.space_checklist_items, public.shift_templates, public.shift_template_spaces;
