-- AppToText Database Schema for Supabase
-- Fresh install — creates all tables from scratch

-- ============================================================
-- PROFILES: User profiles (extends Supabase auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text not null default '',
  avatar_url text,
  total_xp integer not null default 0,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_activity timestamp with time zone default now(),
  preferred_ai_provider text not null default 'claude',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'free',
  generation_count integer not null default 0,
  generation_reset_at timestamp with time zone default now(),
  generation_limit_override integer,          -- grandfathered limit (see supabase/migrations/20261020_plan_limits_option_a.sql)
  grandfathered_plan text,
  created_at timestamp with time zone default now()
);

-- ============================================================
-- TABLES
-- ============================================================

-- Badges earned by users
create table if not exists public.user_badges (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  badge_id text not null,
  earned_at timestamp with time zone default now(),
  unique(user_id, badge_id)
);

-- Conversions (source URL -> textbook)
create table if not exists public.conversions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  source_url text not null,
  source_type text not null check (source_type in ('github', 'website')),
  source_content text not null default '',
  title text not null,
  description text not null default '',
  ai_provider text not null default 'claude',
  is_public boolean not null default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Textbook chapters
create table if not exists public.chapters (
  id uuid default gen_random_uuid() primary key,
  conversion_id uuid references public.conversions on delete cascade not null,
  level integer not null check (level in (101, 201, 301, 401, 501)),
  chapter_number integer not null,
  title text not null,
  content text not null,
  key_concepts text[] not null default '{}',
  created_at timestamp with time zone default now()
);

-- Flashcards
create table if not exists public.flashcards (
  id uuid default gen_random_uuid() primary key,
  conversion_id uuid references public.conversions on delete cascade not null,
  level integer not null check (level in (101, 201, 301, 401, 501)),
  front text not null,
  back text not null,
  difficulty integer not null default 1 check (difficulty between 1 and 5),
  created_at timestamp with time zone default now()
);

-- Flashcard progress (spaced repetition tracking)
create table if not exists public.flashcard_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  flashcard_id uuid references public.flashcards on delete cascade not null,
  ease_factor real not null default 2.5,
  interval_days integer not null default 1,
  repetitions integer not null default 0,
  next_review timestamp with time zone default now(),
  last_reviewed timestamp with time zone,
  unique(user_id, flashcard_id)
);

-- Quiz questions
create table if not exists public.quiz_questions (
  id uuid default gen_random_uuid() primary key,
  conversion_id uuid references public.conversions on delete cascade not null,
  level integer not null check (level in (101, 201, 301, 401, 501)),
  question text not null,
  options jsonb not null,
  correct_answer integer not null,
  explanation text not null default '',
  created_at timestamp with time zone default now()
);

-- Quiz sessions
create table if not exists public.quiz_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  conversion_id uuid references public.conversions on delete cascade not null,
  level integer not null check (level in (101, 201, 301, 401, 501)),
  score integer not null default 0,
  total_questions integer not null,
  xp_earned integer not null default 0,
  completed_at timestamp with time zone default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.user_badges enable row level security;
alter table public.conversions enable row level security;
alter table public.chapters enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_progress enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_sessions enable row level security;

-- ============================================================
-- POLICIES
-- ============================================================

-- Profiles
-- Owner-readable only; billing columns locked (column grants + guard trigger).
-- Full definitions incl. public_profiles view: supabase/migrations/20261020_lock_profile_billing.sql
create policy "Users can view own profile"
  on public.profiles for select to authenticated using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Badges
create policy "Badges are viewable by everyone"
  on public.user_badges for select using (true);

create policy "Users can insert own badges"
  on public.user_badges for insert with check (auth.uid() = user_id);

-- Conversions
create policy "Public conversions viewable by all"
  on public.conversions for select
  using (is_public = true or auth.uid() = user_id);

create policy "Users can create conversions"
  on public.conversions for insert with check (auth.uid() = user_id);

create policy "Users can update own conversions"
  on public.conversions for update using (auth.uid() = user_id);

create policy "Users can delete own conversions"
  on public.conversions for delete using (auth.uid() = user_id);

-- Chapters
create policy "Chapters viewable with conversion access"
  on public.chapters for select
  using (
    exists (
      select 1 from public.conversions
      where id = chapters.conversion_id
        and (is_public = true or user_id = auth.uid())
    )
  );

create policy "Users can insert chapters for own conversions"
  on public.chapters for insert
  with check (
    exists (
      select 1 from public.conversions
      where id = chapters.conversion_id and user_id = auth.uid()
    )
  );

-- Flashcards
create policy "Flashcards viewable with conversion access"
  on public.flashcards for select
  using (
    exists (
      select 1 from public.conversions
      where id = flashcards.conversion_id
        and (is_public = true or user_id = auth.uid())
    )
  );

create policy "Users can insert flashcards for own conversions"
  on public.flashcards for insert
  with check (
    exists (
      select 1 from public.conversions
      where id = flashcards.conversion_id and user_id = auth.uid()
    )
  );

-- Flashcard progress
create policy "Users can view own flashcard progress"
  on public.flashcard_progress for select using (auth.uid() = user_id);

create policy "Users can manage own flashcard progress"
  on public.flashcard_progress for insert with check (auth.uid() = user_id);

create policy "Users can update own flashcard progress"
  on public.flashcard_progress for update using (auth.uid() = user_id);

-- Quiz questions
create policy "Quiz questions viewable with conversion access"
  on public.quiz_questions for select
  using (
    exists (
      select 1 from public.conversions
      where id = quiz_questions.conversion_id
        and (is_public = true or user_id = auth.uid())
    )
  );

create policy "Users can insert quiz questions for own conversions"
  on public.quiz_questions for insert
  with check (
    exists (
      select 1 from public.conversions
      where id = quiz_questions.conversion_id and user_id = auth.uid()
    )
  );

-- Quiz sessions
create policy "Users can view own quiz sessions"
  on public.quiz_sessions for select using (auth.uid() = user_id);

create policy "Users can insert own quiz sessions"
  on public.quiz_sessions for insert with check (auth.uid() = user_id);

-- ============================================================
-- TRIGGER: Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- FUNCTION: Increment user XP
-- ============================================================
create or replace function public.increment_xp(user_id_input uuid, xp_amount integer)
returns void as $$
begin
  update public.profiles
  set total_xp = total_xp + xp_amount,
      last_activity = now()
  where id = user_id_input;
end;
$$ language plpgsql security definer;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_conversions_user_id on public.conversions(user_id);
create index if not exists idx_chapters_conversion_id on public.chapters(conversion_id);
create index if not exists idx_flashcards_conversion_id on public.flashcards(conversion_id);
create index if not exists idx_flashcard_progress_user_id on public.flashcard_progress(user_id);
create index if not exists idx_flashcard_progress_next_review on public.flashcard_progress(next_review);
create index if not exists idx_quiz_sessions_user_id on public.quiz_sessions(user_id);
create index if not exists idx_profiles_total_xp on public.profiles(total_xp desc);

-- ============================================================
-- PROFILE BILLING LOCK (same as supabase/migrations/20261020_lock_profile_billing.sql)
-- ============================================================
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

-- increment_xp is server-only (supabase/migrations/20261020_increment_xp_server_only.sql)
revoke execute on function public.increment_xp(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_xp(uuid, integer) to service_role;

-- ============================================================
-- SAVED-GUIDE CACHE PR 1 (same as supabase/migrations/20261020_cache_p1_repo_identity_ledger.sql)
-- ============================================================
create table if not exists public.repos (
  github_repo_id bigint primary key,
  repo_key text not null unique,
  full_name text not null,
  default_branch text not null,
  is_public boolean not null default false,
  language text,
  stars integer not null default 0,
  has_readme boolean,
  last_checked_at timestamptz not null default now(),
  private_strikes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.repo_aliases (
  repo_key text primary key,
  github_repo_id bigint not null references public.repos(github_repo_id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.repo_heads (
  github_repo_id bigint primary key references public.repos(github_repo_id) on delete cascade,
  head_sha char(40) not null,
  etag text,
  looked_up_at timestamptz not null default now()
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  conversion_id uuid references public.conversions(id) on delete set null,
  guide_version_id uuid,
  repo_key text,
  level integer,
  phase text not null,
  outcome text not null check (outcome in ('generated', 'cache_hit', 'failed', 'refused')),
  cache_eligible boolean,
  ai_provider text,
  model text,
  prompt_version text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(8,4),
  quota_charged boolean not null default false,
  would_hit boolean,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists idx_generations_created_at on public.generations(created_at desc);
create index if not exists idx_generations_repo_key on public.generations(repo_key);

alter table public.repos enable row level security;
alter table public.repo_aliases enable row level security;
alter table public.repo_heads enable row level security;
alter table public.generations enable row level security;
revoke all on public.repos, public.repo_aliases, public.repo_heads, public.generations from anon, authenticated;

-- Conversions: repo identity pinned to a commit. Set server-side only.
alter table public.conversions add column if not exists repo_key text;
alter table public.conversions add column if not exists github_repo_id bigint;
alter table public.conversions add column if not exists commit_sha char(40);
create index if not exists idx_conversions_repo_key on public.conversions(repo_key);

-- Clients must not set repo identity or rewrite source content (prevents cache poisoning, D9).
revoke insert, update on public.conversions from anon, authenticated;
grant insert (user_id, source_url, source_type, source_content, title, description, ai_provider, is_public)
  on public.conversions to authenticated;
grant update (is_public, title, description, updated_at) on public.conversions to authenticated;

-- ============================================================
-- SAVED-GUIDE CACHE PR 2 (same as supabase/migrations/20261020_cache_p2_shared_cache.sql)
-- ============================================================
create table if not exists public.guide_versions (
  id uuid primary key default gen_random_uuid(),
  github_repo_id bigint not null,
  repo_key text not null,
  commit_sha char(40) not null,
  level integer not null check (level in (101, 201, 301, 401, 501)),
  prompt_version text not null,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed', 'withdrawn')),
  lease_owner uuid,
  lease_expires_at timestamptz,
  generated_by uuid,
  ai_provider text,
  model text,
  source_hash text,
  cost_usd numeric(8,4),
  word_count integer,
  indexable boolean not null default false,
  listed boolean not null default false,
  withdrawn_reason text,
  quota_user uuid,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  withdrawn_at timestamptz,
  purged_at timestamptz,
  unique (repo_key, commit_sha, level, prompt_version)
);
create index if not exists idx_guide_versions_ready
  on public.guide_versions (repo_key, level, ready_at desc) where status = 'ready';
create index if not exists idx_guide_versions_generated_by on public.guide_versions (generated_by);

create table if not exists public.guide_chapters (
  id uuid primary key default gen_random_uuid(),
  guide_version_id uuid not null references public.guide_versions(id) on delete cascade,
  chapter_number integer not null,
  title text not null,
  content text not null,
  key_concepts text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (guide_version_id, chapter_number)
);

create table if not exists public.guide_flashcards (
  id uuid primary key default gen_random_uuid(),
  guide_version_id uuid not null references public.guide_versions(id) on delete cascade,
  front text not null,
  back text not null,
  difficulty integer not null default 3,
  created_at timestamptz not null default now()
);

create table if not exists public.guide_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  guide_version_id uuid not null references public.guide_versions(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_answer integer not null,
  explanation text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_guide_flashcards_version on public.guide_flashcards (guide_version_id);
create index if not exists idx_guide_quiz_version on public.guide_quiz_questions (guide_version_id);

alter table public.guide_versions enable row level security;
alter table public.guide_chapters enable row level security;
alter table public.guide_flashcards enable row level security;
alter table public.guide_quiz_questions enable row level security;
revoke all on public.guide_versions, public.guide_chapters, public.guide_flashcards, public.guide_quiz_questions
  from anon, authenticated;

-- Copied content is marked with its source version.
alter table public.chapters add column if not exists guide_version_id uuid;
alter table public.flashcards add column if not exists guide_version_id uuid;
alter table public.quiz_questions add column if not exists guide_version_id uuid;

-- FR-5.1: "Keep my guides private" (default off = shared, Zach Q1).
alter table public.profiles add column if not exists guides_private boolean not null default false;
grant update (guides_private) on public.profiles to authenticated;

-- FR-4.1 / FR-4.3: atomic claim with lease takeover. Service role only.
create or replace function public.claim_guide_version(
  p_github_repo_id bigint,
  p_repo_key text,
  p_commit_sha text,
  p_level integer,
  p_prompt_version text,
  p_user uuid,
  p_provider text,
  p_model text,
  p_source_hash text,
  p_lease_seconds integer default 300
) returns table (version_id uuid, claimed boolean, status text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v public.guide_versions;
begin
  insert into public.guide_versions as g (github_repo_id, repo_key, commit_sha, level, prompt_version, status,
    lease_owner, lease_expires_at, generated_by, ai_provider, model, source_hash)
  values (p_github_repo_id, p_repo_key, p_commit_sha, p_level, p_prompt_version, 'generating',
    p_user, now() + make_interval(secs => p_lease_seconds), p_user, p_provider, p_model, p_source_hash)
  on conflict (repo_key, commit_sha, level, prompt_version) do nothing
  returning * into v;
  if found then
    return query select v.id, true, v.status;
    return;
  end if;

  select * into v from public.guide_versions g
   where g.repo_key = p_repo_key and g.commit_sha = p_commit_sha and g.level = p_level and g.prompt_version = p_prompt_version
   for update;

  -- Same owner re-entering, an expired lease, or a failed attempt: take over and discard partial content.
  if (v.status = 'generating' and (v.lease_owner = p_user or v.lease_expires_at < now())) or v.status = 'failed' then
    if not (v.status = 'generating' and v.lease_owner = p_user) then
      delete from public.guide_chapters where guide_version_id = v.id;
      delete from public.guide_flashcards where guide_version_id = v.id;
      delete from public.guide_quiz_questions where guide_version_id = v.id;
    end if;
    update public.guide_versions g set status = 'generating', lease_owner = p_user, generated_by = p_user,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds), ai_provider = p_provider, model = p_model,
      source_hash = p_source_hash, quota_user = case when v.lease_owner = p_user then g.quota_user else null end
     where g.id = v.id;
    return query select v.id, true, 'generating'::text;
    return;
  end if;

  return query select v.id, false, v.status;
end $$;
revoke execute on function public.claim_guide_version(bigint, text, text, integer, text, uuid, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_guide_version(bigint, text, text, integer, text, uuid, text, text, text, integer)
  to service_role;

-- FR-5.3: turning "Keep my guides private" on withdraws that user's shared versions immediately.
create or replace function public.withdraw_private_user_guides() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.guides_private and not coalesce(old.guides_private, false) then
    update public.guide_versions
       set status = 'withdrawn', withdrawn_reason = 'user_private', withdrawn_at = now(), listed = false, indexable = false
     where generated_by = new.id and status in ('ready', 'generating');
  end if;
  return new;
end $$;
revoke execute on function public.withdraw_private_user_guides() from public, anon, authenticated;

drop trigger if exists withdraw_private_user_guides on public.profiles;
create trigger withdraw_private_user_guides
  after update of guides_private on public.profiles
  for each row execute function public.withdraw_private_user_guides();

-- Bug fix: a retried or concurrent chapter-1 request charged quota twice and duplicated chapter rows.
-- 1) One chapter row per (conversion, level, chapter_number); the server upserts.
create unique index if not exists chapters_conversion_level_number_key
  on public.chapters (conversion_id, level, chapter_number);

-- 2) At most one quota charge per (conversion, level), recorded atomically.
create table if not exists public.quota_charges (
  conversion_id uuid not null references public.conversions(id) on delete cascade,
  level integer not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  guide_version_id uuid,
  created_at timestamptz not null default now(),
  primary key (conversion_id, level)
);
alter table public.quota_charges enable row level security;
revoke all on public.quota_charges from anon, authenticated;

-- Returns true only when this call actually charged. No charge when:
--  * this (conversion, level) was already charged, or
--  * the user already paid for the shared guide version (guide_versions.quota_user).
create or replace function public.charge_generation_once(
  p_user uuid, p_conversion uuid, p_level integer, p_version uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_payer uuid;
  v_rows integer;
begin
  if p_version is not null then
    select quota_user into v_payer from public.guide_versions where id = p_version for update;
    if v_payer = p_user then
      return false;
    end if;
  end if;

  insert into public.quota_charges (conversion_id, level, user_id, guide_version_id)
  values (p_conversion, p_level, p_user, p_version)
  on conflict (conversion_id, level) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  update public.profiles set generation_count = coalesce(generation_count, 0) + 1 where id = p_user;
  if p_version is not null then
    update public.guide_versions set quota_user = p_user where id = p_version and quota_user is null;
  end if;
  return true;
end $$;
revoke execute on function public.charge_generation_once(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.charge_generation_once(uuid, uuid, integer, uuid) to service_role;

-- Ledger capture for killed/aborted runs: a "started" row is written before each AI call
-- and finalized afterwards. Rows left "started" mean the invocation was killed; their tokens/cost are estimates.
alter table public.generations drop constraint if exists generations_outcome_check;
alter table public.generations add constraint generations_outcome_check
  check (outcome in ('generated', 'cache_hit', 'failed', 'refused', 'started', 'aborted'));
alter table public.generations add column if not exists usage_estimated boolean not null default false;
alter table public.generations add column if not exists finished_at timestamptz;

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

-- PR 5: public library. Additive. One read-only function the proxy can call with the anon key.
-- library_gone(repo, level): true when nothing is listed for that repo/level any more AND it was
-- withdrawn or is on the do-not-cache list (-> 410 + noindex). Otherwise false (page renders or 404s).
-- Returns only a boolean about a public repo key; no content, users or reasons.
create or replace function public.library_gone(p_repo_key text, p_level integer default null)
returns boolean
language sql stable security definer set search_path = public as $$
  with r as (
    select github_repo_id from public.repos where repo_key = lower(p_repo_key)
    union
    select github_repo_id from public.repo_aliases where repo_key = lower(p_repo_key)
  )
  select
    not exists (
      select 1 from public.guide_versions v
       where v.github_repo_id in (select github_repo_id from r)
         and v.status = 'ready' and v.listed
         and (p_level is null or v.level = p_level)
    )
    and (
      exists (
        select 1 from public.guide_versions v
         where v.github_repo_id in (select github_repo_id from r)
           and v.status = 'withdrawn'
           and (p_level is null or v.level = p_level)
      )
      or exists (
        select 1 from public.do_not_cache d
         where d.github_repo_id in (select github_repo_id from r) or d.repo_key = lower(p_repo_key)
      )
    );
$$;
revoke execute on function public.library_gone(text, integer) from public;
grant execute on function public.library_gone(text, integer) to anon, authenticated, service_role;

create index if not exists idx_guide_versions_listed
  on public.guide_versions (github_repo_id, level, ready_at desc) where status = 'ready' and listed;
