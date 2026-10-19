import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { dayLabel } from '../../core/format';
import type { DueVm } from './today.vm';

@Component({
  selector: 'app-due-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let d = due();
    <section class="tile due-card flex items-center justify-between gap-3" [attr.data-tone]="d.overdueDays > 0 ? 'orange' : 'violet'"
      [class.is-overdue]="d.overdueDays > 0" [attr.aria-label]="d.habit.name + ' is due'">
      <div class="min-w-0">
        <p class="label">{{ d.overdueDays > 0 ? 'Overdue' : 'Due today' }}</p>
        <p class="mt-0.5 truncate text-lg font-extrabold">{{ d.habit.emoji }} {{ d.habit.name }}</p>
        <p class="text-sm">{{ d.overdueDays > 0 ? 'overdue since ' + label(d.since) + ' (' + d.overdueDays + (d.overdueDays === 1 ? ' day)' : ' days)') : 'due today' }}</p>
      </div>
      <button type="button" class="btn press shrink-0 !px-5 !py-3" [disabled]="disabled()" (click)="done.emit(d.habit.id)">Done ✓</button>
    </section>
  `,
})
export class DueCard {
  readonly due = input.required<DueVm>();
  readonly disabled = input(false);
  readonly done = output<string>();
  protected readonly label = dayLabel;
}
