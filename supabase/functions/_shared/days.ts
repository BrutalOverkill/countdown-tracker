/**
 * Day helpers shared by the web app (`@shared/days`) and the Edge Functions.
 * A Day is a 'YYYY-MM-DD' string. Calendar days are IST (UTC+5:30, no daylight saving);
 * the app's day starts at 4:00 AM IST so late nights count as the previous day.
 */
export type Day = string;

export const DAY_START_HOUR = 4;

const IST_OFFSET_MS = 330 * 60_000;
const DAY_START_MS = DAY_START_HOUR * 3_600_000;
const DAY_MS = 86_400_000;

function toUtc(day: Day): number {
  return Date.parse(day + 'T00:00:00Z');
}

function fromUtc(ms: number): Day {
  return new Date(ms).toISOString().slice(0, 10);
}

export function istDayOf(instant: Date): Day {
  return fromUtc(instant.getTime() + IST_OFFSET_MS);
}

export function appDayOf(instant: Date): Day {
  return fromUtc(instant.getTime() + IST_OFFSET_MS - DAY_START_MS);
}

export function appToday(now: Date = new Date()): Day {
  return appDayOf(now);
}

export function istMinutesOf(instant: Date): number {
  return Math.floor(((instant.getTime() + IST_OFFSET_MS) % DAY_MS) / 60_000);
}

export function instantFor(appDay: Day, hhmm: string): Date {
  const calendarDay = Number(hhmm.slice(0, 2)) < DAY_START_HOUR ? addDays(appDay, 1) : appDay;
  return new Date(Date.parse(`${calendarDay}T${hhmm}:00+05:30`));
}

export function isValidDay(value: unknown): value is Day {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = toUtc(value);
  return !Number.isNaN(t) && fromUtc(t) === value;
}

export function addDays(day: Day, n: number): Day {
  return fromUtc(toUtc(day) + n * DAY_MS);
}

export function daysBetween(from: Day, to: Day): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function eachDay(from: Day, to: Day): Day[] {
  const out: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function weekdayOf(day: Day): number {
  return new Date(toUtc(day)).getUTCDay();
}

export function isoWeekStart(day: Day): Day {
  const wd = weekdayOf(day);
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

export function monthStart(day: Day): Day {
  return day.slice(0, 8) + '01';
}

export function addMonths(day: Day, n: number): Day {
  const d = new Date(toUtc(monthStart(day)));
  d.setUTCMonth(d.getUTCMonth() + n);
  return fromUtc(d.getTime());
}

export function monthEnd(day: Day): Day {
  return addDays(addMonths(day, 1), -1);
}

/** Planner week block: days 1–7 → 1, 8–14 → 2, 15–21 → 3, 22–28 → 4, 29–end → 5. */
export function weekBlock(day: Day): number {
  return Math.min(5, Math.ceil(Number(day.slice(8, 10)) / 7));
}

export function weekBlockRange(day: Day): { start: Day; end: Day } {
  const block = weekBlock(day);
  const start = addDays(monthStart(day), (block - 1) * 7);
  return { start, end: block === 5 ? monthEnd(day) : addDays(start, 6) };
}
