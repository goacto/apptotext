import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261020_lock_profile_billing.sql"),
  "utf8"
).toLowerCase();

const LOCKED = [
  "subscription_status",
  "generation_count",
  "generation_reset_at",
  "generation_limit_override",
  "grandfathered_plan",
  "stripe_customer_id",
  "stripe_subscription_id",
  "email",
];

describe("PR 0 profile billing lock migration", () => {
  const grant = sql.match(/grant update \(([^)]*)\)\s+on public\.profiles to authenticated/);

  it("grants clients update on an explicit column allowlist only", () => {
    expect(grant).not.toBeNull();
    const cols = grant![1].split(",").map((c) => c.trim());
    expect(cols).toEqual(
      expect.arrayContaining(["display_name", "avatar_url", "preferred_ai_provider"])
    );
    for (const c of LOCKED) expect(cols).not.toContain(c);
  });

  it("revokes table-wide write and anon read on profiles", () => {
    expect(sql).toMatch(/revoke insert, update, delete.* on public\.profiles from anon, authenticated/);
    expect(sql).toMatch(/revoke select on public\.profiles from anon/);
    expect(sql).toContain('drop policy if exists "public profiles are viewable by everyone"');
    expect(sql).toMatch(/for select to authenticated using \(auth\.uid\(\) = id\)/);
  });

  it("guard trigger covers every locked billing column", () => {
    const fn = sql.slice(sql.indexOf("function public.guard_profile_billing_columns"));
    for (const c of LOCKED) expect(fn).toContain(`new.${c} is distinct from old.${c}`);
    expect(sql).toContain("before update on public.profiles");
  });

  it("public_profiles view exposes no email or stripe fields", () => {
    const view = sql.slice(sql.indexOf("create or replace view public.public_profiles"), sql.indexOf("from public.profiles;"));
    for (const c of ["email", "stripe", "subscription", "generation"]) expect(view).not.toContain(c);
  });
});
