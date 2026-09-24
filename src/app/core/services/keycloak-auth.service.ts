import { Injectable, inject, signal } from '@angular/core';
import Keycloak from 'keycloak-js';
import { firstValueFrom } from 'rxjs';
import { AuthConfigService } from './auth-config.service';

/**
 * Wraps keycloak-js so the rest of the app only deals in signals/methods, not the adapter's own
 * API. See .specs/2026-09-21-keycloak-conditional-login.md for the design (why login-required +
 * PKCE, why checkLoginIframe is off, why disabled is the fallback).
 */
@Injectable({ providedIn: 'root' })
export class KeycloakAuthService {
  private readonly authConfigService = inject(AuthConfigService);
  private keycloak?: Keycloak;
  private loginRedirecting = false;
  private refreshing?: Promise<string | undefined>;

  private readonly enabledSignal = signal(false);
  private readonly usernameSignal = signal<string | undefined>(undefined);

  readonly enabled = this.enabledSignal.asReadonly();
  readonly username = this.usernameSignal.asReadonly();

  /** Resolves once the app is safe to render: immediately if disabled, after login if enabled. */
  async init(): Promise<void> {
    const config = await firstValueFrom(this.authConfigService.get());
    if (!config.enabled) {
      return;
    }

    const keycloak = new Keycloak({
      url: config.url,
      realm: config.realm,
      clientId: config.clientId,
    });
    this.keycloak = keycloak;

    await keycloak.init({
      onLoad: 'login-required',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    });

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch((err) => console.error('Keycloak token refresh failed', err));
    };

    this.enabledSignal.set(true);
    this.usernameSignal.set(keycloak.tokenParsed?.['preferred_username']);
  }

  token(): string | undefined {
    return this.keycloak?.token;
  }

  /**
   * Forces a token refresh (ignoring the token's remaining validity) and resolves with the new
   * token, or undefined if the refresh failed (e.g. the SSO session itself has expired).
   * Concurrent callers share one in-flight refresh.
   */
  refreshToken(): Promise<string | undefined> {
    const keycloak = this.keycloak;
    if (!keycloak) {
      return Promise.resolve(undefined);
    }
    this.refreshing ??= keycloak
      .updateToken(-1)
      .then(() => keycloak.token)
      .catch(() => undefined)
      .finally(() => {
        this.refreshing = undefined;
      });
    return this.refreshing;
  }

  /**
   * Sends the user back through the Keycloak login page (used when the API answers 401, i.e. the
   * session/token is no longer accepted). Idempotent: concurrent 401s from parallel requests
   * trigger a single redirect.
   */
  login(): void {
    if (!this.keycloak || this.loginRedirecting) {
      return;
    }
    this.loginRedirecting = true;
    this.keycloak.login().catch((err) => {
      this.loginRedirecting = false;
      console.error('Keycloak login redirect failed', err);
    });
  }

  logout(): void {
    this.keycloak?.logout();
  }
}
