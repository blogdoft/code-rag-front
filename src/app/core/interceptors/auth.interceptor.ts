import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { KeycloakAuthService } from '../services/keycloak-auth.service';

/**
 * Attaches the Keycloak access token to /api requests when Keycloak is enabled - a no-op
 * (request passed through unchanged) when it's disabled, so this has zero effect on today's
 * default deployment. /version is included too, same predicate base-url.interceptor.ts uses -
 * despite CLAUDE.md's "unversioned and unauthenticated" note (still true for the endpoint's own
 * design), the deployed code-ciir-api now answers GET /version with 401 + `WWW-Authenticate:
 * Bearer` when Keycloak is enabled, same as every /api route, so ApiVersionService's request
 * needs the token or it silently degrades to '' via its own catchError.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const keycloakAuth = inject(KeycloakAuthService);
  if ((!req.url.startsWith('/api') && req.url !== '/version') || !keycloakAuth.enabled()) {
    return next(req);
  }

  const token = keycloakAuth.token();
  if (!token) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
