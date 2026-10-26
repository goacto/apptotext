-- Security advisor follow-up. Not applied by this change; review before running on the project.
--
-- 1. public.public_profiles was SECURITY DEFINER (security_invoker = false), so it bypassed
--    RLS and showed every profile's public columns. It is now security invoker.
--
--    Current RLS does NOT let other users' public fields show:
--      - anon has SELECT revoked on public.profiles (20261020_lock_profile_billing.sql)
--      - authenticated may SELECT only their own row
--        ("Users can view own profile", auth.uid() = id)
--    After this migration, anon queries against the view fail for lack of table SELECT,
--    and a signed-in user only receives their own row. The leaderboard
--    (src/app/leaderboard/page.tsx reads public_profiles) will list only that user
--    until a policy is added.
--
--    Do not add FOR SELECT ... USING (true) while authenticated still has table-level
--    SELECT. That grant was never revoked for authenticated, so the policy would expose
--    email, stripe ids, and billing columns on every row and undo the billing lock.
--
--    Policy that would show only the intended public fields
--    (id, display_name, avatar_url, total_xp, current_streak, longest_streak):
--      revoke table-level SELECT on public.profiles from anon and authenticated;
--      grant SELECT on those six columns only to anon and authenticated;
--      add a SELECT policy for anon and authenticated with USING (true).
--    That also hides private columns on the owner's own row. Browser and user-JWT
--    reads of email, subscription_status, generation_count, stripe_customer_id,
--    stripe_subscription_id, preferred_ai_provider, and guides_private
--    (dashboard, profile, pricing, settings, subscription.ts, Stripe routes)
--    would have to move to the service role first. That split is not in this file.

create or replace view public.public_profiles
  with (security_invoker = true) as
  select id, display_name, avatar_url, total_xp, current_streak, longest_streak
  from public.profiles;

alter view public.public_profiles set (security_invoker = true);

revoke all on public.public_profiles from public, anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

-- 2. handle_new_user() is only the on_auth_user_created trigger on auth.users
--    (supabase-schema.sql). No route or client calls it. Trigger execution does not
--    use the anon or authenticated EXECUTE grant. Revoke those, and PUBLIC, so the
--    function is not an RPC. Re-grant the auth admin role in case it previously
--    relied on the PUBLIC grant to fire the trigger.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

-- 3. library_gone(text, integer) is a security definer boolean used by the Next.js
--    proxy (src/lib/library/gone.ts). That caller now uses the service role, which
--    already has EXECUTE. anon and PUBLIC lose EXECUTE. authenticated keeps it:
--    the function returns only a boolean about a public repo key.
revoke execute on function public.library_gone(text, integer) from public, anon;

-- 4. Pin search_path on the two functions the advisor flagged. Bodies already
--    schema-qualify public.profiles. Matches the other functions in this repo.
alter function public.handle_new_user() set search_path = public;
alter function public.increment_xp(uuid, integer) set search_path = public;
