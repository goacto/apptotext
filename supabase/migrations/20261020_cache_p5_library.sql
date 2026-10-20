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
