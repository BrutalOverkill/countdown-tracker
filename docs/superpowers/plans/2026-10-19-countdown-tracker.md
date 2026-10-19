# Countdown Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Countdown", a single-user tracker PWA (website + iPhone home-screen app) with countdowns, a planner-style habit wheel, calorie log with intermittent-fasting eating windows, steps/workouts synced from Apple Health by an iPhone Shortcut, a game layer (score, Perfect Days, streak, challenges, report card), a Food Guard that closes food apps at the calorie target or outside the eating windows, and six layers of tests.

**Architecture:** An Angular 22 app (standalone components, signals, zoneless, Tailwind 4) hosted on GitHub Pages talks to Supabase (Postgres with owner-only RLS, email/password auth). Two Supabase Edge Functions (`sync`, `food-guard`) authenticate iPhone Shortcuts with a hashed personal token. All scoring/streak/challenge/fasting rules are pure TypeScript in `src/app/domain/`, computed from loaded history. Day and eating-window helpers live in `supabase/functions/_shared/` and are shared by the app (`@shared/*`) and the functions. The app's "day" runs 4:00 AM → 3:59 AM IST.

**Tech Stack:** Angular 22.2 (CLI 22.2.3) · TypeScript 6 · Tailwind CSS 4 · `@angular/service-worker` · `@supabase/supabase-js` 2 · Vitest 5 (Angular unit-test builder for `src/`, plain Vitest for `supabase/functions/`) · Playwright 1.64 (end-to-end) · Supabase CLI 2 (`npx supabase`) · Deno Edge Runtime · GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-10-19-countdown-tracker-design.md` (read it alongside this plan; § numbers below refer to it).

## Global Constraints

- Angular 22.2 / CLI 22.2.3, standalone components, signals, **zoneless** (no zone.js), `ChangeDetectionStrategy.OnPush` on every component, inline templates.
- TypeScript 6: no `baseUrl` in tsconfig (deprecated → build error); path alias `@shared/*` → `./supabase/functions/_shared/*`.
- Tailwind CSS 4 via `@tailwindcss/postcss`; tokens in `src/styles.css` `@theme`. Dark only: bg `#000`, card `#1C1C1E`, raised `#2C2C2E`, line `#3A3A3C`, muted `#8E8E93`, steps `#A3F53B`, kcal `#FF375F`, routine `#32D7FA`, countdown `#FFD60A`, weekly `#BF5AF2`, streak `#FF9F0A`.
- A "day" is a `YYYY-MM-DD` string. The **app day** of an instant is the IST calendar date of (instant − 4 h) — `appDayOf()`; food entries, workouts, ticks, "today" and countdowns use app days. Only `steps_daily.day` uses Apple Health's calendar days. All day/time maths uses `supabase/functions/_shared/days.ts` and `windows.ts` (`@shared/days`, `@shared/windows` in the app) — never the device timezone, never `new Date().getDate()`.
- Eating windows are `{ start: 'HH:MM', end: 'HH:MM' }` IST clock times, end exclusive, judged on the clock (not the app day). Defaults `00:00–01:00` and `11:00–13:00`.
- Supabase: project region Mumbai; tables, columns and checks exactly as spec §6; RLS owner-only on every table; new sign-ups disabled.
- Edge Functions deploy with `npx supabase functions deploy <name> --no-verify-jwt --use-api`. The service-role / secret key is never committed (only in Supabase function env and the git-ignored `.env.local`).
- Hosting: `https://brutaloverkill.github.io/countdown-tracker/` (`--base-href /countdown-tracker/`), deployed by `.github/workflows/deploy.yml` on push to `main`.
- Git: repo-local identity `Anvit Singh <55334046+BrutalOverkill@users.noreply.github.com>` (already set). Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push without switching the active gh account:
  ```bash
  T=$(gh auth token --user BrutalOverkill)
  git -c credential.helper= -c "credential.helper=!f() { echo username=BrutalOverkill; echo password=$T; }; f" push
  ```
- No `alert()` / `confirm()` / `prompt()` in the app: destructive actions use a "tap again to confirm" button.
- User-facing strings exactly as the spec writes them (e.g. `Token not recognised — copy it again from Settings`, `Left today: …`, `Offline — changes won't save`).
- Comments: one line, only where the why isn't obvious. No info-level logging; `console.error` only in Edge Function catch blocks.
- Tests: `npx ng test --watch=false` (unit + component, `src/`), `npm run test:functions` (shared + function logic), `npm run test:live` (Playwright end-to-end + live function + security; needs `.env.local`). CI runs the first two on every push.

## Review Focus

1. **Shortcut JSON quirks** — numbers arrive as strings or decimals (`"7842"`, `7842.0`), a one-item list arrives as a bare dictionary, `steps`/`workouts` are missing or `null` when Health has no samples → accept, coerce, round; never 400 on these. Pinned in Task 7 (`logic.test.ts`) and Task 15 (`live-functions.mjs`).
2. **Clock edges** — 3:59 AM vs 4:00 AM IST (app day), 23:59 vs 00:00 (calendar day for steps; the phone may be a few seconds ahead → 15-minute tolerance), a window's end minute (exclusive) → each lands on the right side. Pinned in Task 2, Task 7, Task 8 (`clock.spec.ts`: the app left open overnight rolls at 4 AM) and Task 15 (Playwright with the app clock pinned to 3:59 / 4:00 AM).
3. **Duplicate keys in one sync** — the same date twice in `steps`, or the same workout `start` twice → de-duplicated before the upsert so Postgres doesn't reject the whole batch ("cannot affect row a second time"). Pinned in Task 7.
4. **Rapid double-tap on a routine tick** — two toggles in flight must leave the server in the same state as the screen → writes are serialised per habit+day. Pinned in Task 9 (`tracker.store.spec.ts`).
5. **Empty states** — a brand-new account (zero habits), no eating windows, or a countdown created on its own date → score 0 (never `NaN`), streak 0, freeze available, no fasting card, report "Nothing to report — this countdown started today". Pinned in Tasks 2, 3, 4, 5.

---

## File structure

```
countdown-tracker/
  .github/workflows/deploy.yml          CI: test + build + deploy to Pages
  angular.json, package.json, tsconfig*.json, .postcssrc.json, ngsw-config.json
  vitest.functions.config.ts            plain Vitest for supabase/functions/**
  public/manifest.webmanifest, public/icons/*.png
  .github/workflows/live-tests.yml      manual: Playwright + live function + security tests
  playwright.config.ts
  e2e/                                  Playwright specs + helpers (test-user reset, pinned clock)
  scripts/icon.svg, scripts/make-icons.ps1   app icon source + renderer
  scripts/live/env.mjs                  loads .env.local, signs in the test user, resets its data
  scripts/live/security-check.mjs       RLS proof (test user + anon)
  scripts/live/functions-check.mjs      live sync + food-guard checks
  docs/iphone-shortcut.md               step-by-step Shortcut + Food Guard setup
  docs/test-plan.md                     iPhone manual test checklist
  supabase/
    config.toml                         from `supabase init`
    migrations/20261019000000_init.sql  schema, RLS, grants, ensure_setup(), rotate_sync_token()
    functions/_shared/days.ts           IST + app-day helpers (shared with the app)
    functions/_shared/windows.ts        eating-window helpers (shared with the app)
    functions/_shared/token.ts          sha256Hex, bearerToken
    functions/_shared/http.ts           json(), adminClient(), userForRequest() (Deno-only)
    functions/sync/logic.ts             validatePayload, pendingFor, messageFor
    functions/sync/index.ts             HTTP handler
    functions/food-guard/logic.ts       guardResult
    functions/food-guard/index.ts       HTTP handler
  src/
    index.html, main.ts, styles.css
    app/
      app.ts, app.config.ts, app.routes.ts
      core/   config.ts supabase.ts auth.service.ts auth.guard.ts clock.ts online.ts toast.service.ts format.ts storage.ts
      domain/ types.ts testing.ts visibility.ts scoring.ts streaks.ts challenges.ts report.ts palette.ts
      data/   rows.ts history.ts select-all.ts tracker-api.ts tracker.store.ts
      features/
        shell/    shell.ts tab-bar.ts toast.ts perfect-day.ts
        login/    login.page.ts
        today/    today.page.ts today.vm.ts score-card.ts countdowns-card.ts fasting-card.ts rings-card.ts
                  workout-card.ts routines-card.ts challenges-card.ts
        habits/   habits.page.ts month-matrix.ts wheel-geometry.ts habit-wheel.ts habit-grid.ts
                  weekly-card.ts tasks-card.ts
        food/     food.page.ts food-day.ts
        settings/ settings.page.ts settings-forms.ts countdowns-section.ts habits-section.ts targets-section.ts
                  fasting-section.ts shortcut-section.ts
        report/   report.page.ts report-view.ts
```

Pure logic (`domain/`, `data/history.ts`, `*.vm.ts`, `month-matrix.ts`, `wheel-geometry.ts`, `food-day.ts`, `core/format.ts`, `functions/**/logic.ts`, `_shared/*.ts` except `http.ts`) gets unit tests. Each presentational component gets a component test (`*.spec.ts` beside it) that feeds it a view model and asserts on the DOM and emitted outputs. Whole flows are covered by Playwright in Task 15.

**Task order:** 0 (Anvit, phone) · 1 scaffold · 2 shared helpers · 3–5 domain · 6 Supabase (needs Anvit) · 7 functions · 8 core + shell · 9 data · 10 Today · 11 Habits · 12 Food · 13 Settings · 14 Report · 15 live test harness · 16 docs, iPhone checklist, final verification.

---

### Task 0: Phone check (Anvit, ~2 minutes, any time before Task 16)

This is a manual check on the iPhone; no code. Its answer decides whether the Shortcut sends workouts (spec §9).

- [ ] **Step 1:** In **Strong** → Settings (gear) → **Apple Health** → make sure saving workouts to Apple Health is ON.
- [ ] **Step 2:** In **Shortcuts** → **+** (new shortcut) → add action **Find Health Samples** → tap **Type** and note whether **Workouts** is in the list. If it is, set Type = Workouts, Start Date = in the last 7 days, tap ▶︎ and note whether your Strong workouts appear.
- [ ] **Step 3:** Change Type to **Steps**, Start Date = in the last 7 days, and tap **Show More**: note whether **Group By** offers **Day**. Run it and compare one day's value with the Health app's step count for that day.
- [ ] **Step 4:** Tell Claude the three answers: Workouts listed? Strong workouts visible? Grouped steps match Health? Delete the test shortcut.

If Workouts isn't readable, Task 16's Shortcut doc drops the workouts steps of the Countdown Sync outline and the app's "Trained today ✓" button covers workouts. Nothing else changes.

---

### Task 1: Scaffold, theme, PWA, icons and auto-deploy

**Files:**
- Create (generated): `angular.json`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`, `.postcssrc.json`, `.editorconfig`, `.prettierrc`, `.vscode/*`, `src/main.ts`, `src/app/app.config.ts`, `src/app/app.routes.ts`, `ngsw-config.json`, `public/manifest.webmanifest`, `public/icons/*`
- Create: `vitest.functions.config.ts`, `scripts/icon.svg`, `scripts/make-icons.ps1`, `.github/workflows/deploy.yml`
- Modify: `.gitignore`, `src/styles.css`, `src/index.html`, `src/app/app.ts`, `src/app/app.spec.ts`
- Delete: `src/app/app.html`, `src/app/app.css`, `public/favicon.ico`

**Interfaces:**
- Produces: npm scripts `test:functions`; path alias `@shared/*`; CSS component classes `.card .label .muted .field .btn .btn-quiet`; Tailwind colour utilities `bg-card bg-raised border-line text-muted text-steps text-kcal text-routine text-count text-weekly text-streak` (and `bg-*` of the same).

- [ ] **Step 1: Generate the workspace beside the repo and move it in**

```bash
cd /c/Users/AnvitSingh
npx -y @angular/cli@22.2.3 new countdown-tracker --directory countdown-tracker-scaffold --skip-git --skip-install --style=tailwind --ssr=false --routing --zoneless --ai-config=none --defaults --interactive=false
cat countdown-tracker-scaffold/.gitignore >> countdown-tracker/.gitignore
rm countdown-tracker-scaffold/README.md countdown-tracker-scaffold/.gitignore
cp -r countdown-tracker-scaffold/. countdown-tracker/
rm -rf countdown-tracker-scaffold
cd countdown-tracker
npm install
```

Expected: `added N packages`; `angular.json` has project `countdown-tracker`; `package.json` lists `tailwindcss`, `@tailwindcss/postcss`, `vitest`; no `zone.js`.

- [ ] **Step 2: Add the service worker and Supabase client**

```bash
npx ng add @angular/pwa --skip-confirmation
npm install @supabase/supabase-js@2.118.0
rm public/favicon.ico src/app/app.html src/app/app.css
```

Expected: `ngsw-config.json`, `public/manifest.webmanifest`, `public/icons/icon-*.png` created; `src/app/app.config.ts` now calls `provideServiceWorker('ngsw-worker.js', …)`.

- [ ] **Step 3: Add the shared-code alias and the functions test runner**

In `tsconfig.json`, inside `"compilerOptions"`, add after `"module": "preserve"`:

```json
    "module": "preserve",
    "paths": { "@shared/*": ["./supabase/functions/_shared/*"] }
```

Create `vitest.functions.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['supabase/functions/**/*.test.ts'] },
});
```

In `package.json` `"scripts"`, add:

```json
    "test:functions": "vitest run --config vitest.functions.config.ts --passWithNoTests",
```

- [ ] **Step 4: Theme tokens and shared component classes**

Replace `src/styles.css` with:

```css
@import 'tailwindcss';

@theme {
  --font-sans: -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, system-ui, sans-serif;
  --color-bg: #000000;
  --color-card: #1c1c1e;
  --color-raised: #2c2c2e;
  --color-line: #3a3a3c;
  --color-muted: #8e8e93;
  --color-steps: #a3f53b;
  --color-kcal: #ff375f;
  --color-routine: #32d7fa;
  --color-count: #ffd60a;
  --color-weekly: #bf5af2;
  --color-streak: #ff9f0a;
}

html {
  background: var(--color-bg);
  color: #fff;
  color-scheme: dark;
}

body {
  margin: 0;
  min-height: 100dvh;
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}

@layer components {
  .card { @apply rounded-2xl bg-card p-3; }
  .label { @apply text-[10px] font-bold uppercase tracking-wider; }
  .muted { @apply text-xs text-muted; }
  .field { @apply w-full rounded-lg bg-raised px-3 py-2 text-sm text-white outline-none placeholder:text-muted focus:ring-2 focus:ring-routine; }
  .btn { @apply rounded-lg bg-steps px-3 py-2 text-sm font-extrabold text-black disabled:opacity-40; }
  .btn-quiet { @apply rounded-lg bg-raised px-3 py-2 text-sm font-semibold text-white disabled:opacity-40; }
}
```

- [ ] **Step 5: iOS-ready `index.html`**

Replace `src/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Countdown</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Countdown">
  <link rel="icon" type="image/png" href="icons/icon-96x96.png">
  <link rel="apple-touch-icon" href="icons/icon-180x180.png">
  <link rel="manifest" href="manifest.webmanifest">
</head>
<body>
  <app-root></app-root>
  <noscript>Please enable JavaScript to use Countdown.</noscript>
</body>
</html>
```

- [ ] **Step 6: App icon (three rings, like the Today screen)**

Create `scripts/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#000"/>
  <g fill="none" stroke-width="40" stroke-linecap="round" transform="rotate(-90 256 256)">
    <circle cx="256" cy="256" r="180" stroke="#2a3a1a"/>
    <circle cx="256" cy="256" r="180" stroke="#a3f53b" stroke-dasharray="905 1131"/>
    <circle cx="256" cy="256" r="126" stroke="#3a1a22"/>
    <circle cx="256" cy="256" r="126" stroke="#ff375f" stroke-dasharray="594 792"/>
    <circle cx="256" cy="256" r="72" stroke="#10303a"/>
    <circle cx="256" cy="256" r="72" stroke="#32d7fa" stroke-dasharray="271 452"/>
  </g>
</svg>
```

Create `scripts/make-icons.ps1`:

```powershell
# Renders scripts/icon.svg to public/icons/icon-NxN.png using headless Edge + System.Drawing.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$svg = Get-Content (Join-Path $PSScriptRoot 'icon.svg') -Raw
$html = Join-Path $env:TEMP 'countdown-icon.html'
"<html><body style='margin:0;background:#000'>$svg</body></html>" | Set-Content $html -Encoding utf8
$big = Join-Path $env:TEMP 'countdown-icon-512.png'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
Start-Process -FilePath $edge -Wait -ArgumentList '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=512,512', "--screenshot=$big", $html
$src = [System.Drawing.Image]::FromFile($big)
foreach ($size in 72, 96, 128, 144, 152, 180, 192, 384, 512) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, 0, 0, $size, $size)
  $bmp.Save((Join-Path $root "public\icons\icon-${size}x${size}.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
$src.Dispose()
```

Run (PowerShell): `powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1`
Expected: `public/icons/icon-180x180.png` exists; opening `icon-512x512.png` shows three rings on black.

- [ ] **Step 7: Manifest**

Replace `public/manifest.webmanifest` with:

```json
{
  "name": "Countdown",
  "short_name": "Countdown",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#000000",
  "background_color": "#000000",
  "scope": "./",
  "start_url": "./",
  "icons": [
    { "src": "icons/icon-72x72.png", "sizes": "72x72", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-96x96.png", "sizes": "96x96", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-128x128.png", "sizes": "128x128", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-144x144.png", "sizes": "144x144", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-152x152.png", "sizes": "152x152", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-384x384.png", "sizes": "384x384", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable any" }
  ]
}
```

- [ ] **Step 8: Write the failing placeholder test**

Replace `src/app/app.spec.ts` with:

```ts
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  it('shows the app name', async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Countdown');
  });
});
```

Run: `npx ng test --watch=false`
Expected: FAIL — `app.ts` still points at the deleted `app.html` (build error) or doesn't contain "Countdown".

- [ ] **Step 9: Placeholder root component**

Replace `src/app/app.ts` with:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="grid min-h-dvh place-items-center text-center">
      <div>
        <h1 class="text-3xl font-black">Countdown</h1>
        <p class="muted">Setting up…</p>
      </div>
    </main>
  `,
})
export class App {}
```

Run: `npx ng test --watch=false` → Expected: PASS (1 test).
Run: `npm run test:functions` → Expected: exits 0 ("No test files found").
Run: `npx ng build --base-href /countdown-tracker/` → Expected: `Application bundle generation complete`, output `dist/countdown-tracker/browser` containing `ngsw.json` and `manifest.webmanifest`.

- [ ] **Step 10: Deploy workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx ng test --watch=false
      - run: npm run test:functions
      - run: npx ng build --base-href /countdown-tracker/
      # GitHub Pages serves 404.html for unknown paths, which lets the Angular router handle deep links.
      - run: cp dist/countdown-tracker/browser/index.html dist/countdown-tracker/browser/404.html
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist/countdown-tracker/browser

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 11: Commit, enable Pages, push, verify the live placeholder**

```bash
git add -A
git commit -m "Scaffold Angular PWA with theme, icons and Pages deploy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
T=$(gh auth token --user BrutalOverkill)
GH_TOKEN="$T" gh api -X POST repos/BrutalOverkill/countdown-tracker/pages -f build_type=workflow
git -c credential.helper= -c "credential.helper=!f() { echo username=BrutalOverkill; echo password=$T; }; f" push
GH_TOKEN="$T" gh run watch -R BrutalOverkill/countdown-tracker --exit-status $(GH_TOKEN="$T" gh run list -R BrutalOverkill/countdown-tracker -L 1 --json databaseId --jq '.[0].databaseId')
curl -s -o /dev/null -w "%{http_code}\n" https://brutaloverkill.github.io/countdown-tracker/
curl -s https://brutaloverkill.github.io/countdown-tracker/manifest.webmanifest | grep '"name"'
```

Expected: run succeeds; `200`; `"name": "Countdown",`.

---

### Task 2: Shared helpers — days, eating windows, token

**Files:**
- Create: `supabase/functions/_shared/days.ts`, `supabase/functions/_shared/days.test.ts`
- Create: `supabase/functions/_shared/windows.ts`, `supabase/functions/_shared/windows.test.ts`
- Create: `supabase/functions/_shared/token.ts`, `supabase/functions/_shared/token.test.ts`

**Interfaces:**
- Produces (`days.ts`): `type Day = string`; `DAY_START_HOUR = 4`; `istDayOf(instant: Date): Day` (calendar); `appDayOf(instant: Date): Day`; `appToday(now?: Date): Day`; `istMinutesOf(instant: Date): number` (0–1439); `instantFor(appDay: Day, hhmm: string): Date`; `isValidDay(value: unknown): value is Day`; `addDays(day, n): Day`; `daysBetween(from, to): number`; `eachDay(from, to): Day[]`; `weekdayOf(day): number` (0 = Sun); `isoWeekStart(day): Day` (Monday); `monthStart(day): Day`; `monthEnd(day): Day`; `addMonths(day, n): Day` (a 1st of month); `weekBlock(day): number` (1–5); `weekBlockRange(day): { start: Day; end: Day }`.
- Produces (`windows.ts`): `interface EatingWindow { start: string; end: string }`; `DEFAULT_WINDOWS`; `toMinutes(hhmm): number`; `formatClock(minutes): string` (`'11:00 AM'`); `sortWindows(ws): EatingWindow[]`; `windowAt(minute, ws): EatingWindow | null`; `inWindow(minute, ws): boolean`; `nextStartAfter(minute, ws): number` (may be ≥ 1440 = tomorrow); `type FastState`; `fastState(minute, ws): FastState | null`; `validateWindows(ws): string | null`.
- Produces (`token.ts`): `sha256Hex(text): Promise<string>`; `bearerToken(header: string | null): string | null`.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/days.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, appDayOf, appToday, daysBetween, eachDay, instantFor, isValidDay, isoWeekStart,
  istDayOf, istMinutesOf, monthEnd, monthStart, weekBlock, weekBlockRange, weekdayOf,
} from './days.ts';

describe('calendar and app days', () => {
  it('rolls the IST calendar day at 18:30 UTC (midnight IST)', () => {
    expect(istDayOf(new Date('2026-10-19T18:29:59Z'))).toBe('2026-10-19');
    expect(istDayOf(new Date('2026-10-19T18:30:00Z'))).toBe('2026-10-20');
  });

  it('rolls the app day at 4:00 AM IST (22:30 UTC)', () => {
    expect(appDayOf(new Date('2026-10-19T22:29:59Z'))).toBe('2026-10-19'); // 03:59:59 IST on the 20th
    expect(appDayOf(new Date('2026-10-19T22:30:00Z'))).toBe('2026-10-20'); // 04:00 IST
    expect(appToday(new Date('2026-10-19T19:00:00Z'))).toBe('2026-10-19'); // 00:30 IST: still the 19th
  });

  it('reads IST clock minutes', () => {
    expect(istMinutesOf(new Date('2026-10-19T18:30:00Z'))).toBe(0);
    expect(istMinutesOf(new Date('2026-10-19T05:30:00Z'))).toBe(660);
    expect(istMinutesOf(new Date('2026-10-19T18:29:00Z'))).toBe(1439);
  });

  it('turns an app day + clock time into an instant (early hours = next calendar date)', () => {
    expect(instantFor('2026-10-19', '12:15').toISOString()).toBe('2026-10-19T06:45:00.000Z');
    expect(instantFor('2026-10-19', '00:30').toISOString()).toBe('2026-10-19T19:00:00.000Z');
    expect(instantFor('2026-10-19', '03:59').toISOString()).toBe('2026-10-19T22:29:00.000Z');
    expect(instantFor('2026-10-19', '04:00').toISOString()).toBe('2026-10-18T22:30:00.000Z');
  });

  it('validates yyyy-MM-dd strings', () => {
    expect(isValidDay('2026-10-19')).toBe(true);
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('2026-1-9')).toBe(false);
    expect(isValidDay(20261019)).toBe(false);
  });

  it('adds and diffs days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(daysBetween('2026-10-19', '2026-11-08')).toBe(20);
    expect(daysBetween('2026-10-19', '2026-12-10')).toBe(52);
    expect(daysBetween('2026-11-08', '2026-10-19')).toBe(-20);
  });

  it('lists days inclusively', () => {
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(eachDay('2026-10-02', '2026-10-01')).toEqual([]);
  });

  it('knows weekdays and Monday week starts', () => {
    expect(weekdayOf('2026-10-18')).toBe(0);
    expect(weekdayOf('2026-11-08')).toBe(0);
    expect(weekdayOf('2026-10-19')).toBe(1);
    expect(isoWeekStart('2026-10-18')).toBe('2026-10-12');
    expect(isoWeekStart('2026-10-19')).toBe('2026-10-19');
  });

  it('finds month bounds and steps months', () => {
    expect(monthStart('2026-10-19')).toBe('2026-10-01');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(monthEnd('2026-10-05')).toBe('2026-10-31');
    expect(addMonths('2026-10-19', 1)).toBe('2026-11-01');
    expect(addMonths('2026-10-19', -1)).toBe('2026-09-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
  });

  it('splits a month into planner week blocks', () => {
    expect(weekBlock('2026-10-07')).toBe(1);
    expect(weekBlock('2026-10-08')).toBe(2);
    expect(weekBlock('2026-10-28')).toBe(4);
    expect(weekBlock('2026-10-29')).toBe(5);
    expect(weekBlock('2026-10-31')).toBe(5);
    expect(weekBlockRange('2026-10-19')).toEqual({ start: '2026-10-15', end: '2026-10-21' });
    expect(weekBlockRange('2026-10-30')).toEqual({ start: '2026-10-29', end: '2026-10-31' });
    expect(weekBlockRange('2026-02-28')).toEqual({ start: '2026-02-22', end: '2026-02-28' });
  });
});
```

Create `supabase/functions/_shared/windows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOWS, fastState, formatClock, inWindow, nextStartAfter, validateWindows, windowAt } from './windows.ts';

const W = DEFAULT_WINDOWS; // 00:00–01:00 and 11:00–13:00

describe('eating windows', () => {
  it('treats start as inside and end as outside', () => {
    expect(inWindow(0, W)).toBe(true);
    expect(inWindow(59, W)).toBe(true);
    expect(inWindow(60, W)).toBe(false);
    expect(inWindow(660, W)).toBe(true);
    expect(inWindow(779, W)).toBe(true);
    expect(inWindow(780, W)).toBe(false);
    expect(windowAt(700, W)).toEqual({ start: '11:00', end: '13:00' });
    expect(inWindow(700, [])).toBe(false);
  });

  it('formats clock minutes as h:mm AM/PM', () => {
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(660)).toBe('11:00 AM');
    expect(formatClock(720)).toBe('12:00 PM');
    expect(formatClock(780)).toBe('1:00 PM');
    expect(formatClock(1439)).toBe('11:59 PM');
    expect(formatClock(1440)).toBe('12:00 AM');
  });

  it('finds the next window start, wrapping to tomorrow', () => {
    expect(nextStartAfter(120, W)).toBe(660);
    expect(nextStartAfter(0, W)).toBe(660);
    expect(nextStartAfter(700, W)).toBe(1440);
  });

  it('describes an open window', () => {
    expect(fastState(690, W)).toEqual({ kind: 'open', window: { start: '11:00', end: '13:00' }, minutesLeft: 90, fraction: 0.25 });
  });

  it('describes the afternoon fast (1 PM → midnight)', () => {
    expect(fastState(840, W)).toEqual({ kind: 'fasting', nextStart: 0, minutesUntilNext: 600, fastMinutes: 660, doneMinutes: 60, fraction: 60 / 660 });
  });

  it('describes the early-morning fast (1 AM → 11 AM)', () => {
    expect(fastState(120, W)).toEqual({ kind: 'fasting', nextStart: 660, minutesUntilNext: 540, fastMinutes: 600, doneMinutes: 60, fraction: 0.1 });
  });

  it('has no state without windows', () => {
    expect(fastState(600, [])).toBeNull();
  });

  it('validates windows', () => {
    expect(validateWindows(W)).toBeNull();
    expect(validateWindows([])).toBe('Add 1 to 3 eating windows');
    expect(validateWindows([...W, { start: '15:00', end: '16:00' }, { start: '18:00', end: '19:00' }])).toBe('Add 1 to 3 eating windows');
    expect(validateWindows([{ start: '9:00', end: '10:00' }])).toBe('Use 24-hour times like 11:00');
    expect(validateWindows([{ start: '13:00', end: '11:00' }])).toBe('A window must end after it starts, on the same day');
    expect(validateWindows([{ start: '11:00', end: '13:00' }, { start: '12:30', end: '14:00' }])).toBe("Windows can't overlap");
    expect(validateWindows([{ start: '11:00', end: '13:00' }, { start: '13:00', end: '14:00' }])).toBeNull();
  });
});
```

Create `supabase/functions/_shared/token.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bearerToken, sha256Hex } from './token.ts';

describe('token helpers', () => {
  it("hashes like Postgres encode(sha256(convert_to(t, 'UTF8')), 'hex')", async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('reads a bearer token', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123');
    expect(bearerToken('bearer   abc123  ')).toBe('abc123');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:functions`
Expected: FAIL — `Failed to resolve import "./days.ts"` (and `./windows.ts`, `./token.ts`).

- [ ] **Step 3: Implement `days.ts`**

Create `supabase/functions/_shared/days.ts`:

```ts
/**
 * Day helpers shared by the web app (`@shared/days`) and the Edge Functions.
 * A Day is a 'YYYY-MM-DD' string. Calendar days are IST (UTC+5:30, no daylight saving);
 * the app's day starts at 4:00 AM IST so late nights count as the previous day.
 */
export type Day = string;

export const DAY_START_HOUR = 4;

const IST_OFFSET_MS = 330 * 60_000;
const DAY_START_MS = DAY_START_HOUR * 3_600_000;
const DAY_MS = 86_400_000;

function toUtc(day: Day): number {
  return Date.parse(day + 'T00:00:00Z');
}

function fromUtc(ms: number): Day {
  return new Date(ms).toISOString().slice(0, 10);
}

export function istDayOf(instant: Date): Day {
  return fromUtc(instant.getTime() + IST_OFFSET_MS);
}

export function appDayOf(instant: Date): Day {
  return fromUtc(instant.getTime() + IST_OFFSET_MS - DAY_START_MS);
}

export function appToday(now: Date = new Date()): Day {
  return appDayOf(now);
}

export function istMinutesOf(instant: Date): number {
  return Math.floor(((instant.getTime() + IST_OFFSET_MS) % DAY_MS) / 60_000);
}

export function instantFor(appDay: Day, hhmm: string): Date {
  const calendarDay = Number(hhmm.slice(0, 2)) < DAY_START_HOUR ? addDays(appDay, 1) : appDay;
  return new Date(Date.parse(`${calendarDay}T${hhmm}:00+05:30`));
}

export function isValidDay(value: unknown): value is Day {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = toUtc(value);
  return !Number.isNaN(t) && fromUtc(t) === value;
}

export function addDays(day: Day, n: number): Day {
  return fromUtc(toUtc(day) + n * DAY_MS);
}

export function daysBetween(from: Day, to: Day): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function eachDay(from: Day, to: Day): Day[] {
  const out: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function weekdayOf(day: Day): number {
  return new Date(toUtc(day)).getUTCDay();
}

export function isoWeekStart(day: Day): Day {
  const wd = weekdayOf(day);
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

export function monthStart(day: Day): Day {
  return day.slice(0, 8) + '01';
}

export function addMonths(day: Day, n: number): Day {
  const d = new Date(toUtc(monthStart(day)));
  d.setUTCMonth(d.getUTCMonth() + n);
  return fromUtc(d.getTime());
}

export function monthEnd(day: Day): Day {
  return addDays(addMonths(day, 1), -1);
}

/** Planner week block: days 1–7 → 1, 8–14 → 2, 15–21 → 3, 22–28 → 4, 29–end → 5. */
export function weekBlock(day: Day): number {
  return Math.min(5, Math.ceil(Number(day.slice(8, 10)) / 7));
}

export function weekBlockRange(day: Day): { start: Day; end: Day } {
  const block = weekBlock(day);
  const start = addDays(monthStart(day), (block - 1) * 7);
  return { start, end: block === 5 ? monthEnd(day) : addDays(start, 6) };
}
```

- [ ] **Step 4: Implement `windows.ts`**

Create `supabase/functions/_shared/windows.ts`:

```ts
/** An eating window in IST clock time, 'HH:MM' 24-hour; `end` is exclusive. */
export interface EatingWindow {
  start: string;
  end: string;
}

export const DEFAULT_WINDOWS: readonly EatingWindow[] = [
  { start: '00:00', end: '01:00' },
  { start: '11:00', end: '13:00' },
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MIN = 1440;

export function toMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

export function formatClock(minutes: number): string {
  const m = ((minutes % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function sortWindows(windows: readonly EatingWindow[]): EatingWindow[] {
  return [...windows].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

export function windowAt(minute: number, windows: readonly EatingWindow[]): EatingWindow | null {
  return windows.find((w) => minute >= toMinutes(w.start) && minute < toMinutes(w.end)) ?? null;
}

export function inWindow(minute: number, windows: readonly EatingWindow[]): boolean {
  return windowAt(minute, windows) !== null;
}

/** Minutes from today's midnight to the next window start; ≥ 1440 means tomorrow. */
export function nextStartAfter(minute: number, windows: readonly EatingWindow[]): number {
  const sorted = sortWindows(windows);
  const next = sorted.find((w) => toMinutes(w.start) > minute);
  return next ? toMinutes(next.start) : toMinutes(sorted[0].start) + DAY_MIN;
}

export type FastState =
  | { kind: 'open'; window: EatingWindow; minutesLeft: number; fraction: number }
  | { kind: 'fasting'; nextStart: number; minutesUntilNext: number; fastMinutes: number; doneMinutes: number; fraction: number };

export function fastState(minute: number, windows: readonly EatingWindow[]): FastState | null {
  if (windows.length === 0) return null;
  const open = windowAt(minute, windows);
  if (open) {
    const start = toMinutes(open.start);
    const end = toMinutes(open.end);
    return { kind: 'open', window: open, minutesLeft: end - minute, fraction: (minute - start) / (end - start) };
  }
  const sorted = sortWindows(windows);
  const nextAbs = nextStartAfter(minute, sorted);
  const prev = [...sorted].reverse().find((w) => toMinutes(w.end) <= minute);
  const prevAbs = prev ? toMinutes(prev.end) : toMinutes(sorted[sorted.length - 1].end) - DAY_MIN;
  const fastMinutes = nextAbs - prevAbs;
  const doneMinutes = minute - prevAbs;
  return { kind: 'fasting', nextStart: nextAbs % DAY_MIN, minutesUntilNext: nextAbs - minute, fastMinutes, doneMinutes, fraction: doneMinutes / fastMinutes };
}

export function validateWindows(windows: readonly EatingWindow[]): string | null {
  if (windows.length < 1 || windows.length > 3) return 'Add 1 to 3 eating windows';
  if (windows.some((w) => !HHMM.test(w.start) || !HHMM.test(w.end))) return 'Use 24-hour times like 11:00';
  if (windows.some((w) => toMinutes(w.start) >= toMinutes(w.end))) return 'A window must end after it starts, on the same day';
  const sorted = sortWindows(windows);
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) return "Windows can't overlap";
  }
  return null;
}
```

- [ ] **Step 5: Implement `token.ts`**

Create `supabase/functions/_shared/token.ts`:

```ts
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec((header ?? '').trim());
  return match ? match[1] : null;
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm run test:functions`
Expected: PASS — 3 files, 20 tests.

- [ ] **Step 7: Prove the app can import the shared code**

Run: `npx ng build` → Expected: success (nothing imports `@shared/*` yet; this just confirms the tsconfig `paths` entry is valid under TypeScript 6).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared
git commit -m "Add shared day, eating-window and token helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Domain types, visibility and scoring

**Files:**
- Create: `src/app/domain/types.ts`, `src/app/domain/testing.ts`, `src/app/domain/palette.ts`
- Create: `src/app/domain/visibility.ts`, `src/app/domain/visibility.spec.ts`
- Create: `src/app/domain/scoring.ts`, `src/app/domain/scoring.spec.ts`

**Interfaces:**
- Consumes: `@shared/days` (`Day`, `monthStart`, `monthEnd`), `@shared/windows` (`EatingWindow`, `DEFAULT_WINDOWS`, `inWindow`).
- Produces (`types.ts`): `Frequency`, `HabitSource` (`'manual'|'steps'|'calories'|'workout'|'fasting'`), `Slot`, `Mode` (`'final'|'live'`), `Habit { id, name, emoji, color, frequency, source, slot, weekday: number|null, sortOrder, createdDay: Day, archivedDay: Day|null }`, `Countdown { id, title, emoji, targetDate: Day, createdDay: Day }`, `Challenge { id, countdownId, habitId, targetDays, startDay: Day }`, `Goals { stepGoal, kcalGoal, fastingEnabled, windows: readonly EatingWindow[] }`, `Workout { id, startedAt: string, day: Day, durationMin: number|null, name: string|null, source: 'health'|'manual' }`, `FoodDay { kcal, protein, entries, minutes: readonly number[] }`, `History { checks: ReadonlyMap<string, ReadonlySet<Day>>, steps: ReadonlyMap<Day, number>, workouts: ReadonlyMap<Day, readonly Workout[]>, food: ReadonlyMap<Day, FoodDay> }`, `Ctx { history, goals, today: Day }`, `EMPTY_HISTORY`, `DEFAULT_GOALS`; re-exports `Day`, `EatingWindow`.
- Produces (`testing.ts`, specs only): `habit(id, extra?)`, `history(spec?)`, `ctx(today, history?, goals?)`.
- Produces (`palette.ts`): `HABIT_PALETTE: readonly string[]`, `nextColor(used: readonly string[]): string`.
- Produces (`visibility.ts`): `bySortOrder(a, b)`, `isActiveOn(h, day)`, `dailyHabitsOn(habits, day)`, `habitsForMonth(habits, month)`, `firstHabitDay(habits): Day | null`.
- Produces (`scoring.ts`): `onCalorieTarget(day, ctx)`, `keptWindows(day, ctx)`, `trainedOn(day, ctx)`, `habitDone(h, day, ctx, mode = 'final')`, `DayScore { done, total, score }`, `dayScore(habits, day, ctx)`, `isPerfect(s)`, `isGood(s)`.

- [ ] **Step 1: Types, palette and test helpers (no behaviour yet)**

Create `src/app/domain/types.ts`:

```ts
import type { Day } from '@shared/days';
import { DEFAULT_WINDOWS, type EatingWindow } from '@shared/windows';

export type { Day, EatingWindow };

export type Frequency = 'daily' | 'weekly';
export type HabitSource = 'manual' | 'steps' | 'calories' | 'workout' | 'fasting';
export type Slot = 'morning' | 'night' | 'anytime';
/** 'final' judges a day as finished; 'live' lets today's calories/fasting count while on track. */
export type Mode = 'final' | 'live';

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  frequency: Frequency;
  source: HabitSource;
  slot: Slot;
  weekday: number | null;
  sortOrder: number;
  createdDay: Day;
  archivedDay: Day | null;
}

export interface Countdown {
  id: string;
  title: string;
  emoji: string;
  targetDate: Day;
  createdDay: Day;
}

export interface Challenge {
  id: string;
  countdownId: string;
  habitId: string;
  targetDays: number;
  startDay: Day;
}

export interface Goals {
  stepGoal: number;
  kcalGoal: number;
  fastingEnabled: boolean;
  windows: readonly EatingWindow[];
}

export interface Workout {
  id: string;
  startedAt: string;
  day: Day;
  durationMin: number | null;
  name: string | null;
  source: 'health' | 'manual';
}

export interface FoodDay {
  kcal: number;
  protein: number;
  entries: number;
  /** IST clock minute of each entry. */
  minutes: readonly number[];
}

export interface History {
  checks: ReadonlyMap<string, ReadonlySet<Day>>;
  steps: ReadonlyMap<Day, number>;
  workouts: ReadonlyMap<Day, readonly Workout[]>;
  food: ReadonlyMap<Day, FoodDay>;
}

export interface Ctx {
  history: History;
  goals: Goals;
  today: Day;
}

export const EMPTY_HISTORY: History = { checks: new Map(), steps: new Map(), workouts: new Map(), food: new Map() };

export const DEFAULT_GOALS: Goals = { stepGoal: 10_000, kcalGoal: 2_000, fastingEnabled: true, windows: DEFAULT_WINDOWS };
```

Create `src/app/domain/palette.ts`:

```ts
export const HABIT_PALETTE: readonly string[] = [
  '#FF453A', '#FF9F0A', '#FFD60A', '#A3F53B', '#30D158', '#00C7BE',
  '#32D7FA', '#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#AC8E68',
];

export function nextColor(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toUpperCase()));
  return HABIT_PALETTE.find((c) => !taken.has(c)) ?? HABIT_PALETTE[used.length % HABIT_PALETTE.length];
}
```

Create `src/app/domain/testing.ts`:

```ts
import { DEFAULT_GOALS, EMPTY_HISTORY, type Ctx, type Day, type Goals, type Habit, type History, type Workout } from './types';

export function habit(id: string, extra: Partial<Habit> = {}): Habit {
  return {
    id, name: id, emoji: '✅', color: '#FFFFFF', frequency: 'daily', source: 'manual', slot: 'anytime',
    weekday: null, sortOrder: 0, createdDay: '2026-10-01', archivedDay: null, ...extra,
  };
}

export interface HistorySpec {
  checks?: Record<string, Day[]>;
  steps?: Record<Day, number>;
  workouts?: Day[];
  /** minutes defaults to [720] (12:00, inside the 11–13 window). */
  food?: Record<Day, { kcal: number; protein?: number; minutes?: number[] }>;
}

export function history(spec: HistorySpec = {}): History {
  const workout = (day: Day): Workout => ({ id: `w-${day}`, startedAt: `${day}T12:00:00.000Z`, day, durationMin: 45, name: 'Strength', source: 'health' });
  return {
    checks: new Map(Object.entries(spec.checks ?? {}).map(([id, days]) => [id, new Set(days)])),
    steps: new Map(Object.entries(spec.steps ?? {})),
    workouts: new Map((spec.workouts ?? []).map((d) => [d, [workout(d)]])),
    food: new Map(Object.entries(spec.food ?? {}).map(([d, f]) => {
      const minutes = f.minutes ?? [720];
      return [d, { kcal: f.kcal, protein: f.protein ?? 0, entries: minutes.length, minutes }];
    })),
  };
}

export function ctx(today: Day, h: History = EMPTY_HISTORY, goals: Partial<Goals> = {}): Ctx {
  return { history: h, goals: { ...DEFAULT_GOALS, ...goals }, today };
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/domain/visibility.spec.ts`:

```ts
import { habit } from './testing';
import { dailyHabitsOn, firstHabitDay, habitsForMonth, isActiveOn } from './visibility';

describe('visibility', () => {
  it('is active from the creation day until the archive day (exclusive)', () => {
    const h = habit('a', { createdDay: '2026-10-05', archivedDay: '2026-10-20' });
    expect(isActiveOn(h, '2026-10-04')).toBe(false);
    expect(isActiveOn(h, '2026-10-05')).toBe(true);
    expect(isActiveOn(h, '2026-10-19')).toBe(true);
    expect(isActiveOn(h, '2026-10-20')).toBe(false);
  });

  it('lists active daily habits in sort order', () => {
    const list = [
      habit('b', { sortOrder: 2 }), habit('a', { sortOrder: 1 }),
      habit('w', { frequency: 'weekly' }), habit('x', { archivedDay: '2026-10-10' }),
    ];
    expect(dailyHabitsOn(list, '2026-10-19').map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('shows a habit in a month it overlaps', () => {
    const list = [
      habit('archivedBefore', { archivedDay: '2026-09-30' }),
      habit('archivedOnFirst', { archivedDay: '2026-10-01', sortOrder: 1 }),
      habit('createdAfter', { createdDay: '2026-11-01' }),
      habit('normal', { sortOrder: 2 }),
    ];
    expect(habitsForMonth(list, '2026-10-19').map((h) => h.id)).toEqual(['archivedOnFirst', 'normal']);
  });

  it('finds the first habit day', () => {
    expect(firstHabitDay([])).toBeNull();
    expect(firstHabitDay([habit('a', { createdDay: '2026-10-05' }), habit('b', { createdDay: '2026-10-02' })])).toBe('2026-10-02');
  });
});
```

Create `src/app/domain/scoring.spec.ts`:

```ts
import { ctx, habit, history } from './testing';
import { dayScore, habitDone, isGood, isPerfect } from './scoring';

const T = '2026-10-20';
const Y = '2026-10-19';
const steps = habit('steps', { source: 'steps' });
const cal = habit('cal', { source: 'calories' });
const fast = habit('fast', { source: 'fasting' });
const gym = habit('gym', { source: 'workout' });
const skin = habit('skin');

describe('habitDone', () => {
  it('steps: done at the goal, not below', () => {
    expect(habitDone(steps, Y, ctx(T, history({ steps: { [Y]: 10_000 } })))).toBe(true);
    expect(habitDone(steps, Y, ctx(T, history({ steps: { [Y]: 9_999 } })))).toBe(false);
  });

  it('workout: any workout that day', () => {
    expect(habitDone(gym, Y, ctx(T, history({ workouts: [Y] })))).toBe(true);
    expect(habitDone(gym, Y, ctx(T))).toBe(false);
  });

  it('manual: a tick that day', () => {
    expect(habitDone(skin, Y, ctx(T, history({ checks: { skin: [Y] } })))).toBe(true);
    expect(habitDone(skin, T, ctx(T, history({ checks: { skin: [Y] } })))).toBe(false);
  });

  it('calories: past day logged and within target', () => {
    expect(habitDone(cal, Y, ctx(T, history({ food: { [Y]: { kcal: 2_000 } } })))).toBe(true);
    expect(habitDone(cal, Y, ctx(T, history({ food: { [Y]: { kcal: 2_001 } } })))).toBe(false);
    expect(habitDone(cal, Y, ctx(T))).toBe(false);
  });

  it('calories today: empty when final, on track when live', () => {
    const c = ctx(T, history({ food: { [T]: { kcal: 900 } } }));
    expect(habitDone(cal, T, c, 'final')).toBe(false);
    expect(habitDone(cal, T, c, 'live')).toBe(true);
  });

  it('fasting: every entry inside a window, at least one entry', () => {
    expect(habitDone(fast, Y, ctx(T, history({ food: { [Y]: { kcal: 1_500, minutes: [30, 700] } } })))).toBe(true);
    expect(habitDone(fast, Y, ctx(T, history({ food: { [Y]: { kcal: 1_500, minutes: [30, 900] } } })))).toBe(false);
    expect(habitDone(fast, Y, ctx(T))).toBe(false);
  });

  it('fasting today: live only', () => {
    const c = ctx(T, history({ food: { [T]: { kcal: 600, minutes: [700] } } }));
    expect(habitDone(fast, T, c, 'final')).toBe(false);
    expect(habitDone(fast, T, c, 'live')).toBe(true);
  });

  it('is never done on a future day', () => {
    expect(habitDone(skin, '2026-10-21', ctx(T, history({ checks: { skin: ['2026-10-21'] } })))).toBe(false);
  });
});

describe('dayScore', () => {
  it('scores done ÷ active daily habits, ignoring weekly and archived ones', () => {
    const habits = [habit('a'), habit('b'), habit('c'), habit('d'), habit('w', { frequency: 'weekly' }), habit('x', { archivedDay: Y })];
    const c = ctx(T, history({ checks: { a: [T], b: [T], c: [T], w: [T], x: [T] } }));
    expect(dayScore(habits, T, c)).toEqual({ done: 3, total: 4, score: 75 });
  });

  it('is 0, not NaN, with no habits', () => {
    const s = dayScore([], T, ctx(T));
    expect(s).toEqual({ done: 0, total: 0, score: 0 });
    expect(isPerfect(s)).toBe(false);
    expect(isGood(s)).toBe(false);
  });

  it('uses the live rule for today', () => {
    const c = ctx(T, history({ food: { [T]: { kcal: 900 } } }));
    expect(dayScore([cal], T, c).score).toBe(100);
  });

  it('marks good (≥ 80) and perfect (100) days', () => {
    expect(isGood({ done: 4, total: 5, score: 80 })).toBe(true);
    expect(isPerfect({ done: 4, total: 5, score: 80 })).toBe(false);
    expect(isPerfect({ done: 5, total: 5, score: 100 })).toBe(true);
    expect(isGood({ done: 7, total: 8, score: 88 })).toBe(true);
    expect(isGood({ done: 6, total: 8, score: 75 })).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./visibility` and `./scoring`.

- [ ] **Step 4: Implement `visibility.ts`**

Create `src/app/domain/visibility.ts`:

```ts
import { monthEnd, monthStart } from '@shared/days';
import type { Day, Habit } from './types';

export function bySortOrder(a: Habit, b: Habit): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

export function isActiveOn(h: Habit, day: Day): boolean {
  return h.createdDay <= day && (h.archivedDay === null || h.archivedDay > day);
}

export function dailyHabitsOn(habits: readonly Habit[], day: Day): Habit[] {
  return habits.filter((h) => h.frequency === 'daily' && isActiveOn(h, day)).sort(bySortOrder);
}

export function habitsForMonth(habits: readonly Habit[], month: Day): Habit[] {
  const first = monthStart(month);
  const last = monthEnd(month);
  return habits.filter((h) => h.createdDay <= last && (h.archivedDay === null || h.archivedDay >= first)).sort(bySortOrder);
}

export function firstHabitDay(habits: readonly Habit[]): Day | null {
  return habits.reduce<Day | null>((min, h) => (min === null || h.createdDay < min ? h.createdDay : min), null);
}
```

- [ ] **Step 5: Implement `scoring.ts`**

Create `src/app/domain/scoring.ts`:

```ts
import { inWindow } from '@shared/windows';
import { dailyHabitsOn } from './visibility';
import type { Ctx, Day, Habit, Mode } from './types';

export function onCalorieTarget(day: Day, ctx: Ctx): boolean {
  const f = ctx.history.food.get(day);
  return !!f && f.entries > 0 && f.kcal <= ctx.goals.kcalGoal;
}

export function keptWindows(day: Day, ctx: Ctx): boolean {
  const f = ctx.history.food.get(day);
  return !!f && f.entries > 0 && f.minutes.every((m) => inWindow(m, ctx.goals.windows));
}

export function trainedOn(day: Day, ctx: Ctx): boolean {
  return (ctx.history.workouts.get(day)?.length ?? 0) > 0;
}

export function habitDone(h: Habit, day: Day, ctx: Ctx, mode: Mode = 'final'): boolean {
  if (day > ctx.today) return false;
  const judged = day < ctx.today || mode === 'live';
  switch (h.source) {
    case 'steps':
      return (ctx.history.steps.get(day) ?? 0) >= ctx.goals.stepGoal;
    case 'workout':
      return trainedOn(day, ctx);
    case 'calories':
      return judged && onCalorieTarget(day, ctx);
    case 'fasting':
      return judged && keptWindows(day, ctx);
    case 'manual':
      return ctx.history.checks.get(h.id)?.has(day) ?? false;
  }
}

export interface DayScore {
  done: number;
  total: number;
  score: number;
}

export function dayScore(habits: readonly Habit[], day: Day, ctx: Ctx): DayScore {
  const daily = dailyHabitsOn(habits, day);
  const mode: Mode = day === ctx.today ? 'live' : 'final';
  const done = daily.filter((h) => habitDone(h, day, ctx, mode)).length;
  return { done, total: daily.length, score: daily.length === 0 ? 0 : Math.round((100 * done) / daily.length) };
}

export function isPerfect(s: DayScore): boolean {
  return s.total > 0 && s.done === s.total;
}

export function isGood(s: DayScore): boolean {
  return s.total > 0 && s.score >= 80;
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx ng test --watch=false`
Expected: PASS — `visibility.spec.ts` (4), `scoring.spec.ts` (12), `app.spec.ts` (1).

- [ ] **Step 7: Commit**

```bash
git add src/app/domain
git commit -m "Add domain types, habit visibility and scoring rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Streaks with weekly freezes

**Files:**
- Create: `src/app/domain/streaks.ts`, `src/app/domain/streaks.spec.ts`

**Interfaces:**
- Consumes: `dayScore`, `isGood` (Task 3); `firstHabitDay` (Task 3); `@shared/days` (`addDays`, `eachDay`, `isoWeekStart`).
- Produces: `type DayKind = 'good' | 'frozen' | 'miss'`; `classifyDays(habits, from, to, ctx): Map<Day, DayKind>`; `StreakInfo { length: number; freezeAvailable: boolean; frozen: ReadonlySet<Day> }`; `overallStreak(habits, ctx): StreakInfo`; `bestRun(flags: readonly boolean[]): number`; `longestStreak(kinds: Iterable<DayKind>): number`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/domain/streaks.spec.ts`:

```ts
import { eachDay } from '@shared/days';
import { ctx, habit, history } from './testing';
import { bestRun, longestStreak, overallStreak } from './streaks';
import type { Day } from './types';

// One daily habit since Thu 1 Oct 2026. Today is Thu 22 Oct (week Mon 19 – Sun 25).
const H = [habit('a', { createdDay: '2026-10-01' })];
const TODAY = '2026-10-22';
const doneUpTo = (to: Day, skip: Day[] = []) => history({ checks: { a: eachDay('2026-10-01', to).filter((d) => !skip.includes(d)) } });

describe('overallStreak', () => {
  it('counts good days up to yesterday, plus today once it is good', () => {
    expect(overallStreak(H, ctx(TODAY, doneUpTo('2026-10-21'))).length).toBe(21);
    expect(overallStreak(H, ctx(TODAY, doneUpTo('2026-10-22'))).length).toBe(22);
  });

  it('freezes the first miss of a week without counting it', () => {
    const s = overallStreak(H, ctx(TODAY, doneUpTo('2026-10-21', ['2026-10-20'])));
    expect(s.length).toBe(20);
    expect([...s.frozen]).toEqual(['2026-10-20']);
    expect(s.freezeAvailable).toBe(false);
  });

  it('breaks on the second miss in the same week (oldest miss gets the freeze)', () => {
    // Week Mon 12 – Sun 18: Tue 13 is frozen, Fri 16 breaks the streak.
    expect(overallStreak(H, ctx(TODAY, doneUpTo('2026-10-21', ['2026-10-13', '2026-10-16']))).length).toBe(5);
  });

  it('gives each week its own freeze (Sunday miss, then Monday miss)', () => {
    expect(overallStreak(H, ctx(TODAY, doneUpTo('2026-10-21', ['2026-10-18', '2026-10-19']))).length).toBe(19);
  });

  it('keeps the freeze available when this week has no misses', () => {
    expect(overallStreak(H, ctx(TODAY, doneUpTo('2026-10-21', ['2026-10-16']))).freezeAvailable).toBe(true);
  });

  it('is zero with no habits, freeze available', () => {
    expect(overallStreak([], ctx(TODAY))).toEqual({ length: 0, freezeAvailable: true, frozen: new Set() });
  });
});

describe('runs', () => {
  it('finds the longest run of true', () => {
    expect(bestRun([true, true, false, true, true, true, false])).toBe(3);
    expect(bestRun([])).toBe(0);
  });

  it('lets frozen days bridge a run without counting', () => {
    expect(longestStreak(['good', 'good', 'frozen', 'good', 'miss', 'good'])).toBe(3);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./streaks`.

- [ ] **Step 3: Implement `streaks.ts`**

Create `src/app/domain/streaks.ts`:

```ts
import { addDays, eachDay, isoWeekStart } from '@shared/days';
import { dayScore, isGood } from './scoring';
import { firstHabitDay } from './visibility';
import type { Ctx, Day, Habit } from './types';

export type DayKind = 'good' | 'frozen' | 'miss';

/** Classifies days in [from, to] (all before today). Each Mon–Sun week's oldest non-good day is frozen. */
export function classifyDays(habits: readonly Habit[], from: Day, to: Day, ctx: Ctx): Map<Day, DayKind> {
  const out = new Map<Day, DayKind>();
  const first = firstHabitDay(habits);
  if (first === null) return out;
  const frozenWeeks = new Set<Day>();
  // Start at the week's Monday so a miss earlier in the same week still uses up the freeze.
  for (const day of eachDay(isoWeekStart(from), to)) {
    if (day < first) continue;
    const week = isoWeekStart(day);
    let kind: DayKind = 'miss';
    if (isGood(dayScore(habits, day, ctx))) kind = 'good';
    else if (!frozenWeeks.has(week)) {
      frozenWeeks.add(week);
      kind = 'frozen';
    }
    if (day >= from) out.set(day, kind);
  }
  return out;
}

export interface StreakInfo {
  length: number;
  freezeAvailable: boolean;
  frozen: ReadonlySet<Day>;
}

export function overallStreak(habits: readonly Habit[], ctx: Ctx): StreakInfo {
  const first = firstHabitDay(habits);
  const yesterday = addDays(ctx.today, -1);
  const kinds = first !== null && first <= yesterday ? classifyDays(habits, first, yesterday, ctx) : new Map<Day, DayKind>();
  let length = 0;
  for (let d = yesterday; first !== null && d >= first; d = addDays(d, -1)) {
    const kind = kinds.get(d);
    if (kind === 'good') length++;
    else if (kind !== 'frozen') break;
  }
  if (isGood(dayScore(habits, ctx.today, ctx))) length++;
  const frozen = new Set([...kinds].filter(([, k]) => k === 'frozen').map(([d]) => d));
  const weekStart = isoWeekStart(ctx.today);
  return { length, freezeAvailable: ![...frozen].some((d) => d >= weekStart), frozen };
}

export function bestRun(flags: readonly boolean[]): number {
  let best = 0;
  let current = 0;
  for (const f of flags) {
    current = f ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

export function longestStreak(kinds: Iterable<DayKind>): number {
  let best = 0;
  let current = 0;
  for (const k of kinds) {
    if (k === 'good') best = Math.max(best, ++current);
    else if (k === 'miss') current = 0;
  }
  return best;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx ng test --watch=false`
Expected: PASS — `streaks.spec.ts` 8 tests, plus the earlier suites.

- [ ] **Step 5: Commit**

```bash
git add src/app/domain/streaks.ts src/app/domain/streaks.spec.ts
git commit -m "Add overall streak with weekly freezes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Countdown challenges and the report card

**Files:**
- Create: `src/app/domain/challenges.ts`, `src/app/domain/challenges.spec.ts`
- Create: `src/app/domain/report.ts`, `src/app/domain/report.spec.ts`

**Interfaces:**
- Consumes: `habitDone`, `dayScore`, `isPerfect`, `onCalorieTarget`, `trainedOn` (Task 3); `classifyDays`, `longestStreak` (Task 4); `bySortOrder`, `isActiveOn` (Task 3).
- Produces (`challenges.ts`): `type ChallengeStatus = 'won' | 'out_of_reach' | 'on_track' | 'behind'`; `ChallengeProgress { done, target, window, elapsed, left, status, pace, needed, endDay: Day, finished: boolean }`; `challengeProgress(c, habit, countdown, ctx): ChallengeProgress`; `defaultTarget(daysLeft: number): number`.
- Produces (`report.ts`): `type Grade = 'A+' | 'A' | 'B' | 'C' | 'D'`; `gradeFor(avg): Grade`; `ReportCard { countdown, from, to, days, avgScore: number|null, grade: Grade|null, bestWeek: { from, to, avg }|null, perfectDays, bestStreak, workoutDays, totalSteps, avgSteps, kcalDays, challenges: { id, habitName, done, target, won }[], habits: { id, name, color, percent }[] }`; `buildReport(countdown, habits, challenges, ctx): ReportCard`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/domain/challenges.spec.ts`:

```ts
import { eachDay } from '@shared/days';
import { ctx, habit, history } from './testing';
import { challengeProgress, defaultTarget } from './challenges';
import type { Challenge, Countdown, Day } from './types';

const diwali: Countdown = { id: 'cd', title: 'Diwali', emoji: '🪔', targetDate: '2026-11-08', createdDay: '2026-10-19' };
const steps = habit('steps', { source: 'steps' });
const cal = habit('cal', { source: 'calories' });
const c: Challenge = { id: 'ch', countdownId: 'cd', habitId: 'steps', targetDays: 15, startDay: '2026-10-19' };
const walked = (days: Day[]) => history({ steps: Object.fromEntries(days.map((d) => [d, 12_000])) });

describe('challengeProgress', () => {
  it('starts on track with the whole window ahead', () => {
    const p = challengeProgress(c, steps, diwali, ctx('2026-10-19'));
    expect(p).toMatchObject({ done: 0, window: 20, elapsed: 0, left: 20, status: 'on_track', pace: 0, endDay: '2026-11-07', finished: false });
  });

  it('compares done days with the pace a week in', () => {
    const six = walked(eachDay('2026-10-19', '2026-10-24'));
    expect(challengeProgress(c, steps, diwali, ctx('2026-10-26', six))).toMatchObject({ done: 6, elapsed: 7, left: 13, status: 'on_track', needed: 9 });
    const five = walked(eachDay('2026-10-19', '2026-10-23'));
    expect(challengeProgress(c, steps, diwali, ctx('2026-10-26', five)).status).toBe('behind');
  });

  it('is won once the target is reached', () => {
    expect(challengeProgress(c, steps, diwali, ctx('2026-11-03', walked(eachDay('2026-10-19', '2026-11-02')))).status).toBe('won');
  });

  it('is out of reach when the days left cannot make it', () => {
    expect(challengeProgress(c, steps, diwali, ctx('2026-11-05', walked(eachDay('2026-10-19', '2026-10-28')))).status).toBe('out_of_reach');
  });

  it('finishes after the window ends', () => {
    const won = challengeProgress(c, steps, diwali, ctx('2026-11-08', walked(eachDay('2026-10-19', '2026-11-03'))));
    expect(won).toMatchObject({ finished: true, status: 'won', done: 16, left: 0 });
    const missed = challengeProgress(c, steps, diwali, ctx('2026-11-08', walked(eachDay('2026-10-19', '2026-11-01'))));
    expect(missed).toMatchObject({ finished: true, status: 'out_of_reach', done: 14 });
  });

  it('ignores days outside the window', () => {
    const p = challengeProgress(c, steps, diwali, ctx('2026-11-09', walked(['2026-10-18', '2026-11-08'])));
    expect(p.done).toBe(0);
  });

  it("counts today's live calories while on track", () => {
    const calC: Challenge = { ...c, habitId: 'cal' };
    const h = history({ food: { '2026-10-26': { kcal: 900 } } });
    expect(challengeProgress(calC, cal, diwali, ctx('2026-10-26', h)).done).toBe(1);
  });
});

describe('defaultTarget', () => {
  it('suggests 75% of the days left, at least 1', () => {
    expect(defaultTarget(20)).toBe(15);
    expect(defaultTarget(3)).toBe(3);
    expect(defaultTarget(1)).toBe(1);
  });
});
```

Create `src/app/domain/report.spec.ts`:

```ts
import { eachDay } from '@shared/days';
import { ctx, habit, history } from './testing';
import { buildReport, gradeFor } from './report';
import type { Countdown } from './types';

describe('gradeFor', () => {
  it('maps averages to grades at the boundaries', () => {
    expect([90, 89, 80, 79, 70, 69, 60, 59].map(gradeFor)).toEqual(['A+', 'A', 'A', 'B', 'B', 'C', 'C', 'D']);
  });
});

describe('buildReport', () => {
  // Countdown created Thu 1 Oct, due Sun 11 Oct → period 1–10 Oct (10 days). Viewed on the 11th.
  const cd: Countdown = { id: 'cd', title: 'Test', emoji: '🎯', targetDate: '2026-10-11', createdDay: '2026-10-01' };
  const habits = [habit('a', { sortOrder: 1, color: '#A3F53B' }), habit('s', { source: 'steps', sortOrder: 0 })];
  const h = history({
    checks: { a: eachDay('2026-10-01', '2026-10-10') },
    steps: {
      ...Object.fromEntries(eachDay('2026-10-01', '2026-10-05').map((d) => [d, 12_000])),
      ...Object.fromEntries(eachDay('2026-10-06', '2026-10-10').map((d) => [d, 5_000])),
    },
  });

  it('summarises the run-up', () => {
    const r = buildReport(cd, habits, [{ id: 'ch', countdownId: 'cd', habitId: 'a', targetDays: 8, startDay: '2026-10-01' }], ctx('2026-10-11', h));
    expect(r).toMatchObject({
      from: '2026-10-01', to: '2026-10-10', days: 10,
      avgScore: 75, grade: 'B',
      bestWeek: { from: '2026-10-01', to: '2026-10-07', avg: 86 },
      perfectDays: 5, bestStreak: 5, workoutDays: 0,
      totalSteps: 85_000, avgSteps: 8_500, kcalDays: 0,
    });
    expect(r.challenges).toEqual([{ id: 'ch', habitName: 'a', done: 10, target: 8, won: true }]);
    expect(r.habits).toEqual([{ id: 'a', name: 'a', color: '#A3F53B', percent: 100 }]);
  });

  it('has nothing to report for a countdown created on its own date', () => {
    const same: Countdown = { ...cd, createdDay: '2026-10-11' };
    const r = buildReport(same, habits, [], ctx('2026-10-11', h));
    expect(r).toMatchObject({ days: 0, avgScore: null, grade: null, bestWeek: null, perfectDays: 0 });
  });

  it('skips the best week when the period is shorter than 7 days', () => {
    const short: Countdown = { ...cd, createdDay: '2026-10-07' };
    expect(buildReport(short, habits, [], ctx('2026-10-11', h)).bestWeek).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./challenges` and `./report`.

- [ ] **Step 3: Implement `challenges.ts`**

Create `src/app/domain/challenges.ts`:

```ts
import { addDays, daysBetween, eachDay } from '@shared/days';
import { habitDone } from './scoring';
import type { Challenge, Countdown, Ctx, Day, Habit } from './types';

export type ChallengeStatus = 'won' | 'out_of_reach' | 'on_track' | 'behind';

export interface ChallengeProgress {
  done: number;
  target: number;
  window: number;
  elapsed: number;
  left: number;
  status: ChallengeStatus;
  pace: number;
  needed: number;
  endDay: Day;
  finished: boolean;
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

export function challengeProgress(c: Challenge, habit: Habit, countdown: Countdown, ctx: Ctx): ChallengeProgress {
  const endDay = addDays(countdown.targetDate, -1);
  const window = Math.max(0, daysBetween(c.startDay, endDay) + 1);
  const lastCounted = ctx.today < endDay ? ctx.today : endDay;
  const done = eachDay(c.startDay, lastCounted).filter((d) => habitDone(habit, d, ctx, d === ctx.today ? 'live' : 'final')).length;
  const elapsed = clamp(daysBetween(c.startDay, ctx.today), window);
  const left = clamp(daysBetween(ctx.today, endDay) + 1, window);
  const target = c.targetDays;
  const status: ChallengeStatus =
    done >= target ? 'won'
    : done + left < target ? 'out_of_reach'
    : done >= (target * elapsed) / window ? 'on_track'
    : 'behind';
  return {
    done, target, window, elapsed, left, status,
    pace: window === 0 ? 1 : elapsed / window,
    needed: Math.max(0, target - done),
    endDay,
    finished: ctx.today > endDay,
  };
}

export function defaultTarget(daysLeft: number): number {
  return Math.max(1, Math.ceil(0.75 * daysLeft));
}
```

- [ ] **Step 4: Implement `report.ts`**

Create `src/app/domain/report.ts`:

```ts
import { addDays, eachDay } from '@shared/days';
import { challengeProgress } from './challenges';
import { dayScore, habitDone, isPerfect, onCalorieTarget, trainedOn } from './scoring';
import { classifyDays, longestStreak } from './streaks';
import { bySortOrder, isActiveOn } from './visibility';
import type { Challenge, Countdown, Ctx, Day, Habit } from './types';

export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D';

export function gradeFor(avg: number): Grade {
  return avg >= 90 ? 'A+' : avg >= 80 ? 'A' : avg >= 70 ? 'B' : avg >= 60 ? 'C' : 'D';
}

export interface ReportCard {
  countdown: Countdown;
  from: Day;
  to: Day;
  days: number;
  avgScore: number | null;
  grade: Grade | null;
  bestWeek: { from: Day; to: Day; avg: number } | null;
  perfectDays: number;
  bestStreak: number;
  workoutDays: number;
  totalSteps: number;
  avgSteps: number;
  kcalDays: number;
  challenges: { id: string; habitName: string; done: number; target: number; won: boolean }[];
  habits: { id: string; name: string; color: string; percent: number }[];
}

const isPresent = <T>(x: T | null): x is T => x !== null;

export function buildReport(countdown: Countdown, habits: readonly Habit[], challenges: readonly Challenge[], ctx: Ctx): ReportCard {
  const from = countdown.createdDay;
  const to = addDays(countdown.targetDate, -1);
  const days = eachDay(from, to);
  const empty = {
    countdown, from, to, days: days.length, avgScore: null, grade: null, bestWeek: null, perfectDays: 0,
    bestStreak: 0, workoutDays: 0, totalSteps: 0, avgSteps: 0, kcalDays: 0, challenges: [], habits: [],
  };
  if (days.length === 0) return empty;

  const scores = days.map((d) => dayScore(habits, d, ctx));
  const avgScore = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / days.length);

  let bestWeek: ReportCard['bestWeek'] = null;
  for (let i = 0; i + 7 <= days.length; i++) {
    const avg = Math.round(scores.slice(i, i + 7).reduce((sum, s) => sum + s.score, 0) / 7);
    if (!bestWeek || avg > bestWeek.avg) bestWeek = { from: days[i], to: days[i + 6], avg };
  }

  const totalSteps = days.reduce((sum, d) => sum + (ctx.history.steps.get(d) ?? 0), 0);

  return {
    ...empty,
    avgScore,
    grade: gradeFor(avgScore),
    bestWeek,
    perfectDays: scores.filter(isPerfect).length,
    bestStreak: longestStreak(classifyDays(habits, from, to, ctx).values()),
    workoutDays: days.filter((d) => trainedOn(d, ctx)).length,
    totalSteps,
    avgSteps: Math.round(totalSteps / days.length),
    kcalDays: days.filter((d) => onCalorieTarget(d, ctx)).length,
    challenges: challenges
      .filter((c) => c.countdownId === countdown.id)
      .map((c) => {
        const h = habits.find((x) => x.id === c.habitId);
        if (!h) return null;
        const p = challengeProgress(c, h, countdown, ctx);
        return { id: c.id, habitName: h.name, done: p.done, target: p.target, won: p.done >= p.target };
      })
      .filter(isPresent),
    habits: habits
      .filter((h) => h.frequency === 'daily' && h.source === 'manual')
      .sort(bySortOrder)
      .map((h) => {
        const active = days.filter((d) => isActiveOn(h, d));
        if (active.length === 0) return null;
        const done = active.filter((d) => habitDone(h, d, ctx)).length;
        return { id: h.id, name: h.name, color: h.color, percent: Math.round((100 * done) / active.length) };
      })
      .filter(isPresent),
  };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx ng test --watch=false`
Expected: PASS — `challenges.spec.ts` 8, `report.spec.ts` 4, plus earlier suites.

- [ ] **Step 6: Commit**

```bash
git add src/app/domain/challenges.ts src/app/domain/challenges.spec.ts src/app/domain/report.ts src/app/domain/report.spec.ts
git commit -m "Add countdown challenges and report card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Supabase project, schema, RLS and app config

Steps marked **(Anvit)** need Anvit at the keyboard; Claude prepares everything else and waits. Interactive CLI commands are run by Anvit with the `!` prefix so their output lands in the session.

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/20261019000000_init.sql`
- Create: `src/app/core/config.ts`, `scripts/live/env.mjs`, `scripts/live/setup-check.mjs`, `.env.local` (git-ignored; Anvit fills the password)
- Modify: `ngsw-config.json`

**Interfaces:**
- Produces (DB): tables/columns per spec §6; RPCs `ensure_setup()` (seeds settings, 9 habits, 2 countdowns on first call; no-op after) and `rotate_sync_token() → text`.
- Produces (`config.ts`): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FUNCTIONS_URL`, `SHORTCUT_DOCS_URL`.
- Produces (`scripts/live/env.mjs`): `env` (`{ url, key, email, password }`), `signIn(): Promise<{ db, userId }>`, `anon(): SupabaseClient`, `resetUser(db, userId): Promise<void>`, `TABLES: string[]`.

- [ ] **Step 1 (Anvit): Create the project and users**

1. Go to https://supabase.com → **Sign in with GitHub** (use the personal account BrutalOverkill) → **New project**: name `countdown`, region **South Asia (Mumbai)**, generate a database password and save it in your password manager.
2. **Project Settings → API Keys**: copy the **Project URL** (`https://<ref>.supabase.co`) and the **Publishable key** (`sb_publishable_…`). If the page only shows legacy keys, copy the `anon` `public` key instead. Paste both into the chat — both are public by design.
3. **Authentication → Sign In / Providers → Email**: keep Email enabled; turn **"Allow new users to sign up" OFF**; Save.
4. **Authentication → Users → Add user → Create new user**: your own email + a strong password, tick **Auto Confirm User**. Repeat for the **test user**, e.g. `you+countdown-test@gmail.com`, with a different password.
5. Tell Claude the test user's email (not the password).

- [ ] **Step 2: Initialise the Supabase folder**

```bash
npx -y supabase@2.121.0 init
```

Answer **N** to any prompt about VS Code / IntelliJ Deno settings. Then append to `supabase/config.toml`:

```toml

[functions.sync]
verify_jwt = false

[functions.food-guard]
verify_jwt = false
```

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261019000000_init.sql`:

```sql
-- Countdown tracker schema. Every table is owner-only through RLS.

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  step_goal int not null default 10000 check (step_goal between 1000 and 100000),
  kcal_goal int not null default 2000 check (kcal_goal between 500 and 10000),
  sync_token_hash text unique,
  last_sync_at timestamptz,
  fasting_enabled boolean not null default true,
  eating_windows jsonb not null default '[{"start":"00:00","end":"01:00"},{"start":"11:00","end":"13:00"}]'
    check (jsonb_typeof(eating_windows) = 'array' and jsonb_array_length(eating_windows) <= 3)
);

create table public.countdowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  emoji text not null default '🎯' check (char_length(emoji) between 1 and 8),
  target_date date not null,
  created_at timestamptz not null default now()
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  emoji text not null default '✅' check (char_length(emoji) between 1 and 8),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  frequency text not null check (frequency in ('daily', 'weekly')),
  source text not null default 'manual' check (source in ('manual', 'steps', 'calories', 'workout', 'fasting')),
  slot text not null default 'anytime' check (slot in ('morning', 'night', 'anytime')),
  weekday smallint check (weekday between 0 and 6),
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.habit_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  habit_id uuid not null references public.habits on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, day)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  month date not null check (extract(day from month) = 1),
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  countdown_id uuid not null references public.countdowns on delete cascade,
  habit_id uuid not null references public.habits on delete cascade,
  target_days int not null check (target_days > 0),
  start_day date not null,
  created_at timestamptz not null default now()
);

create table public.steps_daily (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  count int not null check (count between 0 and 100000),
  synced_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null,
  day date not null,
  duration_min int check (duration_min between 0 and 1440),
  name text check (char_length(name) <= 80),
  source text not null check (source in ('health', 'manual')),
  unique (user_id, started_at)
);

create table public.saved_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kcal int not null check (kcal between 0 and 10000),
  protein_g numeric(6, 1) check (protein_g between 0 and 1000),
  use_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  eaten_at timestamptz not null default now(),
  day date not null,
  name text not null check (char_length(name) between 1 and 60),
  kcal int not null check (kcal between 0 and 10000),
  protein_g numeric(6, 1) check (protein_g between 0 and 1000),
  saved_food_id uuid references public.saved_foods on delete set null,
  created_at timestamptz not null default now()
);

create index habit_checks_user_day on public.habit_checks (user_id, day);
create index workouts_user_day on public.workouts (user_id, day);
create index food_entries_user_day on public.food_entries (user_id, day);

do $$
declare t text;
begin
  foreach t in array array['settings', 'countdowns', 'habits', 'habit_checks', 'tasks', 'challenges',
                           'steps_daily', 'workouts', 'saved_foods', 'food_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_all on public.%I for all to authenticated '
                   'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- First-login defaults. Runs as the caller, so RLS and column defaults (user_id) apply.
create or replace function public.ensure_setup() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.settings (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  if not found then
    return;
  end if;
  insert into public.habits (name, emoji, color, frequency, source, slot, weekday, sort_order) values
    ('10k steps', '👟', '#FF453A', 'daily', 'steps', 'anytime', null, 1),
    ('Calories on target', '🍽️', '#FF9F0A', 'daily', 'calories', 'anytime', null, 2),
    ('Fasting windows kept', '🌙', '#FFD60A', 'daily', 'fasting', 'anytime', null, 3),
    ('Workout', '💪', '#A3F53B', 'daily', 'workout', 'anytime', null, 4),
    ('AM skincare', '🧴', '#30D158', 'daily', 'manual', 'morning', null, 5),
    ('PM skincare', '🌙', '#00C7BE', 'daily', 'manual', 'night', null, 6),
    ('Minoxidil AM', '💧', '#32D7FA', 'daily', 'manual', 'morning', null, 7),
    ('Minoxidil PM', '💧', '#0A84FF', 'daily', 'manual', 'night', null, 8),
    ('Dermarolling', '🪡', '#BF5AF2', 'weekly', 'manual', 'night', 0, 9);
  insert into public.countdowns (title, emoji, target_date) values
    ('Diwali', '🪔', '2026-11-08'),
    ('Engagement', '💍', '2026-12-10');
end $$;

-- Returns a fresh Shortcut token once; only its SHA-256 hash is stored.
create or replace function public.rotate_sync_token() returns text
language plpgsql security invoker set search_path = '' as $$
declare
  token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.settings
     set sync_token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
   where user_id = auth.uid();
  if not found then
    raise exception 'Run ensure_setup first';
  end if;
  return token;
end $$;

revoke execute on function public.ensure_setup() from public, anon;
revoke execute on function public.rotate_sync_token() from public, anon;
grant execute on function public.ensure_setup() to authenticated;
grant execute on function public.rotate_sync_token() to authenticated;
```

- [ ] **Step 4 (Anvit): Log in, link and push the schema**

Ask Anvit to run, one at a time (each may open a browser or ask for the database password):

```
! npx supabase login
! npx supabase link --project-ref <ref>
! npx supabase db push
```

Expected: `Applying migration 20261019000000_init.sql...` then `Finished supabase db push.`

- [ ] **Step 5: App config and the offline data cache**

Create `src/app/core/config.ts` (values from Step 1.2 — the URL and publishable key are public; RLS protects the data):

```ts
export const SUPABASE_URL = 'https://<ref>.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = '<publishable key>';
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
export const SHORTCUT_DOCS_URL = 'https://github.com/BrutalOverkill/countdown-tracker/blob/main/docs/iphone-shortcut.md';
```

Replace `<ref>` and `<publishable key>` with the real values before saving.

In `ngsw-config.json`, add a top-level `"dataGroups"` array after `"assetGroups"` (same `<ref>`):

```json
  "dataGroups": [
    {
      "name": "supabase-reads",
      "urls": ["https://<ref>.supabase.co/rest/v1/**"],
      "cacheConfig": { "strategy": "freshness", "maxSize": 300, "maxAge": "7d", "timeout": "4s" }
    }
  ]
```

- [ ] **Step 6: Local secrets file for live tests**

Create `.env.local` (already git-ignored by `.env.*`) with the URL, key and test-user email filled in, and `E2E_PASSWORD=` left blank:

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key>
E2E_EMAIL=<test user email>
E2E_PASSWORD=
```

**(Anvit)** opens `.env.local` and types the test user's password after `E2E_PASSWORD=`. Confirm it is ignored: `git check-ignore .env.local` → prints `.env.local`.

- [ ] **Step 7: Shared live-test helpers**

Create `scripts/live/env.mjs`:

```js
// Shared setup for the live (real Supabase) checks: loads .env.local, signs in the test user, wipes its rows.
import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI provides the variables directly.
}

export const env = {
  url: required('SUPABASE_URL'),
  key: required('SUPABASE_PUBLISHABLE_KEY'),
  email: required('E2E_EMAIL'),
  password: required('E2E_PASSWORD'),
};

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} (set it in .env.local)`);
  return value;
}

export const TABLES = ['habit_checks', 'challenges', 'tasks', 'food_entries', 'saved_foods', 'workouts', 'steps_daily', 'habits', 'countdowns', 'settings'];

export function anon() {
  return createClient(env.url, env.key, { auth: { persistSession: false } });
}

export async function signIn() {
  const db = anon();
  const { data, error } = await db.auth.signInWithPassword({ email: env.email, password: env.password });
  if (error) throw error;
  return { db, userId: data.user.id };
}

/** Deletes every row the test user owns (children first), then re-runs first-login setup. */
export async function resetUser(db, userId) {
  for (const table of TABLES) {
    const { error } = await db.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  const { error } = await db.rpc('ensure_setup');
  if (error) throw error;
}
```

Create `scripts/live/setup-check.mjs`:

```js
// Proves the schema, RLS and ensure_setup work for a fresh user.
import assert from 'node:assert/strict';
import { resetUser, signIn } from './env.mjs';

const { db, userId } = await signIn();
await resetUser(db, userId);

const { data: habits, error: hErr } = await db.from('habits').select('name, source, frequency').order('sort_order');
assert.ifError(hErr);
assert.equal(habits.length, 9);
assert.deepEqual(habits.map((h) => h.source), ['steps', 'calories', 'fasting', 'workout', 'manual', 'manual', 'manual', 'manual', 'manual']);

const { data: countdowns } = await db.from('countdowns').select('title, target_date').order('target_date');
assert.deepEqual(countdowns, [{ title: 'Diwali', target_date: '2026-11-08' }, { title: 'Engagement', target_date: '2026-12-10' }]);

const { data: settings } = await db.from('settings').select('step_goal, kcal_goal, fasting_enabled, eating_windows').single();
assert.deepEqual(settings, {
  step_goal: 10000, kcal_goal: 2000, fasting_enabled: true,
  eating_windows: [{ start: '00:00', end: '01:00' }, { start: '11:00', end: '13:00' }],
});

const { error: againErr } = await db.rpc('ensure_setup');
assert.ifError(againErr);
const { count } = await db.from('habits').select('*', { count: 'exact', head: true });
assert.equal(count, 9, 'ensure_setup must not seed twice');

const { data: token, error: tErr } = await db.rpc('rotate_sync_token');
assert.ifError(tErr);
assert.match(token, /^[0-9a-f]{64}$/);

console.log('setup-check passed');
```

- [ ] **Step 8: Run the setup check**

Run: `node scripts/live/setup-check.mjs`
Expected: `setup-check passed`. (A missing password prints `Missing E2E_PASSWORD (set it in .env.local)`.)

- [ ] **Step 9: Commit**

```bash
git add supabase/config.toml supabase/migrations src/app/core/config.ts ngsw-config.json scripts/live
git commit -m "Add Supabase schema with owner-only RLS, setup RPCs and live-test helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Edge Functions — `sync` and `food-guard`

**Files:**
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/sync/logic.ts`, `supabase/functions/sync/logic.test.ts`, `supabase/functions/sync/index.ts`
- Create: `supabase/functions/food-guard/logic.ts`, `supabase/functions/food-guard/logic.test.ts`, `supabase/functions/food-guard/index.ts`

**Interfaces:**
- Consumes: `_shared/days.ts`, `_shared/windows.ts`, `_shared/token.ts` (Task 2); tables from Task 6.
- Produces (`sync/logic.ts`): `StepIn { date, count }`, `WorkoutIn { start, durationMin, name }`, `SyncPayload { steps, workouts }`, `validatePayload(body: unknown, latestDay: Day): { ok: true; value: SyncPayload } | { ok: false; error: string }`, `ManualHabit { name, frequency, weekday, sortOrder, checkedDays }`, `pendingFor(today, habits): string[]`, `messageFor(pending): string`.
- Produces (`food-guard/logic.ts`): `GuardInput { kcal, goal, fastingEnabled, windows, minute }`, `GuardResult { kcal, goal, reached, fasting, nextWindow: string|null, blocked, message }`, `guardResult(input): GuardResult`.
- Produces (HTTP): `POST {FUNCTIONS_URL}/sync` and `POST {FUNCTIONS_URL}/food-guard` per spec §7 / §7.1.

- [ ] **Step 1: Write the failing logic tests**

Create `supabase/functions/sync/logic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { messageFor, pendingFor, validatePayload } from './logic.ts';

const LATEST = '2026-10-20';

describe('validatePayload', () => {
  it('accepts a normal body', () => {
    const r = validatePayload({
      steps: [{ date: '2026-10-19', count: 7842 }],
      workouts: [{ start: '2026-10-19T18:02:00+05:30', durationMin: 52, name: 'Traditional Strength Training' }],
    }, LATEST);
    expect(r).toEqual({ ok: true, value: {
      steps: [{ date: '2026-10-19', count: 7842 }],
      workouts: [{ start: '2026-10-19T12:32:00.000Z', durationMin: 52, name: 'Traditional Strength Training' }],
    } });
  });

  it('coerces numeric strings and decimals and rounds them', () => {
    const r = validatePayload({ steps: [{ date: '2026-10-18', count: '7842' }, { date: '2026-10-19', count: 9120.6 }] }, LATEST);
    expect(r.ok && r.value.steps).toEqual([{ date: '2026-10-18', count: 7842 }, { date: '2026-10-19', count: 9121 }]);
  });

  it('treats a bare object as a one-item list', () => {
    const r = validatePayload({ steps: { date: '2026-10-19', count: 100 }, workouts: { start: '2026-10-19T10:00:00Z' } }, LATEST);
    expect(r.ok && r.value.steps).toEqual([{ date: '2026-10-19', count: 100 }]);
    expect(r.ok && r.value.workouts).toEqual([{ start: '2026-10-19T10:00:00.000Z', durationMin: null, name: null }]);
  });

  it('treats missing, null or empty-string lists as empty', () => {
    expect(validatePayload({}, LATEST)).toEqual({ ok: true, value: { steps: [], workouts: [] } });
    expect(validatePayload({ steps: null, workouts: '' }, LATEST)).toEqual({ ok: true, value: { steps: [], workouts: [] } });
  });

  it('keeps the last entry for a repeated date or start', () => {
    const r = validatePayload({
      steps: [{ date: '2026-10-19', count: 5 }, { date: '2026-10-19', count: 6 }],
      workouts: [{ start: '2026-10-19T10:00:00Z', name: 'A' }, { start: '2026-10-19T10:00:00Z', name: 'B' }],
    }, LATEST);
    expect(r.ok && r.value.steps).toEqual([{ date: '2026-10-19', count: 6 }]);
    expect(r.ok && r.value.workouts.map((w) => w.name)).toEqual(['B']);
  });

  it('accepts dates up to latestDay and 31 days back, no further', () => {
    expect(validatePayload({ steps: [{ date: '2026-10-20', count: 1 }, { date: '2026-09-19', count: 1 }] }, LATEST).ok).toBe(true);
    expect(validatePayload({ steps: [{ date: '2026-10-21', count: 1 }] }, LATEST)).toEqual({ ok: false, error: 'steps[0].date must be a recent date (yyyy-MM-dd)' });
    expect(validatePayload({ steps: [{ date: '2026-09-18', count: 1 }] }, LATEST).ok).toBe(false);
  });

  it('rejects bad bodies with a clear message', () => {
    expect(validatePayload([], LATEST)).toEqual({ ok: false, error: 'Body must be a JSON object' });
    expect(validatePayload('x', LATEST)).toEqual({ ok: false, error: 'Body must be a JSON object' });
    expect(validatePayload({ steps: 'abc' }, LATEST)).toEqual({ ok: false, error: 'steps must be a list of at most 31 days' });
    expect(validatePayload({ steps: [{ date: '2026-10-19', count: -1 }] }, LATEST)).toEqual({ ok: false, error: 'steps[0].count must be a number from 0 to 100000' });
    expect(validatePayload({ steps: [{ date: '2026-10-19', count: 100_001 }] }, LATEST).ok).toBe(false);
    expect(validatePayload({ steps: [{ date: '2026-10-19', count: 'many' }] }, LATEST).ok).toBe(false);
    expect(validatePayload({ steps: Array.from({ length: 32 }, () => ({ date: '2026-10-19', count: 1 })) }, LATEST).ok).toBe(false);
    expect(validatePayload({ workouts: [{ start: 'yesterday' }] }, LATEST)).toEqual({ ok: false, error: 'workouts[0].start must be a recent date-time' });
    expect(validatePayload({ workouts: [{ start: '2026-10-19T10:00:00Z', durationMin: 2000 }] }, LATEST)).toEqual({ ok: false, error: 'workouts[0].durationMin must be 0–1440' });
    expect(validatePayload({ workouts: Array.from({ length: 21 }, (_, i) => ({ start: `2026-10-19T10:${String(i).padStart(2, '0')}:00Z` })) }, LATEST)).toEqual({ ok: false, error: 'workouts must be a list of at most 20 items' });
  });

  it('cleans workout fields', () => {
    const r = validatePayload({ workouts: [{ start: '2026-10-19T10:00:00Z', durationMin: '45.4', name: '  ' + 'x'.repeat(100) }] }, LATEST);
    expect(r.ok && r.value.workouts[0]).toEqual({ start: '2026-10-19T10:00:00.000Z', durationMin: 45, name: 'x'.repeat(80) });
    const blank = validatePayload({ workouts: [{ start: '2026-10-19T10:00:00Z', durationMin: '', name: '' }] }, LATEST);
    expect(blank.ok && blank.value.workouts[0]).toEqual({ start: '2026-10-19T10:00:00.000Z', durationMin: null, name: null });
  });
});

describe('pendingFor', () => {
  const daily = (name: string, sortOrder: number, checkedDays: string[] = []) => ({ name, frequency: 'daily' as const, weekday: null, sortOrder, checkedDays });

  it('lists unticked daily habits in sort order', () => {
    expect(pendingFor('2026-10-19', [daily('PM skincare', 6), daily('AM skincare', 5, ['2026-10-19']), daily('Minoxidil PM', 8)])).toEqual(['PM skincare', 'Minoxidil PM']);
  });

  it('nudges a weekly habit only on its weekday and only if not done in the week block', () => {
    const derma = (checkedDays: string[], weekday: number | null = 0) => ({ name: 'Dermarolling', frequency: 'weekly' as const, weekday, sortOrder: 9, checkedDays });
    expect(pendingFor('2026-10-18', [derma([])])).toEqual(['Dermarolling']); // Sunday, block 15–21
    expect(pendingFor('2026-10-18', [derma(['2026-10-15'])])).toEqual([]);
    expect(pendingFor('2026-10-18', [derma(['2026-10-14'])])).toEqual(['Dermarolling']); // previous block
    expect(pendingFor('2026-10-19', [derma([])])).toEqual([]); // Monday
    expect(pendingFor('2026-10-18', [derma([], null)])).toEqual([]);
  });
});

describe('messageFor', () => {
  it('builds the nudge text', () => {
    expect(messageFor(['PM skincare', 'Minoxidil PM'])).toBe('Left today: PM skincare, Minoxidil PM');
    expect(messageFor([])).toBe('');
  });
});
```

Create `supabase/functions/food-guard/logic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOWS } from '../_shared/windows.ts';
import { guardResult } from './logic.ts';

const base = { goal: 2000, fastingEnabled: true, windows: DEFAULT_WINDOWS };

describe('guardResult', () => {
  it('lets you in under target inside a window', () => {
    expect(guardResult({ ...base, kcal: 1200, minute: 700 })).toEqual({
      kcal: 1200, goal: 2000, reached: false, fasting: false, nextWindow: '12:00 AM', blocked: false, message: '',
    });
  });

  it('blocks at exactly the target and above', () => {
    expect(guardResult({ ...base, kcal: 2000, minute: 700 })).toMatchObject({ reached: true, blocked: true, message: "🛑 2,000 kcal today — target hit. Kitchen's closed." });
    expect(guardResult({ ...base, kcal: 2050, minute: 700 }).message).toBe("🛑 2,050 kcal today — target hit. Kitchen's closed.");
  });

  it('blocks outside the windows even with nothing logged', () => {
    expect(guardResult({ ...base, kcal: 0, minute: 840 })).toEqual({
      kcal: 0, goal: 2000, reached: false, fasting: true, nextWindow: '12:00 AM', blocked: true, message: '🌙 Fasting — next window opens at 12:00 AM.',
    });
    expect(guardResult({ ...base, kcal: 0, minute: 120 }).message).toBe('🌙 Fasting — next window opens at 11:00 AM.');
  });

  it('ignores the windows when fasting is off or there are none', () => {
    expect(guardResult({ ...base, fastingEnabled: false, kcal: 0, minute: 840 })).toMatchObject({ fasting: false, blocked: false, nextWindow: null });
    expect(guardResult({ ...base, windows: [], kcal: 0, minute: 840 })).toMatchObject({ fasting: false, blocked: false, nextWindow: null });
  });

  it('shows the target message when both reasons apply', () => {
    expect(guardResult({ ...base, kcal: 2100, minute: 840 })).toMatchObject({ reached: true, fasting: true, blocked: true, message: "🛑 2,100 kcal today — target hit. Kitchen's closed." });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:functions`
Expected: FAIL — cannot resolve `./logic.ts` in `sync/` and `food-guard/`.

- [ ] **Step 3: Implement `sync/logic.ts`**

Create `supabase/functions/sync/logic.ts`:

```ts
import { addDays, appDayOf, isValidDay, weekBlockRange, weekdayOf, type Day } from '../_shared/days.ts';

export interface StepIn { date: Day; count: number }
export interface WorkoutIn { start: string; durationMin: number | null; name: string | null }
export interface SyncPayload { steps: StepIn[]; workouts: WorkoutIn[] }
export type Validated = { ok: true; value: SyncPayload } | { ok: false; error: string };

function toNumber(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// Shortcuts sends a one-item list as a bare dictionary and an empty list as nothing at all.
function asList(v: unknown): unknown[] | null {
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return [v];
  return null;
}

const isBlank = (v: unknown) => v === undefined || v === null || v === '';

/** `latestDay` = IST calendar date 15 minutes from now (tolerates a phone clock slightly ahead at midnight). */
export function validatePayload(body: unknown, latestDay: Day): Validated {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'Body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const earliest = addDays(latestDay, -31);
  const recent = (d: Day) => d >= earliest && d <= latestDay;

  const stepsRaw = asList(b['steps']);
  if (!stepsRaw || stepsRaw.length > 31) return { ok: false, error: 'steps must be a list of at most 31 days' };
  const steps = new Map<Day, StepIn>();
  for (const [i, raw] of stepsRaw.entries()) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const date = item['date'];
    if (!isValidDay(date) || !recent(date)) return { ok: false, error: `steps[${i}].date must be a recent date (yyyy-MM-dd)` };
    const count = toNumber(item['count']);
    if (count === null || count < 0 || count > 100_000) return { ok: false, error: `steps[${i}].count must be a number from 0 to 100000` };
    steps.set(date, { date, count: Math.round(count) });
  }

  const workoutsRaw = asList(b['workouts']);
  if (!workoutsRaw || workoutsRaw.length > 20) return { ok: false, error: 'workouts must be a list of at most 20 items' };
  const workouts = new Map<string, WorkoutIn>();
  for (const [i, raw] of workoutsRaw.entries()) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const t = typeof item['start'] === 'string' ? Date.parse(item['start']) : NaN;
    if (Number.isNaN(t) || !recent(appDayOf(new Date(t)))) return { ok: false, error: `workouts[${i}].start must be a recent date-time` };
    const dur = isBlank(item['durationMin']) ? null : toNumber(item['durationMin']);
    if ((!isBlank(item['durationMin']) && dur === null) || (dur !== null && (dur < 0 || dur > 1440))) {
      return { ok: false, error: `workouts[${i}].durationMin must be 0–1440` };
    }
    const name = typeof item['name'] === 'string' && item['name'].trim() ? item['name'].trim().slice(0, 80) : null;
    const start = new Date(t).toISOString();
    workouts.set(start, { start, durationMin: dur === null ? null : Math.round(dur), name });
  }

  return { ok: true, value: { steps: [...steps.values()], workouts: [...workouts.values()] } };
}

export interface ManualHabit {
  name: string;
  frequency: 'daily' | 'weekly';
  weekday: number | null;
  sortOrder: number;
  checkedDays: readonly Day[];
}

export function pendingFor(today: Day, habits: readonly ManualHabit[]): string[] {
  const { start, end } = weekBlockRange(today);
  return [...habits]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((h) => {
      if (h.frequency === 'daily') return !h.checkedDays.includes(today);
      if (h.weekday !== weekdayOf(today)) return false;
      return !h.checkedDays.some((d) => d >= start && d <= end);
    })
    .map((h) => h.name);
}

export function messageFor(pending: readonly string[]): string {
  return pending.length ? `Left today: ${pending.join(', ')}` : '';
}
```

- [ ] **Step 4: Implement `food-guard/logic.ts`**

Create `supabase/functions/food-guard/logic.ts`:

```ts
import { formatClock, inWindow, nextStartAfter, type EatingWindow } from '../_shared/windows.ts';

export interface GuardInput {
  kcal: number;
  goal: number;
  fastingEnabled: boolean;
  windows: readonly EatingWindow[];
  /** IST clock minute, 0–1439. */
  minute: number;
}

export interface GuardResult {
  kcal: number;
  goal: number;
  reached: boolean;
  fasting: boolean;
  nextWindow: string | null;
  blocked: boolean;
  message: string;
}

export function guardResult(i: GuardInput): GuardResult {
  const reached = i.kcal >= i.goal;
  const useWindows = i.fastingEnabled && i.windows.length > 0;
  const fasting = useWindows && !inWindow(i.minute, i.windows);
  const nextWindow = useWindows ? formatClock(nextStartAfter(i.minute, i.windows)) : null;
  const message = reached
    ? `🛑 ${i.kcal.toLocaleString('en-IN')} kcal today — target hit. Kitchen's closed.`
    : fasting ? `🌙 Fasting — next window opens at ${nextWindow}.` : '';
  return { kcal: i.kcal, goal: i.goal, reached, fasting, nextWindow, blocked: reached || fasting, message };
}
```

- [ ] **Step 5: Run the logic tests to see them pass**

Run: `npm run test:functions`
Expected: PASS — 5 files (days, windows, token, sync logic, food-guard logic), 36 tests.

- [ ] **Step 6: HTTP plumbing shared by both functions**

Create `supabase/functions/_shared/http.ts`:

```ts
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { bearerToken, sha256Hex } from './token.ts';
import type { EatingWindow } from './windows.ts';

export const TOKEN_ERROR = 'Token not recognised — copy it again from Settings';
export const SERVER_ERROR = 'Server error — try again later';

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or service key');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Owner {
  userId: string;
  kcalGoal: number;
  fastingEnabled: boolean;
  windows: EatingWindow[];
}

/** The owner whose Shortcut token is in the request's Authorization header, or null. */
export async function ownerForRequest(db: SupabaseClient, req: Request): Promise<Owner | null> {
  const token = bearerToken(req.headers.get('Authorization'));
  if (!token) return null;
  const { data, error } = await db
    .from('settings')
    .select('user_id, kcal_goal, fasting_enabled, eating_windows')
    .eq('sync_token_hash', await sha256Hex(token))
    .maybeSingle();
  if (error) throw error;
  return data
    ? { userId: data.user_id, kcalGoal: data.kcal_goal, fastingEnabled: data.fasting_enabled, windows: data.eating_windows ?? [] }
    : null;
}
```

- [ ] **Step 7: The `sync` handler**

Create `supabase/functions/sync/index.ts`:

```ts
import { appDayOf, appToday, istDayOf, weekBlockRange } from '../_shared/days.ts';
import { adminClient, json, ownerForRequest, SERVER_ERROR, TOKEN_ERROR } from '../_shared/http.ts';
import { messageFor, pendingFor, validatePayload, type ManualHabit } from './logic.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  try {
    const db = adminClient();
    const owner = await ownerForRequest(db, req);
    if (!owner) return json(401, { error: TOKEN_ERROR });

    let body: unknown;
    try {
      // An empty body is fine: the Shortcut's final "just give me the nudge" call may send nothing.
      const text = await req.text();
      body = text.trim() ? JSON.parse(text) : {};
    } catch {
      return json(400, { error: 'Body must be JSON' });
    }
    const checked = validatePayload(body, istDayOf(new Date(Date.now() + 15 * 60_000)));
    if (!checked.ok) return json(400, { error: checked.error });
    const { steps, workouts } = checked.value;
    const now = new Date().toISOString();

    if (steps.length) {
      const { error } = await db.from('steps_daily').upsert(
        steps.map((s) => ({ user_id: owner.userId, day: s.date, count: s.count, synced_at: now })),
        { onConflict: 'user_id,day' },
      );
      if (error) throw error;
    }
    if (workouts.length) {
      const { error } = await db.from('workouts').upsert(
        workouts.map((w) => ({
          user_id: owner.userId, started_at: w.start, day: appDayOf(new Date(w.start)),
          duration_min: w.durationMin, name: w.name, source: 'health',
        })),
        { onConflict: 'user_id,started_at' },
      );
      if (error) throw error;
    }
    const { error: syncError } = await db.from('settings').update({ last_sync_at: now }).eq('user_id', owner.userId);
    if (syncError) throw syncError;

    const today = appToday();
    const { start } = weekBlockRange(today);
    const [habits, checks] = await Promise.all([
      db.from('habits').select('id, name, frequency, weekday, sort_order, created_at')
        .eq('user_id', owner.userId).eq('source', 'manual').is('archived_at', null),
      db.from('habit_checks').select('habit_id, day').eq('user_id', owner.userId).gte('day', start).lte('day', today),
    ]);
    if (habits.error) throw habits.error;
    if (checks.error) throw checks.error;
    const manual: ManualHabit[] = (habits.data ?? [])
      .filter((h) => appDayOf(new Date(h.created_at)) <= today)
      .map((h) => ({
        name: h.name, frequency: h.frequency, weekday: h.weekday, sortOrder: h.sort_order,
        checkedDays: (checks.data ?? []).filter((c) => c.habit_id === h.id).map((c) => c.day),
      }));
    const pending = pendingFor(today, manual);
    return json(200, { saved: { steps: steps.length, workouts: workouts.length }, pending, message: messageFor(pending) });
  } catch (e) {
    console.error(e);
    return json(500, { error: SERVER_ERROR });
  }
});
```

- [ ] **Step 8: The `food-guard` handler**

Create `supabase/functions/food-guard/index.ts`:

```ts
import { appToday, istMinutesOf } from '../_shared/days.ts';
import { adminClient, json, ownerForRequest, SERVER_ERROR, TOKEN_ERROR } from '../_shared/http.ts';
import { guardResult } from './logic.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  try {
    const db = adminClient();
    const owner = await ownerForRequest(db, req);
    if (!owner) return json(401, { error: TOKEN_ERROR });
    const now = new Date();
    const { data, error } = await db.from('food_entries').select('kcal').eq('user_id', owner.userId).eq('day', appToday(now));
    if (error) throw error;
    const kcal = (data ?? []).reduce((sum, row) => sum + row.kcal, 0);
    return json(200, guardResult({
      kcal, goal: owner.kcalGoal, fastingEnabled: owner.fastingEnabled, windows: owner.windows, minute: istMinutesOf(now),
    }));
  } catch (e) {
    console.error(e);
    return json(500, { error: SERVER_ERROR });
  }
});
```

- [ ] **Step 9: Deploy both functions**

```bash
npx supabase functions deploy sync --no-verify-jwt --use-api
npx supabase functions deploy food-guard --no-verify-jwt --use-api
```

Expected: `Deployed Functions on project <ref>: sync` and `…: food-guard`. (If the CLI says it isn't linked or logged in, ask Anvit to re-run Task 6 Step 4's first two commands.)

- [ ] **Step 10: Smoke-test the token check on the live functions**

```bash
URL=$(grep SUPABASE_URL .env.local | cut -d= -f2)
curl -s -w "\n%{http_code}\n" -X POST "$URL/functions/v1/sync" -H "Content-Type: application/json" -d '{}'
curl -s -w "\n%{http_code}\n" -X POST "$URL/functions/v1/food-guard" -H "Authorization: Bearer nope" -d '{}'
```

Expected, both: `{"error":"Token not recognised — copy it again from Settings"}` then `401`.
If you get `500` with `Missing SUPABASE_URL or service key` in **Supabase dashboard → Edge Functions → sync → Logs**, ask Anvit to copy a **secret key** (Project Settings → API Keys → Secret keys) and run `! npx supabase secrets set SERVICE_KEY=<secret key>`, then redeploy. The full 200 paths are tested in Task 15.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions
git commit -m "Add sync and food-guard Edge Functions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: App core — Supabase client, auth, clock, formatting, login, shell and routes

**Files:**
- Create: `src/app/core/supabase.ts`, `src/app/core/auth.service.ts`, `src/app/core/auth.guard.ts`
- Create: `src/app/core/clock.ts`, `src/app/core/clock.spec.ts`, `src/app/core/online.ts`, `src/app/core/toast.service.ts`
- Create: `src/app/core/format.ts`, `src/app/core/format.spec.ts`
- Create: `src/app/features/login/login.page.ts`, `src/app/features/login/login.page.spec.ts`
- Create: `src/app/features/shell/shell.ts`, `src/app/features/shell/tab-bar.ts`, `src/app/features/shell/tab-bar.spec.ts`, `src/app/features/shell/toast.ts`
- Create (stubs, replaced in Tasks 10–14): `src/app/features/today/today.page.ts`, `src/app/features/habits/habits.page.ts`, `src/app/features/food/food.page.ts`, `src/app/features/settings/settings.page.ts`, `src/app/features/report/report.page.ts`
- Modify: `src/app/app.ts`, `src/app/app.spec.ts`, `src/app/app.routes.ts`, `src/app/app.config.ts`

**Interfaces:**
- Consumes: `config.ts` (Task 6); `@shared/days` (`appDayOf`, `istMinutesOf`, `weekdayOf`); `@shared/windows` (`formatClock`).
- Produces: `SUPABASE: InjectionToken<SupabaseClient>`; `AuthService { session: Signal<Session|null>; email: Signal<string>; ready: Promise<void>; signIn(email, password): Promise<string|null>; signOut(): Promise<void> }`; `authGuard: CanActivateFn`; `Clock { today: Signal<Day>; minute: Signal<number>; instant: Signal<Date> }`; `Online { online: Signal<boolean> }`; `ToastService { message: Signal<string|null>; show(text): void }` plus constants `SAVE_FAILED`, `OFFLINE`; format helpers `formatNumber(n)`, `weekdayShort(day)` (`'Sun'`), `formatCompact(n)`, `formatDuration(min)`, `dayLabel(day)` (`'Mon 19 Oct'`), `dayLabelWithYear(day)`, `monthLabel(day)` (`'Oct 2026'`), `dayRange(from, to)` (`'19 Oct – 7 Nov'`), `timeOf(iso)` (`'6:00 PM'`), `hhmmOf(date)` (`'18:00'`); components `Shell`, `TabBar`, `Toast`, `LoginPage`; routes `/login`, `/today`, `/habits`, `/food`, `/settings`, `/report/:id`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/format.spec.ts`:

```ts
import { dayLabel, dayLabelWithYear, dayRange, formatCompact, formatDuration, formatNumber, hhmmOf, monthLabel, timeOf, weekdayShort } from './format';

describe('format', () => {
  it('formats numbers the Indian way', () => {
    expect(formatNumber(7842)).toBe('7,842');
    expect(formatNumber(196420)).toBe('1,96,420');
  });

  it('compacts large numbers', () => {
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(9821)).toBe('9.8k');
    expect(formatCompact(10000)).toBe('10k');
    expect(formatCompact(196420)).toBe('196k');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(200)).toBe('3h 20m');
  });

  it('labels days and months', () => {
    expect(dayLabel('2026-10-19')).toBe('Mon 19 Oct');
    expect(weekdayShort('2026-10-18')).toBe('Sun');
    expect(dayLabelWithYear('2026-11-08')).toBe('Sun 8 Nov 2026');
    expect(monthLabel('2026-10-19')).toBe('Oct 2026');
    expect(dayRange('2026-10-19', '2026-11-07')).toBe('19 Oct – 7 Nov');
  });

  it('shows IST clock times', () => {
    expect(timeOf('2026-10-19T12:30:00Z')).toBe('6:00 PM');
    expect(hhmmOf(new Date('2026-10-19T19:05:00Z'))).toBe('00:35');
  });
});
```

Create `src/app/core/clock.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Clock } from './clock';

describe('Clock', () => {
  afterEach(() => vi.useRealTimers());

  it('rolls today at 4:00 AM IST while the app stays open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T22:29:00Z')); // 03:59 IST on the 20th
    const clock = TestBed.inject(Clock);
    expect(clock.today()).toBe('2026-10-19');
    expect(clock.minute()).toBe(239);
    vi.advanceTimersByTime(60_000);
    expect(clock.today()).toBe('2026-10-20');
    expect(clock.minute()).toBe(240);
  });
});
```

Create `src/app/features/shell/tab-bar.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TabBar } from './tab-bar';

describe('TabBar', () => {
  it('links to the four screens', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(TabBar);
    await fixture.whenStable();
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/today', '/habits', '/food', '/settings']);
    expect(links.map((a) => a.textContent?.trim())).toEqual(['◉Today', '◔Habits', '🍽Food', '⚙Settings']);
  });
});
```

Create `src/app/features/login/login.page.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  const setup = (result: string | null) => {
    const signIn = vi.fn().mockResolvedValue(result);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: { signIn } }] });
    const fixture = TestBed.createComponent(LoginPage);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('input[type=email]') as HTMLInputElement).value = ' me@example.com ';
    (el.querySelector('input[type=password]') as HTMLInputElement).value = 'secret';
    return { fixture, el, signIn };
  };

  it('shows the sign-in error', async () => {
    const { fixture, el, signIn } = setup("Email or password didn't match");
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(signIn).toHaveBeenCalledWith('me@example.com', 'secret');
    expect(el.querySelector('[role=alert]')?.textContent).toContain("Email or password didn't match");
  });

  it('goes to Today after signing in', async () => {
    const { fixture, el } = setup(null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith('/today');
  });
});
```

Replace `src/app/app.spec.ts`:

```ts
import { Location } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';

describe('routing', () => {
  it('sends a signed-out visitor to the login page', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: AuthService, useValue: { ready: Promise.resolve(), session: signal(null), signIn: vi.fn() } }],
    });
    const harness = await RouterTestingHarness.create('/today');
    expect(harness.routeNativeElement?.textContent).toContain('Sign in');
    expect(TestBed.inject(Location).path()).toBe('/login');
  });
});
```


- [ ] **Step 2: Run them to see them fail**

Run: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./format`, `./clock`, `./tab-bar`, `./login.page`, `./app.routes` exports, `./core/auth.service`.

- [ ] **Step 3: Core services**

Create `src/app/core/supabase.ts`:

```ts
import { InjectionToken } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export const SUPABASE = new InjectionToken<SupabaseClient>('SUPABASE', {
  providedIn: 'root',
  factory: () =>
    createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    }),
});
```

Create `src/app/core/auth.service.ts`:

```ts
import { computed, inject, Injectable, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SUPABASE } from './supabase';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly db = inject(SUPABASE);
  readonly session = signal<Session | null>(null);
  readonly email = computed(() => this.session()?.user.email ?? '');
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.db.auth.getSession().then(({ data }) => this.session.set(data.session));
    this.db.auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.db.auth.signInWithPassword({ email, password });
    if (!error) return null;
    return error.status === 400 ? "Email or password didn't match" : "Couldn't sign in — check your connection";
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }
}
```

Create `src/app/core/auth.guard.ts`:

```ts
import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.session() ? true : router.createUrlTree(['/login']);
};
```

Create `src/app/core/clock.ts`:

```ts
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { appDayOf, istMinutesOf } from '@shared/days';

// End-to-end tests pin the app's time through this global so Supabase auth keeps using the real clock.
function currentTime(): Date {
  const pinned = (globalThis as { __countdownNow?: string }).__countdownNow;
  return pinned ? new Date(pinned) : new Date();
}

/** "Now" as signals; `today` is the app day (rolls at 4:00 AM IST), `minute` the IST clock minute. */
@Injectable({ providedIn: 'root' })
export class Clock {
  private readonly now = signal(currentTime());
  readonly instant = this.now.asReadonly();
  readonly today = computed(() => appDayOf(this.now()));
  readonly minute = computed(() => istMinutesOf(this.now()));

  constructor() {
    const tick = () => this.now.set(currentTime());
    const timer = setInterval(tick, 20_000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }
}
```

Create `src/app/core/online.ts`:

```ts
import { DestroyRef, inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Online {
  readonly online = signal(navigator.onLine);

  constructor() {
    const update = () => this.online.set(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    });
  }
}
```

Create `src/app/core/toast.service.ts`:

```ts
import { Injectable, signal } from '@angular/core';

export const SAVE_FAILED = "Couldn't save — check your connection";
export const OFFLINE = "Offline — changes won't save";

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(text: string): void {
    this.message.set(text);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(null), 3500);
  }
}
```

Create `src/app/core/format.ts`:

```ts
import { istMinutesOf, weekdayOf, type Day } from '@shared/days';
import { formatClock } from '@shared/windows';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const numbers = new Intl.NumberFormat('en-IN');

export function formatNumber(n: number): string {
  return numbers.format(n);
}

export function formatCompact(n: number): string {
  if (n >= 100_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const dayOfMonth = (day: Day) => Number(day.slice(8, 10));
const month = (day: Day) => MONTHS[Number(day.slice(5, 7)) - 1];

export function weekdayShort(day: Day): string {
  return WEEKDAYS[weekdayOf(day)];
}

export function dayLabel(day: Day): string {
  return `${weekdayShort(day)} ${dayOfMonth(day)} ${month(day)}`;
}

export function dayLabelWithYear(day: Day): string {
  return `${dayLabel(day)} ${day.slice(0, 4)}`;
}

export function monthLabel(day: Day): string {
  return `${month(day)} ${day.slice(0, 4)}`;
}

export function dayRange(from: Day, to: Day): string {
  return `${dayOfMonth(from)} ${month(from)} – ${dayOfMonth(to)} ${month(to)}`;
}

export function timeOf(iso: string): string {
  return formatClock(istMinutesOf(new Date(iso)));
}

export function hhmmOf(date: Date): string {
  const m = istMinutesOf(date);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Login page**

Create `src/app/features/login/login.page.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6">
      <h1 class="text-3xl font-black">Countdown</h1>
      <p class="muted">Sign in to your tracker.</p>
      <form class="flex flex-col gap-3" (submit)="submit($event, email.value, password.value)">
        <input #email class="field" type="email" name="email" autocomplete="username" placeholder="Email" required />
        <input #password class="field" type="password" name="password" autocomplete="current-password" placeholder="Password" required />
        <button class="btn" type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
        @if (error(); as e) {
          <p class="text-sm text-kcal" role="alert">{{ e }}</p>
        }
      </form>
    </main>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(event: Event, email: string, password: string): Promise<void> {
    event.preventDefault();
    this.busy.set(true);
    this.error.set(null);
    const problem = await this.auth.signIn(email.trim(), password);
    this.busy.set(false);
    if (problem) this.error.set(problem);
    else await this.router.navigateByUrl('/today');
  }
}
```

- [ ] **Step 5: Shell, tab bar and toast**

Create `src/app/features/shell/tab-bar.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-tab-bar',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <nav aria-label="Main"
      class="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur
             lg:static lg:w-48 lg:shrink-0 lg:border-0 lg:bg-transparent lg:pt-6">
      <ul class="mx-auto flex max-w-md justify-around lg:flex-col lg:gap-1">
        @for (tab of tabs; track tab.path) {
          <li>
            <a [routerLink]="tab.path" routerLinkActive="!text-steps font-bold" ariaCurrentWhenActive="page"
              class="flex flex-col items-center gap-0.5 px-4 py-2 text-[11px] text-muted lg:flex-row lg:gap-3 lg:rounded-xl lg:px-3 lg:text-sm"><span class="text-lg" aria-hidden="true">{{ tab.icon }}</span>{{ tab.label }}</a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class TabBar {
  protected readonly tabs = [
    { path: '/today', label: 'Today', icon: '◉' },
    { path: '/habits', label: 'Habits', icon: '◔' },
    { path: '/food', label: 'Food', icon: '🍽' },
    { path: '/settings', label: 'Settings', icon: '⚙' },
  ];
}
```

Create `src/app/features/shell/toast.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (toast.message(); as m) {
      <div role="status" class="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit max-w-[90%] rounded-xl bg-raised px-4 py-2 text-sm shadow-lg lg:bottom-6">{{ m }}</div>
    }
  `,
})
export class Toast {
  protected readonly toast = inject(ToastService);
}
```

Create `src/app/features/shell/shell.ts`:

```ts
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Online } from '../../core/online';
import { TabBar } from './tab-bar';
import { Toast } from './toast';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, TabBar, Toast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex min-h-dvh max-w-5xl pt-[env(safe-area-inset-top)] lg:gap-6 lg:px-6">
      <app-tab-bar />
      <main class="min-w-0 flex-1 px-3 pb-28 pt-3 lg:pb-6">
        @if (!online.online()) {
          <p role="status" class="mb-3 rounded-xl bg-raised px-3 py-2 text-center text-sm font-semibold text-count">Offline — changes won't save</p>
        }
        <router-outlet />
      </main>
    </div>
    <app-toast />
  `,
})
export class Shell {
  protected readonly online = inject(Online);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      if (this.auth.session() === null) void this.router.navigateByUrl('/login');
    });
  }
}
```

- [ ] **Step 6: Stub pages, routes, config and root**

Create each stub page (Tasks 10–14 replace them). `src/app/features/today/today.page.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({ selector: 'app-today-page', changeDetection: ChangeDetectionStrategy.OnPush, template: `<h1 class="text-2xl font-extrabold">Today</h1>` })
export class TodayPage {}
```

Create the same shape for `HabitsPage` (`src/app/features/habits/habits.page.ts`, selector `app-habits-page`, heading `Habits`), `FoodPage` (`src/app/features/food/food.page.ts`, `app-food-page`, `Food`), `SettingsPage` (`src/app/features/settings/settings.page.ts`, `app-settings-page`, `Settings`) and `ReportPage` (`src/app/features/report/report.page.ts`, `app-report-page`, `Report`).

Replace `src/app/app.routes.ts`:

```ts
import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'today' },
      { path: 'today', loadComponent: () => import('./features/today/today.page').then((m) => m.TodayPage) },
      { path: 'habits', loadComponent: () => import('./features/habits/habits.page').then((m) => m.HabitsPage) },
      { path: 'food', loadComponent: () => import('./features/food/food.page').then((m) => m.FoodPage) },
      { path: 'settings', loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage) },
      { path: 'report/:id', loadComponent: () => import('./features/report/report.page').then((m) => m.ReportPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
```

In `src/app/app.config.ts`, change the router provider to bind route params to inputs:

```ts
import { provideRouter, withComponentInputBinding } from '@angular/router';
// …
    provideRouter(routes, withComponentInputBinding()),
```

Replace `src/app/app.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class App {}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx ng test --watch=false`
Expected: PASS — format (5), clock (1), tab-bar (1), login (2), routing (1), plus domain suites.

- [ ] **Step 8: Browser check**

Run `npx ng serve` (background). Open `http://localhost:4200/` in a phone-sized (390×844) and a desktop-sized (1280×800) browser window. Expected: redirected to `/login`; black page with "Countdown", email/password fields, lime "Sign in" button. Sign in with the **test user** (`.env.local`) → lands on `/today` showing the stub "Today" heading, with the bottom tab bar on phone width and a left sidebar on desktop width. Wrong password → "Email or password didn't match". Stop the server.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "Add auth, clock, formatting, login, shell and routes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Data layer — row mapping, history, API and store

**Files:**
- Create: `src/app/data/rows.ts`, `src/app/data/history.ts`, `src/app/data/history.spec.ts`, `src/app/data/select-all.ts`
- Create: `src/app/data/tracker-api.ts`, `src/app/data/tracker.store.ts`, `src/app/data/tracker.store.spec.ts`
- Modify: `src/app/features/shell/shell.ts`

**Interfaces:**
- Consumes: `SUPABASE`, `Clock`, `Online`, `ToastService` (Task 8); domain types (Task 3); `@shared/days`.
- Produces (`rows.ts`): row interfaces `SettingsRow`, `HabitRow`, `CountdownRow`, `ChallengeRow`, `WorkoutRow`, `FoodEntryRow`, `SavedFoodRow`, `TaskRow`, `CheckRow`, `StepsRow`; mappers `toGoals`, `toHabit`, `toCountdown`, `toChallenge`, `toWorkout`.
- Produces (`history.ts`): `HistoryRows { checks: CheckRow[]; steps: StepsRow[]; workouts: WorkoutRow[]; food: FoodTotalsRow[] }` where `FoodTotalsRow = Pick<FoodEntryRow, 'day' | 'kcal' | 'protein_g' | 'eaten_at'>`; `foodDayOf(entries): FoodDay`; `buildHistory(rows): History`; `mergeHistory(older, newer): History`; `withCheck(h, habitId, day, on): History`; `withWorkouts(h, day, list): History`; `withFoodDay(h, day, food: FoodDay | null): History`.
- Produces (`select-all.ts`): `selectAll<T>(page: (from, to) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]>`.
- Produces (`TrackerApi`, all async, throw on error): `ensureSetup()`, `loadConfig(): { goals, lastSyncAt, hasToken, habits, countdowns, challenges }`, `loadHistory(from, to): HistoryRows`, `setCheck(habitId, day, on)`, `addManualWorkout(day, startedAt): WorkoutRow`, `deleteWorkout(id)`, `loadFoodDay(day): FoodEntryRow[]`, `addFood(input: NewFood): FoodEntryRow`, `updateFood(id, input: NewFood)`, `deleteFood(id)`, `loadSavedFoods(): SavedFoodRow[]`, `saveFood(name, kcal, proteinG): SavedFoodRow`, `deleteSavedFood(id)`, `bumpSavedFood(id, useCount)`, `addCountdown(title, emoji, targetDate)`, `updateCountdown(id, title, emoji, targetDate)`, `deleteCountdown(id)`, `addChallenge(countdownId, habitId, targetDays, startDay)`, `deleteChallenge(id)`, `addHabit(input: NewHabit)`, `updateHabit(id, input: NewHabit)`, `archiveHabit(id)`, `setSortOrders(ids: string[])`, `updateGoals(stepGoal, kcalGoal)`, `updateFasting(enabled, windows)`, `rotateToken(): string`, `loadTasks(month): TaskRow[]`, `addTask(title, month): TaskRow`, `setTaskDone(id, done)`, `deleteTask(id)`. `NewFood = { day, eatenAt, name, kcal, proteinG: number|null, savedFoodId: string|null }`; `NewHabit = { name, emoji, color, frequency, source, slot, weekday, sortOrder }`.
- Produces (`TrackerStore`, root): signals `loaded`, `habits`, `countdowns`, `challenges`, `goals`, `lastSyncAt`, `hasToken`, `history`, `today` (= `Clock.today`), `ctx` (computed `Ctx`); methods `load()`, `reload()`, `refreshIfStale()`, `reloadConfig()`, `ensureHistoryFrom(day)`, `toggleCheck(habitId, day)`, `addManualWorkout()`, `removeWorkout(w)`, `setFoodDay(day, entries: FoodEntryRow[])`, `guard(job): Promise<boolean>` (runs a write with offline check + toast on failure, then `reloadConfig()`), `rotateToken(): Promise<string | null>`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/data/history.spec.ts`:

```ts
import { buildHistory, mergeHistory, withCheck, withFoodDay } from './history';

const rows = {
  checks: [{ habit_id: 'a', day: '2026-10-19' }, { habit_id: 'a', day: '2026-10-20' }, { habit_id: 'b', day: '2026-10-20' }],
  steps: [{ day: '2026-10-19', count: 7842 }],
  workouts: [{ id: 'w1', started_at: '2026-10-19T12:32:00Z', day: '2026-10-19', duration_min: 52, name: 'Strength', source: 'health' as const }],
  food: [
    { day: '2026-10-19', kcal: 500, protein_g: 20, eaten_at: '2026-10-19T06:00:00Z' },
    { day: '2026-10-19', kcal: 700, protein_g: null, eaten_at: '2026-10-19T19:00:00Z' },
  ],
};

describe('history', () => {
  it('groups rows by habit and day', () => {
    const h = buildHistory(rows);
    expect([...(h.checks.get('a') ?? [])]).toEqual(['2026-10-19', '2026-10-20']);
    expect(h.steps.get('2026-10-19')).toBe(7842);
    expect(h.workouts.get('2026-10-19')?.[0]).toMatchObject({ id: 'w1', durationMin: 52, source: 'health' });
    expect(h.food.get('2026-10-19')).toEqual({ kcal: 1200, protein: 20, entries: 2, minutes: [690, 30] });
  });

  it('updates checks without mutating the original', () => {
    const h = buildHistory(rows);
    const off = withCheck(h, 'a', '2026-10-20', false);
    expect(off.checks.get('a')?.has('2026-10-20')).toBe(false);
    expect(h.checks.get('a')?.has('2026-10-20')).toBe(true);
    expect(withCheck(h, 'c', '2026-10-20', true).checks.get('c')?.has('2026-10-20')).toBe(true);
  });

  it('replaces or clears a food day', () => {
    const h = buildHistory(rows);
    expect(withFoodDay(h, '2026-10-19', null).food.has('2026-10-19')).toBe(false);
    expect(withFoodDay(h, '2026-10-20', { kcal: 1, protein: 0, entries: 1, minutes: [700] }).food.get('2026-10-20')?.kcal).toBe(1);
  });

  it('merges older history under newer', () => {
    const older = buildHistory({ ...rows, checks: [{ habit_id: 'a', day: '2026-09-01' }], steps: [{ day: '2026-10-19', count: 1 }] });
    const merged = mergeHistory(older, buildHistory(rows));
    expect([...(merged.checks.get('a') ?? [])].sort()).toEqual(['2026-09-01', '2026-10-19', '2026-10-20']);
    expect(merged.steps.get('2026-10-19')).toBe(7842);
  });
});
```

Create `src/app/data/tracker.store.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { ToastService } from '../core/toast.service';
import { TrackerApi } from './tracker-api';
import { TrackerStore } from './tracker.store';

function setup(api: Partial<TrackerApi>) {
  TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
  return { store: TestBed.inject(TrackerStore), toast: TestBed.inject(ToastService) };
}

const config = {
  goals: { stepGoal: 10000, kcalGoal: 2000, fastingEnabled: true, windows: [] },
  lastSyncAt: null, hasToken: false,
  habits: [{ id: 'h1', name: 'AM skincare', emoji: '🧴', color: '#30D158', frequency: 'daily' as const, source: 'manual' as const, slot: 'morning' as const, weekday: null, sortOrder: 1, createdDay: '2026-10-01', archivedDay: null }],
  countdowns: [], challenges: [],
};
const emptyRows = { checks: [], steps: [], workouts: [], food: [] };

describe('TrackerStore', () => {
  it('loads config and history, even when setup fails offline', async () => {
    const { store } = setup({
      ensureSetup: vi.fn().mockRejectedValue(new Error('offline')),
      loadConfig: vi.fn().mockResolvedValue(config),
      loadHistory: vi.fn().mockResolvedValue({ ...emptyRows, steps: [{ day: '2026-10-19', count: 5 }] }),
    });
    await store.load();
    expect(store.loaded()).toBe(true);
    expect(store.habits().map((h) => h.id)).toEqual(['h1']);
    expect(store.history().steps.get('2026-10-19')).toBe(5);
  });

  it('serialises rapid toggles so the server ends in the screen state', async () => {
    const calls: boolean[] = [];
    let release!: () => void;
    const firstDone = new Promise<void>((r) => (release = r));
    const { store } = setup({
      setCheck: vi.fn(async (_id: string, _day: string, on: boolean) => {
        calls.push(on);
        if (calls.length === 1) await firstDone;
      }),
    });
    const a = store.toggleCheck('h1', '2026-10-19');
    const b = store.toggleCheck('h1', '2026-10-19');
    await Promise.resolve();
    expect(calls).toEqual([true]);
    release();
    await Promise.all([a, b]);
    expect(calls).toEqual([true, false]);
    expect(store.history().checks.get('h1')?.has('2026-10-19') ?? false).toBe(false);
  });

  it('rolls back a failed tick and says so', async () => {
    const { store, toast } = setup({ setCheck: vi.fn().mockRejectedValue(new Error('down')) });
    await store.toggleCheck('h1', '2026-10-19');
    expect(store.history().checks.get('h1')?.has('2026-10-19') ?? false).toBe(false);
    expect(toast.message()).toBe("Couldn't save — check your connection");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx ng test --watch=false`
Expected: FAIL — cannot resolve `./history`, `./tracker-api`, `./tracker.store`.

- [ ] **Step 3: Rows and mappers**

Create `src/app/data/rows.ts`:

```ts
import { appDayOf } from '@shared/days';
import type { EatingWindow } from '@shared/windows';
import type { Challenge, Countdown, Goals, Habit, Workout } from '../domain/types';

export interface SettingsRow {
  step_goal: number;
  kcal_goal: number;
  last_sync_at: string | null;
  sync_token_hash: string | null;
  fasting_enabled: boolean;
  eating_windows: EatingWindow[];
}

export interface HabitRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  frequency: Habit['frequency'];
  source: Habit['source'];
  slot: Habit['slot'];
  weekday: number | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

export interface CountdownRow { id: string; title: string; emoji: string; target_date: string; created_at: string }
export interface ChallengeRow { id: string; countdown_id: string; habit_id: string; target_days: number; start_day: string }
export interface WorkoutRow { id: string; started_at: string; day: string; duration_min: number | null; name: string | null; source: Workout['source'] }
export interface FoodEntryRow { id: string; eaten_at: string; day: string; name: string; kcal: number; protein_g: number | null; saved_food_id: string | null }
export interface SavedFoodRow { id: string; name: string; kcal: number; protein_g: number | null; use_count: number }
export interface TaskRow { id: string; title: string; month: string; done_at: string | null }
export interface CheckRow { habit_id: string; day: string }
export interface StepsRow { day: string; count: number }

export const toGoals = (r: SettingsRow): Goals => ({
  stepGoal: r.step_goal, kcalGoal: r.kcal_goal, fastingEnabled: r.fasting_enabled, windows: r.eating_windows,
});

export const toHabit = (r: HabitRow): Habit => ({
  id: r.id, name: r.name, emoji: r.emoji, color: r.color, frequency: r.frequency, source: r.source, slot: r.slot,
  weekday: r.weekday, sortOrder: r.sort_order,
  createdDay: appDayOf(new Date(r.created_at)),
  archivedDay: r.archived_at ? appDayOf(new Date(r.archived_at)) : null,
});

export const toCountdown = (r: CountdownRow): Countdown => ({
  id: r.id, title: r.title, emoji: r.emoji, targetDate: r.target_date, createdDay: appDayOf(new Date(r.created_at)),
});

export const toChallenge = (r: ChallengeRow): Challenge => ({
  id: r.id, countdownId: r.countdown_id, habitId: r.habit_id, targetDays: r.target_days, startDay: r.start_day,
});

export const toWorkout = (r: WorkoutRow): Workout => ({
  id: r.id, startedAt: r.started_at, day: r.day, durationMin: r.duration_min, name: r.name, source: r.source,
});
```

- [ ] **Step 4: History building and immutable updates**

Create `src/app/data/history.ts`:

```ts
import { istMinutesOf, type Day } from '@shared/days';
import type { FoodDay, History, Workout } from '../domain/types';
import { toWorkout, type CheckRow, type FoodEntryRow, type StepsRow, type WorkoutRow } from './rows';

export type FoodTotalsRow = Pick<FoodEntryRow, 'day' | 'kcal' | 'protein_g' | 'eaten_at'>;

export interface HistoryRows {
  checks: CheckRow[];
  steps: StepsRow[];
  workouts: WorkoutRow[];
  food: FoodTotalsRow[];
}

export function foodDayOf(entries: readonly Pick<FoodEntryRow, 'kcal' | 'protein_g' | 'eaten_at'>[]): FoodDay {
  return {
    kcal: entries.reduce((sum, e) => sum + e.kcal, 0),
    protein: entries.reduce((sum, e) => sum + (e.protein_g ?? 0), 0),
    entries: entries.length,
    minutes: entries.map((e) => istMinutesOf(new Date(e.eaten_at))),
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return out;
}

export function buildHistory(rows: HistoryRows): History {
  return {
    checks: new Map([...groupBy(rows.checks, (c) => c.habit_id)].map(([id, list]) => [id, new Set(list.map((c) => c.day))])),
    steps: new Map(rows.steps.map((s) => [s.day, s.count])),
    workouts: new Map([...groupBy(rows.workouts, (w) => w.day)].map(([day, list]) => [day, list.map(toWorkout)])),
    food: new Map([...groupBy(rows.food, (f) => f.day)].map(([day, list]) => [day, foodDayOf(list)])),
  };
}

export function mergeHistory(older: History, newer: History): History {
  const checks = new Map<string, ReadonlySet<Day>>(older.checks);
  for (const [id, days] of newer.checks) checks.set(id, new Set([...(older.checks.get(id) ?? []), ...days]));
  return {
    checks,
    steps: new Map([...older.steps, ...newer.steps]),
    workouts: new Map([...older.workouts, ...newer.workouts]),
    food: new Map([...older.food, ...newer.food]),
  };
}

export function withCheck(h: History, habitId: string, day: Day, on: boolean): History {
  const days = new Set(h.checks.get(habitId) ?? []);
  if (on) days.add(day);
  else days.delete(day);
  return { ...h, checks: new Map(h.checks).set(habitId, days) };
}

export function withWorkouts(h: History, day: Day, list: readonly Workout[]): History {
  const workouts = new Map(h.workouts);
  if (list.length) workouts.set(day, list);
  else workouts.delete(day);
  return { ...h, workouts };
}

export function withFoodDay(h: History, day: Day, food: FoodDay | null): History {
  const map = new Map(h.food);
  if (food && food.entries > 0) map.set(day, food);
  else map.delete(day);
  return { ...h, food: map };
}
```

- [ ] **Step 5: Paged selects**

Create `src/app/data/select-all.ts`:

```ts
import type { PostgrestError } from '@supabase/supabase-js';

const PAGE = 1000;

/** Supabase returns at most 1000 rows per request; fetch ranged pages until a short one arrives. */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}
```

- [ ] **Step 6: The API (all database calls live here)**

Create `src/app/data/tracker-api.ts`:

```ts
import { inject, Injectable } from '@angular/core';
import type { Day } from '@shared/days';
import type { EatingWindow } from '@shared/windows';
import { SUPABASE } from '../core/supabase';
import type { Frequency, HabitSource, Slot } from '../domain/types';
import type { HistoryRows } from './history';
import {
  toChallenge, toCountdown, toGoals, toHabit,
  type ChallengeRow, type CountdownRow, type FoodEntryRow, type HabitRow, type SavedFoodRow, type SettingsRow, type TaskRow, type WorkoutRow,
} from './rows';
import { selectAll } from './select-all';

export interface NewFood { day: Day; eatenAt: string; name: string; kcal: number; proteinG: number | null; savedFoodId: string | null }
export interface NewHabit { name: string; emoji: string; color: string; frequency: Frequency; source: HabitSource; slot: Slot; weekday: number | null; sortOrder: number }

function must<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

@Injectable({ providedIn: 'root' })
export class TrackerApi {
  private readonly db = inject(SUPABASE);

  async ensureSetup(): Promise<void> {
    must(await this.db.rpc('ensure_setup'));
  }

  async loadConfig() {
    const [settings, habits, countdowns, challenges] = await Promise.all([
      this.db.from('settings').select('step_goal, kcal_goal, last_sync_at, sync_token_hash, fasting_enabled, eating_windows').single(),
      this.db.from('habits').select('*').order('sort_order'),
      this.db.from('countdowns').select('*').order('target_date'),
      this.db.from('challenges').select('*').order('created_at'),
    ]);
    const s = must(settings) as SettingsRow;
    return {
      goals: toGoals(s),
      lastSyncAt: s.last_sync_at,
      hasToken: s.sync_token_hash !== null,
      habits: (must(habits) as HabitRow[]).map(toHabit),
      countdowns: (must(countdowns) as CountdownRow[]).map(toCountdown),
      challenges: (must(challenges) as ChallengeRow[]).map(toChallenge),
    };
  }

  async loadHistory(from: Day, to: Day): Promise<HistoryRows> {
    const [checks, steps, workouts, food] = await Promise.all([
      selectAll((a, b) => this.db.from('habit_checks').select('habit_id, day').gte('day', from).lte('day', to).order('day').order('habit_id').range(a, b)),
      selectAll((a, b) => this.db.from('steps_daily').select('day, count').gte('day', from).lte('day', to).order('day').range(a, b)),
      selectAll((a, b) => this.db.from('workouts').select('id, started_at, day, duration_min, name, source').gte('day', from).lte('day', to).order('started_at').range(a, b)),
      selectAll((a, b) => this.db.from('food_entries').select('day, kcal, protein_g, eaten_at').gte('day', from).lte('day', to).order('eaten_at').range(a, b)),
    ]);
    return { checks, steps, workouts, food } as HistoryRows;
  }

  async setCheck(habitId: string, day: Day, on: boolean): Promise<void> {
    if (on) must(await this.db.from('habit_checks').upsert({ habit_id: habitId, day }, { onConflict: 'habit_id,day', ignoreDuplicates: true }));
    else must(await this.db.from('habit_checks').delete().eq('habit_id', habitId).eq('day', day));
  }

  async addManualWorkout(day: Day, startedAt: string): Promise<WorkoutRow> {
    return must(await this.db.from('workouts').insert({ day, started_at: startedAt, source: 'manual' }).select('id, started_at, day, duration_min, name, source').single()) as WorkoutRow;
  }

  async deleteWorkout(id: string): Promise<void> {
    must(await this.db.from('workouts').delete().eq('id', id));
  }

  async loadFoodDay(day: Day): Promise<FoodEntryRow[]> {
    return must(await this.db.from('food_entries').select('id, eaten_at, day, name, kcal, protein_g, saved_food_id').eq('day', day).order('eaten_at')) as FoodEntryRow[];
  }

  async addFood(f: NewFood): Promise<FoodEntryRow> {
    return must(await this.db.from('food_entries')
      .insert({ day: f.day, eaten_at: f.eatenAt, name: f.name, kcal: f.kcal, protein_g: f.proteinG, saved_food_id: f.savedFoodId })
      .select('id, eaten_at, day, name, kcal, protein_g, saved_food_id').single()) as FoodEntryRow;
  }

  async updateFood(id: string, f: NewFood): Promise<void> {
    must(await this.db.from('food_entries').update({ day: f.day, eaten_at: f.eatenAt, name: f.name, kcal: f.kcal, protein_g: f.proteinG }).eq('id', id));
  }

  async deleteFood(id: string): Promise<void> {
    must(await this.db.from('food_entries').delete().eq('id', id));
  }

  async loadSavedFoods(): Promise<SavedFoodRow[]> {
    return must(await this.db.from('saved_foods').select('id, name, kcal, protein_g, use_count').order('use_count', { ascending: false }).order('name')) as SavedFoodRow[];
  }

  async saveFood(name: string, kcal: number, proteinG: number | null): Promise<SavedFoodRow> {
    return must(await this.db.from('saved_foods').insert({ name, kcal, protein_g: proteinG, use_count: 1 }).select('id, name, kcal, protein_g, use_count').single()) as SavedFoodRow;
  }

  async deleteSavedFood(id: string): Promise<void> {
    must(await this.db.from('saved_foods').delete().eq('id', id));
  }

  async bumpSavedFood(id: string, useCount: number): Promise<void> {
    must(await this.db.from('saved_foods').update({ use_count: useCount }).eq('id', id));
  }

  async addCountdown(title: string, emoji: string, targetDate: Day): Promise<void> {
    must(await this.db.from('countdowns').insert({ title, emoji, target_date: targetDate }));
  }

  async updateCountdown(id: string, title: string, emoji: string, targetDate: Day): Promise<void> {
    must(await this.db.from('countdowns').update({ title, emoji, target_date: targetDate }).eq('id', id));
  }

  async deleteCountdown(id: string): Promise<void> {
    must(await this.db.from('countdowns').delete().eq('id', id));
  }

  async addChallenge(countdownId: string, habitId: string, targetDays: number, startDay: Day): Promise<void> {
    must(await this.db.from('challenges').insert({ countdown_id: countdownId, habit_id: habitId, target_days: targetDays, start_day: startDay }));
  }

  async deleteChallenge(id: string): Promise<void> {
    must(await this.db.from('challenges').delete().eq('id', id));
  }

  async addHabit(h: NewHabit): Promise<void> {
    must(await this.db.from('habits').insert({ name: h.name, emoji: h.emoji, color: h.color, frequency: h.frequency, source: h.source, slot: h.slot, weekday: h.weekday, sort_order: h.sortOrder }));
  }

  async updateHabit(id: string, h: NewHabit): Promise<void> {
    must(await this.db.from('habits').update({ name: h.name, emoji: h.emoji, color: h.color, frequency: h.frequency, slot: h.slot, weekday: h.weekday }).eq('id', id));
  }

  async archiveHabit(id: string): Promise<void> {
    must(await this.db.from('habits').update({ archived_at: new Date().toISOString() }).eq('id', id));
  }

  async setSortOrders(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map(async (id, i) => must(await this.db.from('habits').update({ sort_order: i + 1 }).eq('id', id))));
  }

  async updateGoals(stepGoal: number, kcalGoal: number): Promise<void> {
    must(await this.db.from('settings').update({ step_goal: stepGoal, kcal_goal: kcalGoal }).not('user_id', 'is', null));
  }

  async updateFasting(enabled: boolean, windows: readonly EatingWindow[]): Promise<void> {
    must(await this.db.from('settings').update({ fasting_enabled: enabled, eating_windows: windows }).not('user_id', 'is', null));
  }

  async rotateToken(): Promise<string> {
    return must(await this.db.rpc('rotate_sync_token')) as string;
  }

  async loadTasks(month: Day): Promise<TaskRow[]> {
    return must(await this.db.from('tasks').select('id, title, month, done_at').eq('month', month).order('created_at')) as TaskRow[];
  }

  async addTask(title: string, month: Day): Promise<TaskRow> {
    return must(await this.db.from('tasks').insert({ title, month }).select('id, title, month, done_at').single()) as TaskRow;
  }

  async setTaskDone(id: string, done: boolean): Promise<void> {
    must(await this.db.from('tasks').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id));
  }

  async deleteTask(id: string): Promise<void> {
    must(await this.db.from('tasks').delete().eq('id', id));
  }
}
```

(`settings` updates filter on `user_id is not null` because Supabase rejects an UPDATE without a filter; RLS already limits it to the caller's row.)

- [ ] **Step 7: The store**

Create `src/app/data/tracker.store.ts`:

```ts
import { computed, inject, Injectable, signal } from '@angular/core';
import { addDays, type Day } from '@shared/days';
import { Clock } from '../core/clock';
import { Online } from '../core/online';
import { OFFLINE, SAVE_FAILED, ToastService } from '../core/toast.service';
import { DEFAULT_GOALS, EMPTY_HISTORY, type Challenge, type Countdown, type Ctx, type Goals, type Habit, type History, type Workout } from '../domain/types';
import { buildHistory, foodDayOf, mergeHistory, withCheck, withFoodDay, withWorkouts } from './history';
import { toWorkout, type FoodEntryRow } from './rows';
import { TrackerApi } from './tracker-api';

@Injectable({ providedIn: 'root' })
export class TrackerStore {
  private readonly api = inject(TrackerApi);
  private readonly clock = inject(Clock);
  private readonly online = inject(Online);
  private readonly toast = inject(ToastService);

  readonly loaded = signal(false);
  readonly habits = signal<Habit[]>([]);
  readonly countdowns = signal<Countdown[]>([]);
  readonly challenges = signal<Challenge[]>([]);
  readonly goals = signal<Goals>(DEFAULT_GOALS);
  readonly lastSyncAt = signal<string | null>(null);
  readonly hasToken = signal(false);
  readonly history = signal<History>(EMPTY_HISTORY);
  readonly today = this.clock.today;
  readonly ctx = computed<Ctx>(() => ({ history: this.history(), goals: this.goals(), today: this.today() }));

  private loadedFrom: Day | null = null;
  private lastLoad = 0;
  private readonly queues = new Map<string, Promise<unknown>>();

  async load(): Promise<void> {
    try {
      await this.api.ensureSetup();
    } catch {
      // Offline: setup already ran on an earlier visit and the cached reads below still work.
    }
    await this.reload();
  }

  async reload(): Promise<void> {
    await this.reloadConfig();
    const today = this.today();
    const from = [addDays(today, -180), ...this.countdowns().map((c) => c.createdDay)].sort()[0];
    this.history.set(buildHistory(await this.api.loadHistory(from, today)));
    this.loadedFrom = from;
    this.lastLoad = Date.now();
    this.loaded.set(true);
  }

  async reloadConfig(): Promise<void> {
    const cfg = await this.api.loadConfig();
    this.goals.set(cfg.goals);
    this.lastSyncAt.set(cfg.lastSyncAt);
    this.hasToken.set(cfg.hasToken);
    this.habits.set(cfg.habits);
    this.countdowns.set(cfg.countdowns);
    this.challenges.set(cfg.challenges);
  }

  /** Picks up steps the Shortcut sent while the app was in the background. */
  async refreshIfStale(): Promise<void> {
    if (this.loaded() && Date.now() - this.lastLoad > 60_000) await this.reload().catch(() => undefined);
  }

  async ensureHistoryFrom(from: Day): Promise<void> {
    if (this.loadedFrom !== null && from >= this.loadedFrom) return;
    const to = this.loadedFrom ? addDays(this.loadedFrom, -1) : this.today();
    const older = buildHistory(await this.api.loadHistory(from, to));
    this.history.update((h) => mergeHistory(older, h));
    this.loadedFrom = from;
  }

  async toggleCheck(habitId: string, day: Day): Promise<void> {
    if (!this.online.online()) return this.toast.show(OFFLINE);
    const on = !(this.history().checks.get(habitId)?.has(day) ?? false);
    this.history.update((h) => withCheck(h, habitId, day, on));
    try {
      await this.enqueue(`${habitId}|${day}`, () => this.api.setCheck(habitId, day, on));
    } catch {
      this.history.update((h) => withCheck(h, habitId, day, !on));
      this.toast.show(SAVE_FAILED);
    }
  }

  async addManualWorkout(): Promise<void> {
    if (!this.online.online()) return this.toast.show(OFFLINE);
    const day = this.today();
    try {
      const row = await this.api.addManualWorkout(day, this.clock.instant().toISOString());
      this.history.update((h) => withWorkouts(h, day, [...(h.workouts.get(day) ?? []), toWorkout(row)]));
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }

  async removeWorkout(w: Workout): Promise<void> {
    if (!this.online.online()) return this.toast.show(OFFLINE);
    try {
      await this.api.deleteWorkout(w.id);
      this.history.update((h) => withWorkouts(h, w.day, (h.workouts.get(w.day) ?? []).filter((x) => x.id !== w.id)));
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }

  setFoodDay(day: Day, entries: readonly FoodEntryRow[]): void {
    this.history.update((h) => withFoodDay(h, day, entries.length ? foodDayOf(entries) : null));
  }

  /** Runs a settings-style write: refuses offline, toasts on failure, reloads config on success. */
  async guard(job: () => Promise<unknown>): Promise<boolean> {
    if (!this.online.online()) {
      this.toast.show(OFFLINE);
      return false;
    }
    try {
      await job();
      await this.reloadConfig();
      return true;
    } catch {
      this.toast.show(SAVE_FAILED);
      return false;
    }
  }

  async rotateToken(): Promise<string | null> {
    let token: string | null = null;
    const ok = await this.guard(async () => (token = await this.api.rotateToken()));
    return ok ? token : null;
  }

  private enqueue<T>(key: string, job: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(job, job);
    this.queues.set(key, next.catch(() => undefined));
    return next;
  }
}
```

- [ ] **Step 8: Load the store from the shell**

In `src/app/features/shell/shell.ts`: import `TrackerStore` from `'../../data/tracker.store'`; add the field `protected readonly store = inject(TrackerStore);`; wrap the outlet so pages only render once data is in; and refresh when the app comes back to the foreground. The template's `<router-outlet />` line becomes:

```html
        @if (store.loaded()) {
          <router-outlet />
        } @else {
          <p class="muted p-6 text-center">Loading…</p>
        }
```

and the constructor becomes:

```ts
  constructor() {
    void this.store.load().catch(() => this.toast.show("Couldn't load your data — check your connection and reopen the app"));
    effect(() => {
      if (this.auth.session() === null) void this.router.navigateByUrl('/login');
    });
    const onVisible = () => {
      if (!document.hidden) void this.store.refreshIfStale();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', onVisible));
  }
```

with the extra imports `DestroyRef` (from `@angular/core`) and `ToastService` (`'../../core/toast.service'`) and the field `private readonly toast = inject(ToastService);`.

- [ ] **Step 9: Run the tests to see them pass**

Run: `npx ng test --watch=false`
Expected: PASS — `history.spec.ts` (4), `tracker.store.spec.ts` (3), plus earlier suites.

- [ ] **Step 10: Browser check**

`npx ng serve`, sign in as the test user (phone-sized window). Expected: "Loading…" flashes, then the stub Today heading. In DevTools → Network, requests to `/rest/v1/settings`, `/habits`, `/countdowns`, `/challenges`, `/habit_checks`, `/steps_daily`, `/workouts`, `/food_entries` all return 200. Stop the server.

- [ ] **Step 11: Commit**

```bash
git add src/app/data src/app/features/shell/shell.ts
git commit -m "Add data layer: row mapping, history, API and store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Today screen and the Perfect Day moment

**Files:**
- Create: `src/app/core/storage.ts`
- Create: `src/app/features/today/today.vm.ts`, `src/app/features/today/today.vm.spec.ts`
- Create: `src/app/features/today/score-card.ts`, `countdowns-card.ts`, `fasting-card.ts`, `rings-card.ts`, `workout-card.ts`, `routines-card.ts`, `challenges-card.ts`, `today-cards.spec.ts` (all in `src/app/features/today/`)
- Create: `src/app/features/shell/perfect-day.ts`, `src/app/features/shell/perfect-day.spec.ts`
- Modify: `src/app/features/today/today.page.ts` (replace stub), `src/app/features/shell/shell.ts`

**Interfaces:**
- Consumes: `TrackerStore` (Task 9), `Clock`, `Online` (Task 8), domain (Tasks 3–5), `@shared/windows` (`fastState`, `formatClock`, `toMinutes`), format helpers (Task 8).
- Produces (`storage.ts`): `storageGet(key): string | null`, `storageSet(key, value): void` (both swallow storage errors).
- Produces (`today.vm.ts`): `TodayInput`, `TodayVm` (fields below), `CountdownTile`, `FastingVm`, `RoutineGroupVm`, `WeeklyVm`, `ChallengeGroupVm`, `ChallengeRowVm`, `buildTodayVm(input): TodayVm`.
- Produces (components, selectors): `app-score-card` (`score`, `perfect`, `streak`), `app-countdowns-card` (`tiles`), `app-fasting-card` (`fasting`), `app-rings-card` (`vm`), `app-workout-card` (`workouts`, `disabled`; outputs `trained`, `remove`), `app-routines-card` (`groups`, `weekly`, `today`, `disabled`; output `toggle: string`), `app-challenges-card` (`group`), `app-perfect-day` (`perfect`, `today`, `rings`, `streak`, `countThisMonth`).

- [ ] **Step 1: Write the failing view-model tests**

Create `src/app/features/today/today.vm.spec.ts`:

```ts
import { ctx, habit, history } from '../../domain/testing';
import type { Challenge, Countdown } from '../../domain/types';
import { buildTodayVm, type TodayInput } from './today.vm';

const countdowns: Countdown[] = [
  { id: 'eng', title: 'Engagement', emoji: '💍', targetDate: '2026-12-10', createdDay: '2026-10-19' },
  { id: 'diw', title: 'Diwali', emoji: '🪔', targetDate: '2026-11-08', createdDay: '2026-10-19' },
  { id: 'old', title: 'Past', emoji: '🎯', targetDate: '2026-10-01', createdDay: '2026-09-01' },
];
const habits = [
  habit('am', { name: 'AM skincare', slot: 'morning', sortOrder: 5 }),
  habit('mxa', { name: 'Minoxidil AM', slot: 'morning', sortOrder: 7 }),
  habit('pm', { name: 'PM skincare', slot: 'night', sortOrder: 6 }),
  habit('derma', { name: 'Dermarolling', frequency: 'weekly', slot: 'night', weekday: 0, sortOrder: 9 }),
  habit('steps', { name: '10k steps', source: 'steps', sortOrder: 1 }),
];
const input = (over: Partial<TodayInput> = {}): TodayInput => ({
  habits, countdowns, challenges: [], ctx: ctx('2026-10-19', history({ checks: { am: ['2026-10-19'], derma: ['2026-10-18'] } })),
  minute: 840, lastSyncAt: '2026-10-19T12:30:00Z', now: new Date('2026-10-19T14:00:00Z'), ...over,
});

describe('buildTodayVm', () => {
  it('lists upcoming countdowns by date with days left', () => {
    expect(buildTodayVm(input()).countdowns).toEqual([
      { id: 'diw', title: 'Diwali', emoji: '🪔', days: 20, isToday: false },
      { id: 'eng', title: 'Engagement', emoji: '💍', days: 52, isToday: false },
    ]);
    expect(buildTodayVm(input({ ctx: ctx('2026-11-08') })).countdowns[0]).toMatchObject({ id: 'diw', days: 0, isToday: true });
  });

  it('groups manual daily routines by slot and counts them', () => {
    const vm = buildTodayVm(input());
    expect(vm.routines.map((g) => [g.label, g.items.map((i) => [i.habit.id, i.done])])).toEqual([
      ['Morning', [['am', true], ['mxa', false]]],
      ['Night', [['pm', false]]],
    ]);
    expect([vm.routinesDone, vm.routinesTotal]).toEqual([1, 3]);
  });

  it("finds this week's weekly tick", () => {
    expect(buildTodayVm(input()).weekly).toEqual([{ habit: habits[3], doneDay: '2026-10-18' }]);
  });

  it('describes the fasting state, or none when fasting is off', () => {
    expect(buildTodayVm(input()).fasting).toEqual({ kind: 'fasting', nextAt: '12:00 AM', minutesUntilNext: 600, doneMinutes: 60, fraction: 60 / 660 });
    expect(buildTodayVm(input({ minute: 690 })).fasting).toEqual({ kind: 'open', closesAt: '1:00 PM', minutesLeft: 90, fraction: 0.25 });
    expect(buildTodayVm(input({ ctx: ctx('2026-10-19', history(), { fastingEnabled: false }) })).fasting).toBeNull();
  });

  it('flags a sync older than 24 hours', () => {
    expect(buildTodayVm(input()).syncStale).toBe(false);
    expect(buildTodayVm(input({ lastSyncAt: null })).syncStale).toBe(true);
    expect(buildTodayVm(input({ lastSyncAt: '2026-10-18T13:00:00Z' })).syncStale).toBe(true);
  });

  it('builds challenge cards with a pace-aware footer', () => {
    const challenges: Challenge[] = [{ id: 'c1', countdownId: 'diw', habitId: 'steps', targetDays: 15, startDay: '2026-10-19' }];
    const onTrack = buildTodayVm(input({ challenges }));
    expect(onTrack.challengeGroups).toHaveLength(1);
    expect(onTrack.challengeGroups[0]).toMatchObject({ title: 'Diwali', footer: '20 days left' });
    const threeDays = history({ steps: { '2026-10-19': 12_000, '2026-10-20': 12_000, '2026-10-21': 12_000 } });
    const behind = buildTodayVm(input({ challenges, ctx: ctx('2026-10-26', threeDays) }));
    expect(behind.challengeGroups[0].footer).toBe('Need 12 of the next 13 days');
    expect(buildTodayVm(input({ challenges, ctx: ctx('2026-11-08') })).challengeGroups).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx ng test --watch=false` → Expected: FAIL — cannot resolve `./today.vm`.

- [ ] **Step 3: Implement storage and the view model**

Create `src/app/core/storage.ts`:

```ts
// Per-device conveniences only; storage can be unavailable (private mode) and that's fine.
export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the setting just won't be remembered.
  }
}
```

Create `src/app/features/today/today.vm.ts`:

```ts
import { daysBetween, weekBlockRange } from '@shared/days';
import { fastState, formatClock, toMinutes } from '@shared/windows';
import { challengeProgress, type ChallengeProgress } from '../../domain/challenges';
import { dayScore, isPerfect, type DayScore } from '../../domain/scoring';
import { overallStreak, type StreakInfo } from '../../domain/streaks';
import { bySortOrder, isActiveOn } from '../../domain/visibility';
import type { Challenge, Countdown, Ctx, Day, Habit, Slot, Workout } from '../../domain/types';

export interface CountdownTile { id: string; title: string; emoji: string; days: number; isToday: boolean }
export interface ChallengeRowVm { id: string; habitName: string; progress: ChallengeProgress }
export interface ChallengeGroupVm { countdownId: string; title: string; emoji: string; rows: ChallengeRowVm[]; footer: string }
export interface RoutineVm { habit: Habit; done: boolean }
export interface RoutineGroupVm { slot: Slot; label: string; items: RoutineVm[] }
export interface WeeklyVm { habit: Habit; doneDay: Day | null }
export type FastingVm =
  | { kind: 'open'; closesAt: string; minutesLeft: number; fraction: number }
  | { kind: 'fasting'; nextAt: string; minutesUntilNext: number; doneMinutes: number; fraction: number };

export interface TodayVm {
  today: Day;
  score: DayScore;
  perfect: boolean;
  streak: StreakInfo;
  countdowns: CountdownTile[];
  fasting: FastingVm | null;
  steps: number;
  stepGoal: number;
  kcal: number;
  kcalGoal: number;
  routinesDone: number;
  routinesTotal: number;
  routines: RoutineGroupVm[];
  weekly: WeeklyVm[];
  workouts: readonly Workout[];
  challengeGroups: ChallengeGroupVm[];
  lastSyncAt: string | null;
  syncStale: boolean;
}

export interface TodayInput {
  habits: readonly Habit[];
  countdowns: readonly Countdown[];
  challenges: readonly Challenge[];
  ctx: Ctx;
  minute: number;
  lastSyncAt: string | null;
  now: Date;
}

const SLOTS: { slot: Slot; label: string }[] = [
  { slot: 'morning', label: 'Morning' },
  { slot: 'night', label: 'Night' },
  { slot: 'anytime', label: 'Anytime' },
];

const isPresent = <T>(x: T | null): x is T => x !== null;

function fastingVm(ctx: Ctx, minute: number): FastingVm | null {
  const f = ctx.goals.fastingEnabled ? fastState(minute, ctx.goals.windows) : null;
  if (f === null) return null;
  return f.kind === 'open'
    ? { kind: 'open', closesAt: formatClock(toMinutes(f.window.end)), minutesLeft: f.minutesLeft, fraction: f.fraction }
    : { kind: 'fasting', nextAt: formatClock(f.nextStart), minutesUntilNext: f.minutesUntilNext, doneMinutes: f.doneMinutes, fraction: f.fraction };
}

export function buildTodayVm(i: TodayInput): TodayVm {
  const { ctx } = i;
  const today = ctx.today;
  const score = dayScore(i.habits, today, ctx);
  const active = i.habits.filter((h) => isActiveOn(h, today)).sort(bySortOrder);
  const manualDaily = active.filter((h) => h.frequency === 'daily' && h.source === 'manual');
  const doneToday = (h: Habit) => ctx.history.checks.get(h.id)?.has(today) ?? false;

  const routines = SLOTS
    .map(({ slot, label }) => ({ slot, label, items: manualDaily.filter((h) => h.slot === slot).map((habit) => ({ habit, done: doneToday(habit) })) }))
    .filter((g) => g.items.length > 0);

  const block = weekBlockRange(today);
  const weekly = active
    .filter((h) => h.frequency === 'weekly' && h.source === 'manual')
    .map((habit) => {
      const days = [...(ctx.history.checks.get(habit.id) ?? [])].filter((d) => d >= block.start && d <= today).sort();
      return { habit, doneDay: days.at(-1) ?? null };
    });

  const upcoming = i.countdowns.filter((c) => c.targetDate >= today).sort((a, b) => a.targetDate.localeCompare(b.targetDate));

  const challengeGroups = upcoming
    .filter((cd) => cd.targetDate > today)
    .map((cd) => {
      const rows = i.challenges
        .filter((ch) => ch.countdownId === cd.id)
        .map((ch) => {
          const habit = i.habits.find((h) => h.id === ch.habitId);
          return habit ? { id: ch.id, habitName: habit.name, progress: challengeProgress(ch, habit, cd, ctx) } : null;
        })
        .filter(isPresent);
      const behind = rows.find((r) => r.progress.status === 'behind');
      const footer = behind
        ? `Need ${behind.progress.needed} of the next ${behind.progress.left} days`
        : `${daysBetween(today, cd.targetDate)} days left`;
      return { countdownId: cd.id, title: cd.title, emoji: cd.emoji, rows, footer };
    })
    .filter((g) => g.rows.length > 0);

  return {
    today,
    score,
    perfect: isPerfect(score),
    streak: overallStreak(i.habits, ctx),
    countdowns: upcoming.map((c) => {
      const days = daysBetween(today, c.targetDate);
      return { id: c.id, title: c.title, emoji: c.emoji, days, isToday: days === 0 };
    }),
    fasting: fastingVm(ctx, i.minute),
    steps: ctx.history.steps.get(today) ?? 0,
    stepGoal: ctx.goals.stepGoal,
    kcal: ctx.history.food.get(today)?.kcal ?? 0,
    kcalGoal: ctx.goals.kcalGoal,
    routinesDone: manualDaily.filter(doneToday).length,
    routinesTotal: manualDaily.length,
    routines,
    weekly,
    workouts: ctx.history.workouts.get(today) ?? [],
    challengeGroups,
    lastSyncAt: i.lastSyncAt,
    syncStale: i.lastSyncAt === null || i.now.getTime() - Date.parse(i.lastSyncAt) > 24 * 3_600_000,
  };
}
```

Run: `npx ng test --watch=false` → Expected: `today.vm.spec.ts` PASS (6).

- [ ] **Step 4: Write the failing component tests**

Create `src/app/features/today/today-cards.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Type } from '@angular/core';
import { habit } from '../../domain/testing';
import { ChallengesCard } from './challenges-card';
import { CountdownsCard } from './countdowns-card';
import { FastingCard } from './fasting-card';
import { RoutinesCard } from './routines-card';
import { ScoreCard } from './score-card';
import { WorkoutCard } from './workout-card';

async function render<T>(type: Type<T>, inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(type);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const progress = (status: string) => ({ done: 6, target: 15, window: 20, elapsed: 7, left: 13, status, pace: 0.35, needed: 9, endDay: '2026-11-07', finished: false });

describe('Today cards', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('ScoreCard shows the live score, Perfect Day text and the freeze chip only when available', async () => {
    const streak = { length: 12, freezeAvailable: true, frozen: new Set() };
    const { el } = await render(ScoreCard, { score: { done: 4, total: 8, score: 50 }, perfect: false, streak });
    expect(el.textContent).toContain('50');
    expect(el.textContent).toContain('4 of 8 done · 4 to go for a ⭐ Perfect Day');
    expect(el.textContent).toContain('🔥 12-day streak');
    expect(el.textContent).toContain('❄️ 1 freeze');
    const perfect = await render(ScoreCard, { score: { done: 8, total: 8, score: 100 }, perfect: true, streak: { ...streak, freezeAvailable: false } });
    expect(perfect.el.textContent).toContain('⭐ Perfect Day!');
    expect(perfect.el.textContent).not.toContain('freeze');
  });

  it('CountdownsCard shows days left, and a report link on the day', async () => {
    const { el } = await render(CountdownsCard, { tiles: [{ id: 'd', title: 'Diwali', emoji: '🪔', days: 20, isToday: false }] });
    expect(el.textContent).toContain('20');
    expect(el.textContent).toContain('days to 🪔 Diwali');
    const onDay = await render(CountdownsCard, { tiles: [{ id: 'd', title: 'Diwali', emoji: '🪔', days: 0, isToday: true }] });
    expect(onDay.el.textContent).toContain('Today! 🪔');
    expect(onDay.el.querySelector('a')?.getAttribute('href')).toBe('/report/d');
  });

  it('FastingCard switches between open and fasting', async () => {
    const open = await render(FastingCard, { fasting: { kind: 'open', closesAt: '1:00 PM', minutesLeft: 90, fraction: 0.25 } });
    expect(open.el.textContent).toContain('🍽️ Eating window');
    expect(open.el.textContent).toContain('closes 1:00 PM · 1h 30m left');
    const fasting = await render(FastingCard, { fasting: { kind: 'fasting', nextAt: '12:00 AM', minutesUntilNext: 600, doneMinutes: 60, fraction: 0.09 } });
    expect(fasting.el.textContent).toContain('🌙 Fasting · 1h done');
    expect(fasting.el.textContent).toContain('next window 12:00 AM in 10h');
  });

  it('RoutinesCard emits the habit id when a routine is tapped', async () => {
    const am = habit('am', { name: 'AM skincare', emoji: '🧴' });
    const { fixture, el } = await render(RoutinesCard, {
      groups: [{ slot: 'morning', label: 'Morning', items: [{ habit: am, done: false }] }], weekly: [], today: '2026-10-19', disabled: false,
    });
    const emitted: string[] = [];
    fixture.componentInstance.toggle.subscribe((id: string) => emitted.push(id));
    (el.querySelector('[role=checkbox]') as HTMLButtonElement).click();
    expect(emitted).toEqual(['am']);
  });

  it('WorkoutCard offers "Trained today" when there is no workout', async () => {
    const { fixture, el } = await render(WorkoutCard, { workouts: [], disabled: false });
    let trained = 0;
    fixture.componentInstance.trained.subscribe(() => trained++);
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(trained).toBe(1);
    const synced = await render(WorkoutCard, { workouts: [{ id: 'w', startedAt: '', day: '2026-10-19', durationMin: 52, name: 'Push day', source: 'health' }], disabled: false });
    expect(synced.el.textContent).toContain('Push day');
    expect(synced.el.textContent).toContain('52m ✓');
    expect(synced.el.querySelector('button')).toBeNull();
  });

  it('ChallengesCard labels each status', async () => {
    const group = {
      countdownId: 'd', title: 'Diwali', emoji: '🪔', footer: '13 days left',
      rows: ['on_track', 'behind', 'won', 'out_of_reach'].map((s, i) => ({ id: String(i), habitName: `h${i}`, progress: progress(s) })),
    };
    const { el } = await render(ChallengesCard, { group });
    for (const label of ['ON TRACK', 'BEHIND', 'WON 🏆', 'OUT OF REACH']) expect(el.textContent).toContain(label);
    expect(el.textContent).toContain('13 days left');
  });
});
```

Create `src/app/features/shell/perfect-day.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { PerfectDay } from './perfect-day';

async function render(perfect: boolean) {
  const fixture = TestBed.createComponent(PerfectDay);
  fixture.componentRef.setInput('perfect', perfect);
  fixture.componentRef.setInput('today', '2026-10-19');
  fixture.componentRef.setInput('rings', 8);
  fixture.componentRef.setInput('streak', 13);
  fixture.componentRef.setInput('countThisMonth', 5);
  await fixture.whenStable();
  return fixture;
}

describe('PerfectDay', () => {
  beforeEach(() => localStorage.clear());

  it('celebrates once per day', async () => {
    const first = await render(true);
    const el = first.nativeElement as HTMLElement;
    expect(el.querySelector('[role=dialog]')?.textContent).toContain('PERFECT DAY');
    expect(el.textContent).toContain('All 8 rings closed');
    expect(el.textContent).toContain('Perfect Day #5 this month');
    (el.querySelector('button') as HTMLButtonElement).click();
    await first.whenStable();
    expect(el.querySelector('[role=dialog]')).toBeNull();
    const again = await render(true);
    expect((again.nativeElement as HTMLElement).querySelector('[role=dialog]')).toBeNull();
  });

  it('stays hidden on an ordinary day', async () => {
    const f = await render(false);
    expect((f.nativeElement as HTMLElement).querySelector('[role=dialog]')).toBeNull();
  });
});
```

- [ ] **Step 5: Run them to see them fail**

Run: `npx ng test --watch=false` → Expected: FAIL — cannot resolve the card components and `./perfect-day`.

- [ ] **Step 6: The cards**

Create `src/app/features/today/score-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DayScore } from '../../domain/scoring';
import type { StreakInfo } from '../../domain/streaks';

@Component({
  selector: 'app-score-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card flex items-center gap-3" aria-label="Today's score">
      <div class="relative size-16 shrink-0">
        <svg viewBox="0 0 64 64" class="size-16 -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r="27" fill="none" stroke="#2c2c2e" stroke-width="7" />
          <circle cx="32" cy="32" r="27" fill="none" stroke="#ffd60a" stroke-width="7" stroke-linecap="round" [attr.stroke-dasharray]="dash()" />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <b class="text-lg">{{ score().score }}</b><span class="text-[8px] text-muted">LIVE</span>
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-bold">Today's score</p>
        <p class="muted">{{ perfect() ? '⭐ Perfect Day!' : score().done + ' of ' + score().total + ' done · ' + (score().total - score().done) + ' to go for a ⭐ Perfect Day' }}</p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <span class="whitespace-nowrap rounded-lg bg-[#3a2a10] px-2 py-0.5 text-xs font-extrabold text-streak">🔥 {{ streak().length }}-day streak</span>
          @if (streak().freezeAvailable) {
            <span class="whitespace-nowrap rounded-lg bg-[#10303a] px-2 py-0.5 text-xs font-bold text-routine">❄️ 1 freeze</span>
          }
        </div>
      </div>
    </section>
  `,
})
export class ScoreCard {
  readonly score = input.required<DayScore>();
  readonly perfect = input.required<boolean>();
  readonly streak = input.required<StreakInfo>();
  protected readonly dash = computed(() => `${(2 * Math.PI * 27 * this.score().score) / 100} 999`);
}
```

Create `src/app/features/today/countdowns-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CountdownTile } from './today.vm';

@Component({
  selector: 'app-countdowns-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card flex justify-around bg-gradient-to-br from-card to-raised text-center" aria-label="Countdowns">
      @for (t of tiles(); track t.id; let first = $first, last = $last) {
        <div class="px-2">
          @if (t.isToday) {
            <p class="text-2xl font-black text-count">Today! {{ t.emoji }}</p>
            <p class="muted">{{ t.title }}</p>
            <a class="mt-1 inline-block text-xs font-bold text-routine" [routerLink]="['/report', t.id]">See your report card →</a>
          } @else {
            <p class="text-3xl font-black leading-none" [class.text-count]="first" [class.text-kcal]="!first">{{ t.days }}</p>
            <p class="muted">{{ t.days === 1 ? 'day' : 'days' }} to {{ t.emoji }} {{ t.title }}</p>
          }
        </div>
        @if (!last) {
          <div class="w-px bg-line"></div>
        }
      } @empty {
        <p class="muted">No countdowns yet — add one in Settings.</p>
      }
    </section>
  `,
})
export class CountdownsCard {
  readonly tiles = input.required<CountdownTile[]>();
}
```

Create `src/app/features/today/fasting-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatDuration } from '../../core/format';
import type { FastingVm } from './today.vm';

@Component({
  selector: 'app-fasting-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = fasting();
    <section class="card flex items-center gap-3" aria-label="Fasting">
      <svg viewBox="0 0 64 64" class="size-14 shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r="26" fill="none" stroke="#2c2c2e" stroke-width="7" />
        <circle cx="32" cy="32" r="26" fill="none" stroke-width="7" stroke-linecap="round" [attr.stroke]="f.kind === 'open' ? '#a3f53b' : '#bf5af2'" [attr.stroke-dasharray]="dash()" />
      </svg>
      @if (f.kind === 'open') {
        <div>
          <p class="text-sm font-bold">🍽️ Eating window</p>
          <p class="muted">closes {{ f.closesAt }} · {{ dur(f.minutesLeft) }} left</p>
        </div>
      }
      @if (f.kind === 'fasting') {
        <div>
          <p class="text-sm font-bold">🌙 Fasting · {{ dur(f.doneMinutes) }} done</p>
          <p class="muted">next window {{ f.nextAt }} in {{ dur(f.minutesUntilNext) }}</p>
        </div>
      }
    </section>
  `,
})
export class FastingCard {
  readonly fasting = input.required<FastingVm>();
  protected readonly dur = formatDuration;
  protected readonly dash = computed(() => `${2 * Math.PI * 26 * Math.min(1, this.fasting().fraction)} 999`);
}
```

Create `src/app/features/today/rings-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { appDayOf } from '@shared/days';
import { dayLabel, formatCompact, formatNumber, timeOf } from '../../core/format';
import type { TodayVm } from './today.vm';

@Component({
  selector: 'app-rings-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card flex items-center gap-3" aria-label="Rings">
      <svg viewBox="0 0 64 64" class="size-20 shrink-0 -rotate-90" aria-hidden="true">
        @for (r of rings(); track r.radius) {
          <circle cx="32" cy="32" [attr.r]="r.radius" fill="none" [attr.stroke]="r.track" stroke-width="6" />
          <circle cx="32" cy="32" [attr.r]="r.radius" fill="none" [attr.stroke]="r.color" stroke-width="6" stroke-linecap="round" [attr.stroke-dasharray]="r.dash" />
        }
      </svg>
      <div class="text-sm leading-7">
        <p><span class="text-steps">●</span> <b>{{ n(vm().steps) }}</b> / {{ compact(vm().stepGoal) }} steps</p>
        <a routerLink="/food" class="block"><span class="text-kcal">●</span> <b>{{ n(vm().kcal) }}</b> / {{ n(vm().kcalGoal) }} kcal</a>
        <p><span class="text-routine">●</span> <b>{{ vm().routinesDone }}</b> / {{ vm().routinesTotal }} routines</p>
        <p class="text-xs" [class.text-streak]="vm().syncStale" [class.text-muted]="!vm().syncStale">{{ syncLabel() }}</p>
      </div>
    </section>
  `,
})
export class RingsCard {
  readonly vm = input.required<TodayVm>();
  protected readonly n = formatNumber;
  protected readonly compact = formatCompact;

  protected readonly rings = computed(() => {
    const v = this.vm();
    const ring = (radius: number, fraction: number, color: string, track: string) => ({
      radius, color, track, dash: `${2 * Math.PI * radius * Math.max(0, Math.min(1, fraction))} 999`,
    });
    return [
      ring(28, v.steps / v.stepGoal, '#a3f53b', '#2a3a1a'),
      ring(20, v.kcal / v.kcalGoal, '#ff375f', '#3a1a22'),
      ring(12, v.routinesTotal ? v.routinesDone / v.routinesTotal : 0, '#32d7fa', '#10303a'),
    ];
  });

  protected readonly syncLabel = computed(() => {
    const at = this.vm().lastSyncAt;
    if (!at) return 'Steps not synced yet';
    return this.vm().syncStale ? `Steps last synced ${dayLabel(appDayOf(new Date(at)))}, ${timeOf(at)}` : `Steps synced ${timeOf(at)}`;
  });
}
```

Create `src/app/features/today/workout-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatDuration } from '../../core/format';
import type { Workout } from '../../domain/types';

@Component({
  selector: 'app-workout-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Workout">
      <p class="label mb-1 text-steps">Workout · from Strong</p>
      @for (w of workouts(); track w.id) {
        <div class="flex items-center justify-between py-1 text-sm">
          <span>💪 <b>{{ w.name ?? (w.source === 'manual' ? 'Trained' : 'Workout') }}</b></span>
          <span class="flex items-center gap-2">
            <span class="font-bold text-steps">{{ w.durationMin !== null ? dur(w.durationMin) + ' ✓' : '✓' }}</span>
            @if (w.source === 'manual') {
              <button type="button" class="text-xs text-muted underline" [disabled]="disabled()" (click)="remove.emit(w)">Remove</button>
            }
          </span>
        </div>
      } @empty {
        <button type="button" class="btn w-full" [disabled]="disabled()" (click)="trained.emit()">Trained today ✓</button>
      }
    </section>
  `,
})
export class WorkoutCard {
  readonly workouts = input.required<readonly Workout[]>();
  readonly disabled = input(false);
  readonly trained = output<void>();
  readonly remove = output<Workout>();
  protected readonly dur = formatDuration;
}
```

Create `src/app/features/today/routines-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { weekdayShort } from '../../core/format';
import type { Day } from '../../domain/types';
import type { RoutineGroupVm, WeeklyVm } from './today.vm';

@Component({
  selector: 'app-routines-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Routines">
      <p class="label mb-1 text-routine">Routines · tap to tick</p>
      @for (g of groups(); track g.slot) {
        <p class="mt-1 text-[10px] font-semibold uppercase text-muted">{{ g.label }}</p>
        <div class="grid grid-cols-2 gap-x-2">
          @for (r of g.items; track r.habit.id) {
            <button type="button" role="checkbox" [attr.aria-checked]="r.done" [disabled]="disabled()" (click)="toggle.emit(r.habit.id)"
              class="flex items-center gap-2 py-1.5 text-left text-sm disabled:opacity-50">
              <span class="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-black"
                [class]="r.done ? 'bg-routine text-black' : 'border-[1.5px] border-line'">{{ r.done ? '✓' : '' }}</span>
              {{ r.habit.emoji }} {{ r.habit.name }}
            </button>
          }
        </div>
      } @empty {
        <p class="muted">No routines yet — add habits in Settings.</p>
      }
      @for (w of weekly(); track w.habit.id) {
        <div class="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-xs">
          <span>{{ w.habit.emoji }} {{ w.habit.name }} this week: {{ w.doneDay ? 'done ' + weekday(w.doneDay) + ' ✓' : 'not yet' }}</span>
          @if (!w.doneDay || w.doneDay === today()) {
            <button type="button" class="btn-quiet !py-1 text-xs" [disabled]="disabled()" (click)="toggle.emit(w.habit.id)">{{ w.doneDay ? 'Undo' : 'Done today' }}</button>
          }
        </div>
      }
    </section>
  `,
})
export class RoutinesCard {
  readonly groups = input.required<RoutineGroupVm[]>();
  readonly weekly = input.required<WeeklyVm[]>();
  readonly today = input.required<Day>();
  readonly disabled = input(false);
  readonly toggle = output<string>();
  protected readonly weekday = weekdayShort;
}
```

Create `src/app/features/today/challenges-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ChallengeProgress, ChallengeStatus } from '../../domain/challenges';
import type { ChallengeGroupVm } from './today.vm';

const CHIPS: Record<ChallengeStatus, { text: string; cls: string; bar: string }> = {
  on_track: { text: 'ON TRACK', cls: 'bg-[#1f3a10] text-steps', bar: '#a3f53b' },
  behind: { text: 'BEHIND', cls: 'bg-[#3a1a22] text-kcal', bar: '#ff375f' },
  won: { text: 'WON 🏆', cls: 'bg-[#3a2a00] text-count', bar: '#ffd60a' },
  out_of_reach: { text: 'OUT OF REACH', cls: 'bg-raised text-muted', bar: '#8e8e93' },
};

@Component({
  selector: 'app-challenges-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" [attr.aria-label]="group().title + ' challenges'">
      <p class="label mb-1 text-count">{{ group().emoji }} {{ group().title }} · challenges</p>
      @for (r of group().rows; track r.id) {
        <div class="mt-2">
          <div class="flex items-center justify-between text-sm">
            <span>{{ r.habitName }}</span>
            <span><b>{{ r.progress.done }}</b>/{{ r.progress.target }} days
              <span class="ml-1 rounded-md px-1.5 py-px text-[9px] font-extrabold" [class]="chips[r.progress.status].cls">{{ chips[r.progress.status].text }}</span></span>
          </div>
          <div class="relative mt-1 h-1.5 rounded bg-raised">
            <div class="h-full rounded" [style.width.%]="pct(r.progress)" [style.background]="chips[r.progress.status].bar"></div>
            <span class="absolute -top-0.5 h-2.5 w-0.5 bg-white/70" [style.left.%]="r.progress.pace * 100" aria-hidden="true"></span>
          </div>
        </div>
      }
      <p class="muted mt-2">{{ group().footer }}</p>
    </section>
  `,
})
export class ChallengesCard {
  readonly group = input.required<ChallengeGroupVm>();
  protected readonly chips = CHIPS;
  protected pct(p: ChallengeProgress): number {
    return Math.min(100, (100 * p.done) / p.target);
  }
}
```

- [ ] **Step 7: The Perfect Day overlay**

Create `src/app/features/shell/perfect-day.ts`:

```ts
import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { storageGet, storageSet } from '../../core/storage';
import type { Day } from '../../domain/types';

const KEY = 'perfect-day-shown';
const COLORS = ['#ffd60a', '#ff375f', '#a3f53b', '#32d7fa', '#bf5af2', '#ff9f0a'];

@Component({
  selector: 'app-perfect-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .confetti { position: absolute; top: -20px; border-radius: 2px; animation: fall 2.6s linear infinite; }
    @keyframes fall { to { transform: translateY(110vh) rotate(540deg); } }
  `,
  template: `
    @if (visible()) {
      <div role="dialog" aria-modal="true" aria-label="Perfect Day"
        class="fixed inset-0 z-40 grid place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#3a2a00_0%,#000_65%)] text-center">
        @for (c of confetti; track $index) {
          <span class="confetti" [style.left.%]="c.left" [style.background]="c.color" [style.animation-delay.ms]="c.delay" [style.width.px]="c.size" [style.height.px]="c.size * 1.8"></span>
        }
        <div class="relative z-10 px-6">
          <div class="text-6xl">⭐</div>
          <p class="mt-2 text-3xl font-black tracking-wide text-count">PERFECT DAY</p>
          <p class="mt-1 text-sm text-[#d1d1d6]">All {{ rings() }} rings closed · <b>100</b>/100</p>
          <p class="mx-auto mt-5 w-fit rounded-xl bg-[#3a2a10] px-4 py-1.5 text-base font-extrabold text-streak">🔥 {{ streak() }}-day streak</p>
          <p class="muted mt-3">Perfect Day #{{ countThisMonth() }} this month.<br />A gold ⭐ goes on today's spoke of the wheel.</p>
          <button type="button" class="mt-6 rounded-xl bg-count px-6 py-2 text-sm font-bold text-black" (click)="visible.set(false)">Nice 🙌</button>
        </div>
      </div>
    }
  `,
})
export class PerfectDay {
  readonly perfect = input.required<boolean>();
  readonly today = input.required<Day>();
  readonly rings = input.required<number>();
  readonly streak = input.required<number>();
  readonly countThisMonth = input.required<number>();
  protected readonly visible = signal(false);
  protected readonly confetti = Array.from({ length: 60 }, (_, i) => ({
    left: (i * 37) % 100, color: COLORS[i % COLORS.length], delay: (i * 97) % 2600, size: 4 + (i % 5),
  }));

  constructor() {
    effect(() => {
      if (this.perfect() && storageGet(KEY) !== this.today()) {
        storageSet(KEY, this.today());
        this.visible.set(true);
      }
    });
  }
}
```

- [ ] **Step 8: The Today page and the overlay in the shell**

Replace `src/app/features/today/today.page.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Clock } from '../../core/clock';
import { dayLabel } from '../../core/format';
import { Online } from '../../core/online';
import { TrackerStore } from '../../data/tracker.store';
import { ChallengesCard } from './challenges-card';
import { CountdownsCard } from './countdowns-card';
import { FastingCard } from './fasting-card';
import { RingsCard } from './rings-card';
import { RoutinesCard } from './routines-card';
import { ScoreCard } from './score-card';
import { buildTodayVm } from './today.vm';
import { WorkoutCard } from './workout-card';

@Component({
  selector: 'app-today-page',
  imports: [ScoreCard, CountdownsCard, FastingCard, RingsCard, WorkoutCard, RoutinesCard, ChallengesCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = vm();
    <header class="mb-3 flex items-end justify-between px-1">
      <div>
        <p class="text-xs tracking-wide text-muted">{{ header() }}</p>
        <h1 class="text-2xl font-extrabold">Let's go 🔥</h1>
      </div>
      @if (isIos) {
        <a href="shortcuts://run-shortcut?name=Countdown%20Sync" class="rounded-xl bg-[#10303a] px-3 py-1.5 text-xs font-semibold text-routine">↻ Sync iPhone</a>
      }
    </header>
    <div class="grid gap-2 lg:grid-cols-2">
      <app-score-card [score]="v.score" [perfect]="v.perfect" [streak]="v.streak" />
      <app-countdowns-card [tiles]="v.countdowns" />
      @if (v.fasting; as f) {
        <app-fasting-card [fasting]="f" />
      }
      <app-rings-card [vm]="v" />
      <app-workout-card [workouts]="v.workouts" [disabled]="!online()" (trained)="store.addManualWorkout()" (remove)="store.removeWorkout($event)" />
      <app-routines-card [groups]="v.routines" [weekly]="v.weekly" [today]="v.today" [disabled]="!online()" (toggle)="store.toggleCheck($event, v.today)" />
      @for (g of v.challengeGroups; track g.countdownId) {
        <app-challenges-card [group]="g" />
      }
    </div>
  `,
})
export class TodayPage {
  protected readonly store = inject(TrackerStore);
  private readonly clock = inject(Clock);
  protected readonly online = inject(Online).online;
  protected readonly isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  protected readonly header = computed(() => dayLabel(this.store.today()).toUpperCase());
  protected readonly vm = computed(() =>
    buildTodayVm({
      habits: this.store.habits(), countdowns: this.store.countdowns(), challenges: this.store.challenges(),
      ctx: this.store.ctx(), minute: this.clock.minute(), lastSyncAt: this.store.lastSyncAt(), now: this.clock.instant(),
    }),
  );
}
```

In `src/app/features/shell/shell.ts`: add `PerfectDay` to `imports`; add these imports at the top:

```ts
import { computed } from '@angular/core';
import { eachDay, monthStart } from '@shared/days';
import { dayScore, isPerfect } from '../../domain/scoring';
import { overallStreak } from '../../domain/streaks';
import { PerfectDay } from './perfect-day';
```

add the field:

```ts
  protected readonly perfectInfo = computed(() => {
    const ctx = this.store.ctx();
    const habits = this.store.habits();
    const score = dayScore(habits, ctx.today, ctx);
    return {
      perfect: this.store.loaded() && isPerfect(score),
      rings: score.total,
      streak: overallStreak(habits, ctx).length,
      count: eachDay(monthStart(ctx.today), ctx.today).filter((d) => isPerfect(dayScore(habits, d, ctx))).length,
    };
  });
```

and append to the template, after `<app-toast />`:

```html
    @let p = perfectInfo();
    <app-perfect-day [perfect]="p.perfect" [today]="store.today()" [rings]="p.rings" [streak]="p.streak" [countThisMonth]="p.count" />
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `npx ng test --watch=false`
Expected: PASS — `today.vm.spec.ts` (6), `today-cards.spec.ts` (6), `perfect-day.spec.ts` (2), plus earlier suites.

- [ ] **Step 10: Browser check**

`npx ng serve`; sign in as the test user; phone-sized window. Expected on `/today`:
- header with today's date
- score card at 0–something with 🔥 streak and ❄️ chip
- Diwali + Engagement tiles with the right day counts
- the fasting card (a "Fasting" or "Eating window" state matching your clock)
- rings at 0 / 10k steps and 0 / 2,000 kcal, "Steps not synced yet" in amber
- "Trained today ✓" button; routines grouped Morning / Night with Dermarolling's weekly line

Tap "AM skincare": its circle fills and the routines count goes up, and both stay after a reload. Tap "Trained today ✓" → "💪 Trained ✓ Remove". Tick every routine and add a workout → the score goes up but not to 100 (steps/calories/fasting aren't done) — the overlay must not appear. Desktop width: cards in two columns. Stop the server.

- [ ] **Step 11: Commit**

```bash
git add src/app/core/storage.ts src/app/features/today src/app/features/shell
git commit -m "Add Today screen, game cards and Perfect Day overlay" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Habits screen — wheel, grid, weekly and monthly one-offs

**Files:**
- Create: `src/app/features/habits/month-matrix.ts`, `month-matrix.spec.ts`, `wheel-geometry.ts`, `wheel-geometry.spec.ts`
- Create: `src/app/features/habits/habit-wheel.ts`, `habit-grid.ts`, `weekly-card.ts`, `tasks-card.ts`, `habits-cards.spec.ts`
- Modify: `src/app/features/habits/habits.page.ts` (replace stub)

**Interfaces:**
- Consumes: domain (`habitDone`, `dayScore`, `isPerfect`, `bestRun`, `overallStreak`, `habitsForMonth`, `isActiveOn`, `firstHabitDay`), `TrackerStore`, `TrackerApi` (`loadTasks`, `addTask`, `setTaskDone`, `deleteTask`), `storageGet/Set`, `monthLabel`.
- Produces (`month-matrix.ts`): `MatrixRow { habit, done: boolean[], doneCount, elapsed, bestStreak }`, `WeeklyRow { habit, blocks: boolean[] }` (5), `MonthMatrix { month, days, todayIndex, rows, perfect: boolean[], frozen: boolean[], weekly }`, `buildMonthMatrix(habits, month, ctx, frozenDays): MonthMatrix`.
- Produces (`wheel-geometry.ts`): `WHEEL { cx: 160, cy: 162, span: 270, outer: 141, minInner: 52 }`, `polar(r, deg): [number, number]`, `arcPath(r, a0, a1)`, `wedgePath(rIn, rOut, a0, a1)`, `ringWidth(rings)`, `ringMid(i, rings)`, `dayAngle(i, days)`, `dotRadius(r, days)`.
- Produces (components): `app-habit-wheel` (`matrix`), `app-habit-grid` (`matrix`, `today`, `disabled`; output `toggle: { habitId: string; day: Day }`), `app-weekly-card` (`rows`), `app-tasks-card` (`month`).

- [ ] **Step 1: Write the failing tests**

Create `src/app/features/habits/month-matrix.spec.ts`:

```ts
import { ctx, habit, history } from '../../domain/testing';
import { buildMonthMatrix } from './month-matrix';

const habits = [
  habit('a', { sortOrder: 1 }),
  habit('cal', { source: 'calories', sortOrder: 2 }),
  habit('late', { createdDay: '2026-10-15', sortOrder: 3 }),
  habit('derma', { frequency: 'weekly', sortOrder: 4 }),
];
const h = history({
  checks: { a: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-19'], late: ['2026-10-16'], derma: ['2026-10-04', '2026-10-18'] },
  food: { '2026-10-18': { kcal: 1500 }, '2026-10-19': { kcal: 900 } },
});

describe('buildMonthMatrix', () => {
  const m = buildMonthMatrix(habits, '2026-10-19', ctx('2026-10-19', h), new Set(['2026-10-04']));

  it('lays out the month with today marked', () => {
    expect(m.month).toBe('2026-10-01');
    expect(m.days).toHaveLength(31);
    expect(m.todayIndex).toBe(18);
    expect(m.rows.map((r) => r.habit.id)).toEqual(['a', 'cal', 'late']);
  });

  it('fills done dots, leaving today\'s calories empty until the day is over', () => {
    const cal = m.rows[1];
    expect(cal.done[17]).toBe(true);  // 18 Oct
    expect(cal.done[18]).toBe(false); // today
  });

  it('counts done, elapsed active days and best streak', () => {
    expect(m.rows[0]).toMatchObject({ doneCount: 5, elapsed: 19, bestStreak: 3 });
    expect(m.rows[2]).toMatchObject({ doneCount: 1, elapsed: 5 });
  });

  it('marks perfect past days and frozen days', () => {
    expect(m.perfect.every((p, i) => !p || i < 18)).toBe(true);
    expect(m.frozen[3]).toBe(true);
    expect(m.frozen.filter(Boolean)).toHaveLength(1);
  });

  it('fills weekly blocks W1–W5', () => {
    expect(m.weekly).toEqual([{ habit: habits[3], blocks: [true, false, true, false, false] }]);
  });
});
```

Create `src/app/features/habits/wheel-geometry.spec.ts`:

```ts
import { arcPath, dayAngle, dotRadius, polar, ringMid, ringWidth, WHEEL } from './wheel-geometry';

describe('wheel geometry', () => {
  it('measures angles clockwise from 12 o\'clock', () => {
    const [x0, y0] = polar(100, 0);
    expect(x0).toBeCloseTo(160);
    expect(y0).toBeCloseTo(62);
    const [x1, y1] = polar(100, 90);
    expect(x1).toBeCloseTo(260);
    expect(y1).toBeCloseTo(162);
  });

  it('uses the large-arc flag for the 270° band', () => {
    expect(arcPath(100, 0, 270)).toContain(' 0 1 1 ');
    expect(arcPath(100, 0, 90)).toContain(' 0 0 1 ');
  });

  it('shrinks rings to fit many habits', () => {
    expect(ringWidth(7)).toBe(12.5);
    expect(ringWidth(12)).toBeCloseTo((WHEEL.outer - WHEEL.minInner) / 12);
    expect(ringMid(0, 7)).toBeCloseTo(134.75);
  });

  it('spreads days over 270° and sizes dots to fit', () => {
    expect(dayAngle(0, 30)).toBeCloseTo(4.5);
    expect(dayAngle(29, 30)).toBeCloseTo(265.5);
    expect(dotRadius(134.75, 31)).toBe(4.6);
    expect(dotRadius(60, 31)).toBeLessThan(4.6);
  });
});
```

Create `src/app/features/habits/habits-cards.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { ctx, habit, history } from '../../domain/testing';
import { TrackerApi } from '../../data/tracker-api';
import { HabitGrid } from './habit-grid';
import { HabitWheel } from './habit-wheel';
import { buildMonthMatrix } from './month-matrix';
import { TasksCard } from './tasks-card';

const habits = [habit('a', { name: 'AM skincare', color: '#30D158' }), habit('steps', { name: '10k steps', source: 'steps' })];
// Lets async loads triggered by effects finish and re-render.
const settle = async (f: { whenStable(): Promise<unknown> }) => {
  await f.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  await f.whenStable();
};
const matrix = buildMonthMatrix(habits, '2026-10-19', ctx('2026-10-19', history({ checks: { a: ['2026-10-01', '2026-10-02'] }, steps: { '2026-10-01': 12000 } })), new Set());

describe('Habits cards', () => {
  it('HabitWheel draws one dot per done day, stars perfect days and marks auto habits', async () => {
    const fixture = TestBed.createComponent(HabitWheel);
    fixture.componentRef.setInput('matrix', matrix);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('circle')).toHaveLength(3);
    expect([...el.querySelectorAll('text')].map((t) => t.textContent)).toContain('★');
    expect(el.textContent).toContain('10k steps ⚡');
  });

  it('HabitGrid lets you fix past manual days only', async () => {
    const fixture = TestBed.createComponent(HabitGrid);
    fixture.componentRef.setInput('matrix', matrix);
    fixture.componentRef.setInput('today', '2026-10-19');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons).toHaveLength(19); // AM skincare, 1–19 Oct; none for steps or future days
    const emitted: unknown[] = [];
    fixture.componentInstance.toggle.subscribe((e) => emitted.push(e));
    buttons[2].click();
    expect(emitted).toEqual([{ habitId: 'a', day: '2026-10-03' }]);
    expect(el.textContent).toContain('2/19 days · best streak 2');
  });

  it('TasksCard adds and deletes one-offs (delete needs a second tap)', async () => {
    const api = {
      loadTasks: vi.fn().mockResolvedValue([{ id: 't1', title: 'Haircut before Diwali', month: '2026-10-01', done_at: null }]),
      addTask: vi.fn().mockResolvedValue({ id: 't2', title: 'Diwali outfit', month: '2026-10-01', done_at: null }),
      deleteTask: vi.fn().mockResolvedValue(undefined),
      setTaskDone: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
    const fixture = TestBed.createComponent(TasksCard);
    fixture.componentRef.setInput('month', '2026-10-01');
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Haircut before Diwali');
    (el.querySelector('input') as HTMLInputElement).value = 'Diwali outfit';
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(api.addTask).toHaveBeenCalledWith('Diwali outfit', '2026-10-01');
    expect(el.textContent).toContain('Diwali outfit');
    const del = el.querySelector('[aria-label="Delete Haircut before Diwali"]') as HTMLButtonElement;
    del.click();
    await settle(fixture);
    expect(api.deleteTask).not.toHaveBeenCalled();
    del.click();
    await settle(fixture);
    expect(api.deleteTask).toHaveBeenCalledWith('t1');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx ng test --watch=false` → Expected: FAIL — unresolved `./month-matrix`, `./wheel-geometry`, `./habit-wheel`, `./habit-grid`, `./tasks-card`.

- [ ] **Step 3: Matrix and geometry**

Create `src/app/features/habits/month-matrix.ts`:

```ts
import { eachDay, monthEnd, monthStart, weekBlock } from '@shared/days';
import { dayScore, habitDone, isPerfect } from '../../domain/scoring';
import { bestRun } from '../../domain/streaks';
import { habitsForMonth, isActiveOn } from '../../domain/visibility';
import type { Ctx, Day, Habit } from '../../domain/types';

export interface MatrixRow { habit: Habit; done: boolean[]; doneCount: number; elapsed: number; bestStreak: number }
export interface WeeklyRow { habit: Habit; blocks: boolean[] }
export interface MonthMatrix {
  month: Day;
  days: Day[];
  todayIndex: number;
  rows: MatrixRow[];
  perfect: boolean[];
  frozen: boolean[];
  weekly: WeeklyRow[];
}

export function buildMonthMatrix(habits: readonly Habit[], month: Day, ctx: Ctx, frozenDays: ReadonlySet<Day>): MonthMatrix {
  const days = eachDay(monthStart(month), monthEnd(month));
  const visible = habitsForMonth(habits, month);
  const past = (d: Day) => d <= ctx.today;

  const rows = visible
    .filter((h) => h.frequency === 'daily')
    .map((habit) => {
      // The wheel shows final results, so today's calories/fasting stay empty until the day is over.
      const done = days.map((d) => isActiveOn(habit, d) && habitDone(habit, d, ctx, 'final'));
      return {
        habit,
        done,
        doneCount: days.filter((d, i) => done[i] && past(d)).length,
        elapsed: days.filter((d) => past(d) && isActiveOn(habit, d)).length,
        bestStreak: bestRun(done.filter((_, i) => past(days[i]))),
      };
    });

  const weekly = visible
    .filter((h) => h.frequency === 'weekly')
    .map((habit) => {
      const checks = ctx.history.checks.get(habit.id) ?? new Set<Day>();
      return { habit, blocks: [1, 2, 3, 4, 5].map((b) => days.some((d) => weekBlock(d) === b && checks.has(d))) };
    });

  return {
    month: days[0],
    days,
    todayIndex: days.indexOf(ctx.today),
    rows,
    perfect: days.map((d) => d < ctx.today && isPerfect(dayScore(habits, d, ctx))),
    frozen: days.map((d) => frozenDays.has(d)),
    weekly,
  };
}
```

Create `src/app/features/habits/wheel-geometry.ts`:

```ts
/** The planner wheel: a 270° spiral from 12 o'clock clockwise, outermost ring = first habit. */
export const WHEEL = { cx: 160, cy: 162, span: 270, outer: 141, minInner: 52 } as const;

export function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [WHEEL.cx + r * Math.sin(a), WHEEL.cy - r * Math.cos(a)];
}

export function arcPath(r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

export function wedgePath(rIn: number, rOut: number, a0: number, a1: number): string {
  const [ax, ay] = polar(rOut, a0);
  const [bx, by] = polar(rOut, a1);
  const [cx, cy] = polar(rIn, a1);
  const [dx, dy] = polar(rIn, a0);
  return `M${ax} ${ay} A${rOut} ${rOut} 0 0 1 ${bx} ${by} L${cx} ${cy} A${rIn} ${rIn} 0 0 0 ${dx} ${dy}Z`;
}

export function ringWidth(rings: number): number {
  return rings === 0 ? 0 : Math.min(12.5, (WHEEL.outer - WHEEL.minInner) / rings);
}

export function ringMid(i: number, rings: number): number {
  return WHEEL.outer - (i + 0.5) * ringWidth(rings);
}

export function dayAngle(i: number, days: number): number {
  return ((i + 0.5) * WHEEL.span) / days;
}

export function dotRadius(r: number, days: number): number {
  return Math.min(4.6, ((r * WHEEL.span * Math.PI) / 180 / days) * 0.36);
}
```

- [ ] **Step 4: Wheel, grid, weekly and one-off components**

Create `src/app/features/habits/habit-wheel.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { monthLabel } from '../../core/format';
import type { MonthMatrix } from './month-matrix';
import { arcPath, dayAngle, dotRadius, polar, ringMid, ringWidth, wedgePath, WHEEL } from './wheel-geometry';

@Component({
  selector: 'app-habit-wheel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 320 320" class="w-full" role="img" [attr.aria-label]="'Habit wheel for ' + title()">
      @if (todayWedge(); as w) {
        <path [attr.d]="w" fill="#1f2d10" />
      }
      <path [attr.d]="band" fill="none" stroke="#2c2c2e" stroke-width="13" />
      @for (d of dayLabels(); track d.key) {
        <text [attr.x]="d.x" [attr.y]="d.y + 2.5" text-anchor="middle" font-size="6.5" [attr.fill]="d.fill" [attr.font-weight]="d.bold ? 800 : 500">{{ d.text }}</text>
      }
      @for (r of ringLines(); track $index) {
        <path [attr.d]="r" fill="none" stroke="#2c2c2e" stroke-width="0.8" />
      }
      @for (s of spokes(); track $index) {
        <line [attr.x1]="s[0]" [attr.y1]="s[1]" [attr.x2]="s[2]" [attr.y2]="s[3]" stroke="#2c2c2e" stroke-width="0.8" />
      }
      @for (dot of dots(); track dot.key) {
        <circle [attr.cx]="dot.x" [attr.cy]="dot.y" [attr.r]="dot.r" [attr.fill]="dot.color" />
      }
      @for (l of labels(); track l.key) {
        <line x1="6" [attr.y1]="l.y + 4" [attr.x2]="cx - 2" [attr.y2]="l.y + 4" stroke="#2c2c2e" stroke-width="0.6" />
        <text [attr.x]="cx - 6" [attr.y]="l.y + 2.5" text-anchor="end" font-size="8.5" fill="#d1d1d6">{{ l.text }}</text>
      }
      <text [attr.x]="cx + 14" [attr.y]="cy + 4" text-anchor="middle" font-size="20" font-weight="900" fill="#fff">{{ shortMonth() }}</text>
      <text [attr.x]="cx + 14" [attr.y]="cy + 16" text-anchor="middle" font-size="7" fill="#8e8e93">⚡ = fills automatically</text>
    </svg>
    @if (matrix().rows.length === 0) {
      <p class="muted text-center">No daily habits this month.</p>
    }
  `,
})
export class HabitWheel {
  readonly matrix = input.required<MonthMatrix>();
  protected readonly cx = WHEEL.cx;
  protected readonly cy = WHEEL.cy;
  protected readonly band = arcPath(WHEEL.outer + 8, 0, WHEEL.span);

  protected readonly title = computed(() => monthLabel(this.matrix().month));
  protected readonly shortMonth = computed(() => this.title().slice(0, 3).toUpperCase());
  private readonly step = computed(() => WHEEL.span / this.matrix().days.length);
  private readonly inner = computed(() => WHEEL.outer - this.matrix().rows.length * ringWidth(this.matrix().rows.length));

  protected readonly todayWedge = computed(() => {
    const i = this.matrix().todayIndex;
    return i < 0 ? null : wedgePath(this.inner(), WHEEL.outer + 15, i * this.step(), (i + 1) * this.step());
  });

  protected readonly dayLabels = computed(() => {
    const m = this.matrix();
    return m.days.map((day, i) => {
      const [x, y] = polar(WHEEL.outer + 8, dayAngle(i, m.days.length));
      const today = i === m.todayIndex;
      return { key: day, x, y, text: m.perfect[i] ? '★' : String(i + 1), bold: today || m.perfect[i], fill: m.perfect[i] ? '#ffd60a' : today ? '#a3f53b' : '#8e8e93' };
    });
  });

  protected readonly ringLines = computed(() => {
    const n = this.matrix().rows.length;
    return Array.from({ length: n + 1 }, (_, k) => arcPath(WHEEL.outer - k * ringWidth(n), 0, WHEEL.span));
  });

  protected readonly spokes = computed(() =>
    Array.from({ length: this.matrix().days.length + 1 }, (_, s) => [...polar(this.inner(), s * this.step()), ...polar(WHEEL.outer, s * this.step())]),
  );

  protected readonly dots = computed(() => {
    const m = this.matrix();
    return m.rows.flatMap((row, i) => {
      const r = ringMid(i, m.rows.length);
      return row.done.flatMap((done, j) => {
        if (!done) return [];
        const [x, y] = polar(r, dayAngle(j, m.days.length));
        return [{ key: `${row.habit.id}-${j}`, x, y, r: dotRadius(r, m.days.length), color: row.habit.color }];
      });
    });
  });

  protected readonly labels = computed(() => {
    const m = this.matrix();
    return m.rows.map((row, i) => ({
      key: row.habit.id,
      y: WHEEL.cy - ringMid(i, m.rows.length),
      text: row.habit.name + (row.habit.source === 'manual' ? '' : ' ⚡'),
    }));
  });
}
```

Create `src/app/features/habits/habit-grid.ts`:

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { isActiveOn } from '../../domain/visibility';
import type { Day, Habit } from '../../domain/types';
import type { MonthMatrix } from './month-matrix';

@Component({
  selector: 'app-habit-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = matrix();
    <div class="overflow-x-auto">
      <table class="border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th class="sticky left-0 z-10 bg-card pr-2 text-left font-semibold text-muted">Habit</th>
            @for (d of m.days; track d; let i = $index) {
              <th class="w-6 min-w-6 text-center font-medium" [class.text-steps]="i === m.todayIndex" [class.text-muted]="i !== m.todayIndex">
                <div class="h-3 text-[9px] leading-3">{{ m.perfect[i] ? '⭐' : m.frozen[i] ? '❄️' : '' }}</div>{{ i + 1 }}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of m.rows; track row.habit.id) {
            <tr>
              <th class="sticky left-0 z-10 max-w-28 truncate bg-card py-1 pr-2 text-left font-normal">{{ row.habit.name }}{{ row.habit.source === 'manual' ? '' : ' ⚡' }}</th>
              @for (d of m.days; track d; let i = $index) {
                <td class="text-center" [style.background]="i === m.todayIndex ? '#1f2d10' : null">
                  @if (tappable(row.habit, d)) {
                    <button type="button" class="size-6" [attr.aria-label]="row.habit.name + ' on ' + d" [attr.aria-pressed]="row.done[i]" [disabled]="disabled()" (click)="toggle.emit({ habitId: row.habit.id, day: d })">
                      <span class="inline-block size-3 rounded-full" [style.background]="row.done[i] ? row.habit.color : 'transparent'" [style.border]="row.done[i] ? 'none' : '1px solid #48484a'"></span>
                    </button>
                  } @else {
                    <span class="inline-block size-3 rounded-full" [style.background]="row.done[i] ? row.habit.color : 'transparent'" [style.border]="row.done[i] ? 'none' : d <= today() ? '1px solid #3a3a3c' : '1px solid #1c1c1e'"></span>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
    <div class="mt-2 space-y-0.5 px-1">
      @for (row of m.rows; track row.habit.id) {
        <p class="flex justify-between gap-2 text-xs">
          <span><span class="mr-1 inline-block size-2 rounded-full" [style.background]="row.habit.color"></span>{{ row.habit.name }}</span>
          <span><b>{{ row.doneCount }}/{{ row.elapsed }}</b> days · best streak {{ row.bestStreak }}</span>
        </p>
      }
    </div>
  `,
})
export class HabitGrid {
  readonly matrix = input.required<MonthMatrix>();
  readonly today = input.required<Day>();
  readonly disabled = input(false);
  readonly toggle = output<{ habitId: string; day: Day }>();

  protected tappable(h: Habit, d: Day): boolean {
    return h.source === 'manual' && d <= this.today() && isActiveOn(h, d);
  }
}
```

Create `src/app/features/habits/weekly-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { WeeklyRow } from './month-matrix';

@Component({
  selector: 'app-weekly-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Weekly habits">
      <p class="label mb-1 text-weekly">Weekly</p>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-[10px] text-muted">
            <th class="text-left font-semibold">Habit</th>
            @for (w of weeks; track w) {
              <th class="font-semibold">W{{ w }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.habit.id) {
            <tr>
              <td class="py-1">{{ r.habit.emoji }} {{ r.habit.name }}</td>
              @for (b of r.blocks; track $index) {
                <td class="text-center"><span class="inline-block size-3 rounded-full" [style.background]="b ? r.habit.color : 'transparent'" [style.border]="b ? 'none' : '1.5px solid #48484a'"></span></td>
              }
            </tr>
          } @empty {
            <tr><td colspan="6" class="muted py-1">No weekly habits — add one in Settings.</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class WeeklyCard {
  readonly rows = input.required<WeeklyRow[]>();
  protected readonly weeks = [1, 2, 3, 4, 5];
}
```

Create `src/app/features/habits/tasks-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Online } from '../../core/online';
import { SAVE_FAILED, ToastService } from '../../core/toast.service';
import type { TaskRow } from '../../data/rows';
import { TrackerApi } from '../../data/tracker-api';
import type { Day } from '../../domain/types';

@Component({
  selector: 'app-tasks-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Monthly one-offs">
      <p class="label mb-1 text-muted">Monthly one-offs</p>
      @for (t of tasks(); track t.id) {
        <div class="flex items-center gap-2 py-1 text-sm">
          <button type="button" role="checkbox" [attr.aria-checked]="!!t.done_at" [disabled]="!online()" (click)="toggle(t)"
            class="grid size-4 place-items-center rounded border-[1.5px] text-[10px]" [class]="t.done_at ? 'border-steps bg-steps text-black' : 'border-line'">{{ t.done_at ? '✓' : '' }}</button>
          <span class="flex-1" [class.line-through]="!!t.done_at" [class.text-muted]="!!t.done_at">{{ t.title }}</span>
          <button type="button" class="text-xs text-muted" [attr.aria-label]="'Delete ' + t.title" [disabled]="!online()" (click)="remove(t)">{{ confirming() === t.id ? 'Tap again' : '✕' }}</button>
        </div>
      } @empty {
        <p class="muted">Nothing for this month yet.</p>
      }
      <form class="mt-2 flex gap-2" (submit)="add($event, title)">
        <input #title class="field !py-1.5" placeholder="+ add a one-off" maxlength="80" [disabled]="!online()" />
        <button class="btn-quiet !py-1.5" type="submit" [disabled]="!online()">Add</button>
      </form>
    </section>
  `,
})
export class TasksCard {
  readonly month = input.required<Day>();
  private readonly api = inject(TrackerApi);
  private readonly toast = inject(ToastService);
  protected readonly online = inject(Online).online;
  protected readonly tasks = signal<TaskRow[]>([]);
  protected readonly confirming = signal<string | null>(null);

  constructor() {
    effect(() => {
      const month = this.month();
      untracked(() => void this.load(month));
    });
  }

  private async load(month: Day): Promise<void> {
    try {
      const rows = await this.api.loadTasks(month);
      if (this.month() === month) this.tasks.set(rows);
    } catch {
      this.tasks.set([]);
    }
  }

  protected async add(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    try {
      const task = await this.api.addTask(title, this.month());
      this.tasks.update((list) => [...list, task]);
      input.value = '';
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }

  protected async toggle(t: TaskRow): Promise<void> {
    const done = !t.done_at;
    try {
      await this.api.setTaskDone(t.id, done);
      this.tasks.update((list) => list.map((x) => (x.id === t.id ? { ...x, done_at: done ? new Date().toISOString() : null } : x)));
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }

  protected async remove(t: TaskRow): Promise<void> {
    if (this.confirming() !== t.id) return this.confirming.set(t.id);
    this.confirming.set(null);
    try {
      await this.api.deleteTask(t.id);
      this.tasks.update((list) => list.filter((x) => x.id !== t.id));
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }
}
```

- [ ] **Step 5: The Habits page**

Replace `src/app/features/habits/habits.page.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { addMonths, monthStart } from '@shared/days';
import { monthLabel } from '../../core/format';
import { Online } from '../../core/online';
import { storageGet, storageSet } from '../../core/storage';
import { ToastService } from '../../core/toast.service';
import { TrackerStore } from '../../data/tracker.store';
import { overallStreak } from '../../domain/streaks';
import { firstHabitDay } from '../../domain/visibility';
import { HabitGrid } from './habit-grid';
import { HabitWheel } from './habit-wheel';
import { buildMonthMatrix } from './month-matrix';
import { TasksCard } from './tasks-card';
import { WeeklyCard } from './weekly-card';

type View = 'wheel' | 'grid';

@Component({
  selector: 'app-habits-page',
  imports: [HabitWheel, HabitGrid, WeeklyCard, TasksCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-2 flex items-center justify-between px-1">
      <h1 class="text-2xl font-extrabold">Habits</h1>
      <div class="flex items-center gap-1 text-sm font-semibold text-steps">
        <button type="button" aria-label="Previous month" class="px-2 disabled:opacity-30" [disabled]="!canGoBack()" (click)="shift(-1)">‹</button>
        <span>{{ label() }}</span>
        <button type="button" aria-label="Next month" class="px-2 disabled:opacity-30" [disabled]="!canGoForward()" (click)="shift(1)">›</button>
      </div>
    </header>
    <div class="mb-2 flex rounded-lg bg-card p-0.5 text-sm font-semibold" role="tablist" aria-label="View">
      @for (v of views; track v.id) {
        <button type="button" role="tab" class="flex-1 rounded-md py-1" [attr.aria-selected]="view() === v.id"
          [class]="view() === v.id ? 'bg-line text-white' : 'text-muted'" (click)="setView(v.id)">{{ v.label }}</button>
      }
    </div>
    <div class="grid gap-2 lg:grid-cols-2">
      <div class="card !p-1.5">
        @if (view() === 'wheel') {
          <app-habit-wheel [matrix]="matrix()" />
        } @else {
          <app-habit-grid [matrix]="matrix()" [today]="store.today()" [disabled]="!online()" (toggle)="store.toggleCheck($event.habitId, $event.day)" />
        }
      </div>
      <div class="grid content-start gap-2">
        <app-weekly-card [rows]="matrix().weekly" />
        <app-tasks-card [month]="month()" />
      </div>
    </div>
  `,
})
export class HabitsPage {
  protected readonly store = inject(TrackerStore);
  private readonly toast = inject(ToastService);
  protected readonly online = inject(Online).online;
  protected readonly views: { id: View; label: string }[] = [{ id: 'wheel', label: '◔ Wheel' }, { id: 'grid', label: '▦ Grid' }];
  protected readonly view = signal<View>(storageGet('habits-view') === 'grid' ? 'grid' : 'wheel');
  protected readonly month = signal(monthStart(this.store.today()));
  protected readonly label = computed(() => monthLabel(this.month()));
  private readonly firstMonth = computed(() => monthStart(firstHabitDay(this.store.habits()) ?? this.store.today()));
  protected readonly canGoBack = computed(() => this.month() > this.firstMonth());
  protected readonly canGoForward = computed(() => this.month() < monthStart(this.store.today()));
  private readonly frozen = computed(() => overallStreak(this.store.habits(), this.store.ctx()).frozen);
  protected readonly matrix = computed(() => buildMonthMatrix(this.store.habits(), this.month(), this.store.ctx(), this.frozen()));

  protected setView(v: View): void {
    this.view.set(v);
    storageSet('habits-view', v);
  }

  protected async shift(n: number): Promise<void> {
    const next = addMonths(this.month(), n);
    try {
      await this.store.ensureHistoryFrom(next);
      this.month.set(next);
    } catch {
      this.toast.show("Couldn't load that month — check your connection");
    }
  }
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx ng test --watch=false`
Expected: PASS — `month-matrix.spec.ts` (5), `wheel-geometry.spec.ts` (4), `habits-cards.spec.ts` (3), plus earlier suites.

- [ ] **Step 7: Browser check**

`npx ng serve`, test user, phone width, `/habits`:
- the wheel shows 8 rainbow rings for the 8 daily habits, the labels in the empty top-left quadrant, today's spoke highlighted, and the dots you ticked in Task 10
- Grid tab: tap a past day's dot for AM skincare → it fills; switch back to Wheel → the dot is there; reload → the Grid view is remembered
- Weekly card shows W1–W5 for Dermarolling
- add a one-off "Haircut before Diwali", tick it (strikes through), delete it (two taps)
- the ‹ arrow is disabled in the first month; › is disabled in the current month

Desktop width: wheel left, weekly + one-offs right. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/habits
git commit -m "Add Habits screen with planner wheel, grid, weekly and one-offs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Food screen — quick add, saved foods, time field, fasting flags

**Files:**
- Create: `src/app/features/food/food-day.ts`, `src/app/features/food/food-day.spec.ts`, `src/app/features/food/food.page.spec.ts`
- Modify: `src/app/features/food/food.page.ts` (replace stub)

**Interfaces:**
- Consumes: `TrackerApi` food methods (Task 9), `TrackerStore.setFoodDay`, `TrackerStore.goals`, `Clock`, `@shared/days` (`instantFor`, `addDays`, `istMinutesOf`), `@shared/windows` (`inWindow`), format helpers (`timeOf`, `hhmmOf`, `dayLabel`, `formatNumber`).
- Produces (`food-day.ts`): `FoodLine { id, name, kcal, protein: number|null, time: string, hhmm: string, outside: boolean }`; `foodLines(entries, goals): FoodLine[]`; `totals(entries): { kcal: number; protein: number | null }`; `suggest(saved, query): SavedFoodRow[]`; `defaultTime(day, today, now): string`; `FoodForm { name, kcal, protein, time }` (strings); `parseFood(form, day): { ok: true; value: { name, kcal, proteinG, eatenAt } } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/features/food/food-day.spec.ts`:

```ts
import { DEFAULT_GOALS } from '../../domain/types';
import { defaultTime, foodLines, parseFood, suggest, totals } from './food-day';

const entry = (id: string, eaten_at: string, kcal: number, protein_g: number | null = null) => ({ id, eaten_at, day: '2026-10-19', name: id, kcal, protein_g, saved_food_id: null });

describe('food day', () => {
  it('flags entries outside the eating windows when fasting is on', () => {
    const lines = foodLines([entry('late', '2026-10-19T19:00:00Z', 560), entry('lunch', '2026-10-19T06:45:00Z', 420), entry('snack', '2026-10-19T11:30:00Z', 90)], DEFAULT_GOALS);
    expect(lines.map((l) => [l.name, l.time, l.outside])).toEqual([['lunch', '12:15 PM', false], ['snack', '5:00 PM', true], ['late', '12:30 AM', false]]);
    expect(foodLines([entry('snack', '2026-10-19T11:30:00Z', 90)], { ...DEFAULT_GOALS, fastingEnabled: false })[0].outside).toBe(false);
  });

  it('totals calories, and protein only when logged', () => {
    expect(totals([entry('a', '2026-10-19T06:00:00Z', 500, 20), entry('b', '2026-10-19T07:00:00Z', 300)])).toEqual({ kcal: 800, protein: 20 });
    expect(totals([entry('a', '2026-10-19T06:00:00Z', 500)])).toEqual({ kcal: 500, protein: null });
  });

  it('suggests saved foods by name', () => {
    const saved = [{ id: '1', name: '2 roti', kcal: 240, protein_g: null, use_count: 9 }, { id: '2', name: 'Dal bowl', kcal: 180, protein_g: 9, use_count: 3 }];
    expect(suggest(saved, 'DAL').map((s) => s.id)).toEqual(['2']);
    expect(suggest(saved, '').map((s) => s.id)).toEqual(['1', '2']);
  });

  it('defaults the time to now today, noon otherwise', () => {
    expect(defaultTime('2026-10-19', '2026-10-19', new Date('2026-10-19T13:20:00Z'))).toBe('18:50');
    expect(defaultTime('2026-10-18', '2026-10-19', new Date('2026-10-19T13:20:00Z'))).toBe('12:00');
  });

  it('parses the form into an entry on the right instant', () => {
    expect(parseFood({ name: ' Paneer bhurji ', kcal: '320', protein: '18.5', time: '00:30' }, '2026-10-19')).toEqual({
      ok: true, value: { name: 'Paneer bhurji', kcal: 320, proteinG: 18.5, eatenAt: '2026-10-19T19:00:00.000Z' },
    });
    expect(parseFood({ name: 'Chai', kcal: '90', protein: '', time: '12:15' }, '2026-10-19')).toMatchObject({ ok: true, value: { proteinG: null } });
  });

  it('explains what is wrong', () => {
    expect(parseFood({ name: ' ', kcal: '90', protein: '', time: '12:00' }, '2026-10-19')).toEqual({ ok: false, error: 'Give the food a name' });
    expect(parseFood({ name: 'Chai', kcal: '9.5', protein: '', time: '12:00' }, '2026-10-19')).toEqual({ ok: false, error: 'Calories must be a whole number from 0 to 10000' });
    expect(parseFood({ name: 'Chai', kcal: '90', protein: '-1', time: '12:00' }, '2026-10-19')).toEqual({ ok: false, error: 'Protein must be 0–1000 g' });
    expect(parseFood({ name: 'Chai', kcal: '90', protein: '', time: '' }, '2026-10-19')).toEqual({ ok: false, error: 'Pick a time' });
  });
});
```

Create `src/app/features/food/food.page.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { TrackerApi } from '../../data/tracker-api';
import { FoodPage } from './food.page';

const settle = async (f: { whenStable(): Promise<unknown> }) => {
  await f.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  await f.whenStable();
};

describe('FoodPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T08:00:00Z')); // 1:30 PM IST
  });
  afterEach(() => vi.useRealTimers());

  it('shows the day, flags outside-window entries, and adds food from the form', async () => {
    const api = {
      loadFoodDay: vi.fn().mockResolvedValue([
        { id: 'e1', eaten_at: '2026-10-19T06:45:00Z', day: '2026-10-19', name: 'Lunch', kcal: 420, protein_g: null, saved_food_id: null },
        { id: 'e2', eaten_at: '2026-10-19T11:30:00Z', day: '2026-10-19', name: 'Samosa', kcal: 250, protein_g: null, saved_food_id: null },
      ]),
      loadSavedFoods: vi.fn().mockResolvedValue([{ id: 's1', name: 'Chai', kcal: 90, protein_g: null, use_count: 4 }]),
      addFood: vi.fn().mockImplementation(async (f) => ({ id: 'e3', eaten_at: f.eatenAt, day: f.day, name: f.name, kcal: f.kcal, protein_g: f.proteinG, saved_food_id: f.savedFoodId })),
      bumpSavedFood: vi.fn().mockResolvedValue(undefined),
      saveFood: vi.fn(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
    const fixture = TestBed.createComponent(FoodPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid=kcal-total]')?.textContent).toBe('670');
    const samosa = [...el.querySelectorAll('li')].find((li) => li.textContent?.includes('Samosa'))!;
    expect(samosa.textContent).toContain('⚠️');

    const field = (name: string) => el.querySelector(`input[name=${name}]`) as HTMLInputElement;
    field('name').value = 'Chai';
    field('kcal').value = '90';
    field('time').value = '12:40';
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);

    expect(api.addFood).toHaveBeenCalledWith({ day: '2026-10-19', name: 'Chai', kcal: 90, proteinG: null, eatenAt: '2026-10-19T07:10:00.000Z', savedFoodId: 's1' });
    expect(api.bumpSavedFood).toHaveBeenCalledWith('s1', 5);
    expect(el.querySelector('[data-testid=kcal-total]')?.textContent).toBe('760');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx ng test --watch=false` → Expected: FAIL — cannot resolve `./food-day`; `FoodPage` stub has no form.

- [ ] **Step 3: Implement `food-day.ts`**

Create `src/app/features/food/food-day.ts`:

```ts
import { instantFor, istMinutesOf, type Day } from '@shared/days';
import { inWindow } from '@shared/windows';
import { hhmmOf, timeOf } from '../../core/format';
import type { FoodEntryRow, SavedFoodRow } from '../../data/rows';
import type { Goals } from '../../domain/types';

export interface FoodLine {
  id: string;
  name: string;
  kcal: number;
  protein: number | null;
  time: string;
  hhmm: string;
  outside: boolean;
}

export function foodLines(entries: readonly FoodEntryRow[], goals: Goals): FoodLine[] {
  const useWindows = goals.fastingEnabled && goals.windows.length > 0;
  return [...entries]
    .sort((a, b) => a.eaten_at.localeCompare(b.eaten_at))
    .map((e) => {
      const at = new Date(e.eaten_at);
      return {
        id: e.id, name: e.name, kcal: e.kcal, protein: e.protein_g,
        time: timeOf(e.eaten_at), hhmm: hhmmOf(at),
        outside: useWindows && !inWindow(istMinutesOf(at), goals.windows),
      };
    });
}

export function totals(entries: readonly FoodEntryRow[]): { kcal: number; protein: number | null } {
  const kcal = entries.reduce((sum, e) => sum + e.kcal, 0);
  const withProtein = entries.filter((e) => e.protein_g !== null);
  return { kcal, protein: withProtein.length ? Math.round(withProtein.reduce((s, e) => s + (e.protein_g ?? 0), 0) * 10) / 10 : null };
}

export function suggest(saved: readonly SavedFoodRow[], query: string): SavedFoodRow[] {
  const q = query.trim().toLowerCase();
  return saved.filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 12);
}

export function defaultTime(day: Day, today: Day, now: Date): string {
  return day === today ? hhmmOf(now) : '12:00';
}

export interface FoodForm { name: string; kcal: string; protein: string; time: string }

export function parseFood(form: FoodForm, day: Day):
  | { ok: true; value: { name: string; kcal: number; proteinG: number | null; eatenAt: string } }
  | { ok: false; error: string } {
  const name = form.name.trim();
  if (name.length < 1 || name.length > 60) return { ok: false, error: 'Give the food a name' };
  const kcal = Number(form.kcal);
  if (form.kcal.trim() === '' || !Number.isInteger(kcal) || kcal < 0 || kcal > 10_000) {
    return { ok: false, error: 'Calories must be a whole number from 0 to 10000' };
  }
  const protein = form.protein.trim() === '' ? null : Number(form.protein);
  if (protein !== null && (!Number.isFinite(protein) || protein < 0 || protein > 1000)) return { ok: false, error: 'Protein must be 0–1000 g' };
  if (!/^\d{2}:\d{2}$/.test(form.time)) return { ok: false, error: 'Pick a time' };
  return {
    ok: true,
    value: { name, kcal, proteinG: protein === null ? null : Math.round(protein * 10) / 10, eatenAt: instantFor(day, form.time).toISOString() },
  };
}
```

- [ ] **Step 4: The Food page**

Replace `src/app/features/food/food.page.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { addDays, instantFor, type Day } from '@shared/days';
import { Clock } from '../../core/clock';
import { dayLabel, formatNumber } from '../../core/format';
import { Online } from '../../core/online';
import { SAVE_FAILED, ToastService } from '../../core/toast.service';
import type { FoodEntryRow, SavedFoodRow } from '../../data/rows';
import { TrackerApi } from '../../data/tracker-api';
import { TrackerStore } from '../../data/tracker.store';
import { defaultTime, foodLines, parseFood, suggest, totals, type FoodLine } from './food-day';

@Component({
  selector: 'app-food-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-2 flex items-center justify-between px-1">
      <h1 class="text-2xl font-extrabold">Food</h1>
      <div class="flex items-center gap-1 text-sm text-muted">
        <button type="button" aria-label="Previous day" class="px-2" (click)="shiftDay(-1)">‹</button>
        <span>{{ dayText() }}</span>
        <button type="button" aria-label="Next day" class="px-2 disabled:opacity-30" [disabled]="day() >= store.today()" (click)="shiftDay(1)">›</button>
      </div>
    </header>

    <div class="grid gap-2 lg:grid-cols-2">
      <section class="card" aria-label="Calories">
        <div class="flex items-baseline justify-between">
          <p><span class="text-3xl font-black text-kcal" data-testid="kcal-total">{{ n(total().kcal) }}</span> <span class="muted">/ {{ n(goal()) }} kcal</span></p>
          <p class="text-sm font-bold" [class.text-kcal]="total().kcal > goal()">{{ total().kcal > goal() ? n(total().kcal - goal()) + ' over' : n(goal() - total().kcal) + ' left' }}</p>
        </div>
        <div class="mt-1.5 h-2 rounded bg-[#3a1a22]"><div class="h-full rounded bg-kcal" [style.width.%]="barPct()"></div></div>
        @if (total().protein !== null) {
          <p class="muted mt-1">Protein {{ total().protein }} g</p>
        }
      </section>

      <section class="card" aria-label="Quick add">
        <p class="label mb-1.5 text-kcal">Quick add</p>
        <form class="flex flex-wrap gap-1.5" (submit)="add($event, name, kcal, protein, time)">
          <input #name class="field" name="name" placeholder="Food…" maxlength="60" autocomplete="off" [disabled]="!online()" (input)="query.set(name.value)" />
          <input #kcal class="field !w-[4.5rem]" name="kcal" inputmode="numeric" placeholder="kcal" [disabled]="!online()" />
          <input #protein class="field !w-[5.5rem]" name="protein" inputmode="decimal" placeholder="protein g" [disabled]="!online()" />
          <input #time class="field !w-[6.5rem]" name="time" type="time" [value]="defaultTime()" [disabled]="!online()" />
          <button type="button" class="btn-quiet" [attr.aria-pressed]="saveIt()" (click)="saveIt.set(!saveIt())">{{ saveIt() ? '★ saved' : '☆ save' }}</button>
          <button class="btn flex-1" type="submit" [disabled]="!online() || busy()">Add</button>
        </form>
        @if (error(); as e) {
          <p class="mt-1 text-sm text-kcal" role="alert">{{ e }}</p>
        }
        <div class="mt-2 flex items-center justify-between">
          <p class="label text-muted">Saved · tap to add</p>
          @if (saved().length) {
            <button type="button" class="text-xs text-muted underline" (click)="editSaved.set(!editSaved())">{{ editSaved() ? 'Done' : 'Edit' }}</button>
          }
        </div>
        <div class="mt-1 flex flex-wrap gap-1">
          @for (s of chips(); track s.id) {
            @if (editSaved()) {
              <button type="button" class="rounded-xl bg-raised px-2 py-1 text-xs" [attr.aria-label]="'Delete saved ' + s.name" (click)="deleteSaved(s)">✕ {{ s.name }}</button>
            } @else {
              <button type="button" class="rounded-xl bg-raised px-2 py-1 text-xs" [disabled]="!online()" (click)="addSaved(s)">{{ s.name }} <b class="text-kcal">{{ s.kcal }}</b></button>
            }
          } @empty {
            <p class="muted">Tick ☆ save when adding a food to reuse it.</p>
          }
        </div>
      </section>

      <section class="card lg:col-span-2" aria-label="Log">
        <p class="label mb-1 text-muted">{{ day() === store.today() ? "Today's log" : 'Log' }}</p>
        <ul>
          @for (line of lines(); track line.id) {
            <li class="border-t border-line py-1.5 first:border-t-0">
              @if (editing() === line.id) {
                <div class="flex flex-wrap gap-1.5">
                  <input #eName class="field" [value]="line.name" maxlength="60" aria-label="Name" />
                  <input #eKcal class="field !w-[4.5rem]" [value]="line.kcal" inputmode="numeric" aria-label="kcal" />
                  <input #eProtein class="field !w-[5.5rem]" [value]="line.protein ?? ''" inputmode="decimal" aria-label="Protein" />
                  <input #eTime class="field !w-[6.5rem]" type="time" [value]="line.hhmm" aria-label="Time" />
                  <button type="button" class="btn" [disabled]="!online()" (click)="saveEdit(line, eName, eKcal, eProtein, eTime)">Save</button>
                  <button type="button" class="btn-quiet !text-kcal" [disabled]="!online()" (click)="remove(line)">{{ confirmDelete() === line.id ? 'Tap again' : 'Delete' }}</button>
                  <button type="button" class="btn-quiet" (click)="editing.set(null)">Cancel</button>
                </div>
              } @else {
                <div class="flex items-center justify-between gap-2 text-sm">
                  <span><span class="mr-1 text-xs" [class.text-kcal]="line.outside" [class.text-muted]="!line.outside">{{ line.outside ? '⚠️ ' : '' }}{{ line.time }}</span>{{ line.name }}</span>
                  <span class="flex items-center gap-2">{{ line.kcal }}
                    <button type="button" class="px-1 text-muted" [attr.aria-label]="'Edit ' + line.name" (click)="startEdit(line)">⋯</button></span>
                </div>
              }
            </li>
          } @empty {
            <li class="muted">Nothing logged yet.</li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class FoodPage {
  protected readonly store = inject(TrackerStore);
  private readonly api = inject(TrackerApi);
  private readonly clock = inject(Clock);
  private readonly toast = inject(ToastService);
  protected readonly online = inject(Online).online;
  protected readonly n = formatNumber;

  protected readonly day = signal<Day>(this.store.today());
  protected readonly entries = signal<FoodEntryRow[]>([]);
  protected readonly saved = signal<SavedFoodRow[]>([]);
  protected readonly query = signal('');
  protected readonly saveIt = signal(false);
  protected readonly editSaved = signal(false);
  protected readonly editing = signal<string | null>(null);
  protected readonly confirmDelete = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly goal = computed(() => this.store.goals().kcalGoal);
  protected readonly total = computed(() => totals(this.entries()));
  protected readonly barPct = computed(() => Math.min(100, (100 * this.total().kcal) / this.goal()));
  protected readonly lines = computed(() => foodLines(this.entries(), this.store.goals()));
  protected readonly chips = computed(() => suggest(this.saved(), this.query()));
  protected readonly defaultTime = computed(() => defaultTime(this.day(), this.store.today(), this.clock.instant()));
  protected readonly dayText = computed(() => (this.day() === this.store.today() ? 'Today · ' : '') + dayLabel(this.day()));

  constructor() {
    effect(() => {
      const day = this.day();
      untracked(() => void this.loadDay(day));
    });
    this.api.loadSavedFoods().then((s) => this.saved.set(s), () => undefined);
  }

  private async loadDay(day: Day): Promise<void> {
    try {
      const rows = await this.api.loadFoodDay(day);
      if (this.day() === day) this.entries.set(rows);
    } catch {
      this.entries.set([]);
    }
  }

  private commit(rows: FoodEntryRow[]): void {
    this.entries.set(rows);
    this.store.setFoodDay(this.day(), rows);
  }

  protected shiftDay(n: number): void {
    this.editing.set(null);
    this.day.set(addDays(this.day(), n));
  }

  protected async add(event: Event, name: HTMLInputElement, kcal: HTMLInputElement, protein: HTMLInputElement, time: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const parsed = parseFood({ name: name.value, kcal: kcal.value, protein: protein.value, time: time.value }, this.day());
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    this.busy.set(true);
    try {
      const match = this.saved().find((s) => s.name.toLowerCase() === parsed.value.name.toLowerCase()) ?? null;
      let savedFoodId = match?.id ?? null;
      if (match) await this.bump(match);
      else if (this.saveIt()) {
        const s = await this.api.saveFood(parsed.value.name, parsed.value.kcal, parsed.value.proteinG);
        this.saved.update((list) => [...list, s]);
        savedFoodId = s.id;
      }
      const row = await this.api.addFood({ day: this.day(), ...parsed.value, savedFoodId });
      this.commit([...this.entries(), row]);
      name.value = '';
      kcal.value = '';
      protein.value = '';
      this.query.set('');
      this.saveIt.set(false);
    } catch {
      this.toast.show(SAVE_FAILED);
    } finally {
      this.busy.set(false);
    }
  }

  protected async addSaved(food: SavedFoodRow): Promise<void> {
    try {
      const eatenAt = instantFor(this.day(), this.defaultTime()).toISOString();
      const row = await this.api.addFood({ day: this.day(), eatenAt, name: food.name, kcal: food.kcal, proteinG: food.protein_g, savedFoodId: food.id });
      await this.bump(food);
      this.commit([...this.entries(), row]);
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }

  private async bump(food: SavedFoodRow): Promise<void> {
    await this.api.bumpSavedFood(food.id, food.use_count + 1);
    this.saved.update((list) => list.map((s) => (s.id === food.id ? { ...s, use_count: s.use_count + 1 } : s)));
  }

  protected startEdit(line: FoodLine): void {
    this.confirmDelete.set(null);
    this.editing.set(line.id);
  }

  protected async saveEdit(line: FoodLine, name: HTMLInputElement, kcal: HTMLInputElement, protein: HTMLInputElement, time: HTMLInputElement): Promise<void> {
    const parsed = parseFood({ name: name.value, kcal: kcal.value, protein: protein.value, time: time.value }, this.day());
    if (!parsed.ok) return this.toast.show(parsed.error);
    try {
      await this.api.updateFood(line.id, { day: this.day(), ...parsed.value, savedFoodId: null });
      this.commit(this.entries().map((e) => (e.id === line.id ? { ...e, name: parsed.value.name, kcal: parsed.value.kcal, protein_g: parsed.value.proteinG, eaten_at: parsed.value.eatenAt } : e)));
      this.editing.set(null);
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }

  protected async remove(line: FoodLine): Promise<void> {
    if (this.confirmDelete() !== line.id) return this.confirmDelete.set(line.id);
    try {
      await this.api.deleteFood(line.id);
      this.commit(this.entries().filter((e) => e.id !== line.id));
      this.editing.set(null);
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }

  protected async deleteSaved(food: SavedFoodRow): Promise<void> {
    try {
      await this.api.deleteSavedFood(food.id);
      this.saved.update((list) => list.filter((s) => s.id !== food.id));
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx ng test --watch=false`
Expected: PASS — `food-day.spec.ts` (6), `food.page.spec.ts` (1), plus earlier suites.

- [ ] **Step 6: Browser check**

`npx ng serve`, test user, phone width, `/food`:
- add "Poha / 290" with ☆ save → it appears in the log with the current time; the total and "left" update; a "Poha 290" chip appears
- tap the chip → a second Poha is added
- add "Samosa / 250" with time 17:00 → it shows ⚠️ and a pink time; set time 00:30 → no ⚠️
- edit an entry via ⋯ (change kcal → Save); delete one (Delete → Tap again)
- go ‹ to yesterday: the time defaults to 12:00; add an entry; › back to today
- on `/today` the kcal ring/total matches; with the Samosa at 17:00 still logged, the wheel's "Fasting windows kept" dot for today stays empty

Stop the server.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/food
git commit -m "Add Food screen with quick add, saved foods, time field and fasting flags" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 13: Settings — countdowns + challenges, habits, targets, fasting, Shortcut, account

**Files:**
- Create: `src/app/features/settings/settings-forms.ts`, `settings-forms.spec.ts`
- Create: `src/app/features/settings/countdowns-section.ts`, `habits-section.ts`, `targets-section.ts`, `fasting-section.ts`, `shortcut-section.ts`, `settings-sections.spec.ts`
- Modify: `src/app/features/settings/settings.page.ts` (replace stub)

**Interfaces:**
- Consumes: `TrackerStore` (`guard`, `rotateToken`, signals), `TrackerApi` (countdown/challenge/habit/goals/fasting methods), `AuthService`, `@shared/windows` (`validateWindows`, `sortWindows`), domain (`defaultTarget`, `nextColor`, `HABIT_PALETTE`, `bySortOrder`, `isActiveOn`), `config.ts` (`FUNCTIONS_URL`, `SHORTCUT_DOCS_URL`), format helpers.
- Produces (`settings-forms.ts`): `Parsed<T>`; `parseCountdown(form, today)`; `parseTargets(form)`; `HabitForm`; `parseHabit(form)`; `daysLeft(targetDate, today)`; `parseChallengeTarget(raw, left)`; `moved(list, index, delta)`.
- Produces (components): `app-countdowns-section`, `app-habits-section`, `app-targets-section`, `app-fasting-section`, `app-shortcut-section`, `SettingsPage`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/features/settings/settings-forms.spec.ts`:

```ts
import { daysLeft, moved, parseChallengeTarget, parseCountdown, parseHabit, parseTargets } from './settings-forms';

describe('settings forms', () => {
  it('parses a countdown', () => {
    expect(parseCountdown({ title: ' Diwali ', emoji: '', date: '2026-11-08' }, '2026-10-19')).toEqual({ ok: true, value: { title: 'Diwali', emoji: '🎯', targetDate: '2026-11-08' } });
    expect(parseCountdown({ title: '', emoji: '🪔', date: '2026-11-08' }, '2026-10-19')).toEqual({ ok: false, error: 'Give it a name (up to 40 characters)' });
    expect(parseCountdown({ title: 'X', emoji: '', date: '' }, '2026-10-19')).toEqual({ ok: false, error: 'Pick a date' });
    expect(parseCountdown({ title: 'X', emoji: '', date: '2026-10-18' }, '2026-10-19')).toEqual({ ok: false, error: 'Pick today or a future date' });
  });

  it('parses targets within limits', () => {
    expect(parseTargets({ steps: '12000', kcal: '1800' })).toEqual({ ok: true, value: { stepGoal: 12000, kcalGoal: 1800 } });
    expect(parseTargets({ steps: '500', kcal: '1800' })).toEqual({ ok: false, error: 'Step goal must be 1,000–100,000' });
    expect(parseTargets({ steps: '10000', kcal: '20000' })).toEqual({ ok: false, error: 'Calorie goal must be 500–10,000' });
  });

  it('parses a habit, defaulting the emoji and the weekday', () => {
    expect(parseHabit({ name: ' Hair oil ', emoji: '', frequency: 'weekly', slot: 'night', weekday: '' })).toEqual({ ok: true, value: { name: 'Hair oil', emoji: '✅', frequency: 'weekly', slot: 'night', weekday: 0 } });
    expect(parseHabit({ name: 'Water', emoji: '💧', frequency: 'daily', slot: 'anytime', weekday: '3' })).toMatchObject({ ok: true, value: { weekday: null } });
    expect(parseHabit({ name: ' ', emoji: '', frequency: 'daily', slot: 'anytime', weekday: '' })).toEqual({ ok: false, error: 'Give the habit a name (up to 40 characters)' });
  });

  it('bounds challenge targets by the days left', () => {
    expect(daysLeft('2026-11-08', '2026-10-19')).toBe(20);
    expect(daysLeft('2026-10-01', '2026-10-19')).toBe(0);
    expect(parseChallengeTarget('15', 20)).toEqual({ ok: true, value: 15 });
    expect(parseChallengeTarget('21', 20)).toEqual({ ok: false, error: 'Pick 1–20 days' });
    expect(parseChallengeTarget('0', 20).ok).toBe(false);
  });

  it('moves an item up or down', () => {
    expect(moved(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moved(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moved(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });
});
```

Create `src/app/features/settings/settings-sections.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { DEFAULT_GOALS } from '../../domain/types';
import { TrackerApi } from '../../data/tracker-api';
import { FastingSection } from './fasting-section';
import { ShortcutSection } from './shortcut-section';

const settle = async (f: { whenStable(): Promise<unknown> }) => {
  await f.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  await f.whenStable();
};

function fakeApi(extra: Record<string, unknown> = {}) {
  return {
    loadConfig: vi.fn().mockResolvedValue({ goals: DEFAULT_GOALS, lastSyncAt: null, hasToken: true, habits: [], countdowns: [], challenges: [] }),
    updateFasting: vi.fn().mockResolvedValue(undefined),
    rotateToken: vi.fn().mockResolvedValue('abc123'),
    ...extra,
  };
}

describe('Settings sections', () => {
  it('FastingSection rejects overlapping windows and saves valid ones sorted', async () => {
    const api = fakeApi();
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
    const fixture = TestBed.createComponent(FastingSection);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const start2 = el.querySelector('[aria-label="Window 2 start"]') as HTMLInputElement;
    start2.value = '00:30';
    start2.dispatchEvent(new Event('change'));
    (el.querySelector('button.btn') as HTMLButtonElement).click();
    await settle(fixture);
    expect(el.querySelector('[role=alert]')?.textContent).toContain("Windows can't overlap");
    expect(api.updateFasting).not.toHaveBeenCalled();

    start2.value = '12:00';
    start2.dispatchEvent(new Event('change'));
    (el.querySelector('button.btn') as HTMLButtonElement).click();
    await settle(fixture);
    expect(api.updateFasting).toHaveBeenCalledWith(true, [{ start: '00:00', end: '01:00' }, { start: '12:00', end: '13:00' }]);
  });

  it('ShortcutSection shows a new token once, after a confirming second tap, and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const api = fakeApi();
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
    const fixture = TestBed.createComponent(ShortcutSection);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const rotate = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('token'))!;
    expect(rotate.textContent).toContain('Generate token');
    rotate.click();
    await settle(fixture);
    expect((el.querySelector('[aria-label="Sync token"]') as HTMLInputElement).value).toBe('abc123');
    ([...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Copy') as HTMLButtonElement).click();
    await settle(fixture);
    expect(writeText).toHaveBeenCalledWith('abc123');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx ng test --watch=false` → Expected: FAIL — cannot resolve `./settings-forms`, `./fasting-section`, `./shortcut-section`.

- [ ] **Step 3: Form parsing**

Create `src/app/features/settings/settings-forms.ts`:

```ts
import { daysBetween, isValidDay, type Day } from '@shared/days';
import type { Frequency, Slot } from '../../domain/types';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

// Postgres counts code points, so trim emoji by code point rather than UTF-16 unit.
const firstChars = (s: string, n: number) => [...s.trim()].slice(0, n).join('');

export function parseCountdown(f: { title: string; emoji: string; date: string }, today: Day): Parsed<{ title: string; emoji: string; targetDate: Day }> {
  const title = f.title.trim();
  if (!title || title.length > 40) return { ok: false, error: 'Give it a name (up to 40 characters)' };
  if (!isValidDay(f.date)) return { ok: false, error: 'Pick a date' };
  if (f.date < today) return { ok: false, error: 'Pick today or a future date' };
  return { ok: true, value: { title, emoji: firstChars(f.emoji, 8) || '🎯', targetDate: f.date } };
}

export function parseTargets(f: { steps: string; kcal: string }): Parsed<{ stepGoal: number; kcalGoal: number }> {
  const stepGoal = Number(f.steps);
  const kcalGoal = Number(f.kcal);
  if (!Number.isInteger(stepGoal) || stepGoal < 1000 || stepGoal > 100_000) return { ok: false, error: 'Step goal must be 1,000–100,000' };
  if (!Number.isInteger(kcalGoal) || kcalGoal < 500 || kcalGoal > 10_000) return { ok: false, error: 'Calorie goal must be 500–10,000' };
  return { ok: true, value: { stepGoal, kcalGoal } };
}

export interface HabitForm { name: string; emoji: string; frequency: Frequency; slot: Slot; weekday: string }

export function parseHabit(f: HabitForm): Parsed<{ name: string; emoji: string; frequency: Frequency; slot: Slot; weekday: number | null }> {
  const name = f.name.trim();
  if (!name || name.length > 40) return { ok: false, error: 'Give the habit a name (up to 40 characters)' };
  return {
    ok: true,
    value: { name, emoji: firstChars(f.emoji, 8) || '✅', frequency: f.frequency, slot: f.slot, weekday: f.frequency === 'weekly' ? Number(f.weekday || 0) : null },
  };
}

/** Days from today up to (not including) the countdown date — a new challenge's window. */
export function daysLeft(targetDate: Day, today: Day): number {
  return Math.max(0, daysBetween(today, targetDate));
}

export function parseChallengeTarget(raw: string, left: number): Parsed<number> {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > left) return { ok: false, error: `Pick 1–${left} days` };
  return { ok: true, value: n };
}

export function moved<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return [...list];
  const out = [...list];
  [out[index], out[target]] = [out[target], out[index]];
  return out;
}
```

- [ ] **Step 4: Countdowns + challenges section**

Create `src/app/features/settings/countdowns-section.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { daysBetween } from '@shared/days';
import { dayLabelWithYear } from '../../core/format';
import { TrackerApi } from '../../data/tracker-api';
import { TrackerStore } from '../../data/tracker.store';
import { defaultTarget } from '../../domain/challenges';
import { bySortOrder, isActiveOn } from '../../domain/visibility';
import type { Challenge, Countdown } from '../../domain/types';
import { daysLeft, parseChallengeTarget, parseCountdown } from './settings-forms';

@Component({
  selector: 'app-countdowns-section',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Countdowns">
      <p class="label mb-1 text-count">Countdowns</p>
      @for (c of upcoming(); track c.id) {
        <div class="border-t border-line py-2 first:border-t-0" role="group" [attr.aria-label]="c.title">
          @if (editing() === c.id) {
            <div class="flex flex-wrap gap-1.5">
              <input #eEmoji class="field !w-14 text-center" [value]="c.emoji" maxlength="8" aria-label="Emoji" />
              <input #eTitle class="field flex-1" [value]="c.title" maxlength="40" aria-label="Title" />
              <input #eDate class="field !w-40" type="date" [value]="c.targetDate" aria-label="Date" />
              <button type="button" class="btn" (click)="save(c.id, eTitle.value, eEmoji.value, eDate.value)">Save</button>
              <button type="button" class="btn-quiet !text-kcal" (click)="remove(c.id)">{{ confirming() === c.id ? 'Tap again' : 'Delete' }}</button>
              <button type="button" class="btn-quiet" (click)="editing.set(null)">Cancel</button>
            </div>
          } @else {
            <button type="button" class="flex w-full justify-between text-sm" (click)="editing.set(c.id)">
              <span>{{ c.emoji }} {{ c.title }}</span><span class="muted">{{ label(c.targetDate) }}</span>
            </button>
          }
          <div class="mt-1 pl-3">
            @for (ch of challengesFor(c.id); track ch.id) {
              <div class="flex items-center justify-between text-xs text-muted">
                <span>🏁 {{ habitName(ch.habitId) }} on {{ ch.targetDays }} of {{ windowDays(ch, c) }} days</span>
                <button type="button" class="underline" (click)="removeChallenge(ch.id)">{{ confirming() === ch.id ? 'Tap again' : 'Remove' }}</button>
              </div>
            }
            @if (challengesFor(c.id).length < 3 && left(c) > 0) {
              @if (adding() === c.id) {
                <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <select #chHabit class="field !w-auto !py-1" aria-label="Challenge habit">
                    @for (h of dailyHabits(); track h.id) {
                      <option [value]="h.id">{{ h.name }}</option>
                    }
                  </select>
                  on <input #chTarget class="field !w-14 !py-1" inputmode="numeric" [value]="suggested(c)" aria-label="Target days" /> of {{ left(c) }} days
                  <button type="button" class="btn !py-1" (click)="addChallenge(c, chHabit.value, chTarget.value)">Add</button>
                  <button type="button" class="btn-quiet !py-1" (click)="adding.set(null)">Cancel</button>
                </div>
              } @else {
                <button type="button" class="mt-1 text-xs font-semibold text-count" (click)="adding.set(c.id)">+ Add challenge</button>
              }
            }
          </div>
        </div>
      }
      <form class="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2" (submit)="add($event, nEmoji, nTitle, nDate)">
        <input #nEmoji class="field !w-14 text-center" placeholder="🎯" maxlength="8" aria-label="New countdown emoji" />
        <input #nTitle class="field flex-1" placeholder="+ Add countdown" maxlength="40" aria-label="New countdown title" />
        <input #nDate class="field !w-40" type="date" aria-label="New countdown date" />
        <button class="btn" type="submit">Add</button>
      </form>
      @if (error(); as e) {
        <p class="mt-1 text-sm text-kcal" role="alert">{{ e }}</p>
      }
      @if (past().length) {
        <p class="label mt-3 text-muted">Past</p>
        @for (c of past(); track c.id) {
          <a class="flex justify-between py-1 text-sm" [routerLink]="['/report', c.id]"><span>{{ c.emoji }} {{ c.title }}</span><span class="muted">report card →</span></a>
        }
      }
    </section>
  `,
})
export class CountdownsSection {
  private readonly store = inject(TrackerStore);
  private readonly api = inject(TrackerApi);
  protected readonly editing = signal<string | null>(null);
  protected readonly adding = signal<string | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly label = dayLabelWithYear;

  protected readonly upcoming = computed(() => this.store.countdowns().filter((c) => c.targetDate >= this.store.today()));
  protected readonly past = computed(() => this.store.countdowns().filter((c) => c.targetDate < this.store.today()).reverse());
  protected readonly dailyHabits = computed(() => this.store.habits().filter((h) => h.frequency === 'daily' && isActiveOn(h, this.store.today())).sort(bySortOrder));

  protected challengesFor(id: string): Challenge[] {
    return this.store.challenges().filter((ch) => ch.countdownId === id);
  }

  protected habitName(id: string): string {
    return this.store.habits().find((h) => h.id === id)?.name ?? 'Archived habit';
  }

  protected windowDays(ch: Challenge, c: Countdown): number {
    return daysBetween(ch.startDay, c.targetDate);
  }

  protected left(c: Countdown): number {
    return daysLeft(c.targetDate, this.store.today());
  }

  protected suggested(c: Countdown): number {
    return defaultTarget(this.left(c));
  }

  protected async add(event: Event, emoji: HTMLInputElement, title: HTMLInputElement, date: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const parsed = parseCountdown({ title: title.value, emoji: emoji.value, date: date.value }, this.store.today());
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const { title: t, emoji: e, targetDate } = parsed.value;
    if (await this.store.guard(() => this.api.addCountdown(t, e, targetDate))) {
      emoji.value = '';
      title.value = '';
      date.value = '';
    }
  }

  protected async save(id: string, title: string, emoji: string, date: string): Promise<void> {
    const parsed = parseCountdown({ title, emoji, date }, this.store.today());
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const v = parsed.value;
    if (await this.store.guard(() => this.api.updateCountdown(id, v.title, v.emoji, v.targetDate))) this.editing.set(null);
  }

  protected async remove(id: string): Promise<void> {
    if (this.confirming() !== id) return this.confirming.set(id);
    this.confirming.set(null);
    await this.store.guard(() => this.api.deleteCountdown(id));
  }

  protected async addChallenge(c: Countdown, habitId: string, raw: string): Promise<void> {
    const parsed = parseChallengeTarget(raw, this.left(c));
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const target = parsed.value;
    if (await this.store.guard(() => this.api.addChallenge(c.id, habitId, target, this.store.today()))) this.adding.set(null);
  }

  protected async removeChallenge(id: string): Promise<void> {
    if (this.confirming() !== id) return this.confirming.set(id);
    this.confirming.set(null);
    await this.store.guard(() => this.api.deleteChallenge(id));
  }
}
```

- [ ] **Step 5: Habits section**

Create `src/app/features/settings/habits-section.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TrackerApi } from '../../data/tracker-api';
import { TrackerStore } from '../../data/tracker.store';
import { HABIT_PALETTE, nextColor } from '../../domain/palette';
import { bySortOrder } from '../../domain/visibility';
import type { Frequency, Habit, Slot } from '../../domain/types';
import { moved, parseHabit } from './settings-forms';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOT_LABEL: Record<Slot, string> = { morning: 'morning', night: 'night', anytime: 'anytime' };

@Component({
  selector: 'app-habits-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Habits">
      <p class="label mb-1 text-routine">Habits</p>
      @for (h of list(); track h.id; let i = $index, first = $first, last = $last) {
        <div class="border-t border-line py-1.5 first:border-t-0">
          @if (editing() === h.id) {
            <div class="flex flex-wrap gap-1.5">
              @if (h.source === 'manual') {
                <input #eEmoji class="field !w-14 text-center" [value]="h.emoji" maxlength="8" aria-label="Emoji" />
                <input #eName class="field flex-1" [value]="h.name" maxlength="40" aria-label="Name" />
                <select #eFreq class="field !w-auto" aria-label="Frequency">
                  <option value="daily" [selected]="h.frequency === 'daily'">Daily</option>
                  <option value="weekly" [selected]="h.frequency === 'weekly'">Weekly</option>
                </select>
                <select #eSlot class="field !w-auto" aria-label="Time of day">
                  @for (s of slots; track s) {
                    <option [value]="s" [selected]="h.slot === s">{{ slotLabel[s] }}</option>
                  }
                </select>
                <select #eDay class="field !w-auto" aria-label="Weekday (weekly habits)">
                  @for (d of weekdays; track $index) {
                    <option [value]="$index" [selected]="$index === (h.weekday ?? 0)">{{ d }}</option>
                  }
                </select>
                <div class="flex w-full flex-wrap gap-1">
                  @for (c of palette; track c) {
                    <button type="button" class="size-6 rounded-full" [style.background]="c" [attr.aria-label]="'Colour ' + c" [attr.aria-pressed]="color() === c"
                      [class.ring-2]="color() === c" [class.ring-white]="color() === c" (click)="color.set(c)"></button>
                  }
                </div>
                <button type="button" class="btn" (click)="save(h, eName.value, eEmoji.value, eFreq.value, eSlot.value, eDay.value)">Save</button>
              } @else {
                <p class="muted w-full">{{ h.emoji }} {{ h.name }} fills in automatically, so only its position can change.</p>
              }
              <button type="button" class="btn-quiet !text-kcal" (click)="archive(h)">{{ confirming() === h.id ? 'Tap again' : 'Archive' }}</button>
              <button type="button" class="btn-quiet" (click)="editing.set(null)">Cancel</button>
            </div>
          } @else {
            <div class="flex items-center gap-2 text-sm">
              <span class="size-2.5 shrink-0 rounded-full" [style.background]="h.color"></span>
              <button type="button" class="flex-1 text-left" (click)="startEdit(h)">{{ h.emoji }} {{ h.name }}</button>
              <span class="muted">{{ meta(h) }}</span>
              <button type="button" class="px-1 text-muted disabled:opacity-20" [attr.aria-label]="'Move ' + h.name + ' up'" [disabled]="first" (click)="move(i, -1)">▲</button>
              <button type="button" class="px-1 text-muted disabled:opacity-20" [attr.aria-label]="'Move ' + h.name + ' down'" [disabled]="last" (click)="move(i, 1)">▼</button>
            </div>
          }
        </div>
      }
      <form class="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2" (submit)="add($event, nName, nEmoji, nFreq, nSlot, nDay)">
        <input #nEmoji class="field !w-14 text-center" placeholder="✅" maxlength="8" aria-label="New habit emoji" />
        <input #nName class="field flex-1" placeholder="+ Add habit" maxlength="40" aria-label="New habit name" />
        <select #nFreq class="field !w-auto" aria-label="New habit frequency"><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
        <select #nSlot class="field !w-auto" aria-label="New habit time of day">
          @for (s of slots; track s) {
            <option [value]="s" [selected]="s === 'anytime'">{{ slotLabel[s] }}</option>
          }
        </select>
        <select #nDay class="field !w-auto" aria-label="New habit weekday">
          @for (d of weekdays; track $index) {
            <option [value]="$index">{{ d }}</option>
          }
        </select>
        <button class="btn" type="submit">Add</button>
      </form>
      @if (error(); as e) {
        <p class="mt-1 text-sm text-kcal" role="alert">{{ e }}</p>
      }
    </section>
  `,
})
export class HabitsSection {
  private readonly store = inject(TrackerStore);
  private readonly api = inject(TrackerApi);
  protected readonly palette = HABIT_PALETTE;
  protected readonly weekdays = WEEKDAYS;
  protected readonly slots: Slot[] = ['morning', 'night', 'anytime'];
  protected readonly slotLabel = SLOT_LABEL;
  protected readonly editing = signal<string | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly color = signal(HABIT_PALETTE[0]);
  protected readonly error = signal<string | null>(null);

  protected readonly list = computed(() =>
    this.store.habits().filter((h) => h.archivedDay === null || h.archivedDay > this.store.today()).sort(bySortOrder),
  );

  protected meta(h: Habit): string {
    if (h.source !== 'manual') return 'Auto ⚡';
    return h.frequency === 'weekly' ? `Weekly · ${WEEKDAYS[h.weekday ?? 0].slice(0, 3)}` : `Daily · ${SLOT_LABEL[h.slot]}`;
  }

  protected startEdit(h: Habit): void {
    this.confirming.set(null);
    this.color.set(h.color.toUpperCase());
    this.editing.set(h.id);
  }

  protected async save(h: Habit, name: string, emoji: string, frequency: string, slot: string, weekday: string): Promise<void> {
    const parsed = parseHabit({ name, emoji, frequency: frequency as Frequency, slot: slot as Slot, weekday });
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const v = parsed.value;
    if (await this.store.guard(() => this.api.updateHabit(h.id, { ...v, color: this.color(), source: h.source, sortOrder: h.sortOrder }))) this.editing.set(null);
  }

  protected async add(event: Event, name: HTMLInputElement, emoji: HTMLInputElement, freq: HTMLSelectElement, slot: HTMLSelectElement, day: HTMLSelectElement): Promise<void> {
    event.preventDefault();
    const parsed = parseHabit({ name: name.value, emoji: emoji.value, frequency: freq.value as Frequency, slot: slot.value as Slot, weekday: day.value });
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const habits = this.store.habits();
    const sortOrder = Math.max(0, ...habits.map((h) => h.sortOrder)) + 1;
    const color = nextColor(habits.filter((h) => h.archivedDay === null).map((h) => h.color));
    if (await this.store.guard(() => this.api.addHabit({ ...parsed.value, color, source: 'manual', sortOrder }))) {
      name.value = '';
      emoji.value = '';
    }
  }

  protected async archive(h: Habit): Promise<void> {
    if (this.confirming() !== h.id) return this.confirming.set(h.id);
    this.confirming.set(null);
    if (await this.store.guard(() => this.api.archiveHabit(h.id))) this.editing.set(null);
  }

  protected async move(index: number, delta: number): Promise<void> {
    const ids = moved(this.list().map((h) => h.id), index, delta);
    await this.store.guard(() => this.api.setSortOrders(ids));
  }
}
```

- [ ] **Step 6: Targets, fasting and Shortcut sections**

Create `src/app/features/settings/targets-section.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TrackerApi } from '../../data/tracker-api';
import { TrackerStore } from '../../data/tracker.store';
import { parseTargets } from './settings-forms';

@Component({
  selector: 'app-targets-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Targets">
      <p class="label mb-1 text-steps">Targets</p>
      <form class="grid grid-cols-[1fr_7rem] items-center gap-1.5 text-sm" (submit)="save($event, steps.value, kcal.value)">
        <label for="step-goal">Steps</label>
        <input #steps id="step-goal" class="field" inputmode="numeric" [value]="store.goals().stepGoal" />
        <label for="kcal-goal">Calories (kcal)</label>
        <input #kcal id="kcal-goal" class="field" inputmode="numeric" [value]="store.goals().kcalGoal" />
        <button class="btn col-span-2" type="submit">Save targets</button>
      </form>
      @if (error(); as e) {
        <p class="mt-1 text-sm text-kcal" role="alert">{{ e }}</p>
      }
      @if (saved()) {
        <p class="mt-1 text-sm text-steps" role="status">Saved</p>
      }
    </section>
  `,
})
export class TargetsSection {
  protected readonly store = inject(TrackerStore);
  private readonly api = inject(TrackerApi);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected async save(event: Event, steps: string, kcal: string): Promise<void> {
    event.preventDefault();
    const parsed = parseTargets({ steps, kcal });
    this.saved.set(false);
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const { stepGoal, kcalGoal } = parsed.value;
    this.saved.set(await this.store.guard(() => this.api.updateGoals(stepGoal, kcalGoal)));
  }
}
```

Create `src/app/features/settings/fasting-section.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { sortWindows, validateWindows, type EatingWindow } from '@shared/windows';
import { TrackerApi } from '../../data/tracker-api';
import { TrackerStore } from '../../data/tracker.store';
import { nextColor } from '../../domain/palette';
import { isActiveOn } from '../../domain/visibility';

@Component({
  selector: 'app-fasting-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Fasting">
      <div class="flex items-center justify-between">
        <p class="label text-weekly">Fasting</p>
        <button type="button" role="switch" aria-label="Fasting on" [attr.aria-checked]="enabled()" (click)="setEnabled(!enabled())"
          class="relative h-6 w-11 rounded-full" [class]="enabled() ? 'bg-steps' : 'bg-raised'">
          <span class="absolute top-0.5 size-5 rounded-full bg-white" [class]="enabled() ? 'left-[22px]' : 'left-0.5'"></span>
        </button>
      </div>
      <p class="muted mb-2">Eat only inside these windows. The Food Guard closes food apps outside them.</p>
      @for (w of draft(); track $index; let i = $index) {
        <div class="flex items-center gap-1.5 py-1">
          <input class="field !w-28" type="time" [value]="w.start" [attr.aria-label]="'Window ' + (i + 1) + ' start'" (change)="setTime(i, 'start', $any($event.target).value)" />
          <span class="text-muted">–</span>
          <input class="field !w-28" type="time" [value]="w.end" [attr.aria-label]="'Window ' + (i + 1) + ' end'" (change)="setTime(i, 'end', $any($event.target).value)" />
          <button type="button" class="ml-auto text-xs text-muted underline" (click)="removeWindow(i)">Remove</button>
        </div>
      }
      <div class="mt-2 flex gap-2">
        @if (draft().length < 3) {
          <button type="button" class="btn-quiet" (click)="addWindow()">+ Add window</button>
        }
        <button type="button" class="btn" (click)="save()">Save windows</button>
      </div>
      @if (error(); as e) {
        <p class="mt-1 text-sm text-kcal" role="alert">{{ e }}</p>
      }
      @if (saved()) {
        <p class="mt-1 text-sm text-steps" role="status">Saved</p>
      }
    </section>
  `,
})
export class FastingSection {
  private readonly store = inject(TrackerStore);
  private readonly api = inject(TrackerApi);
  protected readonly enabled = computed(() => this.store.goals().fastingEnabled);
  protected readonly draft = linkedSignal<EatingWindow[]>(() => this.store.goals().windows.map((w) => ({ ...w })));
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected setTime(i: number, key: 'start' | 'end', value: string): void {
    this.draft.update((list) => list.map((w, j) => (j === i ? { ...w, [key]: value } : w)));
    this.saved.set(false);
  }

  protected addWindow(): void {
    this.draft.update((list) => [...list, { start: '18:00', end: '19:00' }]);
  }

  protected removeWindow(i: number): void {
    this.draft.update((list) => list.filter((_, j) => j !== i));
  }

  protected async save(): Promise<void> {
    const problem = validateWindows(this.draft());
    this.error.set(problem);
    if (problem) return;
    const windows = sortWindows(this.draft());
    this.saved.set(await this.store.guard(() => this.api.updateFasting(this.enabled(), windows)));
  }

  protected async setEnabled(on: boolean): Promise<void> {
    const habits = this.store.habits();
    const active = habits.filter((h) => h.source === 'fasting' && isActiveOn(h, this.store.today()));
    await this.store.guard(async () => {
      await this.api.updateFasting(on, this.store.goals().windows);
      if (on && active.length === 0) {
        await this.api.addHabit({
          name: 'Fasting windows kept', emoji: '🌙', color: nextColor(habits.map((h) => h.color)), frequency: 'daily',
          source: 'fasting', slot: 'anytime', weekday: null, sortOrder: Math.max(0, ...habits.map((h) => h.sortOrder)) + 1,
        });
      }
      if (!on) for (const h of active) await this.api.archiveHabit(h.id);
    });
  }
}
```

Create `src/app/features/settings/shortcut-section.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { appDayOf } from '@shared/days';
import { FUNCTIONS_URL, SHORTCUT_DOCS_URL } from '../../core/config';
import { dayLabel, timeOf } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { TrackerStore } from '../../data/tracker.store';

@Component({
  selector: 'app-shortcut-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="iPhone Shortcut">
      <p class="label mb-1 text-muted">iPhone Shortcut</p>
      <p class="flex justify-between text-sm"><span>Status</span>
        <span [class.text-steps]="!!store.lastSyncAt()" [class.text-muted]="!store.lastSyncAt()">{{ status() }}</span></p>
      @if (token(); as t) {
        <div class="mt-2 rounded-xl bg-raised p-2">
          <p class="text-xs font-semibold">Your new token — shown once</p>
          <div class="mt-1 flex gap-1.5">
            <input class="field font-mono !text-xs" readonly [value]="t" aria-label="Sync token" />
            <button type="button" class="btn-quiet" (click)="copy(t)">{{ copied() === t ? 'Copied' : 'Copy' }}</button>
          </div>
          <p class="muted mt-1">Paste it into <b>both</b> shortcuts: Countdown Sync and Food Guard.</p>
        </div>
      }
      <button type="button" class="btn-quiet mt-2 w-full" (click)="rotate()">{{ rotateLabel() }}</button>
      <div class="mt-2 space-y-1 text-xs">
        @for (u of urls; track u.label) {
          <div class="flex items-center gap-1.5">
            <span class="w-20 shrink-0 text-muted">{{ u.label }}</span>
            <code class="min-w-0 flex-1 truncate">{{ u.url }}</code>
            <button type="button" class="underline" (click)="copy(u.url)">{{ copied() === u.url ? 'Copied' : 'Copy' }}</button>
          </div>
        }
      </div>
      <a class="mt-2 inline-block text-sm font-semibold text-routine" [href]="docsUrl" target="_blank" rel="noopener">Setup steps →</a>
    </section>
  `,
})
export class ShortcutSection {
  protected readonly store = inject(TrackerStore);
  private readonly toast = inject(ToastService);
  protected readonly docsUrl = SHORTCUT_DOCS_URL;
  protected readonly urls = [
    { label: 'Sync URL', url: `${FUNCTIONS_URL}/sync` },
    { label: 'Guard URL', url: `${FUNCTIONS_URL}/food-guard` },
  ];
  protected readonly token = signal<string | null>(null);
  protected readonly copied = signal<string | null>(null);
  protected readonly confirming = signal(false);

  protected readonly status = computed(() => {
    const at = this.store.lastSyncAt();
    return at ? `● Connected · ${dayLabel(appDayOf(new Date(at)))}, ${timeOf(at)}` : 'Never synced';
  });

  protected readonly rotateLabel = computed(() => {
    if (!this.store.hasToken() && !this.token()) return 'Generate token';
    return this.confirming() ? 'Tap again — the old token stops working' : 'Rotate token';
  });

  protected async rotate(): Promise<void> {
    if ((this.store.hasToken() || this.token()) && !this.confirming()) return this.confirming.set(true);
    this.confirming.set(false);
    const t = await this.store.rotateToken();
    if (t) this.token.set(t);
  }

  protected copy(text: string): void {
    navigator.clipboard?.writeText(text).then(
      () => this.copied.set(text),
      () => this.toast.show('Copy failed — select it and copy by hand'),
    );
  }
}
```

(`fakeApi` in the spec returns `hasToken: true` from `loadConfig`, but the store only reads that on `reloadConfig()`, so before the first tap `hasToken()` is still `false` and the button says "Generate token" — exactly the first-time path. The confirm-tap path is covered by Playwright in Task 15.)

- [ ] **Step 7: The Settings page**

Replace `src/app/features/settings/settings.page.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { CountdownsSection } from './countdowns-section';
import { FastingSection } from './fasting-section';
import { HabitsSection } from './habits-section';
import { ShortcutSection } from './shortcut-section';
import { TargetsSection } from './targets-section';

@Component({
  selector: 'app-settings-page',
  imports: [CountdownsSection, HabitsSection, TargetsSection, FastingSection, ShortcutSection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-3 px-1 text-2xl font-extrabold">Settings</h1>
    <div class="grid gap-2 lg:grid-cols-2">
      <app-countdowns-section />
      <app-habits-section />
      <app-targets-section />
      <app-fasting-section />
      <app-shortcut-section />
      <section class="card" aria-label="Account">
        <p class="label mb-1 text-muted">Account</p>
        <p class="flex items-center justify-between gap-2 text-sm">
          <span class="truncate">{{ auth.email() }}</span>
          <button type="button" class="btn-quiet" (click)="auth.signOut()">Sign out</button>
        </p>
      </section>
    </div>
  `,
})
export class SettingsPage {
  protected readonly auth = inject(AuthService);
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npx ng test --watch=false`
Expected: PASS — `settings-forms.spec.ts` (5), `settings-sections.spec.ts` (2), plus earlier suites.

- [ ] **Step 9: Browser check**

`npx ng serve`, test user, phone width, `/settings`:
- **Countdowns:** add "Test 🎯" for 10 days from today → it appears; on it, "+ Add challenge" → AM skincare on 8 of 10 → "🏁 AM skincare on 8 of 10 days". `/today` shows a Test challenges card. Back in Settings, Delete the countdown (Delete → Tap again).
- **Habits:** add "Hair oil", weekly, Sunday → listed as "Weekly · Sun". ▲ moves it up, and the wheel's ring order follows. Archive it (two taps).
- **Targets:** 500 steps → "Step goal must be 1,000–100,000"; 12000 → Saved, and the Today steps ring shows "/ 12k".
- **Fasting:** set window 2 to 00:30–13:00 → "Windows can't overlap"; set it back to 11:00–13:00 → Saved. Switch fasting off → the Today fasting card disappears and the wheel loses "Fasting windows kept". Switch it on → both return.
- **Shortcut:** Generate token → a 64-character token with Copy; the button now says "Rotate token" and needs a second tap.
- **Account:** Sign out → `/login`.

Stop the server.

- [ ] **Step 10: Commit**

```bash
git add src/app/features/settings
git commit -m "Add Settings: countdowns with challenges, habits, targets, fasting, Shortcut token" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Report card screen

**Files:**
- Create: `src/app/features/report/report-view.ts`, `src/app/features/report/report-view.spec.ts`
- Modify: `src/app/features/report/report.page.ts` (replace stub)

**Interfaces:**
- Consumes: `buildReport`, `ReportCard` (Task 5), `TrackerStore`, format helpers (`dayLabel`, `dayRange`, `formatCompact`).
- Produces: `app-report-view` (`report: ReportCard`, `today: Day`); `ReportPage` (`id` route input).

- [ ] **Step 1: Write the failing test**

Create `src/app/features/report/report-view.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import type { ReportCard } from '../../domain/report';
import { ReportView } from './report-view';

const countdown = { id: 'd', title: 'Diwali', emoji: '🪔', targetDate: '2026-11-08', createdDay: '2026-10-19' };
const full: ReportCard = {
  countdown, from: '2026-10-19', to: '2026-11-07', days: 20, avgScore: 84, grade: 'A',
  bestWeek: { from: '2026-11-01', to: '2026-11-07', avg: 92 }, perfectDays: 6, bestStreak: 14, workoutDays: 13,
  totalSteps: 196_420, avgSteps: 9_821, kcalDays: 15,
  challenges: [{ id: 'c1', habitName: '10k steps', done: 16, target: 15, won: true }, { id: 'c2', habitName: 'Workout', done: 9, target: 12, won: false }],
  habits: [{ id: 'h', name: 'Minoxidil AM', color: '#32D7FA', percent: 100 }],
};

async function render(report: ReportCard, today = '2026-11-08') {
  const fixture = TestBed.createComponent(ReportView);
  fixture.componentRef.setInput('report', report);
  fixture.componentRef.setInput('today', today);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ReportView', () => {
  it('shows the grade, stats, challenge results and habit bars', async () => {
    const el = await render(full);
    expect(el.textContent).toContain('SUN 8 NOV · HAPPY DIWALI 🪔');
    expect(el.textContent).toContain('19 Oct – 7 Nov · 20 days');
    expect(el.querySelector('[data-testid=grade]')?.textContent?.trim()).toBe('A');
    expect(el.textContent).toContain('Average score 84');
    expect(el.textContent).toContain('Best week: 1 Nov – 7 Nov (avg 92)');
    for (const s of ['6', '14', '13', '196k', '9.8k', '15']) expect(el.textContent).toContain(s);
    expect(el.textContent).toContain('WON');
    expect(el.textContent).toContain('missed');
    expect(el.textContent).toContain('Minoxidil AM');
    expect(el.textContent).toContain('100%');
  });

  it('says there is nothing to report for an empty period', async () => {
    const el = await render({ ...full, days: 0, avgScore: null, grade: null, bestWeek: null, challenges: [], habits: [] });
    expect(el.textContent).toContain('Nothing to report — this countdown started today');
    expect(el.querySelector('[data-testid=grade]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx ng test --watch=false` → Expected: FAIL — cannot resolve `./report-view`.

- [ ] **Step 3: Implement the view and the page**

Create `src/app/features/report/report-view.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { dayLabel, dayRange, formatCompact } from '../../core/format';
import type { ReportCard } from '../../domain/report';
import type { Day } from '../../domain/types';

@Component({
  selector: 'app-report-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = report();
    <div class="text-center">
      <p class="text-xs font-bold tracking-wide text-count">{{ headline() }}</p>
      <h1 class="mt-0.5 text-xl font-black">{{ r.countdown.title }} report card</h1>
      <p class="muted">{{ range(r.from, r.to) }} · {{ r.days }} days</p>
    </div>
    @if (r.days === 0) {
      <p class="card muted mt-3 text-center">Nothing to report — this countdown started today.</p>
    } @else {
      <section class="card mt-3 flex items-center gap-3 bg-gradient-to-br from-[#3a2a00] to-card">
        <p class="w-14 text-center text-5xl font-black text-count" data-testid="grade">{{ r.grade }}</p>
        <div>
          <p class="text-sm font-bold">Average score {{ r.avgScore }}</p>
          @if (r.bestWeek; as w) {
            <p class="muted">Best week: {{ range(w.from, w.to) }} (avg {{ w.avg }})</p>
          }
        </div>
      </section>
      <div class="mt-2 grid grid-cols-3 gap-1.5">
        @for (s of stats(); track s.label) {
          <div class="rounded-xl bg-card p-2 text-center">
            <b class="block text-xl font-black leading-tight" [style.color]="s.color">{{ s.value }}</b>
            <span class="muted">{{ s.label }}</span>
          </div>
        }
      </div>
      @if (r.challenges.length) {
        <section class="card mt-2">
          <p class="label mb-1 text-count">Challenges</p>
          @for (c of r.challenges; track c.id) {
            <p class="flex items-center justify-between py-0.5 text-sm">
              <span>{{ c.won ? '🏆' : '✕' }} {{ c.habitName }}</span>
              <span><b>{{ c.done }}</b>/{{ c.target }}
                <span class="ml-1 rounded-md px-1.5 py-px text-[9px] font-extrabold" [class]="c.won ? 'bg-[#3a2a00] text-count' : 'bg-raised text-muted'">{{ c.won ? 'WON' : 'missed' }}</span></span>
            </p>
          }
        </section>
      }
      @if (r.habits.length) {
        <section class="card mt-2">
          <p class="label mb-1 text-routine">Habits</p>
          @for (h of r.habits; track h.id) {
            <p class="flex justify-between text-sm"><span>{{ h.name }}</span><span>{{ h.percent }}%</span></p>
            <div class="mb-1.5 mt-0.5 h-1.5 rounded bg-raised"><div class="h-full rounded" [style.width.%]="h.percent" [style.background]="h.color"></div></div>
          }
        </section>
      }
    }
  `,
})
export class ReportView {
  readonly report = input.required<ReportCard>();
  readonly today = input.required<Day>();
  protected readonly range = dayRange;

  protected readonly headline = computed(() => {
    const c = this.report().countdown;
    const prefix = this.today() === c.targetDate ? 'HAPPY ' : '';
    return `${dayLabel(c.targetDate).toUpperCase()} · ${prefix}${c.title.toUpperCase()} ${c.emoji}`;
  });

  protected readonly stats = computed(() => {
    const r = this.report();
    return [
      { label: '⭐ Perfect', value: String(r.perfectDays), color: '#ffd60a' },
      { label: '🔥 best streak', value: String(r.bestStreak), color: '#ff9f0a' },
      { label: '💪 workouts', value: String(r.workoutDays), color: '#a3f53b' },
      { label: 'steps', value: formatCompact(r.totalSteps), color: '#a3f53b' },
      { label: 'steps/day', value: formatCompact(r.avgSteps), color: '#a3f53b' },
      { label: 'kcal on target', value: String(r.kcalDays), color: '#ff375f' },
    ];
  });
}
```

Replace `src/app/features/report/report.page.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TrackerStore } from '../../data/tracker.store';
import { buildReport } from '../../domain/report';
import { ReportView } from './report-view';

@Component({
  selector: 'app-report-page',
  imports: [RouterLink, ReportView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/today" class="mb-2 inline-block px-1 text-sm text-routine">← Today</a>
    @if (report(); as r) {
      <app-report-view [report]="r" [today]="store.today()" />
    } @else {
      <p class="card muted text-center">That countdown doesn't exist any more.</p>
    }
  `,
})
export class ReportPage {
  readonly id = input.required<string>();
  protected readonly store = inject(TrackerStore);
  private readonly countdown = computed(() => this.store.countdowns().find((c) => c.id === this.id()) ?? null);
  protected readonly report = computed(() => {
    const c = this.countdown();
    return c ? buildReport(c, this.store.habits(), this.store.challenges(), this.store.ctx()) : null;
  });

  constructor() {
    effect(() => {
      const c = this.countdown();
      if (c) untracked(() => void this.store.ensureHistoryFrom(c.createdDay).catch(() => undefined));
    });
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx ng test --watch=false` → Expected: PASS — `report-view.spec.ts` (2), plus earlier suites.

- [ ] **Step 5: Browser check**

`npx ng serve`, test user. In Settings, add a countdown "Test" for **tomorrow**. Visit `/report/<its id>` (Settings → only past countdowns link here, so take the id from the Network tab's `countdowns` response). Expected: "Nothing to report — this countdown started today"… until tomorrow. The populated card is exercised by Playwright with a pinned clock in Task 15. Delete the countdown. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/report
git commit -m "Add report card screen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Live test harness — Playwright end-to-end, live functions, security

**Files:**
- Create: `playwright.config.ts`, `e2e/helpers.ts`, `e2e/auth.spec.ts`, `e2e/today.spec.ts`, `e2e/food.spec.ts`, `e2e/fasting.spec.ts`, `e2e/rollover.spec.ts`, `e2e/countdown.spec.ts`, `e2e/offline.spec.ts`
- Create: `scripts/live/security-check.mjs`, `scripts/live/functions-check.mjs`, `.github/workflows/live-tests.yml`
- Modify: `package.json` (devDependency + scripts), `.gitignore`, `tsconfig.json` (exclude `e2e/` from the Angular build is automatic — `tsconfig.app.json` only includes `src/`)

**Interfaces:**
- Consumes: `scripts/live/env.mjs` (Task 6), deployed functions (Task 7), the whole app.
- Produces: npm scripts `test:e2e`, `test:security`, `test:functions-live`, `test:live`; the manual workflow "Live tests".

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test@1.64.1
npx playwright install chromium
```

Append to `.gitignore`:

```
test-results/
playwright-report/
```

In `package.json` `"scripts"`, add:

```json
    "test:e2e": "playwright test",
    "test:security": "node scripts/live/security-check.mjs",
    "test:functions-live": "node scripts/live/functions-check.mjs",
    "test:live": "node scripts/live/setup-check.mjs && npm run test:security && npm run test:functions-live && npm run test:e2e",
```

- [ ] **Step 2: Security check**

Create `scripts/live/security-check.mjs`:

```js
// Proves row-level security: the test user only ever sees its own rows, can't write rows for anyone else,
// and a signed-out client can read nothing and call no RPCs.
import assert from 'node:assert/strict';
import { anon, resetUser, signIn, TABLES } from './env.mjs';

const { db, userId } = await signIn();
await resetUser(db, userId);

for (const table of TABLES) {
  const { data, error } = await db.from(table).select('user_id');
  assert.ifError(error);
  assert.ok(data.every((r) => r.user_id === userId), `${table}: returned another user's rows`);
}

const stranger = '00000000-0000-0000-0000-000000000001';
const foreignRows = {
  settings: { user_id: stranger },
  countdowns: { user_id: stranger, title: 'x', target_date: '2030-01-01' },
  habits: { user_id: stranger, name: 'x', color: '#FFFFFF', frequency: 'daily' },
  steps_daily: { user_id: stranger, day: '2026-10-19', count: 1 },
  workouts: { user_id: stranger, started_at: new Date().toISOString(), day: '2026-10-19', source: 'manual' },
  saved_foods: { user_id: stranger, name: 'x', kcal: 1 },
  food_entries: { user_id: stranger, day: '2026-10-19', name: 'x', kcal: 1 },
  tasks: { user_id: stranger, title: 'x', month: '2026-10-01' },
};
for (const [table, row] of Object.entries(foreignRows)) {
  const { error } = await db.from(table).insert(row);
  assert.equal(error?.code, '42501', `${table}: insert for another user was not blocked by RLS (${error?.message ?? 'accepted'})`);
}

const signedOut = anon();
for (const table of TABLES) {
  const { data, error } = await signedOut.from(table).select('*').limit(1);
  assert.ok(error || data.length === 0, `${table}: readable while signed out`);
}
for (const fn of ['ensure_setup', 'rotate_sync_token']) {
  const { error } = await signedOut.rpc(fn);
  assert.ok(error, `${fn}: callable while signed out`);
}

console.log('security-check passed');
```

Run: `npm run test:security` → Expected: `security-check passed`.

- [ ] **Step 3: Live function check**

Create `scripts/live/functions-check.mjs`:

```js
// Exercises the deployed sync and food-guard functions end to end with the test user's token.
import assert from 'node:assert/strict';
import { appToday, istDayOf, istMinutesOf } from '../../supabase/functions/_shared/days.ts';
import { env, resetUser, signIn } from './env.mjs';

const { db, userId } = await signIn();
await resetUser(db, userId);
const { data: token, error: tokenError } = await db.rpc('rotate_sync_token');
assert.ifError(tokenError);

async function call(fn, body, auth = `Bearer ${token}`) {
  const res = await fetch(`${env.url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const TOKEN_ERROR = { error: 'Token not recognised — copy it again from Settings' };
assert.deepEqual(await call('sync', {}, null), { status: 401, body: TOKEN_ERROR });
assert.deepEqual(await call('sync', {}, 'Bearer wrong'), { status: 401, body: TOKEN_ERROR });
assert.deepEqual(await call('food-guard', {}, 'Bearer wrong'), { status: 401, body: TOKEN_ERROR });

assert.deepEqual(await call('sync', 'not json'), { status: 400, body: { error: 'Body must be JSON' } });
assert.deepEqual((await call('sync', { steps: [{ date: '2020-01-01', count: 1 }] })).body, { error: 'steps[0].date must be a recent date (yyyy-MM-dd)' });

const calendarToday = istDayOf(new Date());
const start = new Date(Date.now() - 60 * 60_000).toISOString();
const quirky = { steps: { date: calendarToday, count: '7842.4' }, workouts: [{ start, durationMin: '52', name: 'Traditional Strength Training' }] };
const first = await call('sync', quirky);
assert.equal(first.status, 200);
assert.deepEqual(first.body.saved, { steps: 1, workouts: 1 });
assert.ok(first.body.pending.includes('AM skincare'), 'nudge lists unticked routines');
assert.match(first.body.message, /^Left today: /);

const again = await call('sync', quirky);
assert.equal(again.status, 200);
const { data: workouts } = await db.from('workouts').select('source, duration_min');
assert.deepEqual(workouts, [{ source: 'health', duration_min: 52 }], 'a re-sent workout is not duplicated');
const { data: steps } = await db.from('steps_daily').select('count').eq('day', calendarToday).single();
assert.equal(steps.count, 7842);

assert.equal((await call('sync', '')).status, 200, 'an empty body is accepted');

const today = appToday();
const { data: manual } = await db.from('habits').select('id').eq('source', 'manual');
await db.from('habit_checks').insert(manual.map((h) => ({ habit_id: h.id, day: today })));
const done = await call('sync', { ping: '1' });
assert.deepEqual([done.body.pending, done.body.message], [[], ''], 'nothing left once everything is ticked');
const { data: settings } = await db.from('settings').select('last_sync_at').single();
assert.ok(Date.now() - Date.parse(settings.last_sync_at) < 5 * 60_000, 'last_sync_at updated');

// food-guard: build windows around the server's real clock.
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const now = istMinutesOf(new Date());
const around = { start: hhmm(Math.max(0, now - 30)), end: hhmm(Math.min(1439, now + 30)) };
const away = now + 180 <= 1439 ? { start: hhmm(now + 120), end: hhmm(now + 180) } : { start: hhmm(now - 180), end: hhmm(now - 120) };

await db.from('settings').update({ fasting_enabled: true, eating_windows: [around] }).eq('user_id', userId);
const open = (await call('food-guard', { ping: '1' })).body;
assert.deepEqual([open.kcal, open.reached, open.fasting, open.blocked, open.message], [0, false, false, false, '']);

await db.from('food_entries').insert({ day: today, eaten_at: new Date().toISOString(), name: 'Test', kcal: 2000 });
const atTarget = (await call('food-guard', {})).body;
assert.equal(atTarget.blocked, true);
assert.equal(atTarget.message, "🛑 2,000 kcal today — target hit. Kitchen's closed.");

await db.from('food_entries').delete().eq('user_id', userId);
await db.from('settings').update({ eating_windows: [away] }).eq('user_id', userId);
const fasting = (await call('food-guard', {})).body;
assert.deepEqual([fasting.fasting, fasting.blocked], [true, true]);
assert.match(fasting.message, /^🌙 Fasting — next window opens at \d{1,2}:\d{2} (AM|PM)\.$/);

await db.from('settings').update({ fasting_enabled: false }).eq('user_id', userId);
const off = (await call('food-guard', {})).body;
assert.deepEqual([off.blocked, off.nextWindow], [false, null]);

await resetUser(db, userId);
console.log('functions-check passed');
```

Run: `npm run test:functions-live` → Expected: `functions-check passed`. (Node 24 imports the shared `.ts` helpers directly by stripping their types.)

- [ ] **Step 4: Playwright config and helpers**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI passes the variables in directly.
}

export default defineConfig({
  testDir: 'e2e',
  // All specs share one test user, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4200', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: { command: 'npx ng serve --port 4200', url: 'http://localhost:4200', reuseExistingServer: true, timeout: 180_000 },
});
```

Create `e2e/helpers.ts`:

```ts
import { expect, type Page } from '@playwright/test';
import { env, resetUser, signIn } from '../scripts/live/env.mjs';
import { addDays, appToday } from '../supabase/functions/_shared/days';

export const today = () => appToday();
export const tomorrow = () => addDays(appToday(), 1);

/** Wipes the test user's data and re-seeds the defaults. */
export async function resetTestUser(): Promise<void> {
  const { db, userId } = await signIn();
  await resetUser(db, userId);
}

/**
 * Pins the app's clock (not the browser's) to an IST wall-clock time on a calendar day.
 * Faking the whole browser clock would make Supabase think every session token had expired.
 */
export async function pinClock(page: Page, day: string, hhmm: string): Promise<void> {
  const iso = new Date(`${day}T${hhmm}:00+05:30`).toISOString();
  const set = (value: string) => {
    (window as unknown as { __countdownNow?: string }).__countdownNow = value;
  };
  await page.addInitScript(set, iso);
  await page.evaluate(set, iso).catch(() => undefined);
}

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(env.email);
  await page.getByPlaceholder('Password').fill(env.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByLabel("Today's score")).toBeVisible();
}

/** Re-reads "now" after a pinned-clock change (the app's clock also ticks on visibilitychange). */
export async function nudgeClock(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}
```

- [ ] **Step 5: End-to-end specs**

Pinned times always use **today's or tomorrow's** date, never a fixed calendar date, because the seeded habits are created "now" and aren't active on earlier days.

Create `e2e/auth.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { login, resetTestUser } from './helpers';

test.beforeEach(resetTestUser);

test('rejects a wrong password, signs in, and signs out', async ({ page }) => {
  await page.goto('/today');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByPlaceholder('Email').fill('nobody@example.com');
  await page.getByPlaceholder('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText("Email or password didn't match");

  await login(page);
  await page.getByRole('link', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
```

Create `e2e/today.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { login, pinClock, resetTestUser, today } from './helpers';

test.beforeEach(resetTestUser);

test('ticking routines updates the score, rings and wheel, and survives a reload', async ({ page }) => {
  await pinClock(page, today(), '21:00');
  await login(page);
  const am = page.getByRole('checkbox', { name: /AM skincare/ });
  await expect(am).toHaveAttribute('aria-checked', 'false');
  await am.click();
  await expect(am).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Rings')).toContainText('1 / 4 routines');
  await page.getByRole('button', { name: 'Trained today ✓' }).click();
  await expect(page.getByLabel('Workout')).toContainText('Trained');
  await expect(page.getByLabel("Today's score")).toContainText('2 of 8 done');

  await page.reload();
  await expect(page.getByRole('checkbox', { name: /AM skincare/ })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('link', { name: /Habits/ }).click();
  await page.getByRole('tab', { name: '▦ Grid' }).click();
  await expect(page.getByRole('button', { name: `AM skincare on ${today()}` })).toHaveAttribute('aria-pressed', 'true');
});

test('shows both countdowns with day counts', async ({ page }) => {
  await login(page);
  const card = page.getByLabel('Countdowns');
  await expect(card).toContainText('Diwali');
  await expect(card).toContainText('Engagement');
});
```

Create `e2e/food.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { login, pinClock, resetTestUser, today } from './helpers';

test.beforeEach(resetTestUser);

test('quick add, saved foods, the time field and outside-window flags', async ({ page }) => {
  await pinClock(page, today(), '12:10');
  await login(page);
  await page.getByRole('link', { name: /Food/ }).click();

  const form = page.getByLabel('Quick add');
  await form.getByPlaceholder('Food…').fill('Poha');
  await form.getByPlaceholder('kcal').fill('290');
  await form.getByRole('button', { name: '☆ save' }).click();
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('kcal-total')).toHaveText('290');
  await expect(page.getByLabel('Log')).toContainText('12:10 PM');

  await form.getByRole('button', { name: /Poha 290/ }).click();
  await expect(page.getByTestId('kcal-total')).toHaveText('580');

  await form.getByPlaceholder('Food…').fill('Samosa');
  await form.getByPlaceholder('kcal').fill('250');
  await form.locator('input[name=time]').fill('17:00');
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Log').locator('li', { hasText: 'Samosa' })).toContainText('⚠️');

  await page.getByRole('button', { name: 'Edit Samosa' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Tap again' }).click();
  await expect(page.getByLabel('Log')).not.toContainText('Samosa');
  await expect(page.getByTestId('kcal-total')).toHaveText('580');
});
```

Create `e2e/fasting.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { login, pinClock, resetTestUser, today } from './helpers';

test.beforeEach(resetTestUser);

test('fasting card at 2 PM, eating window at 11:30 AM', async ({ page }) => {
  await pinClock(page, today(), '14:00');
  await login(page);
  await expect(page.getByLabel('Fasting')).toContainText('🌙 Fasting · 1h done');
  await expect(page.getByLabel('Fasting')).toContainText('next window 12:00 AM in 10h');

  await pinClock(page, today(), '11:30');
  await page.reload();
  await expect(page.getByLabel('Fasting')).toContainText('🍽️ Eating window');
  await expect(page.getByLabel('Fasting')).toContainText('closes 1:00 PM · 1h 30m left');
});

test('windows are validated and saved', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /Settings/ }).click();
  const section = page.getByRole('region', { name: 'Fasting' });
  await section.getByLabel('Window 2 start').fill('00:30');
  await section.getByLabel('Window 2 start').dispatchEvent('change');
  await section.getByRole('button', { name: 'Save windows' }).click();
  await expect(section.getByRole('alert')).toHaveText("Windows can't overlap");
  await section.getByLabel('Window 2 start').fill('12:00');
  await section.getByLabel('Window 2 start').dispatchEvent('change');
  await section.getByRole('button', { name: 'Save windows' }).click();
  await expect(section.getByRole('status')).toHaveText('Saved');
});
```

Create `e2e/rollover.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { dayLabel } from '../src/app/core/format';
import { login, nudgeClock, pinClock, resetTestUser, today, tomorrow } from './helpers';

test.beforeEach(resetTestUser);

test('3:59 AM still counts as the previous day; 4:00 AM starts a new one', async ({ page }) => {
  await pinClock(page, tomorrow(), '03:59');
  await login(page);
  await expect(page.getByText(dayLabel(today()).toUpperCase())).toBeVisible();
  await page.getByRole('checkbox', { name: /PM skincare/ }).click();
  await expect(page.getByRole('checkbox', { name: /PM skincare/ })).toHaveAttribute('aria-checked', 'true');

  await pinClock(page, tomorrow(), '04:00');
  await nudgeClock(page);
  await expect(page.getByText(dayLabel(tomorrow()).toUpperCase())).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /PM skincare/ })).toHaveAttribute('aria-checked', 'false');
});
```

Create `e2e/countdown.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { addDays } from '../supabase/functions/_shared/days';
import { login, pinClock, resetTestUser, today, tomorrow } from './helpers';

test.beforeEach(resetTestUser);

test('a countdown with a challenge, then its report card on the day', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /Settings/ }).click();
  const countdowns = page.getByRole('region', { name: 'Countdowns' });
  await countdowns.getByLabel('New countdown emoji').fill('🎯');
  await countdowns.getByLabel('New countdown title').fill('Test day');
  await countdowns.getByLabel('New countdown date').fill(addDays(today(), 10));
  await countdowns.getByRole('button', { name: 'Add', exact: true }).click();
  const row = countdowns.getByRole('group', { name: 'Test day' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '+ Add challenge' }).click();
  await row.getByLabel('Challenge habit').selectOption({ label: 'AM skincare' });
  await row.getByLabel('Target days').fill('8');
  await row.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(row).toContainText('AM skincare on 8 of 10 days');

  await page.getByRole('link', { name: /Today/ }).click();
  await expect(page.getByLabel('Test day challenges')).toContainText('ON TRACK');

  // Move the date to tomorrow so the report day arrives in the test.
  await page.getByRole('link', { name: /Settings/ }).click();
  await row.getByRole('button', { name: /Test day/ }).click();
  await row.getByLabel('Date', { exact: true }).fill(tomorrow());
  await row.getByRole('button', { name: 'Save' }).click();

  await pinClock(page, tomorrow(), '12:00');
  await page.goto('/today');
  await expect(page.getByLabel('Countdowns')).toContainText('Today! 🎯');
  await page.getByRole('link', { name: 'See your report card →' }).click();
  await expect(page.getByText('Test day report card')).toBeVisible();
  await expect(page.getByTestId('grade')).toBeVisible();
});
```

Create `e2e/offline.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { login, resetTestUser } from './helpers';

test.beforeEach(resetTestUser);

test('going offline shows the banner and disables ticking', async ({ page, context }) => {
  await login(page);
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: "Offline — changes won't save" })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /AM skincare/ })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByRole('checkbox', { name: /AM skincare/ })).toBeEnabled();
});
```

- [ ] **Step 6: Run the end-to-end suite**

Run: `npm run test:e2e`
Expected: 9 tests × 2 projects (phone, desktop) = **18 passed**. If a selector misses, run `npx playwright test --headed --project=phone e2e/<file>` to watch it, fix the selector or the bug it found, and re-run. Do not loosen an assertion to make it pass.

- [ ] **Step 7: Manual GitHub workflow for the live suite**

Create `.github/workflows/live-tests.yml`:

```yaml
name: Live tests

on:
  workflow_dispatch:

jobs:
  live:
    runs-on: ubuntu-latest
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
      E2E_EMAIL: ${{ secrets.E2E_EMAIL }}
      E2E_PASSWORD: ${{ secrets.E2E_PASSWORD }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:live
      - if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-traces
          path: test-results
```

Set the repository secrets (the URL, key and email are not secret but live here so the workflow is self-contained):

```bash
T=$(gh auth token --user BrutalOverkill)
GH_TOKEN="$T" gh secret set SUPABASE_URL -R BrutalOverkill/countdown-tracker --body "$(grep SUPABASE_URL .env.local | cut -d= -f2)"
GH_TOKEN="$T" gh secret set SUPABASE_PUBLISHABLE_KEY -R BrutalOverkill/countdown-tracker --body "$(grep SUPABASE_PUBLISHABLE_KEY .env.local | cut -d= -f2)"
GH_TOKEN="$T" gh secret set E2E_EMAIL -R BrutalOverkill/countdown-tracker --body "$(grep E2E_EMAIL .env.local | cut -d= -f2)"
```

**(Anvit)** sets the password secret (it prompts for the value, so it never appears in the session):

```
! GH_TOKEN=$(gh auth token --user BrutalOverkill) gh secret set E2E_PASSWORD -R BrutalOverkill/countdown-tracker
```

- [ ] **Step 8: Commit, push, run the live workflow once**

```bash
git add playwright.config.ts e2e scripts/live .github/workflows/live-tests.yml package.json package-lock.json .gitignore
git commit -m "Add Playwright end-to-end, live function and security tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
T=$(gh auth token --user BrutalOverkill)
git -c credential.helper= -c "credential.helper=!f() { echo username=BrutalOverkill; echo password=$T; }; f" push
GH_TOKEN="$T" gh workflow run "Live tests" -R BrutalOverkill/countdown-tracker
```

Expected: the Deploy run (unit + component + function tests) and the Live tests run both succeed (`gh run list -R BrutalOverkill/countdown-tracker`).

---

### Task 16: Shortcut guide, iPhone test checklist, README, final verification

**Files:**
- Create: `docs/iphone-shortcut.md`, `docs/test-plan.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 0's answers (whether Workouts are readable), `FUNCTIONS_URL`.

- [ ] **Step 1: The Shortcut guide**

Create `docs/iphone-shortcut.md` (replace `<ref>` with the real project ref; if Task 0 found Workouts unreadable, delete section A's steps 6–7 and say so at the top):

```markdown
# iPhone setup

You need: the Countdown app open in Safari on the iPhone, and a **sync token** from Countdown → Settings → iPhone Shortcut → Generate token (copy it).

## 1. Install the app

Safari → https://brutaloverkill.github.io/countdown-tracker/ → sign in → Share → **Add to Home Screen** → Add. Open it from the home-screen icon from now on.

## 2. Shortcut A — "Countdown Sync" (steps, workouts, nightly nudge)

Shortcuts app → **+** → tap the name at the top → **Countdown Sync**. Add these actions in order (search for each by name):

1. **Text** → paste your token. Then **Set Variable** → name it `Token`.
2. **Find Health Samples** → Type **Steps** → Start Date **is in the last 7 days** → tap **Show More** → **Group By: Day**.
3. **Repeat with Each** (Health Samples). Inside the repeat:
   1. **Format Date** → Date: *Repeat Item → Start Date* → Date Format **Custom** → `yyyy-MM-dd`.
   2. **Get Contents of URL** → `https://<ref>.supabase.co/functions/v1/sync` → Show More:
      - Method **POST**
      - Headers: `Authorization` = `Bearer ` then the *Token* variable
      - Request Body **JSON**: add field `steps` of type **Dictionary** with two fields: `date` (Text) = *Formatted Date*, `count` (Number) = *Repeat Item* (Value).
4. **End Repeat** (added automatically).
5. *(Only if your phone can read Workouts — see Task 0)* **Find Health Samples** → Type **Workouts** → Start Date **is in the last 2 days**.
6. **Repeat with Each** (those samples). Inside:
   1. **Format Date** → *Repeat Item → Start Date* → **ISO 8601**, Include Time on.
   2. **Get Time Between Dates** → from *Repeat Item → Start Date* to *Repeat Item → End Date* → **Minutes**.
   3. **Get Contents of URL** → same URL/method/header → JSON field `workouts` (Dictionary): `start` (Text) = *Formatted Date*, `durationMin` (Number) = *Time Between Dates*, `name` (Text) = *Repeat Item → Type*.
7. **Get Contents of URL** → same URL/method/header → JSON field `ping` (Text) = `1`. (This last call returns the nudge.)
8. **Get Dictionary Value** → key `error` in *Contents of URL*.
9. **If** *Dictionary Value* **has any value** → **Show Notification** `Countdown sync failed: ` + *Dictionary Value*.
10. **Otherwise** → **Get Dictionary Value** → key `message` in *Contents of URL* (the one from step 7) → **If** it **has any value** → **Show Notification** *Dictionary Value* → **End If**.
11. **End If**.

Run it once with ▶︎ and allow Health access when asked. In the app, Today should show "Steps synced <time>".

**Automation:** Shortcuts → **Automation** → **+** → **Time of Day** → **1:30 AM**, Daily → **Run Immediately** → Next → **Countdown Sync**. (Optional: a second one at 9:30 PM.)

## 3. Shortcut B — "Food Guard" (closes food apps)

New shortcut → name **Food Guard**:

1. **Text** → paste the same token → **Set Variable** `Token`.
2. **Get Contents of URL** → `https://<ref>.supabase.co/functions/v1/food-guard` → POST, header `Authorization` = `Bearer ` + *Token*, JSON field `ping` (Text) = `1`.
3. **Get Dictionary Value** → key `message` in *Contents of URL*.
4. **If** *Dictionary Value* **has any value** → **Go to Home Screen** → **Show Notification** *Dictionary Value* → **End If**.

**Automation:** Automation → **+** → **App** → **Choose** → tick Swiggy, Zomato, Zepto, Blinkit, Domino's, McDonald's (and any other food apps) and the **App Store** → **Is Opened** → **Run Immediately** → Next → **Food Guard**. Turn **Notify When Run** off.

When it blocks: outside your eating windows (12–1 AM, 11 AM–1 PM by default), and once today's logged calories reach your target. Shortcuts can't pick the App Store's "Food & Drink" category, so a newly installed food app needs ticking in this automation. If the server can't be reached, nothing is blocked.

## If something goes wrong

- **"Countdown sync failed: Token not recognised…"** — you rotated the token. Paste the new one into **both** shortcuts' Text action.
- **No notification at all** — open the Shortcuts app → Automation and check both automations are on and set to Run Immediately.
- **Everything fails after a long break** — the free Supabase project pauses after 7 days without use. Supabase dashboard → your project → **Restore**.
```

- [ ] **Step 2: The iPhone test checklist**

Create `docs/test-plan.md`:

```markdown
# iPhone test checklist

Run on the iPhone after setup. Tick each case; note anything that doesn't match "Expected".

| # | Area | Steps | Expected |
|---|---|---|---|
| 1 | Install | Add to Home Screen from Safari, open from the icon | Black splash, "Countdown" under a three-ring icon, opens full screen (no Safari bars) |
| 2 | Offline launch | Airplane mode on, open the app | App opens with the last data and "Offline — changes won't save"; ticks are disabled |
| 3 | Sync by tap | Today → ↻ Sync iPhone | Shortcuts runs Countdown Sync; back in the app, steps match the Health app; "Steps synced <now>" |
| 4 | Workout | Log a workout in Strong, then ↻ Sync | Today's workout card shows it with its duration |
| 5 | Nudge | Leave PM skincare unticked, run Countdown Sync | Notification "Left today: PM skincare, …" |
| 6 | No nudge | Tick everything, run Countdown Sync | No notification |
| 7 | Nightly automation | Leave it overnight | A sync ran at 1:30 AM (Settings → Shortcut status shows the time) |
| 8 | Guard — fasting | At ~2 PM, open Swiggy | Bounced to the home screen + "🌙 Fasting — next window opens at 12:00 AM." |
| 9 | Guard — window open | At ~11:30 AM with < target logged, open Zomato | App opens normally |
| 10 | Guard — target | In a window, log food to ≥ the calorie target, open a food app | Bounced + "🛑 … kcal today — target hit. Kitchen's closed." |
| 11 | Guard — App Store | While blocked (case 8 or 10), open the App Store | Bounced to the home screen |
| 12 | Guard — no network | Airplane mode, open a food app | App opens (fails open); Shortcuts may show a network error banner |
| 13 | 4 AM rollover | Tick a routine at ~1 AM; check again after 4 AM | At 1 AM it counts for the previous day; after 4 AM Today shows the new date with routines unticked |
| 14 | Perfect Day | Close every ring in a day | Confetti overlay once; not again after reopening the app that day |
| 15 | Report card | On a countdown's date, open Today | "Today! 🪔" with "See your report card →"; the card shows a grade and stats |
```

- [ ] **Step 3: README**

Replace `README.md`:

```markdown
# Countdown

A personal tracker: countdowns to the dates that matter, steps and workouts from Apple Health, a calorie log with intermittent-fasting windows, skincare and hair routines on a planner-style habit wheel, a daily score with streaks and challenges, and a Food Guard that closes food apps at the calorie target or outside the eating windows.

**Live:** https://brutaloverkill.github.io/countdown-tracker/ · **Design:** [spec](docs/superpowers/specs/2026-10-19-countdown-tracker-design.md) · **iPhone setup:** [Shortcut guide](docs/iphone-shortcut.md) · **Manual tests:** [iPhone checklist](docs/test-plan.md)

## Develop

- `npm start` — dev server at http://localhost:4200
- `npx ng test --watch=false` — unit + component tests
- `npm run test:functions` — shared helpers + Edge Function logic
- `npm run test:live` — setup, security, live function and Playwright end-to-end tests against the real Supabase project as the test user (needs `.env.local`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `E2E_EMAIL`, `E2E_PASSWORD`)

Pushing to `main` runs the unit/component/function tests and deploys to GitHub Pages. The live suite runs from **Actions → Live tests → Run workflow**.

## Backend (Supabase)

- Schema: `supabase/migrations/` (`npx supabase db push`)
- Functions: `npx supabase functions deploy sync --no-verify-jwt --use-api` and the same for `food-guard`
- The free project **pauses after 7 days without activity**; the nightly Shortcut keeps it awake. If it pauses: dashboard → project → Restore.
- Never commit a secret/service key. The URL and publishable key in `src/app/core/config.ts` are public by design; row-level security protects the data.
```

- [ ] **Step 4: Full verification**

Run, in order, and read every result:

```bash
npx ng test --watch=false
npm run test:functions
npx ng build --base-href /countdown-tracker/
npm run test:live
```

Expected: all unit/component suites pass; 36 function tests pass; the build completes without errors (budget warnings are acceptable, errors are not); `setup-check passed`, `security-check passed`, `functions-check passed`, and 18 Playwright tests pass.

- [ ] **Step 5: Commit, push, verify the deployment**

```bash
git add docs README.md
git commit -m "Add iPhone Shortcut guide, iPhone test checklist and README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
T=$(gh auth token --user BrutalOverkill)
git -c credential.helper= -c "credential.helper=!f() { echo username=BrutalOverkill; echo password=$T; }; f" push
GH_TOKEN="$T" gh run watch -R BrutalOverkill/countdown-tracker --exit-status $(GH_TOKEN="$T" gh run list -R BrutalOverkill/countdown-tracker -L 1 --workflow Deploy --json databaseId --jq '.[0].databaseId')
curl -s https://brutaloverkill.github.io/countdown-tracker/ | grep -o '<title>Countdown</title>'
curl -s -o /dev/null -w "%{http_code}\n" https://brutaloverkill.github.io/countdown-tracker/today
```

Expected: Deploy succeeds; `<title>Countdown</title>`; `/today` returns `404` status with the app's HTML (GitHub Pages' SPA fallback — the page still loads and routes).

- [ ] **Step 6: Hand over to Anvit**

Open the live site in the PC browser, sign in with **Anvit's own** account (not the test user), and check Today shows Diwali and Engagement — `ensure_setup` seeds his data on first login. Then ask Anvit to:
1. Do Task 0 if not done yet.
2. Follow `docs/iphone-shortcut.md` (install, both shortcuts, both automations).
3. Run `docs/test-plan.md` and report any case that doesn't match.
