import { inWindow } from '@shared/windows';
import { scoredHabitsOn } from './visibility';
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
  const daily = scoredHabitsOn(habits, day, ctx.history.checks);
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
