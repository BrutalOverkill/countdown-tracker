# Countdown

A personal tracker: countdowns to the dates that matter, steps and workouts from Apple Health, a calorie log with intermittent-fasting windows, skincare and hair routines on a planner-style habit wheel, a daily score with streaks and challenges, and a Food Guard that closes food apps at the calorie target or outside the eating windows.

**Live:** https://brutaloverkill.github.io/countdown-tracker/ · **Design:** [spec](docs/superpowers/specs/2026-10-19-countdown-tracker-design.md) · **iPhone setup:** [Shortcut guide](docs/iphone-shortcut.md) · **Manual tests:** [iPhone checklist](docs/test-plan.md)

## Develop

- `npm start` — dev server at http://localhost:4300
- `npx ng test --watch=false` — unit + component tests
- `npm run test:functions` — shared helpers + Edge Function logic
- `npm run test:live` — setup, security, live function and Playwright end-to-end tests against the real Supabase project as the test user (needs `.env.local`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `E2E_EMAIL`, `E2E_PASSWORD`)

Pushing to `main` runs the unit/component/function tests and deploys to GitHub Pages. The live suite runs from **Actions → Live tests → Run workflow**.

## Backend (Supabase)

- Schema: `supabase/migrations/` (`npx supabase db push`)
- Functions: `npx supabase functions deploy sync --no-verify-jwt --use-api` and the same for `food-guard`
- The free project **pauses after 7 days without activity**; the nightly Shortcut keeps it awake. If it pauses: dashboard → project → Restore.
- Never commit a secret/service key. The URL and publishable key in `src/app/core/config.ts` are public by design; row-level security protects the data.
