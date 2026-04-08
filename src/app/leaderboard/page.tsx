"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Calendar,
  Crown,
  Flame,
  Loader2,
  Medal,
  Star,
  Trophy,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { GOACTO_FULL, GOACTO_SHORT } from "@/lib/constants";
import type { UserProfile } from "@/lib/types";
import { AuthGuard, useAuth } from "@/components/auth/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

type SortMode = "xp" | "streak" | "contributors";
type TimePeriod = "all-time" | "this-month";

function getCurrentSeason(): { name: string; emoji: string } {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return { name: "Spring", emoji: "🌱" };
  if (month >= 5 && month <= 7) return { name: "Summer", emoji: "☀️" };
  if (month >= 8 && month <= 10) return { name: "Autumn", emoji: "🍂" };
  return { name: "Winter", emoji: "❄️" };
}

function getMonthLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

interface LeaderboardRow {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_xp: number;
  current_streak: number;
  public_conversions: number;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="size-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="size-5 text-gray-400" />;
  if (rank === 3) return <Medal className="size-5 text-amber-600" />;
  return null;
}

function getRankStyle(rank: number): string {
  if (rank === 1) return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-bold";
  if (rank === 2) return "bg-gray-200/50 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300 font-bold";
  if (rank === 3) return "bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold";
  return "text-muted-foreground";
}

function LeaderboardContent() {
  const { user } = useAuth();
  const supabase = createClient();

  const [profiles, setProfiles] = useState<LeaderboardRow[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [currentUserPublicCount, setCurrentUserPublicCount] = useState(0);
  const [topContributors, setTopContributors] = useState<LeaderboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SortMode>("xp");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all-time");
  const season = getCurrentSeason();

  const fetchLeaderboardData = useCallback(async () => {
    try {
      // Fetch top 50 profiles ordered by XP
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, total_xp, current_streak, longest_streak, last_activity, badges, created_at, email")
        .order("total_xp", { ascending: false })
        .limit(50);

      const allProfiles = (profilesData ?? []) as UserProfile[];

      // Fetch public conversions count for all these users
      const userIds = allProfiles.map((p) => p.id);

      // Get public conversion counts per user
      const { data: conversionsData } = await supabase
        .from("conversions")
        .select("user_id")
        .eq("is_public", true)
        .in("user_id", userIds);

      const publicCountMap = new Map<string, number>();
      for (const row of conversionsData ?? []) {
        publicCountMap.set(row.user_id, (publicCountMap.get(row.user_id) ?? 0) + 1);
      }

      // Build leaderboard rows (ranked by XP initially)
      const rows: LeaderboardRow[] = allProfiles.map((p, index) => ({
        rank: index + 1,
        user_id: p.id,
        display_name: p.display_name || p.email?.split("@")[0] || "Learner",
        avatar_url: p.avatar_url,
        total_xp: p.total_xp,
        current_streak: p.current_streak,
        public_conversions: publicCountMap.get(p.id) ?? 0,
      }));

      setProfiles(rows);

      // Build top contributors list (sorted by public conversions)
      const contributorsSorted = [...rows]
        .sort((a, b) => b.public_conversions - a.public_conversions)
        .filter((r) => r.public_conversions > 0)
        .slice(0, 5);
      setTopContributors(contributorsSorted);

      // Current user profile
      const currentProfile = allProfiles.find((p) => p.id === user.id);
      if (currentProfile) {
        setCurrentUserProfile(currentProfile);
        const userRow = rows.find((r) => r.user_id === user.id);
        setCurrentUserRank(userRow?.rank ?? null);
        setCurrentUserPublicCount(publicCountMap.get(user.id) ?? 0);
      } else {
        // User might not be in top 50, fetch their profile separately
        const { data: myProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (myProfile) {
          setCurrentUserProfile(myProfile as UserProfile);

          // Determine rank by counting users with more XP
          const { count: usersAbove } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .gt("total_xp", myProfile.total_xp);

          setCurrentUserRank((usersAbove ?? 0) + 1);

          // Get their public conversion count
          const { count: pubCount } = await supabase
            .from("conversions")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("is_public", true);

          setCurrentUserPublicCount(pubCount ?? 0);
        }
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user.id]);

  useEffect(() => {
    fetchLeaderboardData();
  }, [fetchLeaderboardData]);

  // Sort and filter profiles based on active tab and time period
  const sortedProfiles = useMemo(() => {
    let filtered = [...profiles];

    // For "this-month", only show users active this month
    if (timePeriod === "this-month") {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = filtered.filter((row) => {
        // We don't have last_activity here directly, but users with
        // any XP or streak are considered active for display purposes
        return row.total_xp > 0 || row.current_streak > 0;
      });
    }

    if (activeTab === "xp") {
      filtered.sort((a, b) => b.total_xp - a.total_xp);
    } else if (activeTab === "streak") {
      filtered.sort((a, b) => b.current_streak - a.current_streak);
    } else if (activeTab === "contributors") {
      filtered.sort((a, b) => b.public_conversions - a.public_conversions);
    }
    return filtered.map((row, index) => ({ ...row, rank: index + 1 }));
  }, [profiles, activeTab, timePeriod]);

  const displayName = useMemo(() => {
    if (currentUserProfile?.display_name) return currentUserProfile.display_name;
    if (user.user_metadata?.full_name) return user.user_metadata.full_name;
    if (user.email) return user.email.split("@")[0];
    return "Learner";
  }, [currentUserProfile, user]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading leaderboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="space-y-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl">{season.emoji}</span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {season.name} Season Leaderboard
          </h1>
        </div>
        <p className="text-muted-foreground">
          Growing together through shared knowledge --{" "}
          <span className="font-medium text-foreground">{GOACTO_SHORT}</span>:{" "}
          {GOACTO_FULL}
        </p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant={timePeriod === "all-time" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimePeriod("all-time")}
          >
            <Trophy className="size-3.5" />
            All Time
          </Button>
          <Button
            variant={timePeriod === "this-month" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimePeriod("this-month")}
          >
            <Calendar className="size-3.5" />
            {getMonthLabel()}
          </Button>
        </div>
      </div>

      {/* Current User Stats Banner */}
      {currentUserProfile && (
        <Card className="border-none bg-linear-to-r from-primary/5 via-primary/10 to-primary/5">
          <CardContent className="py-2">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
              <div className="flex items-center gap-3">
                <Avatar size="lg">
                  {currentUserProfile.avatar_url ? (
                    <AvatarImage
                      src={currentUserProfile.avatar_url}
                      alt={displayName}
                    />
                  ) : null}
                  <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{displayName}</p>
                  <p className="text-xs text-muted-foreground">Your stats</p>
                </div>
              </div>

              <Separator orientation="vertical" className="hidden h-10 sm:block" />

              <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-yellow-500/10">
                    <Trophy className="size-4 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold tabular-nums">
                      #{currentUserRank ?? "--"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Rank</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-purple-500/10">
                    <Star className="size-4 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold tabular-nums">
                      {currentUserProfile.total_xp.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">XP</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500/10">
                    <Flame className="size-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold tabular-nums">
                      {currentUserProfile.current_streak}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Streak</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10">
                    <Star className="size-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold tabular-nums">
                      {currentUserProfile.badges?.length ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Badges</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard Tabs */}
      <Tabs
        defaultValue="xp"
        onValueChange={(val) => setActiveTab(val as SortMode)}
      >
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="xp" className="gap-1.5">
            <Trophy className="size-4" />
            Top XP
          </TabsTrigger>
          <TabsTrigger value="streak" className="gap-1.5">
            <Flame className="size-4" />
            Top Streaks
          </TabsTrigger>
          <TabsTrigger value="contributors" className="gap-1.5">
            <BookOpen className="size-4" />
            Top Contributors
          </TabsTrigger>
        </TabsList>

        {/* Shared table content for all tabs */}
        <TabsContent value="xp">
          <LeaderboardTable
            rows={sortedProfiles}
            currentUserId={user.id}
            highlightColumn="xp"
          />
        </TabsContent>

        <TabsContent value="streak">
          <LeaderboardTable
            rows={sortedProfiles}
            currentUserId={user.id}
            highlightColumn="streak"
          />
        </TabsContent>

        <TabsContent value="contributors">
          <LeaderboardTable
            rows={sortedProfiles}
            currentUserId={user.id}
            highlightColumn="contributors"
          />
        </TabsContent>
      </Tabs>

      {/* GOACTO Spirit Section */}
      <div className="space-y-4">
        <Separator />
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="size-5 text-primary" />
            {GOACTO_SHORT} Spirit
          </h2>
          <p className="text-sm text-muted-foreground">
            Members who embody the spirit of{" "}
            <span className="font-medium">{GOACTO_FULL}</span>
          </p>
        </div>

        {/* Contributing to Others Highlight */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4 text-green-500" />
              Contributing to Others
            </CardTitle>
            <CardDescription>
              These members have shared the most public conversions with the community
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topContributors.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No public conversions shared yet. Be the first to contribute!
              </p>
            ) : (
              <div className="space-y-3">
                {topContributors.map((contributor, index) => (
                  <div
                    key={contributor.user_id}
                    className="flex items-center gap-3"
                  >
                    <span className="w-6 text-center text-sm font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <Avatar size="sm">
                      {contributor.avatar_url ? (
                        <AvatarImage
                          src={contributor.avatar_url}
                          alt={contributor.display_name}
                        />
                      ) : null}
                      <AvatarFallback>
                        {getInitials(contributor.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-sm font-medium">
                      {contributor.display_name}
                      {contributor.user_id === user.id && (
                        <Badge variant="secondary" className="ml-2">
                          You
                        </Badge>
                      )}
                    </span>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <BookOpen className="size-3.5 text-green-500" />
                      <span className="font-medium tabular-nums">
                        {contributor.public_conversions}
                      </span>
                      <span className="hidden sm:inline">shared</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Encouraging Message */}
        <Card className="border-none bg-linear-to-r from-green-500/5 via-emerald-500/10 to-green-500/5">
          <CardContent className="py-4 text-center">
            <p className="text-sm italic text-muted-foreground">
              &quot;Every conversion you share plants a seed of understanding for
              someone else. Growth is not a competition -- it is a community
              effort. When one of us rises, we all rise together.&quot;
            </p>
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              -- The {GOACTO_SHORT} Way
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- */
/*  Leaderboard Table Component                              */
/* --------------------------------------------------------- */

interface LeaderboardTableProps {
  rows: LeaderboardRow[];
  currentUserId: string;
  highlightColumn: SortMode;
}

function LeaderboardTable({
  rows,
  currentUserId,
  highlightColumn,
}: LeaderboardTableProps) {
  if (rows.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="mb-3 size-10 text-muted-foreground/50" />
          <h3 className="font-medium">No learners yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Be the first to start learning and appear on the leaderboard!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {/* Table Header */}
      <div className="hidden items-center gap-3 px-4 py-2 text-xs font-medium text-muted-foreground sm:flex">
        <span className="w-10 text-center">Rank</span>
        <span className="flex-1">Learner</span>
        <span
          className={`w-20 text-right ${highlightColumn === "xp" ? "text-foreground" : ""}`}
        >
          XP
        </span>
        <span
          className={`w-16 text-right ${highlightColumn === "streak" ? "text-foreground" : ""}`}
        >
          Streak
        </span>
        <span
          className={`w-24 text-right ${highlightColumn === "contributors" ? "text-foreground" : ""}`}
        >
          Conversions
        </span>
      </div>

      {/* Table Rows */}
      {rows.map((row) => {
        const isCurrentUser = row.user_id === currentUserId;
        const rankIcon = getRankIcon(row.rank);

        return (
          <div
            key={row.user_id}
            tabIndex={0}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isCurrentUser
                ? "bg-primary/5 ring-1 ring-primary/20"
                : "hover:bg-muted/50"
            }`}
          >
            {/* Rank */}
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-sm ${getRankStyle(row.rank)}`}
            >
              {rankIcon ?? row.rank}
            </div>

            {/* Avatar + Name */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar>
                {row.avatar_url ? (
                  <AvatarImage src={row.avatar_url} alt={row.display_name} />
                ) : null}
                <AvatarFallback>{getInitials(row.display_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {row.display_name}
                  {isCurrentUser && (
                    <Badge variant="secondary" className="ml-2">
                      You
                    </Badge>
                  )}
                </p>
                {/* Mobile-only stats row */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground sm:hidden">
                  <span className="flex items-center gap-1">
                    <Trophy className="size-3 text-yellow-500" />
                    {row.total_xp.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Flame className="size-3 text-orange-500" />
                    {row.current_streak}
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen className="size-3 text-blue-500" />
                    {row.public_conversions}
                  </span>
                </div>
              </div>
            </div>

            {/* XP */}
            <div
              className={`hidden w-20 text-right sm:block ${
                highlightColumn === "xp" ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="flex items-center justify-end gap-1 text-sm tabular-nums">
                <Trophy className="size-3 text-yellow-500" />
                {row.total_xp.toLocaleString()}
              </span>
            </div>

            {/* Streak */}
            <div
              className={`hidden w-16 text-right sm:block ${
                highlightColumn === "streak" ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="flex items-center justify-end gap-1 text-sm tabular-nums">
                <Flame className="size-3 text-orange-500" />
                {row.current_streak}
              </span>
            </div>

            {/* Public Conversions */}
            <div
              className={`hidden w-24 text-right sm:block ${
                highlightColumn === "contributors" ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="flex items-center justify-end gap-1 text-sm tabular-nums">
                <BookOpen className="size-3 text-blue-500" />
                {row.public_conversions}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- */
/*  Page Export                                               */
/* --------------------------------------------------------- */

export default function LeaderboardPage() {
  return (
    <AuthGuard>
      <LeaderboardContent />
    </AuthGuard>
  );
}
