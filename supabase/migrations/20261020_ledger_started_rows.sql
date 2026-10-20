-- Ledger capture for killed/aborted runs: a "started" row is written before each AI call
-- and finalized afterwards. Rows left "started" mean the invocation was killed; their tokens/cost are estimates.
alter table public.generations drop constraint if exists generations_outcome_check;
alter table public.generations add constraint generations_outcome_check
  check (outcome in ('generated', 'cache_hit', 'failed', 'refused', 'started', 'aborted'));
alter table public.generations add column if not exists usage_estimated boolean not null default false;
alter table public.generations add column if not exists finished_at timestamptz;
