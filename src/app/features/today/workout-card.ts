import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatDuration } from '../../core/format';
import type { Workout } from '../../domain/types';

@Component({
  selector: 'app-workout-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="tile h-full" aria-label="Workout">
      <p class="label mb-1 text-steps">Workout · from Strong</p>
      @if (week(); as wk) {
        <p class="mb-1 text-xs font-bold">This week {{ wk.done }} / {{ wk.target }}
          @if (wk.needed && workouts().length === 0) {
            <span class="ml-1 rounded-md bg-accent px-1.5 py-0.5 text-black">{{ wk.reachable ? 'Needed today to reach ' + wk.target : 'Needed today' }}</span>
          }
        </p>
      }
      @for (w of workouts(); track w.id) {
        <div class="flex items-center justify-between py-1 text-sm">
          <span>💪 <b>{{ w.name ?? (w.source === 'manual' ? 'Trained' : 'Workout') }}</b></span>
          <span class="flex items-center gap-2">
            <span class="font-bold text-steps">{{ w.durationMin !== null ? dur(w.durationMin) + ' ✓' : '✓' }}</span>
            @if (w.source === 'manual') {
              <button type="button" class="text-xs text-muted underline" [disabled]="disabled()" (click)="remove.emit(w)">Remove</button>
            }
          </span>
        </div>
      } @empty {
        <button type="button" class="btn press w-full" [disabled]="disabled()" (click)="trained.emit()">Trained today ✓</button>
      }
    </section>
  `,
})
export class WorkoutCard {
  readonly workouts = input.required<readonly Workout[]>();
  readonly week = input<{ done: number; target: number; needed: boolean; reachable: boolean } | null>(null);
  readonly disabled = input(false);
  readonly trained = output<void>();
  readonly remove = output<Workout>();
  protected readonly dur = formatDuration;
}
