import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ThemeService } from '../../core/theme.service';
import { isActiveOn } from '../../domain/visibility';
import type { Day, Habit } from '../../domain/types';
import type { MonthMatrix } from './month-matrix';

@Component({
  selector: 'app-habit-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = matrix();
    <div class="overflow-x-auto">
      <table class="border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th class="sticky left-0 z-10 bg-card pr-2 text-left font-semibold text-muted">Habit</th>
            @for (d of m.days; track d; let i = $index) {
              <th class="w-6 min-w-6 text-center font-medium" [class.text-steps]="i === m.todayIndex" [class.text-muted]="i !== m.todayIndex">
                <div class="h-3 text-[9px] leading-3">{{ m.perfect[i] ? '⭐' : m.frozen[i] ? '❄️' : '' }}</div>{{ i + 1 }}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of m.rows; track row.habit.id) {
            <tr>
              <th class="sticky left-0 z-10 max-w-28 truncate bg-card py-1 pr-2 text-left font-normal">{{ row.habit.name }}{{ row.habit.source === 'manual' ? '' : ' ⚡' }}</th>
              @for (d of m.days; track d; let i = $index) {
                <td class="text-center" [style.background]="i === m.todayIndex ? todayTint() : null">
                  @if (tappable(row.habit, d)) {
                    <button type="button" class="size-6" [attr.aria-label]="row.habit.name + ' on ' + d" [attr.aria-pressed]="row.done[i]" [disabled]="disabled()" (click)="toggle.emit({ habitId: row.habit.id, day: d })">
                      <span class="inline-block size-3 rounded-full" [style.background]="row.done[i] ? dotColor(row.habit) : 'transparent'" [style.border]="row.done[i] ? 'none' : '1px solid #48484a'"></span>
                    </button>
                  } @else {
                    <span class="inline-block size-3 rounded-full" [style.background]="row.done[i] ? dotColor(row.habit) : 'transparent'" [style.border]="row.done[i] ? 'none' : d <= today() ? '1px solid #3a3a3c' : '1px solid #1c1c1e'"></span>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
    <div class="mt-2 space-y-0.5 px-1">
      @for (row of m.rows; track row.habit.id) {
        <p class="flex justify-between gap-2 text-xs">
          <span><span class="mr-1 inline-block size-2 rounded-full" [style.background]="dotColor(row.habit)"></span>{{ row.habit.name }}</span>
          <span><b>{{ row.doneCount }}/{{ row.elapsed }}</b> days · best streak {{ row.bestStreak }}</span>
        </p>
      }
    </div>
  `,
})
export class HabitGrid {
  readonly matrix = input.required<MonthMatrix>();
  private readonly theme = inject(ThemeService);
  private readonly isMatrix = computed(() => this.theme.theme() === 'matrix');
  protected readonly todayTint = computed(() => (this.isMatrix() ? '#1a0806' : '#1f2d10'));

  protected dotColor(h: Habit): string {
    return this.isMatrix() ? '#f2f2f2' : h.color;
  }
  readonly today = input.required<Day>();
  readonly disabled = input(false);
  readonly toggle = output<{ habitId: string; day: Day }>();

  protected tappable(h: Habit, d: Day): boolean {
    return h.source === 'manual' && d <= this.today() && isActiveOn(h, d);
  }
}
