"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Crown,
  Flame,
  Heart,
  Layers,
  Loader2,
  Mountain,
  Rocket,
  Save,
  Sprout,
  Star,
  TreePine,
  Trophy,
  Users,
  Leaf,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { BADGES } from "@/lib/constants";
import type { Badge as BadgeType, UserProfile } from "@/lib/types";
import { AuthGuard, useAuth } from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

const BADGE_ICONS: Record<string, React.ReactNode> = {
  Rocket: <Rocket className="size-4" />,
  Sprout: <Sprout className="size-4" />,
  Crown: <Crown className="size-4" />,
  Trophy: <Trophy className="size-4" />,
  Flame: <Flame className="size-4" />,
  Star: <Star className="size-4" />,
  Heart: <Heart className="size-4" />,
  Layers: <Layers className="size-4" />,
  BookOpen: <BookOpen className="size-4" />,
  Users: <Users className="size-4" />,
  Leaf: <Leaf className="size-4" />,
  TreePine: <TreePine className="size-4" />,
  Mountain: <Mountain className="size-4" />,
};

function ProfileContent() {
  const { user } = useAuth();
  const supabase = createClient();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [conversionsCount, setConversionsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const [{ data: profileData }, { count }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase
          .from("conversions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

      if (profileData) {
        const p = profileData as UserProfile;
        setProfile(p);
        setDisplayName(p.display_name || "");
      }

      setConversionsCount(count ?? 0);
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user.id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  async function handleSave() {
    if (isSaving) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() })
        .eq("id", user.id);

      if (error) {
        setSaveMessage({ type: "error", text: "Failed to save changes. Please try again." });
      } else {
        setSaveMessage({ type: "success", text: "Profile updated successfully." });
        setProfile((prev) =>
          prev ? { ...prev, display_name: displayName.trim() } : prev
        );
      }
    } catch {
      setSaveMessage({ type: "error", text: "An unexpected error occurred." });
    } finally {
      setIsSaving(false);
    }
  }

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function getBadgeIcon(iconName: string): React.ReactNode {
    return BADGE_ICONS[iconName] ?? <Star className="size-4" />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    );
  }

  const avatarName = displayName || profile?.display_name || user.email?.split("@")[0] || "User";
  const earnedBadges: BadgeType[] = profile?.badges ?? [];

  // Build a lookup of BADGES definitions by id
  const badgeDefinitions = new Map<string, (typeof BADGES)[number]>(
    BADGES.map((b) => [b.id, b])
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
        <p className="text-muted-foreground">
          Manage your personal information and view your progress.
        </p>
      </div>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Update your display name and view your account details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar size="lg" className="size-16">
              {profile?.avatar_url && (
                <AvatarImage src={profile.avatar_url} alt={avatarName} />
              )}
              <AvatarFallback className="text-lg">
                {getInitials(avatarName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{avatarName}</p>
              <p className="text-sm text-muted-foreground">
                Member since{" "}
                {profile?.created_at ? formatDate(profile.created_at) : "N/A"}
              </p>
            </div>
          </div>

          <Separator />

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              maxLength={50}
            />
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={user.email ?? ""}
              readOnly
              disabled
              className="cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed from this page.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Save Changes
                </>
              )}
            </Button>
            {saveMessage && (
              <p
                className={`text-sm ${
                  saveMessage.type === "success"
                    ? "text-green-600 dark:text-green-400"
                    : "text-destructive"
                }`}
              >
                {saveMessage.text}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
          <CardDescription>
            Your learning journey at a glance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="flex flex-col items-center gap-1 rounded-lg border p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-yellow-500/10">
                <Trophy className="size-5 text-yellow-500" />
              </div>
              <p className="text-2xl font-bold tabular-nums">
                {(profile?.total_xp ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Total XP</p>
            </div>

            <div className="flex flex-col items-center gap-1 rounded-lg border p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-orange-500/10">
                <Flame className="size-5 text-orange-500" />
              </div>
              <p className="text-2xl font-bold tabular-nums">
                {profile?.current_streak ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Current Streak</p>
            </div>

            <div className="flex flex-col items-center gap-1 rounded-lg border p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-red-500/10">
                <Flame className="size-5 text-red-500" />
              </div>
              <p className="text-2xl font-bold tabular-nums">
                {profile?.longest_streak ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Longest Streak</p>
            </div>

            <div className="flex flex-col items-center gap-1 rounded-lg border p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10">
                <BookOpen className="size-5 text-blue-500" />
              </div>
              <p className="text-2xl font-bold tabular-nums">
                {conversionsCount}
              </p>
              <p className="text-xs text-muted-foreground">Conversions</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Badges */}
      <Card>
        <CardHeader>
          <CardTitle>Badges Earned</CardTitle>
          <CardDescription>
            {earnedBadges.length === 0
              ? "Complete activities to earn badges and showcase your achievements."
              : `You have earned ${earnedBadges.length} badge${earnedBadges.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {earnedBadges.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Trophy className="mb-3 size-10 text-muted-foreground/50" />
              <h3 className="font-medium">No badges yet</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Start learning and contributing to earn your first badge. Create
                a conversion, complete quizzes, and maintain your streak.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {earnedBadges.map((badge) => {
                const definition = badgeDefinitions.get(badge.id);
                const icon = getBadgeIcon(badge.icon);
                return (
                  <div
                    key={badge.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium leading-tight">
                          {badge.name}
                        </p>
                        <Badge variant="secondary" className="text-[10px]">
                          Earned
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {definition?.description ?? badge.description}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Earned on {formatDate(badge.earned_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Show locked badges */}
          {earnedBadges.length > 0 && earnedBadges.length < BADGES.length && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="mb-3 text-sm font-medium text-muted-foreground">
                  Locked Badges ({BADGES.length - earnedBadges.length} remaining)
                </p>
                <div className="flex flex-wrap gap-2">
                  {BADGES.filter(
                    (b) => !earnedBadges.some((eb) => eb.id === b.id)
                  ).map((badge) => (
                    <div
                      key={badge.id}
                      className="flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-xs text-muted-foreground"
                    >
                      <span className="opacity-40">
                        {getBadgeIcon(badge.icon)}
                      </span>
                      {badge.name}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}
