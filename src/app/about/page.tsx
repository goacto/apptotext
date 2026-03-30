import { APP_NAME, GOACTO_FULL, GOACTO_SHORT } from "@/lib/constants";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">{APP_NAME}</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Part of the {GOACTO_SHORT} Ecosystem
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">{APP_NAME}</strong> transforms any
          codebase or application into a complete learning textbook. Paste a
          GitHub repository or website URL, choose your AI provider, and get a
          structured curriculum from beginner (101) to principal engineer (501).
        </p>

        <p>
          Every conversion comes with interactive flashcards using spaced
          repetition, quizzes to test your understanding, and a gamification
          system to keep you motivated with XP, badges, and streaks.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-foreground">
          {GOACTO_SHORT} — {GOACTO_FULL}
        </h2>
        <p>
          {APP_NAME} is built on the belief that the best way to grow is to help
          others grow too. Share your conversions with the community, climb the
          leaderboard, and embody the GOACTO spirit in everything you learn.
        </p>
      </div>
    </div>
  );
}
