import { scoredHabitsOn } from './scoring';
import { ctx, habit } from './testing';
import { firstHabitDay, habitsForMonth, isActiveOn } from './visibility';

describe('visibility', () => {
  it('is active from the creation day until the archive day (exclusive)', () => {
    const h = habit('a', { createdDay: '2026-10-05', archivedDay: '2026-10-20' });
    expect(isActiveOn(h, '2026-10-04')).toBe(false);
    expect(isActiveOn(h, '2026-10-05')).toBe(true);
    expect(isActiveOn(h, '2026-10-19')).toBe(true);
    expect(isActiveOn(h, '2026-10-20')).toBe(false);
  });

  it('scores active daily habits in sort order', () => {
    const list = [
      habit('b', { sortOrder: 2 }), habit('a', { sortOrder: 1 }),
      habit('w', { frequency: 'weekly' }), habit('x', { archivedDay: '2026-10-10' }),
    ];
    expect(scoredHabitsOn(list, '2026-10-19', ctx('2026-10-19')).map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('shows a habit in a month unless it was archived by the end of that month', () => {
    const list = [
      habit('archivedBefore', { archivedDay: '2026-09-30' }),
      habit('archivedMidMonth', { createdDay: '2026-09-01', archivedDay: '2026-10-21', sortOrder: 1 }),
      habit('archivedNextMonth', { archivedDay: '2026-11-02', sortOrder: 2 }),
      habit('createdAfter', { createdDay: '2026-11-01' }),
      habit('normal', { sortOrder: 3 }),
    ];
    expect(habitsForMonth(list, '2026-10-19').map((h) => h.id)).toEqual(['archivedNextMonth', 'normal']);
    // Earlier months keep its history.
    expect(habitsForMonth(list, '2026-09-10').map((h) => h.id)).toEqual(['archivedMidMonth']);
  });

  it('finds the first habit day', () => {
    expect(firstHabitDay([])).toBeNull();
    expect(firstHabitDay([habit('a', { createdDay: '2026-10-05' }), habit('b', { createdDay: '2026-10-02' })])).toBe('2026-10-02');
  });
});
