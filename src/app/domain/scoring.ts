import { addDays, daysBetween, eachDay, isoWeekStart } from '@shared/days';
import { inWindow } from '@shared/windows';
import { bySortOrder, isActiveOn, isDue } from './visibility';
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

/** A times-a-week habit in the Monday–Sunday week of `day` (§8.6): sessions so far, the target, and whether `day` must be one. */
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

export interface DayScore {
  done: number;
  total: number;
  score: number;
}

export function dayScore(habits: readonly Habit[], day: Day, ctx: Ctx): DayScore {
  const daily = scoredHabitsOn(habits, day, ctx);
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
