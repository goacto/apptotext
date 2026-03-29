"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Link as LinkIcon,
  Sparkles,
  GraduationCap,
  Sprout,
  Leaf,
  TreePine,
  Mountain,
  Crown,
  ArrowRight,
  ChevronRight,
  Clipboard,
  Layers,
  Brain,
  Trophy,
  Users,
  Zap,
  BookOpen,
  Star,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  APP_NAME,
  GOACTO_FULL,
  GOACTO_SHORT,
  TEXTBOOK_LEVELS,
  AI_PROVIDERS,
} from "@/lib/constants";
import type { AIProvider } from "@/lib/types";

const levelIcons: Record<number, React.ElementType> = {
  101: Sprout,
  201: Leaf,
  301: TreePine,
  401: Mountain,
  501: Crown,
};

const levelColors: Record<number, string> = {
  101: "from-emerald-400 to-emerald-600",
  201: "from-teal-400 to-teal-600",
  301: "from-cyan-500 to-blue-600",
  401: "from-violet-500 to-purple-600",
  501: "from-amber-400 to-orange-500",
};

const levelBgColors: Record<number, string> = {
  101: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  201: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  301: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  401: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  501: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

const levelRingColors: Record<number, string> = {
  101: "ring-emerald-500/20",
  201: "ring-teal-500/20",
  301: "ring-blue-500/20",
  401: "ring-violet-500/20",
  501: "ring-amber-500/20",
};

const providerLabels: Record<AIProvider, string> = {
  claude: "Claude",
  openai: "GPT",
  grok: "Grok",
};

const providerDescriptions: Record<AIProvider, string> = {
  claude: "Best for education",
  openai: "Strong general",
  grok: "Real-time knowledge",
};

const features = [
  {
    icon: Layers,
    title: "Interactive Flashcards",
    description:
      "Spaced repetition flashcards that adapt to your pace. Each card is generated from the codebase content to cement your understanding.",
    accent: "bg-primary/10 text-primary",
  },
  {
    icon: Brain,
    title: "Quizzes at Every Level",
    description:
      "Test your knowledge with AI-generated quizzes from 101 through 501. Track your scores and identify gaps in understanding.",
    accent: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    icon: Trophy,
    title: "XP, Badges & Leaderboards",
    description:
      "Earn XP for every chapter read, flashcard reviewed, and quiz completed. Collect badges and compete with the community.",
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    icon: Users,
    title: "Community Sharing",
    description:
      "Share your learning textbooks with the community. Embody the GOACTO spirit by helping others grow while you grow yourself.",
    accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
];

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [provider, setProvider] = useState<AIProvider>("claude");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text.trim());
    } catch {
      // Clipboard access denied - user can type manually
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!url.trim()) return;

      setIsSubmitting(true);

      localStorage.setItem(
        "apptotext_pending_conversion",
        JSON.stringify({ url: url.trim(), ai_provider: provider })
      );

      // Redirect to login (or dashboard if already logged in).
      // For now we redirect to login; the auth flow can pick up
      // the pending conversion from localStorage on successful sign-in.
      router.push("/auth/login");
    },
    [url, provider, router]
  );

  return (
    <div className="flex flex-col">
      {/* ================================================================ */}
      {/*  HERO SECTION                                                    */}
      {/* ================================================================ */}
      <section className="relative isolate overflow-hidden">
        {/* Background decoration */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
        >
          <div className="absolute -top-40 right-0 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-20 left-0 h-[400px] w-[400px] rounded-full bg-accent/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/3 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="mb-6 flex justify-center">
              <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs">
                <Zap className="size-3" />
                Powered by AI — Part of the {GOACTO_SHORT} Ecosystem
              </Badge>
            </div>

            {/* Headline */}
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Transform Any Codebase Into a{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Complete Learning Journey
              </span>
            </h1>

            {/* Subheadline */}
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Paste any GitHub repo or website URL and let AI generate a
              structured textbook with levels from{" "}
              <span className="font-semibold text-foreground">101</span> to{" "}
              <span className="font-semibold text-foreground">501</span>.
              Complete with flashcards, quizzes, and XP tracking.{" "}
              <span className="italic text-primary/80">
                {GOACTO_FULL}.
              </span>
            </p>

            {/* ---- Conversion Form ---- */}
            <form
              onSubmit={handleSubmit}
              className="mx-auto mt-10 max-w-2xl"
            >
              {/* AI Provider Selector */}
              <div className="mb-4 flex items-center justify-center gap-2">
                <span className="mr-1 text-sm font-medium text-muted-foreground">
                  AI Provider:
                </span>
                {(["claude", "openai", "grok"] as AIProvider[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={`relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
                      provider === p
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                  >
                    {providerLabels[p]}
                    {provider === p && (
                      <span className="mt-0.5 block text-[10px] font-normal leading-none opacity-80">
                        {providerDescriptions[p]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* URL Input Row */}
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-lg shadow-primary/5 ring-1 ring-foreground/5 transition-shadow focus-within:shadow-primary/10 focus-within:ring-primary/20">
                <LinkIcon className="ml-2 size-5 shrink-0 text-muted-foreground" />
                <Input
                  type="url"
                  placeholder="Paste a GitHub URL or website URL..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 border-0 bg-transparent px-1 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-transparent md:text-base"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handlePaste}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Paste from clipboard"
                >
                  <Clipboard className="size-4" />
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="shrink-0 gap-1.5 px-5"
                >
                  {isSubmitting ? "Loading..." : "Convert"}
                  <ArrowRight className="size-4" />
                </Button>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Supports public GitHub repositories, documentation sites, and
                web applications.
              </p>
            </form>
          </div>

          {/* Scroll indicator */}
          <div className="mt-14 flex justify-center">
            <ArrowDown className="size-5 animate-bounce text-muted-foreground/50" />
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  HOW IT WORKS                                                     */}
      {/* ================================================================ */}
      <section className="border-t border-border bg-muted/30 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="mb-4">
              How It Works
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Three simple steps to mastery
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              From any codebase to a comprehensive learning textbook in minutes.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
            {/* Step 1 */}
            <div className="group relative flex flex-col items-center text-center">
              <div className="relative">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <LinkIcon className="size-7" />
                </div>
                <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  1
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Paste URL
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Drop in any GitHub repository, documentation site, or web app
                URL. We handle the rest.
              </p>
              {/* Connector arrow (visible on md+) */}
              <ChevronRight className="absolute top-8 -right-4 hidden size-8 text-border md:block" />
            </div>

            {/* Step 2 */}
            <div className="group relative flex flex-col items-center text-center">
              <div className="relative">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 transition-transform group-hover:scale-110 dark:text-violet-400">
                  <Sparkles className="size-7" />
                </div>
                <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  2
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-foreground">
                AI Generates
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Your chosen AI provider creates a five-level textbook,
                flashcards, and quizzes tailored to the codebase.
              </p>
              <ChevronRight className="absolute top-8 -right-4 hidden size-8 text-border md:block" />
            </div>

            {/* Step 3 */}
            <div className="group flex flex-col items-center text-center">
              <div className="relative">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 transition-transform group-hover:scale-110 dark:text-amber-400">
                  <GraduationCap className="size-7" />
                </div>
                <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  3
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-foreground">
                Learn & Grow
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Progress through levels, earn XP, collect badges, and share with
                the community. Grow yourself while helping others.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  LEVELS PREVIEW                                                   */}
      {/* ================================================================ */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="mb-4">
              <BookOpen className="size-3" />
              Learning Path
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Five levels, one complete journey
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Every textbook is structured into five progressive levels, taking
              you from fundamentals to principal-level mastery.
            </p>
          </div>

          {/* Level Cards */}
          <div className="mx-auto mt-16 max-w-5xl">
            {/* Connecting line (visible on md+) */}
            <div className="relative">
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-emerald-300 via-blue-400 to-amber-400 opacity-30 md:block"
              />

              <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
                {TEXTBOOK_LEVELS.map((level) => {
                  const Icon = levelIcons[level.level];
                  return (
                    <Card
                      key={level.level}
                      className={`group relative transition-all hover:-translate-y-1 hover:shadow-lg ${levelRingColors[level.level]} ring-1`}
                    >
                      <CardHeader className="items-center text-center">
                        <div
                          className={`flex size-12 items-center justify-center rounded-xl ${levelBgColors[level.level]} transition-transform group-hover:scale-110`}
                        >
                          <Icon className="size-6" />
                        </div>
                        <CardTitle className="mt-2">
                          <span
                            className={`bg-gradient-to-r ${levelColors[level.level]} bg-clip-text text-lg font-bold text-transparent`}
                          >
                            {level.level}
                          </span>
                        </CardTitle>
                        <CardDescription className="font-semibold text-foreground">
                          {level.name}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-center">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {level.description}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Progression arrow row */}
            <div className="mt-6 hidden items-center justify-center gap-2 md:flex">
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Beginner
              </span>
              <div className="flex items-center gap-1">
                {[...Array(4)].map((_, i) => (
                  <ArrowRight
                    key={i}
                    className="size-3.5 text-muted-foreground/40"
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Principal
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  FEATURES                                                         */}
      {/* ================================================================ */}
      <section className="border-t border-border bg-muted/30 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="mb-4">
              <Star className="size-3" />
              Features
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Everything you need to truly learn
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              {APP_NAME} goes beyond reading. Active recall, gamification, and
              community keep you engaged and growing.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="group transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <CardHeader>
                  <div
                    className={`flex size-10 items-center justify-center rounded-xl ${feature.accent} transition-transform group-hover:scale-110`}
                  >
                    <feature.icon className="size-5" />
                  </div>
                  <CardTitle className="mt-1 text-base font-semibold">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  CTA SECTION                                                      */}
      {/* ================================================================ */}
      <section className="relative isolate overflow-hidden py-24 sm:py-32">
        {/* Background decoration */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
        >
          <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <GraduationCap className="mx-auto size-12 text-primary" />
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Start Your Learning Journey
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Join a community of developers who learn by doing. Transform any
            codebase into knowledge, level up your skills, and contribute to
            others along the way.
          </p>
          <p className="mt-2 text-sm font-medium italic text-primary/80">
            {GOACTO_FULL}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/auth/signup">
              <Button size="lg" className="gap-2 px-8 text-base">
                Get Started Free
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="/auth/login">
              <Button variant="outline" size="lg" className="gap-2 px-8 text-base">
                Sign In
              </Button>
            </Link>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            No credit card required. Start converting codebases in under a
            minute.
          </p>
        </div>
      </section>
    </div>
  );
}
