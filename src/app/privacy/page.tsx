import { APP_NAME, GOACTO_SHORT } from "@/lib/constants";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: March 2026
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          Information We Collect
        </h2>
        <p>
          {APP_NAME} collects your email address and display name when you create
          an account. If you sign in with GitHub or Google, we receive your
          public profile information from those providers.
        </p>

        <h2 className="text-lg font-semibold text-foreground">
          How We Use Your Information
        </h2>
        <p>
          Your information is used to provide the {APP_NAME} service, track your
          learning progress, and display your profile on the community
          leaderboard. We do not sell your personal data.
        </p>

        <h2 className="text-lg font-semibold text-foreground">
          Third-Party Services
        </h2>
        <p>
          We use Supabase for authentication and data storage, and AI providers
          (Anthropic, OpenAI, xAI) to generate educational content. URLs you
          submit are sent to these providers for content generation.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Contact</h2>
        <p>
          For privacy questions, reach out to the {GOACTO_SHORT} team.
        </p>
      </div>
    </div>
  );
}
