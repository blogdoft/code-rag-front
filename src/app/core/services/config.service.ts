import { Injectable, signal } from '@angular/core';
import type { ThemePreference } from './theme.service';

const API_BASE_URL_KEY = 'code-rag.apiBaseUrl';
/**
 * Empty by default so `/api` requests stay same-origin (see baseUrlInterceptor)
 * and get routed through whatever's actually serving the app — the CLI dev-server
 * proxy locally, or a reverse proxy in production. Pointing this straight at
 * `https://code-rag-api.home.arpa` by default would make the browser call that
 * host directly and hit its self-signed certificate, which no app code can
 * bypass. Users who don't have a proxy in front of a mismatched-origin API can
 * still set an absolute URL here via the Settings screen.
 */
const DEFAULT_API_BASE_URL = '';

const USER_NAME_KEY = 'code-rag.userName';
const DEFAULT_USER_NAME = '';

const EXPORT_TIMEZONE_KEY = 'code-rag.exportTimezone';
/**
 * IANA timezone name used to render `created_at` in the feedback CSV export - see
 * code-rag-api's .specs/code-query-feedback-timezone.md. Defaults to America/Sao_Paulo
 * (not UTC) because that's this app's primary audience; Brazil has 3 other official
 * zones (America/Manaus, America/Rio_Branco, America/Noronha), so this is still just a
 * default, changeable here.
 */
const DEFAULT_EXPORT_TIMEZONE = 'America/Sao_Paulo';

const THEME_KEY = 'code-rag.theme';
const DEFAULT_THEME: ThemePreference = 'system';
const VALID_THEMES: ThemePreference[] = ['light', 'dark', 'system'];

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly apiBaseUrlSignal = signal(this.readApiBaseUrl());
  private readonly userNameSignal = signal(this.readUserName());
  private readonly exportTimezoneSignal = signal(this.readExportTimezone());
  private readonly themeSignal = signal(this.readTheme());

  readonly apiBaseUrl = this.apiBaseUrlSignal.asReadonly();
  readonly userName = this.userNameSignal.asReadonly();
  readonly exportTimezone = this.exportTimezoneSignal.asReadonly();
  readonly theme = this.themeSignal.asReadonly();

  setApiBaseUrl(value: string): void {
    const trimmed = value.trim().replace(/\/+$/, '');
    localStorage.setItem(API_BASE_URL_KEY, trimmed);
    this.apiBaseUrlSignal.set(trimmed);
  }

  setUserName(value: string): void {
    const trimmed = value.trim();
    localStorage.setItem(USER_NAME_KEY, trimmed);
    this.userNameSignal.set(trimmed);
  }

  setExportTimezone(value: string): void {
    const trimmed = value.trim();
    localStorage.setItem(EXPORT_TIMEZONE_KEY, trimmed);
    this.exportTimezoneSignal.set(trimmed);
  }

  setTheme(value: ThemePreference): void {
    localStorage.setItem(THEME_KEY, value);
    this.themeSignal.set(value);
  }

  private readApiBaseUrl(): string {
    return localStorage.getItem(API_BASE_URL_KEY) ?? DEFAULT_API_BASE_URL;
  }

  private readUserName(): string {
    return localStorage.getItem(USER_NAME_KEY) ?? DEFAULT_USER_NAME;
  }

  private readExportTimezone(): string {
    return localStorage.getItem(EXPORT_TIMEZONE_KEY) ?? DEFAULT_EXPORT_TIMEZONE;
  }

  private readTheme(): ThemePreference {
    const stored = localStorage.getItem(THEME_KEY) as ThemePreference | null;
    return stored && VALID_THEMES.includes(stored) ? stored : DEFAULT_THEME;
  }
}
