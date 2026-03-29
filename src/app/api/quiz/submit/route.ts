import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TextbookLevel } from "@/lib/types";
import { XP_REWARDS } from "@/lib/constants";

interface QuizSubmitBody {
  conversion_id: string;
  level: TextbookLevel;
  answers: { question_id: string; selected: number }[];
}

interface QuizResult {
  question_id: string;
  correct: boolean;
  selected: number;
  correct_answer: number;
}

const VALID_LEVELS: TextbookLevel[] = [101, 201, 301, 401, 501];

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

    const body: QuizSubmitBody = await request.json();

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

    if (!Array.isArray(body.answers) || body.answers.length === 0) {
      return NextResponse.json(
        { error: "answers array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate each answer has the required fields
    for (const answer of body.answers) {
      if (!answer.question_id || typeof answer.selected !== "number") {
        return NextResponse.json(
          { error: "Each answer must have question_id (string) and selected (number)" },
          { status: 400 }
        );
      }
    }

    // Fetch the quiz questions for this conversion and level
    const questionIds = body.answers.map((a) => a.question_id);
    const { data: questions, error: fetchError } = await supabase
      .from("quiz_questions")
      .select("id, correct_answer, conversion_id, level")
      .in("id", questionIds);

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to fetch quiz questions", details: fetchError.message },
        { status: 500 }
      );
    }

    if (!questions || questions.length === 0) {
      return NextResponse.json(
        { error: "No matching quiz questions found" },
        { status: 404 }
      );
    }

    // Verify all questions belong to the specified conversion and level
    const invalidQuestions = questions.filter(
      (q) => q.conversion_id !== body.conversion_id || q.level !== body.level
    );
    if (invalidQuestions.length > 0) {
      return NextResponse.json(
        { error: "Some questions do not belong to the specified conversion and level" },
        { status: 400 }
      );
    }

    // Build a lookup map
    const questionMap = new Map(questions.map((q) => [q.id, q.correct_answer as number]));

    // Calculate results
    const results: QuizResult[] = [];
    let correctCount = 0;

    for (const answer of body.answers) {
      const correctAnswer = questionMap.get(answer.question_id);
      if (correctAnswer === undefined) {
        continue; // Skip answers for questions not found
      }

      const isCorrect = answer.selected === correctAnswer;
      if (isCorrect) {
        correctCount++;
      }

      results.push({
        question_id: answer.question_id,
        correct: isCorrect,
        selected: answer.selected,
        correct_answer: correctAnswer,
      });
    }

    const totalQuestions = results.length;
    const isPerfectScore = correctCount === totalQuestions && totalQuestions > 0;

    // Calculate XP
    let xpEarned = XP_REWARDS.QUIZ_COMPLETED;
    if (isPerfectScore) {
      xpEarned += XP_REWARDS.QUIZ_PERFECT_SCORE;
    }

    // Create quiz session record
    const { data: session, error: sessionError } = await supabase
      .from("quiz_sessions")
      .insert({
        user_id: user.id,
        conversion_id: body.conversion_id,
        level: body.level,
        score: correctCount,
        total_questions: totalQuestions,
        xp_earned: xpEarned,
      })
      .select()
      .single();

    if (sessionError) {
      return NextResponse.json(
        { error: "Failed to create quiz session", details: sessionError.message },
        { status: 500 }
      );
    }

    // Update user's total XP
    const { error: xpError } = await supabase.rpc("increment_xp", {
      user_id_input: user.id,
      xp_amount: xpEarned,
    });

    if (xpError) {
      console.error("Failed to update XP:", xpError.message);
    }

    return NextResponse.json({
      session_id: session.id,
      score: correctCount,
      total: totalQuestions,
      xp_earned: xpEarned,
      perfect_score: isPerfectScore,
      results,
    });
  } catch (error) {
    console.error("Quiz submit error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
