"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ExternalLink,
  Loader2,
  Search,
  Share2,
  Trash2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AI_PROVIDERS, TEXTBOOK_LEVELS } from "@/lib/constants";
import type { AIProvider, Conversion, TextbookLevel } from "@/lib/types";
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

interface ConversionWithProgress extends Conversion {
  completedLevels: TextbookLevel[];
}

const PAGE_SIZE = 12;

function ConversionsContent() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [conversions, setConversions] = useState<ConversionWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  // Deleting state
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  // Share toggling state
  const [sharingIds, setSharingIds] = useState<Set<string>>(new Set());

  const fetchConversions = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get total count
      const { count } = await supabase
        .from("conversions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      setTotalCount(count ?? 0);

      // Fetch page
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: conversionsData } = await supabase
        .from("conversions")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .range(from, to);

      const conversionsList = (conversionsData ?? []) as Conversion[];

      // Fetch chapter completions
      let conversionsWithProgress: ConversionWithProgress[] = [];
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

        conversionsWithProgress = conversionsList.map((conv) => ({
          ...conv,
          completedLevels: Array.from(
            chaptersByConversion.get(conv.id) ?? []
          ),
        }));
      }

      setConversions(conversionsWithProgress);
    } catch (error) {
      console.error("Failed to fetch conversions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user.id, page]);

  useEffect(() => {
    fetchConversions();
  }, [fetchConversions]);

  const filteredConversions = useMemo(() => {
    let result = conversions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.source_url.toLowerCase().includes(q)
      );
    }
    if (filterProvider !== "all") {
      result = result.filter((c) => c.ai_provider === filterProvider);
    }
    if (filterType !== "all") {
      result = result.filter((c) => c.source_type === filterType);
    }
    return result;
  }, [conversions, searchQuery, filterProvider, filterType]);

  async function handleDelete(conversionId: string) {
    if (!window.confirm("Delete this conversion and all its content?")) return;
    setDeletingIds((prev) => new Set(prev).add(conversionId));
    try {
      const { error } = await supabase
        .from("conversions")
        .delete()
        .eq("id", conversionId)
        .eq("user_id", user.id);

      if (!error) {
        setConversions((prev) => prev.filter((c) => c.id !== conversionId));
        setTotalCount((prev) => prev - 1);
      }
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(conversionId);
        return next;
      });
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

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (isLoading && conversions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading conversions...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push("/dashboard")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              All Conversions
            </h1>
            <p className="text-sm text-muted-foreground">
              {totalCount} conversion{totalCount !== 1 ? "s" : ""} total
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title or URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={filterProvider}
          onValueChange={(val) => setFilterProvider(val ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {AI_PROVIDERS.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>
                {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterType}
          onValueChange={(val) => setFilterType(val ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="github">GitHub</SelectItem>
            <SelectItem value="website">Website</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {filteredConversions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            {totalCount === 0 ? (
              <>
                <div className="mb-4 rounded-full bg-primary/10 p-4">
                  <BookOpen className="size-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">No conversions yet</h3>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Go to the dashboard to create your first conversion.
                </p>
                <Button
                  className="mt-6"
                  onClick={() => router.push("/dashboard")}
                >
                  Go to Dashboard
                </Button>
              </>
            ) : (
              <>
                <Search className="mb-3 size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No conversions match your filters.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredConversions.map((conversion) => {
            const levelProgress = Math.round(
              (conversion.completedLevels.length / TEXTBOOK_LEVELS.length) * 100
            );
            return (
              <Card key={conversion.id}>
                <CardHeader>
                  <CardTitle className="line-clamp-1 text-base">
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
                    <span>{formatDate(conversion.created_at)}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {conversion.source_type}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {conversion.ai_provider.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Levels</span>
                      <span className="font-medium tabular-nums">
                        {conversion.completedLevels.length}/{TEXTBOOK_LEVELS.length}
                      </span>
                    </div>
                    <Progress value={levelProgress} />
                    <div className="flex flex-wrap gap-1">
                      {TEXTBOOK_LEVELS.map((level) => {
                        const isCompleted =
                          conversion.completedLevels.includes(level.level);
                        return (
                          <Badge
                            key={level.level}
                            variant={isCompleted ? "default" : "outline"}
                            className="text-[10px]"
                          >
                            {isCompleted && (
                              <Check className="mr-0.5 size-2.5" />
                            )}
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
                    Open
                  </Button>
                  <div className="flex items-center gap-1">
                    <Button
                      variant={conversion.is_public ? "secondary" : "ghost"}
                      size="icon-sm"
                      disabled={sharingIds.has(conversion.id)}
                      onClick={() => handleShareToggle(conversion.id)}
                    >
                      {sharingIds.has(conversion.id) ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Share2 className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={deletingIds.has(conversion.id)}
                      onClick={() => handleDelete(conversion.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      {deletingIds.has(conversion.id) ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ConversionsPage() {
  return (
    <AuthGuard>
      <ConversionsContent />
    </AuthGuard>
  );
}
