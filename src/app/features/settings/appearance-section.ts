import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { ThemePref } from '../../core/theme';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'app-appearance-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tile" aria-label="Appearance">
      <p class="label mb-2">Appearance</p>
      <div class="flex gap-1 rounded-full bg-raised p-1 text-sm font-bold matrix:rounded-xl" role="radiogroup" aria-label="Theme">
        @for (o of options; track o.id) {
          <button type="button" role="radio" class="press flex-1 rounded-full py-1.5 matrix:rounded-lg" [attr.aria-checked]="theme.pref() === o.id"
            [class]="theme.pref() === o.id ? 'bg-accent text-black' : 'text-muted'" (click)="theme.setPref(o.id)">{{ o.label }}</button>
        }
      </div>
      <p class="muted mt-2">Auto uses Bento from 6 AM and Matrix from 7 PM; the ◐ button on Today overrides it until the next switch. Saved on this device.</p>
    </section>
  `,
})
export class AppearanceSection {
  protected readonly theme = inject(ThemeService);
  protected readonly options: { id: ThemePref; label: string }[] = [
    { id: 'auto', label: 'Auto' },
    { id: 'bento', label: 'Bento' },
    { id: 'matrix', label: 'Matrix' },
  ];
}
