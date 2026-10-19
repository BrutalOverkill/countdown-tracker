import { TestBed } from '@angular/core/testing';
import { ToastService } from '../core/toast.service';
import { TrackerApi } from './tracker-api';
import { TrackerStore } from './tracker.store';

function setup(api: Partial<TrackerApi>) {
  TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
  return { store: TestBed.inject(TrackerStore), toast: TestBed.inject(ToastService) };
}

const config = {
  goals: { stepGoal: 10000, kcalGoal: 2000, fastingEnabled: true, windows: [] },
  lastSyncAt: null, hasToken: false,
  habits: [{ id: 'h1', name: 'AM skincare', emoji: '🧴', color: '#30D158', frequency: 'daily' as const, source: 'manual' as const, slot: 'morning' as const, weekday: null, sortOrder: 1, createdDay: '2026-10-01', archivedDay: null }],
  countdowns: [], challenges: [],
};
const emptyRows = { checks: [], steps: [], workouts: [], food: [] };

describe('TrackerStore', () => {
  it('loads config and history, even when setup fails offline', async () => {
    const { store } = setup({
      ensureSetup: vi.fn().mockRejectedValue(new Error('offline')),
      loadConfig: vi.fn().mockResolvedValue(config),
      loadHistory: vi.fn().mockResolvedValue({ ...emptyRows, steps: [{ day: '2026-10-19', count: 5 }] }),
    });
    await store.load('user-a');
    expect(store.status()).toBe('ready');
    expect(store.loaded()).toBe(true);
    expect(store.habits().map((h) => h.id)).toEqual(['h1']);
    expect(store.history().steps.get('2026-10-19')).toBe(5);
  });

  it('marks a failed load as an error instead of loading forever', async () => {
    const { store } = setup({ ensureSetup: vi.fn().mockResolvedValue(undefined), loadConfig: vi.fn().mockRejectedValue(new Error('500')) });
    await store.load('user-a');
    expect(store.status()).toBe('error');
    expect(store.loaded()).toBe(false);
  });

  it('reset discards data and ignores a load that finishes afterwards', async () => {
    let finish!: (value: unknown) => void;
    const api = {
      ensureSetup: vi.fn().mockResolvedValue(undefined),
      loadConfig: vi.fn(() => new Promise((r) => (finish = r))),
      loadHistory: vi.fn().mockResolvedValue(emptyRows),
    };
    const { store } = setup(api as unknown as Partial<TrackerApi>);
    const pending = store.load('user-a');
    await vi.waitFor(() => expect(api.loadConfig).toHaveBeenCalled());
    store.reset();
    finish(config);
    await pending;
    expect(store.habits()).toEqual([]);
    expect(store.status()).toBe('idle');
  });

  it('clears the previous account before loading a different one', async () => {
    const { store } = setup({
      ensureSetup: vi.fn().mockResolvedValue(undefined),
      loadConfig: vi.fn().mockResolvedValueOnce(config).mockReturnValueOnce(new Promise(() => undefined)),
      loadHistory: vi.fn().mockResolvedValue(emptyRows),
    });
    await store.load('user-a');
    expect(store.habits()).toHaveLength(1);
    void store.load('user-b');
    expect(store.habits()).toEqual([]);
    expect(store.loaded()).toBe(false);
  });

  it('ignores a second save while one is in flight', async () => {
    let release!: () => void;
    const job = vi.fn(() => new Promise<void>((r) => (release = r)));
    const { store } = setup({ loadConfig: vi.fn().mockResolvedValue(config) });
    const first = store.guard(job);
    expect(store.saving()).toBe(true);
    expect(await store.guard(job)).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(job).toHaveBeenCalledTimes(1);
    expect(store.saving()).toBe(false);
  });

  it('serialises rapid toggles so the server ends in the screen state', async () => {
    const calls: boolean[] = [];
    let release!: () => void;
    const firstDone = new Promise<void>((r) => (release = r));
    const { store } = setup({
      setCheck: vi.fn(async (_id: string, _day: string, on: boolean) => {
        calls.push(on);
        if (calls.length === 1) await firstDone;
      }),
    });
    const a = store.toggleCheck('h1', '2026-10-19');
    const b = store.toggleCheck('h1', '2026-10-19');
    await Promise.resolve();
    expect(calls).toEqual([true]);
    release();
    await Promise.all([a, b]);
    expect(calls).toEqual([true, false]);
    expect(store.history().checks.get('h1')?.has('2026-10-19') ?? false).toBe(false);
  });

  it('rolls back a failed tick and says so', async () => {
    const { store, toast } = setup({ setCheck: vi.fn().mockRejectedValue(new Error('down')) });
    await store.toggleCheck('h1', '2026-10-19');
    expect(store.history().checks.get('h1')?.has('2026-10-19') ?? false).toBe(false);
    expect(toast.message()).toBe("Couldn't save — check your connection");
  });

  it('shows what the server has after two quick taps that both fail', async () => {
    const { store } = setup({ setCheck: vi.fn().mockRejectedValue(new Error('down')) });
    await Promise.all([store.toggleCheck('h1', '2026-10-19'), store.toggleCheck('h1', '2026-10-19')]);
    expect(store.history().checks.get('h1')?.has('2026-10-19') ?? false).toBe(false);
  });

  it('keeps the first tick when only the second, untick write fails', async () => {
    const { store } = setup({ setCheck: vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('down')) });
    await Promise.all([store.toggleCheck('h1', '2026-10-19'), store.toggleCheck('h1', '2026-10-19')]);
    expect(store.history().checks.get('h1')?.has('2026-10-19') ?? false).toBe(true);
  });
});
