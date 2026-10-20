import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';
import type { DayScore } from '../../domain/scoring';
import type { ChecklistVm } from './today.vm';

@Component({
  selector: 'app-score-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <div class="fixed inset-0 z-40 flex items-end justify-center lg:items-center">
      <div data-testid="backdrop" class="absolute inset-0 bg-black/60 backdrop-blur-sm" (click)="closed.emit()"></div>
      <section role="dialog" aria-modal="true" aria-label="What's left today"
        class="card sheet relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-b-none !p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] lg:rounded-b-[22px]">
        <header class="mb-3 flex items-center justify-between gap-2">
          <div>
            <p class="label text-muted">What's left today</p>
            <p class="text-sm font-bold">{{ score().done }} of {{ score().total }} done</p>
          </div>
          <button #close type="button" class="btn-quiet press !px-3" aria-label="Close" (click)="closed.emit()">✕</button>
        </header>
        @if (checklist().left.length) {
          <p class="label mb-1 text-muted">Left</p>
          <ul>
            @for (i of checklist().left; track i.habit.id) {
              <li class="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
                <span class="min-w-0 text-sm">
                  {{ i.habit.emoji }} {{ i.habit.name }}
                  @if (i.detail) {
                    <span class="muted block text-xs">{{ i.detail }}</span>
                  }
                </span>
                @switch (i.action) {
                  @case ('tick') {
                    <button type="button" class="btn press shrink-0 !py-1.5 text-xs" [attr.aria-label]="'Tick ' + i.habit.name" [disabled]="disabled()" (click)="toggle.emit(i.habit.id)">Tick</button>
                  }
                  @case ('train') {
                    <button type="button" class="btn press shrink-0 !py-1.5 text-xs" aria-label="Trained today" [disabled]="disabled()" (click)="trained.emit()">Trained today ✓</button>
                  }
                  @default {
                    <span class="shrink-0 text-xs text-muted" aria-hidden="true">⚡</span>
                  }
                }
              </li>
            }
          </ul>
        } @else {
          <p class="py-2 font-bold">⭐ Nothing left — it's a Perfect Day!</p>
        }
        @if (checklist().done.length) {
          <section class="mt-3 border-t border-line pt-2" aria-label="Done">
            <p class="label mb-1 text-muted">Done</p>
            <p class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
              @for (i of checklist().done; track i.habit.id) {
                <span>✓ {{ i.habit.emoji }} {{ i.habit.name }}</span>
              }
            </p>
          </section>
        }
      </section>
    </div>
  `,
})
export class ScoreSheet {
  readonly score = input.required<DayScore>();
  readonly checklist = input.required<ChecklistVm>();
  readonly disabled = input(false);
  readonly toggle = output<string>();
  readonly trained = output<void>();
  readonly closed = output<void>();
  private readonly close = viewChild.required<ElementRef<HTMLButtonElement>>('close');

  constructor() {
    // Focus moves into the popup so Escape, Tab and screen readers start there.
    afterNextRender(() => this.close().nativeElement.focus());
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.closed.emit();
  }
}
