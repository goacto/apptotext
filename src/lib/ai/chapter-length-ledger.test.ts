import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAPTER_MAX_TOKENS, CHAPTER_TARGET_WORDS, getTextbookUserPrompt, PROMPT_VERSION } from "./prompts";
import { streamAI } from "./provider";
import { estimateTokens, finishLedger, startLedger } from "@/lib/ledger";

const route = readFileSync(join(process.cwd(), "src/app/api/generate/route.ts"), "utf8");
const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261020_ledger_started_rows.sql"), "utf8");

describe("chapter length", () => {
  it("prompt carries a target length and a must-finish instruction; version bumped", () => {
    const p = getTextbookUserPrompt("t", "src", 101, 3);
    expect(p).toContain(`aim for ${CHAPTER_TARGET_WORDS} words`);
    expect(p).toContain("You MUST finish the chapter");
    expect(PROMPT_VERSION).toBe("p2");
  });
  it("chapter cap is 10k tokens and the deadline leaves room under maxDuration 300", () => {
    expect(CHAPTER_MAX_TOKENS).toBe(10_000);
    expect(route).toContain("maxTokens: CHAPTER_MAX_TOKENS");
    const deadline = Number(route.match(/CHAPTER_DEADLINE_MS = ([\d_]+)/)![1].replace(/_/g, ""));
    expect(deadline).toBeLessThanOrEqual(270_000);
    // ~75 tok/s observed on prod: the cap fits inside the deadline.
    expect((CHAPTER_MAX_TOKENS / 60) * 1000).toBeLessThan(deadline);
  });
});

function sse(events: object[]) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n`).join("");
  return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); } }));
}

describe("streamClaude options", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends max_tokens and signal, reports stop_reason and usage", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    const fetchMock = vi.fn().mockResolvedValue(
      sse([
        { type: "message_start", message: { usage: { input_tokens: 100, output_tokens: 1 } } },
        { type: "content_block_delta", delta: { text: "hi" } },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 7 } },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);
    const ac = new AbortController();
    let usage: unknown = null;
    let stop = "";
    const r = streamAI("claude", [{ role: "user", content: "x" }], (u) => (usage = u), {
      maxTokens: 10_000,
      signal: ac.signal,
      onStopReason: (s) => (stop = s),
    }).getReader();
    let text = "";
    for (;;) { const { done, value } = await r.read(); if (done) break; text += value; }
    expect(text).toBe("hi");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).max_tokens).toBe(10_000);
    expect(init.signal).toBe(ac.signal);
    expect(stop).toBe("end_turn");
    expect(usage).toEqual({ inputTokens: 100, outputTokens: 7 });
  });
  it("on abort, reports partial usage then errors the stream", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" })));
    const onUsage = vi.fn();
    const r = streamAI("claude", [{ role: "user", content: "x" }], onUsage).getReader();
    await expect(r.read()).rejects.toThrow("aborted");
    expect(onUsage).toHaveBeenCalledWith(null);
  });
});

describe("started/finished ledger rows", () => {
  it("migration allows started/aborted and adds usage_estimated", () => {
    expect(sql).toContain("'started', 'aborted'");
    expect(sql).toContain("usage_estimated boolean not null default false");
  });
  it("startLedger inserts a started row; finishLedger updates it by id", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "row1" }, error: null });
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const admin = { from: vi.fn(() => ({ insert, update })) } as unknown as SupabaseClient;
    const id = await startLedger(admin, { phase: "chapter_1", model: "claude-sonnet-4-6" });
    expect(id).toBe("row1");
    expect((insert.mock.calls[0] as unknown[])[0]).toMatchObject({ outcome: "started", usage_estimated: true });
    await finishLedger(admin, id, { phase: "chapter_1", outcome: "generated", model: "claude-sonnet-4-6", usage: { inputTokens: 2400, outputTokens: 6000 } });
    expect((update.mock.calls[0] as unknown[])[0]).toMatchObject({ outcome: "generated", cost_usd: 0.0972, usage_estimated: false });
    expect(eq).toHaveBeenCalledWith("id", "row1");
  });
  it("estimates tokens from streamed characters", () => {
    expect(estimateTokens(3400)).toBe(1000);
  });
});
