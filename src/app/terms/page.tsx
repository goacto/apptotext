import { APP_NAME, GOACTO_SHORT } from "@/lib/constants";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: March 2026
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          Acceptance of Terms
        </h2>
        <p>
          By using {APP_NAME}, you agree to these terms. {APP_NAME} is part of
          the {GOACTO_SHORT} ecosystem and is provided as-is.
        </p>

        <h2 className="text-lg font-semibold text-foreground">
          Use of Service
        </h2>
        <p>
          {APP_NAME} generates educational content from publicly available
          codebases and websites using AI. You are responsible for ensuring you
          have the right to use the source material you submit.
        </p>

        <h2 className="text-lg font-semibold text-foreground">
          Generated Content
        </h2>
        <p>
          AI-generated textbooks, flashcards, and quizzes are for educational
          purposes. While we strive for accuracy, AI-generated content may
          contain errors. Always verify critical information.
        </p>

        <h2 className="text-lg font-semibold text-foreground">
          Community Guidelines
        </h2>
        <p>
          In the spirit of {GOACTO_SHORT}, treat all community members with
          respect. Shared conversions should be educational and constructive.
        </p>
      </div>
    </div>
  );
}
