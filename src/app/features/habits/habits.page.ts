import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({ selector: 'app-habits-page', changeDetection: ChangeDetectionStrategy.OnPush, template: `<h1 class="text-2xl font-extrabold">Habits</h1>` })
export class HabitsPage {}
