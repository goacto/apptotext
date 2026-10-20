import { describe, expect, test } from "vitest";
import { canGenerate, effectiveLimit, getLimitForPlan, LEGACY_PLAN_LIMITS, PLAN_LIMITS, planFromStatus } from "./subscription";

const fakeDb = (row: Record<string, unknown> | null) =>
  ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: row, error: row ? null : { message: "none" } }) }) }),
    }),
  }) as never;

describe("Option A plan limits", () => {
  test("new limits: free 1 lifetime, standard 3, pro 6, master 10", () => {
    expect(PLAN_LIMITS).toEqual({ free: 1, standard: 3, pro: 6, master: 10 });
    expect(getLimitForPlan("standard")).toBe(3);
    expect(LEGACY_PLAN_LIMITS).toEqual({ free: 3, standard: 10, pro: 25, master: 50 });
  });

  test("grandfathered override applies only while on the same plan", () => {
    expect(effectiveLimit("standard", 10, "standard")).toBe(10);
    expect(effectiveLimit("pro", 10, "standard")).toBe(6); // upgraded: new limits
    expect(effectiveLimit("free", 10, "standard")).toBe(1); // cancelled: new free limit
    expect(effectiveLimit("free", 3, "free")).toBe(3); // existing free user keeps old remaining
    expect(effectiveLimit("master", null, null)).toBe(10);
  });

  test("planFromStatus maps unknown statuses to free", () => {
    expect(planFromStatus("pro")).toBe("pro");
    expect(planFromStatus(null)).toBe("free");
    expect(planFromStatus("canceled")).toBe("free");
  });

  test("new free user gets exactly 1 generation", async () => {
    const r0 = await canGenerate(fakeDb({ subscription_status: "free", generation_count: 0 }), "u");
    expect(r0).toEqual({ allowed: true, remaining: 1, plan: "free", limit: 1 });
    const r1 = await canGenerate(fakeDb({ subscription_status: "free", generation_count: 1 }), "u");
    expect(r1.allowed).toBe(false);
  });

  test("existing free user with 1 used keeps 2 remaining (no reduction)", async () => {
    const r = await canGenerate(fakeDb({ subscription_status: "free", generation_count: 1, generation_limit_override: 3, grandfathered_plan: "free" }), "u");
    expect(r).toMatchObject({ allowed: true, remaining: 2, limit: 3 });
  });

  test("grandfathered standard subscriber keeps 10/cycle; new standard gets 3", async () => {
    const gf = await canGenerate(fakeDb({ subscription_status: "standard", generation_count: 5, generation_limit_override: 10, grandfathered_plan: "standard" }), "u");
    expect(gf).toMatchObject({ allowed: true, remaining: 5, limit: 10 });
    const fresh = await canGenerate(fakeDb({ subscription_status: "standard", generation_count: 3 }), "u");
    expect(fresh).toMatchObject({ allowed: false, remaining: 0, limit: 3 });
  });

  test("missing profile is denied", async () => {
    expect(await canGenerate(fakeDb(null), "u")).toEqual({ allowed: false, remaining: 0, plan: "free", limit: 1 });
  });
});
