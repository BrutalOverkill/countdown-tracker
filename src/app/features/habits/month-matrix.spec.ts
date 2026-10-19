import { ctx, habit, history } from '../../domain/testing';
import { buildMonthMatrix } from './month-matrix';

const habits = [
  habit('a', { sortOrder: 1 }),
  habit('cal', { source: 'calories', sortOrder: 2 }),
  habit('late', { createdDay: '2026-10-15', sortOrder: 3 }),
  habit('derma', { frequency: 'weekly', sortOrder: 4 }),
];
const h = history({
  checks: { a: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-19'], late: ['2026-10-16'], derma: ['2026-10-04', '2026-10-18'] },
  food: { '2026-10-18': { kcal: 1500 }, '2026-10-19': { kcal: 900 } },
});

describe('buildMonthMatrix', () => {
  const m = buildMonthMatrix(habits, '2026-10-19', ctx('2026-10-19', h), new Set(['2026-10-04']));

  it('lays out the month with today marked', () => {
    expect(m.month).toBe('2026-10-01');
    expect(m.days).toHaveLength(31);
    expect(m.todayIndex).toBe(18);
    expect(m.rows.map((r) => r.habit.id)).toEqual(['a', 'cal', 'late']);
  });

  it('fills done dots, leaving today\'s calories empty until the day is over', () => {
    const cal = m.rows[1];
    expect(cal.done[17]).toBe(true);  // 18 Oct
    expect(cal.done[18]).toBe(false); // today
  });

  it('counts done, elapsed active days and best streak', () => {
    expect(m.rows[0]).toMatchObject({ doneCount: 5, elapsed: 19, bestStreak: 3 });
    expect(m.rows[2]).toMatchObject({ doneCount: 1, elapsed: 5 });
  });

  it('marks perfect past days and frozen days', () => {
    expect(m.perfect.every((p, i) => !p || i < 18)).toBe(true);
    expect(m.frozen[3]).toBe(true);
    expect(m.frozen.filter(Boolean)).toHaveLength(1);
  });

  it('fills weekly blocks W1–W5', () => {
    expect(m.weekly).toEqual([{ habit: habits[3], blocks: [true, false, true, false, false] }]);
  });

  it('gives an every-N-days habit a row whose stats count due days', () => {
    const derma = habit('d', { frequency: 'interval', intervalDays: 4, intervalStart: '2026-10-20' });
    const m = buildMonthMatrix([derma], '2026-10-01', ctx('2026-10-31', history({ checks: { d: ['2026-10-20', '2026-10-26'] } })), new Set());
    expect(m.rows.map((r) => r.habit.id)).toEqual(['d']);
    expect(m.weekly).toEqual([]);
    // Due 20 (done), 24–26 (done 26), 30–31: 6 due days, 2 done.
    expect(m.rows[0]).toMatchObject({ doneCount: 2, elapsed: 6 });
  });
});
