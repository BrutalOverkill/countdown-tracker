import { formatClock, inWindow, nextStartAfter, type EatingWindow } from '../_shared/windows.ts';

export interface GuardInput {
  kcal: number;
  goal: number;
  fastingEnabled: boolean;
  windows: readonly EatingWindow[];
  /** IST clock minute, 0–1439. */
  minute: number;
}

export interface GuardResult {
  kcal: number;
  goal: number;
  reached: boolean;
  fasting: boolean;
  nextWindow: string | null;
  blocked: boolean;
  /** Only present when blocked: the Shortcut bounces you whenever it has any value. */
  message?: string;
}

export function guardResult(i: GuardInput): GuardResult {
  const reached = i.kcal >= i.goal;
  const useWindows = i.fastingEnabled && i.windows.length > 0;
  const fasting = useWindows && !inWindow(i.minute, i.windows);
  const nextWindow = useWindows ? formatClock(nextStartAfter(i.minute, i.windows)) : null;
  const message = reached
    ? `🛑 ${i.kcal.toLocaleString('en-IN')} kcal today — target hit. Kitchen's closed.`
    : fasting ? `🌙 Fasting — next window opens at ${nextWindow}.` : '';
  const blocked = reached || fasting;
  return { kcal: i.kcal, goal: i.goal, reached, fasting, nextWindow, blocked, ...(blocked ? { message } : {}) };
}
