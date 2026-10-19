import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DayScore } from '../../domain/scoring';
import type { StreakInfo } from '../../domain/streaks';
import { CountUp } from '../../ui/count-up';
import { Ring } from '../../ui/ring';

@Component({
  selector: 'app-score-card',
  imports: [CountUp, Ring],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="tile press h-full" data-tone="lime" aria-label="Today's score">
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="label">Score · live</p>
          <p class="num mt-1 text-[46px]"><app-count [value]="score().score" /></p>
        </div>
        <app-ring [fraction]="score().score / 100" [size]="48" />
      </div>
      <p class="mt-1 text-xs font-bold">{{ perfect() ? '⭐ Perfect Day!' : score().done + ' of ' + score().total + ' done · ' + (score().total - score().done) + ' to go for a ⭐ Perfect Day' }}</p>
      <p class="mt-1 text-xs font-bold"><span class="flicker">🔥</span> {{ streak().length }}-day streak{{ streak().freezeAvailable ? ' · ❄️ 1 freeze' : '' }}</p>
    </section>
  `,
})
export class ScoreCard {
  readonly score = input.required<DayScore>();
  readonly perfect = input.required<boolean>();
  readonly streak = input.required<StreakInfo>();
}
