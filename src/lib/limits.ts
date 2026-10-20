import type { SupabaseClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";

/**
 * FR-8.1: durable rate limit (Supabase sliding window), shared by every server instance.
 * If the DB call fails we fall back to the in-memory limiter rather than blocking users.
 */
export async function durableRateLimit(
  admin: SupabaseClient,
  key: string,
  max: number,
  windowMs = 60_000
): Promise<boolean> {
  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_key: key,
    p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
    p_max: max,
  });
  if (error) return rateLimit(key, max, windowMs).allowed;
  return data === true;
}

export const CAPACITY_MESSAGE = "We're at capacity for today. Cached guides still work.";

/** FR-8.3 / Zach Q7: AI_DAILY_CAP_USD, default $10/day (America/New_York day). */
export function dailyCapUsd(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AI_DAILY_CAP_USD);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export async function aiCapReached(admin: SupabaseClient, cap = dailyCapUsd()): Promise<{ reached: boolean; spent: number; cap: number }> {
  const { data, error } = await admin.rpc("ai_spend_today_et");
  // Fail closed on errors: a broken guard must not let spend run away.
  if (error) return { reached: true, spent: NaN, cap };
  const spent = Number(data ?? 0);
  return { reached: spent >= cap, spent, cap };
}

export const REGENERATE_COOLDOWN_MS = 6 * 3600 * 1000;
export const REGENERATE_COOLDOWN_MESSAGE =
  "This guide was rebuilt in the last 6 hours. Open the saved guide, or try again later.";

/**
 * FR-8.2: at most one Regenerate per (repo, level) per 6 hours across all users.
 * A request is a Regenerate when a ready version exists for another commit.
 */
export function regenerateBlocked(
  versions: { commit_sha: string; status: string; created_at: string }[],
  currentSha: string,
  now = Date.now()
): boolean {
  const isRegenerate = versions.some((v) => v.status === "ready" && v.commit_sha !== currentSha);
  if (!isRegenerate) return false;
  const newest = Math.max(...versions.map((v) => Date.parse(v.created_at)));
  return now - newest < REGENERATE_COOLDOWN_MS;
}
