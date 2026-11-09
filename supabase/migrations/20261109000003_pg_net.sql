-- pg_net permite llamar Edge Functions desde la base (lo usarán los
-- recordatorios programados de la Fase 7).
create extension if not exists pg_net with schema extensions;
