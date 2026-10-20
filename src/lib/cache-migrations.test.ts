import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8").toLowerCase();

describe("PR 1 migration", () => {
  const sql = read("20261020_cache_p1_repo_identity_ledger.sql");
  it("new tables are service-role only", () => {
    for (const t of ["repos", "repo_aliases", "repo_heads", "generations"]) {
      expect(sql).toContain(`alter table public.${t} enable row level security`);
    }
    expect(sql).toMatch(/revoke all on public\.repos, public\.repo_aliases, public\.repo_heads, public\.generations from anon, authenticated/);
    expect(sql).not.toMatch(/create policy/);
  });
  it("clients cannot set repo identity on conversions", () => {
    const ins = sql.match(/grant insert \(([^)]*)\)\s+on public\.conversions/)![1];
    const upd = sql.match(/grant update \(([^)]*)\) on public\.conversions/)![1];
    for (const c of ["repo_key", "github_repo_id", "commit_sha"]) {
      expect(ins).not.toContain(c);
      expect(upd).not.toContain(c);
    }
    expect(upd).not.toContain("source_content");
  });
  it("ledger outcome is constrained", () => {
    expect(sql).toContain("check (outcome in ('generated', 'cache_hit', 'failed', 'refused'))");
  });
});
