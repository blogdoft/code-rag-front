import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, type Observable } from 'rxjs';
import { SUPPRESS_ERROR_TOAST } from '../interceptors/error-toast.interceptor';

export interface AuthConfig {
  enabled: boolean;
  url: string;
  realm: string;
  clientId: string;
}

const DISABLED_CONFIG: AuthConfig = { enabled: false, url: '', realm: '', clientId: '' };

/**
 * auth-config.json is a static asset generated at container start from KEYCLOAK_* env vars (see
 * .eng/docker/41-generate-auth-config.sh), same mechanism as version.json (CLAUDE.md's GET
 * /version bullet) - fetched as a base-href-relative path so it resolves the same way in ng serve
 * and behind the production sub-path. Whether Keycloak is required is a per-deployment decision,
 * not a per-user one, so this deliberately bypasses ConfigService/Settings entirely (see
 * .specs/2026-09-21-keycloak-conditional-login.md).
 */
@Injectable({ providedIn: 'root' })
export class AuthConfigService {
  private readonly http = inject(HttpClient);

  get(): Observable<AuthConfig> {
    return this.http
      .get<AuthConfig>('auth-config.json', {
        context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
      })
      .pipe(
        map((dto) => ({
          enabled: dto.enabled === true,
          url: dto.url ?? '',
          realm: dto.realm ?? '',
          clientId: dto.clientId ?? '',
        })),
        catchError((err) => {
          // A deployment that meant to require Keycloak but has a missing/broken auth-config.json
          // should be diagnosable - unlike VersionService's silent degrade, this fallback is loud.
          console.error('Failed to load auth-config.json; treating Keycloak as disabled.', err);
          return of(DISABLED_CONFIG);
        }),
      );
  }
}
