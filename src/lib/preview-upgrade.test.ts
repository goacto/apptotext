import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAID_PLANS, UPGRADE_HEADLINE, safeReturnPath, withQuery } from "./plans";
import { PLAN_LIMITS } from "./subscription";
import { getGuidePreview } from "./cache/preview";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("plans constant (FR-3.2)", () => {
  it("keeps the exact existing Stripe prices (no price changes)", () => {
    expect(PAID_PLANS.map((p) => [p.id, p.priceCents])).toEqual([
      ["standard", 499],
      ["pro", 999],
      ["master", 1499],
    ]);
  });
  it("reads limits from subscription.ts", () => {
    for (const p of PAID_PLANS) expect(p.limit).toBe(PLAN_LIMITS[p.id]);
  });
  it("headline matches the spec copy", () => {
    expect(UPGRADE_HEADLINE).toBe("Unlock the full guide, flashcards and quiz. Plans start at $4.99/month.");
  });
});

describe("checkout return path", () => {
  it("allows only same-site guide pages", () => {
    expect(safeReturnPath("/conversion/1ff89436-21d4-4f42-90e2-af40b342d04e")).toBe("/conversion/1ff89436-21d4-4f42-90e2-af40b342d04e");
    expect(safeReturnPath("/library/vercel/next.js/101-beginner")).toBe("/library/vercel/next.js/101-beginner");
    for (const bad of ["https://evil.com", "//evil.com", "/dashboard", "/conversion/../admin", "/library//evil.com", "/conversion/x?y=1", 5, null]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });
  it("adds upgraded=1", () => {
    expect(withQuery("/conversion/abc", "upgraded", "1")).toBe("/conversion/abc?upgraded=1");
  });
  it("checkout route tags the session and returns to the guide; Stripe descriptions unchanged", () => {
    const src = read("src/app/api/stripe/checkout/route.ts");
    expect(src).toContain('...(source ? { source } : {})');
    expect(src).toContain('withQuery(returnTo, "upgraded", "1")');
    expect(src).toContain("price_data");
    expect(src).not.toMatch(/prices\.create|products\.create|price: "price_/);
    const desc = PAID_PLANS.map((p) => `${p.limit} generations per month, ${p.description}`);
    expect(desc).toEqual([
      "3 generations per month, all AI providers",
      "6 generations per month, all AI providers, priority support",
      "10 generations per month, all AI providers, priority support, early access",
    ]);
  });
  it("auth callback only redirects to same-site paths", () => {
    const src = read("src/app/auth/callback/route.ts");
    const re = new RegExp(src.match(/\/(\^\\\/.*\$)\/\.test\(rawNext\)/)![1]);
    expect(re.test("/conversion/abc?upgraded=1")).toBe(true);
    for (const bad of ["//evil.com", "@evil.com", "https://evil.com", "/\\evil.com"]) expect(re.test(bad)).toBe(false);
  });
});

function fakeAdmin(tables: Record<string, unknown[]>) {
  const q = (table: string) => {
    let rows = tables[table] ?? [];
    let head = false;
    const api = {
      select: (_c?: string, opts?: { head?: boolean }) => {
        head = Boolean(opts?.head);
        return api;
      },
      eq: (k: string, v: unknown) => {
        rows = rows.filter((r) => (r as Record<string, unknown>)[k] === v);
        return api;
      },
      order: () => api,
      maybeSingle: async () => ({ data: rows[0] ?? null }),
      then: (res: (v: unknown) => unknown) => res(head ? { count: rows.length } : { data: rows }),
    };
    return api;
  };
  return { from: q } as unknown as SupabaseClient;
}

describe("preview payload (FR-3.1)", () => {
  const base = {
    guide_versions: [
      { id: "v1", repo_key: "acme/widget", github_repo_id: 7, level: 101, commit_sha: "a".repeat(40), ready_at: "2026-10-20T19:00:00Z", status: "ready", generated_by: "secret-user" },
      { id: "v2", repo_key: "acme/widget", github_repo_id: 7, level: 201, commit_sha: "b".repeat(40), ready_at: null, status: "withdrawn" },
    ],
    guide_chapters: [
      { guide_version_id: "v1", chapter_number: 1, title: "Chapter 1: Intro", content: "# Chapter 1: Intro\nhello" },
      { guide_version_id: "v1", chapter_number: 2, title: "Chapter 2: Use", content: "SECRET CH2" },
      { guide_version_id: "v1", chapter_number: 3, title: "Chapter 3: Deep", content: "SECRET CH3" },
    ],
    guide_flashcards: Array.from({ length: 15 }, (_, i) => ({ guide_version_id: "v1", id: i })),
    guide_quiz_questions: Array.from({ length: 10 }, (_, i) => ({ guide_version_id: "v1", id: i })),
    repos: [{ github_repo_id: 7, full_name: "Acme/Widget" }],
  };
  it("returns chapter 1 in full, titles only for 2-3, counts, plans; never the generator", async () => {
    const p = await getGuidePreview(fakeAdmin(base), "v1");
    expect(p!.chapter1!.content).toContain("hello");
    expect(p!.locked_chapters).toEqual([
      { chapter_number: 2, title: "Chapter 2: Use" },
      { chapter_number: 3, title: "Chapter 3: Deep" },
    ]);
    expect(p!.flashcard_count).toBe(15);
    expect(p!.quiz_count).toBe(10);
    expect(p!.version.full_name).toBe("Acme/Widget");
    expect(p!.version.short_sha).toBe("aaaaaaa");
    const json = JSON.stringify(p);
    expect(json).not.toContain("SECRET");
    expect(json).not.toContain("secret-user");
  });
  it("404s withdrawn or unknown versions", async () => {
    expect(await getGuidePreview(fakeAdmin(base), "v2")).toBeNull();
    expect(await getGuidePreview(fakeAdmin(base), "nope")).toBeNull();
  });
});
