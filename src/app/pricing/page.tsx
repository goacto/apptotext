"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Zap, Crown, Sparkles, Loader2 } from "lucide-react";
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

interface ProfileData {
  subscription_status: string;
  generation_count: number;
}

export default function PricingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
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

  const isPro = profile?.subscription_status === "pro";

  async function handleCheckout() {
    if (!user) {
      router.push("/auth/signup");
      return;
    }

    setCheckoutLoading(true);
    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Checkout error:", data.error);
      }
    } catch (error) {
      console.error("Checkout error:", error);
    } finally {
      setCheckoutLoading(false);
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

  const features = [
    { name: "AI-powered textbook generation", free: true, pro: true },
    { name: "Interactive flashcards", free: true, pro: true },
    { name: "Quizzes & assessments", free: true, pro: true },
    { name: "XP, badges & streaks", free: true, pro: true },
    { name: "Community leaderboard", free: true, pro: true },
    { name: "All AI providers (Claude, GPT, Grok)", free: false, pro: true },
    { name: "50 generations per month", free: false, pro: true },
    { name: "Priority support", free: false, pro: true },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
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

      {/* Pricing Cards */}
      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {/* Free Tier */}
        <Card className="relative">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="size-5 text-muted-foreground" />
              <CardTitle className="text-lg">Free</CardTitle>
              {user && !isPro && (
                <Badge variant="secondary">Current Plan</Badge>
              )}
            </div>
            <CardDescription>
              Try {APP_NAME} with a limited number of generations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-muted-foreground"> forever</span>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>2 generations total (lifetime trial)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>AI-powered textbook generation</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Interactive flashcards & quizzes</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>XP, badges & streaks</span>
              </li>
              <li className="flex items-start gap-2">
                <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  All AI providers
                </span>
              </li>
              <li className="flex items-start gap-2">
                <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Priority support
                </span>
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            {user ? (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                disabled={!isPro}
                onClick={() => router.push("/dashboard")}
              >
                {isPro ? "Downgrade not available here" : "Current Plan"}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => router.push("/auth/signup")}
              >
                Get Started
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Pro Tier */}
        <Card className="relative border-primary/50 ring-2 ring-primary/20">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="gap-1">
              <Crown className="size-3" />
              Most Popular
            </Badge>
          </div>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className="size-5 text-primary" />
              <CardTitle className="text-lg">Pro</CardTitle>
              {isPro && <Badge>Current Plan</Badge>}
            </div>
            <CardDescription>
              For serious learners who want unlimited power
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <span className="text-4xl font-bold">$9</span>
              <span className="text-muted-foreground"> /month</span>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <strong>50 generations per month</strong> (resets monthly)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>AI-powered textbook generation</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Interactive flashcards & quizzes</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>XP, badges & streaks</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>All AI providers (Claude, GPT, Grok)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Priority support</span>
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            {isPro ? (
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
            ) : (
              <Button
                size="lg"
                className="w-full"
                disabled={checkoutLoading || isLoading}
                onClick={handleCheckout}
              >
                {checkoutLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Subscribe"
                )}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>

      {/* Feature Comparison */}
      <div className="mt-16">
        <h2 className="mb-6 text-center text-xl font-semibold">
          Feature Comparison
        </h2>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Feature</th>
                <th className="px-4 py-3 text-center font-medium">Free</th>
                <th className="px-4 py-3 text-center font-medium">Pro</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="px-4 py-3">Generations</td>
                <td className="px-4 py-3 text-center text-muted-foreground">
                  2 total
                </td>
                <td className="px-4 py-3 text-center font-medium">
                  50 / month
                </td>
              </tr>
              {features.map((feature) => (
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
                    {feature.pro ? (
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
