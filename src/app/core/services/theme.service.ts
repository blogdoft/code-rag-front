import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

  /**
   * Applies `preference` to the document, replacing any previously registered OS-theme
   * listener - safe to call again whenever the user picks a different preference at runtime,
   * not just once at bootstrap.
   */
  apply(preference: ThemePreference): void {
    if (this.mediaListener) {
      this.media?.removeEventListener('change', this.mediaListener);
      this.mediaListener = null;
    }

    if (preference === 'system') {
      this.applyDark(this.media?.matches ?? false);
      this.mediaListener = (event) => this.applyDark(event.matches);
      this.media?.addEventListener('change', this.mediaListener);
      return;
    }

    this.applyDark(preference === 'dark');
  }

  private applyDark(isDark: boolean): void {
    this.document.documentElement.classList.toggle('dark', isDark);
  }
}
