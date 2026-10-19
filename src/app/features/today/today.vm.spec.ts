import { ctx, habit, history } from '../../domain/testing';
import type { Challenge, Countdown } from '../../domain/types';
import { buildTodayVm, type TodayInput } from './today.vm';

const countdowns: Countdown[] = [
  { id: 'eng', title: 'Engagement', emoji: '💍', targetDate: '2026-12-10', createdDay: '2026-10-19' },
  { id: 'diw', title: 'Diwali', emoji: '🪔', targetDate: '2026-11-08', createdDay: '2026-10-19' },
  { id: 'old', title: 'Past', emoji: '🎯', targetDate: '2026-10-01', createdDay: '2026-09-01' },
];
const habits = [
  habit('am', { name: 'AM skincare', slot: 'morning', sortOrder: 5 }),
  habit('mxa', { name: 'Minoxidil AM', slot: 'morning', sortOrder: 7 }),
  habit('pm', { name: 'PM skincare', slot: 'night', sortOrder: 6 }),
  habit('derma', { name: 'Dermarolling', frequency: 'weekly', slot: 'night', weekday: 0, sortOrder: 9 }),
  habit('steps', { name: '10k steps', source: 'steps', sortOrder: 1 }),
];
const input = (over: Partial<TodayInput> = {}): TodayInput => ({
  habits, countdowns, challenges: [], ctx: ctx('2026-10-19', history({ checks: { am: ['2026-10-19'], derma: ['2026-10-18'] } })),
  minute: 840, lastSyncAt: '2026-10-19T12:30:00Z', now: new Date('2026-10-19T14:00:00Z'), ...over,
});

describe('buildTodayVm', () => {
  it('lists upcoming countdowns by date with days left', () => {
    expect(buildTodayVm(input()).countdowns).toEqual([
      { id: 'diw', title: 'Diwali', emoji: '🪔', days: 20, isToday: false },
      { id: 'eng', title: 'Engagement', emoji: '💍', days: 52, isToday: false },
    ]);
    expect(buildTodayVm(input({ ctx: ctx('2026-11-08') })).countdowns[0]).toMatchObject({ id: 'diw', days: 0, isToday: true });
  });

  it('groups manual daily routines by slot and counts them', () => {
    const vm = buildTodayVm(input());
    expect(vm.routines.map((g) => [g.label, g.items.map((i) => [i.habit.id, i.done])])).toEqual([
      ['Morning', [['am', true], ['mxa', false]]],
      ['Night', [['pm', false]]],
    ]);
    expect([vm.routinesDone, vm.routinesTotal]).toEqual([1, 3]);
  });

  it("finds this week's weekly tick", () => {
    expect(buildTodayVm(input()).weekly).toEqual([{ habit: habits[3], doneDay: '2026-10-18' }]);
  });

  it('describes the fasting state, or none when fasting is off', () => {
    expect(buildTodayVm(input()).fasting).toEqual({ kind: 'fasting', nextAt: '12:00 AM', minutesUntilNext: 600, doneMinutes: 60, fraction: 60 / 660 });
    expect(buildTodayVm(input({ minute: 690 })).fasting).toEqual({ kind: 'open', closesAt: '1:00 PM', minutesLeft: 90, fraction: 0.25 });
    expect(buildTodayVm(input({ ctx: ctx('2026-10-19', history(), { fastingEnabled: false }) })).fasting).toBeNull();
  });

  it('flags a sync older than 24 hours', () => {
    expect(buildTodayVm(input()).syncStale).toBe(false);
    expect(buildTodayVm(input({ lastSyncAt: null })).syncStale).toBe(true);
    expect(buildTodayVm(input({ lastSyncAt: '2026-10-18T13:00:00Z' })).syncStale).toBe(true);
  });

  it('builds challenge cards with a pace-aware footer', () => {
    const challenges: Challenge[] = [{ id: 'c1', countdownId: 'diw', habitId: 'steps', targetDays: 15, startDay: '2026-10-19' }];
    const onTrack = buildTodayVm(input({ challenges }));
    expect(onTrack.challengeGroups).toHaveLength(1);
    expect(onTrack.challengeGroups[0]).toMatchObject({ title: 'Diwali', footer: '20 days left' });
    const threeDays = history({ steps: { '2026-10-19': 12_000, '2026-10-20': 12_000, '2026-10-21': 12_000 } });
    const behind = buildTodayVm(input({ challenges, ctx: ctx('2026-10-26', threeDays) }));
    expect(behind.challengeGroups[0].footer).toBe('Need 12 of the next 13 days');
    expect(buildTodayVm(input({ challenges, ctx: ctx('2026-11-08') })).challengeGroups).toEqual([]);
  });

  it('puts a due or overdue interval habit on the due list, and the rest on "next" lines', () => {
    const derma = habit('d', { name: 'Dermarolling', frequency: 'interval', intervalDays: 4, intervalStart: '2026-10-20' });
    const at = (today: string, ticks: string[]) => buildTodayVm(input({ habits: [derma], ctx: ctx(today, history({ checks: { d: ticks } })) }));
    expect(at('2026-10-20', []).due).toEqual([{ habit: derma, since: '2026-10-20', overdueDays: 0 }]);
    expect(at('2026-10-20', ['2026-10-20']).intervals).toEqual([{ habit: derma, next: '2026-10-24', doneToday: true }]);
    expect(at('2026-10-22', ['2026-10-20']).intervals).toEqual([{ habit: derma, next: '2026-10-24', doneToday: false }]);
    expect(at('2026-10-26', ['2026-10-20']).due).toEqual([{ habit: derma, since: '2026-10-24', overdueDays: 2 }]);
    expect(at('2026-10-26', ['2026-10-20']).score.total).toBe(1);
  });
});
