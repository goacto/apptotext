import { PLAN_LIMITS, type PlanTier } from "./subscription";

export type PaidPlan = "standard" | "pro" | "master";

/**
 * Single source for paid plans (FR-3.1/3.2). Prices match the existing inline Stripe
 * price_data exactly; this file changes no Stripe products or prices.
 * Limits come from subscription.ts so they stay correct if limits change.
 */
export const PAID_PLANS: { id: PaidPlan; name: string; priceCents: number; limit: number; description: string }[] = [
  { id: "standard", name: "Standard", priceCents: 499, limit: PLAN_LIMITS.standard, description: "all AI providers" },
  { id: "pro", name: "Pro", priceCents: 999, limit: PLAN_LIMITS.pro, description: "all AI providers, priority support" },
  { id: "master", name: "Master", priceCents: 1499, limit: PLAN_LIMITS.master, description: "all AI providers, priority support, early access" },
];

export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const UPGRADE_HEADLINE = `Unlock the full guide, flashcards and quiz. Plans start at ${formatPrice(
  Math.min(...PAID_PLANS.map((p) => p.priceCents))
)}/month.`;

/** Paid plans above the given plan, cheapest first. Master has nothing above it. */
export function upgradeOptions(plan: PlanTier) {
  const order: PlanTier[] = ["free", "standard", "pro", "master"];
  const rank = order.indexOf(plan);
  return PAID_PLANS.filter((p) => order.indexOf(p.id) > rank);
}

/**
 * Copy for the limit wall (shown when /api/generate refuses on the plan limit).
 * Public copy says "we" and uses only the prices and limits defined in this file.
 */
export function limitWallCopy(plan: PlanTier, limit: number): { title: string; body: string } {
  const gens = `${limit} ${limit === 1 ? "generation" : "generations"}`;
  if (plan === "free") {
    return {
      title: "You've used your free guide",
      body: `The free plan includes ${gens}. Pick a plan to keep building guides every month. Plans start at ${formatPrice(
        Math.min(...PAID_PLANS.map((p) => p.priceCents))
      )}/month.`,
    };
  }
  const name = PAID_PLANS.find((p) => p.id === plan)?.name ?? "your plan";
  if (plan === "master") {
    return {
      title: "You've reached this month's limit",
      body: `${name} includes ${gens} per month. Your count resets at the start of your next billing cycle. Saved guides still open instantly.`,
    };
  }
  return {
    title: "You've reached this month's limit",
    body: `${name} includes ${gens} per month. Move up a plan for more this month, or wait for your next billing cycle.`,
  };
}

export type CheckoutSource = "guide_preview" | "limit_wall";
export const CHECKOUT_SOURCES: readonly CheckoutSource[] = ["guide_preview", "limit_wall"];

/**
 * Where checkout may send the user back to. Only same-site guide pages, so the
 * success_url can never become an open redirect.
 */
export function safeReturnPath(path: unknown): string | null {
  if (typeof path !== "string" || path.length > 200) return null;
  if (!/^\/(conversion|library)\/[A-Za-z0-9._\-/]+(\?[A-Za-z0-9._\-=&%]*)?$/.test(path)) return null;
  if (path.includes("//") || path.includes("..")) return null;
  return path;
}

export function withQuery(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}
