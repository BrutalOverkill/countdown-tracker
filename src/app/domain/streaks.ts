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
