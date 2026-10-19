import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatNumber } from '../../core/format';
import { CountUp } from '../../ui/count-up';
import { Meter } from '../../ui/meter';

@Component({
  selector: 'app-calories-tile',
  imports: [RouterLink, CountUp, Meter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <a routerLink="/food" class="tile press block h-full" data-tone="orange" aria-label="Calories">
      <p class="label">Calories</p>
      <p class="num mt-1 text-[30px]"><app-count [value]="kcal()" /></p>
      <p class="mt-1 text-[11px] font-bold">{{ kcal() > goal() ? n(kcal() - goal()) + ' over' : n(goal() - kcal()) + ' left' }}</p>
      <app-meter class="mt-2" [fraction]="kcal() / goal()" />
    </a>
  `,
})
export class CaloriesTile {
  readonly kcal = input.required<number>();
  readonly goal = input.required<number>();
  protected readonly n = formatNumber;
}
