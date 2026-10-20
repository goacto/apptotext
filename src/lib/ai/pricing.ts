/**
 * USD per 1M tokens (input, output). Used for the generations ledger (FR-4.6).
 * Source: https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-10-20):
 * Claude Sonnet 4.6 = $3 / MTok input, $15 / MTok output (global endpoint, no caching).
 */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  // Retired 2026-06-15; kept so historical ledger rows still price.
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "gpt-4o": { input: 2.5, output: 10 },
  "grok-3": { input: 3, output: 15 },
};

/**
 * Estimate for a level when measured cost is missing (FR-9.2).
 * Measured on prod 2026-10-20 (claude-sonnet-4-6, $3/$15 per MTok): $0.24 per level with prompt p2,
 * $0.42 with p1 (longer chapters). Shown as a range (FR-9.1); mid is used for "estimated $ saved".
 */
export const LEVEL_COST_ESTIMATE = { low: 0.24, mid: 0.3, high: 0.42 };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export function costUsd(model: string, usage: TokenUsage | null | undefined): number | null {
  const price = MODEL_PRICES[model];
  if (!price || !usage) return null;
  const c = (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
  return Math.round(c * 10000) / 10000;
}
