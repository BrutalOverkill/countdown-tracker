# Interval Habits (Amendment A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Every N days" habits — Dermarolling due 4 days after the last session, highlighted on Today when due or overdue, scored while due.

**Architecture:** One pure rule (`nextDueOn` / `isDueOn`) in `supabase/functions/_shared/interval.ts`, used by the app (via `@shared/interval`) and the sync function. Habits gain `interval_days` + `interval_start`; everything else (score, Today, wheel/grid, report, Settings, nudge) asks the rule. No stored "next due" state — it's derived from ticks.

**Tech Stack:** as the main plan (Angular 22, Supabase, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-10-19-countdown-tracker-design.md` — Amendment A: §4.1 due card, §4.2, §4.4, §6, §7 step 5, §8.1, §8.3, §8.5.

## Global Constraints

- Interval N is an integer 2–30; default 4. `interval_days` and `interval_start` are both set exactly when `frequency = 'interval'`.
- Next due on D = latest tick strictly before D (on/after `interval_start`) + N, else `interval_start`. Due on D = D ≥ next due. Due days count in the score until ticked (§8.5).
- Challenges stay daily-habits only.
- Shared files imported by Angular must not import siblings with a `.ts` extension (Angular's TS config rejects it; Deno needs it) — keep `interval.ts` import-free.
- Dev server / Playwright on port 4300. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Overdue spanning a month boundary** — due 30 Oct, still undone on 2 Nov → November's grid and Today both treat it as overdue (rule reads all ticks, not one month).
2. **Early tick from the grid** — ticking on a non-due day restarts the cycle but doesn't add to that day's score total.
3. **Switching a habit's frequency** — daily → every N days sets `interval_start` to today (no instant "overdue since creation"); interval → daily clears both fields.
4. **Untick on the due day** — the card comes back as due today, not "overdue".
5. **Server nudge window** — the sync function must read ticks far enough back (≥ 30 days) to judge "due today".

---

### Task A1: The shared rule

**Files:**
- Create: `supabase/functions/_shared/interval.ts`, `supabase/functions/_shared/interval.test.ts`

**Interfaces:**
- Produces: `nextDueOn(day: string, start: string, everyDays: number, ticks: Iterable<string>): string`, `isDueOn(...same): boolean`

- [ ] **Step 1: Write the failing test** — `supabase/functions/_shared/interval.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isDueOn, nextDueOn } from './interval.ts';

const start = '2026-10-20';

describe('interval habits', () => {
  it('is first due on its start day', () => {
    expect(nextDueOn('2026-10-20', start, 4, [])).toBe('2026-10-20');
    expect(isDueOn('2026-10-19', start, 4, [])).toBe(false);
    expect(isDueOn('2026-10-20', start, 4, [])).toBe(true);
  });

  it('is next due N days after the last tick and stays due until ticked', () => {
    const ticks = ['2026-10-20'];
    expect(nextDueOn('2026-10-21', start, 4, ticks)).toBe('2026-10-24');
    expect(isDueOn('2026-10-23', start, 4, ticks)).toBe(false);
    expect(isDueOn('2026-10-24', start, 4, ticks)).toBe(true);
    expect(isDueOn('2026-11-02', start, 4, ticks)).toBe(true);
  });

  it('counts from the day it was actually done, across months', () => {
    expect(nextDueOn('2026-10-27', start, 4, ['2026-10-20', '2026-10-26'])).toBe('2026-10-30');
    expect(nextDueOn('2026-11-01', start, 4, ['2026-10-30'])).toBe('2026-11-03');
  });

  it("keeps a day due when it's ticked that same day", () => {
    expect(isDueOn('2026-10-24', start, 4, ['2026-10-20', '2026-10-24'])).toBe(true);
  });

  it('ignores ticks before the start', () => {
    expect(nextDueOn('2026-10-21', start, 4, ['2026-10-18'])).toBe('2026-10-20');
  });
});
```

- [ ] **Step 2: Run it** — `npm run test:functions` → Expected: FAIL, cannot find `./interval.ts`.

- [ ] **Step 3: Implement** — `supabase/functions/_shared/interval.ts`:

```ts
// "Every N days" habits (spec §8.5). Import-free: the app and the Edge Functions both load this file.

const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The day the habit is next due, judged on `day`: the latest tick before `day` (on/after `start`) plus N, else `start`. */
export function nextDueOn(day: string, start: string, everyDays: number, ticks: Iterable<string>): string {
  let last: string | null = null;
  for (const t of ticks) if (t >= start && t < day && (last === null || t > last)) last = t;
  return last === null ? start : plusDays(last, everyDays);
}

export function isDueOn(day: string, start: string, everyDays: number, ticks: Iterable<string>): boolean {
  return day >= nextDueOn(day, start, everyDays, ticks);
}
```

- [ ] **Step 4: Run it** — `npm run test:functions` → Expected: PASS (44 tests).
- [ ] **Step 5: Commit** — `git add supabase/functions/_shared/interval*.ts && git commit -m "Add the every-N-days rule shared by app and functions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task A2: Habit model and score

**Files:**
- Modify: `src/app/domain/types.ts`, `src/app/domain/testing.ts`, `src/app/data/rows.ts`, `src/app/domain/visibility.ts`, `src/app/domain/scoring.ts`
- Test: `src/app/domain/scoring.spec.ts`

**Interfaces:**
- Produces: `Frequency = 'daily' | 'weekly' | 'interval'`; `Habit.intervalDays: number | null`, `Habit.intervalStart: Day | null`; `isDue(h, day, checks?: ReadonlySet<Day>): boolean`; `scoredHabitsOn(habits, day, checks: ReadonlyMap<string, ReadonlySet<Day>>): Habit[]`

- [ ] **Step 1: Model fields first (no behaviour)**
  - `types.ts`: `export type Frequency = 'daily' | 'weekly' | 'interval';` and add to `Habit` after `weekday`: `intervalDays: number | null;` `intervalStart: Day | null;`
  - `testing.ts` `habit()`: add `intervalDays: null, intervalStart: null,` before `...extra`.
  - `rows.ts` `HabitRow`: add `interval_days: number | null;` `interval_start: string | null;`; `toHabit`: add `intervalDays: r.interval_days, intervalStart: r.interval_start,` after `weekday`.

- [ ] **Step 2: Write the failing test** — append to `scoring.spec.ts`'s `describe`:

```ts
  it('counts an every-4-days habit only while it is due, until it is ticked', () => {
    const daily = habit('a');
    const derma = habit('d', { frequency: 'interval', intervalDays: 4, intervalStart: '2026-10-20' });
    const c = ctx('2026-10-30', history({ checks: { a: ['2026-10-20', '2026-10-22', '2026-10-25'], d: ['2026-10-20'] } }));
    expect(dayScore([daily, derma], '2026-10-20', c)).toMatchObject({ done: 2, total: 2 });
    expect(dayScore([daily, derma], '2026-10-22', c)).toMatchObject({ done: 1, total: 1 });
    expect(dayScore([daily, derma], '2026-10-25', c)).toMatchObject({ done: 1, total: 2 });
  });
```

- [ ] **Step 3: Run it** — `npx ng test --watch=false` → Expected: FAIL (`total` 1 on 20 Oct — interval habits aren't scored yet).

- [ ] **Step 4: Implement** — `visibility.ts`: add `import { isDueOn } from '@shared/interval';` and

```ts
/** An "every N days" habit that is due on `day` (spec §8.5). */
export function isDue(h: Habit, day: Day, checks: ReadonlySet<Day> = new Set()): boolean {
  return h.frequency === 'interval' && h.intervalDays !== null && h.intervalStart !== null && isActiveOn(h, day)
    && isDueOn(day, h.intervalStart, h.intervalDays, checks);
}

/** Habits that count in a day's score: active daily habits plus interval habits due that day (§8.1). */
export function scoredHabitsOn(habits: readonly Habit[], day: Day, checks: ReadonlyMap<string, ReadonlySet<Day>>): Habit[] {
  return habits.filter((h) => (h.frequency === 'daily' && isActiveOn(h, day)) || isDue(h, day, checks.get(h.id))).sort(bySortOrder);
}
```

  Delete `dailyHabitsOn` (its only caller is `dayScore`). `scoring.ts`: import `scoredHabitsOn` instead and use `const daily = scoredHabitsOn(habits, day, ctx.history.checks);`.

- [ ] **Step 5: Run it** — `npx ng test --watch=false` → Expected: PASS, all suites.
- [ ] **Step 6: Commit** — `git add src/app && git commit -m "Score every-N-days habits on the days they're due" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task A3: Today — due card and "next" line

**Files:**
- Create: `src/app/features/today/due-card.ts`
- Modify: `src/app/features/today/today.vm.ts`, `src/app/features/today/routines-card.ts`, `src/app/features/today/today.page.ts`, `src/styles.css`
- Test: `src/app/features/today/today.vm.spec.ts`, `src/app/features/today/today-cards.spec.ts`

**Interfaces:**
- Produces: `DueVm { habit: Habit; since: Day; overdueDays: number }`, `IntervalLineVm { habit: Habit; next: Day; doneToday: boolean }`, `TodayVm.due`, `TodayVm.intervals`; `app-due-card` (`due: DueVm`, `disabled`, output `done: string`); `app-routines-card` input `intervals: IntervalLineVm[]`.

- [ ] **Step 1: Write the failing tests**

  In `today.vm.spec.ts` (uses the file's `input(over)` helper):

```ts
  it('puts a due or overdue interval habit on the due list, and the rest on "next" lines', () => {
    const derma = habit('d', { name: 'Dermarolling', frequency: 'interval', intervalDays: 4, intervalStart: '2026-10-20' });
    const at = (today: string, ticks: string[]) => buildTodayVm(input({ habits: [derma], ctx: ctx(today, history({ checks: { d: ticks } })) }));
    expect(at('2026-10-20', []).due).toEqual([{ habit: derma, since: '2026-10-20', overdueDays: 0 }]);
    expect(at('2026-10-20', ['2026-10-20']).intervals).toEqual([{ habit: derma, next: '2026-10-24', doneToday: true }]);
    expect(at('2026-10-22', ['2026-10-20']).intervals).toEqual([{ habit: derma, next: '2026-10-24', doneToday: false }]);
    expect(at('2026-10-26', ['2026-10-20']).due).toEqual([{ habit: derma, since: '2026-10-24', overdueDays: 2 }]);
    expect(at('2026-10-26', ['2026-10-20']).score.total).toBe(1);
  });
```

  In `today-cards.spec.ts`:

```ts
  it('DueCard says due today, or overdue since the due day, and emits on Done', async () => {
    const derma = habit('d', { name: 'Dermarolling', emoji: '🪡' });
    const { fixture, el } = await render(DueCard, { due: { habit: derma, since: '2026-10-24', overdueDays: 2 } });
    expect(el.textContent).toContain('🪡 Dermarolling');
    expect(el.textContent).toContain('overdue since Sat 24 Oct (2 days)');
    const emitted: string[] = [];
    fixture.componentInstance.done.subscribe((id: string) => emitted.push(id));
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(emitted).toEqual(['d']);
    fixture.componentRef.setInput('due', { habit: derma, since: '2026-10-20', overdueDays: 0 });
    await fixture.whenStable();
    expect(el.textContent).toContain('due today');
  });

  it('RoutinesCard shows when an interval habit is next due', async () => {
    const derma = habit('d', { name: 'Dermarolling', emoji: '🪡' });
    const { el } = await render(RoutinesCard, {
      groups: [], weekly: [], intervals: [{ habit: derma, next: '2026-10-24', doneToday: true }], today: '2026-10-20', done: 0, total: 0, disabled: false,
    });
    expect(el.textContent).toContain('✓ 🪡 Dermarolling done · next Sat 24 Oct');
  });
```

  (Import `DueCard` from `./due-card`; add `intervals: []` to the existing RoutinesCard test's inputs.)

- [ ] **Step 2: Run them** — `npx ng test --watch=false` → Expected: FAIL (`due-card` missing; `due`/`intervals` undefined).

- [ ] **Step 3: Implement**

  `today.vm.ts` — add imports `addDays, daysBetween` (from `@shared/days` if not already) and `nextDueOn` from `@shared/interval`; add the two interfaces and `due: DueVm[]; intervals: IntervalLineVm[];` to `TodayVm`; in `buildTodayVm` after `weekly`:

```ts
  const due: DueVm[] = [];
  const intervals: IntervalLineVm[] = [];
  for (const habit of active) {
    if (habit.frequency !== 'interval' || habit.source !== 'manual' || habit.intervalDays === null || habit.intervalStart === null) continue;
    const checks = ctx.history.checks.get(habit.id) ?? new Set<Day>();
    const next = nextDueOn(today, habit.intervalStart, habit.intervalDays, checks);
    if (checks.has(today)) intervals.push({ habit, next: addDays(today, habit.intervalDays), doneToday: true });
    else if (today >= next) due.push({ habit, since: next, overdueDays: daysBetween(next, today) });
    else intervals.push({ habit, next, doneToday: false });
  }
```

  and return `due, intervals,`.

  `due-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { dayLabel } from '../../core/format';
import type { DueVm } from './today.vm';

@Component({
  selector: 'app-due-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let d = due();
    <section class="tile due-card flex items-center justify-between gap-3" [attr.data-tone]="d.overdueDays > 0 ? 'orange' : 'violet'"
      [class.is-overdue]="d.overdueDays > 0" [attr.aria-label]="d.habit.name + ' is due'">
      <div class="min-w-0">
        <p class="label">{{ d.overdueDays > 0 ? 'Overdue' : 'Due today' }}</p>
        <p class="mt-0.5 truncate text-lg font-extrabold">{{ d.habit.emoji }} {{ d.habit.name }}</p>
        <p class="text-sm">{{ d.overdueDays > 0 ? 'overdue since ' + label(d.since) + ' (' + d.overdueDays + (d.overdueDays === 1 ? ' day)' : ' days)') : 'due today' }}</p>
      </div>
      <button type="button" class="btn press shrink-0 !px-5 !py-3" [disabled]="disabled()" (click)="done.emit(d.habit.id)">Done ✓</button>
    </section>
  `,
})
export class DueCard {
  readonly due = input.required<DueVm>();
  readonly disabled = input(false);
  readonly done = output<string>();
  protected readonly label = dayLabel;
}
```

  `styles.css` (components layer, after the tile tone rules): Bento overdue reads red; Matrix gets the red border and dot label.

```css
  .tile.due-card.is-overdue { background: var(--color-kcal); }
  [data-theme='matrix'] .tile.due-card { border-color: var(--color-accent); }
  [data-theme='matrix'] .tile.due-card .label { color: var(--color-accent); }
  [data-theme='matrix'] .tile.due-card .label::before { content: '● '; }
```

  `routines-card.ts` — add `readonly intervals = input<IntervalLineVm[]>([]);`, `protected readonly label = dayLabel;` (import from `../../core/format`) and after the weekly loop:

```html
      @for (l of intervals(); track l.habit.id) {
        <div class="mt-1 flex items-center justify-between gap-2 border-t border-line pt-2 text-xs">
          <span>{{ l.doneToday ? '✓ ' : '' }}{{ l.habit.emoji }} {{ l.habit.name }}{{ l.doneToday ? ' done' : '' }} · next {{ label(l.next) }}</span>
          @if (l.doneToday) {
            <button type="button" class="btn-quiet press !py-1 text-xs" [disabled]="disabled()" (click)="toggle.emit(l.habit.id)">Undo</button>
          }
        </div>
      }
```

  `today.page.ts` — import `DueCard`; between `</header>` and the grid:

```html
    @for (d of v.due; track d.habit.id) {
      <app-due-card class="mb-2" [due]="d" [disabled]="!online()" (done)="store.toggleCheck($event, v.today)" />
    }
```

  and pass `[intervals]="v.intervals"` to `<app-routines-card>`.

- [ ] **Step 4: Run them** — `npx ng test --watch=false` → Expected: PASS.
- [ ] **Step 5: Look at it** — dev server on 4300; screenshot Today at 2 PM and 8 PM with a due Dermarolling (faked data) in both themes; no console errors.
- [ ] **Step 6: Commit** — `git add src && git commit -m "Highlight a due every-N-days habit on Today and show the next date" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task A4: Habits tab and report card

**Files:**
- Modify: `src/app/features/habits/month-matrix.ts`, `src/app/features/habits/habit-grid.ts`, `src/app/domain/report.ts`
- Test: `src/app/features/habits/month-matrix.spec.ts`, `src/app/domain/report.spec.ts`

- [ ] **Step 1: Write the failing tests**

  `month-matrix.spec.ts`:

```ts
  it('gives an every-N-days habit a row whose stats count due days', () => {
    const derma = habit('d', { frequency: 'interval', intervalDays: 4, intervalStart: '2026-10-20' });
    const m = buildMonthMatrix([derma], '2026-10-01', ctx('2026-10-31', history({ checks: { d: ['2026-10-20', '2026-10-26'] } })), new Set());
    expect(m.rows.map((r) => r.habit.id)).toEqual(['d']);
    expect(m.weekly).toEqual([]);
    // Due 20 (done), 24–26 (done 26), 30–31: 6 due days, 2 done.
    expect(m.rows[0]).toMatchObject({ doneCount: 2, elapsed: 6 });
  });
```

  `report.spec.ts`:

```ts
  it('scores an every-N-days habit by due days done', () => {
    const derma = habit('d', { frequency: 'interval', intervalDays: 4, intervalStart: '2026-10-20', source: 'manual' });
    const cd = { id: 'c', title: 'Diwali', emoji: '🪔', targetDate: '2026-10-28', createdDay: '2026-10-20' };
    const r = buildReport(cd, [derma], [], ctx('2026-10-28', history({ checks: { d: ['2026-10-20', '2026-10-26'] } })));
    // Period 20–27: due 20 (done), 24, 25, 26 (done) → 2 of 4.
    expect(r.habits).toEqual([{ id: 'd', name: 'd', color: '#FFFFFF', percent: 50 }]);
  });
```

- [ ] **Step 2: Run them** — Expected: FAIL (no interval row; no report entry).

- [ ] **Step 3: Implement**

  `month-matrix.ts` — import `isDue` from `../../domain/visibility`; rows filter `h.frequency === 'daily' || h.frequency === 'interval'`; inside the map:

```ts
      const checks = ctx.history.checks.get(habit.id);
      const counts = (d: Day) => (habit.frequency === 'interval' ? isDue(habit, d, checks) : isActiveOn(habit, d));
      const done = days.map((d) => isActiveOn(habit, d) && habitDone(habit, d, ctx, 'final'));
      return {
        habit,
        done,
        doneCount: days.filter((d, i) => done[i] && past(d) && counts(d)).length,
        elapsed: days.filter((d) => past(d) && counts(d)).length,
        bestStreak: habit.frequency === 'interval' ? 0 : bestRun(done.filter((_, i) => past(days[i]))),
      };
```

  `habit-grid.ts` line 48 — interval rows read "due days" instead of a streak:

```html
          <span><b>{{ row.doneCount }}/{{ row.elapsed }}</b> {{ row.habit.frequency === 'interval' ? 'due days done' : 'days · best streak ' + row.bestStreak }}</span>
```

  `report.ts` — import `isDue`; habits filter `(h.frequency === 'daily' || h.frequency === 'interval') && h.source === 'manual'`; inside the map replace `active` with `const counted = h.frequency === 'interval' ? active.filter((d) => isDue(h, d, ctx.history.checks.get(h.id))) : active;` and use `counted` for the empty check and both counts.

- [ ] **Step 4: Run them** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/app && git commit -m "Show every-N-days habits on the wheel, grid and report card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task A5: Settings, API, migration, server nudge

**Files:**
- Create: `supabase/migrations/20261020000000_interval_habits.sql`
- Modify: `src/app/features/settings/settings-forms.ts`, `src/app/features/settings/habits-section.ts`, `src/app/data/tracker-api.ts`, `src/app/features/settings/fasting-section.ts`, `supabase/functions/sync/logic.ts`, `supabase/functions/sync/index.ts`
- Test: `settings-forms.spec.ts`, `settings-sections.spec.ts`, `supabase/functions/sync/logic.test.ts`

- [ ] **Step 1: Write the failing tests**

  `settings-forms.spec.ts`:

```ts
  it('parses an every-N-days habit and bounds N to 2–30', () => {
    expect(parseHabit({ name: 'Dermarolling', emoji: '🪡', frequency: 'interval', slot: 'night', weekday: '', intervalDays: '4' }))
      .toMatchObject({ ok: true, value: { frequency: 'interval', intervalDays: 4, weekday: null } });
    expect(parseHabit({ name: 'X', emoji: '', frequency: 'interval', slot: 'night', weekday: '', intervalDays: '1' })).toEqual({ ok: false, error: 'Pick every 2–30 days' });
    expect(parseHabit({ name: 'X', emoji: '', frequency: 'daily', slot: 'night', weekday: '', intervalDays: '4' })).toMatchObject({ ok: true, value: { intervalDays: null } });
  });
```

  (Add `intervalDays: ''` to the existing `parseHabit` calls in that file.)

  `settings-sections.spec.ts` (next to the weekday test):

```ts
  it('HabitsSection shows the every-N-days field only for that frequency', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: fakeApi() }] });
    const fixture = TestBed.createComponent(HabitsSection);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const every = el.querySelector('[aria-label="New habit every N days"]') as HTMLInputElement;
    const freq = el.querySelector('[aria-label="New habit frequency"]') as HTMLSelectElement;
    expect(every.hidden).toBe(true);
    freq.value = 'interval';
    freq.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(every.hidden).toBe(false);
    expect(every.value).toBe('4');
  });
```

  `logic.test.ts` — in `describe('pendingFor')` (give the existing `daily()` helper's habits `intervalDays: null, intervalStart: null`):

```ts
  it('lists an every-N-days habit when it is due and not ticked today', () => {
    const derma = (checkedDays: string[]) => ({ name: 'Dermarolling', frequency: 'interval' as const, weekday: null, intervalDays: 4, intervalStart: '2026-10-20', sortOrder: 9, checkedDays });
    expect(pendingFor('2026-10-24', [derma(['2026-10-20'])])).toEqual(['Dermarolling']);
    expect(pendingFor('2026-10-23', [derma(['2026-10-20'])])).toEqual([]);
    expect(pendingFor('2026-10-24', [derma(['2026-10-20', '2026-10-24'])])).toEqual([]);
  });
```

- [ ] **Step 2: Run them** — `npx ng test --watch=false` and `npm run test:functions` → Expected: FAIL.

- [ ] **Step 3: Implement**

  `settings-forms.ts` — `HabitForm` gains `intervalDays: string`; `parseHabit` value type gains `intervalDays: number | null`:

```ts
  let intervalDays: number | null = null;
  if (f.frequency === 'interval') {
    intervalDays = Number(f.intervalDays);
    if (!Number.isInteger(intervalDays) || intervalDays < 2 || intervalDays > 30) return { ok: false, error: 'Pick every 2–30 days' };
  }
```

  and add `intervalDays` to the returned value.

  `tracker-api.ts` — `NewHabit` gains `intervalDays: number | null; intervalStart: Day | null;`; `addHabit` and `updateHabit` write `interval_days: h.intervalDays, interval_start: h.intervalStart`.

  `fasting-section.ts` — its `addHabit` call adds `intervalDays: null, intervalStart: null`.

  `habits-section.ts`:
  - both frequency selects gain `<option value="interval">Every N days</option>` (edit one with `[selected]="h.frequency === 'interval'"`);
  - new inputs after the slot select: add form `<input #nEvery class="field min-w-0 !w-20" type="number" min="2" max="30" value="4" aria-label="New habit every N days" [hidden]="newFreq() !== 'interval'" />`; edit form `<input #eEvery class="field min-w-0 !w-20" type="number" min="2" max="30" [value]="h.intervalDays ?? 4" aria-label="Every N days" [hidden]="editFreq() !== 'interval'" />`;
  - pass `nEvery.value` / `eEvery.value` as `intervalDays` into `parseHabit`;
  - `add()`: `intervalStart: parsed.value.frequency === 'interval' ? this.store.today() : null`;
  - `save()`: `intervalStart: v.frequency !== 'interval' ? null : h.frequency === 'interval' ? h.intervalStart : this.store.today()`;
  - `meta()`: interval → `` `Every ${h.intervalDays} days` ``.

  `supabase/migrations/20261020000000_interval_habits.sql`:

```sql
-- Amendment A: "every N days" habits (spec §8.5).
alter table public.habits drop constraint habits_frequency_check;
alter table public.habits add constraint habits_frequency_check check (frequency in ('daily', 'weekly', 'interval'));
alter table public.habits
  add column interval_days smallint check (interval_days between 2 and 30),
  add column interval_start date;
alter table public.habits add constraint habits_interval_fields check (
  (frequency = 'interval') = (interval_days is not null and interval_start is not null)
);

-- Dermarolling moves to every 4 days, first due on its app creation day or 20 Oct 2026, whichever is later.
update public.habits
   set frequency = 'interval', interval_days = 4, weekday = null,
       interval_start = greatest(((created_at at time zone 'Asia/Kolkata') - interval '4 hours')::date, date '2026-10-20')
 where name = 'Dermarolling' and source = 'manual' and frequency = 'weekly';

create or replace function public.ensure_setup() returns void
language plpgsql security invoker set search_path = '' as $$
declare
  today date := ((now() at time zone 'Asia/Kolkata') - interval '4 hours')::date;
begin
  insert into public.settings (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  if not found then
    return;
  end if;
  insert into public.habits (name, emoji, color, frequency, source, slot, weekday, sort_order, interval_days, interval_start) values
    ('10k steps', '👟', '#FF453A', 'daily', 'steps', 'anytime', null, 1, null, null),
    ('Calories on target', '🍽️', '#FF9F0A', 'daily', 'calories', 'anytime', null, 2, null, null),
    ('Fasting windows kept', '🌙', '#FFD60A', 'daily', 'fasting', 'anytime', null, 3, null, null),
    ('Workout', '💪', '#A3F53B', 'daily', 'workout', 'anytime', null, 4, null, null),
    ('AM skincare', '🧴', '#30D158', 'daily', 'manual', 'morning', null, 5, null, null),
    ('PM skincare', '🌙', '#00C7BE', 'daily', 'manual', 'night', null, 6, null, null),
    ('Minoxidil AM', '💧', '#32D7FA', 'daily', 'manual', 'morning', null, 7, null, null),
    ('Minoxidil PM', '💧', '#0A84FF', 'daily', 'manual', 'night', null, 8, null, null),
    ('Dermarolling', '🪡', '#BF5AF2', 'interval', 'manual', 'night', null, 9, 4, today);
  insert into public.countdowns (title, emoji, target_date) values
    ('Diwali', '🪔', '2026-11-08'),
    ('Engagement', '💍', '2026-12-10');
end $$;
```

  `sync/logic.ts` — `import { isDueOn } from '../_shared/interval.ts';`; `ManualHabit` gains `frequency: 'daily' | 'weekly' | 'interval'; intervalDays: number | null; intervalStart: Day | null;`; first line of the filter:

```ts
      if (h.frequency === 'interval') {
        return h.intervalDays !== null && h.intervalStart !== null && !h.checkedDays.includes(today) && isDueOn(today, h.intervalStart, h.intervalDays, h.checkedDays);
      }
```

  `sync/index.ts` — select `'id, name, frequency, weekday, interval_days, interval_start, sort_order, created_at'`; read ticks from `const since = [start, addDays(today, -30)].sort()[0];` (`.gte('day', since)`); map `intervalDays: h.interval_days, intervalStart: h.interval_start`.

- [ ] **Step 4: Run them** — both suites → Expected: PASS.
- [ ] **Step 5: Apply and deploy**
  - `npx supabase db push` → Expected: applies `20261020000000_interval_habits.sql`. (If it asks for the database password, Anvit runs it in his own PowerShell.)
  - `node scripts/live/setup-check.mjs` → Expected: `setup-check passed`.
  - `npx supabase functions deploy sync --no-verify-jwt --use-api` → Expected: deployed.
- [ ] **Step 6: Commit** — `git add supabase src && git commit -m "Every-N-days habits in Settings, the database and the sync nudge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task A6: End-to-end, docs, ship

**Files:**
- Create: `e2e/interval.spec.ts`
- Modify: `e2e/today.spec.ts`, `docs/test-plan.md`

- [ ] **Step 1: Write the end-to-end test** — `e2e/interval.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { addDays } from '../supabase/functions/_shared/days';
import { dayLabel } from '../src/app/core/format';
import { login, resetTestUser, today } from './helpers';

test.beforeEach(resetTestUser);

test('Dermarolling is highlighted on its due day, and Done moves it 4 days on', async ({ page }) => {
  await login(page);
  const card = page.getByRole('region', { name: 'Dermarolling is due' });
  await expect(card).toContainText('Due today');
  await card.getByRole('button', { name: 'Done ✓' }).click();
  await expect(card).toHaveCount(0);
  const routines = page.getByLabel('Routines');
  await expect(routines).toContainText(`Dermarolling done · next ${dayLabel(addDays(today(), 4))}`);
  await page.reload();
  await expect(routines).toContainText(`next ${dayLabel(addDays(today(), 4))}`);
});
```

- [ ] **Step 2: Update the score expectation** — `e2e/today.spec.ts`: a fresh test user has Dermarolling due today, so `'2 of 8 done'` becomes `'2 of 9 done'`.
- [ ] **Step 3: Checklist row** — `docs/test-plan.md`, after case 4: `| 4b | Dermarolling | On its due day open Today, tap Done ✓ | Highlighted card before; afterwards "✓ Dermarolling done · next <4 days later>" in Routines |`
- [ ] **Step 4: Full verification** — `npx ng test --watch=false`, `npm run test:functions`, `npx ng build --base-href /countdown-tracker/`, `npm run test:live` → Expected: all pass, Playwright 28 passed (14 × 2).
- [ ] **Step 5: Ship** — commit `e2e docs`, push, watch Deploy, run the "Live tests" workflow → Expected: both succeed.
