import { DestroyRef, inject, Injectable, InjectionToken } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** Reloads the page; a token so tests can watch it. */
export const RELOAD = new InjectionToken<() => void>('RELOAD', { providedIn: 'root', factory: () => () => location.reload() });

const typing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
};

/**
 * Picks up a new deploy by itself: checks whenever the app is opened or brought back, and switches
 * to a downloaded version at once — unless something is being typed, then on the next return.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private readonly sw = inject(SwUpdate);
  private readonly reload = inject(RELOAD);
  private ready = false;

  constructor() {
    if (!this.sw.isEnabled) return;
    const updates = this.sw.versionUpdates.subscribe((e) => {
      if (e.type !== 'VERSION_READY') return;
      this.ready = true;
      this.applyIfIdle();
    });
    const broken = this.sw.unrecoverable.subscribe(() => this.reload());
    const onVisible = () => {
      if (document.hidden) return;
      if (this.ready) this.applyIfIdle();
      else void this.sw.checkForUpdate().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      updates.unsubscribe();
      broken.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  private applyIfIdle(): void {
    if (typing()) return;
    void this.sw.activateUpdate().then(this.reload, this.reload);
  }
}
