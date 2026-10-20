import type { SupabaseClient } from "@supabase/supabase-js";
import { costUsd, type TokenUsage } from "@/lib/ai/pricing";
import { PROMPT_VERSION } from "@/lib/ai/prompts";

/** One row per AI call or cache serve (FR-4.6). Written with the service role only. */
export interface LedgerEntry {
  user_id?: string | null;
  conversion_id?: string | null;
  guide_version_id?: string | null;
  repo_key?: string | null;
  level?: number | null;
  phase: string;
  outcome: "generated" | "cache_hit" | "failed" | "refused";
  cache_eligible?: boolean | null;
  ai_provider?: string | null;
  model?: string | null;
  usage?: TokenUsage | null;
  quota_charged?: boolean;
  would_hit?: boolean | null;
  detail?: string | null;
}

export function ledgerRow(e: LedgerEntry) {
  return {
    user_id: e.user_id ?? null,
    conversion_id: e.conversion_id ?? null,
    guide_version_id: e.guide_version_id ?? null,
    repo_key: e.repo_key ?? null,
    level: e.level ?? null,
    phase: e.phase,
    outcome: e.outcome,
    cache_eligible: e.cache_eligible ?? null,
    ai_provider: e.ai_provider ?? null,
    model: e.model ?? null,
    prompt_version: PROMPT_VERSION,
    input_tokens: e.usage?.inputTokens ?? null,
    output_tokens: e.usage?.outputTokens ?? null,
    cost_usd: e.outcome === "cache_hit" ? 0 : e.model ? costUsd(e.model, e.usage) : null,
    quota_charged: e.quota_charged ?? false,
    would_hit: e.would_hit ?? null,
    detail: e.detail ?? null,
  };
}

/** Never throws: the ledger must not break generation. */
export async function recordLedger(admin: SupabaseClient, e: LedgerEntry): Promise<void> {
  try {
    const { error } = await admin.from("generations").insert(ledgerRow(e));
    if (error) console.error("ledger insert failed:", error.message);
  } catch (err) {
    console.error("ledger insert failed:", err instanceof Error ? err.message : err);
  }
}
