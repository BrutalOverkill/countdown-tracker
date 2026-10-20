import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Type } from '@angular/core';
import { habit } from '../../domain/testing';
import { ChallengesCard } from './challenges-card';
import { CountdownsCard } from './countdowns-card';
import { FastingCard } from './fasting-card';
import { DueCard } from './due-card';
import { RoutinesCard } from './routines-card';
import { ScoreCard } from './score-card';
import { ScoreSheet } from './score-sheet';
import { StepsTile } from './steps-tile';
import { WorkoutCard } from './workout-card';

async function render<T>(type: Type<T>, inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(type);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const progress = (status: string) => ({ done: 6, target: 15, window: 20, elapsed: 7, left: 13, status, pace: 0.35, needed: 9, endDay: '2026-11-07', finished: false });

describe('Today tiles', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('ScoreCard shows the live score, Perfect Day text and the freeze only when available', async () => {
    const streak = { length: 12, freezeAvailable: true, frozen: new Set() };
    const { el } = await render(ScoreCard, { score: { done: 4, total: 8, score: 50 }, perfect: false, streak });
    expect(el.querySelector('section')?.getAttribute('data-tone')).toBe('lime');
    expect(el.textContent).toContain('50');
    expect(el.textContent).toContain('4 of 8 done · 4 to go for a ⭐ Perfect Day');
    expect(el.textContent).toContain('🔥 12-day streak');
    expect(el.textContent).toContain('❄️ 1 freeze');
    const perfect = await render(ScoreCard, { score: { done: 8, total: 8, score: 100 }, perfect: true, streak: { ...streak, freezeAvailable: false } });
    expect(perfect.el.textContent).toContain('⭐ Perfect Day!');
    expect(perfect.el.textContent).not.toContain('freeze');
  });

  it('CountdownsCard shows the soonest countdown big, and a report link on the day', async () => {
    const { el } = await render(CountdownsCard, {
      tiles: [{ id: 'd', title: 'Diwali', emoji: '🪔', days: 20, isToday: false }, { id: 'e', title: 'Engagement', emoji: '💍', days: 52, isToday: false }],
    });
    expect(el.querySelector('section')?.getAttribute('data-tone')).toBe('pink');
    expect(el.textContent).toContain('🪔 Diwali');
    expect(el.textContent).toContain('20');
    expect(el.textContent).toContain('days to go');
    expect(el.textContent).toContain('💍 Engagement');
    expect(el.textContent).toContain('52');
    const onDay = await render(CountdownsCard, { tiles: [{ id: 'd', title: 'Diwali', emoji: '🪔', days: 0, isToday: true }] });
    expect(onDay.el.textContent).toContain('Today! 🪔');
    expect(onDay.el.querySelector('a')?.getAttribute('href')).toBe('/report/d');
  });

  it('FastingCard switches between open and fasting', async () => {
    const open = await render(FastingCard, { fasting: { kind: 'open', closesAt: '1:00 PM', minutesLeft: 90, fraction: 0.25 } });
    expect(open.el.textContent).toContain('🍽️ Eating window');
    expect(open.el.textContent).toContain('1h 30m');
    expect(open.el.textContent).toContain('left · closes 1:00 PM');
    const fasting = await render(FastingCard, { fasting: { kind: 'fasting', nextAt: '12:00 AM', minutesUntilNext: 600, doneMinutes: 60, fraction: 0.09 } });
    expect(fasting.el.textContent).toContain('🌙 Fasting');
    expect(fasting.el.textContent).toContain('opens 12:00 AM · in 10h');
  });

  it('StepsTile shows the count, the goal and a stale-sync warning', async () => {
    const fresh = await render(StepsTile, { steps: 7842, goal: 10000, lastSyncAt: '2026-10-19T12:30:00Z', stale: false });
    expect(fresh.el.textContent).toContain('7,842');
    expect(fresh.el.textContent).toContain('of 10k');
    expect(fresh.el.textContent).toContain('synced 6:00 PM');
    const stale = await render(StepsTile, { steps: 0, goal: 10000, lastSyncAt: '2026-10-18T12:30:00Z', stale: true });
    expect(stale.el.textContent).toContain('⚠️ last synced Sun 18 Oct, 6:00 PM');
    const never = await render(StepsTile, { steps: 0, goal: 10000, lastSyncAt: null, stale: true });
    expect(never.el.textContent).toContain('not synced yet');
  });

  it('RoutinesCard shows the count and emits the habit id when a pill is tapped', async () => {
    const am = habit('am', { name: 'AM skincare', emoji: '🧴' });
    const { fixture, el } = await render(RoutinesCard, {
      groups: [{ slot: 'morning', label: 'Morning', items: [{ habit: am, done: false }] }], weekly: [], intervals: [], today: '2026-10-19', done: 0, total: 1, disabled: false,
    });
    expect(el.textContent).toContain('0/1');
    const emitted: string[] = [];
    fixture.componentInstance.toggle.subscribe((id: string) => emitted.push(id));
    (el.querySelector('[role=checkbox]') as HTMLButtonElement).click();
    expect(emitted).toEqual(['am']);
  });

  it('WorkoutCard offers "Trained today" when there is no workout', async () => {
    const { fixture, el } = await render(WorkoutCard, { workouts: [], disabled: false });
    let trained = 0;
    fixture.componentInstance.trained.subscribe(() => trained++);
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(trained).toBe(1);
    const synced = await render(WorkoutCard, { workouts: [{ id: 'w', startedAt: '', day: '2026-10-19', durationMin: 52, name: 'Push day', source: 'health' }], disabled: false });
    expect(synced.el.textContent).toContain('Push day');
    expect(synced.el.textContent).toContain('52m ✓');
    expect(synced.el.querySelector('button')).toBeNull();
  });

  it('ChallengesCard labels each status', async () => {
    const group = {
      countdownId: 'd', title: 'Diwali', emoji: '🪔', footer: '13 days left',
      rows: ['on_track', 'behind', 'won', 'out_of_reach'].map((s, i) => ({ id: String(i), habitName: `h${i}`, progress: progress(s) })),
    };
    const { el } = await render(ChallengesCard, { group });
    for (const label of ['ON TRACK', 'BEHIND', 'WON 🏆', 'OUT OF REACH']) expect(el.textContent).toContain(label);
    expect(el.textContent).toContain('13 days left');
  });

  it('DueCard says due today, or overdue since the due day, and emits on Done', async () => {
    const derma = habit('d', { name: 'Dermarolling', emoji: '🪡' });
    const { fixture, el } = await render(DueCard, { due: { habit: derma, since: '2026-10-24', overdueDays: 2 } });
    expect(el.textContent).toContain('🪡 Dermarolling');
    expect(el.textContent).toContain('overdue since Sat 24 Oct (2 days)');
    const emitted: string[] = [];
    fixture.componentInstance.done.subscribe((id: string) => emitted.push(id));
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(emitted).toEqual(['d']);
    fixture.componentRef.setInput('due', { habit: derma, since: '2026-10-20', overdueDays: 0 });
    await fixture.whenStable();
    expect(el.textContent).toContain('due today');
  });

  it('RoutinesCard shows when an interval habit is next due', async () => {
    const derma = habit('d', { name: 'Dermarolling', emoji: '🪡' });
    const { el } = await render(RoutinesCard, {
      groups: [], weekly: [], intervals: [{ habit: derma, next: '2026-10-24', doneToday: true }], today: '2026-10-20', done: 0, total: 0, disabled: false,
    });
    expect(el.textContent).toContain('✓ 🪡 Dermarolling done · next Sat 24 Oct');
  });

  it('ScoreCard opens the popup of what is left when tapped', async () => {
    const { fixture, el } = await render(ScoreCard, { score: { done: 4, total: 8, score: 50 }, perfect: false, streak: { length: 0, freezeAvailable: true, frozen: new Set() } });
    let opened = 0;
    fixture.componentInstance.opened.subscribe(() => opened++);
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(opened).toBe(1);
  });

  it('ScoreSheet lists what is left with actions, what is done, and closes three ways', async () => {
    const pm = habit('pm', { name: 'PM skincare', emoji: '🌙' });
    const gym = habit('gym', { name: 'Workout', emoji: '💪', source: 'workout' });
    const steps = habit('steps', { name: '10k steps', emoji: '👟', source: 'steps' });
    const am = habit('am', { name: 'AM skincare', emoji: '🧴' });
    const { fixture, el } = await render(ScoreSheet, {
      score: { done: 1, total: 4, score: 25 },
      checklist: {
        left: [{ habit: steps, detail: '7,842 / 10,000', action: null }, { habit: gym, detail: 'Not yet', action: 'train' }, { habit: pm, detail: '', action: 'tick' }],
        done: [{ habit: am, detail: '', action: 'tick' }],
      },
    });
    const dialog = el.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.getAttribute('aria-label')).toBe("What's left today");
    expect(el.textContent).toContain('1 of 4 done');
    expect(el.textContent).toContain('7,842 / 10,000');
    expect(el.querySelector('[aria-label=Done]')?.textContent).toContain('AM skincare');
    const out: string[] = [];
    fixture.componentInstance.toggle.subscribe((id: string) => out.push('tick ' + id));
    fixture.componentInstance.trained.subscribe(() => out.push('trained'));
    fixture.componentInstance.closed.subscribe(() => out.push('closed'));
    (el.querySelector('[aria-label="Tick PM skincare"]') as HTMLButtonElement).click();
    (el.querySelector('[aria-label="Trained today"]') as HTMLButtonElement).click();
    (el.querySelector('[aria-label=Close]') as HTMLButtonElement).click();
    (el.querySelector('[data-testid=backdrop]') as HTMLElement).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(out).toEqual(['tick pm', 'trained', 'closed', 'closed', 'closed']);
  });

  it('WorkoutCard shows the week and highlights a needed day', async () => {
    const { fixture, el } = await render(WorkoutCard, { workouts: [], week: { done: 2, target: 4, needed: true } });
    expect(el.textContent).toContain('This week 2 / 4');
    expect(el.textContent).toContain('Needed today to reach 4');
    fixture.componentRef.setInput('week', { done: 1, target: 4, needed: false });
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Needed today');
  });
});
