import { DestroyRef, inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Online {
  readonly online = signal(navigator.onLine);

  constructor() {
    const update = () => this.online.set(navigator.onLine);
    addEventListener('online', update);
    addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    });
  }
}
