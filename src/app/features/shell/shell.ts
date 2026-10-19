import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Online } from '../../core/online';
import { TrackerStore } from '../../data/tracker.store';
import { TabBar } from './tab-bar';
import { Toast } from './toast';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, TabBar, Toast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex min-h-dvh max-w-5xl pt-[env(safe-area-inset-top)] lg:gap-6 lg:px-6">
      <app-tab-bar />
      <main class="min-w-0 flex-1 px-3 pb-28 pt-3 lg:pb-6">
        @if (!online.online() && store.loaded()) {
          <p role="status" class="mb-3 rounded-xl bg-raised px-3 py-2 text-center text-sm font-semibold text-count">Offline — changes won't save</p>
        }
        @switch (store.status()) {
          @case ('ready') {
            <router-outlet />
          }
          @case ('error') {
            <div class="card mt-6 text-center" role="alert">
              <p class="font-bold">{{ online.online() ? "Couldn't load your data" : "You're offline — connect to load your data" }}</p>
              <button type="button" class="btn mt-3" (click)="retry()">Retry</button>
            </div>
          }
          @default {
            <p class="muted p-6 text-center">Loading…</p>
          }
        }
      </main>
    </div>
    <app-toast />
  `,
})
export class Shell {
  protected readonly store = inject(TrackerStore);
  protected readonly online = inject(Online);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    this.retry();
    effect(() => {
      // Signed out or the session expired: drop the previous account's data before anything else renders.
      if (this.auth.session() === null) {
        this.store.reset();
        void this.router.navigateByUrl('/login');
      }
    });
    const onVisible = () => {
      if (!document.hidden) void this.store.refreshIfStale();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', onVisible));
  }

  protected retry(): void {
    const userId = this.auth.userId();
    if (userId) void this.store.load(userId);
  }
}
