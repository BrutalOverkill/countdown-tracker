import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TrackerStore } from '../../data/tracker.store';
import { buildReport } from '../../domain/report';
import { ReportView } from './report-view';

@Component({
  selector: 'app-report-page',
  imports: [RouterLink, ReportView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/today" class="mb-2 inline-block px-1 text-sm text-routine">← Today</a>
    @if (report(); as r) {
      <app-report-view [report]="r" [today]="store.today()" />
    } @else {
      <p class="card muted text-center">That countdown doesn't exist any more.</p>
    }
  `,
})
export class ReportPage {
  readonly id = input.required<string>();
  protected readonly store = inject(TrackerStore);
  private readonly countdown = computed(() => this.store.countdowns().find((c) => c.id === this.id()) ?? null);
  protected readonly report = computed(() => {
    const c = this.countdown();
    return c ? buildReport(c, this.store.habits(), this.store.challenges(), this.store.ctx()) : null;
  });

  constructor() {
    effect(() => {
      const c = this.countdown();
      if (c) untracked(() => void this.store.ensureHistoryFrom(c.createdDay).catch(() => undefined));
    });
  }
}
