# AppToText Backlog

Future features and next steps for AppToText, part of the GOACTO ecosystem.

---

## High Priority

- [ ] **Streaming AI Responses** — Stream textbook generation in real-time instead of waiting for full response; show progress as chapters are generated
- [ ] **PDF/Markdown Export** — Allow users to download generated textbooks as PDF or Markdown files for offline reading
- [ ] **Multi-Chapter Generation** — Generate multiple chapters per level (e.g., 3-5 chapters covering different aspects of the codebase)
- [ ] **GitHub OAuth Sign-In** — Enable GitHub OAuth provider in Supabase for developer-friendly login
- [ ] **Google OAuth Sign-In** — Enable Google OAuth provider for broader access
- [ ] **Custom Domain** — Set up apptotext.goacto.com or similar branded domain

## Medium Priority

- [ ] **Conversion History Page** — Full paginated list at `/conversions` (currently only recent 10 on dashboard)
- [ ] **Search & Filter** — Search conversions by title, filter by AI provider or date
- [ ] **Bookmark/Favorite Chapters** — Let users bookmark specific chapters for quick reference
- [ ] **Progress Resume** — Remember where the user left off in a textbook and resume from that point
- [ ] **Share via Link** — Generate shareable public links for community conversions
- [ ] **Email Notifications** — Daily streak reminders, weekly progress summaries
- [ ] **Flashcard Deck Management** — Create custom decks, merge flashcards from multiple conversions
- [ ] **Quiz Retry with Wrong Answers Only** — Re-quiz only on questions the user got wrong

## Low Priority / Future Vision

- [ ] **Team/Organization Workspaces** — Shared textbooks within a team, collaborative learning
- [ ] **Learning Paths** — Curated sequences of conversions for specific tech stacks (e.g., "Full-Stack React" path)
- [ ] **AI Tutor Chat** — Ask follow-up questions about generated content in a chat interface
- [ ] **Code Playground** — Interactive code sandbox embedded in textbook chapters
- [ ] **Spaced Repetition Analytics** — Graphs showing retention curves, optimal review times
- [ ] **Leaderboard Seasons** — Monthly/quarterly leaderboard resets with seasonal badges
- [ ] **GOACTO Ecosystem SSO** — Single sign-on across all GOACTO apps
- [ ] **GOACTO Contribution Score** — Cross-app metric tracking contributions across the ecosystem
- [ ] **Mobile App (React Native)** — Native mobile experience for flashcard study on-the-go
- [ ] **Accessibility Audit** — Full WCAG 2.1 AA compliance pass
- [ ] **Internationalization (i18n)** — Multi-language support for generated content and UI
- [ ] **API Rate Limiting** — Per-user rate limits on AI generation to manage costs
- [ ] **Admin Dashboard** — Analytics, user management, content moderation tools

## Technical Debt

- [ ] **Migrate middleware to proxy** — Next.js 16 deprecated `middleware` in favor of `proxy`
- [ ] **Add unit tests** — Jest/Vitest for API routes and utility functions
- [ ] **Add E2E tests** — Playwright for critical user flows (signup, convert, study)
- [ ] **Error boundary components** — Graceful error handling per page segment
- [ ] **Skeleton loading states** — Replace spinner loaders with skeleton UI for better perceived performance
- [ ] **OpenGraph / SEO meta tags** — Dynamic OG images for shared conversions
