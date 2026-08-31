import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

  init(): void {
    this.applyTheme(this.media?.matches ?? false);
    this.media?.addEventListener('change', (event) => this.applyTheme(event.matches));
  }

  private applyTheme(isDark: boolean): void {
    this.document.documentElement.classList.toggle('dark', isDark);
  }
}
