"use client";

import Link from "next/link";
import {
  BookOpen,
  ExternalLink,
  Rocket,
  Code2,
  Users,
  Lightbulb,
  ArrowRight,
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
    name: "AppToText",
    description:
      "Transform any codebase or application into a complete learning textbook, from 101 to Principal Engineer.",
    icon: BookOpen,
    status: "live" as const,
    href: "/dashboard",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    features: [
      "AI-powered textbook generation",
      "Interactive flashcards",
      "Quizzes & gamification",
    ],
  },
  {
    name: "CodeReview",
    description:
      "AI-powered code review tool that helps teams grow through constructive, educational feedback on pull requests.",
    icon: Code2,
    status: "coming-soon" as const,
    href: "#",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    features: [
      "Automated PR reviews",
      "Learning suggestions",
      "Team growth metrics",
    ],
  },
  {
    name: "MentorMatch",
    description:
      "Connect with mentors and mentees in the tech community. Grow yourself by helping others grow.",
    icon: Users,
    status: "coming-soon" as const,
    href: "#",
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    features: [
      "Mentor/mentee matching",
      "Session tracking",
      "Growth milestones",
    ],
  },
  {
    name: "IdeaForge",
    description:
      "Collaborative ideation platform where the community builds and refines project ideas together.",
    icon: Lightbulb,
    status: "planned" as const,
    href: "#",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    features: [
      "Idea submissions",
      "Community voting",
      "Team formation",
    ],
  },
];

const statusConfig = {
  live: { label: "Live", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  "coming-soon": { label: "Coming Soon", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  planned: { label: "Planned", className: "bg-muted text-muted-foreground" },
};

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
          The {GOACTO_SHORT} App Family
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
          We are {GOACTO_FULL}. Every app in our ecosystem is built to help you
          grow your skills while contributing to the community.
        </p>
      </div>

      {/* App Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {ecosystemApps.map((app) => {
          const status = statusConfig[app.status];
          const isLive = app.status === "live";

          return (
            <Card
              key={app.name}
              className={`relative overflow-hidden transition-shadow hover:shadow-md ${
                !isLive ? "opacity-80" : ""
              }`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className={`rounded-lg p-2.5 ${app.color}`}>
                    <app.icon className="size-5" />
                  </div>
                  <Badge variant="outline" className={status.className}>
                    {status.label}
                  </Badge>
                </div>
                <CardTitle className="mt-3">{app.name}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {app.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-1.5">
                  {app.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <div className="size-1.5 rounded-full bg-primary/40" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {isLive ? (
                  <Link href={app.href}>
                    <Button className="w-full">
                      Open App
                      <ArrowRight className="size-4" />
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    {app.status === "coming-soon"
                      ? "Coming Soon"
                      : "Planned"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* CTA */}
      <div className="mt-12 text-center">
        <p className="text-sm text-muted-foreground">
          Have an idea for a {GOACTO_SHORT} app?{" "}
          <a
            href="https://github.com/goacto"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            Contribute on GitHub
            <ExternalLink className="size-3" />
          </a>
        </p>
      </div>
    </div>
  );
}
