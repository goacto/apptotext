import { PLAN_LIMITS } from "./subscription";

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
