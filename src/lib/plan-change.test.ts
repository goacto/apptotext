import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  PlanChangeError,
  changeDirection,
  changePlan,
  planFromAmount,
  planFromSubscription,
  changeParams,
} from "./plan-change";
import { portalConfigured } from "./stripe-portal";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

function fakeStripe(sub: Record<string, unknown>) {
  const calls: [string, ...unknown[]][] = [];
  const stripe = {
    subscriptions: {
      retrieve: vi.fn(async () => sub),
      update: vi.fn(async (...a: unknown[]) => (calls.push(["sub.update", ...a]), sub)),
    },
    subscriptionSchedules: {
      create: vi.fn(async (...a: unknown[]) => {
        calls.push(["sched.create", ...a]);
        return { id: "sub_sched_1", phases: [{ start_date: 100, end_date: 200, items: [{ price: "price_old", quantity: 1 }] }] };
      }),
      update: vi.fn(async (...a: unknown[]) => (calls.push(["sched.update", ...a]), {})),
      release: vi.fn(async (...a: unknown[]) => (calls.push(["sched.release", ...a]), {})),
    },
  };
  return { stripe: stripe as never, calls };
}

const baseSub = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  schedule: null,
  metadata: { plan: "standard" },
  items: { data: [{ id: "si_1", price: { id: "price_old", unit_amount: 499, product: "prod_a2t" } }] },
  ...over,
});

describe("plan helpers", () => {
  it("direction and amounts use the existing prices", () => {
    expect(changeDirection("standard", "pro")).toBe("upgrade");
    expect(changeDirection("master", "standard")).toBe("downgrade");
    expect(changeDirection("pro", "pro")).toBe("same");
    expect([499, 999, 1499, 2000].map(planFromAmount)).toEqual(["standard", "pro", "master", null]);
  });
  it("metadata.plan wins, amount is the fallback", () => {
    expect(planFromSubscription({ metadata: { plan: "master" }, items: { data: [{ price: { unit_amount: 499 } }] } })).toBe("master");
    expect(planFromSubscription({ metadata: {}, items: { data: [{ price: { unit_amount: 999 } }] } })).toBe("pro");
    expect(planFromSubscription({ metadata: { plan: "bogus" }, items: { data: [{ price: { unit_amount: 1 } }] } })).toBeNull();
  });
  it("upgrade params: inline USD monthly price on the existing item and product, create_prorations, metadata.plan", () => {
    expect(changeParams("si_1", "prod_a2t", "pro")).toEqual({
      items: [{ id: "si_1", price_data: { currency: "usd", product: "prod_a2t", unit_amount: 999, recurring: { interval: "month" } }, quantity: 1 }],
      proration_behavior: "create_prorations",
      metadata: { plan: "pro" },
    });
  });
});

describe("changePlan", () => {
  const opts = { subscriptionId: "sub_1", customerId: "cus_1", profilePlan: "standard" as const };
  it("upgrade updates the subscription in place", async () => {
    const { stripe, calls } = fakeStripe(baseSub());
    const r = await changePlan(stripe, { ...opts, target: "master" });
    expect(r.kind).toBe("upgraded");
    expect(calls).toEqual([["sub.update", "sub_1", changeParams("si_1", "prod_a2t", "master")]]);
  });
  it("downgrade applies now with the same call shape (prorated credit, lower inline price)", async () => {
    const { stripe, calls } = fakeStripe(baseSub({ metadata: { plan: "pro" }, items: { data: [{ id: "si_1", price: { id: "price_old", unit_amount: 999, product: "prod_a2t" } }] } }));
    const r = await changePlan(stripe, { ...opts, target: "standard" });
    expect(r.kind).toBe("downgraded");
    expect(calls).toEqual([["sub.update", "sub_1", changeParams("si_1", "prod_a2t", "standard")]]);
    expect(changeParams("si_1", "prod_a2t", "standard").proration_behavior).toBe("create_prorations");
  });
  it("same plan is a 409; a schedule-managed subscription is refused, not changed", async () => {
    await expect(changePlan(fakeStripe(baseSub()).stripe, { ...opts, target: "standard" })).rejects.toMatchObject({ status: 409, code: "same_plan" });
    const s = fakeStripe(baseSub({ schedule: "sub_sched_9" }));
    await expect(changePlan(s.stripe, { ...opts, target: "pro" })).rejects.toMatchObject({ code: "scheduled" });
    expect(s.calls).toEqual([]);
  });
  it("falls back to the profile plan when the subscription has no metadata and an unknown amount", async () => {
    const { stripe } = fakeStripe(baseSub({ metadata: {}, items: { data: [{ id: "si_1", price: { id: "p", unit_amount: 1, product: "prod_a2t" } }] } }));
    expect((await changePlan(stripe, { ...opts, profilePlan: "pro", target: "master" })).kind).toBe("upgraded");
  });
  it("refuses another customer's subscription, inactive or multi-item subscriptions", async () => {
    await expect(changePlan(fakeStripe(baseSub({ customer: "cus_other" })).stripe, { ...opts, target: "pro" })).rejects.toMatchObject({ status: 404 });
    await expect(changePlan(fakeStripe(baseSub({ status: "past_due" })).stripe, { ...opts, target: "pro" })).rejects.toBeInstanceOf(PlanChangeError);
    const two = baseSub({ items: { data: [baseSub().items.data[0], baseSub().items.data[0]] } });
    await expect(changePlan(fakeStripe(two).stripe, { ...opts, target: "pro" })).rejects.toMatchObject({ code: "multi_item" });
  });
  it("never creates products or prices", () => {
    expect(read("src/lib/plan-change.ts")).not.toMatch(/products\.(create|update)|prices\.(create|update)/);
    expect(read("src/app/api/stripe/change-plan/route.ts")).not.toMatch(/products\.|prices\./);
  });
});

describe("billing portal visibility", () => {
  it("is available only when a portal configuration exists, false on error", async () => {
    const mk = (data: unknown[] | Error) => ({
      billingPortal: { configurations: { list: async () => { if (data instanceof Error) throw data; return { data }; } } },
    }) as never;
    expect(await portalConfigured(mk([]))).toBe(false);
    expect(await portalConfigured(mk([{ id: "bpc_1" }]))).toBe(true);
    expect(await portalConfigured(mk(new Error("nope")))).toBe(false);
  });
  it("portal POST answers 503 portal_unavailable instead of a Stripe error", () => {
    const src = read("src/app/api/stripe/portal/route.ts");
    expect(src).toContain('code: "portal_unavailable"');
    expect(src).toContain("export async function GET()");
  });
});

describe("UI wiring", () => {
  it("Pricing: other paid tiers call change-plan; Manage billing only when the portal exists", () => {
    const src = read("src/app/pricing/page.tsx");
    expect(src).toContain('fetch("/api/stripe/change-plan"');
    expect(src).toContain("onClick={() => handleChangePlan(tier.id)}");
    expect(src).not.toContain('"Change Plan"');
    expect(src).toMatch(/if \(!portalAvailable\) \{[\s\S]*?Current Plan/);
  });
  it("checkout puts plan on the subscription metadata", () => {
    expect(read("src/app/api/stripe/checkout/route.ts")).toContain("subscription_data: { metadata: { user_id: user.id, plan } }");
  });
});

describe("webhook customer.subscription.updated", () => {
  const src = read("src/app/api/stripe/webhook/route.ts");
  const block = src.slice(src.indexOf('case "customer.subscription.updated"'), src.indexOf('case "customer.subscription.deleted"'));
  it("applies metadata.plan while active, scoped to this subscription, only when different", () => {
    expect(block).toContain("planFromSubscription(subscription)");
    expect(block).toMatch(/\.update\(\{ subscription_status: plan \}\)\s*\.eq\("stripe_customer_id", customerId\)\s*\.eq\("stripe_subscription_id", subscription\.id\)\s*\.neq\("subscription_status", plan\)/);
  });
  it("still downgrades to free when the subscription stops being active", () => {
    expect(block).toContain('subscription_status: "free"');
  });
});
