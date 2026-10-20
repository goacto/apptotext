import { describe, expect, it, vi } from "vitest";
import {
  aiCapReached,
  CAPACITY_MESSAGE,
  dailyCapUsd,
  durableRateLimit,
  regenerateBlocked,
  REGENERATE_COOLDOWN_MS,
} from "./limits";
import { LEVEL_COST_ESTIMATE } from "./ai/pricing";
import type { SupabaseClient } from "@supabase/supabase-js";

const fakeAdmin = (data: unknown, error: unknown = null) =>
  ({ rpc: vi.fn().mockResolvedValue({ data, error }) }) as unknown as SupabaseClient;

describe("durable rate limit (FR-8.1)", () => {
  it("passes key, window seconds and max to the DB", async () => {
    const admin = fakeAdmin(true);
    expect(await durableRateLimit(admin, "convert:u1", 10, 60_000)).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("rate_limit_hit", { p_key: "convert:u1", p_window_seconds: 60, p_max: 10 });
  });
  it("blocks when the DB says so", async () => {
    expect(await durableRateLimit(fakeAdmin(false), "k", 1)).toBe(false);
  });
  it("falls back to the in-memory limiter on DB errors", async () => {
    const admin = fakeAdmin(null, { message: "down" });
    expect(await durableRateLimit(admin, "fallback-key", 1)).toBe(true);
    expect(await durableRateLimit(admin, "fallback-key", 1)).toBe(false);
  });
});

describe("daily AI cap (FR-8.3, Zach Q7)", () => {
  it("defaults to $10 and honours AI_DAILY_CAP_USD", () => {
    expect(dailyCapUsd({})).toBe(10);
    expect(dailyCapUsd({ AI_DAILY_CAP_USD: "25" })).toBe(25);
    expect(dailyCapUsd({ AI_DAILY_CAP_USD: "nope" })).toBe(10);
    expect(dailyCapUsd({ AI_DAILY_CAP_USD: "0" })).toBe(10);
  });
  it("is reached at or above the cap, and fails closed on errors", async () => {
    expect((await aiCapReached(fakeAdmin(9.99), 10)).reached).toBe(false);
    expect((await aiCapReached(fakeAdmin("10.0000"), 10)).reached).toBe(true);
    expect((await aiCapReached(fakeAdmin(null, { message: "x" }), 10)).reached).toBe(true);
  });
  it("uses the spec's user-facing message", () => {
    expect(CAPACITY_MESSAGE).toBe("We're at capacity for today. Cached guides still work.");
  });
  it("$10/day covers roughly 24-42 new levels at measured cost", () => {
    expect(Math.floor(10 / LEVEL_COST_ESTIMATE.high)).toBe(23);
    expect(Math.floor(10 / LEVEL_COST_ESTIMATE.low)).toBe(41);
  });
});

describe("regenerate cooldown (FR-8.2)", () => {
  const now = Date.parse("2026-10-20T20:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it("first build of a repo/level is never blocked", () => {
    expect(regenerateBlocked([], "b", now)).toBe(false);
    expect(regenerateBlocked([{ commit_sha: "b", status: "generating", created_at: ago(1000) }], "b", now)).toBe(false);
  });
  it("blocks a regenerate within 6h of the newest version", () => {
    expect(regenerateBlocked([{ commit_sha: "a", status: "ready", created_at: ago(3600_000) }], "b", now)).toBe(true);
  });
  it("allows it after 6h", () => {
    expect(regenerateBlocked([{ commit_sha: "a", status: "ready", created_at: ago(REGENERATE_COOLDOWN_MS + 1) }], "b", now)).toBe(false);
  });
});
