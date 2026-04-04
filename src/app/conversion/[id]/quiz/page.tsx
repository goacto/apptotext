"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Loader2,
  RotateCcw,
  Star,
  Trophy,
  XCircle,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AuthGuard, useAuth } from "@/components/auth/auth-guard";
import { TEXTBOOK_LEVELS, GOACTO_SHORT, XP_REWARDS } from "@/lib/constants";
import type {
  QuizQuestion,
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
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuizPhase = "start" | "question" | "feedback" | "results";

interface QuizResult {
  score: number;
  total_questions: number;
  xp_earned: number;
  passed: boolean;
  new_badges?: { id: string; name: string; icon: string }[];
}

// ---------------------------------------------------------------------------
// Confetti animation (lightweight CSS-only approach)
// ---------------------------------------------------------------------------

function ConfettiCelebration() {
  const pieces = useMemo(() => {
    const colors = [
      "bg-yellow-400",
      "bg-green-400",
      "bg-blue-400",
      "bg-pink-400",
      "bg-purple-400",
      "bg-orange-400",
      "bg-red-400",
      "bg-teal-400",
    ];
    return Array.from({ length: 48 }, (_, i) => ({
      id: i,
      color: colors[i % colors.length],
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 1.5}s`,
      duration: `${2 + Math.random() * 2}s`,
      size: Math.random() > 0.5 ? "size-2" : "size-1.5",
      rotation: `${Math.random() * 360}deg`,
    }));
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className={cn(
            "absolute rounded-sm opacity-0",
            piece.color,
            piece.size
          )}
          style={{
            left: piece.left,
            top: "-8px",
            animation: `confetti-fall ${piece.duration} ${piece.delay} ease-in forwards`,
            transform: `rotate(${piece.rotation})`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% {
            opacity: 1;
            top: -8px;
            transform: rotate(0deg) translateX(0px);
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            top: 100vh;
            transform: rotate(720deg) translateX(${Math.random() > 0.5 ? "" : "-"}80px);
          }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Encouragement messages
// ---------------------------------------------------------------------------

function getEncouragementMessage(score: number, total: number): string {
  const pct = total > 0 ? (score / total) * 100 : 0;

  if (pct === 100)
    return `Perfect score! The ${GOACTO_SHORT} spirit shines bright in you -- Growing Ourselves And Contributing To Others starts with mastering your craft!`;
  if (pct >= 80)
    return `Impressive work! You're well on your way. ${GOACTO_SHORT} reminds us that every step of growth matters -- keep pushing forward!`;
  if (pct >= 60)
    return `Solid effort! You're building a strong foundation. Remember the ${GOACTO_SHORT} way -- persistence is the key to growth.`;
  if (pct >= 40)
    return `Good start! There's room to grow, and that's exciting. ${GOACTO_SHORT} teaches us that Contributing To Others begins with investing in ourselves.`;
  return `Every expert was once a beginner. ${GOACTO_SHORT} believes in Growing Ourselves first -- review the material and try again. You've got this!`;
}

// ---------------------------------------------------------------------------
// Progress bar component (simpler than the shadcn one for inline use)
// ---------------------------------------------------------------------------

function QuizProgressBar({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="flex w-full items-center gap-3">
      <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
        Question {current} of {total}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main quiz content
// ---------------------------------------------------------------------------

function QuizContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const supabase = createClient();

  const conversionId = params.id as string;
  const levelParam = searchParams.get("level");
  const level: TextbookLevel = (
    [101, 201, 301, 401, 501].includes(Number(levelParam))
      ? Number(levelParam)
      : 101
  ) as TextbookLevel;

  const levelMeta = TEXTBOOK_LEVELS.find((l) => l.level === level);

  // ---- State ----
  const [phase, setPhase] = useState<QuizPhase>("start");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // ---- Derived ----
  const currentQuestion = questions[currentIndex] ?? null;
  const isLastQuestion = currentIndex === questions.length - 1;
  const isCorrect =
    selectedOption !== null && currentQuestion
      ? selectedOption === currentQuestion.correct_answer
      : false;

  // ---- Fetch questions ----
  const fetchQuestions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("conversion_id", conversionId)
        .eq("level", level)
        .order("created_at", { ascending: true });

      if (fetchError) throw fetchError;
      if (!data || data.length === 0) {
        setError("No quiz questions found for this level. Generate textbook content first, then try again.");
        return;
      }
      setQuestions(data as QuizQuestion[]);
    } catch {
      setError("Failed to load quiz questions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, conversionId, level]);

  // ---- Fetch best score ----
  const fetchBestScore = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("quiz_sessions")
        .select("score, total_questions")
        .eq("user_id", user.id)
        .eq("conversion_id", conversionId)
        .eq("level", level)
        .order("score", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setBestScore(data[0].score);
      }
    } catch {
      // Non-critical -- ignore
    }
  }, [supabase, user.id, conversionId, level]);

  useEffect(() => {
    fetchQuestions();
    fetchBestScore();
  }, [fetchQuestions, fetchBestScore]);

  // ---- Handlers ----

  function handleStartQuiz() {
    setPhase("question");
    setCurrentIndex(0);
    setSelectedOption(null);
    setAnswers([]);
    setResult(null);
    setShowConfetti(false);
  }

  function handleSelectOption(optionIndex: number) {
    if (phase !== "question") return;
    setSelectedOption(optionIndex);
    setPhase("feedback");
  }

  function handleNextQuestion() {
    const updatedAnswers = [...answers, selectedOption!];
    setAnswers(updatedAnswers);

    if (isLastQuestion) {
      submitQuiz(updatedAnswers);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setPhase("question");
    }
  }

  async function submitQuiz(finalAnswers: number[]) {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversion_id: conversionId,
          level,
          answers: questions.map((q, i) => ({
            question_id: q.id,
            selected: finalAnswers[i],
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Submission failed (${response.status})`);
      }

      const data = await response.json();
      const quizResult: QuizResult = {
        score: data.score ?? 0,
        total_questions: data.total_questions ?? questions.length,
        xp_earned: data.xp_earned ?? 0,
        passed: data.passed ?? false,
        new_badges: data.new_badges,
      };

      setResult(quizResult);
      setPhase("results");

      if (quizResult.score === quizResult.total_questions) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      }
    } catch (err) {
      // Compute results locally as fallback
      const score = questions.reduce(
        (acc, q, i) => acc + (finalAnswers[i] === q.correct_answer ? 1 : 0),
        0
      );
      const isPerfect = score === questions.length;
      const xp =
        XP_REWARDS.QUIZ_COMPLETED + (isPerfect ? XP_REWARDS.QUIZ_PERFECT_SCORE : 0);

      setResult({
        score,
        total_questions: questions.length,
        xp_earned: xp,
        passed: score / questions.length >= 0.7,
      });
      setPhase("results");

      if (isPerfect) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRetake() {
    setPhase("start");
    setCurrentIndex(0);
    setSelectedOption(null);
    setAnswers([]);
    setResult(null);
    setShowConfetti(false);
  }

  function handleRetryWrongOnly() {
    const wrongQuestions = questions.filter(
      (q, i) => answers[i] !== q.correct_answer
    );
    if (wrongQuestions.length === 0) return;
    setQuestions(wrongQuestions);
    setPhase("question");
    setCurrentIndex(0);
    setSelectedOption(null);
    setAnswers([]);
    setResult(null);
    setShowConfetti(false);
  }

  // ---- Loading / Error ----

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Quiz Unavailable</CardTitle>
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

  // ---- Start Screen ----

  if (phase === "start") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10">
              <Trophy className="size-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">
              Level {level} Quiz
            </CardTitle>
            <CardDescription>
              {levelMeta?.name} -- {levelMeta?.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <span className="text-sm text-muted-foreground">Questions</span>
                <span className="font-semibold">{questions.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  Passing Score
                </span>
                <span className="font-semibold">70%</span>
              </div>
              {bestScore !== null && (
                <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    Previous Best
                  </span>
                  <div className="flex items-center gap-2">
                    <Star className="size-4 text-yellow-500" />
                    <span className="font-semibold">
                      {bestScore}/{questions.length}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={handleStartQuiz} className="w-full">
                Start Quiz
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/conversion/${conversionId}`)}
                className="w-full"
              >
                <ArrowLeft className="size-4" />
                Back to Textbook
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Question / Feedback Screen ----

  if ((phase === "question" || phase === "feedback") && currentQuestion) {
    return (
      <div className="min-h-screen bg-background">
        {/* Top bar */}
        <div className="border-b bg-card">
          <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-4">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                if (
                  window.confirm(
                    "Are you sure you want to leave? Your progress will be lost."
                  )
                ) {
                  router.push(`/conversion/${conversionId}`);
                }
              }}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div className="flex-1">
              <QuizProgressBar
                current={currentIndex + 1}
                total={questions.length}
              />
            </div>
            <Badge variant="secondary">
              Level {level}
            </Badge>
          </div>
        </div>

        {/* Question content */}
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="space-y-6">
            {/* Question text */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Question {currentIndex + 1}
              </p>
              <h2 className="text-xl font-semibold leading-relaxed text-foreground sm:text-2xl">
                {currentQuestion.question}
              </h2>
            </div>

            {/* Options */}
            <div className="space-y-3">
              {currentQuestion.options.map((option, idx) => {
                const isSelected = selectedOption === idx;
                const isCorrectOption = idx === currentQuestion.correct_answer;
                const inFeedback = phase === "feedback";

                let cardClass =
                  "cursor-pointer border-2 transition-all duration-200";

                if (inFeedback) {
                  if (isCorrectOption) {
                    cardClass +=
                      " border-green-500 bg-green-50 dark:bg-green-500/10";
                  } else if (isSelected && !isCorrectOption) {
                    cardClass +=
                      " border-red-500 bg-red-50 dark:bg-red-500/10";
                  } else {
                    cardClass +=
                      " border-transparent opacity-50 cursor-default";
                  }
                } else {
                  if (isSelected) {
                    cardClass += " border-primary bg-primary/5";
                  } else {
                    cardClass +=
                      " border-transparent hover:border-muted-foreground/20 hover:bg-muted/50";
                  }
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={inFeedback}
                    onClick={() => handleSelectOption(idx)}
                    className={cn(
                      "flex w-full items-start gap-4 rounded-xl p-4 text-left ring-1 ring-foreground/10",
                      cardClass
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                        inFeedback && isCorrectOption
                          ? "bg-green-500 text-white"
                          : inFeedback && isSelected && !isCorrectOption
                            ? "bg-red-500 text-white"
                            : isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                      )}
                    >
                      {inFeedback && isCorrectOption ? (
                        <CheckCircle className="size-5" />
                      ) : inFeedback && isSelected && !isCorrectOption ? (
                        <XCircle className="size-5" />
                      ) : (
                        String.fromCharCode(65 + idx)
                      )}
                    </span>
                    <span className="pt-1 text-sm font-medium leading-relaxed sm:text-base">
                      {option}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Feedback / explanation */}
            {phase === "feedback" && (
              <div className="space-y-4">
                <div
                  className={cn(
                    "rounded-lg border px-4 py-3",
                    isCorrect
                      ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-500/10"
                      : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-500/10"
                  )}
                >
                  <p
                    className={cn(
                      "mb-1 text-sm font-semibold",
                      isCorrect
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                    )}
                  >
                    {isCorrect ? "Correct!" : "Incorrect"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {currentQuestion.explanation}
                  </p>
                </div>

                <Button
                  size="lg"
                  onClick={handleNextQuestion}
                  className="w-full"
                >
                  {isLastQuestion ? (
                    <>
                      Submit Quiz
                      <Trophy className="size-4" />
                    </>
                  ) : (
                    <>
                      Next Question
                      <ChevronRight className="size-4" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Results Screen ----

  if (phase === "results" && result) {
    const pct = result.total_questions > 0
      ? Math.round((result.score / result.total_questions) * 100)
      : 0;
    const isPerfect = result.score === result.total_questions;

    // Build per-question breakdown using the accumulated answers
    const allAnswers = answers;

    return (
      <div className="min-h-screen bg-background">
        {showConfetti && <ConfettiCelebration />}

        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="space-y-8">
            {/* Score card */}
            <Card>
              <CardContent className="flex flex-col items-center pt-8 pb-6 text-center">
                <div
                  className={cn(
                    "mb-4 flex size-24 items-center justify-center rounded-full",
                    result.passed
                      ? "bg-green-100 dark:bg-green-500/20"
                      : "bg-orange-100 dark:bg-orange-500/20"
                  )}
                >
                  {isPerfect ? (
                    <Trophy className="size-12 text-yellow-500" />
                  ) : result.passed ? (
                    <CheckCircle className="size-12 text-green-500" />
                  ) : (
                    <RotateCcw className="size-12 text-orange-500" />
                  )}
                </div>

                <h1 className="mb-1 text-5xl font-bold tracking-tight text-foreground">
                  {result.score}/{result.total_questions}
                </h1>
                <p className="mb-3 text-lg text-muted-foreground">{pct}%</p>

                <Badge
                  variant={result.passed ? "default" : "secondary"}
                  className="mb-4 text-sm"
                >
                  {isPerfect
                    ? "Perfect Score!"
                    : result.passed
                      ? "Passed"
                      : "Not Passed"}
                </Badge>

                {result.xp_earned > 0 && (
                  <div className="flex items-center gap-2 rounded-full bg-yellow-100 px-4 py-2 dark:bg-yellow-500/20">
                    <Star className="size-5 text-yellow-500" />
                    <span className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
                      +{result.xp_earned} XP earned
                    </span>
                  </div>
                )}

                {/* Badge notification */}
                {result.new_badges && result.new_badges.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {result.new_badges.map((badge) => (
                      <div
                        key={badge.id}
                        className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2"
                      >
                        <Trophy className="size-4 text-primary" />
                        <span className="text-sm font-medium">
                          New Badge: {badge.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Encouragement message */}
            <Card>
              <CardContent className="py-5">
                <p className="text-center text-sm leading-relaxed text-muted-foreground">
                  {getEncouragementMessage(result.score, result.total_questions)}
                </p>
              </CardContent>
            </Card>

            {/* Per-question breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Question Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {questions.map((q, i) => {
                    const userAnswer = allAnswers[i];
                    const wasCorrect = userAnswer === q.correct_answer;
                    return (
                      <div
                        key={q.id}
                        className="flex items-center gap-3 rounded-lg border px-3 py-2"
                      >
                        {wasCorrect ? (
                          <CheckCircle className="size-5 shrink-0 text-green-500" />
                        ) : (
                          <XCircle className="size-5 shrink-0 text-red-500" />
                        )}
                        <span className="flex-1 truncate text-sm">
                          {q.question}
                        </span>
                        <Badge
                          variant={wasCorrect ? "default" : "destructive"}
                          className="shrink-0"
                        >
                          {wasCorrect ? "Correct" : "Wrong"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:flex-row">
              {result.score < result.total_questions && (
                <Button
                  size="lg"
                  onClick={handleRetryWrongOnly}
                  className="flex-1"
                >
                  <RotateCcw className="size-4" />
                  Retry Wrong Only ({result.total_questions - result.score})
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                onClick={handleRetake}
                className="flex-1"
              >
                <RotateCcw className="size-4" />
                Retake Full Quiz
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => router.push(`/conversion/${conversionId}`)}
                className="flex-1"
              >
                <ArrowLeft className="size-4" />
                Back to Textbook
              </Button>
            </div>
          </div>
        </div>

        {/* Submitting overlay */}
        {isSubmitting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">
                Submitting your answers...
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Submitting state (shown between last answer and results) ----

  if (isSubmitting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            Submitting your answers...
          </p>
        </div>
      </div>
    );
  }

  // ---- Fallback ----
  return null;
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function QuizPage() {
  return (
    <AuthGuard>
      <QuizContent />
    </AuthGuard>
  );
}
