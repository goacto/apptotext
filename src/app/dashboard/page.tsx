"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ExternalLink,
  Flame,
  Layers,
  Loader2,
  Rocket,
  Share2,
  Trophy,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AI_PROVIDERS, GOACTO_FULL, TEXTBOOK_LEVELS } from "@/lib/constants";
import type { AIProvider, Conversion, UserProfile, TextbookLevel } from "@/lib/types";
import { AuthGuard, useAuth } from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GROWTH_QUOTES = [
  `"${GOACTO_FULL}" -- Every line of code you learn empowers someone else.`,
  "Growth is not just about what you gain, but what you give back to your community.",
  "The best way to learn is to teach. Share your conversions and grow together.",
  "Your streak is a testament to your dedication. Keep growing, keep contributing.",
  "Every conversion you create is a bridge between complexity and understanding.",
  "Knowledge shared is knowledge multiplied. That is the GOACTO way.",
  "Today's learner is tomorrow's mentor. Keep building your path.",
  "Small consistent steps lead to extraordinary growth. You are proof of that.",
];

interface DashboardStats {
  totalXp: number;
  currentStreak: number;
  conversionsCount: number;
  flashcardsReviewed: number;
}

interface ConversionWithProgress extends Conversion {
  completedLevels: TextbookLevel[];
}

function DashboardContent() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [conversions, setConversions] = useState<ConversionWithProgress[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalXp: 0,
    currentStreak: 0,
    conversionsCount: 0,
    flashcardsReviewed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Quick convert state
  const [convertUrl, setConvertUrl] = useState("");
  const [aiProvider, setAiProvider] = useState<AIProvider>("claude");
  const [isConverting, setIsConverting] = useState(false);

  // Share toggling state
  const [sharingIds, setSharingIds] = useState<Set<string>>(new Set());

  // Growth quote rotation
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % GROWTH_QUOTES.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData as UserProfile);
      }

      // Fetch conversions
      const { data: conversionsData } = await supabase
        .from("conversions")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(10);

      // Fetch chapter completions per conversion to determine level progress
      const conversionsList = (conversionsData ?? []) as Conversion[];
      const conversionsWithProgress: ConversionWithProgress[] = [];

      if (conversionsList.length > 0) {
        const conversionIds = conversionsList.map((c) => c.id);
        const { data: chaptersData } = await supabase
          .from("chapters")
          .select("conversion_id, level")
          .in("conversion_id", conversionIds);

        const chaptersByConversion = new Map<string, Set<TextbookLevel>>();
        for (const chapter of chaptersData ?? []) {
          const existing = chaptersByConversion.get(chapter.conversion_id);
          if (existing) {
            existing.add(chapter.level as TextbookLevel);
          } else {
            chaptersByConversion.set(
              chapter.conversion_id,
              new Set([chapter.level as TextbookLevel])
            );
          }
        }

        for (const conv of conversionsList) {
          conversionsWithProgress.push({
            ...conv,
            completedLevels: Array.from(
              chaptersByConversion.get(conv.id) ?? []
            ),
          });
        }
      }

      setConversions(conversionsWithProgress);

      // Fetch stats: quiz sessions count and flashcard progress count
      const { count: quizCount } = await supabase
        .from("quiz_sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      const { count: flashcardCount } = await supabase
        .from("flashcard_progress")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      setStats({
        totalXp: profileData?.total_xp ?? 0,
        currentStreak: profileData?.current_streak ?? 0,
        conversionsCount: conversionsList.length,
        flashcardsReviewed: flashcardCount ?? 0,
      });
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user.id]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  async function handleQuickConvert(e: React.FormEvent) {
    e.preventDefault();
    if (!convertUrl.trim() || isConverting) return;

    setIsConverting(true);
    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: convertUrl.trim(), ai_provider: aiProvider }),
      });

      if (!response.ok) {
        throw new Error("Conversion failed");
      }

      const data = await response.json();
      router.push(`/conversion/${data.id}`);
    } catch (error) {
      console.error("Quick convert failed:", error);
      setIsConverting(false);
    }
  }

  async function handleShareToggle(conversionId: string) {
    if (sharingIds.has(conversionId)) return;

    setSharingIds((prev) => new Set(prev).add(conversionId));
    try {
      const conversion = conversions.find((c) => c.id === conversionId);
      if (!conversion) return;

      const newIsPublic = !conversion.is_public;

      const { error: updateError } = await supabase
        .from("conversions")
        .update({ is_public: newIsPublic })
        .eq("id", conversionId)
        .eq("user_id", user.id);

      if (!updateError) {
        setConversions((prev) =>
          prev.map((c) =>
            c.id === conversionId ? { ...c, is_public: newIsPublic } : c
          )
        );
      }
    } catch (error) {
      console.error("Share toggle failed:", error);
    } finally {
      setSharingIds((prev) => {
        const next = new Set(prev);
        next.delete(conversionId);
        return next;
      });
    }
  }

  const displayName = useMemo(() => {
    if (profile?.display_name) return profile.display_name;
    if (user.user_metadata?.full_name) return user.user_metadata.full_name;
    if (user.email) return user.email.split("@")[0];
    return "Learner";
  }, [profile, user]);

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getLevelProgress(completedLevels: TextbookLevel[]): number {
    if (TEXTBOOK_LEVELS.length === 0) return 0;
    return Math.round((completedLevels.length / TEXTBOOK_LEVELS.length) * 100);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Welcome Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome back, {displayName}
          </h1>
          <p className="text-muted-foreground">
            Keep growing and contributing -- your journey matters.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Flame className="size-4 text-orange-500" />
            <span className="font-medium tabular-nums">
              {stats.currentStreak}
            </span>{" "}
            day streak
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Trophy className="size-4 text-yellow-500" />
            <span className="font-medium tabular-nums">{stats.totalXp}</span> XP
          </div>
        </div>
      </div>

      {/* Quick Convert Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="size-4" />
            Quick Convert
          </CardTitle>
          <CardDescription>
            Paste a GitHub repo or website URL to transform it into a learning
            textbook.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleQuickConvert} className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="convert-url"
              type="url"
              placeholder="https://github.com/user/repo or any website URL"
              value={convertUrl}
              onChange={(e) => setConvertUrl(e.target.value)}
              required
              className="flex-1"
            />
            <Select value={aiProvider} onValueChange={(val) => setAiProvider(val as AIProvider)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={isConverting || !convertUrl.trim()} size="lg">
              {isConverting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Converting...
                </>
              ) : (
                "Convert"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-1">
            <div className="flex size-10 items-center justify-center rounded-lg bg-yellow-500/10">
              <Trophy className="size-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{stats.totalXp.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total XP</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 pt-1">
            <div className="flex size-10 items-center justify-center rounded-lg bg-orange-500/10">
              <Flame className="size-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{stats.currentStreak}</p>
              <p className="text-xs text-muted-foreground">Current Streak</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 pt-1">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10">
              <BookOpen className="size-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{stats.conversionsCount}</p>
              <p className="text-xs text-muted-foreground">Conversions</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 pt-1">
            <div className="flex size-10 items-center justify-center rounded-lg bg-purple-500/10">
              <Layers className="size-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{stats.flashcardsReviewed.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Flashcards Reviewed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Conversions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Conversions</h2>
          {conversions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/conversions")}
            >
              View all
            </Button>
          )}
        </div>

        {conversions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-full bg-primary/10 p-4">
                <BookOpen className="size-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No conversions yet</h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Paste a GitHub repo or website URL above to transform it into a
                complete learning textbook.
              </p>
              <Button
                className="mt-6"
                onClick={() => document.getElementById("convert-url")?.focus()}
              >
                <Rocket className="size-4" />
                Start Your First Conversion
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {conversions.map((conversion) => {
              const levelProgress = getLevelProgress(conversion.completedLevels);
              return (
                <Card key={conversion.id}>
                  <CardHeader>
                    <CardTitle className="line-clamp-1">
                      {conversion.title}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <a
                        href={conversion.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 truncate hover:underline"
                      >
                        {conversion.source_url}
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Created {formatDate(conversion.created_at)}</span>
                      <Badge variant="secondary">
                        {conversion.ai_provider.toUpperCase()}
                      </Badge>
                    </div>

                    {/* Level Progress Indicators */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Level Progress
                        </span>
                        <span className="font-medium tabular-nums">
                          {conversion.completedLevels.length}/{TEXTBOOK_LEVELS.length}
                        </span>
                      </div>
                      <Progress value={levelProgress} />
                      <div className="flex flex-wrap gap-1">
                        {TEXTBOOK_LEVELS.map((level) => {
                          const isCompleted = conversion.completedLevels.includes(level.level);
                          return (
                            <Badge
                              key={level.level}
                              variant={isCompleted ? "default" : "outline"}
                              className="text-[10px]"
                            >
                              {level.level}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="justify-between gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        router.push(`/conversion/${conversion.id}`)
                      }
                    >
                      Continue Learning
                    </Button>
                    <Button
                      variant={conversion.is_public ? "secondary" : "ghost"}
                      size="sm"
                      disabled={sharingIds.has(conversion.id)}
                      onClick={() => handleShareToggle(conversion.id)}
                      className="gap-1.5 text-muted-foreground"
                    >
                      {sharingIds.has(conversion.id) ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Share2 className="size-3.5" />
                      )}
                      {conversion.is_public ? "Shared" : "Share"}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Growth Motivation Banner */}
      <Card className="border-none bg-linear-to-r from-primary/5 via-primary/10 to-primary/5">
        <CardContent className="flex items-center gap-3 py-4 text-center sm:text-left">
          <div className="hidden shrink-0 sm:block">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
              <span className="text-lg">🌱</span>
            </div>
          </div>
          <p
            key={quoteIndex}
            className="flex-1 text-sm italic text-muted-foreground animate-in fade-in duration-500"
          >
            {GROWTH_QUOTES[quoteIndex]}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
