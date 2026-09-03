import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
  },
  {
    path: 'rag',
    loadComponent: () => import('./features/code-search/code-search-page').then((m) => m.CodeSearchPage),
  },
  {
    path: 'projects',
    loadComponent: () => import('./features/projects/projects-page').then((m) => m.ProjectsPage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage),
  },
  {
    path: 'reports',
    loadComponent: () => import('./features/reports/feedback-stats-page').then((m) => m.FeedbackStatsPage),
  },
  { path: '**', redirectTo: '' },
];
