/** An eating window in IST clock time, 'HH:MM' 24-hour; `end` is exclusive. */
export interface EatingWindow {
  start: string;
  end: string;
}

export const DEFAULT_WINDOWS: readonly EatingWindow[] = [
  { start: '00:00', end: '01:00' },
  { start: '11:00', end: '13:00' },
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MIN = 1440;

export function toMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

export function formatClock(minutes: number): string {
  const m = ((minutes % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function sortWindows(windows: readonly EatingWindow[]): EatingWindow[] {
  return [...windows].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

export function windowAt(minute: number, windows: readonly EatingWindow[]): EatingWindow | null {
  return windows.find((w) => minute >= toMinutes(w.start) && minute < toMinutes(w.end)) ?? null;
}

export function inWindow(minute: number, windows: readonly EatingWindow[]): boolean {
  return windowAt(minute, windows) !== null;
}

/** Minutes from today's midnight to the next window start; ≥ 1440 means tomorrow. */
export function nextStartAfter(minute: number, windows: readonly EatingWindow[]): number {
  const sorted = sortWindows(windows);
  const next = sorted.find((w) => toMinutes(w.start) > minute);
  return next ? toMinutes(next.start) : toMinutes(sorted[0].start) + DAY_MIN;
}

export type FastState =
  | { kind: 'open'; window: EatingWindow; minutesLeft: number; fraction: number }
  | { kind: 'fasting'; nextStart: number; minutesUntilNext: number; fastMinutes: number; doneMinutes: number; fraction: number };

export function fastState(minute: number, windows: readonly EatingWindow[]): FastState | null {
  if (windows.length === 0) return null;
  const open = windowAt(minute, windows);
  if (open) {
    const start = toMinutes(open.start);
    const end = toMinutes(open.end);
    return { kind: 'open', window: open, minutesLeft: end - minute, fraction: (minute - start) / (end - start) };
  }
  const sorted = sortWindows(windows);
  const nextAbs = nextStartAfter(minute, sorted);
  const prev = [...sorted].reverse().find((w) => toMinutes(w.end) <= minute);
  const prevAbs = prev ? toMinutes(prev.end) : toMinutes(sorted[sorted.length - 1].end) - DAY_MIN;
  const fastMinutes = nextAbs - prevAbs;
  const doneMinutes = minute - prevAbs;
  return { kind: 'fasting', nextStart: nextAbs % DAY_MIN, minutesUntilNext: nextAbs - minute, fastMinutes, doneMinutes, fraction: doneMinutes / fastMinutes };
}

export function validateWindows(windows: readonly EatingWindow[]): string | null {
  if (windows.length < 1 || windows.length > 3) return 'Add 1 to 3 eating windows';
  if (windows.some((w) => !HHMM.test(w.start) || !HHMM.test(w.end))) return 'Use 24-hour times like 11:00';
  if (windows.some((w) => toMinutes(w.start) >= toMinutes(w.end))) return 'A window must end after it starts, on the same day';
  const sorted = sortWindows(windows);
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) return "Windows can't overlap";
  }
  return null;
}
