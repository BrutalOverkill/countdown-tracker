import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({ selector: 'app-food-page', changeDetection: ChangeDetectionStrategy.OnPush, template: `<h1 class="text-2xl font-extrabold">Food</h1>` })
export class FoodPage {}
