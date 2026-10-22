import type Stripe from "stripe";

/** Stripe subscription statuses that count as "already subscribed" for checkout. */
export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

const PAID = ["standard", "pro", "master"];

export const ACTIVE_SUBSCRIPTION_MESSAGE =
  "You already have an active AppToText subscription. To change plans, use Manage subscription on the Pricing page.";

export type ActiveSubscriptionSource = "profile" | "stripe";

/**
 * Checkout guard: a second Checkout would start a second subscription next to the current
 * one (double billing). Checks the profile first, then Stripe by customer.
 * Stripe errors propagate so the route fails closed instead of risking a duplicate.
 */
export async function findActiveSubscription(
  profile: { subscription_status?: string | null; stripe_subscription_id?: string | null } | null,
  customerId: string | null | undefined,
  stripe: Pick<Stripe, "subscriptions">
): Promise<ActiveSubscriptionSource | null> {
  if (profile && PAID.includes(profile.subscription_status ?? "") && profile.stripe_subscription_id) {
    return "profile";
  }
  if (!customerId) return null;
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  const active = subs.data.some((s) =>
    (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(s.status)
  );
  return active ? "stripe" : null;
}
