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
