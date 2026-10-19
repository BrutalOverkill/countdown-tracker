import { addDays, appDayOf, isValidDay, weekBlockRange, weekdayOf, type Day } from '../_shared/days.ts';

export interface StepIn { date: Day; count: number }
export interface WorkoutIn { start: string; durationMin: number | null; name: string | null }
export interface SyncPayload { steps: StepIn[]; workouts: WorkoutIn[] }
export type Validated = { ok: true; value: SyncPayload } | { ok: false; error: string };

function toNumber(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// Shortcuts sends a one-item list as a bare dictionary and an empty list as nothing at all.
function asList(v: unknown): unknown[] | null {
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return [v];
  return null;
}

const isBlank = (v: unknown) => v === undefined || v === null || v === '';

/** `latestDay` = IST calendar date 15 minutes from now (tolerates a phone clock slightly ahead at midnight). */
export function validatePayload(body: unknown, latestDay: Day): Validated {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'Body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const earliest = addDays(latestDay, -31);
  const recent = (d: Day) => d >= earliest && d <= latestDay;

  const stepsRaw = asList(b['steps']);
  if (!stepsRaw || stepsRaw.length > 31) return { ok: false, error: 'steps must be a list of at most 31 days' };
  const steps = new Map<Day, StepIn>();
  for (const [i, raw] of stepsRaw.entries()) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const date = item['date'];
    if (!isValidDay(date) || !recent(date)) return { ok: false, error: `steps[${i}].date must be a recent date (yyyy-MM-dd)` };
    const count = toNumber(item['count']);
    if (count === null || count < 0 || count > 100_000) return { ok: false, error: `steps[${i}].count must be a number from 0 to 100000` };
    steps.set(date, { date, count: Math.round(count) });
  }

  const workoutsRaw = asList(b['workouts']);
  if (!workoutsRaw || workoutsRaw.length > 20) return { ok: false, error: 'workouts must be a list of at most 20 items' };
  const workouts = new Map<string, WorkoutIn>();
  for (const [i, raw] of workoutsRaw.entries()) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const t = typeof item['start'] === 'string' ? Date.parse(item['start']) : NaN;
    if (Number.isNaN(t) || !recent(appDayOf(new Date(t)))) return { ok: false, error: `workouts[${i}].start must be a recent date-time` };
    const dur = isBlank(item['durationMin']) ? null : toNumber(item['durationMin']);
    if ((!isBlank(item['durationMin']) && dur === null) || (dur !== null && (dur < 0 || dur > 1440))) {
      return { ok: false, error: `workouts[${i}].durationMin must be 0–1440` };
    }
    const name = typeof item['name'] === 'string' && item['name'].trim() ? item['name'].trim().slice(0, 80) : null;
    const start = new Date(t).toISOString();
    workouts.set(start, { start, durationMin: dur === null ? null : Math.round(dur), name });
  }

  return { ok: true, value: { steps: [...steps.values()], workouts: [...workouts.values()] } };
}

export interface ManualHabit {
  name: string;
  frequency: 'daily' | 'weekly';
  weekday: number | null;
  sortOrder: number;
  checkedDays: readonly Day[];
}

export function pendingFor(today: Day, habits: readonly ManualHabit[]): string[] {
  const { start, end } = weekBlockRange(today);
  return [...habits]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((h) => {
      if (h.frequency === 'daily') return !h.checkedDays.includes(today);
      if (h.weekday !== weekdayOf(today)) return false;
      return !h.checkedDays.some((d) => d >= start && d <= end);
    })
    .map((h) => h.name);
}

export function messageFor(pending: readonly string[]): string {
  return pending.length ? `Left today: ${pending.join(', ')}` : '';
}
