import { istMinutesOf } from '@shared/days';

export type Theme = 'bento' | 'matrix';
export type ThemePref = 'auto' | Theme;
export interface ThemeOverride {
  theme: Theme;
  until: string;
}

const DAY_START = 6 * 60;
const NIGHT_START = 19 * 60;
const isTheme = (v: unknown): v is Theme => v === 'bento' || v === 'matrix';

/** Bento from 06:00 to 18:59 IST, Matrix otherwise. */
export function autoTheme(now: Date): Theme {
  const m = istMinutesOf(now);
  return m >= DAY_START && m < NIGHT_START ? 'bento' : 'matrix';
}

/** The next 06:00 or 19:00 IST after `now`. */
export function nextSwitch(now: Date): Date {
  const m = istMinutesOf(now);
  const target = m < DAY_START ? DAY_START : m < NIGHT_START ? NIGHT_START : DAY_START + 1440;
  const minuteStart = now.getTime() - (now.getTime() % 60_000);
  return new Date(minuteStart + (target - m) * 60_000);
}

export function effectiveTheme(pref: ThemePref, override: ThemeOverride | null, now: Date): Theme {
  if (pref !== 'auto') return pref;
  if (override && Date.parse(override.until) > now.getTime()) return override.theme;
  return autoTheme(now);
}

export function parsePref(raw: string | null): ThemePref {
  return raw === 'bento' || raw === 'matrix' ? raw : 'auto';
}

export function parseOverride(raw: string | null): ThemeOverride | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { theme?: unknown; until?: unknown };
    return isTheme(v.theme) && typeof v.until === 'string' && !Number.isNaN(Date.parse(v.until)) ? { theme: v.theme, until: v.until } : null;
  } catch {
    return null;
  }
}
