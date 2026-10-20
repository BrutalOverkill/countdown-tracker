import { eachDay, monthEnd, monthStart, weekBlock } from '@shared/days';
import { dayScore, habitDone, isPerfect, weekProgress } from '../../domain/scoring';
import { bestRun } from '../../domain/streaks';
import { habitsForMonth, isActiveOn, isDue } from '../../domain/visibility';
import type { Ctx, Day, Habit } from '../../domain/types';

export interface MatrixRow { habit: Habit; done: boolean[]; doneCount: number; elapsed: number; bestStreak: number; weekLabel: string | null }
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
    .filter((h) => h.frequency === 'daily' || h.frequency === 'interval' || h.frequency === 'times_per_week')
    .map((habit) => {
      // Interval habits are judged on their due days only (§8.5).
      const checks = ctx.history.checks.get(habit.id);
      // The wheel shows final results, so today's calories/fasting stay empty until the day is over.
      const done = days.map((d) => isActiveOn(habit, d) && habitDone(habit, d, ctx, 'final'));
      const counts = (d: Day, i: number) =>
        habit.frequency === 'interval' ? isDue(habit, d, checks)
        : habit.frequency === 'times_per_week' ? done[i] || weekProgress(habit, d, ctx).needed
        : isActiveOn(habit, d);
      const doneCount = days.filter((d, i) => done[i] && past(d) && counts(d, i)).length;
      // Times-a-week habits read as a weekly count: this week's for the current month, a session total for past months.
      const week = habit.frequency === 'times_per_week' ? weekProgress(habit, ctx.today, ctx) : null;
      return {
        habit,
        done,
        doneCount,
        elapsed: days.filter((d, i) => past(d) && counts(d, i)).length,
        bestStreak: habit.frequency === 'daily' ? bestRun(done.filter((_, i) => past(days[i]))) : 0,
        weekLabel: week === null ? null : days.includes(ctx.today) ? `${week.done} / ${week.target} this week` : `${doneCount} sessions`,
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
