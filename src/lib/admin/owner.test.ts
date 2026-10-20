import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { isOwnerEmail, windowMetrics } from "./owner";

describe("OWNER_EMAILS gate (FR-10)", () => {
  it("is closed when unset or empty", () => {
    expect(isOwnerEmail("a@b.com", {})).toBe(false);
    expect(isOwnerEmail("a@b.com", { OWNER_EMAILS: " , " })).toBe(false);
  });
  it("matches case-insensitively from a comma list", () => {
    const env = { OWNER_EMAILS: "zach@goacto.com, Leadership@GoActo.com" };
    expect(isOwnerEmail("leadership@goacto.com", env)).toBe(true);
    expect(isOwnerEmail("ZACH@goacto.com", env)).toBe(true);
    expect(isOwnerEmail("someone@goacto.com", env)).toBe(false);
    expect(isOwnerEmail(null, env)).toBe(false);
  });
});

describe("cache metrics", () => {
  const now = Date.parse("2026-10-20T20:00:00Z");
  const at = (d: number) => new Date(now - d * 86_400_000).toISOString();
  const rows = [
    { created_at: at(1), outcome: "generated", cost_usd: "0.24" },
    { created_at: at(2), outcome: "cache_hit", cost_usd: 0 },
    { created_at: at(3), outcome: "cache_hit", cost_usd: null },
    { created_at: at(10), outcome: "refused", cost_usd: null },
    { created_at: at(40), outcome: "aborted", cost_usd: "0.10" },
  ];
  it("windows, hit rate, spend and saved range", () => {
    const m7 = windowMetrics(rows, 7, now);
    expect(m7).toMatchObject({ generated: 1, cacheHits: 2, refused: 0, failed: 0, spentUsd: 0.24, savedUsdLow: 0.48, savedUsdHigh: 0.84 });
    expect(m7.hitRate).toBeCloseTo(2 / 3);
    const m90 = windowMetrics(rows, 90, now);
    expect(m90).toMatchObject({ refused: 1, failed: 1, spentUsd: 0.34 });
    expect(windowMetrics([], 7, now).hitRate).toBeNull();
  });
});
