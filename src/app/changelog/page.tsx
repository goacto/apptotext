import { Sparkles, Plus, Wrench, Zap, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ChangeType = "added" | "fixed" | "improved";

interface ChangeEntry {
  type: ChangeType;
  text: string;
}

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: ChangeEntry[];
}

const changeTypeConfig: Record<
  ChangeType,
  { icon: typeof Plus; className: string }
> = {
  added: { icon: Plus, className: "text-green-500" },
  fixed: { icon: Wrench, className: "text-blue-500" },
  improved: { icon: Zap, className: "text-purple-500" },
};

const entries: ChangelogEntry[] = [
  {
    version: "v0.4.0",
    date: "April 2, 2026",
    title: "Subscriptions & Polish",
    changes: [
      {
        type: "added",
        text: "Stripe subscription system with 4 tiers (Free, Standard, Pro, Master)",
      },
      {
        type: "added",
        text: "PDF and Markdown export for generated textbooks",
      },
      { type: "added", text: "Forgot/reset password flow" },
      {
        type: "added",
        text: "Error boundaries and skeleton loading states",
      },
      { type: "added", text: "Custom 404 page" },
      {
        type: "added",
        text: "Ecosystem page showing GOACTO app family",
      },
      { type: "added", text: "Pricing page with tier comparison" },
      {
        type: "fixed",
        text: "Apostrophes rendering as HTML entities in generated content",
      },
      { type: "fixed", text: "Duplicate chapter titles" },
      {
        type: "fixed",
        text: "Generation timeout on Vercel (now up to 60s)",
      },
      {
        type: "fixed",
        text: "Flashcard and quiz generation now run in parallel",
      },
      {
        type: "improved",
        text: "Consistent AppToText book+leaf logo across all pages",
      },
      { type: "improved", text: "Custom favicon and app icons" },
    ],
  },
  {
    version: "v0.3.0",
    date: "March 29, 2026",
    title: "Bug Fixes & Features",
    changes: [
      {
        type: "fixed",
        text: "5 critical runtime bugs (table names, quiz fields, XP tracking, tab types, nav links)",
      },
      {
        type: "fixed",
        text: "Share feature using proper is_public toggle",
      },
      { type: "added", text: "Profile and Settings pages" },
      { type: "added", text: "About, Privacy, Terms pages" },
    ],
  },
  {
    version: "v0.2.0",
    date: "March 29, 2026",
    title: "Core App Launch",
    changes: [
      {
        type: "added",
        text: "AI-powered textbook generation (Claude, GPT, Grok)",
      },
      {
        type: "added",
        text: "5 learning levels: 101 Beginner to 501 Principal",
      },
      {
        type: "added",
        text: "Interactive flashcards with spaced repetition",
      },
      { type: "added", text: "Quizzes with scoring and XP" },
      {
        type: "added",
        text: "Gamification: XP, badges, streaks, leaderboard",
      },
      { type: "added", text: "Community sharing" },
      {
        type: "added",
        text: "Supabase auth with email + Google OAuth",
      },
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            What&apos;s New
          </h1>
        </div>
        <p className="mt-3 text-lg text-muted-foreground">
          The latest updates and improvements to AppToText
        </p>
      </div>

      <div className="mt-12 space-y-8">
        {entries.map((entry) => (
          <Card key={entry.version}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{entry.version}</Badge>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="size-3.5" />
                  {entry.date}
                </div>
              </div>
              <h2 className="mt-2 text-xl font-semibold">{entry.title}</h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {entry.changes.map((change, i) => {
                  const config = changeTypeConfig[change.type];
                  const Icon = config.icon;
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Icon
                        className={`mt-0.5 size-4 shrink-0 ${config.className}`}
                      />
                      <span>{change.text}</span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
