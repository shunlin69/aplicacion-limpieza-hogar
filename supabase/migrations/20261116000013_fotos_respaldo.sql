-- =============================================================
-- Fotos de respaldo de los turnos.
-- Quien hace el turno puede subir hasta 4 fotos mientras lo hace y
-- hasta 24 horas después de terminarlo. Todo el hogar puede verlas.
-- Quitar fotos pasa por la Edge Function "fotos".
-- Las fotos se guardan en un bucket PRIVADO: solo se ven con un enlace
-- firmado que dura poco, y cada hogar ve solo las suyas.
-- Ruta del archivo: <hogar>/<turno>/<id>.jpg
-- Un admin puede exigir al menos una foto para terminar un turno.
-- =============================================================

-- Opción del hogar: exigir foto para terminar (apagada por defecto)
alter table public.households add column require_photo boolean not null default false;
grant update (require_photo) on public.households to authenticated;

create table public.shift_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  path text not null unique,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.shift_photos (shift_id);
create index on public.shift_photos (household_id, created_at desc);

alter table public.shift_photos enable row level security;
create policy "integrantes ven las fotos" on public.shift_photos
  for select to authenticated using (public.is_member(household_id));
-- Altas y bajas solo por las funciones de abajo

-- Convierte texto a uuid sin fallar (las rutas las escribe el cliente)
create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- ¿Puedo agregar (o quitar) fotos de este turno ahora?
-- Sí si el turno es mío y está abierto, o lo terminé hace menos de 24 horas.
create or replace function public.can_edit_shift_photos(p_shift uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.shifts s
    join public.household_members m on m.id = s.assigned_member_id
    where s.id = p_shift
      and m.user_id = auth.uid()
      and (
        (s.status = 'pending'
          and public.household_today(s.household_id) >= s.date
          and public.household_today(s.household_id) < public.shift_cutoff(s.household_id, s.date))
        or (s.status in ('done', 'late_done') and s.completed_at > now() - interval '24 hours')
      )
  );
$$;

-- Bucket privado, máximo 5 MB por foto y solo imágenes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-turnos', 'fotos-turnos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Ver: integrantes del hogar (primera carpeta de la ruta)
create policy "fotos: el hogar las ve" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos-turnos' and public.is_member(public.try_uuid((storage.foldername(name))[1])));

-- Subir: solo a la carpeta de un turno propio y abierto
create policy "fotos: subir a mi turno" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos-turnos'
    and exists (
      select 1 from public.shifts s
      where s.id = public.try_uuid((storage.foldername(name))[2])
        and s.household_id = public.try_uuid((storage.foldername(name))[1])
    )
    and public.can_edit_shift_photos(public.try_uuid((storage.foldername(name))[2]))
  );

-- Borrar archivos y registros lo hace la función "fotos" (Edge Function) con
-- permisos de servidor, después de validar con photo_removal_path / photo_discard_allowed.

-- Registra una foto ya subida
create or replace function public.add_shift_photo(p_shift uuid, p_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_s public.shifts;
  v_id uuid;
begin
  select * into v_s from public.shifts where id = p_shift for update;
  if not found or not public.is_member(v_s.household_id) then raise exception 'Turno no encontrado'; end if;
  if not public.can_edit_shift_photos(p_shift) then
    raise exception 'Solo puedes agregar fotos a tu turno de hoy (o hasta 24 horas después de terminarlo)';
  end if;
  if p_path not like v_s.household_id::text || '/' || p_shift::text || '/%' then raise exception 'Ruta de foto inválida'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'fotos-turnos' and name = p_path) then
    raise exception 'La foto no se terminó de subir. Intenta de nuevo';
  end if;
  if (select count(*) from public.shift_photos where shift_id = p_shift) >= 4 then
    raise exception 'Máximo 4 fotos por turno';
  end if;
  insert into public.shift_photos (household_id, shift_id, path, uploaded_by)
  values (v_s.household_id, p_shift, p_path, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ¿Puedo quitar esta foto? Devuelve la ruta del archivo si sí.
-- Quien la subió (mientras pueda editar el turno) o un admin del hogar.
create or replace function public.photo_removal_path(p_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_p public.shift_photos;
begin
  select * into v_p from public.shift_photos where id = p_id;
  if not found or not public.is_member(v_p.household_id) then raise exception 'Foto no encontrada'; end if;
  if not (
    (v_p.uploaded_by = auth.uid() and public.can_edit_shift_photos(v_p.shift_id))
    or public.is_admin(v_p.household_id)
  ) then
    raise exception 'Ya no puedes quitar esta foto';
  end if;
  return v_p.path;
end;
$$;

-- ¿Este archivo es mío y quedó sin registrar? (subida que falló a medias)
create or replace function public.photo_discard_allowed(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from storage.objects o
    where o.bucket_id = 'fotos-turnos' and o.name = p_path and o.owner_id = auth.uid()::text
  ) and not exists (select 1 from public.shift_photos where path = p_path);
$$;

-- Terminar turno: igual que antes, más la foto obligatoria si el hogar la exige
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
  if (select require_photo from public.households where id = v_s.household_id)
     and not exists (select 1 from public.shift_photos where shift_id = p_shift) then
    raise exception 'Agrega al menos una foto de respaldo para terminar';
  end if;

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
          jsonb_build_object('turno', p_shift, 'fecha', v_s.date, 'puntos', v_delta,
                             'fotos', (select count(*) from public.shift_photos where shift_id = p_shift)));
  return jsonb_build_object('status', v_status, 'points', v_delta);
end;
$$;

revoke execute on function public.try_uuid(text) from public, anon;
revoke execute on function public.can_edit_shift_photos(uuid) from public, anon;
revoke execute on function public.add_shift_photo(uuid, text) from public, anon;
revoke execute on function public.photo_removal_path(uuid) from public, anon;
revoke execute on function public.photo_discard_allowed(text) from public, anon;
grant execute on function public.try_uuid(text) to authenticated;
grant execute on function public.can_edit_shift_photos(uuid) to authenticated;
grant execute on function public.add_shift_photo(uuid, text) to authenticated;
grant execute on function public.photo_removal_path(uuid) to authenticated;
grant execute on function public.photo_discard_allowed(text) to authenticated;

alter publication supabase_realtime add table public.shift_photos;
