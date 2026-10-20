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
