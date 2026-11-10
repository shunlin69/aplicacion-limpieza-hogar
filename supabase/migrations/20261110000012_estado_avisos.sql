-- Qué integrantes tienen al menos un celular con avisos activos
-- (para que un admin sepa a quién pedirle que los active)
create or replace function public.household_push_status(p_household uuid)
returns table (member_id uuid, has_push boolean)
language sql stable security definer set search_path = '' as $$
  select hm.id, exists (select 1 from public.push_subscriptions s where s.user_id = hm.user_id)
  from public.household_members hm
  where hm.household_id = p_household and public.is_member(p_household);
$$;
revoke execute on function public.household_push_status(uuid) from public, anon;
grant execute on function public.household_push_status(uuid) to authenticated;
