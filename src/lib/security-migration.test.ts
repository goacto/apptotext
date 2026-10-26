import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261026_security_definer_view_and_function_grants.sql"),
  "utf8"
);
const schema = readFileSync(join(process.cwd(), "supabase-schema.sql"), "utf8");

function withoutLineComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .toLowerCase();
}

describe("security definer migration", () => {
  const sql = withoutLineComments(migration);

  it("switches public_profiles to security invoker and keeps only public columns", () => {
    expect(sql).toContain("security_invoker = true");
    expect(sql).not.toContain("security_invoker = false");
    const view = sql.slice(sql.indexOf("create or replace view public.public_profiles"), sql.indexOf("from public.profiles;"));
    for (const column of ["id", "display_name", "avatar_url", "total_xp", "current_streak", "longest_streak"]) {
      expect(view).toContain(column);
    }
    for (const column of ["email", "stripe", "subscription", "generation"]) {
      expect(view).not.toContain(column);
    }
  });

  it("does not add a profiles policy that would reopen private columns", () => {
    expect(sql).not.toContain("create policy");
    expect(sql).not.toMatch(/grant select \([^)]*email/);
  });

  it("revokes anon and public execute on the flagged functions and pins search_path", () => {
    expect(sql).toContain("revoke execute on function public.handle_new_user() from public, anon, authenticated");
    expect(sql).toContain("revoke execute on function public.library_gone(text, integer) from public, anon");
    expect(sql).not.toContain("revoke execute on function public.library_gone(text, integer) from public, anon, authenticated");
    expect(sql).toContain("alter function public.handle_new_user() set search_path = public");
    expect(sql).toContain("alter function public.increment_xp(uuid, integer) set search_path = public");
    expect(sql).not.toMatch(/sk_live|service_role_key|eyj/);
  });

  it("keeps the fresh-install schema on the same view and grants", () => {
    const fresh = schema.toLowerCase();
    expect(fresh).toContain("with (security_invoker = true)");
    expect(fresh).not.toContain("security_invoker = false");
    expect(fresh).toContain("revoke execute on function public.handle_new_user() from public, anon, authenticated");
    expect(fresh).toContain("revoke execute on function public.library_gone(text, integer) from public, anon");
    expect(fresh).toContain("grant execute on function public.library_gone(text, integer) to authenticated, service_role");
    expect(fresh).toMatch(/function public\.handle_new_user\(\)[\s\S]*set search_path = public/);
    expect(fresh).toMatch(/function public\.increment_xp\(user_id_input uuid, xp_amount integer\)[\s\S]*set search_path = public/);
  });
});
