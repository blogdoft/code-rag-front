import { Injectable, signal } from '@angular/core';

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

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly apiBaseUrlSignal = signal(this.readApiBaseUrl());
  private readonly userNameSignal = signal(this.readUserName());

  readonly apiBaseUrl = this.apiBaseUrlSignal.asReadonly();
  readonly userName = this.userNameSignal.asReadonly();

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

  private readApiBaseUrl(): string {
    return localStorage.getItem(API_BASE_URL_KEY) ?? DEFAULT_API_BASE_URL;
  }

  private readUserName(): string {
    return localStorage.getItem(USER_NAME_KEY) ?? DEFAULT_USER_NAME;
  }
}
