import { Injectable, signal } from '@angular/core';

export const SAVE_FAILED = "Couldn't save — check your connection";
export const OFFLINE = "Offline — changes won't save";

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(text: string): void {
    this.message.set(text);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(null), 3500);
  }
}
