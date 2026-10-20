-- increment_xp is SECURITY DEFINER and takes an arbitrary user id, so any caller could add XP to anyone.
-- The app never calls it from the client. Make it server-only (service role).
revoke execute on function public.increment_xp(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_xp(uuid, integer) to service_role;
