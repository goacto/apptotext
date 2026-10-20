import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isComplete, pickBestVersions, wordCount } from "./guides";

describe("pickBestVersions (FR-2.1 / FR-2.4)", () => {
  const rows = [
    { id: "old", level: 101, commit_sha: "a".repeat(40), ready_at: "2026-10-01T00:00:00Z" },
    { id: "new", level: 101, commit_sha: "b".repeat(40), ready_at: "2026-10-10T00:00:00Z" },
    { id: "x201", level: 201, commit_sha: "a".repeat(40), ready_at: "2026-10-02T00:00:00Z" },
  ];
  it("prefers the exact current SHA even if older", () => {
    const m = pickBestVersions(rows, "a".repeat(40));
    expect(m[101].version_id).toBe("old");
    expect(m[101].is_latest_sha).toBe(true);
  });
  it("falls back to the newest ready version and flags it as not latest (Regenerate shown)", () => {
    const m = pickBestVersions(rows, "c".repeat(40));
    expect(m[101]).toMatchObject({ version_id: "new", is_latest_sha: false });
    expect(m[201]).toMatchObject({ version_id: "x201", is_latest_sha: false });
  });
  it("no SHA known: still serves newest", () => {
    expect(pickBestVersions(rows, null)[101].version_id).toBe("new");
  });
});

describe("content checks (FR-4.2)", () => {
  it("needs 3 chapters, 1 flashcard, 1 quiz question", () => {
    expect(isComplete({ chapters: 3, flashcards: 1, quiz: 1 })).toBe(true);
    expect(isComplete({ chapters: 2, flashcards: 9, quiz: 9 })).toBe(false);
    expect(isComplete({ chapters: 3, flashcards: 0, quiz: 1 })).toBe(false);
  });
  it("counts words", () => {
    expect(wordCount("  hello   world\nagain ")).toBe(3);
  });
});

describe("PR 2 migration", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261020_cache_p2_shared_cache.sql"), "utf8").toLowerCase();
  it("cache tables are service-role only", () => {
    expect(sql).toMatch(/revoke all on public\.guide_versions, public\.guide_chapters, public\.guide_flashcards, public\.guide_quiz_questions\s+from anon, authenticated/);
    expect(sql).not.toMatch(/create policy/);
  });
  it("single-flight unique key excludes the AI provider (Zach Q4)", () => {
    expect(sql).toContain("unique (repo_key, commit_sha, level, prompt_version)");
  });
  it("claim function is service-role only", () => {
    expect(sql).toMatch(/revoke execute on function public\.claim_guide_version\([^)]*\)\s+from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.claim_guide_version\([^)]*\)\s+to service_role/);
  });
  it("guides_private defaults to shared (Zach Q1) and withdraws on enable", () => {
    expect(sql).toContain("guides_private boolean not null default false");
    expect(sql).toContain("withdrawn_reason = 'user_private'");
  });
});
