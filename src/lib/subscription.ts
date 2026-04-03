import { SupabaseClient } from "@supabase/supabase-js";

const FREE_GENERATION_LIMIT = 2;
const PRO_GENERATION_LIMIT = 50;

interface SubscriptionStatus {
  subscription_status: string;
  generation_count: number;
  generation_reset_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface CanGenerateResult {
  allowed: boolean;
  remaining: number;
  plan: "free" | "pro";
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
      "subscription_status, generation_count, generation_reset_at, stripe_customer_id, stripe_subscription_id"
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
 * - Free users: lifetime limit of 2 generations
 * - Pro users: 50 generations per billing cycle
 */
export async function canGenerate(
  supabase: SupabaseClient,
  userId: string
): Promise<CanGenerateResult> {
  const subscription = await getUserSubscription(supabase, userId);

  if (!subscription) {
    return { allowed: false, remaining: 0, plan: "free" };
  }

  const isPro = subscription.subscription_status === "pro";
  const count = subscription.generation_count ?? 0;

  if (isPro) {
    const remaining = Math.max(0, PRO_GENERATION_LIMIT - count);
    return {
      allowed: remaining > 0,
      remaining,
      plan: "pro",
    };
  }

  // Free tier: lifetime limit
  const remaining = Math.max(0, FREE_GENERATION_LIMIT - count);
  return {
    allowed: remaining > 0,
    remaining,
    plan: "free",
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
