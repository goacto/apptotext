"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Zap, Crown, Sparkles, Loader2, Star, Gem } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { APP_NAME, GOACTO_SHORT } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type PlanTier = "free" | "standard" | "pro" | "master";

interface ProfileData {
  subscription_status: string;
  generation_count: number;
}

interface TierConfig {
  id: PlanTier;
  name: string;
  icon: React.ReactNode;
  price: string;
  priceSuffix: string;
  description: string;
  popular: boolean;
  generations: string;
  features: { label: string; included: boolean }[];
  ctaLabel: string;
}

const tiers: TierConfig[] = [
  {
    id: "free",
    name: "Free",
    icon: <Zap className="size-5 text-muted-foreground" />,
    price: "$0",
    priceSuffix: " forever",
    description: "Try AppToText with a limited number of generations",
    popular: false,
    generations: "3 lifetime",
    features: [
      { label: "AI-powered textbook generation", included: true },
      { label: "Interactive flashcards & quizzes", included: true },
      { label: "XP, badges & streaks", included: true },
      { label: "All AI providers (Claude, GPT, Grok)", included: false },
      { label: "Priority support", included: false },
      { label: "Early access to new features", included: false },
    ],
    ctaLabel: "Get Started",
  },
  {
    id: "standard",
    name: "Standard",
    icon: <Star className="size-5 text-primary" />,
    price: "$4.99",
    priceSuffix: " /month",
    description: "For learners who want more power",
    popular: false,
    generations: "10 / month",
    features: [
      { label: "AI-powered textbook generation", included: true },
      { label: "Interactive flashcards & quizzes", included: true },
      { label: "XP, badges & streaks", included: true },
      { label: "All AI providers (Claude, GPT, Grok)", included: true },
      { label: "Priority support", included: false },
      { label: "Early access to new features", included: false },
    ],
    ctaLabel: "Subscribe",
  },
  {
    id: "pro",
    name: "Pro",
    icon: <Crown className="size-5 text-primary" />,
    price: "$9.99",
    priceSuffix: " /month",
    description: "For serious learners who want the best",
    popular: true,
    generations: "25 / month",
    features: [
      { label: "AI-powered textbook generation", included: true },
      { label: "Interactive flashcards & quizzes", included: true },
      { label: "XP, badges & streaks", included: true },
      { label: "All AI providers (Claude, GPT, Grok)", included: true },
      { label: "Priority support", included: true },
      { label: "Early access to new features", included: false },
    ],
    ctaLabel: "Subscribe",
  },
  {
    id: "master",
    name: "Master",
    icon: <Gem className="size-5 text-primary" />,
    price: "$14.99",
    priceSuffix: " /month",
    description: "Maximum power for teams and power users",
    popular: false,
    generations: "50 / month",
    features: [
      { label: "AI-powered textbook generation", included: true },
      { label: "Interactive flashcards & quizzes", included: true },
      { label: "XP, badges & streaks", included: true },
      { label: "All AI providers (Claude, GPT, Grok)", included: true },
      { label: "Priority support", included: true },
      { label: "Early access to new features", included: true },
    ],
    ctaLabel: "Subscribe",
  },
];

const comparisonFeatures = [
  {
    name: "AI-powered textbook generation",
    free: true,
    standard: true,
    pro: true,
    master: true,
  },
  {
    name: "Interactive flashcards",
    free: true,
    standard: true,
    pro: true,
    master: true,
  },
  {
    name: "Quizzes & assessments",
    free: true,
    standard: true,
    pro: true,
    master: true,
  },
  {
    name: "XP, badges & streaks",
    free: true,
    standard: true,
    pro: true,
    master: true,
  },
  {
    name: "Community leaderboard",
    free: true,
    standard: true,
    pro: true,
    master: true,
  },
  {
    name: "All AI providers (Claude, GPT, Grok)",
    free: false,
    standard: true,
    pro: true,
    master: true,
  },
  {
    name: "Priority support",
    free: false,
    standard: false,
    pro: true,
    master: true,
  },
  {
    name: "Early access to new features",
    free: false,
    standard: false,
    pro: false,
    master: true,
  },
];

export default function PricingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanTier | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (currentUser) {
          setUser(currentUser);

          const { data } = await supabase
            .from("profiles")
            .select("subscription_status, generation_count")
            .eq("id", currentUser.id)
            .single();

          if (data) {
            setProfile(data as ProfileData);
          }
        }
      } catch {
        // Not logged in, that's fine
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();
  }, [supabase]);

  const currentPlan: PlanTier =
    (profile?.subscription_status as PlanTier) || "free";

  function isCurrentPlan(tierId: PlanTier): boolean {
    return user !== null && currentPlan === tierId;
  }

  function isPaidPlan(): boolean {
    return currentPlan === "standard" || currentPlan === "pro" || currentPlan === "master";
  }

  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleCheckout(plan: PlanTier) {
    setCheckoutError(null);

    if (plan === "free") {
      router.push("/auth/signup");
      return;
    }

    if (!user) {
      router.push("/auth/signup");
      return;
    }

    setCheckoutLoading(plan);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError(data.error || "Failed to create checkout session");
      }
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Network error");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleManageSubscription() {
    setPortalLoading(true);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Portal error:", data.error);
      }
    } catch (error) {
      console.error("Portal error:", error);
    } finally {
      setPortalLoading(false);
    }
  }

  function renderCta(tier: TierConfig) {
    const isCurrent = isCurrentPlan(tier.id);

    // Free tier
    if (tier.id === "free") {
      if (user) {
        return (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled={isCurrent}
            onClick={() => router.push("/dashboard")}
          >
            {isCurrent ? "Current Plan" : "Go to Dashboard"}
          </Button>
        );
      }
      return (
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => router.push("/auth/signup")}
        >
          Get Started
        </Button>
      );
    }

    // Paid tiers
    if (isCurrent) {
      return (
        <Button
          size="lg"
          className="w-full"
          disabled={portalLoading}
          onClick={handleManageSubscription}
        >
          {portalLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </>
          ) : (
            "Manage Subscription"
          )}
        </Button>
      );
    }

    if (isPaidPlan()) {
      return (
        <Button
          size="lg"
          variant={tier.popular ? "default" : "outline"}
          className="w-full"
          disabled={portalLoading}
          onClick={handleManageSubscription}
        >
          {portalLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </>
          ) : (
            "Change Plan"
          )}
        </Button>
      );
    }

    return (
      <Button
        size="lg"
        variant={tier.popular ? "default" : "outline"}
        className="w-full"
        disabled={checkoutLoading !== null || isLoading}
        onClick={() => handleCheckout(tier.id)}
      >
        {checkoutLoading === tier.id ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Loading...
          </>
        ) : (
          tier.ctaLabel
        )}
      </Button>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <span className="text-sm font-medium text-muted-foreground">
            {GOACTO_SHORT} Ecosystem
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Choose your {APP_NAME} plan
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Transform codebases into learning textbooks. Start free, upgrade when
          you need more.
        </p>
      </div>

      {/* What counts as a generation */}
      <div className="mx-auto mt-10 max-w-2xl rounded-xl border bg-muted/30 px-6 py-4 text-center text-sm text-muted-foreground">
        <strong className="text-foreground">What counts as 1 generation?</strong>{" "}
        Each time you click &ldquo;Generate&rdquo; on a level (e.g. 101, 201), it
        creates a textbook chapter + flashcards + quiz for that level. That&rsquo;s
        1 generation. Converting a URL costs nothing &mdash; only generating
        content counts.
      </div>

      {checkoutError && (
        <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-destructive/30 bg-destructive/10 px-6 py-4 text-center text-sm text-destructive">
          {checkoutError}
        </div>
      )}

      {/* Pricing Cards */}
      <div className="mt-10 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => (
          <Card
            key={tier.id}
            className={
              tier.popular
                ? "relative overflow-visible border-primary/50 ring-2 ring-primary/20"
                : "relative"
            }
          >
            {tier.popular && (
              <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                <Badge className="gap-1 shadow-sm">
                  <Crown className="size-3" />
                  Most Popular
                </Badge>
              </div>
            )}
            <CardHeader>
              <div className="flex items-center gap-2">
                {tier.icon}
                <CardTitle className="text-lg">{tier.name}</CardTitle>
                {isCurrentPlan(tier.id) && (
                  <Badge variant={tier.popular ? "default" : "secondary"}>
                    Current Plan
                  </Badge>
                )}
              </div>
              <CardDescription>{tier.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <span className="text-4xl font-bold">{tier.price}</span>
                <span className="text-muted-foreground">{tier.priceSuffix}</span>
              </div>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <strong>{tier.generations}</strong>{" "}
                    {tier.id === "free" ? "generations" : "generations (resets monthly)"}
                  </span>
                </li>
                {tier.features.map((feature) => (
                  <li key={feature.label} className="flex items-start gap-2">
                    {feature.included ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    ) : (
                      <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span
                      className={
                        feature.included ? undefined : "text-muted-foreground"
                      }
                    >
                      {feature.label}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>{renderCta(tier)}</CardFooter>
          </Card>
        ))}
      </div>

      {/* Feature Comparison */}
      <div className="mt-16">
        <h2 className="mb-6 text-center text-xl font-semibold">
          Feature Comparison
        </h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Feature</th>
                <th className="px-4 py-3 text-center font-medium">Free</th>
                <th className="px-4 py-3 text-center font-medium">Standard</th>
                <th className="px-4 py-3 text-center font-medium">Pro</th>
                <th className="px-4 py-3 text-center font-medium">Master</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="px-4 py-3">Generations</td>
                <td className="px-4 py-3 text-center text-muted-foreground">
                  3 lifetime
                </td>
                <td className="px-4 py-3 text-center font-medium">
                  10 / month
                </td>
                <td className="px-4 py-3 text-center font-medium">
                  25 / month
                </td>
                <td className="px-4 py-3 text-center font-medium">
                  50 / month
                </td>
              </tr>
              {comparisonFeatures.map((feature) => (
                <tr key={feature.name} className="border-b last:border-b-0">
                  <td className="px-4 py-3">{feature.name}</td>
                  <td className="px-4 py-3 text-center">
                    {feature.free ? (
                      <Check className="mx-auto size-4 text-primary" />
                    ) : (
                      <X className="mx-auto size-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {feature.standard ? (
                      <Check className="mx-auto size-4 text-primary" />
                    ) : (
                      <X className="mx-auto size-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {feature.pro ? (
                      <Check className="mx-auto size-4 text-primary" />
                    ) : (
                      <X className="mx-auto size-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {feature.master ? (
                      <Check className="mx-auto size-4 text-primary" />
                    ) : (
                      <X className="mx-auto size-4 text-muted-foreground" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GOACTO Branding */}
      <div className="mt-12 text-center text-sm text-muted-foreground">
        <p>
          {APP_NAME} is part of the{" "}
          <strong className="text-foreground">{GOACTO_SHORT}</strong> ecosystem
          &mdash; Growing Ourselves And Contributing To Others.
        </p>
      </div>
    </div>
  );
}
