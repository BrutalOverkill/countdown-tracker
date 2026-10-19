import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../../core/theme.service';
import type { WeeklyRow } from './month-matrix';

@Component({
  selector: 'app-weekly-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Weekly habits">
      <p class="label mb-1 text-weekly">Weekly</p>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-[10px] text-muted">
            <th class="text-left font-semibold">Habit</th>
            @for (w of weeks; track w) {
              <th class="font-semibold">W{{ w }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.habit.id) {
            <tr>
              <td class="py-1">{{ r.habit.emoji }} {{ r.habit.name }}</td>
              @for (b of r.blocks; track $index) {
                <td class="text-center"><span class="inline-block size-3 rounded-full" [style.background]="b ? (matrix() ? '#f2f2f2' : r.habit.color) : 'transparent'" [style.border]="b ? 'none' : '1.5px solid #48484a'"></span></td>
              }
            </tr>
          } @empty {
            <tr><td colspan="6" class="muted py-1">No weekly habits — add one in Settings.</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class WeeklyCard {
  readonly rows = input.required<WeeklyRow[]>();
  protected readonly weeks = [1, 2, 3, 4, 5];
  private readonly theme = inject(ThemeService);
  protected readonly matrix = computed(() => this.theme.theme() === 'matrix');
}
