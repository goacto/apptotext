import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const schema = readFileSync(join(process.cwd(), "supabase-schema.sql"), "utf8").toLowerCase();

function sliceBetween(sql: string, start: string, end: string): string {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from);
  return sql.slice(from, to + end.length);
}

describe("current database contract", () => {
  it("ships no 20261026 migration file", () => {
    const files = readdirSync(migrationsDir);
    expect(files.filter((name) => name.startsWith("20261026"))).toEqual([]);
    expect(
      existsSync(join(migrationsDir, "20261026_security_definer_view_and_function_grants.sql"))
    ).toBe(false);
  });

  it("keeps public_profiles security definer in the fresh-install schema", () => {
    expect(schema).toContain("with (security_invoker = false)");
    expect(schema).not.toContain("security_invoker = true");
  });

  it("keeps the anon execute grant on library_gone", () => {
    expect(schema).toContain(
      "grant execute on function public.library_gone(text, integer) to anon, authenticated, service_role"
    );
    expect(schema).not.toContain(
      "revoke execute on function public.library_gone(text, integer) from public, anon"
    );
  });

  it("leaves handle_new_user and increment_xp without a pinned search_path", () => {
    const handle = sliceBetween(
      schema,
      "create or replace function public.handle_new_user()",
      "$$ language plpgsql security definer;"
    );
    const increment = sliceBetween(
      schema,
      "create or replace function public.increment_xp(user_id_input uuid, xp_amount integer)",
      "$$ language plpgsql security definer;"
    );
    expect(handle).not.toContain("set search_path");
    expect(increment).not.toContain("set search_path");
    expect(schema).not.toContain("revoke execute on function public.handle_new_user()");
  });
});
