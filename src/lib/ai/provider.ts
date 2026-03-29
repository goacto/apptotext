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

async function callClaude(messages: AIMessage[]): Promise<AIResponse> {
  const systemMessage = messages.find((m) => m.role === "system");
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
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
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
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
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY!}`,
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
