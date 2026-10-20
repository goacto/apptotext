import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("increment_xp is server-only", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261020_increment_xp_server_only.sql"),
    "utf8"
  ).toLowerCase();

  it("revokes execute from public, anon and authenticated", () => {
    expect(sql).toMatch(
      /revoke execute on function public\.increment_xp\(uuid, integer\) from public, anon, authenticated/
    );
  });

  it("keeps execute for service_role", () => {
    expect(sql).toMatch(/grant execute on function public\.increment_xp\(uuid, integer\) to service_role/);
  });
});
