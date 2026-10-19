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
