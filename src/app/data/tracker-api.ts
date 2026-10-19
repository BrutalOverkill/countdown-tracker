import { inject, Injectable } from '@angular/core';
import type { Day } from '@shared/days';
import type { EatingWindow } from '@shared/windows';
import { SUPABASE } from '../core/supabase';
import type { Frequency, HabitSource, Slot } from '../domain/types';
import type { HistoryRows } from './history';
import {
  toChallenge, toCountdown, toGoals, toHabit,
  type ChallengeRow, type CountdownRow, type FoodEntryRow, type HabitRow, type SavedFoodRow, type SettingsRow, type TaskRow, type WorkoutRow,
} from './rows';
import { selectAll } from './select-all';

export interface NewFood { day: Day; eatenAt: string; name: string; kcal: number; proteinG: number | null; savedFoodId: string | null }
export interface NewHabit { name: string; emoji: string; color: string; frequency: Frequency; source: HabitSource; slot: Slot; weekday: number | null; sortOrder: number }

function must<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

@Injectable({ providedIn: 'root' })
export class TrackerApi {
  private readonly db = inject(SUPABASE);

  async ensureSetup(): Promise<void> {
    must(await this.db.rpc('ensure_setup'));
  }

  async loadConfig() {
    const [settings, habits, countdowns, challenges] = await Promise.all([
      this.db.from('settings').select('step_goal, kcal_goal, last_sync_at, sync_token_hash, fasting_enabled, eating_windows').single(),
      this.db.from('habits').select('*').order('sort_order'),
      this.db.from('countdowns').select('*').order('target_date'),
      this.db.from('challenges').select('*').order('created_at'),
    ]);
    const s = must(settings) as SettingsRow;
    return {
      goals: toGoals(s),
      lastSyncAt: s.last_sync_at,
      hasToken: s.sync_token_hash !== null,
      habits: (must(habits) as HabitRow[]).map(toHabit),
      countdowns: (must(countdowns) as CountdownRow[]).map(toCountdown),
      challenges: (must(challenges) as ChallengeRow[]).map(toChallenge),
    };
  }

  async loadHistory(from: Day, to: Day): Promise<HistoryRows> {
    const [checks, steps, workouts, food] = await Promise.all([
      selectAll((a, b) => this.db.from('habit_checks').select('habit_id, day').gte('day', from).lte('day', to).order('day').order('habit_id').range(a, b)),
      selectAll((a, b) => this.db.from('steps_daily').select('day, count').gte('day', from).lte('day', to).order('day').range(a, b)),
      selectAll((a, b) => this.db.from('workouts').select('id, started_at, day, duration_min, name, source').gte('day', from).lte('day', to).order('started_at').range(a, b)),
      selectAll((a, b) => this.db.from('food_entries').select('day, kcal, protein_g, eaten_at').gte('day', from).lte('day', to).order('eaten_at').range(a, b)),
    ]);
    return { checks, steps, workouts, food } as HistoryRows;
  }

  async setCheck(habitId: string, day: Day, on: boolean): Promise<void> {
    if (on) must(await this.db.from('habit_checks').upsert({ habit_id: habitId, day }, { onConflict: 'habit_id,day', ignoreDuplicates: true }));
    else must(await this.db.from('habit_checks').delete().eq('habit_id', habitId).eq('day', day));
  }

  async addManualWorkout(day: Day, startedAt: string): Promise<WorkoutRow> {
    return must(await this.db.from('workouts').insert({ day, started_at: startedAt, source: 'manual' }).select('id, started_at, day, duration_min, name, source').single()) as WorkoutRow;
  }

  async deleteWorkout(id: string): Promise<void> {
    must(await this.db.from('workouts').delete().eq('id', id));
  }

  async loadFoodDay(day: Day): Promise<FoodEntryRow[]> {
    return must(await this.db.from('food_entries').select('id, eaten_at, day, name, kcal, protein_g, saved_food_id').eq('day', day).order('eaten_at')) as FoodEntryRow[];
  }

  async addFood(f: NewFood): Promise<FoodEntryRow> {
    return must(await this.db.from('food_entries')
      .insert({ day: f.day, eaten_at: f.eatenAt, name: f.name, kcal: f.kcal, protein_g: f.proteinG, saved_food_id: f.savedFoodId })
      .select('id, eaten_at, day, name, kcal, protein_g, saved_food_id').single()) as FoodEntryRow;
  }

  async updateFood(id: string, f: NewFood): Promise<void> {
    must(await this.db.from('food_entries').update({ day: f.day, eaten_at: f.eatenAt, name: f.name, kcal: f.kcal, protein_g: f.proteinG }).eq('id', id));
  }

  async deleteFood(id: string): Promise<void> {
    must(await this.db.from('food_entries').delete().eq('id', id));
  }

  async loadSavedFoods(): Promise<SavedFoodRow[]> {
    return must(await this.db.from('saved_foods').select('id, name, kcal, protein_g, use_count').order('use_count', { ascending: false }).order('name')) as SavedFoodRow[];
  }

  async saveFood(name: string, kcal: number, proteinG: number | null): Promise<SavedFoodRow> {
    return must(await this.db.from('saved_foods').insert({ name, kcal, protein_g: proteinG, use_count: 1 }).select('id, name, kcal, protein_g, use_count').single()) as SavedFoodRow;
  }

  async deleteSavedFood(id: string): Promise<void> {
    must(await this.db.from('saved_foods').delete().eq('id', id));
  }

  async bumpSavedFood(id: string, useCount: number): Promise<void> {
    must(await this.db.from('saved_foods').update({ use_count: useCount }).eq('id', id));
  }

  async addCountdown(title: string, emoji: string, targetDate: Day): Promise<void> {
    must(await this.db.from('countdowns').insert({ title, emoji, target_date: targetDate }));
  }

  async updateCountdown(id: string, title: string, emoji: string, targetDate: Day): Promise<void> {
    must(await this.db.from('countdowns').update({ title, emoji, target_date: targetDate }).eq('id', id));
  }

  async deleteCountdown(id: string): Promise<void> {
    must(await this.db.from('countdowns').delete().eq('id', id));
  }

  async addChallenge(countdownId: string, habitId: string, targetDays: number, startDay: Day): Promise<void> {
    must(await this.db.from('challenges').insert({ countdown_id: countdownId, habit_id: habitId, target_days: targetDays, start_day: startDay }));
  }

  async deleteChallenge(id: string): Promise<void> {
    must(await this.db.from('challenges').delete().eq('id', id));
  }

  async addHabit(h: NewHabit): Promise<void> {
    must(await this.db.from('habits').insert({ name: h.name, emoji: h.emoji, color: h.color, frequency: h.frequency, source: h.source, slot: h.slot, weekday: h.weekday, sort_order: h.sortOrder }));
  }

  async updateHabit(id: string, h: NewHabit): Promise<void> {
    must(await this.db.from('habits').update({ name: h.name, emoji: h.emoji, color: h.color, frequency: h.frequency, slot: h.slot, weekday: h.weekday }).eq('id', id));
  }

  async archiveHabit(id: string): Promise<void> {
    must(await this.db.from('habits').update({ archived_at: new Date().toISOString() }).eq('id', id));
  }

  async setSortOrders(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map(async (id, i) => must(await this.db.from('habits').update({ sort_order: i + 1 }).eq('id', id))));
  }

  async updateGoals(stepGoal: number, kcalGoal: number): Promise<void> {
    must(await this.db.from('settings').update({ step_goal: stepGoal, kcal_goal: kcalGoal }).not('user_id', 'is', null));
  }

  async updateFasting(enabled: boolean, windows: readonly EatingWindow[]): Promise<void> {
    must(await this.db.from('settings').update({ fasting_enabled: enabled, eating_windows: windows }).not('user_id', 'is', null));
  }

  async rotateToken(): Promise<string> {
    return must(await this.db.rpc('rotate_sync_token')) as string;
  }

  async loadTasks(month: Day): Promise<TaskRow[]> {
    return must(await this.db.from('tasks').select('id, title, month, done_at').eq('month', month).order('created_at')) as TaskRow[];
  }

  async addTask(title: string, month: Day): Promise<TaskRow> {
    return must(await this.db.from('tasks').insert({ title, month }).select('id, title, month, done_at').single()) as TaskRow;
  }

  async setTaskDone(id: string, done: boolean): Promise<void> {
    must(await this.db.from('tasks').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id));
  }

  async deleteTask(id: string): Promise<void> {
    must(await this.db.from('tasks').delete().eq('id', id));
  }
}
