-- Saved-Guide Cache REQ v0.1, PR 2: shared cache, single-flight claims, guides_private.
-- Additive only. Cache tables are service-role only (D9): no client grants, RLS on, no policies.

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
