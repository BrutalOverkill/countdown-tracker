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
