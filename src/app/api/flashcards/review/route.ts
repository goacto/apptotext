import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { XP_REWARDS } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";
import { calculateSM2 } from "@/lib/sm2";

interface FlashcardReviewBody {
  flashcard_id: string;
  quality: number; // 0-5 SM-2 quality rating
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
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

    const { allowed } = rateLimit(`flashcard:${user.id}`, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const body: FlashcardReviewBody = await request.json();

    if (!body.flashcard_id || typeof body.flashcard_id !== "string") {
      return NextResponse.json(
        { error: "flashcard_id is required" },
        { status: 400 }
      );
    }

    if (typeof body.quality !== "number" || body.quality < 0 || body.quality > 5) {
      return NextResponse.json(
        { error: "quality must be a number between 0 and 5" },
        { status: 400 }
      );
    }

    // Ensure quality is an integer
    const quality = Math.round(body.quality);

    // Verify the flashcard exists
    const { data: flashcard, error: flashcardError } = await supabase
      .from("flashcards")
      .select("id")
      .eq("id", body.flashcard_id)
      .single();

    if (flashcardError || !flashcard) {
      return NextResponse.json(
        { error: "Flashcard not found" },
        { status: 404 }
      );
    }

    // Fetch existing progress for this user and flashcard
    const { data: existingProgress, error: progressFetchError } = await supabase
      .from("flashcard_progress")
      .select("*")
      .eq("user_id", user.id)
      .eq("flashcard_id", body.flashcard_id)
      .single();

    if (progressFetchError && progressFetchError.code !== "PGRST116") {
      // PGRST116 = no rows found, which is expected for first review
      return NextResponse.json(
        { error: "Failed to fetch progress", details: progressFetchError.message },
        { status: 500 }
      );
    }

    const now = new Date();

    // Get previous values or defaults for first review
    const previousEaseFactor = existingProgress?.ease_factor ?? 2.5;
    const previousInterval = existingProgress?.interval_days ?? 0;
    const previousRepetitions = existingProgress?.repetitions ?? 0;

    // Run SM-2 calculation
    const { easeFactor, interval, repetitions } = calculateSM2(
      quality,
      previousEaseFactor,
      previousInterval,
      previousRepetitions
    );

    const nextReview = addDays(now, interval);

    let progress;

    if (existingProgress) {
      // Update existing progress
      const { data: updated, error: updateError } = await supabase
        .from("flashcard_progress")
        .update({
          ease_factor: easeFactor,
          interval_days: interval,
          repetitions,
          next_review: nextReview.toISOString(),
          last_reviewed: now.toISOString(),
        })
        .eq("id", existingProgress.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to update progress", details: updateError.message },
          { status: 500 }
        );
      }

      progress = updated;
    } else {
      // Create new progress record
      const { data: created, error: createError } = await supabase
        .from("flashcard_progress")
        .insert({
          user_id: user.id,
          flashcard_id: body.flashcard_id,
          ease_factor: easeFactor,
          interval_days: interval,
          repetitions,
          next_review: nextReview.toISOString(),
          last_reviewed: now.toISOString(),
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json(
          { error: "Failed to create progress", details: createError.message },
          { status: 500 }
        );
      }

      progress = created;
    }

    // Award XP for flashcard review
    const xpEarned = XP_REWARDS.FLASHCARD_REVIEWED;

    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("total_xp")
      .eq("id", user.id)
      .single();

    if (currentProfile) {
      await supabase
        .from("profiles")
        .update({
          total_xp: currentProfile.total_xp + xpEarned,
          last_activity: new Date().toISOString(),
        })
        .eq("id", user.id);
    }

    return NextResponse.json({
      progress_id: progress.id,
      next_review: nextReview.toISOString(),
      interval_days: interval,
      ease_factor: easeFactor,
      repetitions,
      xp_earned: xpEarned,
    });
  } catch (error) {
    console.error("Flashcard review error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
