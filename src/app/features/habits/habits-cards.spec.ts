import { TestBed } from '@angular/core/testing';
import { ctx, habit, history } from '../../domain/testing';
import { ThemeService } from '../../core/theme.service';
import { TrackerApi } from '../../data/tracker-api';
import { HabitGrid } from './habit-grid';
import { HabitWheel } from './habit-wheel';
import { buildMonthMatrix } from './month-matrix';
import { TasksCard } from './tasks-card';
import { WeeklyCard } from './weekly-card';

const habits = [habit('a', { name: 'AM skincare', color: '#30D158' }), habit('steps', { name: '10k steps', source: 'steps' })];
// Lets async loads triggered by effects finish and re-render.
const settle = async (f: { whenStable(): Promise<unknown> }) => {
  await f.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  await f.whenStable();
};
const matrix = buildMonthMatrix(habits, '2026-10-19', ctx('2026-10-19', history({ checks: { a: ['2026-10-01', '2026-10-02'] }, steps: { '2026-10-01': 12000 } })), new Set());

describe('Habits cards', () => {
  beforeEach(() => localStorage.clear());

  it('HabitWheel draws off-white dots and a red star in Matrix', async () => {
    TestBed.inject(ThemeService).setPref('matrix');
    const fixture = TestBed.createComponent(HabitWheel);
    fixture.componentRef.setInput('matrix', matrix);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('circle')].every((c) => c.getAttribute('fill') === '#f2f2f2')).toBe(true);
    expect([...el.querySelectorAll('text')].find((x) => x.textContent === '★')?.getAttribute('fill')).toBe('#ff3b30');
  });

  it('WeeklyCard dots are off-white in Matrix', async () => {
    TestBed.inject(ThemeService).setPref('matrix');
    const fixture = TestBed.createComponent(WeeklyCard);
    fixture.componentRef.setInput('rows', [{ habit: habit('d', { color: '#BF5AF2', frequency: 'weekly' }), blocks: [true, false, false, false, false] }]);
    await fixture.whenStable();
    const dot = (fixture.nativeElement as HTMLElement).querySelector('td span') as HTMLElement;
    expect(dot.style.background).toBe('rgb(242, 242, 242)');
  });

  it('HabitWheel draws one dot per done day, stars perfect days and marks auto habits', async () => {
    const fixture = TestBed.createComponent(HabitWheel);
    fixture.componentRef.setInput('matrix', matrix);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('circle')).toHaveLength(3);
    expect([...el.querySelectorAll('text')].map((t) => t.textContent)).toContain('★');
    expect(el.textContent).toContain('10k steps ⚡');
  });

  it('HabitGrid lets you fix past manual days only', async () => {
    const fixture = TestBed.createComponent(HabitGrid);
    fixture.componentRef.setInput('matrix', matrix);
    fixture.componentRef.setInput('today', '2026-10-19');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons).toHaveLength(19); // AM skincare, 1–19 Oct; none for steps or future days
    const emitted: unknown[] = [];
    fixture.componentInstance.toggle.subscribe((e) => emitted.push(e));
    buttons[2].click();
    expect(emitted).toEqual([{ habitId: 'a', day: '2026-10-03' }]);
    expect(el.textContent).toContain('2/19 days · best streak 2');
  });

  it('TasksCard adds and deletes one-offs (delete needs a second tap)', async () => {
    const api = {
      loadTasks: vi.fn().mockResolvedValue([{ id: 't1', title: 'Haircut before Diwali', month: '2026-10-01', done_at: null }]),
      addTask: vi.fn().mockResolvedValue({ id: 't2', title: 'Diwali outfit', month: '2026-10-01', done_at: null }),
      deleteTask: vi.fn().mockResolvedValue(undefined),
      setTaskDone: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
    const fixture = TestBed.createComponent(TasksCard);
    fixture.componentRef.setInput('month', '2026-10-01');
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Haircut before Diwali');
    (el.querySelector('input') as HTMLInputElement).value = 'Diwali outfit';
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(api.addTask).toHaveBeenCalledWith('Diwali outfit', '2026-10-01');
    expect(el.textContent).toContain('Diwali outfit');
    const del = el.querySelector('[aria-label="Delete Haircut before Diwali"]') as HTMLButtonElement;
    del.click();
    await settle(fixture);
    expect(api.deleteTask).not.toHaveBeenCalled();
    del.click();
    await settle(fixture);
    expect(api.deleteTask).toHaveBeenCalledWith('t1');
  });
});
