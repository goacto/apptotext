"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, limitWallCopy, upgradeOptions } from "@/lib/plans";
import type { PlanTier } from "@/lib/subscription";

/**
 * Shown when /api/generate refuses on the plan limit (403 limit_reached).
 * Free users see every paid plan; paid users see only the plans above theirs.
 * Buttons use the existing checkout and return to this guide afterwards.
 */
export function LimitWallCard({ plan, limit, returnTo }: { plan: PlanTier; limit: number; returnTo: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = upgradeOptions(plan);
  const copy = limitWallCopy(plan, limit);
  const isPaid = plan !== "free";

  async function choose(id: string) {
    setError(null);
    setBusy(id);
    try {
      // Paid users change plan in the billing portal, like the Pricing page's "Change Plan".
      // A second Checkout would start a second subscription next to the current one.
      const res = isPaid
        ? await fetch("/api/stripe/portal", { method: "POST" })
        : await fetch("/api/stripe/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan: id, return_to: returnTo, source: "limit_wall" }),
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
    <Card id="limit-wall-card" data-testid="limit-wall-card" className="w-full max-w-xl border-primary/40 text-left">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" aria-hidden />
          {copy.title}
        </CardTitle>
        <CardDescription>{copy.body}</CardDescription>
      </CardHeader>
      {options.length > 0 && (
        <CardContent className={`grid gap-3 ${options.length === 3 ? "sm:grid-cols-3" : options.length === 2 ? "sm:grid-cols-2" : ""}`}>
          {options.map((p, i) => (
            <Button
              key={p.id}
              onClick={() => choose(p.id)}
              disabled={busy !== null}
              variant={i === 0 ? "default" : "outline"}
              className="h-auto flex-col py-3"
            >
              {busy === p.id ? <Loader2 className="size-4 animate-spin" /> : null}
              <span className="font-semibold">
                {p.name} · {formatPrice(p.priceCents)}/mo
              </span>
              <span className="text-xs opacity-80">{p.limit} generations per month</span>
            </Button>
          ))}
        </CardContent>
      )}
      <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{options.length === 0
            ? "Thanks for being on our top plan."
            : isPaid
              ? "Plan changes open your billing settings."
              : "We'll bring you right back to this guide."}</span>
        <Link href="/pricing" className="font-medium text-primary underline-offset-4 hover:underline">
          Compare plans
        </Link>
      </CardFooter>
      {error && <p className="px-6 pb-4 text-sm text-destructive">{error}</p>}
    </Card>
  );
}
