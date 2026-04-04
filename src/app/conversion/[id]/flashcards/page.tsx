"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Layers,
  Loader2,
  RotateCcw,
  Sparkles,
  Trophy,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AuthGuard, useAuth } from "@/components/auth/auth-guard";
import { TEXTBOOK_LEVELS, XP_REWARDS } from "@/lib/constants";
import type {
  Flashcard,
  FlashcardProgress,
  TextbookLevel,
} from "@/lib/types";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// ---------------------------------------------------------------------------
// Quality rating config for SM-2
// ---------------------------------------------------------------------------

interface QualityOption {
  quality: number;
  label: string;
  description: string;
  colorClass: string;
}

const QUALITY_OPTIONS: QualityOption[] = [
  {
    quality: 0,
    label: "0",
    description: "Complete blackout",
    colorClass:
      "bg-red-600 hover:bg-red-700 text-white border-red-700",
  },
  {
    quality: 1,
    label: "1",
    description: "Wrong, recognized",
    colorClass:
      "bg-orange-500 hover:bg-orange-600 text-white border-orange-600",
  },
  {
    quality: 2,
    label: "2",
    description: "Wrong, easy recall",
    colorClass:
      "bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-600",
  },
  {
    quality: 3,
    label: "3",
    description: "Correct, difficult",
    colorClass:
      "bg-lime-500 hover:bg-lime-600 text-white border-lime-600",
  },
  {
    quality: 4,
    label: "4",
    description: "Correct",
    colorClass:
      "bg-green-600 hover:bg-green-700 text-white border-green-700",
  },
  {
    quality: 5,
    label: "5",
    description: "Perfect",
    colorClass:
      "bg-teal-600 hover:bg-teal-700 text-white border-teal-700",
  },
];

// ---------------------------------------------------------------------------
// Helper: determine which cards are due / new
// ---------------------------------------------------------------------------

type StudyMode = "due" | "all";

function buildStudyQueue(
  flashcards: Flashcard[],
  progressMap: Map<string, FlashcardProgress>,
  mode: StudyMode = "due"
): Flashcard[] {
  const now = new Date();

  const dueCards: Flashcard[] = [];
  const newCards: Flashcard[] = [];
  const notYetDue: Flashcard[] = [];

  for (const card of flashcards) {
    const progress = progressMap.get(card.id);
    if (!progress) {
      newCards.push(card);
    } else {
      const nextReview = new Date(progress.next_review);
      if (nextReview <= now) {
        dueCards.push(card);
      } else {
        notYetDue.push(card);
      }
    }
  }

  if (mode === "all") {
    return [...dueCards, ...newCards, ...notYetDue];
  }
  return [...dueCards, ...newCards];
}

// ---------------------------------------------------------------------------
// Main content component
// ---------------------------------------------------------------------------

function FlashcardStudyContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const supabase = createClient();

  const conversionId = params.id as string;
  const levelParam = searchParams.get("level");
  const level: TextbookLevel = (
    levelParam ? Number(levelParam) : 101
  ) as TextbookLevel;

  const levelMeta = TEXTBOOK_LEVELS.find((l) => l.level === level);

  // ---- State ---------------------------------------------------------------

  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [progressMap, setProgressMap] = useState<
    Map<string, FlashcardProgress>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Study session state
  const [studyMode, setStudyMode] = useState<StudyMode>("due");
  const [studyQueue, setStudyQueue] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);

  // ---- Data fetching -------------------------------------------------------

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch flashcards for this conversion + level
      const { data: cardsData, error: cardsError } = await supabase
        .from("flashcards")
        .select("*")
        .eq("conversion_id", conversionId)
        .eq("level", level)
        .order("created_at", { ascending: true });

      if (cardsError) throw cardsError;

      const cards = (cardsData as Flashcard[]) || [];
      setFlashcards(cards);

      if (cards.length === 0) {
        setStudyQueue([]);
        setIsLoading(false);
        return;
      }

      // Fetch progress for user + these flashcards
      const cardIds = cards.map((c) => c.id);
      const { data: progressData, error: progressError } = await supabase
        .from("flashcard_progress")
        .select("*")
        .eq("user_id", user.id)
        .in("flashcard_id", cardIds);

      if (progressError) throw progressError;

      const pMap = new Map<string, FlashcardProgress>();
      for (const p of (progressData as FlashcardProgress[]) || []) {
        pMap.set(p.flashcard_id, p);
      }
      setProgressMap(pMap);

      const queue = buildStudyQueue(cards, pMap);
      setStudyQueue(queue);
      setCurrentIndex(0);
      setIsFlipped(false);
      setReviewedCount(0);
      setXpEarned(0);
      setSessionComplete(queue.length === 0);
    } catch {
      setError("Failed to load flashcards. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, conversionId, level, user.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Handlers ------------------------------------------------------------

  function handleFlip() {
    if (!isSubmitting) {
      setIsFlipped((prev) => !prev);
    }
  }

  async function handleRate(quality: number) {
    if (isSubmitting || !currentCard) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/flashcards/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flashcard_id: currentCard.id,
          quality,
        }),
      });

      if (!response.ok) {
        throw new Error("Review submission failed");
      }

      const earned = XP_REWARDS.FLASHCARD_REVIEWED;
      setXpEarned((prev) => prev + earned);
      setReviewedCount((prev) => prev + 1);

      // Advance to next card
      const nextIndex = currentIndex + 1;
      if (nextIndex >= studyQueue.length) {
        setSessionComplete(true);
      } else {
        setCurrentIndex(nextIndex);
        setIsFlipped(false);
      }
    } catch {
      // Silently continue — the user can still keep studying.
      // In production you might show a toast here.
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReviewAgain() {
    setStudyMode("due");
    setSessionComplete(false);
    fetchData();
  }

  function handleStudyAll() {
    setStudyMode("all");
    const queue = buildStudyQueue(flashcards, progressMap, "all");
    setStudyQueue(queue);
    setCurrentIndex(0);
    setIsFlipped(false);
    setReviewedCount(0);
    setXpEarned(0);
    setSessionComplete(queue.length === 0);
  }

  // ---- Derived values ------------------------------------------------------

  const currentCard: Flashcard | null =
    studyQueue.length > 0 && currentIndex < studyQueue.length
      ? studyQueue[currentIndex]
      : null;

  const totalInQueue = studyQueue.length;
  const progressPercent =
    totalInQueue > 0 ? Math.round((reviewedCount / totalInQueue) * 100) : 0;

  // ---- Analytics derived from progress data --------------------------------
  const analytics = (() => {
    const now = new Date();
    let newCount = 0;
    let dueCount = 0;
    let learningCount = 0; // 1-3 repetitions
    let masteredCount = 0; // 4+ repetitions
    let totalReviews = 0;
    let avgEaseFactor = 0;

    for (const card of flashcards) {
      const progress = progressMap.get(card.id);
      if (!progress) {
        newCount++;
        continue;
      }
      totalReviews += progress.repetitions;
      avgEaseFactor += progress.ease_factor;

      const nextReview = new Date(progress.next_review);
      if (nextReview <= now) {
        dueCount++;
      }
      if (progress.repetitions >= 4) {
        masteredCount++;
      } else {
        learningCount++;
      }
    }

    const reviewedCards = flashcards.length - newCount;
    return {
      total: flashcards.length,
      newCount,
      dueCount,
      learningCount,
      masteredCount,
      totalReviews,
      avgEaseFactor: reviewedCards > 0
        ? Math.round((avgEaseFactor / reviewedCards) * 100) / 100
        : 2.5,
      masteryPercent: flashcards.length > 0
        ? Math.round((masteredCount / flashcards.length) * 100)
        : 0,
    };
  })();

  // ---- Loading state -------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading flashcards...
          </p>
        </div>
      </div>
    );
  }

  // ---- Error state ---------------------------------------------------------

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => router.push(`/conversion/${conversionId}`)}
            >
              <ArrowLeft className="size-4" />
              Back to Textbook
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- No flashcards available ---------------------------------------------

  if (flashcards.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header
          conversionId={conversionId}
          level={level}
          levelMeta={levelMeta}
          cardCount={0}
          router={router}
        />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="mb-4 mx-auto flex size-16 items-center justify-center rounded-full bg-muted">
            <Layers className="size-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-xl font-semibold">
            No Flashcards Yet
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Flashcards have not been generated for this level yet. Go back
            to the textbook and generate content first.
          </p>
          <Button
            variant="outline"
            onClick={() => router.push(`/conversion/${conversionId}`)}
          >
            <ArrowLeft className="size-4" />
            Back to Textbook
          </Button>
        </div>
      </div>
    );
  }

  // ---- Session complete screen ---------------------------------------------

  if (sessionComplete) {
    const allCaughtUp = totalInQueue === 0 && flashcards.length > 0;

    return (
      <div className="min-h-screen bg-background">
        <Header
          conversionId={conversionId}
          level={level}
          levelMeta={levelMeta}
          cardCount={flashcards.length}
          router={router}
        />
        <div className="mx-auto max-w-lg px-4 py-16">
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                {allCaughtUp ? (
                  <CheckCircle2 className="size-10 text-green-600 dark:text-green-400" />
                ) : (
                  <Trophy className="size-10 text-green-600 dark:text-green-400" />
                )}
              </div>

              <h2 className="mb-2 text-2xl font-bold">
                {allCaughtUp ? "All Caught Up!" : "Session Complete!"}
              </h2>

              {allCaughtUp ? (
                <p className="mb-6 text-sm text-muted-foreground">
                  All {flashcards.length} cards are scheduled for future
                  review. Come back later when they are due.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-sm text-muted-foreground">
                    You reviewed{" "}
                    <span className="font-semibold text-foreground">
                      {reviewedCount}
                    </span>{" "}
                    {reviewedCount === 1 ? "card" : "cards"} this session.
                  </p>
                  <div className="mb-6 flex items-center gap-2 text-sm">
                    <Sparkles className="size-4 text-yellow-500" />
                    <span className="font-semibold text-foreground">
                      +{xpEarned} XP
                    </span>
                    <span className="text-muted-foreground">earned</span>
                  </div>
                  <p className="mb-8 text-xs text-muted-foreground">
                    Cards will reappear based on your spaced repetition
                    schedule.
                  </p>
                </>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() =>
                    router.push(`/conversion/${conversionId}`)
                  }
                >
                  <BookOpen className="size-4" />
                  Back to Textbook
                </Button>
                {!allCaughtUp && (
                  <Button variant="outline" onClick={handleReviewAgain}>
                    <RotateCcw className="size-4" />
                    Review Again
                  </Button>
                )}
                <Button onClick={handleStudyAll}>
                  <Layers className="size-4" />
                  Study All ({flashcards.length})
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Spaced Repetition Analytics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Study Analytics</CardTitle>
              <CardDescription>Spaced repetition progress</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Mastery bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Mastery</span>
                  <span className="font-medium">{analytics.masteryPercent}%</span>
                </div>
                <Progress value={analytics.masteryPercent} />
              </div>

              {/* Stat grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border px-3 py-2 text-center">
                  <p className="text-lg font-bold text-foreground">{analytics.newCount}</p>
                  <p className="text-[10px] text-muted-foreground">New</p>
                </div>
                <div className="rounded-lg border px-3 py-2 text-center">
                  <p className="text-lg font-bold text-orange-500">{analytics.dueCount}</p>
                  <p className="text-[10px] text-muted-foreground">Due</p>
                </div>
                <div className="rounded-lg border px-3 py-2 text-center">
                  <p className="text-lg font-bold text-blue-500">{analytics.learningCount}</p>
                  <p className="text-[10px] text-muted-foreground">Learning</p>
                </div>
                <div className="rounded-lg border px-3 py-2 text-center">
                  <p className="text-lg font-bold text-green-500">{analytics.masteredCount}</p>
                  <p className="text-[10px] text-muted-foreground">Mastered</p>
                </div>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Total reviews</span>
                  <span className="font-medium text-foreground">{analytics.totalReviews}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg ease factor</span>
                  <span className="font-medium text-foreground">{analytics.avgEaseFactor}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ---- Active study view ---------------------------------------------------

  return (
    <div className="min-h-screen bg-background">
      <Header
        conversionId={conversionId}
        level={level}
        levelMeta={levelMeta}
        cardCount={flashcards.length}
        router={router}
      />

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
            <span>Progress</span>
            <span>
              {reviewedCount} / {totalInQueue} reviewed
            </span>
          </div>
          <Progress value={progressPercent} />
        </div>

        {/* Card number indicator */}
        <div className="mb-4 text-center text-sm text-muted-foreground">
          {currentIndex + 1} / {totalInQueue}
        </div>

        {/* Flashcard with flip animation */}
        {currentCard && (
          <div
            className="perspective-1000 mx-auto mb-8 w-full cursor-pointer"
            style={{ perspective: "1000px" }}
            onClick={handleFlip}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleFlip();
              }
            }}
            aria-label={
              isFlipped ? "Showing answer. Click to flip back." : "Showing question. Click to flip."
            }
          >
            <div
              className="relative w-full transition-transform duration-500"
              style={{
                transformStyle: "preserve-3d",
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* Front face */}
              <Card
                className="min-h-[280px] sm:min-h-[320px]"
                style={{ backfaceVisibility: "hidden" }}
              >
                <CardContent className="flex min-h-[280px] sm:min-h-[320px] flex-col items-center justify-center p-8 text-center">
                  <Badge variant="secondary" className="mb-4">
                    Question
                  </Badge>
                  <p className="text-lg font-medium leading-relaxed sm:text-xl">
                    {currentCard.front}
                  </p>
                  <p className="mt-6 text-xs text-muted-foreground">
                    Tap to reveal answer
                  </p>
                </CardContent>
              </Card>

              {/* Back face */}
              <Card
                className="absolute inset-0 min-h-[280px] sm:min-h-[320px]"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <CardContent className="flex min-h-[280px] sm:min-h-[320px] flex-col items-center justify-center p-8 text-center">
                  <Badge variant="default" className="mb-4">
                    Answer
                  </Badge>
                  <p className="text-lg font-medium leading-relaxed sm:text-xl">
                    {currentCard.back}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Quality rating buttons — shown only when flipped */}
        {isFlipped && currentCard && (
          <div className="space-y-3">
            <p className="text-center text-sm font-medium text-muted-foreground">
              How well did you know this?
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {QUALITY_OPTIONS.map((option) => (
                <button
                  key={option.quality}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRate(option.quality);
                  }}
                  disabled={isSubmitting}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-center transition-all disabled:opacity-50 ${option.colorClass}`}
                >
                  <span className="text-lg font-bold">{option.label}</span>
                  <span className="text-[10px] leading-tight opacity-90">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
            {isSubmitting && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </div>
            )}
          </div>
        )}

        {/* Keyboard hint */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Press{" "}
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
            Space
          </kbd>{" "}
          or{" "}
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
            Enter
          </kbd>{" "}
          to flip
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header sub-component
// ---------------------------------------------------------------------------

function Header({
  conversionId,
  level,
  levelMeta,
  cardCount,
  router,
}: {
  conversionId: string;
  level: TextbookLevel;
  levelMeta: (typeof TEXTBOOK_LEVELS)[number] | undefined;
  cardCount: number;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                router.push(`/conversion/${conversionId}`)
              }
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                Flashcard Study
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {levelMeta && (
                  <Badge variant="secondary">
                    {level} {levelMeta.name}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {cardCount} {cardCount === 1 ? "card" : "cards"}
                </span>
              </div>
            </div>
          </div>
          <Layers className="size-5 text-muted-foreground" />
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Page export with AuthGuard wrapper
// ---------------------------------------------------------------------------

export default function FlashcardStudyPage() {
  return (
    <AuthGuard>
      <FlashcardStudyContent />
    </AuthGuard>
  );
}
