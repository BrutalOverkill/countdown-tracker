import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Online } from '../../core/online';
import { SAVE_FAILED, ToastService } from '../../core/toast.service';
import type { TaskRow } from '../../data/rows';
import { TrackerApi } from '../../data/tracker-api';
import type { Day } from '../../domain/types';

@Component({
  selector: 'app-tasks-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Monthly one-offs">
      <p class="label mb-1 text-muted">Monthly one-offs</p>
      @for (t of tasks(); track t.id) {
        <div class="flex items-center gap-2 py-1 text-sm">
          <button type="button" role="checkbox" [attr.aria-checked]="!!t.done_at" [disabled]="!online()" (click)="toggle(t)"
            class="grid size-4 place-items-center rounded border-[1.5px] text-[10px]" [class]="t.done_at ? 'border-steps bg-steps text-black' : 'border-line'">{{ t.done_at ? '✓' : '' }}</button>
          <span class="flex-1" [class.line-through]="!!t.done_at" [class.text-muted]="!!t.done_at">{{ t.title }}</span>
          <button type="button" class="text-xs text-muted" [attr.aria-label]="'Delete ' + t.title" [disabled]="!online()" (click)="remove(t)">{{ confirming() === t.id ? 'Tap again' : '✕' }}</button>
        </div>
      } @empty {
        <p class="muted">Nothing for this month yet.</p>
      }
      <form class="mt-2 flex gap-2" (submit)="add($event, title)">
        <input #title class="field !py-1.5" placeholder="+ add a one-off" maxlength="80" [disabled]="!online()" />
        <button class="btn-quiet !py-1.5" type="submit" [disabled]="!online()">Add</button>
      </form>
    </section>
  `,
})
export class TasksCard {
  readonly month = input.required<Day>();
  private readonly api = inject(TrackerApi);
  private readonly toast = inject(ToastService);
  protected readonly online = inject(Online).online;
  protected readonly tasks = signal<TaskRow[]>([]);
  protected readonly confirming = signal<string | null>(null);

  constructor() {
    effect(() => {
      const month = this.month();
      untracked(() => void this.load(month));
    });
  }

  private async load(month: Day): Promise<void> {
    try {
      const rows = await this.api.loadTasks(month);
      if (this.month() === month) this.tasks.set(rows);
    } catch {
      this.tasks.set([]);
    }
  }

  protected async add(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    try {
      const task = await this.api.addTask(title, this.month());
      this.tasks.update((list) => [...list, task]);
      input.value = '';
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }

  protected async toggle(t: TaskRow): Promise<void> {
    const done = !t.done_at;
    try {
      await this.api.setTaskDone(t.id, done);
      this.tasks.update((list) => list.map((x) => (x.id === t.id ? { ...x, done_at: done ? new Date().toISOString() : null } : x)));
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }

  protected async remove(t: TaskRow): Promise<void> {
    if (this.confirming() !== t.id) return this.confirming.set(t.id);
    this.confirming.set(null);
    try {
      await this.api.deleteTask(t.id);
      this.tasks.update((list) => list.filter((x) => x.id !== t.id));
    } catch {
      this.toast.show(SAVE_FAILED);
    }
  }
}
