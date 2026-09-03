import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface QuickLink {
  label: string;
  path: string;
  description: string;
}

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  templateUrl: './home-page.html',
})
export class HomePage {
  protected readonly quickLinks: readonly QuickLink[] = [
    { label: 'Rag', path: '/rag', description: 'Ask questions about your codebase.' },
    { label: 'Projects', path: '/projects', description: 'Manage indexed projects.' },
    { label: 'Reports', path: '/reports', description: 'Review feedback and usage stats.' },
    { label: 'Settings', path: '/settings', description: 'Configure application preferences.' },
  ];
}
