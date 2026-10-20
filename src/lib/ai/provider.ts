import { AIProvider } from "../types";
import type { TokenUsage } from "./pricing";

export const PROVIDER_MODELS: Record<AIProvider, string> = {
  // claude-sonnet-4-20250514 was retired by Anthropic on 2026-06-15.
  claude: "claude-sonnet-4-6",
  openai: "gpt-4o",
  grok: "grok-3",
};

export type UsageCallback = (usage: TokenUsage | null) => void;

/** Default output cap for non-chapter calls. */
export const DEFAULT_MAX_TOKENS = 8192;

export interface StreamOptions {
  /** Output token cap (chapters use CHAPTER_MAX_TOKENS). */
  maxTokens?: number;
  /** Aborts the upstream request (deadline or client disconnect). */
  signal?: AbortSignal;
  /** Called with Anthropic's stop_reason (e.g. "end_turn", "max_tokens"). */
  onStopReason?: (reason: string) => void;
}

/** Merge a usage fragment from an Anthropic SSE event (message_start / message_delta). */
export function anthropicUsageFromEvent(parsed: Record<string, unknown>, acc: TokenUsage): TokenUsage {
  const next = { ...acc };
  if (parsed.type === "message_start") {
    const u = (parsed.message as { usage?: Record<string, number> } | undefined)?.usage;
    if (u) {
      next.inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      next.outputTokens = Math.max(next.outputTokens, u.output_tokens ?? 0);
    }
  } else if (parsed.type === "message_delta") {
    const u = parsed.usage as Record<string, number> | undefined;
    if (u?.output_tokens != null) next.outputTokens = u.output_tokens;
  }
  return next;
}

/** Usage from an OpenAI-compatible chunk/response ({usage:{prompt_tokens, completion_tokens}}). */
export function openAIUsage(parsed: Record<string, unknown>): TokenUsage | null {
  const u = parsed.usage as Record<string, number> | undefined | null;
  if (!u || u.prompt_tokens == null) return null;
  return { inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 };
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
  usage: TokenUsage | null;
}

export async function callAI(
  provider: AIProvider,
  messages: AIMessage[]
): Promise<AIResponse> {
  switch (provider) {
    case "claude":
      return callClaude(messages);
    case "openai":
      return callOpenAI(messages);
    case "grok":
      return callGrok(messages);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

/**
 * Stream AI response as a ReadableStream of text chunks.
 * Each chunk is a partial text delta from the AI provider.
 */
export function streamAI(
  provider: AIProvider,
  messages: AIMessage[],
  onUsage?: UsageCallback,
  opts: StreamOptions = {}
): ReadableStream<string> {
  switch (provider) {
    case "claude":
      return streamClaude(messages, onUsage, opts);
    case "openai":
      return streamOpenAI(messages, onUsage, opts);
    case "grok":
      return streamGrok(messages, onUsage, opts);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

function streamClaude(messages: AIMessage[], onUsage?: UsageCallback, opts: StreamOptions = {}): ReadableStream<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Claude is not configured. ANTHROPIC_API_KEY is missing.");
  }

  const systemMessage = messages.find((m) => m.role === "system");
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  return new ReadableStream({
    async start(controller) {
      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      let sawUsage = false;
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: PROVIDER_MODELS.claude,
            stream: true,
            max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
            system: systemMessage?.content || "",
            messages: userMessages,
          }),
          signal: opts.signal,
        });

        if (!response.ok || !response.body) {
          const error = await response.text();
          controller.error(new Error(`Claude API error: ${error}`));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                controller.enqueue(parsed.delta.text);
              } else if (parsed.type === "message_start" || parsed.type === "message_delta") {
                usage = anthropicUsageFromEvent(parsed, usage);
                sawUsage = true;
                if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
                  opts.onStopReason?.(String(parsed.delta.stop_reason));
                }
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
      } catch (err) {
        // Aborted (deadline / client gone) or network error: report what we know, then fail the stream.
        onUsage?.(sawUsage ? usage : null);
        controller.error(err);
        return;
      }
      onUsage?.(sawUsage ? usage : null);
      controller.close();
    },
  });
}

function streamOpenAICompatible(
  url: string,
  headers: Record<string, string>,
  model: string,
  messages: AIMessage[],
  onUsage?: UsageCallback,
  opts: StreamOptions = {}
): ReadableStream<string> {
  return new ReadableStream({
    async start(controller) {
      const response = await fetch(url, {
        signal: opts.signal,
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          model,
          stream: true,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
          stream_options: { include_usage: true },
        }),
      });

      if (!response.ok || !response.body) {
        const error = await response.text();
        controller.error(new Error(`API error: ${error}`));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let usage: TokenUsage | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(delta);
            }
            usage = openAIUsage(parsed) ?? usage;
          } catch {
            // Skip
          }
        }
      }
      onUsage?.(usage);
      controller.close();
    },
  });
}

function streamOpenAI(messages: AIMessage[], onUsage?: UsageCallback, opts: StreamOptions = {}): ReadableStream<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI is not configured. OPENAI_API_KEY is missing.");
  }
  return streamOpenAICompatible(
    "https://api.openai.com/v1/chat/completions",
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    "gpt-4o",
    messages,
    onUsage,
    opts
  );
}

function streamGrok(messages: AIMessage[], onUsage?: UsageCallback, opts: StreamOptions = {}): ReadableStream<string> {
  if (!process.env.XAI_API_KEY) {
    throw new Error("Grok is not configured. XAI_API_KEY is missing.");
  }
  return streamOpenAICompatible(
    "https://api.x.ai/v1/chat/completions",
    { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    "grok-3",
    messages,
    onUsage,
    opts
  );
}

async function callClaude(messages: AIMessage[]): Promise<AIResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Claude is not configured. ANTHROPIC_API_KEY is missing.");
  }

  const systemMessage = messages.find((m) => m.role === "system");
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: PROVIDER_MODELS.claude,
      stream: false,
      max_tokens: 8192,
      system: systemMessage?.content || "",
      messages: userMessages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const u = data.usage as Record<string, number> | undefined;
  return {
    content: data.content[0].text,
    provider: "claude",
    model: PROVIDER_MODELS.claude,
    usage: u
      ? {
          inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
          outputTokens: u.output_tokens ?? 0,
        }
      : null,
  };
}

async function callOpenAI(messages: AIMessage[]): Promise<AIResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI is not configured. OPENAI_API_KEY is missing.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    provider: "openai",
    model: PROVIDER_MODELS.openai,
    usage: openAIUsage(data),
  };
}

async function callGrok(messages: AIMessage[]): Promise<AIResponse> {
  if (!process.env.XAI_API_KEY) {
    throw new Error("Grok is not configured. XAI_API_KEY is missing.");
  }

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-3",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error: ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    provider: "grok",
    model: PROVIDER_MODELS.grok,
    usage: openAIUsage(data),
  };
}
