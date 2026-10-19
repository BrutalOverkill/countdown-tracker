import { addDays, daysBetween, eachDay } from '@shared/days';
import { habitDone } from './scoring';
import type { Challenge, Countdown, Ctx, Day, Habit } from './types';

export type ChallengeStatus = 'won' | 'out_of_reach' | 'on_track' | 'behind';

export interface ChallengeProgress {
  done: number;
  target: number;
  window: number;
  elapsed: number;
  left: number;
  status: ChallengeStatus;
  pace: number;
  needed: number;
  endDay: Day;
  finished: boolean;
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

export function challengeProgress(c: Challenge, habit: Habit, countdown: Countdown, ctx: Ctx): ChallengeProgress {
  const endDay = addDays(countdown.targetDate, -1);
  const window = Math.max(0, daysBetween(c.startDay, endDay) + 1);
  const lastCounted = ctx.today < endDay ? ctx.today : endDay;
  const done = eachDay(c.startDay, lastCounted).filter((d) => habitDone(habit, d, ctx, d === ctx.today ? 'live' : 'final')).length;
  const elapsed = clamp(daysBetween(c.startDay, ctx.today), window);
  const left = clamp(daysBetween(ctx.today, endDay) + 1, window);
  const target = c.targetDays;
  const status: ChallengeStatus =
    done >= target ? 'won'
    : done + left < target ? 'out_of_reach'
    : done >= (target * elapsed) / window ? 'on_track'
    : 'behind';
  return {
    done, target, window, elapsed, left, status,
    pace: window === 0 ? 1 : elapsed / window,
    needed: Math.max(0, target - done),
    endDay,
    finished: ctx.today > endDay,
  };
}

export function defaultTarget(daysLeft: number): number {
  return Math.max(1, Math.ceil(0.75 * daysLeft));
}
