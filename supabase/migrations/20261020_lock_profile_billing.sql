-- PR 0 (Saved-Guide Cache REQ v0.1, G1 + G2): lock profile billing columns, stop public profile reads.
-- Additive and idempotent. The service role (webhook, generate route, checkout route) still writes everything.

-- G2: profiles are readable only by their owner. Leaderboard reads the safe public_profiles view.
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select to authenticated using (auth.uid() = id);
revoke select on public.profiles from anon;

create or replace view public.public_profiles
  with (security_invoker = false) as
  select id, display_name, avatar_url, total_xp, current_streak, longest_streak
  from public.profiles;
revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

-- G1: clients may update only non-billing columns of their own row.
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;
grant update (display_name, avatar_url, preferred_ai_provider, total_xp, current_streak, longest_streak, last_activity)
  on public.profiles to authenticated;

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Profiles are created only by the SECURITY DEFINER handle_new_user trigger.
drop policy if exists "Users can insert own profile" on public.profiles;

-- Belt and braces: even if a grant is added back later, client roles cannot change billing/identity columns.
create or replace function public.guard_profile_billing_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.id is distinct from old.id
    or new.email is distinct from old.email
    or new.subscription_status is distinct from old.subscription_status
    or new.generation_count is distinct from old.generation_count
    or new.generation_reset_at is distinct from old.generation_reset_at
    or new.generation_limit_override is distinct from old.generation_limit_override
    or new.grandfathered_plan is distinct from old.grandfathered_plan
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'profile billing columns are read-only for clients' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_billing_columns on public.profiles;
create trigger guard_profile_billing_columns
  before update on public.profiles
  for each row execute function public.guard_profile_billing_columns();
