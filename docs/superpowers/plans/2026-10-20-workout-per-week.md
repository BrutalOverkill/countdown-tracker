# Workout 4-a-Week (Amendment B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workout counts toward 4 sessions a Monday–Sunday week and only enters a day's score when trained or when the week can't reach 4 without that day.

**Architecture:** A new frequency `times_per_week` with `times_per_week = N`. The rule `weekProgress(h, day, ctx)` lives in `domain/scoring.ts` beside `habitDone` (it needs `habitDone`); `scoredHabitsOn` moves there too and takes `ctx`. Today, the score popup and the wheel/grid read it; a migration switches Workout to 4.

**Tech Stack:** as the main plan.

**Spec:** `docs/superpowers/specs/2026-10-19-countdown-tracker-design.md` — Amendment B: §8.6, plus §4.1 (Workout week), §4.2, §6, §8.1.

## Global Constraints

- Week = Monday–Sunday app days (`isoWeekStart` from `@shared/days`). Needed on D = N − done before D ≥ days left (D..Sunday) and > 0. Counts in D's score when needed or done.
- `times_per_week` 1–7, set exactly when `frequency = 'times_per_week'`. No Settings UI for it in this change (Workout is an auto habit; its frequency comes from the migration).
- Challenges stay daily-only. The sync nudge only lists manual habits — unchanged.
- Theme-dependent unit tests set the theme explicitly (Auto follows the real clock).

## Review Focus

1. **Monday after a missed week** — the count restarts at 0 on Monday; last Sunday's shortfall doesn't make Monday "needed".
2. **Week reached early** — after 4 sessions, rest days later that week never count; a 5th session counts as done.
3. **Trained on a needed day** — counts as done (not needed-and-missing); unticking/removing the manual workout brings "needed" back.
4. **Archived Workout** — no week line, nothing in the popup, no crash.
5. **Calendar edge** — a week spanning two months (e.g. Mon 26 Oct – Sun 1 Nov) counts sessions from both months.

---

### Task B1: Model, rule, score

**Files:** Modify `src/app/domain/types.ts`, `src/app/domain/testing.ts`, `src/app/data/rows.ts`, `src/app/domain/scoring.ts`, `src/app/domain/visibility.ts`, `src/app/features/today/today.vm.ts`; Test `src/app/domain/scoring.spec.ts`, `src/app/domain/visibility.spec.ts`

**Produces:** `Frequency` gains `'times_per_week'`; `Habit.timesPerWeek: number | null`; `weekProgress(h, day, ctx): { done: number; target: number; needed: boolean }`; `scoredHabitsOn(habits, day, ctx)` (moved to scoring).

- [ ] **Step 1: Model fields** — `types.ts`: `Frequency = 'daily' | 'weekly' | 'interval' | 'times_per_week'`; `Habit` gains `timesPerWeek: number | null;` after `intervalStart`. `testing.ts` habit(): `timesPerWeek: null`. `rows.ts`: `HabitRow.times_per_week: number | null`; `toHabit` maps `timesPerWeek: r.times_per_week`.

- [ ] **Step 2: Failing tests** — append to `scoring.spec.ts`:

```ts
  describe('times-a-week habits', () => {
    const gym = habit('gym', { source: 'workout', frequency: 'times_per_week', timesPerWeek: 4 });
    // Week of Mon 19 – Sun 25 Oct 2026.
    const trained = (days: string[]) => ctx('2026-10-26', history({ workouts: days }));

    it('is needed only when the week cannot reach the target without that day', () => {
      const c = trained(['2026-10-19', '2026-10-21']);
      expect(weekProgress(gym, '2026-10-22', c)).toEqual({ done: 2, target: 4, needed: false });
      expect(weekProgress(gym, '2026-10-24', c)).toEqual({ done: 2, target: 4, needed: true });
      expect(weekProgress(gym, '2026-10-25', trained(['2026-10-19', '2026-10-21', '2026-10-24'])).needed).toBe(true);
    });

    it('stops being needed once the target is reached, and restarts on Monday', () => {
      const c = trained(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
      expect(weekProgress(gym, '2026-10-25', c)).toEqual({ done: 4, target: 4, needed: false });
      expect(weekProgress(gym, '2026-10-26', trained(['2026-10-19'])).done).toBe(0);
    });

    it('counts a week that spans two months', () => {
      expect(weekProgress(gym, '2026-11-01', ctx('2026-11-02', history({ workouts: ['2026-10-26', '2026-10-31'] }))).done).toBe(2);
    });

    it('scores it on training days and needed days only, so a rest day keeps a Perfect Day possible', () => {
      const am = habit('am');
      const c = ctx('2026-10-26', history({ workouts: ['2026-10-19'], checks: { am: ['2026-10-20', '2026-10-24'] } }));
      expect(dayScore([am, gym], '2026-10-19', c)).toMatchObject({ total: 2 });
      expect(dayScore([am, gym], '2026-10-20', c)).toMatchObject({ done: 1, total: 1 });
      expect(dayScore([am, gym], '2026-10-24', c)).toMatchObject({ done: 1, total: 2 });
    });
  });
```

  (Import `weekProgress` alongside `dayScore`.) In `visibility.spec.ts`, move the `scoredHabitsOn` test's import to `./scoring` and pass `ctx('2026-10-19')` (import `ctx` from `./testing`) instead of `new Map()`.

- [ ] **Step 3: Run** — `npx ng test --watch=false` → FAIL (`weekProgress` missing).

- [ ] **Step 4: Implement** — `scoring.ts`: import `addDays, daysBetween, eachDay, isoWeekStart` from `@shared/days`, `bySortOrder, isActiveOn, isDue` from `./visibility`; remove the `scoredHabitsOn` import; add:

```ts
/** A times-a-week habit in the Monday–Sunday week of \`day\` (§8.6): sessions so far, the target, and whether \`day\` must be one. */
export function weekProgress(h: Habit, day: Day, ctx: Ctx): { done: number; target: number; needed: boolean } {
  const target = h.timesPerWeek ?? 0;
  const start = isoWeekStart(day);
  const before = eachDay(start, addDays(day, -1)).filter((d) => isActiveOn(h, d) && habitDone(h, d, ctx)).length;
  const today = habitDone(h, day, ctx, day === ctx.today ? 'live' : 'final') ? 1 : 0;
  const daysLeft = daysBetween(day, addDays(start, 6)) + 1;
  const missing = target - before;
  return { done: before + today, target, needed: missing > 0 && missing >= daysLeft };
}

/** Habits that count in a day's score: daily ones, interval habits due that day, times-a-week habits done or needed that day (§8.1). */
export function scoredHabitsOn(habits: readonly Habit[], day: Day, ctx: Ctx): Habit[] {
  return habits
    .filter((h) => {
      if (!isActiveOn(h, day)) return false;
      if (h.frequency === 'daily') return true;
      if (h.frequency === 'interval') return isDue(h, day, ctx.history.checks.get(h.id));
      if (h.frequency === 'times_per_week') return habitDone(h, day, ctx, day === ctx.today ? 'live' : 'final') || weekProgress(h, day, ctx).needed;
      return false;
    })
    .sort(bySortOrder);
}
```

  `dayScore` uses `scoredHabitsOn(habits, day, ctx)`. Delete `scoredHabitsOn` from `visibility.ts`. `today.vm.ts`: import `scoredHabitsOn` from `../../domain/scoring` and call it with `ctx`.

- [ ] **Step 5: Run** → PASS. **Step 6: Commit** — `"Times-a-week habits: counted when trained or needed"`.

---

### Task B2: Today — Workout week and the popup

**Files:** Modify `today.vm.ts`, `workout-card.ts`, `today.page.ts`; Test `today.vm.spec.ts`, `today-cards.spec.ts`

**Produces:** `TodayVm.workoutWeek: { done: number; target: number; needed: boolean } | null`; `app-workout-card` input `week`.

- [ ] **Step 1: Failing tests** — `today.vm.spec.ts`:

```ts
  it('shows the Workout week, and lists Workout as left only when it is needed', () => {
    const gym = habit('gym', { name: 'Workout', source: 'workout', frequency: 'times_per_week', timesPerWeek: 4 });
    const at = (today: string, workouts: string[]) => buildTodayVm(input({ habits: [gym], ctx: ctx(today, history({ workouts })) }));
    expect(at('2026-10-21', ['2026-10-19']).workoutWeek).toEqual({ done: 1, target: 4, needed: false });
    expect(at('2026-10-21', ['2026-10-19']).checklist.left).toEqual([]);
    expect(at('2026-10-24', ['2026-10-19', '2026-10-21']).checklist.left.map((i) => i.detail)).toEqual(['2 / 4 this week · needed today']);
    expect(at('2026-10-24', ['2026-10-19', '2026-10-21', '2026-10-24']).checklist.done.map((i) => i.detail)).toEqual(['Trained · 3 / 4 this week']);
    expect(buildTodayVm(input({ habits: [] })).workoutWeek).toBeNull();
  });
```

  `today-cards.spec.ts`:

```ts
  it('WorkoutCard shows the week and highlights a needed day', async () => {
    const { fixture, el } = await render(WorkoutCard, { workouts: [], week: { done: 2, target: 4, needed: true } });
    expect(el.textContent).toContain('This week 2 / 4');
    expect(el.textContent).toContain('Needed today to reach 4');
    fixture.componentRef.setInput('week', { done: 1, target: 4, needed: false });
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Needed today');
  });
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — `today.vm.ts`: import `weekProgress`; add `workoutWeek` to `TodayVm`; in `buildTodayVm`:

```ts
  const gym = active.find((h) => h.source === 'workout' && h.frequency === 'times_per_week');
  const workoutWeek = gym ? weekProgress(gym, today, ctx) : null;
```

  return `workoutWeek,`. In `detailFor`, the `'workout'` case becomes:

```ts
    case 'workout': {
      if (habit.frequency !== 'times_per_week') return done ? 'Trained' : 'Not yet';
      const w = weekProgress(habit, ctx.today, ctx);
      return done ? \`Trained · \${w.done} / \${w.target} this week\` : \`\${w.done} / \${w.target} this week · needed today\`;
    }
```

  `workout-card.ts`: `readonly week = input<{ done: number; target: number; needed: boolean } | null>(null);` and under the label:

```html
      @if (week(); as wk) {
        <p class="mb-1 text-xs font-bold">This week {{ wk.done }} / {{ wk.target }}
          @if (wk.needed && workouts().length === 0) {
            <span class="ml-1 rounded-md bg-accent px-1.5 py-0.5 text-black">Needed today to reach {{ wk.target }}</span>
          }
        </p>
      }
```

  `today.page.ts`: `<app-workout-card ... [week]="v.workoutWeek" …>`.

- [ ] **Step 4: Run** → PASS. **Step 5: Look at it** (Bento + Matrix, needed and not needed). **Step 6: Commit** — `"Workout card shows the week and flags a needed day"`.

---

### Task B3: Habits grid

**Files:** Modify `month-matrix.ts`, `habit-grid.ts`; Test `month-matrix.spec.ts`

- [ ] **Step 1: Failing test** —

```ts
  it('keeps a times-a-week habit on the wheel with this week\\'s count', () => {
    const gym = habit('gym', { source: 'workout', frequency: 'times_per_week', timesPerWeek: 4 });
    const m = buildMonthMatrix([gym], '2026-10-01', ctx('2026-10-22', history({ workouts: ['2026-10-14', '2026-10-19', '2026-10-21'] })), new Set());
    expect(m.rows[0]).toMatchObject({ doneCount: 3, weekLabel: '2 / 4 this week' });
    const past = buildMonthMatrix([gym], '2026-09-01', ctx('2026-10-22', history({ workouts: ['2026-09-10'] })), new Set());
    expect(past.rows[0].weekLabel).toBe('1 sessions');
  });
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — `MatrixRow` gains `weekLabel: string | null`; rows filter adds `|| h.frequency === 'times_per_week'`; per-week rows use `counts = (d) => done[i] || weekProgress(habit, d, ctx).needed` (index-aware), `doneCount` = done past days, `bestStreak` 0, and `weekLabel` = month contains `ctx.today` ? `` `${p.done} / ${p.target} this week` `` (p = `weekProgress(habit, ctx.today, ctx)`) : `` `${doneCount} sessions` ``; other rows `weekLabel: null`. `habit-grid.ts`: when `row.weekLabel` show `<b>{{ row.weekLabel }}</b>` instead of the done/elapsed text.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `"Habits grid: times-a-week count for Workout"`.

---

### Task B4: Migration, end-to-end, ship

**Files:** Create `supabase/migrations/20261021000000_times_per_week.sql`, `e2e/workout-week.spec.ts`

- [ ] **Step 1: Migration**

```sql
-- Amendment B: times-a-week habits; Workout becomes 4 a week (spec §8.6).
alter table public.habits drop constraint habits_frequency_check;
alter table public.habits add constraint habits_frequency_check check (frequency in ('daily', 'weekly', 'interval', 'times_per_week'));
alter table public.habits add column times_per_week smallint check (times_per_week between 1 and 7);
alter table public.habits add constraint habits_times_per_week_fields check ((frequency = 'times_per_week') = (times_per_week is not null));
update public.habits set frequency = 'times_per_week', times_per_week = 4 where source = 'workout' and frequency = 'daily';
```

  plus `create or replace function public.ensure_setup()` identical to `20261020000000_interval_habits.sql`'s except the column list gains `times_per_week` (null on every row) and the Workout row is `('Workout', '💪', '#A3F53B', 'times_per_week', 'workout', 'anytime', null, 4, null, null, 4)`.

- [ ] **Step 2: End-to-end** — `e2e/workout-week.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { addDays, weekdayOf } from '../supabase/functions/_shared/days';
import { login, pinClock, resetTestUser, today } from './helpers';

test.beforeEach(resetTestUser);

test('Workout is not needed on a Monday, and a session counts toward the week', async ({ page }) => {
  const monday = addDays(today(), (8 - weekdayOf(today())) % 7);
  await pinClock(page, monday, '20:00');
  await login(page);
  const card = page.getByLabel('Workout');
  await expect(card).toContainText('This week 0 / 4');
  await expect(card).not.toContainText('Needed today');
  await page.getByLabel("Today's score").getByRole('button').click();
  const sheet = page.getByRole('dialog', { name: "What's left today" });
  await expect(sheet.getByText('Workout')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await card.getByRole('button', { name: 'Trained today ✓' }).click();
  await expect(card).toContainText('This week 1 / 4');
});
```

- [ ] **Step 3: Apply** — `npx supabase db push --yes` → applies the migration; `node scripts/live/setup-check.mjs` → passed.
- [ ] **Step 4: Verify** — `npx ng test --watch=false`, `npm run test:functions`, `npx ng build --base-href /countdown-tracker/`, `npm run test:live` → all pass (32 Playwright).
- [ ] **Step 5: Ship** — commit `"Workout 4 a week: migration and end-to-end"`, push, watch Deploy.
