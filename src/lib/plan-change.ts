import type Stripe from "stripe";
import { PAID_PLANS, type PaidPlan } from "./plans";
import type { PlanTier } from "./subscription";

/**
 * In-app plan changes (no Stripe product or price changes).
 * Same price pattern as checkout: inline price_data, USD, monthly, 499/999/1499 cents.
 * Subscription-item price_data must name an existing product, so we reuse the product the
 * subscription already has (Checkout created it inline). Nothing is created in the catalog.
 *
 * Both directions apply now with proration_behavior "create_prorations":
 * - Upgrade: the higher limit is available at once; the prorated difference is added to the
 *   next invoice.
 * - Downgrade: the lower limit applies at once; the unused part of the higher plan becomes a
 *   prorated credit on the customer balance that reduces the next invoice (no cash refund).
 *   generation_count is not reset, so a downgrade can't be used to get extra generations.
 * We chose "now" over "at period end" because period-end needs a subscription schedule,
 * which adds release/override cases and can't be exercised with the tools we verify with.
 * A subscription already managed by a schedule is refused rather than changed.
 */

const ORDER: PlanTier[] = ["free", "standard", "pro", "master"];

export type ChangeKind = "upgraded" | "downgraded";

export class PlanChangeError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

export function isPaidPlan(p: unknown): p is PaidPlan {
  return p === "standard" || p === "pro" || p === "master";
}

export function priceCentsFor(plan: PaidPlan): number {
  return PAID_PLANS.find((p) => p.id === plan)!.priceCents;
}

export function planFromAmount(cents: number | null | undefined): PaidPlan | null {
  return PAID_PLANS.find((p) => p.priceCents === cents)?.id ?? null;
}

export function changeDirection(from: PlanTier, to: PaidPlan): "upgrade" | "downgrade" | "same" {
  const d = ORDER.indexOf(to) - ORDER.indexOf(from);
  return d > 0 ? "upgrade" : d < 0 ? "downgrade" : "same";
}

type SubLike = Pick<Stripe.Subscription, "metadata"> & {
  items: { data: { price: { unit_amount: number | null } }[] };
};

/** metadata.plan wins; otherwise infer from the item's amount (pre-metadata subscriptions). */
export function planFromSubscription(sub: SubLike): PaidPlan | null {
  const meta = sub.metadata?.plan;
  if (isPaidPlan(meta)) return meta;
  return planFromAmount(sub.items?.data?.[0]?.price?.unit_amount);
}

export function inlinePrice(product: string, plan: PaidPlan) {
  return {
    currency: "usd",
    product,
    unit_amount: priceCentsFor(plan),
    recurring: { interval: "month" as const },
  };
}

/** Params for subscriptions.update, used for upgrades and downgrades alike. */
export function changeParams(itemId: string, product: string, to: PaidPlan): Stripe.SubscriptionUpdateParams {
  return {
    items: [{ id: itemId, price_data: inlinePrice(product, to), quantity: 1 }],
    proration_behavior: "create_prorations",
    metadata: { plan: to },
  };
}

type StripeLike = Pick<Stripe, "subscriptions">;

export async function changePlan(
  stripe: StripeLike,
  opts: { subscriptionId: string; customerId: string; target: PaidPlan; profilePlan: PlanTier }
): Promise<{ kind: ChangeKind; plan: PaidPlan; effective_at: number | null }> {
  const sub = await stripe.subscriptions.retrieve(opts.subscriptionId);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  if (customer !== opts.customerId) throw new PlanChangeError("Subscription not found.", 404, "not_found");
  if (sub.status !== "active" && sub.status !== "trialing") {
    throw new PlanChangeError("Your subscription isn't active. Start a new plan from the Pricing page.", 409, "inactive");
  }
  if (sub.items.data.length !== 1) {
    throw new PlanChangeError("This subscription can't be changed here.", 409, "multi_item");
  }
  const item = sub.items.data[0];
  const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
  const current = planFromSubscription(sub) ?? (isPaidPlan(opts.profilePlan) ? opts.profilePlan : null);
  if (!current) throw new PlanChangeError("We couldn't read your current plan.", 409, "unknown_plan");

  if (sub.schedule) {
    throw new PlanChangeError("This subscription has a scheduled change. Contact us to adjust it.", 409, "scheduled");
  }
  const direction = changeDirection(current, opts.target);
  if (direction === "same") throw new PlanChangeError("You're already on this plan.", 409, "same_plan");

  await stripe.subscriptions.update(sub.id, changeParams(item.id, product, opts.target));
  return {
    kind: direction === "upgrade" ? "upgraded" : "downgraded",
    plan: opts.target,
    effective_at: Math.floor(Date.now() / 1000),
  };
}
