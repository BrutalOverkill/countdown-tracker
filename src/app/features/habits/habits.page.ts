import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { addMonths, monthStart, type Day } from '@shared/days';
import { monthLabel } from '../../core/format';
import { Online } from '../../core/online';
import { storageGet, storageSet } from '../../core/storage';
import { ToastService } from '../../core/toast.service';
import { TrackerStore } from '../../data/tracker.store';
import { overallStreak } from '../../domain/streaks';
import { firstHabitDay } from '../../domain/visibility';
import { HabitGrid } from './habit-grid';
import { HabitWheel } from './habit-wheel';
import { buildMonthMatrix } from './month-matrix';
import { TasksCard } from './tasks-card';
import { WeeklyCard } from './weekly-card';

type View = 'wheel' | 'grid';

@Component({
  selector: 'app-habits-page',
  imports: [HabitWheel, HabitGrid, WeeklyCard, TasksCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-2 flex items-center justify-between px-1">
      <h1 class="text-2xl font-extrabold">Habits</h1>
      <div class="flex items-center gap-1 text-sm font-semibold text-steps">
        <button type="button" aria-label="Previous month" class="px-2 disabled:opacity-30" [disabled]="!canGoBack()" (click)="shift(-1)">‹</button>
        <span>{{ label() }}</span>
        <button type="button" aria-label="Next month" class="px-2 disabled:opacity-30" [disabled]="!canGoForward()" (click)="shift(1)">›</button>
      </div>
    </header>
    <div class="mb-2 flex rounded-lg bg-card p-0.5 text-sm font-semibold" role="tablist" aria-label="View">
      @for (v of views; track v.id) {
        <button type="button" role="tab" class="flex-1 rounded-md py-1" [attr.aria-selected]="view() === v.id"
          [class]="view() === v.id ? 'bg-line text-white' : 'text-muted'" (click)="setView(v.id)">{{ v.label }}</button>
      }
    </div>
    <div class="grid gap-2 lg:grid-cols-2">
      <div class="card !p-1.5">
        @if (view() === 'wheel') {
          <app-habit-wheel [matrix]="matrix()" />
        } @else {
          <app-habit-grid [matrix]="matrix()" [today]="store.today()" [disabled]="!online()" (toggle)="store.toggleCheck($event.habitId, $event.day)" />
        }
      </div>
      <div class="grid content-start gap-2">
        <app-weekly-card [rows]="matrix().weekly" />
        <app-tasks-card [month]="month()" />
      </div>
    </div>
  `,
})
export class HabitsPage {
  protected readonly store = inject(TrackerStore);
  private readonly toast = inject(ToastService);
  protected readonly online = inject(Online).online;
  protected readonly views: { id: View; label: string }[] = [{ id: 'wheel', label: '◔ Wheel' }, { id: 'grid', label: '▦ Grid' }];
  protected readonly view = signal<View>(storageGet('habits-view') === 'grid' ? 'grid' : 'wheel');
  // Follows the current month across 4 AM while showing it; a month picked with ‹ › stays put.
  protected readonly month = linkedSignal<Day, Day>({
    source: computed(() => monthStart(this.store.today())),
    computation: (current, prev) => (prev && prev.value !== prev.source ? prev.value : current),
  });
  protected readonly label = computed(() => monthLabel(this.month()));
  private readonly firstMonth = computed(() => monthStart(firstHabitDay(this.store.habits()) ?? this.store.today()));
  protected readonly canGoBack = computed(() => this.month() > this.firstMonth());
  protected readonly canGoForward = computed(() => this.month() < monthStart(this.store.today()));
  private readonly frozen = computed(() => overallStreak(this.store.habits(), this.store.ctx()).frozen);
  protected readonly matrix = computed(() => buildMonthMatrix(this.store.habits(), this.month(), this.store.ctx(), this.frozen()));

  protected setView(v: View): void {
    this.view.set(v);
    storageSet('habits-view', v);
  }

  protected async shift(n: number): Promise<void> {
    const next = addMonths(this.month(), n);
    try {
      await this.store.ensureHistoryFrom(next);
      this.month.set(next);
    } catch {
      this.toast.show("Couldn't load that month — check your connection");
    }
  }
}
