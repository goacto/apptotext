# AppToText Backlog

Future features and next steps for AppToText, part of the GOACTO ecosystem.

---

## Completed

- [x] **PDF/Markdown Export** — Download generated textbooks as PDF or Markdown
- [x] **Google OAuth Sign-In** — Google login enabled
- [x] **Custom Domains** — apptotext.com and apptotext.goacto.com configured
- [x] **Stripe Subscriptions** — 4-tier pricing (Free, Standard, Pro, Master)
- [x] **Error Boundaries** — Graceful error handling per page segment
- [x] **Skeleton Loading States** — Dashboard and conversion pages
- [x] **Forgot/Reset Password** — Email-based password reset flow

## High Priority

- [ ] **Streaming AI Responses** — Stream textbook generation in real-time instead of waiting for full response
- [x] **Multi-Chapter Generation** — Generate 3 chapters per level for deeper learning
- [x] **GitHub OAuth Sign-In** — Enable GitHub OAuth provider in Supabase
- [x] **Search & Filter** — Find conversions by title, provider, or date

## Medium Priority

- [x] **Conversion History Page** — Full paginated list at `/conversions`
- [ ] **Bookmark/Favorite Chapters** — Save favorites for quick reference
- [x] **Progress Resume** — Remember where user left off in a textbook
- [x] **Share via Link** — Generate shareable public links for community conversions
- [ ] **Email Notifications** — Streak reminders, weekly progress summaries
- [ ] **Flashcard Deck Management** — Custom decks, merge flashcards from multiple conversions
- [x] **Quiz Retry with Wrong Answers Only** — Re-quiz only missed questions

## Future Vision

- [ ] **AI Tutor Chat** — Ask follow-up questions about generated content
- [ ] **Team/Organization Workspaces** — Shared textbooks, collaborative learning
- [ ] **Learning Paths** — Curated sequences for specific tech stacks
- [ ] **Code Playground** — Interactive code sandbox in chapters
- [ ] **Mobile App (React Native)** — Native flashcard study on-the-go
- [ ] **Spaced Repetition Analytics** — Retention curves, optimal review times
- [ ] **Leaderboard Seasons** — Monthly resets with seasonal badges
- [ ] **GOACTO Ecosystem SSO** — Single sign-on across all GOACTO apps
- [ ] **GOACTO Contribution Score** — Cross-app contribution metric
- [ ] **Internationalization (i18n)** — Multi-language support
- [ ] **Admin Dashboard** — Analytics, user management, moderation

## Technical Debt

- [x] **Migrate middleware to proxy** — Next.js 16 deprecated `middleware`
- [ ] **Add unit tests** — Vitest for API routes and utilities
- [ ] **Add E2E tests** — Playwright for critical user flows
- [x] **OpenGraph / SEO meta tags** — Dynamic OG metadata for shared conversions
- [ ] **API Rate Limiting** — Per-user rate limits beyond subscription caps
