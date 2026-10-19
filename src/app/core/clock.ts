import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { appDayOf, istMinutesOf } from '@shared/days';

// End-to-end tests pin the app's time through this global so Supabase auth keeps using the real clock.
function currentTime(): Date {
  const pinned = (globalThis as { __countdownNow?: string }).__countdownNow;
  return pinned ? new Date(pinned) : new Date();
}

/** "Now" as signals; `today` is the app day (rolls at 4:00 AM IST), `minute` the IST clock minute. */
@Injectable({ providedIn: 'root' })
export class Clock {
  private readonly now = signal(currentTime());
  readonly instant = this.now.asReadonly();
  readonly today = computed(() => appDayOf(this.now()));
  readonly minute = computed(() => istMinutesOf(this.now()));

  constructor() {
    const tick = () => this.now.set(currentTime());
    const timer = setInterval(tick, 20_000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }
}
