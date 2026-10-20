-- PR 6a: durable rate limits (FR-8.1) and daily AI spend (FR-8.3). Additive; service-role only.
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Sliding-window approximation over two fixed windows. Atomic per call.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_now double precision := extract(epoch from clock_timestamp());
  v_start double precision := floor(v_now / p_window_seconds) * p_window_seconds;
  v_cur integer;
  v_prev integer;
  v_weight double precision;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, to_timestamp(v_start), 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning count into v_cur;
  select count into v_prev from public.rate_limits
   where key = p_key and window_start = to_timestamp(v_start - p_window_seconds);
  v_weight := 1 - (v_now - v_start) / p_window_seconds;
  return (coalesce(v_prev, 0) * v_weight + v_cur) <= p_max;
end $$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

create or replace function public.prune_rate_limits() returns integer
language sql security definer set search_path = public as $$
  with d as (delete from public.rate_limits where window_start < now() - interval '2 days' returning 1)
  select count(*)::integer from d;
$$;
revoke execute on function public.prune_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_rate_limits() to service_role;

-- FR-8.3: AI dollars spent today in America/New_York (measured + in-flight estimates).
create or replace function public.ai_spend_today_et() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0)
    from public.generations
   where created_at >= (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York')
     and outcome in ('generated', 'failed', 'aborted', 'started');
$$;
revoke execute on function public.ai_spend_today_et() from public, anon, authenticated;
grant execute on function public.ai_spend_today_et() to service_role;

create index if not exists generations_created_at on public.generations (created_at desc);
