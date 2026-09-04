import { Component, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { ThemeService, type ThemePreference } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';

interface ThemeOption {
  value: ThemePreference;
  label: string;
}

@Component({
  selector: 'app-settings-page',
  imports: [EscClearableDirective],
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  private readonly configService = inject(ConfigService);
  private readonly themeService = inject(ThemeService);
  private readonly toast = inject(ToastService);

  protected readonly apiBaseUrl = signal(this.configService.apiBaseUrl());
  protected readonly userName = signal(this.configService.userName());
  protected readonly exportTimezone = signal(this.configService.exportTimezone());
  protected readonly themePreference = signal(this.configService.theme());

  protected readonly themeOptions: ThemeOption[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'Match device' },
  ];

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

  protected onUserNameInput(value: string): void {
    this.userName.set(value);
  }

  protected clearUserName(): void {
    this.userName.set('');
  }

  protected saveUserName(): void {
    this.configService.setUserName(this.userName());
    this.toast.success('Name saved.');
  }

  protected onExportTimezoneInput(value: string): void {
    this.exportTimezone.set(value);
  }

  protected clearExportTimezone(): void {
    this.exportTimezone.set('');
  }

  protected saveExportTimezone(): void {
    const value = this.exportTimezone().trim();
    // Empty is valid on purpose, same as the API base URL field: it means "no preference",
    // and the export endpoint falls back to UTC when the timezone param is omitted/empty.
    if (value.length > 0 && !isLikelyIanaTimezone(value)) {
      this.toast.error(
        'Enter a valid IANA timezone name (e.g. America/Sao_Paulo), or leave it empty for UTC.',
      );
      return;
    }

    this.configService.setExportTimezone(value);
    this.toast.success('Export timezone saved.');
  }

  /** Unlike the other fields, theme has no Save button - selecting it is the save. */
  protected selectTheme(preference: ThemePreference): void {
    this.themePreference.set(preference);
    this.configService.setTheme(preference);
    this.themeService.apply(preference);
    this.toast.success('Theme updated.');
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

// Best-effort only - the API is the real authority on valid IANA names
// (TimeZoneInfo.TryFindSystemTimeZoneById), and rejects an unrecognized one with a 400 when the
// export is actually requested. This just catches obviously wrong input early (e.g. "brt", a
// bare offset, or a typo missing the "/").
function isLikelyIanaTimezone(value: string): boolean {
  return value === 'UTC' || /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/.test(value);
}
