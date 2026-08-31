import { Component, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { ToastService } from '../../core/services/toast.service';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';

@Component({
  selector: 'app-settings-page',
  imports: [EscClearableDirective],
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  private readonly configService = inject(ConfigService);
  private readonly toast = inject(ToastService);

  protected readonly apiBaseUrl = signal(this.configService.apiBaseUrl());

  protected onInput(value: string): void {
    this.apiBaseUrl.set(value);
  }

  protected clear(): void {
    this.apiBaseUrl.set('');
  }

  protected save(): void {
    const value = this.apiBaseUrl().trim();
    // Empty is valid on purpose: it means "call /api on this same origin",
    // letting a proxy in front of the app handle routing to the real API.
    if (value.length > 0 && !isValidHttpUrl(value)) {
      this.toast.error('Enter a valid http(s) URL, or leave it empty to use this same origin.');
      return;
    }

    this.configService.setApiBaseUrl(value);
    this.toast.success('API base URL saved.');
  }
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
