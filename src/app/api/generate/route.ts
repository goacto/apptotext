import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProvider, TextbookLevel } from "@/lib/types";
import { callAI } from "@/lib/ai/provider";
import {
  getTextbookSystemPrompt,
  getTextbookUserPrompt,
  getFlashcardSystemPrompt,
  getFlashcardUserPrompt,
  getQuizSystemPrompt,
  getQuizUserPrompt,
} from "@/lib/ai/prompts";

interface GenerateRequestBody {
  conversion_id: string;
  level: TextbookLevel;
  ai_provider: AIProvider;
}

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

    // Check if content already exists for this level
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

    const provider = (body.ai_provider || conversion.ai_provider || "claude") as AIProvider;
    const sourceContent = conversion.source_content as string;
    const title = conversion.title as string;

    // Generate textbook chapter
    const chapterResponse = await callAI(provider, [
      { role: "system", content: getTextbookSystemPrompt(body.level) },
      {
        role: "user",
        content: getTextbookUserPrompt(title, sourceContent, body.level, 1),
      },
    ]);

    const chapterContent = chapterResponse.content;
    const keyConcepts = extractKeyConcepts(chapterContent);
    const chapterTitle = extractChapterTitle(chapterContent);

    // Store chapter in Supabase
    const { data: chapter, error: chapterError } = await supabase
      .from("chapters")
      .insert({
        conversion_id: body.conversion_id,
        level: body.level,
        chapter_number: 1,
        title: chapterTitle,
        content: chapterContent,
        key_concepts: keyConcepts,
      })
      .select()
      .single();

    if (chapterError) {
      return NextResponse.json(
        { error: "Failed to store chapter", details: chapterError.message },
        { status: 500 }
      );
    }

    // Generate flashcards
    const flashcardResponse = await callAI(provider, [
      { role: "system", content: getFlashcardSystemPrompt() },
      {
        role: "user",
        content: getFlashcardUserPrompt(chapterContent, body.level),
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
      flashcardsData = [];
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
        console.error("Failed to store flashcards:", flashcardError.message);
      } else {
        flashcards = insertedFlashcards || [];
      }
    }

    // Generate quiz questions
    const quizResponse = await callAI(provider, [
      { role: "system", content: getQuizSystemPrompt() },
      {
        role: "user",
        content: getQuizUserPrompt(chapterContent, body.level, 10),
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
      quizData = [];
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
        console.error("Failed to store quiz questions:", quizError.message);
      } else {
        quizQuestions = insertedQuestions || [];
      }
    }

    return NextResponse.json({
      chapter,
      flashcards,
      quiz_questions: quizQuestions,
    });
  } catch (error) {
    console.error("Generation error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
