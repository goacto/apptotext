-- Saved-Guide Cache REQ v0.1, PR 1: repo identity, HEAD SHA cache, generations ledger (shadow mode).
-- Additive only. New tables are service-role only (RLS on, no policies, no client grants).

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
