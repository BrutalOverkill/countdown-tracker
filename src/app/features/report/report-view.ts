import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { dayLabel, dayRange, formatCompact } from '../../core/format';
import type { ReportCard } from '../../domain/report';
import type { Day } from '../../domain/types';
import { Meter } from '../../ui/meter';

@Component({
  selector: 'app-report-view',
  imports: [Meter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = report();
    <div class="text-center">
      <p class="text-xs font-bold tracking-wide text-count">{{ headline() }}</p>
      <h1 class="num mt-1 text-3xl">{{ r.countdown.title }} report card</h1>
      <p class="muted">{{ range(r.from, r.to) }} · {{ r.days }} days</p>
    </div>
    @if (today() < r.countdown.targetDate) {
      <p class="card muted mt-3 text-center">Your report card opens on {{ label(r.countdown.targetDate) }}.</p>
    } @else if (r.days === 0) {
      <p class="card muted mt-3 text-center">Nothing to report — this countdown started today.</p>
    } @else {
      <section class="tile mt-3 flex items-center gap-3" data-tone="lime">
        <p class="num w-16 text-center text-6xl" data-testid="grade">{{ r.grade }}</p>
        <div>
          <p class="text-sm font-bold">Average score {{ r.avgScore }}</p>
          @if (r.bestWeek; as w) {
            <p class="muted">Best week: {{ range(w.from, w.to) }} (avg {{ w.avg }})</p>
          }
        </div>
      </section>
      <div class="mt-2 grid grid-cols-3 gap-1.5">
        @for (s of stats(); track s.label) {
          <div class="tile !p-2 text-center">
            <b class="num block text-2xl" [style.color]="s.color">{{ s.value }}</b>
            <span class="muted">{{ s.label }}</span>
          </div>
        }
      </div>
      @if (r.challenges.length) {
        <section class="card mt-2">
          <p class="label mb-1 text-count">Challenges</p>
          @for (c of r.challenges; track c.id) {
            <p class="flex items-center justify-between py-0.5 text-sm">
              <span>{{ c.won ? '🏆' : '✕' }} {{ c.habitName }}</span>
              <span><b>{{ c.done }}</b>/{{ c.target }}
                <span class="chip ml-1" [attr.data-status]="c.won ? 'won' : 'missed'">{{ c.won ? 'WON' : 'missed' }}</span></span>
            </p>
          }
        </section>
      }
      @if (r.habits.length) {
        <section class="card mt-2">
          <p class="label mb-1 text-routine">Habits</p>
          @for (h of r.habits; track h.id) {
            <p class="flex justify-between text-sm"><span>{{ h.name }}</span><span>{{ h.percent }}%</span></p>
            <app-meter class="mb-1.5 mt-0.5" [fraction]="h.percent / 100" [color]="h.color" track="var(--color-raised)" />
          }
        </section>
      }
    }
  `,
})
export class ReportView {
  readonly report = input.required<ReportCard>();
  readonly today = input.required<Day>();
  protected readonly range = dayRange;
  protected readonly label = dayLabel;

  protected readonly headline = computed(() => {
    const c = this.report().countdown;
    const prefix = this.today() === c.targetDate ? 'HAPPY ' : '';
    return `${dayLabel(c.targetDate).toUpperCase()} · ${prefix}${c.title.toUpperCase()} ${c.emoji}`;
  });

  protected readonly stats = computed(() => {
    const r = this.report();
    return [
      { label: '⭐ Perfect', value: String(r.perfectDays), color: 'var(--color-count)' },
      { label: '🔥 best streak', value: String(r.bestStreak), color: 'var(--color-streak)' },
      { label: '💪 workouts', value: String(r.workoutDays), color: 'var(--color-steps)' },
      { label: 'steps', value: formatCompact(r.totalSteps), color: 'var(--color-steps)' },
      { label: 'steps/day', value: formatCompact(r.avgSteps), color: 'var(--color-steps)' },
      { label: 'kcal on target', value: String(r.kcalDays), color: 'var(--color-kcal)' },
    ];
  });
}
