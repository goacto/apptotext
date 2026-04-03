"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  Calendar,
  Check,
  Download,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AuthGuard, useAuth } from "@/components/auth/auth-guard";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { TEXTBOOK_LEVELS, AI_PROVIDERS } from "@/lib/constants";
import { exportToMarkdown, downloadMarkdown, exportToPDF } from "@/lib/export";
import type {
  Conversion,
  TextbookChapter,
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function ConversionViewerContent() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const conversionId = params.id as string;

  const [conversion, setConversion] = useState<Conversion | null>(null);
  const [chapters, setChapters] = useState<TextbookChapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<TextbookLevel>(101);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isExportingMarkdown, setIsExportingMarkdown] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const fetchConversion = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("conversions")
        .select("*")
        .eq("id", conversionId)
        .eq("user_id", user.id)
        .single();

      if (fetchError) throw fetchError;
      setConversion(data as Conversion);
    } catch {
      setError("Conversion not found or you do not have access.");
    }
  }, [supabase, conversionId, user.id]);

  const fetchChapters = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("chapters")
        .select("*")
        .eq("conversion_id", conversionId)
        .order("level", { ascending: true })
        .order("chapter_number", { ascending: true });

      if (fetchError) throw fetchError;
      setChapters((data as TextbookChapter[]) || []);
    } catch {
      // Chapters table might not exist yet or have no data
      setChapters([]);
    }
  }, [supabase, conversionId]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await Promise.all([fetchConversion(), fetchChapters()]);
      setIsLoading(false);
    }
    load();
  }, [fetchConversion, fetchChapters]);

  const chaptersForLevel = useMemo(
    () => chapters.filter((ch) => ch.level === activeLevel),
    [chapters, activeLevel]
  );

  const levelsWithContent = useMemo(() => {
    const levels = new Set<TextbookLevel>();
    chapters.forEach((ch) => levels.add(ch.level));
    return levels;
  }, [chapters]);

  const hasContentForActiveLevel = levelsWithContent.has(activeLevel);

  const aiProviderName = useMemo(() => {
    if (!conversion) return "";
    const provider = AI_PROVIDERS.find(
      (p) => p.id === conversion.ai_provider
    );
    return provider?.name || conversion.ai_provider;
  }, [conversion]);

  const formattedDate = useMemo(() => {
    if (!conversion) return "";
    return new Date(conversion.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [conversion]);

  function handleExportMarkdown() {
    if (!conversion || chapters.length === 0) return;
    setIsExportingMarkdown(true);
    try {
      const content = exportToMarkdown(conversion, chapters);
      const slug = conversion.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      downloadMarkdown(`apptotext-${slug}.md`, content);
    } finally {
      setIsExportingMarkdown(false);
    }
  }

  function handleExportPDF() {
    if (!conversion || chapters.length === 0) return;
    setIsExportingPDF(true);
    try {
      exportToPDF(conversion, chapters);
    } finally {
      // Give a small delay so the button shows the loading state
      // before the print dialog takes focus
      setTimeout(() => setIsExportingPDF(false), 500);
    }
  }

  async function handleGenerate() {
    if (!conversion) return;

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversion_id: conversion.id,
          level: activeLevel,
          source_content: conversion.source_content,
          title: conversion.title,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || `Generation failed (${response.status})`
        );
      }

      // Refresh chapters after generation
      await fetchChapters();
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate content."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading conversion...
          </p>
        </div>
      </div>
    );
  }

  if (error || !conversion) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>
              {error || "Something went wrong."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="size-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeLevelMeta = TEXTBOOK_LEVELS.find(
    (l) => l.level === activeLevel
  );
  const totalLevelsGenerated = levelsWithContent.size;
  const progressPercent = Math.round((totalLevelsGenerated / 5) * 100);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => router.push("/dashboard")}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl line-clamp-2">
                  {conversion.title}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <a
                  href={conversion.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" />
                  {conversion.source_url}
                </a>
                <Separator orientation="vertical" className="h-4" />
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-3.5" />
                  {aiProviderName}
                </span>
                <Separator orientation="vertical" className="h-4" />
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {formattedDate}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Content area */}
          <div className="flex-1 min-w-0">
            <Tabs
              value={String(activeLevel)}
              onValueChange={(value) =>
                setActiveLevel(Number(value) as TextbookLevel)
              }
            >
              <TabsList className="w-full justify-start overflow-x-auto">
                {TEXTBOOK_LEVELS.map((level) => {
                  const hasContent = levelsWithContent.has(level.level);
                  return (
                    <TabsTrigger
                      key={level.level}
                      value={String(level.level)}
                      className="gap-2"
                    >
                      <span>{level.level}</span>
                      <span className="hidden sm:inline">{level.name}</span>
                      {hasContent && (
                        <Check className="size-3.5 text-green-500" />
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {TEXTBOOK_LEVELS.map((level) => (
                <TabsContent key={level.level} value={String(level.level)}>
                  {/* Level description */}
                  <div className="mb-6 mt-4">
                    <p className="text-sm text-muted-foreground">
                      {level.description}
                    </p>
                  </div>

                  {/* Content or generate prompt */}
                  {levelsWithContent.has(level.level) ? (
                    <div className="space-y-8">
                      {chapters
                        .filter((ch) => ch.level === level.level)
                        .map((chapter) => (
                          <Card key={chapter.id}>
                            <CardHeader>
                              <CardTitle className="text-lg">
                                {chapter.title}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <MarkdownRenderer content={chapter.content} />

                              {chapter.key_concepts &&
                                chapter.key_concepts.length > 0 && (
                                  <>
                                    <Separator />
                                    <div>
                                      <h4 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                        Key Concepts
                                      </h4>
                                      <div className="flex flex-wrap gap-2">
                                        {chapter.key_concepts.map(
                                          (concept, idx) => (
                                            <Badge
                                              key={idx}
                                              variant="secondary"
                                            >
                                              {concept}
                                            </Badge>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  </>
                                )}
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="mb-4 rounded-full bg-muted p-4">
                          <BookOpen className="size-8 text-muted-foreground" />
                        </div>
                        <h3 className="mb-2 text-lg font-semibold text-foreground">
                          {level.level}-Level Content Not Yet Generated
                        </h3>
                        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                          Generate {level.name.toLowerCase()}-level textbook
                          content for this conversion using{" "}
                          {aiProviderName}.
                        </p>
                        {generateError &&
                          activeLevel === level.level && (
                            <p className="mb-4 text-sm text-destructive">
                              {generateError}
                            </p>
                          )}
                        <Button
                          onClick={handleGenerate}
                          disabled={
                            isGenerating && activeLevel === level.level
                          }
                          size="lg"
                        >
                          {isGenerating && activeLevel === level.level ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Zap className="size-4" />
                              Generate {level.level} Content
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>

          {/* Sidebar */}
          <aside className="w-full shrink-0 lg:w-72">
            <div className="sticky top-6 space-y-4">
              {/* Progress card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Overall Progress</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Levels Generated
                    </span>
                    <span className="font-medium">
                      {totalLevelsGenerated} / 5
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    {TEXTBOOK_LEVELS.map((level) => {
                      const hasContent = levelsWithContent.has(level.level);
                      return (
                        <div
                          key={level.level}
                          className="flex items-center justify-between text-xs"
                        >
                          <span
                            className={
                              hasContent
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }
                          >
                            {level.level} {level.name}
                          </span>
                          {hasContent ? (
                            <Check className="size-3.5 text-green-500" />
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Export card */}
              {levelsWithContent.size > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Export Textbook</CardTitle>
                    <CardDescription>
                      Download your generated content
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      disabled={isExportingMarkdown}
                      onClick={handleExportMarkdown}
                    >
                      {isExportingMarkdown ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      Export as Markdown
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      disabled={isExportingPDF}
                      onClick={handleExportPDF}
                    >
                      {isExportingPDF ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <FileText className="size-4" />
                      )}
                      Export as PDF
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Actions card */}
              {hasContentForActiveLevel && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {activeLevelMeta?.level} {activeLevelMeta?.name} Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Link
                      href={`/conversion/${conversionId}/flashcards?level=${activeLevel}`}
                    >
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                      >
                        <Layers className="size-4" />
                        Study Flashcards
                      </Button>
                    </Link>
                    <Link
                      href={`/conversion/${conversionId}/quiz?level=${activeLevel}`}
                    >
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                      >
                        <BrainCircuit className="size-4" />
                        Take Quiz
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )}

              {/* Current level info */}
              {activeLevelMeta && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Current Level</CardTitle>
                    <CardDescription>
                      {activeLevelMeta.level} - {activeLevelMeta.name}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {activeLevelMeta.description}
                    </p>
                    {hasContentForActiveLevel && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {chaptersForLevel.length}{" "}
                        {chaptersForLevel.length === 1
                          ? "chapter"
                          : "chapters"}{" "}
                        available
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function ConversionPage() {
  return (
    <AuthGuard>
      <ConversionViewerContent />
    </AuthGuard>
  );
}
