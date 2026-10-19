import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { appDayOf } from '@shared/days';
import { FUNCTIONS_URL, SHORTCUT_DOCS_URL } from '../../core/config';
import { dayLabel, timeOf } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { TrackerStore } from '../../data/tracker.store';

@Component({
  selector: 'app-shortcut-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="iPhone Shortcut">
      <fieldset class="m-0 min-w-0 border-0 p-0" [disabled]="store.saving()">
      <p class="label mb-1 text-muted">iPhone Shortcut</p>
      <p class="flex justify-between text-sm"><span>Status</span>
        <span [class.text-steps]="!!store.lastSyncAt()" [class.text-muted]="!store.lastSyncAt()">{{ status() }}</span></p>
      @if (token(); as t) {
        <div class="mt-2 rounded-xl bg-raised p-2">
          <p class="text-xs font-semibold">Your new token — shown once</p>
          <div class="mt-1 flex gap-1.5">
            <input class="field font-mono !text-xs" readonly [value]="t" aria-label="Sync token" />
            <button type="button" class="btn-quiet" (click)="copy(t)">{{ copied() === t ? 'Copied' : 'Copy' }}</button>
          </div>
          <p class="muted mt-1">Paste it into <b>both</b> shortcuts: Countdown Sync and Food Guard.</p>
        </div>
      }
      <button type="button" class="btn-quiet mt-2 w-full" (click)="rotate()">{{ rotateLabel() }}</button>
      <div class="mt-2 space-y-1 text-xs">
        @for (u of urls; track u.label) {
          <div class="flex items-center gap-1.5">
            <span class="w-20 shrink-0 text-muted">{{ u.label }}</span>
            <code class="min-w-0 flex-1 truncate">{{ u.url }}</code>
            <button type="button" class="underline" (click)="copy(u.url)">{{ copied() === u.url ? 'Copied' : 'Copy' }}</button>
          </div>
        }
      </div>
      </fieldset>
      <a class="mt-2 inline-block text-sm font-semibold text-routine" [href]="docsUrl" target="_blank" rel="noopener">Setup steps →</a>
    </section>
  `,
})
export class ShortcutSection {
  protected readonly store = inject(TrackerStore);
  private readonly toast = inject(ToastService);
  protected readonly docsUrl = SHORTCUT_DOCS_URL;
  protected readonly urls = [
    { label: 'Sync URL', url: `${FUNCTIONS_URL}/sync` },
    { label: 'Guard URL', url: `${FUNCTIONS_URL}/food-guard` },
  ];
  protected readonly token = signal<string | null>(null);
  protected readonly copied = signal<string | null>(null);
  protected readonly confirming = signal(false);

  protected readonly status = computed(() => {
    const at = this.store.lastSyncAt();
    return at ? `● Connected · ${dayLabel(appDayOf(new Date(at)))}, ${timeOf(at)}` : 'Never synced';
  });

  protected readonly rotateLabel = computed(() => {
    if (!this.store.hasToken() && !this.token()) return 'Generate token';
    return this.confirming() ? 'Tap again — the old token stops working' : 'Rotate token';
  });

  protected async rotate(): Promise<void> {
    if ((this.store.hasToken() || this.token()) && !this.confirming()) return this.confirming.set(true);
    this.confirming.set(false);
    const t = await this.store.rotateToken();
    if (t) this.token.set(t);
  }

  protected copy(text: string): void {
    navigator.clipboard?.writeText(text).then(
      () => this.copied.set(text),
      () => this.toast.show('Copy failed — select it and copy by hand'),
    );
  }
}
