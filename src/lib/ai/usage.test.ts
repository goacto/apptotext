import { describe, expect, it } from "vitest";
import { anthropicUsageFromEvent, openAIUsage, PROVIDER_MODELS } from "./provider";
import { costUsd } from "./pricing";
import { ledgerRow } from "@/lib/ledger";
import { PROMPT_VERSION } from "./prompts";

describe("token usage capture (FR-4.7)", () => {
  it("anthropic: message_start + message_delta", () => {
    let u = { inputTokens: 0, outputTokens: 0 };
    u = anthropicUsageFromEvent({ type: "message_start", message: { usage: { input_tokens: 1200, output_tokens: 1 } } }, u);
    u = anthropicUsageFromEvent({ type: "message_delta", usage: { output_tokens: 3400 } }, u);
    expect(u).toEqual({ inputTokens: 1200, outputTokens: 3400 });
  });
  it("openai-compatible usage chunk", () => {
    expect(openAIUsage({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 20 } })).toEqual({
      inputTokens: 10,
      outputTokens: 20,
    });
    expect(openAIUsage({ choices: [{ delta: { content: "x" } }] })).toBeNull();
  });
});

describe("cost and ledger rows (FR-4.6)", () => {
  it("uses claude-sonnet-4-6 (Sonnet 4 is retired) and prices it at $3/$15 per M", () => {
    expect(PROVIDER_MODELS.claude).toBe("claude-sonnet-4-6");
    expect(costUsd(PROVIDER_MODELS.claude, { inputTokens: 10_000, outputTokens: 4_000 })).toBe(0.09);
  });
  it("still prices the retired claude sonnet 4 for old ledger rows", () => {
    expect(costUsd("claude-sonnet-4-20250514", { inputTokens: 10_000, outputTokens: 4_000 })).toBe(0.09);
  });
  it("null when usage or model unknown", () => {
    expect(costUsd("claude-sonnet-4-20250514", null)).toBeNull();
    expect(costUsd("mystery", { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });
  it("cache hits cost 0 and carry the prompt version", () => {
    const row = ledgerRow({ phase: "open", outcome: "cache_hit", model: "grok-3", usage: null });
    expect(row.cost_usd).toBe(0);
    expect(row.prompt_version).toBe(PROMPT_VERSION);
  });
  it("generated rows compute cost", () => {
    const row = ledgerRow({
      phase: "chapter_1",
      outcome: "generated",
      model: "gpt-4o",
      usage: { inputTokens: 1_000_000, outputTokens: 0 },
      quota_charged: true,
    });
    expect(row.cost_usd).toBe(2.5);
    expect(row.quota_charged).toBe(true);
  });
});
