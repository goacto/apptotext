-- PR 4: removal requests, do-not-cache, withdrawal + purge, visibility strikes, daily job bookkeeping.
-- Additive only. All new tables are service-role only.

alter table public.repos add column if not exists first_strike_at timestamptz;

create table if not exists public.removal_requests (
  id uuid primary key default gen_random_uuid(),
  repo_key text not null,
  github_repo_id bigint,
  type text not null check (type in ('remove', 'remove_never', 'report')),
  email text not null,
  reason text,
  verify_method text check (verify_method in ('github_signin', 'repo_topic', 'repo_file', 'manual')),
  verify_token text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'need_info', 'rejected', 'closed')),
  events jsonb not null default '[]'::jsonb,
  ip_hash text,
  requester_user_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists removal_requests_ip_recent on public.removal_requests (ip_hash, created_at desc);
create index if not exists removal_requests_status on public.removal_requests (status, created_at desc);

create table if not exists public.do_not_cache (
  id uuid primary key default gen_random_uuid(),
  github_repo_id bigint,
  repo_key text not null,
  owner text,
  owner_wildcard boolean not null default false,
  reason text,
  request_id uuid references public.removal_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists do_not_cache_repo_id on public.do_not_cache (github_repo_id) where github_repo_id is not null;
create index if not exists do_not_cache_repo_key on public.do_not_cache (repo_key);
create index if not exists do_not_cache_owner on public.do_not_cache (lower(owner)) where owner_wildcard;

create table if not exists public.cron_runs (
  job text primary key,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_result jsonb
);

alter table public.removal_requests enable row level security;
alter table public.do_not_cache enable row level security;
alter table public.cron_runs enable row level security;
revoke all on public.removal_requests, public.do_not_cache, public.cron_runs from anon, authenticated;

-- FR-7.5: is this repo on the do-not-cache list (by id, key, or owner wildcard)?
create or replace function public.is_do_not_cache(p_github_repo_id bigint, p_repo_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.do_not_cache d
     where (p_github_repo_id is not null and d.github_repo_id = p_github_repo_id)
        or d.repo_key = lower(p_repo_key)
        or (d.owner_wildcard and lower(d.owner) = split_part(lower(p_repo_key), '/', 1))
  );
$$;
revoke execute on function public.is_do_not_cache(bigint, text) from public, anon, authenticated;
grant execute on function public.is_do_not_cache(bigint, text) to service_role;

-- FR-5.5 / FR-7.4: withdraw every version of a repo and purge its shared content immediately
-- (stronger than the 24h purge SLA). The guide_versions row stays as the tombstone.
-- FR-5.6: users' own copies stay, but their Share toggle is forced off.
create or replace function public.withdraw_repo(p_github_repo_id bigint, p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  update public.guide_versions
     set status = 'withdrawn', withdrawn_reason = p_reason, withdrawn_at = coalesce(withdrawn_at, now()),
         listed = false, indexable = false, lease_owner = null, lease_expires_at = null
   where github_repo_id = p_github_repo_id and status <> 'withdrawn';
  select array_agg(id) into v_ids from public.guide_versions
   where github_repo_id = p_github_repo_id and status = 'withdrawn' and purged_at is null;
  if v_ids is not null then
    delete from public.guide_chapters where guide_version_id = any(v_ids);
    delete from public.guide_flashcards where guide_version_id = any(v_ids);
    delete from public.guide_quiz_questions where guide_version_id = any(v_ids);
    update public.guide_versions set purged_at = now() where id = any(v_ids);
  end if;
  update public.conversions set is_public = false where github_repo_id = p_github_repo_id and is_public;
  return coalesce(array_length(v_ids, 1), 0);
end $$;
revoke execute on function public.withdraw_repo(bigint, text) from public, anon, authenticated;
grant execute on function public.withdraw_repo(bigint, text) to service_role;

-- FR-5.5: purge content of any withdrawn version not yet purged (daily job safety net).
create or replace function public.purge_withdrawn_versions() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.guide_versions where status = 'withdrawn' and purged_at is null;
  if v_ids is null then return 0; end if;
  delete from public.guide_chapters where guide_version_id = any(v_ids);
  delete from public.guide_flashcards where guide_version_id = any(v_ids);
  delete from public.guide_quiz_questions where guide_version_id = any(v_ids);
  update public.guide_versions set purged_at = now() where id = any(v_ids);
  return array_length(v_ids, 1);
end $$;
revoke execute on function public.purge_withdrawn_versions() from public, anon, authenticated;
grant execute on function public.purge_withdrawn_versions() to service_role;

-- FR-5.6: Share cannot be turned on for a conversion of a private or do-not-cache repo.
create or replace function public.guard_conversion_share() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_public and not coalesce(old.is_public, false) and new.github_repo_id is not null then
    if public.is_do_not_cache(new.github_repo_id, coalesce(new.repo_key, ''))
       or exists (select 1 from public.repos r where r.github_repo_id = new.github_repo_id and not r.is_public) then
      raise exception 'Sharing is turned off for this repository.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_conversion_share() from public, anon, authenticated;
drop trigger if exists guard_conversion_share on public.conversions;
create trigger guard_conversion_share before update of is_public on public.conversions
  for each row execute function public.guard_conversion_share();

-- FR-5.3/5.5: "Keep my guides private" now also purges the shared content immediately
-- (previously purge waited for a job). Users' own conversions are untouched.
create or replace function public.withdraw_private_user_guides() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  if new.guides_private and not coalesce(old.guides_private, false) then
    update public.guide_versions
       set status = 'withdrawn', withdrawn_reason = 'user_private', withdrawn_at = now(), listed = false, indexable = false
     where generated_by = new.id and status in ('ready', 'generating');
    select array_agg(id) into v_ids from public.guide_versions
     where generated_by = new.id and status = 'withdrawn' and purged_at is null;
    if v_ids is not null then
      delete from public.guide_chapters where guide_version_id = any(v_ids);
      delete from public.guide_flashcards where guide_version_id = any(v_ids);
      delete from public.guide_quiz_questions where guide_version_id = any(v_ids);
      update public.guide_versions set purged_at = now() where id = any(v_ids);
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.withdraw_private_user_guides() from public, anon, authenticated;
