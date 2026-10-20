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
