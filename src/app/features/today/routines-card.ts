import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { dayLabel, weekdayShort } from '../../core/format';
import type { Day } from '../../domain/types';
import type { IntervalLineVm, RoutineGroupVm, WeeklyVm } from './today.vm';

@Component({
  selector: 'app-routines-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="tile h-full" aria-label="Routines">
      <p class="label mb-2">Routines · {{ done() }}/{{ total() }} · tap to tick</p>
      @for (g of groups(); track g.slot) {
        <p class="mb-1 text-[10px] font-semibold uppercase text-muted">{{ g.label }}</p>
        <div class="mb-2 flex flex-wrap gap-1.5">
          @for (r of g.items; track r.habit.id) {
            <!-- The pill's ✓ / ○ / ● glyph comes from CSS so it can differ per theme. -->
            <button type="button" role="checkbox" class="pill press" [class.pop]="r.done" [attr.aria-checked]="r.done"
              [disabled]="disabled()" (click)="toggle.emit(r.habit.id)">{{ r.habit.emoji }} {{ r.habit.name }}</button>
          }
        </div>
      } @empty {
        <p class="muted">No routines yet — add habits in Settings.</p>
      }
      @for (w of weekly(); track w.habit.id) {
        <div class="mt-1 flex items-center justify-between gap-2 border-t border-line pt-2 text-xs">
          <span>{{ w.habit.emoji }} {{ w.habit.name }} this week: {{ w.doneDay ? 'done ' + weekday(w.doneDay) + ' ✓' : 'not yet' }}</span>
          @if (!w.doneDay || w.doneDay === today()) {
            <button type="button" class="btn-quiet press !py-1 text-xs" [disabled]="disabled()" (click)="toggle.emit(w.habit.id)">{{ w.doneDay ? 'Undo' : 'Done today' }}</button>
          }
        </div>
      }
      @for (l of intervals(); track l.habit.id) {
        <div class="mt-1 flex items-center justify-between gap-2 border-t border-line pt-2 text-xs">
          <span>{{ l.doneToday ? '✓ ' : '' }}{{ l.habit.emoji }} {{ l.habit.name }}{{ l.doneToday ? ' done' : '' }} · next {{ label(l.next) }}</span>
          @if (l.doneToday) {
            <button type="button" class="btn-quiet press !py-1 text-xs" [disabled]="disabled()" (click)="toggle.emit(l.habit.id)">Undo</button>
          }
        </div>
      }
    </section>
  `,
})
export class RoutinesCard {
  readonly groups = input.required<RoutineGroupVm[]>();
  readonly weekly = input.required<WeeklyVm[]>();
  readonly intervals = input<IntervalLineVm[]>([]);
  readonly today = input.required<Day>();
  readonly done = input.required<number>();
  readonly total = input.required<number>();
  readonly disabled = input(false);
  readonly toggle = output<string>();
  protected readonly weekday = weekdayShort;
  protected readonly label = dayLabel;
}
