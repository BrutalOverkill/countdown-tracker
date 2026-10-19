import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'today' },
      { path: 'today', loadComponent: () => import('./features/today/today.page').then((m) => m.TodayPage) },
      { path: 'habits', loadComponent: () => import('./features/habits/habits.page').then((m) => m.HabitsPage) },
      { path: 'food', loadComponent: () => import('./features/food/food.page').then((m) => m.FoodPage) },
      { path: 'settings', loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage) },
      { path: 'report/:id', loadComponent: () => import('./features/report/report.page').then((m) => m.ReportPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
