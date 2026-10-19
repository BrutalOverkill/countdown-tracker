import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-tab-bar',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <!-- Floating pill on the phone (icons in Bento, uppercase words in Matrix); a sidebar on wide screens. -->
    <nav aria-label="Main"
      class="fixed inset-x-0 bottom-0 z-20 flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)]
             lg:static lg:block lg:w-48 lg:shrink-0 lg:pb-0 lg:pt-6">
      <ul class="glass-bar flex gap-1 rounded-full px-2 py-1.5 lg:flex-col lg:rounded-2xl">
        @for (tab of tabs; track tab.path) {
          <li>
            <a [routerLink]="tab.path" routerLinkActive="is-active" ariaCurrentWhenActive="page"
              class="tab press flex items-center gap-1.5 rounded-full px-3 py-2 text-xs lg:rounded-xl lg:text-sm"><span class="text-base matrix:hidden" aria-hidden="true">{{ tab.icon }}</span>{{ tab.label }}</a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class TabBar {
  protected readonly tabs = [
    { path: '/today', label: 'Today', icon: '◉' },
    { path: '/habits', label: 'Habits', icon: '◔' },
    { path: '/food', label: 'Food', icon: '🍽' },
    { path: '/settings', label: 'Settings', icon: '⚙' },
  ];
}
