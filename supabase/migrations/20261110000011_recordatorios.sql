-- =============================================================
-- Fase 7: recordatorios push.
-- La base de datos decide QUÉ avisar y a quién (con la hora de Chile
-- de cada hogar) y lo deja en notification_log con una llave única,
-- así nunca se repite un aviso. La Edge Function "push" (acción
-- 'cron') envía lo pendiente.
--
--   Domingo 20:00        -> resumen de la semana para todos
--   Día del turno        -> a la hora elegida por cada uno (10, 11, 12 o 16)
--   Día del turno 21:00  -> si sigue pendiente
--   Días de atraso       -> a su hora, mientras aún pueda ganar la mitad
--   Cambios de turno     -> al instante, a quien corresponda
-- =============================================================

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  dedupe_key text not null unique,
  title text not null,
  body text not null,
  url text not null default './#/hoy',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  result text
);
create index notification_log_unsent on public.notification_log (created_at) where sent_at is null;

alter table public.notification_log enable row level security;
create policy "mis avisos" on public.notification_log for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.queue_notification(
  p_household uuid, p_user uuid, p_kind text, p_key text, p_title text, p_body text, p_url text default './#/hoy'
) returns void language sql security definer set search_path = '' as $$
  insert into public.notification_log (household_id, user_id, kind, dedupe_key, title, body, url)
  values (p_household, p_user, p_kind, p_key, p_title, p_body, p_url)
  on conflict (dedupe_key) do nothing;
$$;

-- "lunes", "miércoles"...
create or replace function public.dia_es(p_date date)
returns text language sql immutable set search_path = '' as $$
  select (array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])[extract(isodow from p_date)::int];
$$;

-- "Baño y Living", "Living, Comedor y Cocina"
create or replace function public.spaces_text(p_snapshot jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare v text[];
begin
  v := array(select sp ->> 'name' from jsonb_array_elements(coalesce(p_snapshot -> 'spaces', '[]')) sp);
  if coalesce(array_length(v, 1), 0) <= 1 then return coalesce(v[1], 'tu turno'); end if;
  return array_to_string(v[1:array_length(v, 1) - 1], ', ') || ' y ' || v[array_length(v, 1)];
end;
$$;

-- Despierta a la Edge Function "push" para que envíe lo pendiente (asíncrono)
create or replace function public.kick_push()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.notification_log where sent_at is null and attempts < 3) then return; end if;
  perform net.http_post(
    url := 'https://nyvzbctefxlomrzteagz.supabase.co/functions/v1/push',
    body := '{"action":"cron"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.get_cron_secret()),
    timeout_milliseconds := 30000
  );
exception when others then
  -- Un problema de red nunca debe bloquear la acción del usuario; la tarea programada reintenta
  raise warning 'kick_push: %', sqlerrm;
end;
$$;

-- Recordatorios por horario (lo llama pg_cron cada 15 minutos)
create or replace function public.enqueue_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare
  h record;
  m record;
  s record;
  v_local timestamp;
  v_today date;
  v_time time;
  v_next date;
  v_list text;
  v_body text;
  v_cutoff date;
  v_before int;
begin
  select count(*) into v_before from public.notification_log;
  for h in select id, timezone from public.households where rotation_start is not null loop
    v_local := now() at time zone h.timezone;
    v_today := v_local::date;
    v_time := v_local::time;

    -- 1. Domingo 20:00: resumen de la semana que viene
    if extract(isodow from v_today) = 7 and v_time >= '20:00' then
      v_next := v_today + 1;
      if exists (select 1 from public.shifts where household_id = h.id and week_start = v_next) then
        for m in select hm.id, hm.user_id, hm.participates from public.household_members hm where hm.household_id = h.id loop
          if m.participates then
            select string_agg(public.dia_es(x.date) || ' (' || public.spaces_text(x.snapshot) || ')', ', ' order by x.date)
              into v_list from public.shifts x where x.household_id = h.id and x.week_start = v_next and x.assigned_member_id = m.id;
            v_body := case when v_list is null then 'Esta semana descansas 😴 ¡Disfrútalo!'
                           else 'Esta semana te toca: ' || v_list || '.' end;
          else
            select string_agg(public.dia_es(x.date) || ': ' || coalesce(p.display_name, 'sin asignar'), ' · ' order by x.date)
              into v_list
              from public.shifts x
              left join public.household_members a on a.id = x.assigned_member_id
              left join public.profiles p on p.id = a.user_id
              where x.household_id = h.id and x.week_start = v_next;
            v_body := 'Turnos de la semana: ' || coalesce(v_list, 'sin turnos') || '.';
          end if;
          perform public.queue_notification(h.id, m.user_id, 'resumen_semanal', 'resumen:' || v_next || ':' || m.user_id,
            '📅 Tu semana de limpieza', v_body, './#/semana');
        end loop;
      end if;
    end if;

    -- 2 y 3. El día del turno: a la hora elegida, y a las 21:00 si sigue pendiente
    for s in
      select x.id, x.points, x.snapshot, a.user_id, a.reminder_time
      from public.shifts x join public.household_members a on a.id = x.assigned_member_id
      where x.household_id = h.id and x.date = v_today and x.status = 'pending'
    loop
      if v_time >= '21:00' then
        perform public.queue_notification(h.id, s.user_id, 'turno_pendiente', 'pendiente:' || s.id,
          '⏰ Tu turno sigue pendiente',
          'Termínalo antes de medianoche para ganar los ' || s.points || ' pts completos.');
      elsif v_time >= s.reminder_time then
        perform public.queue_notification(h.id, s.user_id, 'turno_hoy', 'dia:' || s.id,
          '🧽 Hoy te toca limpiar',
          public.spaces_text(s.snapshot) || ' · ' || s.points || ' pts. ¡Tú puedes!');
      end if;
    end loop;

    -- 4. Turnos atrasados: un aviso por día a su hora, mientras aún valgan la mitad
    for s in
      select x.id, x.date, x.points, a.user_id, a.reminder_time
      from public.shifts x join public.household_members a on a.id = x.assigned_member_id
      where x.household_id = h.id and x.date < v_today and x.status = 'pending'
    loop
      v_cutoff := public.shift_cutoff(h.id, s.date);
      if v_today < v_cutoff and v_time >= s.reminder_time then
        perform public.queue_notification(h.id, s.user_id, 'turno_atrasado', 'atrasado:' || s.id || ':' || v_today,
          '⏰ Turno atrasado',
          'Tu turno del ' || public.dia_es(s.date) || ' sigue pendiente. Termínalo antes del ' || public.dia_es(v_cutoff)
            || ' y ganas la mitad (' || round(s.points / 2.0) || ' pts).');
      end if;
    end loop;
  end loop;
  return (select count(*) from public.notification_log) - v_before;
end;
$$;

-- Avisos de cambios de turno (al instante)
create or replace function public.notify_swap()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_req text;
  v_tgt text;
  v_req_user uuid;
  v_tgt_user uuid;
  v_date date;
  v_tdate date;
  v_what text;
  v_key text := 'swap:' || new.id || ':' || new.status || ':';
  a record;
begin
  if tg_op = 'UPDATE' and new.status = old.status then return new; end if;
  select p.display_name, hm.user_id into v_req, v_req_user
    from public.household_members hm join public.profiles p on p.id = hm.user_id where hm.id = new.requester_member_id;
  select p.display_name, hm.user_id into v_tgt, v_tgt_user
    from public.household_members hm join public.profiles p on p.id = hm.user_id where hm.id = new.target_member_id;
  select date into v_date from public.shifts where id = new.shift_id;
  select date into v_tdate from public.shifts where id = new.target_shift_id;
  v_what := case when new.target_shift_id is null
    then v_tgt || ' cubre a ' || v_req || ' el ' || public.dia_es(v_date) || ' ' || to_char(v_date, 'DD/MM')
    else v_req || ' (' || public.dia_es(v_date) || ') ⇄ ' || v_tgt || ' (' || public.dia_es(v_tdate) || ')' end;

  if tg_op = 'INSERT' then
    perform public.queue_notification(new.household_id, v_tgt_user, 'cambio', v_key || v_tgt_user,
      '🔄 Te piden un cambio de turno',
      v_req || case when new.target_shift_id is null
        then ' te pide que lo cubras el ' || public.dia_es(v_date) || ' ' || to_char(v_date, 'DD/MM') || ' (te quedaría debiendo uno).'
        else ' te pide cambiar su turno del ' || public.dia_es(v_date) || ' por tu turno del ' || public.dia_es(v_tdate) || '.' end);
  elsif new.status = 'pending_admin' then
    perform public.queue_notification(new.household_id, v_req_user, 'cambio', v_key || v_req_user,
      '🤝 ' || v_tgt || ' aceptó tu cambio', 'Ahora falta la aprobación de un admin.');
    -- Admins que no son parte del cambio (si no hay, todos los admins)
    for a in
      select hm.user_id from public.household_members hm
      where hm.household_id = new.household_id and hm.role = 'admin'
        and (hm.id not in (new.requester_member_id, new.target_member_id) or not exists (
          select 1 from public.household_members o
          where o.household_id = new.household_id and o.role = 'admin' and o.id not in (new.requester_member_id, new.target_member_id)))
    loop
      perform public.queue_notification(new.household_id, a.user_id, 'cambio', v_key || a.user_id,
        '🔄 Cambio por aprobar', v_what || '. Ambos están de acuerdo; falta tu aprobación.');
    end loop;
  elsif new.status = 'rejected' and new.decided_at is null then
    perform public.queue_notification(new.household_id, v_req_user, 'cambio', v_key || v_req_user,
      '🙅 ' || v_tgt || ' no puede hacer el cambio', 'Tu turno del ' || public.dia_es(v_date) || ' sigue igual.');
  elsif new.status in ('approved', 'rejected') then
    perform public.queue_notification(new.household_id, v_req_user, 'cambio', v_key || v_req_user,
      case when new.status = 'approved' then '✅ Cambio aprobado' else '⛔ Cambio no aprobado' end, v_what || '.', './#/semana');
    perform public.queue_notification(new.household_id, v_tgt_user, 'cambio', v_key || v_tgt_user,
      case when new.status = 'approved' then '✅ Cambio aprobado' else '⛔ Cambio no aprobado' end, v_what || '.', './#/semana');
  elsif new.status = 'cancelled' and old.status = 'pending_target' then
    perform public.queue_notification(new.household_id, v_tgt_user, 'cambio', v_key || v_tgt_user,
      '✖️ ' || v_req || ' canceló su pedido', 'Ya no necesitas responder.');
  end if;
  perform public.kick_push();
  return new;
end;
$$;

create trigger notify_swap after insert or update of status on public.swap_requests
  for each row execute function public.notify_swap();

revoke execute on function public.queue_notification(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.kick_push() from public, anon, authenticated;
revoke execute on function public.enqueue_reminders() from public, anon, authenticated;
revoke execute on function public.notify_swap() from public, anon, authenticated;

-- Cada 15 minutos: arma los recordatorios que tocan y los envía
select cron.schedule('recordatorios', '*/15 * * * *', $$ select public.enqueue_reminders(); select public.kick_push(); $$);

-- La función de envío "reserva" los avisos antes de mandarlos: si dos
-- ejecuciones coinciden (cron + un cambio de turno), nadie recibe doble.
alter table public.notification_log add column claimed_at timestamptz;

create or replace function public.claim_notifications(p_limit int default 200)
returns setof public.notification_log language sql security definer set search_path = '' as $$
  update public.notification_log n set claimed_at = now()
  where n.id in (
    select id from public.notification_log
    where sent_at is null and attempts < 3 and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning n.*;
$$;
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;
