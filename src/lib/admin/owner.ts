import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LEVEL_COST_ESTIMATE } from "@/lib/ai/pricing";

/** FR-10: OWNER_EMAILS is a comma-separated allow-list. Unset means nobody (fail closed). */
export function isOwnerEmail(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!email) return false;
  const owners = (env.OWNER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return owners.includes(email.trim().toLowerCase());
}

/** Signed-in owner or a plain 404 (the page must not reveal that it exists). */
export async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwnerEmail(user.email)) notFound();
  return user;
}

export const daysAgoIso = (days: number, now = Date.now()) => new Date(now - days * 86_400_000).toISOString();

export interface LedgerLite {
  created_at: string;
  outcome: string;
  cost_usd: number | string | null;
}

export interface WindowMetrics {
  days: number;
  generated: number;
  cacheHits: number;
  refused: number;
  failed: number;
  hitRate: number | null;
  spentUsd: number;
  savedUsdLow: number;
  savedUsdHigh: number;
}

/** FR-10.1 metrics; "saved" is a range because per-level cost varies (FR-9.1). */
export function windowMetrics(rows: LedgerLite[], days: number, now = Date.now()): WindowMetrics {
  const since = now - days * 86_400_000;
  const r = rows.filter((x) => Date.parse(x.created_at) >= since);
  const count = (o: string) => r.filter((x) => x.outcome === o).length;
  const generated = count("generated");
  const cacheHits = count("cache_hit");
  const spent = r.reduce((n, x) => n + (x.outcome === "cache_hit" ? 0 : Number(x.cost_usd ?? 0)), 0);
  return {
    days,
    generated,
    cacheHits,
    refused: count("refused"),
    failed: count("failed") + count("aborted"),
    hitRate: generated + cacheHits > 0 ? cacheHits / (generated + cacheHits) : null,
    spentUsd: Math.round(spent * 100) / 100,
    savedUsdLow: Math.round(cacheHits * LEVEL_COST_ESTIMATE.low * 100) / 100,
    savedUsdHigh: Math.round(cacheHits * LEVEL_COST_ESTIMATE.high * 100) / 100,
  };
}
