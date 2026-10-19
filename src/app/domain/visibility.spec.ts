import { habit } from './testing';
import { dailyHabitsOn, firstHabitDay, habitsForMonth, isActiveOn } from './visibility';

describe('visibility', () => {
  it('is active from the creation day until the archive day (exclusive)', () => {
    const h = habit('a', { createdDay: '2026-10-05', archivedDay: '2026-10-20' });
    expect(isActiveOn(h, '2026-10-04')).toBe(false);
    expect(isActiveOn(h, '2026-10-05')).toBe(true);
    expect(isActiveOn(h, '2026-10-19')).toBe(true);
    expect(isActiveOn(h, '2026-10-20')).toBe(false);
  });

  it('lists active daily habits in sort order', () => {
    const list = [
      habit('b', { sortOrder: 2 }), habit('a', { sortOrder: 1 }),
      habit('w', { frequency: 'weekly' }), habit('x', { archivedDay: '2026-10-10' }),
    ];
    expect(dailyHabitsOn(list, '2026-10-19').map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('shows a habit in a month it overlaps', () => {
    const list = [
      habit('archivedBefore', { archivedDay: '2026-09-30' }),
      habit('archivedOnFirst', { archivedDay: '2026-10-01', sortOrder: 1 }),
      habit('createdAfter', { createdDay: '2026-11-01' }),
      habit('normal', { sortOrder: 2 }),
    ];
    expect(habitsForMonth(list, '2026-10-19').map((h) => h.id)).toEqual(['archivedOnFirst', 'normal']);
  });

  it('finds the first habit day', () => {
    expect(firstHabitDay([])).toBeNull();
    expect(firstHabitDay([habit('a', { createdDay: '2026-10-05' }), habit('b', { createdDay: '2026-10-02' })])).toBe('2026-10-02');
  });
});
