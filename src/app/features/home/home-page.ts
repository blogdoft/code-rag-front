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
    {
      label: 'Upload',
      path: '/uploads',
      description: 'Send a CIIR file to be indexed into a project.',
    },
    {
      label: 'Documents',
      path: '/documents',
      description: 'Register documents and send their versions to be processed.',
    },
    {
      label: 'Master Data',
      path: '/master-data',
      description: 'Manage the document types and languages used to classify documents.',
    },
    { label: 'Reports', path: '/reports', description: 'Review feedback and usage stats.' },
    { label: 'Settings', path: '/settings', description: 'Configure application preferences.' },
  ];
}
