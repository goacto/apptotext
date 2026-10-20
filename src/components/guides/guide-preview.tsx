"use client";

import { useState } from "react";
import { Lock, Loader2, BookOpen, Layers, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { formatPrice } from "@/lib/plans";
import type { GuidePreview as Preview } from "@/lib/cache/preview";

/**
 * US-3 / FR-3.1-3.2: chapter 1 in full, the rest locked with titles, and an upgrade card
 * using the existing checkout. `returnTo` brings the user back to this guide after checkout.
 */
export function GuidePreview({
  preview,
  returnTo,
  signedIn,
}: {
  preview: Preview;
  returnTo: string;
  signedIn: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function focusUpgrade() {
    document.getElementById("upgrade-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    (document.querySelector("#upgrade-card button") as HTMLButtonElement | null)?.focus();
  }

  async function choose(plan: string) {
    setError(null);
    if (!signedIn) {
      window.location.href = `/auth/login?next=${encodeURIComponent(returnTo)}`;
      return;
    }
    setBusy(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, return_to: returnTo, source: "guide_preview" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || "Could not start checkout.");
      window.location.href = data.url as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Preview · Built from commit <code>{preview.version.short_sha}</code>
      </p>
      {preview.chapter1 && (
        <Card>
          <CardContent className="pt-6">
            <MarkdownRenderer content={preview.chapter1.content} />
          </CardContent>
        </Card>
      )}

      <div className="space-y-2" aria-label="Locked content">
        {preview.locked_chapters.map((c) => (
          <Button key={c.chapter_number} variant="outline" className="w-full justify-start" onClick={focusUpgrade}>
            <Lock className="size-4" aria-hidden />
            <BookOpen className="size-4" aria-hidden />
            <span className="truncate">Locked: {c.title}</span>
          </Button>
        ))}
        <Button variant="outline" className="w-full justify-start" onClick={focusUpgrade}>
          <Lock className="size-4" aria-hidden />
          <Layers className="size-4" aria-hidden />
          Locked: {preview.flashcard_count} flashcards
        </Button>
        <Button variant="outline" className="w-full justify-start" onClick={focusUpgrade}>
          <Lock className="size-4" aria-hidden />
          <HelpCircle className="size-4" aria-hidden />
          Locked: {preview.quiz_count}-question quiz
        </Button>
      </div>

      <Card id="upgrade-card">
        <CardHeader>
          <CardTitle>{preview.headline}</CardTitle>
          <CardDescription>
            {signedIn ? "Pick a plan. We'll bring you right back to this guide." : "Sign in first. We'll bring you right back to this guide."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {preview.plans.map((p) => (
            <Button key={p.id} onClick={() => choose(p.id)} disabled={busy !== null} className="h-auto flex-col py-3">
              {busy === p.id ? <Loader2 className="size-4 animate-spin" /> : null}
              <span className="font-semibold">
                {p.name} · {formatPrice(p.priceCents)}/mo
              </span>
              <span className="text-xs opacity-80">{p.limit} generations per month</span>
            </Button>
          ))}
        </CardContent>
        {error && <p className="px-6 pb-4 text-sm text-destructive">{error}</p>}
      </Card>
    </div>
  );
}
