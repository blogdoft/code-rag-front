import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { KeycloakAuthService } from '../services/keycloak-auth.service';

/**
 * Attaches the Keycloak access token to /api requests when Keycloak is enabled - a no-op
 * (request passed through unchanged) when it's disabled, so this has zero effect on today's
 * default deployment. /version is deliberately excluded (unauthenticated diagnostic endpoint),
 * same predicate base-url.interceptor.ts uses.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const keycloakAuth = inject(KeycloakAuthService);
  if (!req.url.startsWith('/api') || !keycloakAuth.enabled()) {
    return next(req);
  }

  const token = keycloakAuth.token();
  if (!token) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
