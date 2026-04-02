-- AppToText Database Schema for Supabase
-- Safe to run on projects with existing tables (e.g. shared GOACTO project)

-- ============================================================
-- PROFILES: Add AppToText columns to existing profiles table
-- ============================================================
do $$
begin
  -- Add columns if they don't already exist
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'total_xp') then
    alter table public.profiles add column total_xp integer not null default 0;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'current_streak') then
    alter table public.profiles add column current_streak integer not null default 0;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'longest_streak') then
    alter table public.profiles add column longest_streak integer not null default 0;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'last_activity') then
    alter table public.profiles add column last_activity timestamp with time zone default now();
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'preferred_ai_provider') then
    alter table public.profiles add column preferred_ai_provider text not null default 'claude';
  end if;
end $$;

-- ============================================================
-- NEW TABLES: Create only if they don't exist
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
-- POLICIES: Drop and recreate to avoid "already exists" errors
-- ============================================================

-- Profiles
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Badges
drop policy if exists "Badges are viewable by everyone" on public.user_badges;
create policy "Badges are viewable by everyone"
  on public.user_badges for select using (true);

drop policy if exists "Users can insert own badges" on public.user_badges;
create policy "Users can insert own badges"
  on public.user_badges for insert with check (auth.uid() = user_id);

-- Conversions
drop policy if exists "Public conversions viewable by all" on public.conversions;
create policy "Public conversions viewable by all"
  on public.conversions for select
  using (is_public = true or auth.uid() = user_id);

drop policy if exists "Users can create conversions" on public.conversions;
create policy "Users can create conversions"
  on public.conversions for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own conversions" on public.conversions;
create policy "Users can update own conversions"
  on public.conversions for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own conversions" on public.conversions;
create policy "Users can delete own conversions"
  on public.conversions for delete using (auth.uid() = user_id);

-- Chapters
drop policy if exists "Chapters viewable with conversion access" on public.chapters;
create policy "Chapters viewable with conversion access"
  on public.chapters for select
  using (
    exists (
      select 1 from public.conversions
      where id = chapters.conversion_id
        and (is_public = true or user_id = auth.uid())
    )
  );

drop policy if exists "Users can insert chapters for own conversions" on public.chapters;
create policy "Users can insert chapters for own conversions"
  on public.chapters for insert
  with check (
    exists (
      select 1 from public.conversions
      where id = chapters.conversion_id and user_id = auth.uid()
    )
  );

-- Flashcards
drop policy if exists "Flashcards viewable with conversion access" on public.flashcards;
create policy "Flashcards viewable with conversion access"
  on public.flashcards for select
  using (
    exists (
      select 1 from public.conversions
      where id = flashcards.conversion_id
        and (is_public = true or user_id = auth.uid())
    )
  );

drop policy if exists "Users can insert flashcards for own conversions" on public.flashcards;
create policy "Users can insert flashcards for own conversions"
  on public.flashcards for insert
  with check (
    exists (
      select 1 from public.conversions
      where id = flashcards.conversion_id and user_id = auth.uid()
    )
  );

-- Flashcard progress
drop policy if exists "Users can view own flashcard progress" on public.flashcard_progress;
create policy "Users can view own flashcard progress"
  on public.flashcard_progress for select using (auth.uid() = user_id);

drop policy if exists "Users can manage own flashcard progress" on public.flashcard_progress;
create policy "Users can manage own flashcard progress"
  on public.flashcard_progress for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own flashcard progress" on public.flashcard_progress;
create policy "Users can update own flashcard progress"
  on public.flashcard_progress for update using (auth.uid() = user_id);

-- Quiz questions
drop policy if exists "Quiz questions viewable with conversion access" on public.quiz_questions;
create policy "Quiz questions viewable with conversion access"
  on public.quiz_questions for select
  using (
    exists (
      select 1 from public.conversions
      where id = quiz_questions.conversion_id
        and (is_public = true or user_id = auth.uid())
    )
  );

drop policy if exists "Users can insert quiz questions for own conversions" on public.quiz_questions;
create policy "Users can insert quiz questions for own conversions"
  on public.quiz_questions for insert
  with check (
    exists (
      select 1 from public.conversions
      where id = quiz_questions.conversion_id and user_id = auth.uid()
    )
  );

-- Quiz sessions
drop policy if exists "Users can view own quiz sessions" on public.quiz_sessions;
create policy "Users can view own quiz sessions"
  on public.quiz_sessions for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own quiz sessions" on public.quiz_sessions;
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
