import { AIProvider } from "../types";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
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
  messages: AIMessage[]
): ReadableStream<string> {
  switch (provider) {
    case "claude":
      return streamClaude(messages);
    case "openai":
      return streamOpenAI(messages);
    case "grok":
      return streamGrok(messages);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

function streamClaude(messages: AIMessage[]): ReadableStream<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Claude is not configured. ANTHROPIC_API_KEY is missing.");
  }

  const systemMessage = messages.find((m) => m.role === "system");
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  return new ReadableStream({
    async start(controller) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          stream: true,
          max_tokens: 8192,
          system: systemMessage?.content || "",
          messages: userMessages,
        }),
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
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
      controller.close();
    },
  });
}

function streamOpenAICompatible(
  url: string,
  headers: Record<string, string>,
  model: string,
  messages: AIMessage[]
): ReadableStream<string> {
  return new ReadableStream({
    async start(controller) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          model,
          stream: true,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: 8192,
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
          } catch {
            // Skip
          }
        }
      }
      controller.close();
    },
  });
}

function streamOpenAI(messages: AIMessage[]): ReadableStream<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI is not configured. OPENAI_API_KEY is missing.");
  }
  return streamOpenAICompatible(
    "https://api.openai.com/v1/chat/completions",
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    "gpt-4o",
    messages
  );
}

function streamGrok(messages: AIMessage[]): ReadableStream<string> {
  if (!process.env.XAI_API_KEY) {
    throw new Error("Grok is not configured. XAI_API_KEY is missing.");
  }
  return streamOpenAICompatible(
    "https://api.x.ai/v1/chat/completions",
    { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    "grok-3",
    messages
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
      model: "claude-sonnet-4-20250514",
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
  return {
    content: data.content[0].text,
    provider: "claude",
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
  };
}
