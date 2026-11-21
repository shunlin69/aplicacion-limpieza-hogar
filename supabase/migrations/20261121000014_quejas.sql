-- =============================================================
-- Quejas por la limpieza anterior.
--
-- Quien está haciendo su turno (o lo terminó hace menos de 24 horas)
-- puede reclamar por el turno ANTERIOR de la casa si quedó mal hecho,
-- con un motivo y de 1 a 6 fotos de evidencia.
--
--   * Al enviarla se resta al instante a quien hizo ese turno la mitad
--     de sus puntos (lo mismo que vale hacerlo tarde). Cuenta en la
--     semana del turno reclamado, como todo el puntaje.
--   * Quien la recibe puede aceptarla o pedir revisión (con su versión)
--     dentro de 3 días. La revisión la decide un admin: mantenerla o
--     anularla (se devuelven los puntos). Si el admin es parte de la
--     queja, la decide otro admin (salvo que sea el único).
--   * Un admin puede anular cualquier queja abierta, y quien reclamó
--     puede retirarla mientras nadie la haya decidido.
--
-- Las fotos van al mismo bucket privado que las de respaldo:
--   <hogar>/quejas/<queja>/<id>.jpg
-- Altas por RPC; quitar fotos pasa por la Edge Function "fotos".
-- =============================================================

create type public.complaint_status as enum ('vigente', 'en_revision', 'confirmada', 'anulada', 'retirada');

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Turno reclamado (el anterior) y quien lo hizo
  shift_id uuid not null references public.shifts (id) on delete cascade,
  accused_member_id uuid not null references public.household_members (id) on delete cascade,
  -- Quien reclama y su turno (durante el que reclamó)
  complainant_member_id uuid not null references public.household_members (id) on delete cascade,
  complainant_shift_id uuid references public.shifts (id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 200),
  points int not null check (points >= 0), -- puntos restados
  status public.complaint_status not null default 'vigente',
  response text check (char_length(response) <= 200), -- versión de quien la recibió
  responded_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.complaints (household_id, created_at desc);
-- Una queja activa por turno (si se retira, se puede volver a poner)
create unique index complaints_one_per_shift on public.complaints (shift_id) where status <> 'retirada';

create table public.complaint_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  path text not null unique,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.complaint_photos (complaint_id);
create index on public.complaint_photos (household_id);

alter table public.complaints enable row level security;
alter table public.complaint_photos enable row level security;
create policy "integrantes leen" on public.complaints for select to authenticated using (public.is_member(household_id));
create policy "integrantes leen" on public.complaint_photos for select to authenticated using (public.is_member(household_id));
-- Altas y cambios solo por las funciones de abajo

-- ¿Este turno mío está en plazo para reclamar? Mientras está abierto,
-- o hasta 24 horas después de terminarlo (igual que las fotos de respaldo).
create or replace function public.complaint_window_open(p_s public.shifts)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_s.status = 'pending'
          and public.household_today(p_s.household_id) >= p_s.date
          and public.household_today(p_s.household_id) < public.shift_cutoff(p_s.household_id, p_s.date))
      or (p_s.status in ('done', 'late_done') and p_s.completed_at > now() - interval '24 hours');
$$;

-- ¿Quien reclamó todavía puede agregar fotos a su queja? (24 horas y mientras siga abierta)
create or replace function public.complaint_editable(p_c public.complaints)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_c.status in ('vigente', 'en_revision') and p_c.created_at > now() - interval '24 hours'
     and exists (select 1 from public.household_members m where m.id = p_c.complainant_member_id and m.user_id = auth.uid());
$$;

-- ¿Puedo subir una foto a esta carpeta de queja?
-- Si la queja existe: es mía y aún editable. Si no existe todavía (se
-- suben las fotos antes de crearla): tengo un turno en plazo para reclamar.
create or replace function public.can_upload_complaint_photo(p_household uuid, p_complaint uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_c public.complaints;
begin
  if p_household is null or p_complaint is null then return false; end if;
  select * into v_c from public.complaints where id = p_complaint;
  if found then
    return v_c.household_id = p_household and public.complaint_editable(v_c);
  end if;
  return exists (
    select 1 from public.shifts s
    join public.household_members m on m.id = s.assigned_member_id
    where s.household_id = p_household and m.user_id = auth.uid() and public.complaint_window_open(s)
  );
end;
$$;

create policy "fotos: subir a mi queja" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos-turnos'
    and (storage.foldername(name))[2] = 'quejas'
    and public.can_upload_complaint_photo(
      public.try_uuid((storage.foldername(name))[1]),
      public.try_uuid((storage.foldername(name))[3]))
  );

-- Revisa una foto ya subida antes de registrarla en una queja
create or replace function public.check_complaint_photo(p_household uuid, p_complaint uuid, p_path text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_path is null or p_path not like p_household::text || '/quejas/' || p_complaint::text || '/%' then
    raise exception 'Ruta de foto inválida';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'fotos-turnos' and name = p_path and owner_id = auth.uid()::text
  ) then
    raise exception 'La foto no se terminó de subir. Intenta de nuevo';
  end if;
end;
$$;

-- Pone una queja por el turno anterior al mío.
-- p_id lo genera el celular (las fotos ya se subieron a esa carpeta).
create or replace function public.file_complaint(p_id uuid, p_shift uuid, p_reason text, p_paths text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_t public.shifts;
  v_mine public.shifts;
  v_me uuid;
  v_reason text := trim(coalesce(p_reason, ''));
  v_paths text[] := array(select distinct x from unnest(coalesce(p_paths, '{}')) x where x is not null);
  v_points int;
  v_path text;
begin
  select * into v_t from public.shifts where id = p_shift for update;
  if not found or not public.is_member(v_t.household_id) then raise exception 'Turno no encontrado'; end if;
  v_me := public.my_member_id(v_t.household_id);

  -- Mi turno en plazo cuyo turno anterior de la casa es el reclamado
  select s.* into v_mine
  from public.shifts s
  where s.household_id = v_t.household_id and s.assigned_member_id = v_me
    and public.complaint_window_open(s)
    and (select max(x.date) from public.shifts x where x.household_id = s.household_id and x.date < s.date) = v_t.date
  order by s.date desc
  limit 1;
  if not found then
    raise exception 'Solo puedes reclamar por el turno anterior al tuyo, mientras haces tu turno (o hasta 24 horas después)';
  end if;

  if v_t.assigned_member_id is null then raise exception 'Ese turno no tenía a nadie asignado'; end if;
  if v_t.assigned_member_id = v_me then raise exception 'No puedes reclamar por tu propio turno'; end if;
  if v_t.status = 'missed' then raise exception 'Ese turno quedó sin hacer y ya se le restaron puntos'; end if;
  if v_t.status not in ('done', 'late_done') then raise exception 'Ese turno todavía no se termina'; end if;
  -- Quien lo hizo puede deshacerlo dentro de 10 minutos: se espera a que pase ese plazo
  if v_t.completed_at > now() - interval '10 minutes' then
    raise exception 'Ese turno se acaba de terminar. Espera unos minutos para reclamar';
  end if;
  if exists (select 1 from public.complaints where shift_id = p_shift and status <> 'retirada') then
    raise exception 'Ya hay una queja por ese turno';
  end if;

  if char_length(v_reason) < 3 then raise exception 'Cuenta en pocas palabras qué quedó mal'; end if;
  if char_length(v_reason) > 200 then raise exception 'El motivo puede tener hasta 200 letras'; end if;
  if coalesce(array_length(v_paths, 1), 0) = 0 then raise exception 'Agrega al menos una foto como evidencia'; end if;
  if array_length(v_paths, 1) > 6 then raise exception 'Máximo 6 fotos por queja'; end if;
  foreach v_path in array v_paths loop
    perform public.check_complaint_photo(v_t.household_id, p_id, v_path);
  end loop;

  v_points := round(v_t.points / 2.0);
  insert into public.complaints (id, household_id, shift_id, accused_member_id, complainant_member_id, complainant_shift_id, reason, points)
  values (p_id, v_t.household_id, p_shift, v_t.assigned_member_id, v_me, v_mine.id, v_reason, v_points);
  insert into public.complaint_photos (household_id, complaint_id, path, uploaded_by)
  select v_t.household_id, p_id, x, auth.uid() from unnest(v_paths) x;

  insert into public.points_ledger (household_id, member_id, shift_id, delta, kind)
  values (v_t.household_id, v_t.assigned_member_id, p_shift, -v_points, 'queja');
  insert into public.activity_log (household_id, actor_user_id, verb, payload)
  values (v_t.household_id, auth.uid(), 'queja', jsonb_build_object(
    'queja', p_id, 'turno', p_shift, 'fecha', v_t.date, 'integrante', v_t.assigned_member_id,
    'autor', v_me, 'puntos', -v_points, 'fotos', array_length(v_paths, 1)));
  return jsonb_build_object('id', p_id, 'points', v_points);
end;
$$;

-- Agrega una foto más a una queja ya puesta (quien reclamó, dentro de 24 horas)
create or replace function public.add_complaint_photo(p_complaint uuid, p_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_c public.complaints;
  v_id uuid;
begin
  select * into v_c from public.complaints where id = p_complaint for update;
  if not found or not public.is_member(v_c.household_id) then raise exception 'Queja no encontrada'; end if;
  if not public.complaint_editable(v_c) then
    raise exception 'Solo quien reclamó puede agregar fotos, hasta 24 horas después y mientras la queja siga abierta';
  end if;
  perform public.check_complaint_photo(v_c.household_id, p_complaint, p_path);
  if (select count(*) from public.complaint_photos where complaint_id = p_complaint) >= 6 then
    raise exception 'Máximo 6 fotos por queja';
  end if;
  insert into public.complaint_photos (household_id, complaint_id, path, uploaded_by)
  values (v_c.household_id, p_complaint, p_path, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ¿Puedo quitar esta foto de queja? Devuelve la ruta del archivo si sí.
-- Quien reclamó (mientras pueda editarla, dejando al menos una) o un admin.
create or replace function public.complaint_photo_removal_path(p_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_p public.complaint_photos;
  v_c public.complaints;
begin
  select * into v_p from public.complaint_photos where id = p_id;
  if not found or not public.is_member(v_p.household_id) then raise exception 'Foto no encontrada'; end if;
  select * into v_c from public.complaints where id = v_p.complaint_id;
  if public.is_admin(v_p.household_id) then return v_p.path; end if;
  if not public.complaint_editable(v_c) then raise exception 'Ya no puedes quitar esta foto'; end if;
  if (select count(*) from public.complaint_photos where complaint_id = v_c.id) <= 1 then
    raise exception 'La queja necesita al menos una foto. Si fue un error, retira la queja';
  end if;
  return v_p.path;
end;
$$;

-- Archivos de una subida que falló a medias: ahora mira también las quejas
create or replace function public.photo_discard_allowed(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from storage.objects o
    where o.bucket_id = 'fotos-turnos' and o.name = p_path and o.owner_id = auth.uid()::text
  ) and not exists (select 1 from public.shift_photos where path = p_path)
    and not exists (select 1 from public.complaint_photos where path = p_path);
$$;

create or replace function public.log_complaint(p_c public.complaints, p_verb text, p_points int default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_log (household_id, actor_user_id, verb, payload)
  values (p_c.household_id, auth.uid(), p_verb, jsonb_build_object(
    'queja', p_c.id,
    'turno', p_c.shift_id,
    'fecha', (select date from public.shifts where id = p_c.shift_id),
    'integrante', p_c.accused_member_id,
    'autor', p_c.complainant_member_id)
    || case when p_points is null then '{}'::jsonb else jsonb_build_object('puntos', p_points) end);
end;
$$;

-- Devuelve los puntos de una queja (el libro no se edita: se agrega la suma)
create or replace function public.refund_complaint(p_c public.complaints)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_c.points <> 0 then
    insert into public.points_ledger (household_id, member_id, shift_id, delta, kind)
    values (p_c.household_id, p_c.accused_member_id, p_c.shift_id, p_c.points, 'queja_devuelta');
  end if;
end;
$$;

-- Quien recibió la queja la acepta o pide revisión (con su versión), dentro de 3 días
create or replace function public.respond_complaint(p_id uuid, p_accept boolean, p_response text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_c public.complaints;
  v_response text := nullif(trim(coalesce(p_response, '')), '');
begin
  select * into v_c from public.complaints where id = p_id for update;
  if not found or v_c.accused_member_id is distinct from public.my_member_id(v_c.household_id) then
    raise exception 'Esta queja no es sobre tu turno';
  end if;
  if v_c.status <> 'vigente' then raise exception 'Esta queja ya fue respondida'; end if;
  if v_c.created_at < now() - interval '3 days' then raise exception 'El plazo para responder esta queja terminó (3 días)'; end if;
  if not p_accept and char_length(coalesce(v_response, '')) < 3 then
    raise exception 'Cuenta brevemente tu versión para que un admin la revise';
  end if;
  if char_length(coalesce(v_response, '')) > 200 then raise exception 'Tu respuesta puede tener hasta 200 letras'; end if;
  update public.complaints
  set status = case when p_accept then 'confirmada'::public.complaint_status else 'en_revision'::public.complaint_status end,
      response = v_response, responded_at = now(),
      decided_at = case when p_accept then now() end
  where id = p_id returning * into v_c;
  perform public.log_complaint(v_c, case when p_accept then 'queja_aceptada' else 'queja_revision' end);
end;
$$;

-- Un admin mantiene o anula una queja abierta. Anular devuelve los puntos.
create or replace function public.decide_complaint(p_id uuid, p_keep boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_c public.complaints;
  v_me uuid;
begin
  select * into v_c from public.complaints where id = p_id for update;
  if not found or not public.is_admin(v_c.household_id) then raise exception 'Solo un admin puede decidir una queja'; end if;
  if v_c.status not in ('vigente', 'en_revision') then raise exception 'Esta queja ya está cerrada'; end if;
  v_me := public.my_member_id(v_c.household_id);
  if v_me in (v_c.complainant_member_id, v_c.accused_member_id) and exists (
    select 1 from public.household_members
    where household_id = v_c.household_id and role = 'admin' and id not in (v_c.complainant_member_id, v_c.accused_member_id)
  ) then
    raise exception 'Eres parte de esta queja: la decide otro admin';
  end if;
  update public.complaints
  set status = case when p_keep then 'confirmada'::public.complaint_status else 'anulada'::public.complaint_status end,
      decided_by = auth.uid(), decided_at = now()
  where id = p_id returning * into v_c;
  if not p_keep then perform public.refund_complaint(v_c); end if;
  perform public.log_complaint(v_c, case when p_keep then 'queja_confirmada' else 'queja_anulada' end,
                               case when p_keep then null else v_c.points end);
end;
$$;

-- Quien reclamó la retira (mientras nadie la haya decidido): se devuelven los puntos
create or replace function public.withdraw_complaint(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_c public.complaints;
begin
  select * into v_c from public.complaints where id = p_id for update;
  if not found or v_c.complainant_member_id is distinct from public.my_member_id(v_c.household_id) then
    raise exception 'Solo quien puso la queja puede retirarla';
  end if;
  if v_c.status not in ('vigente', 'en_revision') then raise exception 'Esta queja ya está cerrada'; end if;
  update public.complaints set status = 'retirada', decided_at = now() where id = p_id returning * into v_c;
  perform public.refund_complaint(v_c);
  perform public.log_complaint(v_c, 'queja_retirada', v_c.points);
end;
$$;

-- Avisos de quejas (al instante)
create or replace function public.notify_complaint()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_comp text;
  v_acc text;
  v_comp_user uuid;
  v_acc_user uuid;
  v_date date;
  v_day text;
  v_key text := 'queja:' || new.id || ':' || new.status || ':';
  a record;
begin
  if tg_op = 'UPDATE' and new.status = old.status then return new; end if;
  select p.display_name, hm.user_id into v_comp, v_comp_user
    from public.household_members hm join public.profiles p on p.id = hm.user_id where hm.id = new.complainant_member_id;
  select p.display_name, hm.user_id into v_acc, v_acc_user
    from public.household_members hm join public.profiles p on p.id = hm.user_id where hm.id = new.accused_member_id;
  select date into v_date from public.shifts where id = new.shift_id;
  v_day := public.dia_es(v_date) || ' ' || to_char(v_date, 'DD/MM');

  if tg_op = 'INSERT' then
    perform public.queue_notification(new.household_id, v_acc_user, 'queja', v_key || v_acc_user,
      '📣 Queja sobre tu turno del ' || public.dia_es(v_date),
      v_comp || ' dice que quedó mal: “' || new.reason || '”. Se restaron ' || new.points
        || ' pts. Mira las fotos en Hoy y acéptala o pide revisión.');
    -- Admins que no son parte de la queja
    for a in
      select hm.user_id from public.household_members hm
      where hm.household_id = new.household_id and hm.role = 'admin'
        and hm.id not in (new.complainant_member_id, new.accused_member_id)
    loop
      perform public.queue_notification(new.household_id, a.user_id, 'queja', v_key || a.user_id,
        '📣 Nueva queja',
        v_comp || ' reclamó por el turno del ' || v_day || ' de ' || v_acc || ' (−' || new.points || ' pts): “' || new.reason || '”.');
    end loop;
  elsif new.status = 'en_revision' then
    -- Admins que pueden decidir (los que no son parte; si no hay, todos)
    for a in
      select hm.user_id from public.household_members hm
      where hm.household_id = new.household_id and hm.role = 'admin'
        and (hm.id not in (new.complainant_member_id, new.accused_member_id) or not exists (
          select 1 from public.household_members o
          where o.household_id = new.household_id and o.role = 'admin'
            and o.id not in (new.complainant_member_id, new.accused_member_id)))
    loop
      perform public.queue_notification(new.household_id, a.user_id, 'queja', v_key || a.user_id,
        '🧐 Queja por revisar',
        v_acc || ' no está de acuerdo con la queja de ' || v_comp || ' (turno del ' || v_day || '): “' || new.response || '”.');
    end loop;
    perform public.queue_notification(new.household_id, v_comp_user, 'queja', v_key || v_comp_user,
      '🧐 ' || v_acc || ' pidió revisar tu queja', 'Un admin decidirá si se mantiene.');
  elsif new.status = 'confirmada' and new.decided_by is null then
    perform public.queue_notification(new.household_id, v_comp_user, 'queja', v_key || v_comp_user,
      '👍 ' || v_acc || ' aceptó tu queja', 'La queja por el turno del ' || v_day || ' queda confirmada.');
  elsif new.status in ('confirmada', 'anulada') then
    perform public.queue_notification(new.household_id, v_acc_user, 'queja', v_key || v_acc_user,
      case when new.status = 'confirmada' then '⚖️ La queja se mantiene' else '⚖️ Queja anulada' end,
      case when new.status = 'confirmada' then 'Un admin revisó la queja por tu turno del ' || v_day || '.'
           else 'Un admin anuló la queja por tu turno del ' || v_day || '. Te devolvimos ' || new.points || ' pts.' end,
      './#/ranking');
    perform public.queue_notification(new.household_id, v_comp_user, 'queja', v_key || v_comp_user,
      case when new.status = 'confirmada' then '⚖️ Tu queja se mantiene' else '⚖️ Tu queja fue anulada' end,
      'Un admin revisó tu queja por el turno del ' || v_day || ' de ' || v_acc || '.',
      './#/ranking');
  elsif new.status = 'retirada' then
    perform public.queue_notification(new.household_id, v_acc_user, 'queja', v_key || v_acc_user,
      '↩️ ' || v_comp || ' retiró su queja', 'Te devolvimos los ' || new.points || ' pts del turno del ' || v_day || '.',
      './#/ranking');
  end if;
  perform public.kick_push();
  return new;
end;
$$;

create trigger notify_complaint after insert or update of status on public.complaints
  for each row execute function public.notify_complaint();

revoke execute on function public.complaint_window_open(public.shifts) from public, anon, authenticated;
revoke execute on function public.complaint_editable(public.complaints) from public, anon, authenticated;
revoke execute on function public.can_upload_complaint_photo(uuid, uuid) from public, anon;
revoke execute on function public.check_complaint_photo(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.file_complaint(uuid, uuid, text, text[]) from public, anon;
revoke execute on function public.add_complaint_photo(uuid, text) from public, anon;
revoke execute on function public.complaint_photo_removal_path(uuid) from public, anon;
revoke execute on function public.log_complaint(public.complaints, text, int) from public, anon, authenticated;
revoke execute on function public.refund_complaint(public.complaints) from public, anon, authenticated;
revoke execute on function public.respond_complaint(uuid, boolean, text) from public, anon;
revoke execute on function public.decide_complaint(uuid, boolean) from public, anon;
revoke execute on function public.withdraw_complaint(uuid) from public, anon;
revoke execute on function public.notify_complaint() from public, anon, authenticated;
-- can_upload_complaint_photo la usa la política de storage
grant execute on function public.can_upload_complaint_photo(uuid, uuid) to authenticated;
grant execute on function public.file_complaint(uuid, uuid, text, text[]) to authenticated;
grant execute on function public.add_complaint_photo(uuid, text) to authenticated;
grant execute on function public.complaint_photo_removal_path(uuid) to authenticated;
grant execute on function public.respond_complaint(uuid, boolean, text) to authenticated;
grant execute on function public.decide_complaint(uuid, boolean) to authenticated;
grant execute on function public.withdraw_complaint(uuid) to authenticated;

alter publication supabase_realtime add table public.complaints, public.complaint_photos;
