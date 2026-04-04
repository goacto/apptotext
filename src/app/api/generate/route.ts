import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProvider, TextbookLevel } from "@/lib/types";
import { callAI, streamAI } from "@/lib/ai/provider";
import {
  getTextbookSystemPrompt,
  getTextbookUserPrompt,
  getFlashcardSystemPrompt,
  getFlashcardUserPrompt,
  getQuizSystemPrompt,
  getQuizUserPrompt,
} from "@/lib/ai/prompts";
import { canGenerate, incrementGenerationCount } from "@/lib/subscription";

type GeneratePhase = "chapter" | "flashcards" | "quiz";

interface GenerateRequestBody {
  conversion_id: string;
  level: TextbookLevel;
  ai_provider: AIProvider;
  phase: GeneratePhase;
  chapter_number?: number;
}

export const maxDuration = 60;

const VALID_LEVELS: TextbookLevel[] = [101, 201, 301, 401, 501];

function extractKeyConcepts(markdown: string): string[] {
  const jsonMatch = markdown.match(/KEY_CONCEPTS\s*\n```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const concepts = JSON.parse(jsonMatch[1]);
      if (Array.isArray(concepts)) {
        return concepts.map(String);
      }
    } catch {
      // Failed to parse, fall through
    }
  }
  return [];
}

function extractChapterTitle(markdown: string): string {
  const headingMatch = markdown.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }
  return "Untitled Chapter";
}

function parseJsonFromAIResponse(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from code block
  }

  // Try extracting from ```json ... ``` blocks
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
      // Fall through
    }
  }

  // Try finding an array in the text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // Fall through
    }
  }

  throw new Error("Failed to parse JSON from AI response");
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

    const body: GenerateRequestBody = await request.json();

    if (!body.conversion_id || typeof body.conversion_id !== "string") {
      return NextResponse.json(
        { error: "conversion_id is required" },
        { status: 400 }
      );
    }

    if (!body.level || !VALID_LEVELS.includes(body.level)) {
      return NextResponse.json(
        { error: "Valid level is required (101, 201, 301, 401, or 501)" },
        { status: 400 }
      );
    }

    const phase = body.phase || "chapter";
    if (!["chapter", "flashcards", "quiz"].includes(phase)) {
      return NextResponse.json(
        { error: "Valid phase is required (chapter, flashcards, or quiz)" },
        { status: 400 }
      );
    }

    // Fetch the conversion
    const { data: conversion, error: fetchError } = await supabase
      .from("conversions")
      .select("*")
      .eq("id", body.conversion_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !conversion) {
      return NextResponse.json(
        { error: "Conversion not found" },
        { status: 404 }
      );
    }

    const providerRaw = body.ai_provider || conversion.ai_provider || "claude";
    if (!["claude", "openai", "grok"].includes(providerRaw)) {
      return NextResponse.json(
        { error: "Invalid AI provider" },
        { status: 400 }
      );
    }
    const provider = providerRaw as AIProvider;

    // ── CHAPTER PHASE ──────────────────────────────────────────────
    if (phase === "chapter") {
      const chapterNumber = body.chapter_number ?? 1;
      if (chapterNumber < 1 || chapterNumber > 5) {
        return NextResponse.json(
          { error: "chapter_number must be between 1 and 5" },
          { status: 400 }
        );
      }

      // Check generation limits only on chapter 1
      if (chapterNumber === 1) {
        const { allowed, remaining, plan } = await canGenerate(supabase, user.id);
        if (!allowed) {
          const limitMessages: Record<string, string> = {
            free: "Free tier limit reached (3 generations). Upgrade to a paid plan for more generations per month.",
            standard: "Monthly generation limit reached (10). Upgrade to Pro for 25/month or Master for 50/month, or wait for your next billing cycle.",
            pro: "Monthly generation limit reached (25). Upgrade to Master for 50/month, or wait for your next billing cycle.",
            master: "Monthly generation limit reached (50). Your limit resets at the start of your next billing cycle.",
          };
          const message = limitMessages[plan] ?? limitMessages.free;
          return NextResponse.json({ error: message, upgrade_required: plan === "free" }, { status: 403 });
        }

        // Check if any chapters already exist for this level
        const { data: existingChapter } = await supabase
          .from("chapters")
          .select("id")
          .eq("conversion_id", body.conversion_id)
          .eq("level", body.level)
          .limit(1)
          .single();

        if (existingChapter) {
          return NextResponse.json(
            { error: "Content already generated for this level. Delete existing content first." },
            { status: 409 }
          );
        }
      }

      const sourceContent = conversion.source_content as string;
      const title = conversion.title as string;

      const aiMessages = [
        { role: "system" as const, content: getTextbookSystemPrompt(body.level) },
        {
          role: "user" as const,
          content: getTextbookUserPrompt(title, sourceContent, body.level, chapterNumber),
        },
      ];

      // Stream the chapter content via SSE
      const aiStream = streamAI(provider, aiMessages);
      const reader = aiStream.getReader();

      const encoder = new TextEncoder();
      let fullContent = "";

      const responseStream = new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            // Stream complete — save to DB, send final event
            const keyConcepts = extractKeyConcepts(fullContent);
            const chapterTitle = extractChapterTitle(fullContent);

            const { data: chapter, error: chapterError } = await supabase
              .from("chapters")
              .insert({
                conversion_id: body.conversion_id,
                level: body.level,
                chapter_number: chapterNumber,
                title: chapterTitle,
                content: fullContent,
                key_concepts: keyConcepts,
              })
              .select()
              .single();

            if (chapterNumber === 1) {
              await incrementGenerationCount(supabase, user.id);
            }

            const doneData = JSON.stringify({
              done: true,
              chapter: chapter ?? { id: null },
              error: chapterError?.message ?? null,
            });
            controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
            controller.close();
            return;
          }

          fullContent += value;
          const chunkData = JSON.stringify({ text: value });
          controller.enqueue(encoder.encode(`data: ${chunkData}\n\n`));
        },
      });

      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // ── FLASHCARDS PHASE ───────────────────────────────────────────
    if (phase === "flashcards") {
      // Read the chapter from DB (must exist)
      const { data: chapter, error: chapterFetchError } = await supabase
        .from("chapters")
        .select("content")
        .eq("conversion_id", body.conversion_id)
        .eq("level", body.level)
        .limit(1)
        .single();

      if (chapterFetchError || !chapter) {
        return NextResponse.json(
          { error: "Chapter must be generated before flashcards" },
          { status: 400 }
        );
      }

      const flashcardResponse = await callAI(provider, [
        { role: "system", content: getFlashcardSystemPrompt() },
        {
          role: "user",
          content: getFlashcardUserPrompt(chapter.content, body.level),
        },
      ]);

      let flashcardsData: { front: string; back: string; difficulty: number }[] = [];
      try {
        const parsed = parseJsonFromAIResponse(flashcardResponse.content);
        if (Array.isArray(parsed)) {
          flashcardsData = parsed.map((card: Record<string, unknown>) => ({
            front: String(card.front || ""),
            back: String(card.back || ""),
            difficulty: typeof card.difficulty === "number"
              ? Math.min(5, Math.max(1, card.difficulty))
              : 3,
          }));
        }
      } catch (parseError) {
        console.error("Failed to parse flashcards:", parseError);
        return NextResponse.json(
          { error: "Failed to parse flashcard data from AI" },
          { status: 500 }
        );
      }

      let flashcards: Record<string, unknown>[] = [];
      if (flashcardsData.length > 0) {
        const flashcardRows = flashcardsData.map((card) => ({
          conversion_id: body.conversion_id,
          level: body.level,
          front: card.front,
          back: card.back,
          difficulty: card.difficulty,
        }));

        const { data: insertedFlashcards, error: flashcardError } = await supabase
          .from("flashcards")
          .insert(flashcardRows)
          .select();

        if (flashcardError) {
          return NextResponse.json(
            { error: "Failed to store flashcards", details: flashcardError.message },
            { status: 500 }
          );
        }
        flashcards = insertedFlashcards || [];
      }

      return NextResponse.json({ flashcards });
    }

    // ── QUIZ PHASE ─────────────────────────────────────────────────
    if (phase === "quiz") {
      // Read the chapter from DB (must exist)
      const { data: chapter, error: chapterFetchError } = await supabase
        .from("chapters")
        .select("content")
        .eq("conversion_id", body.conversion_id)
        .eq("level", body.level)
        .limit(1)
        .single();

      if (chapterFetchError || !chapter) {
        return NextResponse.json(
          { error: "Chapter must be generated before quiz" },
          { status: 400 }
        );
      }

      const quizResponse = await callAI(provider, [
        { role: "system", content: getQuizSystemPrompt() },
        {
          role: "user",
          content: getQuizUserPrompt(chapter.content, body.level, 10),
        },
      ]);

      let quizData: {
        question: string;
        options: string[];
        correct_answer: number;
        explanation: string;
      }[] = [];

      try {
        const parsed = parseJsonFromAIResponse(quizResponse.content);
        if (Array.isArray(parsed)) {
          quizData = parsed.map((q: Record<string, unknown>) => ({
            question: String(q.question || ""),
            options: Array.isArray(q.options) ? q.options.map(String) : [],
            correct_answer: typeof q.correct_answer === "number"
              ? Math.min(3, Math.max(0, q.correct_answer))
              : 0,
            explanation: String(q.explanation || ""),
          }));
        }
      } catch (parseError) {
        console.error("Failed to parse quiz:", parseError);
        return NextResponse.json(
          { error: "Failed to parse quiz data from AI" },
          { status: 500 }
        );
      }

      let quizQuestions: Record<string, unknown>[] = [];
      if (quizData.length > 0) {
        const quizRows = quizData.map((q) => ({
          conversion_id: body.conversion_id,
          level: body.level,
          question: q.question,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
        }));

        const { data: insertedQuestions, error: quizError } = await supabase
          .from("quiz_questions")
          .insert(quizRows)
          .select();

        if (quizError) {
          return NextResponse.json(
            { error: "Failed to store quiz questions", details: quizError.message },
            { status: 500 }
          );
        }
        quizQuestions = insertedQuestions || [];
      }

      return NextResponse.json({ quiz_questions: quizQuestions });
    }

    return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
  } catch (error) {
    console.error("Generation error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
