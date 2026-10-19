// "Every N days" habits (spec §8.5). Import-free: the app and the Edge Functions both load this file.

const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The day the habit is next due, judged on `day`: the latest tick before `day` (on/after `start`) plus N, else `start`. */
export function nextDueOn(day: string, start: string, everyDays: number, ticks: Iterable<string>): string {
  let last: string | null = null;
  for (const t of ticks) if (t >= start && t < day && (last === null || t > last)) last = t;
  return last === null ? start : plusDays(last, everyDays);
}

export function isDueOn(day: string, start: string, everyDays: number, ticks: Iterable<string>): boolean {
  return day >= nextDueOn(day, start, everyDays, ticks);
}
