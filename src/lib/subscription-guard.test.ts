import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { ACTIVE_SUBSCRIPTION_MESSAGE, findActiveSubscription } from "./subscription-guard";

const fakeStripe = (statuses: string[] | Error) => {
  const list = vi.fn(async () => {
    if (statuses instanceof Error) throw statuses;
    return { data: statuses.map((status, i) => ({ id: `sub_${i}`, status })) };
  });
  return { stripe: { subscriptions: { list } } as unknown as Pick<Stripe, "subscriptions">, list };
};

describe("findActiveSubscription", () => {
  it("flags a paid profile with a subscription id without calling Stripe", async () => {
    const { stripe, list } = fakeStripe([]);
    expect(await findActiveSubscription({ subscription_status: "pro", stripe_subscription_id: "sub_1" }, "cus_1", stripe)).toBe("profile");
    expect(list).not.toHaveBeenCalled();
  });
  it("checks Stripe by customer when the profile looks free", async () => {
    for (const status of ["active", "trialing"]) {
      const { stripe, list } = fakeStripe(["canceled", status]);
      expect(await findActiveSubscription({ subscription_status: "free", stripe_subscription_id: null }, "cus_1", stripe)).toBe("stripe");
      expect(list).toHaveBeenCalledWith({ customer: "cus_1", status: "all", limit: 100 });
    }
  });
  it("allows checkout when Stripe has only ended or unpaid subscriptions", async () => {
    const { stripe } = fakeStripe(["canceled", "incomplete_expired", "past_due", "unpaid", "incomplete"]);
    expect(await findActiveSubscription({ subscription_status: "free" }, "cus_1", stripe)).toBeNull();
  });
  it("paid status without a subscription id still asks Stripe", async () => {
    const { stripe, list } = fakeStripe([]);
    expect(await findActiveSubscription({ subscription_status: "standard", stripe_subscription_id: null }, "cus_1", stripe)).toBeNull();
    expect(list).toHaveBeenCalledOnce();
  });
  it("skips Stripe for a brand-new user with no customer", async () => {
    const { stripe, list } = fakeStripe(["active"]);
    expect(await findActiveSubscription({ subscription_status: "free" }, null, stripe)).toBeNull();
    expect(await findActiveSubscription(null, undefined, stripe)).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });
  it("fails closed: a Stripe error propagates instead of allowing checkout", async () => {
    const { stripe } = fakeStripe(new Error("stripe down"));
    await expect(findActiveSubscription({ subscription_status: "free" }, "cus_1", stripe)).rejects.toThrow("stripe down");
  });
  it("message points to Manage subscription and names no person", () => {
    expect(ACTIVE_SUBSCRIPTION_MESSAGE).toContain("Manage subscription");
    expect(ACTIVE_SUBSCRIPTION_MESSAGE).not.toMatch(/zach|etched/i);
  });
});

describe("checkout route wiring", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/stripe/checkout/route.ts"), "utf8");
  it("returns 409 active_subscription before creating a customer or session", () => {
    const guard = src.indexOf("findActiveSubscription(profile, customerId, getStripe())");
    expect(guard).toBeGreaterThan(0);
    expect(src).toMatch(/code: "active_subscription", manage_url: "\/pricing" \},\s*\{ status: 409 \}/);
    expect(guard).toBeLessThan(src.indexOf("customers.create"));
    expect(guard).toBeLessThan(src.indexOf("checkout.sessions.create"));
  });
  it("reads subscription fields from the profile", () => {
    expect(src).toContain('select("stripe_customer_id, email, subscription_status, stripe_subscription_id")');
  });
});
