import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProvider } from "@/lib/types";
import { streamAI } from "@/lib/ai/provider";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

interface ChatRequestBody {
  conversion_id: string;
  chapter_id: string;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { allowed } = rateLimit(`chat:${user.id}`, 30);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const body: ChatRequestBody = await request.json();

    if (!body.message?.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Fetch the chapter content for context
    const { data: chapter } = await supabase
      .from("chapters")
      .select("title, content, level")
      .eq("id", body.chapter_id)
      .single();

    if (!chapter) {
      return NextResponse.json(
        { error: "Chapter not found" },
        { status: 404 }
      );
    }

    // Fetch the conversion to get the AI provider
    const { data: conversion } = await supabase
      .from("conversions")
      .select("ai_provider, title")
      .eq("id", body.conversion_id)
      .single();

    const provider = (conversion?.ai_provider || "claude") as AIProvider;

    const systemPrompt = `You are an AI tutor helping a student understand the following textbook chapter. Be helpful, encouraging, and concise. Answer questions based on the chapter content. If the question is unrelated to the material, gently redirect to the topic.

Chapter: "${chapter.title}" (Level ${chapter.level})
From: "${conversion?.title}"

Chapter content (for reference):
${chapter.content.slice(0, 6000)}

Guidelines:
- Keep answers concise (2-4 paragraphs max)
- Use code examples when relevant
- Encourage the GOACTO spirit — Growing Ourselves And Contributing To Others`;

    // Build messages: system + history (last 10 messages) + new message
    const historyMessages = (body.history || []).slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...historyMessages,
      { role: "user" as const, content: body.message },
    ];

    // Stream the response
    const aiStream = streamAI(provider, messages);
    const reader = aiStream.getReader();
    const encoder = new TextEncoder();

    const responseStream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: value })}\n\n`));
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
