"use client";

import Link from "next/link";
import {
  BookOpen,
  ExternalLink,
  Rocket,
  ArrowRight,
  Timer,
  Mountain,
  Moon,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GOACTO_FULL, GOACTO_SHORT } from "@/lib/constants";

const ecosystemApps = [
  {
    name: "Focus Log",
    tagline: "25-Minute Daily Growth Engine",
    description:
      "Complete focused Pomodoro sessions with audio cues, custom topics and post session reflections. Discover powerful insights and dynamic dashboards, track streaks and develop your skill tree. The foundation of everything in GOACTO.",
    icon: Timer,
    status: "live" as const,
    href: "https://goacto.com",
    external: true,
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    cta: "Start Focus Session",
  },
  {
    name: "Mindscape",
    tagline: "Visualize & Gamify Your Journey",
    description:
      "The evolution of Focus Lab, turn daily progress into an interactive 2.5D universe in this growth and contribution centric RPG. Control Agent GOACTO, explore your space ship, discover the mindscape and help your human achieve their potential.",
    icon: Mountain,
    status: "live" as const,
    href: "https://goacto.com",
    external: true,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    cta: "Begin Journey",
  },
  {
    name: "Nightlight",
    tagline: "Evening Reflections & Stories",
    description:
      "Capture bedtime magic. Add books manually or via ISBN lookup, journal cherished memories, curate storytime sessions, and track family milestones.",
    icon: Moon,
    status: "live" as const,
    href: "https://goacto.com",
    external: true,
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    cta: "Open Nightlight",
  },
  {
    name: "Mission Control",
    tagline: "Growth & Impact Dashboard",
    description:
      "Your central command hub. Track business metrics, sync Shopify/Etsy stores, use AI agents, and align personal growth with real-world contribution.",
    icon: BarChart3,
    status: "live" as const,
    href: "https://goacto.com",
    external: true,
    color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    cta: "Grow Your Business",
  },
  {
    name: "AppToText",
    tagline: "Codebase to Textbook",
    description:
      "Transform any codebase or application into a complete learning textbook, from 101 to Principal Engineer. Complete with flashcards, quizzes, and gamification.",
    icon: BookOpen,
    status: "live" as const,
    href: "/dashboard",
    external: false,
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    cta: "Open App",
  },
];

export default function EcosystemPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-12 text-center">
        <div className="mb-4 flex justify-center">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Rocket className="size-3" />
            {GOACTO_SHORT} Ecosystem
          </Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Five Apps. One Theme.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
          Consistent and focused effort leads to meaningful growth and
          contribution in personal, family and business life. We are{" "}
          {GOACTO_FULL}.
        </p>
      </div>

      {/* App Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {ecosystemApps.map((app) => (
          <Card
            key={app.name}
            className="relative overflow-hidden transition-shadow hover:shadow-md"
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className={`rounded-lg p-2.5 ${app.color}`}>
                  <app.icon className="size-5" />
                </div>
                <Badge
                  variant="outline"
                  className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                >
                  Live
                </Badge>
              </div>
              <CardTitle className="mt-3">{app.name}</CardTitle>
              <p className="text-sm font-medium text-primary">
                {app.tagline}
              </p>
              <CardDescription className="text-sm leading-relaxed">
                {app.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {app.external ? (
                <a
                  href={app.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="w-full">
                    {app.cta}
                    <ArrowRight className="size-4" />
                  </Button>
                </a>
              ) : (
                <Link href={app.href}>
                  <Button className="w-full">
                    {app.cta}
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-12 text-center">
        <p className="text-sm text-muted-foreground">
          Learn more about the {GOACTO_SHORT} ecosystem at{" "}
          <a
            href="https://goacto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            goacto.com
            <ExternalLink className="size-3" />
          </a>
        </p>
      </div>
    </div>
  );
}
