import { addDays, daysBetween, weekBlockRange } from '@shared/days';
import { nextDueOn } from '@shared/interval';
import { fastState, formatClock, toMinutes } from '@shared/windows';
import { challengeProgress, type ChallengeProgress } from '../../domain/challenges';
import { formatNumber } from '../../core/format';
import { dayScore, habitDone, isPerfect, scoredHabitsOn, weekProgress, type DayScore } from '../../domain/scoring';
import { overallStreak, type StreakInfo } from '../../domain/streaks';
import { bySortOrder, isActiveOn } from '../../domain/visibility';
import type { Challenge, Countdown, Ctx, Day, Habit, Slot, Workout } from '../../domain/types';

export interface CountdownTile { id: string; title: string; emoji: string; days: number; isToday: boolean }
export interface ChallengeRowVm { id: string; habitName: string; progress: ChallengeProgress }
export interface ChallengeGroupVm { countdownId: string; title: string; emoji: string; rows: ChallengeRowVm[]; footer: string }
export interface RoutineVm { habit: Habit; done: boolean }
export interface RoutineGroupVm { slot: Slot; label: string; items: RoutineVm[] }
export interface WeeklyVm { habit: Habit; doneDay: Day | null }
export interface DueVm { habit: Habit; since: Day; overdueDays: number }
export interface IntervalLineVm { habit: Habit; next: Day; doneToday: boolean }
export type FastingVm =
  | { kind: 'open'; closesAt: string; minutesLeft: number; fraction: number }
  | { kind: 'fasting'; nextAt: string; minutesUntilNext: number; doneMinutes: number; fraction: number };

/** One line of the score popup: what counts today, how far along it is, and what can be done from there. */
export interface ChecklistItem { habit: Habit; detail: string; action: 'tick' | 'train' | null }
export interface ChecklistVm { left: ChecklistItem[]; done: ChecklistItem[] }

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
  due: DueVm[];
  intervals: IntervalLineVm[];
  checklist: ChecklistVm;
  workoutWeek: { done: number; target: number; needed: boolean; reachable: boolean } | null;
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

  const gym = active.find((h) => h.source === 'workout' && h.frequency === 'times_per_week');
  const workoutWeek = gym ? weekProgress(gym, today, ctx) : null;

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
    due,
    intervals,
    checklist: checklistFor(i.habits, ctx),
    workoutWeek,
    workouts: ctx.history.workouts.get(today) ?? [],
    challengeGroups,
    lastSyncAt: i.lastSyncAt,
    syncStale: i.lastSyncAt === null || i.now.getTime() - Date.parse(i.lastSyncAt) > 24 * 3_600_000,
  };
}

/** Everything that counts in today's score, split into left and done, in sort order (same rules as the score). */
function checklistFor(habits: readonly Habit[], ctx: Ctx): ChecklistVm {
  const items = scoredHabitsOn(habits, ctx.today, ctx).map((habit) => {
    const done = habitDone(habit, ctx.today, ctx, 'live');
    const action: ChecklistItem['action'] = habit.source === 'manual' ? 'tick' : habit.source === 'workout' ? 'train' : null;
    return { done, item: { habit, detail: detailFor(habit, done, ctx), action } };
  });
  return { left: items.filter((x) => !x.done).map((x) => x.item), done: items.filter((x) => x.done).map((x) => x.item) };
}

function detailFor(habit: Habit, done: boolean, ctx: Ctx): string {
  const food = ctx.history.food.get(ctx.today);
  const logged = !!food && food.entries > 0;
  switch (habit.source) {
    case 'steps':
      return `${formatNumber(ctx.history.steps.get(ctx.today) ?? 0)} / ${formatNumber(ctx.goals.stepGoal)}`;
    case 'calories':
      if (!logged) return 'Log food to count it';
      return done ? `${formatNumber(food.kcal)} / ${formatNumber(ctx.goals.kcalGoal)} kcal` : `${formatNumber(food.kcal - ctx.goals.kcalGoal)} kcal over`;
    case 'fasting':
      if (!logged) return 'Log food to count it';
      return done ? 'All inside your windows' : 'Ate outside a window';
    case 'workout': {
      if (habit.frequency !== 'times_per_week') return done ? 'Trained' : 'Not yet';
      const w = weekProgress(habit, ctx.today, ctx);
      return done ? `Trained · ${w.done} / ${w.target} this week` : `${w.done} / ${w.target} this week · needed today`;
    }
    case 'manual': {
      if (done || habit.intervalDays === null || habit.intervalStart === null) return '';
      const late = daysBetween(nextDueOn(ctx.today, habit.intervalStart, habit.intervalDays, ctx.history.checks.get(habit.id) ?? []), ctx.today);
      return late > 0 ? `overdue ${late} day${late === 1 ? '' : 's'}` : 'due today';
    }
  }
}
