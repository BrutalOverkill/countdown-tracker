import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Clock } from './clock';
import { reducedMotion } from './motion';
import { storageGet, storageSet } from './storage';
import { effectiveTheme, nextSwitch, parseOverride, parsePref, type Theme, type ThemeOverride, type ThemePref } from './theme';

const PREF = 'theme-pref';
const OVERRIDE = 'theme-override';
const LAST = 'theme-last';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly clock = inject(Clock);
  readonly pref = signal<ThemePref>(parsePref(storageGet(PREF)));
  private readonly override = signal<ThemeOverride | null>(parseOverride(storageGet(OVERRIDE)));
  readonly theme = computed<Theme>(() => effectiveTheme(this.pref(), this.override(), this.clock.instant()));

  constructor() {
    effect(() => applyTheme(this.theme()));
  }

  setPref(pref: ThemePref): void {
    this.pref.set(pref);
    storageSet(PREF, pref);
    this.override.set(null);
    storageSet(OVERRIDE, '');
  }

  /** Under Auto: flip until the next 06:00 / 19:00 switch-over. Under a fixed preference: switch it. */
  toggle(): void {
    const next: Theme = this.theme() === 'bento' ? 'matrix' : 'bento';
    if (this.pref() !== 'auto') return this.setPref(next);
    const override: ThemeOverride = { theme: next, until: nextSwitch(this.clock.instant()).toISOString() };
    this.override.set(override);
    storageSet(OVERRIDE, JSON.stringify(override));
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const swap = () => {
    root.dataset['theme'] = theme;
    storageSet(LAST, theme);
  };
  if (root.dataset['theme'] === theme) return swap();
  const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
  if (doc.startViewTransition && !reducedMotion()) doc.startViewTransition(swap);
  else swap();
}
