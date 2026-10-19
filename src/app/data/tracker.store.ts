import { computed, inject, Injectable, signal } from '@angular/core';
import { addDays, type Day } from '@shared/days';
import { MAX_INTERVAL_DAYS } from '@shared/interval';
import { Clock } from '../core/clock';
import { Online } from '../core/online';
import { OFFLINE, SAVE_FAILED, ToastService } from '../core/toast.service';
import { DEFAULT_GOALS, EMPTY_HISTORY, type Challenge, type Countdown, type Ctx, type Goals, type Habit, type History, type Workout } from '../domain/types';
import { buildHistory, foodDayOf, mergeHistory, withCheck, withFoodDay, withWorkouts } from './history';
import { toWorkout, type FoodEntryRow } from './rows';
import { TrackerApi } from './tracker-api';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class TrackerStore {
  private readonly api = inject(TrackerApi);
  private readonly clock = inject(Clock);
  private readonly online = inject(Online);
  private readonly toast = inject(ToastService);

  readonly status = signal<LoadStatus>('idle');
  readonly loaded = computed(() => this.status() === 'ready');
  readonly saving = signal(false);
  readonly habits = signal<Habit[]>([]);
  readonly countdowns = signal<Countdown[]>([]);
  readonly challenges = signal<Challenge[]>([]);
  readonly goals = signal<Goals>(DEFAULT_GOALS);
  readonly lastSyncAt = signal<string | null>(null);
  readonly hasToken = signal(false);
  readonly history = signal<History>(EMPTY_HISTORY);
  readonly today = this.clock.today;
  readonly ctx = computed<Ctx>(() => ({ history: this.history(), goals: this.goals(), today: this.today() }));

  private owner: string | null = null;
  // Bumped by reset(); async work started under an older generation must not touch state.
  private generation = 0;
  private loadedFrom: Day | null = null;
  private lastLoad = 0;
  private readonly queues = new Map<string, Promise<unknown>>();
  // Per habit+day: writes still in flight, and the state the server last confirmed.
  private readonly checkWrites = new Map<string, { pending: number; confirmed: boolean }>();

  /** Loads data for `userId`, first discarding anything held for a different account. */
  async load(userId: string): Promise<void> {
    if (this.owner !== userId) this.reset();
    this.owner = userId;
    const gen = this.generation;
    this.status.set('loading');
    try {
      await this.api.ensureSetup();
    } catch {
      // Setup already ran on an earlier visit, or we're offline; the reads below decide which.
    }
    try {
      await this.reload(gen);
    } catch {
      if (gen === this.generation) this.status.set('error');
    }
  }

  /** Sign-out, session expiry or an account switch: forget everything about the current account. */
  reset(): void {
    this.generation++;
    this.owner = null;
    this.status.set('idle');
    this.saving.set(false);
    this.habits.set([]);
    this.countdowns.set([]);
    this.challenges.set([]);
    this.goals.set(DEFAULT_GOALS);
    this.lastSyncAt.set(null);
    this.hasToken.set(false);
    this.history.set(EMPTY_HISTORY);
    this.loadedFrom = null;
    this.lastLoad = 0;
    this.queues.clear();
    this.checkWrites.clear();
  }

  async reload(gen = this.generation): Promise<void> {
    await this.reloadConfig(gen);
    if (gen !== this.generation) return;
    const today = this.today();
    // Extra lookback so an every-N-days habit's last tick before the window is still known.
    const from = addDays([addDays(today, -180), ...this.countdowns().map((c) => c.createdDay)].sort()[0], -MAX_INTERVAL_DAYS);
    const rows = await this.api.loadHistory(from, today);
    if (gen !== this.generation) return;
    this.history.set(buildHistory(rows));
    this.loadedFrom = from;
    this.lastLoad = Date.now();
    this.status.set('ready');
  }

  async reloadConfig(gen = this.generation): Promise<void> {
    const cfg = await this.api.loadConfig();
    if (gen !== this.generation) return;
    this.goals.set(cfg.goals);
    this.lastSyncAt.set(cfg.lastSyncAt);
    this.hasToken.set(cfg.hasToken);
    this.habits.set(cfg.habits);
    this.countdowns.set(cfg.countdowns);
    this.challenges.set(cfg.challenges);
  }

  /** Picks up steps the Shortcut sent while the app was in the background. */
  async refreshIfStale(): Promise<void> {
    if (this.loaded() && Date.now() - this.lastLoad > 60_000) await this.reload().catch(() => undefined);
  }

  /** ↻ Sync hands off to the Shortcut; the next return to the app should pick up what it sent. */
  markStale(): void {
    this.lastLoad = 0;
  }

  async ensureHistoryFrom(from: Day): Promise<void> {
    const start = addDays(from, -MAX_INTERVAL_DAYS);
    if (this.loadedFrom !== null && start >= this.loadedFrom) return;
    const gen = this.generation;
    const to = this.loadedFrom ? addDays(this.loadedFrom, -1) : this.today();
    const rows = await this.api.loadHistory(start, to);
    if (gen !== this.generation) return;
    this.history.update((h) => mergeHistory(buildHistory(rows), h));
    this.loadedFrom = start;
  }

  async toggleCheck(habitId: string, day: Day): Promise<void> {
    if (!this.online.online()) return this.toast.show(OFFLINE);
    const gen = this.generation;
    const key = `${habitId}|${day}`;
    const shown = this.history().checks.get(habitId)?.has(day) ?? false;
    const state = this.checkWrites.get(key) ?? { pending: 0, confirmed: shown };
    this.checkWrites.set(key, state);
    const on = !shown;
    state.pending++;
    this.history.update((h) => withCheck(h, habitId, day, on));
    try {
      await this.enqueue(key, () => this.api.setCheck(habitId, day, on));
      state.confirmed = on;
    } catch {
      if (gen !== this.generation) return;
      this.toast.show(SAVE_FAILED);
      // Only the last write in flight decides; it puts back what the server last confirmed.
      if (state.pending === 1) this.history.update((h) => withCheck(h, habitId, day, state.confirmed));
    } finally {
      if (--state.pending === 0 && gen === this.generation) this.checkWrites.delete(key);
    }
  }

  async addManualWorkout(): Promise<void> {
    if (!this.online.online()) return this.toast.show(OFFLINE);
    const gen = this.generation;
    const day = this.today();
    try {
      const row = await this.api.addManualWorkout(day, this.clock.instant().toISOString());
      if (gen === this.generation) this.history.update((h) => withWorkouts(h, day, [...(h.workouts.get(day) ?? []), toWorkout(row)]));
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }

  async removeWorkout(w: Workout): Promise<void> {
    if (!this.online.online()) return this.toast.show(OFFLINE);
    const gen = this.generation;
    try {
      await this.api.deleteWorkout(w.id);
      if (gen === this.generation) this.history.update((h) => withWorkouts(h, w.day, (h.workouts.get(w.day) ?? []).filter((x) => x.id !== w.id)));
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }

  setFoodDay(day: Day, entries: readonly FoodEntryRow[]): void {
    this.history.update((h) => withFoodDay(h, day, entries.length ? foodDayOf(entries) : null));
  }

  /** Runs one settings-style write at a time: ignored while another is saving, refused offline, toasts on failure. */
  async guard(job: () => Promise<unknown>): Promise<boolean> {
    if (this.saving()) return false;
    if (!this.online.online()) {
      this.toast.show(OFFLINE);
      return false;
    }
    this.saving.set(true);
    try {
      await job();
      await this.reloadConfig();
      return true;
    } catch {
      this.toast.show(SAVE_FAILED);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async rotateToken(): Promise<string | null> {
    let token: string | null = null;
    const ok = await this.guard(async () => (token = await this.api.rotateToken()));
    return ok ? token : null;
  }

  private enqueue<T>(key: string, job: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(job, job);
    this.queues.set(key, next.catch(() => undefined));
    return next;
  }
}
