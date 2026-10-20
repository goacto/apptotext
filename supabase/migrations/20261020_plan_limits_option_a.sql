-- AppToText plan limits, Option A (approved by Zach 2026-10-20). Prices unchanged.
-- New limits live in src/lib/subscription.ts: free 1 lifetime, standard 3/mo, pro 6/mo, master 10/mo.
-- Additive and idempotent. Back up affected profile rows before running it.

alter table public.profiles add column if not exists generation_limit_override integer;
alter table public.profiles add column if not exists grandfathered_plan text;

-- 1) Grandfather current paying subscribers at their old per-cycle limit while they stay on that plan.
update public.profiles
set generation_limit_override = case subscription_status
      when 'standard' then 10 when 'pro' then 25 when 'master' then 50 end,
    grandfathered_plan = subscription_status
where subscription_status in ('standard','pro','master')
  and stripe_subscription_id is not null
  and grandfathered_plan is null;

-- 2) Existing free users keep their remaining generations: old free limit was 3 lifetime.
--    Only users who still have generations left need an override (count < 3); others already have 0 left.
update public.profiles
set generation_limit_override = 3,
    grandfathered_plan = 'free'
where coalesce(subscription_status, 'free') not in ('standard','pro','master')
  and coalesce(generation_count, 0) < 3
  and grandfathered_plan is null;
