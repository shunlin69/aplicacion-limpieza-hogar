-- Relación directa integrante -> perfil, para traer nombre y avatar en una sola consulta
alter table public.household_members
  add constraint household_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- Tiempo real: la app escucha cambios en estas tablas (RLS sigue aplicando)
alter publication supabase_realtime add table public.household_members, public.profiles;
