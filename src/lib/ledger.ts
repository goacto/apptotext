import type { SupabaseClient } from "@supabase/supabase-js";
import { costUsd, type TokenUsage } from "@/lib/ai/pricing";
import { PROMPT_VERSION } from "@/lib/ai/prompts";

/**
 * "started" is written before the AI call and finalized afterwards, so a run that Vercel kills
 * (or a client that disconnects) still leaves a row with estimated tokens/cost.
 */
export type LedgerOutcome = "generated" | "cache_hit" | "failed" | "refused" | "started" | "aborted";

/** Rough chars-per-token for English markdown/code from Claude (measured ~3.4 on prod chapters). */
export const CHARS_PER_TOKEN = 3.4;
export const estimateTokens = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

/** One row per AI call or cache serve (FR-4.6). Written with the service role only. */
export interface LedgerEntry {
  user_id?: string | null;
  conversion_id?: string | null;
  guide_version_id?: string | null;
  repo_key?: string | null;
  level?: number | null;
  phase: string;
  outcome: LedgerOutcome;
  cache_eligible?: boolean | null;
  ai_provider?: string | null;
  model?: string | null;
  usage?: TokenUsage | null;
  quota_charged?: boolean;
  would_hit?: boolean | null;
  detail?: string | null;
  usage_estimated?: boolean;
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
    usage_estimated: e.usage_estimated ?? false,
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

/** Insert a "started" row before an AI call. Returns its id (null if the insert failed). */
export async function startLedger(admin: SupabaseClient, e: Omit<LedgerEntry, "outcome">): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("generations")
      .insert(ledgerRow({ ...e, outcome: "started", usage_estimated: true }))
      .select("id")
      .single();
    if (error) {
      console.error("ledger start failed:", error.message);
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (err) {
    console.error("ledger start failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Heartbeat: keep an estimate on the "started" row so a killed run still shows its approximate spend. */
export async function progressLedger(admin: SupabaseClient, id: string | null, model: string, est: TokenUsage) {
  if (!id) return;
  try {
    await admin
      .from("generations")
      .update({ input_tokens: est.inputTokens, output_tokens: est.outputTokens, cost_usd: costUsd(model, est), usage_estimated: true })
      .eq("id", id)
      .eq("outcome", "started");
  } catch {
    // best effort
  }
}

/** Finalize a "started" row (or insert a fresh row if starting failed). Never throws. */
export async function finishLedger(admin: SupabaseClient, id: string | null, e: LedgerEntry): Promise<void> {
  if (!id) return recordLedger(admin, e);
  try {
    const { error } = await admin
      .from("generations")
      .update({ ...ledgerRow(e), finished_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.error("ledger finish failed:", error.message);
  } catch (err) {
    console.error("ledger finish failed:", err instanceof Error ? err.message : err);
  }
}
