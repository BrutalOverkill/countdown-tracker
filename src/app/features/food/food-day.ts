import { instantFor, istMinutesOf, type Day } from '@shared/days';
import { inWindow } from '@shared/windows';
import { hhmmOf, timeOf } from '../../core/format';
import type { FoodEntryRow, SavedFoodRow } from '../../data/rows';
import type { Goals } from '../../domain/types';

export interface FoodLine {
  id: string;
  name: string;
  kcal: number;
  protein: number | null;
  time: string;
  hhmm: string;
  outside: boolean;
}

export function foodLines(entries: readonly FoodEntryRow[], goals: Goals): FoodLine[] {
  const useWindows = goals.fastingEnabled && goals.windows.length > 0;
  return [...entries]
    .sort((a, b) => a.eaten_at.localeCompare(b.eaten_at))
    .map((e) => {
      const at = new Date(e.eaten_at);
      return {
        id: e.id, name: e.name, kcal: e.kcal, protein: e.protein_g,
        time: timeOf(e.eaten_at), hhmm: hhmmOf(at),
        outside: useWindows && !inWindow(istMinutesOf(at), goals.windows),
      };
    });
}

export function totals(entries: readonly FoodEntryRow[]): { kcal: number; protein: number | null } {
  const kcal = entries.reduce((sum, e) => sum + e.kcal, 0);
  const withProtein = entries.filter((e) => e.protein_g !== null);
  return { kcal, protein: withProtein.length ? Math.round(withProtein.reduce((s, e) => s + (e.protein_g ?? 0), 0) * 10) / 10 : null };
}

export function suggest(saved: readonly SavedFoodRow[], query: string): SavedFoodRow[] {
  const q = query.trim().toLowerCase();
  return saved.filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 12);
}

export function defaultTime(day: Day, today: Day, now: Date): string {
  return day === today ? hhmmOf(now) : '12:00';
}

export interface FoodForm { name: string; kcal: string; protein: string; time: string }

export function parseFood(form: FoodForm, day: Day):
  | { ok: true; value: { name: string; kcal: number; proteinG: number | null; eatenAt: string } }
  | { ok: false; error: string } {
  const name = form.name.trim();
  if (name.length < 1 || name.length > 60) return { ok: false, error: 'Give the food a name' };
  const kcal = Number(form.kcal);
  if (form.kcal.trim() === '' || !Number.isInteger(kcal) || kcal < 0 || kcal > 10_000) {
    return { ok: false, error: 'Calories must be a whole number from 0 to 10000' };
  }
  const protein = form.protein.trim() === '' ? null : Number(form.protein);
  if (protein !== null && (!Number.isFinite(protein) || protein < 0 || protein > 1000)) return { ok: false, error: 'Protein must be 0–1000 g' };
  if (!/^\d{2}:\d{2}$/.test(form.time)) return { ok: false, error: 'Pick a time' };
  return {
    ok: true,
    value: { name, kcal, proteinG: protein === null ? null : Math.round(protein * 10) / 10, eatenAt: instantFor(day, form.time).toISOString() },
  };
}
