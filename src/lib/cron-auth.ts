/**
 * Fail closed for /api/cron/daily.
 *
 * Allowed when either:
 * - Authorization matches CRON_SECRET (Vercel sends this once the env var is set), or
 * - the request carries Vercel's cron schedule header (sent on every cron invocation).
 *
 * The schedule header is how the daily job keeps running while CRON_SECRET is unset.
 * Anyone who can reach the URL can spoof that header; a secret is the stronger gate
 * once it is configured. This module does not set the env var.
 */
export const VERCEL_CRON_SCHEDULE_HEADER = "x-vercel-cron-schedule";

export function cronAuthorized(headerGet: (name: string) => string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && headerGet("authorization") === `Bearer ${secret}`) return true;
  const schedule = headerGet(VERCEL_CRON_SCHEDULE_HEADER);
  return typeof schedule === "string" && schedule.trim().length > 0;
}
