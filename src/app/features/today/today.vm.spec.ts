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

  it('lists what is left today and what is done, with progress for automatic habits', () => {
    const list = [
      habit('steps', { name: '10k steps', source: 'steps', sortOrder: 1 }),
      habit('kcal', { name: 'Calories on target', source: 'calories', sortOrder: 2 }),
      habit('gym', { name: 'Workout', source: 'workout', sortOrder: 4 }),
      habit('am', { name: 'AM skincare', slot: 'morning', sortOrder: 5 }),
      habit('pm', { name: 'PM skincare', slot: 'night', sortOrder: 6 }),
      habit('d', { name: 'Dermarolling', frequency: 'interval', intervalDays: 4, intervalStart: '2026-10-17', sortOrder: 9 }),
    ];
    const vm = buildTodayVm(input({ habits: list, ctx: ctx('2026-10-19', history({ checks: { am: ['2026-10-19'] }, steps: { '2026-10-19': 7842 } })) }));
    expect(vm.checklist.left.map((i) => [i.habit.id, i.detail, i.action])).toEqual([
      ['steps', '7,842 / 10,000', null],
      ['kcal', 'Log food to count it', null],
      ['gym', 'Not yet', 'train'],
      ['pm', '', 'tick'],
      ['d', 'overdue 2 days', 'tick'],
    ]);
    expect(vm.checklist.done.map((i) => i.habit.id)).toEqual(['am']);
  });

  it('shows the Workout week, and lists Workout as left only when it is needed', () => {
    const gym = habit('gym', { name: 'Workout', source: 'workout', frequency: 'times_per_week', timesPerWeek: 4 });
    const at = (today: string, workouts: string[]) => buildTodayVm(input({ habits: [gym], ctx: ctx(today, history({ workouts })) }));
    expect(at('2026-10-21', ['2026-10-19']).workoutWeek).toEqual({ done: 1, target: 4, needed: false, reachable: true });
    expect(at('2026-10-21', ['2026-10-19']).checklist.left).toEqual([]);
    expect(at('2026-10-24', ['2026-10-19', '2026-10-21']).checklist.left.map((i) => i.detail)).toEqual(['2 / 4 this week · needed today']);
    expect(at('2026-10-24', ['2026-10-19', '2026-10-21', '2026-10-24']).checklist.done.map((i) => i.detail)).toEqual(['Trained · 3 / 4 this week']);
    expect(buildTodayVm(input({ habits: [] })).workoutWeek).toBeNull();
  });
});
