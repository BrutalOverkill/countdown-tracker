import { TestBed } from '@angular/core/testing';
import type { ReportCard } from '../../domain/report';
import { ReportView } from './report-view';

const countdown = { id: 'd', title: 'Diwali', emoji: '🪔', targetDate: '2026-11-08', createdDay: '2026-10-19' };
const full: ReportCard = {
  countdown, from: '2026-10-19', to: '2026-11-07', days: 20, avgScore: 84, grade: 'A',
  bestWeek: { from: '2026-11-01', to: '2026-11-07', avg: 92 }, perfectDays: 6, bestStreak: 14, workoutDays: 13,
  totalSteps: 196_420, avgSteps: 9_821, kcalDays: 15,
  challenges: [{ id: 'c1', habitName: '10k steps', done: 16, target: 15, won: true }, { id: 'c2', habitName: 'Workout', done: 9, target: 12, won: false }],
  habits: [{ id: 'h', name: 'Minoxidil AM', color: '#32D7FA', percent: 100 }],
};

async function render(report: ReportCard, today = '2026-11-08') {
  const fixture = TestBed.createComponent(ReportView);
  fixture.componentRef.setInput('report', report);
  fixture.componentRef.setInput('today', today);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ReportView', () => {
  it('shows the grade, stats, challenge results and habit bars', async () => {
    const el = await render(full);
    expect(el.textContent).toContain('SUN 8 NOV · HAPPY DIWALI 🪔');
    expect(el.textContent).toContain('19 Oct – 7 Nov · 20 days');
    expect(el.querySelector('[data-testid=grade]')?.textContent?.trim()).toBe('A');
    expect(el.textContent).toContain('Average score 84');
    expect(el.textContent).toContain('Best week: 1 Nov – 7 Nov (avg 92)');
    for (const s of ['6', '14', '13', '196k', '9.8k', '15']) expect(el.textContent).toContain(s);
    expect(el.textContent).toContain('WON');
    expect(el.textContent).toContain('missed');
    expect(el.textContent).toContain('Minoxidil AM');
    expect(el.textContent).toContain('100%');
  });

  it('waits for the countdown day before grading', async () => {
    const el = await render(full, '2026-10-30');
    expect(el.textContent).toContain('Your report card opens on Sun 8 Nov');
    expect(el.querySelector('[data-testid=grade]')).toBeNull();
    expect(el.textContent).not.toContain('missed');
  });

  it('says there is nothing to report for an empty period', async () => {
    const el = await render({ ...full, days: 0, avgScore: null, grade: null, bestWeek: null, challenges: [], habits: [] });
    expect(el.textContent).toContain('Nothing to report — this countdown started today');
    expect(el.querySelector('[data-testid=grade]')).toBeNull();
  });
});
