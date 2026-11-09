-- Tarea programada: cada hora (minuto 5) asegura que cada hogar tenga
-- repartida la semana actual, y la siguiente desde el domingo 18:00 (hora local).
-- La función es idempotente: si la semana ya existe, no hace nada.
create extension if not exists pg_cron;

select cron.schedule(
  'reparto-semanal',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://nyvzbctefxlomrzteagz.supabase.co/functions/v1/schedule',
    body := '{"action":"cron"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- La app escucha cambios del hogar (ej: fecha de inicio de la rotación)
alter publication supabase_realtime add table public.households;
