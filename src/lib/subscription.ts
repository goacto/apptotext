import { SupabaseClient } from "@supabase/supabase-js";

/** Plan limits (Option A, Oct 2026). Free is lifetime; paid plans reset each billing cycle. */
export const PLAN_LIMITS = { free: 1, standard: 3, pro: 6, master: 10 } as const;
/** Limits before Oct 2026, kept for grandfathered profiles (see supabase/migrations/20261020_plan_limits_option_a.sql). */
export const LEGACY_PLAN_LIMITS = { free: 3, standard: 10, pro: 25, master: 50 } as const;

export type PlanTier = "free" | "standard" | "pro" | "master";

interface SubscriptionStatus {
  subscription_status: string;
  generation_count: number;
  generation_reset_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  generation_limit_override?: number | null;
  grandfathered_plan?: string | null;
}

interface CanGenerateResult {
  allowed: boolean;
  remaining: number;
  plan: PlanTier;
  limit: number;
}

/**
 * Returns the generation limit for a given plan tier.
 */
export function getLimitForPlan(plan: PlanTier): number {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

/**
 * Effective limit for a profile. A grandfathered override applies only while the
 * profile is still on the plan it was grandfathered on; any plan change uses the new limits.
 */
export function effectiveLimit(
  plan: PlanTier,
  override: number | null | undefined,
  grandfatheredPlan: string | null | undefined
): number {
  if (override != null && grandfatheredPlan === plan) return override;
  return getLimitForPlan(plan);
}

export function planFromStatus(status: string | null | undefined): PlanTier {
  return status === "master" || status === "pro" || status === "standard" ? status : "free";
}

/**
 * Fetches the user's subscription status from the profiles table.
 */
export async function getUserSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<SubscriptionStatus | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "subscription_status, generation_count, generation_reset_at, stripe_customer_id, stripe_subscription_id, generation_limit_override, grandfathered_plan"
    )
    .eq("id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as SubscriptionStatus;
}

/**
 * Checks whether the user is allowed to generate content.
 * - Free users: lifetime limit of 1 generation
 * - Standard users: 3 generations per billing cycle
 * - Pro users: 6 generations per billing cycle
 * - Master users: 10 generations per billing cycle
 * - Grandfathered profiles keep their pre-Oct-2026 limit while on the same plan
 */
export async function canGenerate(
  supabase: SupabaseClient,
  userId: string
): Promise<CanGenerateResult> {
  const subscription = await getUserSubscription(supabase, userId);

  if (!subscription) {
    return { allowed: false, remaining: 0, plan: "free", limit: PLAN_LIMITS.free };
  }

  const count = subscription.generation_count ?? 0;
  const plan = planFromStatus(subscription.subscription_status);
  const limit = effectiveLimit(plan, subscription.generation_limit_override, subscription.grandfathered_plan);
  const remaining = Math.max(0, limit - count);

  return {
    allowed: remaining > 0,
    remaining,
    plan,
    limit,
  };
}

/**
 * Increments the user's generation count by 1.
 */
export async function incrementGenerationCount(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const subscription = await getUserSubscription(supabase, userId);
  if (!subscription) return;

  const newCount = (subscription.generation_count ?? 0) + 1;

  await supabase
    .from("profiles")
    .update({ generation_count: newCount })
    .eq("id", userId);
}

/**
 * Returns the current generation count for a user.
 */
export async function getGenerationCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const subscription = await getUserSubscription(supabase, userId);
  return subscription?.generation_count ?? 0;
}
