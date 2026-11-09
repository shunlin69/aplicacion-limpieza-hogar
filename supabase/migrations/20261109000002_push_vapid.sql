-- =============================================================
-- Claves VAPID para notificaciones push.
-- La Edge Function "push" genera el par de claves la primera vez
-- y lo guarda aquí: la privada en Supabase Vault (cifrada) y la
-- pública en una tabla. La privada nunca pasa por el código ni
-- por el celular.
-- =============================================================
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_settings (
  key text primary key,
  value text not null
);

-- Solo el rol de servicio (Edge Functions) puede leer la clave privada
create or replace function public.get_vapid_keys()
returns table (public_key text, private_key text)
language sql stable security definer set search_path = '' as $$
  select
    (select value from private.app_settings where key = 'vapid_public_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key' limit 1);
$$;

create or replace function public.store_vapid_keys(p_public text, p_private text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Candado: si dos celulares piden la clave a la vez, solo uno la crea
  perform pg_advisory_xact_lock(hashtext('vapid_keys'));
  -- No sobrescribe: si ya existen, las suscripciones actuales seguirían válidas
  if exists (select 1 from private.app_settings where key = 'vapid_public_key') then
    return;
  end if;
  perform vault.create_secret(p_private, 'vapid_private_key', 'Clave privada VAPID para Web Push');
  insert into private.app_settings (key, value) values ('vapid_public_key', p_public);
end;
$$;

-- La clave pública sí la necesita el celular para suscribirse
create or replace function public.get_vapid_public_key()
returns text language sql stable security definer set search_path = '' as $$
  select value from private.app_settings where key = 'vapid_public_key';
$$;

revoke execute on function public.get_vapid_keys() from public, anon, authenticated;
revoke execute on function public.store_vapid_keys(text, text) from public, anon, authenticated;
revoke execute on function public.get_vapid_public_key() from public, anon;
grant execute on function public.get_vapid_keys() to service_role;
grant execute on function public.store_vapid_keys(text, text) to service_role;
grant execute on function public.get_vapid_public_key() to authenticated;
