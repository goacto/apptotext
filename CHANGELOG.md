# Changelog

All notable changes to AppToText are documented here.

---

## [0.3.0] - 2026-03-29

### Fixed
- **Critical: Table name mismatch** — `textbook_chapters` queries corrected to `chapters` across dashboard and conversion viewer
- **Critical: Quiz submission field mismatch** — `selected_answer` corrected to `selected` to match API contract
- **Critical: Missing `increment_xp` RPC** — Added Supabase function and direct update fallback for XP awards
- **Critical: Quiz response format** — API now returns `total_questions` and `passed` fields as expected by frontend
- **Critical: Convert API response** — Returns conversion object directly so `data.id` works on dashboard
- **Critical: Tabs type coercion** — Tab values now use `String()` for base-ui compatibility
- **Critical: Navigation links broken** — Replaced invalid `render` prop on Buttons with proper `<Link>` wrappers
- **Share feature** — Replaced non-existent `community_shares` table with `conversions.is_public` toggle
- **Generate API** — Falls back to conversion's `ai_provider` when not specified in request

### Added
- About, Privacy, and Terms pages (footer links no longer 404)

### Improved
- Error message contrast on auth pages (better readability)
- Dashboard empty state with prominent CTA button
- Keyboard focus states on settings theme buttons and leaderboard rows
- Conversion title responsive text with line-clamp on mobile
- Migrated all Tailwind classes to v4 canonical form (`bg-linear-to-*`, standard utilities)

---

## [0.2.0] - 2026-03-29

### Added
- Profile page with editable display name, stats, and badge display
- Settings page with AI provider selector, theme toggle, password change, and account deletion
- Header dropdown links wired to Profile, Settings, and Sign Out

---

## [0.1.0] - 2026-03-29

### Added
- **Core App** — Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui
- **Authentication** — Supabase Auth with email/password, GitHub OAuth, Google OAuth
- **Landing Page** — Hero section with URL input, AI provider selector, level preview, features showcase
- **Dashboard** — Quick convert, stats row (XP, streak, conversions, flashcards), recent conversions, growth quotes
- **Textbook Viewer** — 5-level tab system (101-501), AI-powered chapter generation, markdown rendering, key concepts
- **Flashcard System** — Interactive flip cards with SM-2 spaced repetition algorithm, quality rating (0-5)
- **Quiz System** — Multiple choice quizzes with per-question feedback, scoring, XP awards, confetti on perfect score
- **Gamification** — XP points, 10 badges, streak tracking, community leaderboard with 3 tabs (XP, Streaks, Contributors)
- **AI Providers** — Claude (Anthropic), GPT (OpenAI), Grok (xAI) — user selectable
- **GOACTO Integration** — Branding throughout, community sharing, growth mindset messaging, contribution tracking
- **Database** — Supabase PostgreSQL with RLS policies, auto-profile creation trigger, performance indexes
- **Deployment** — Vercel production hosting with environment variables configured
