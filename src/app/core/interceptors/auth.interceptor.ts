import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { KeycloakAuthService } from '../services/keycloak-auth.service';

/**
 * Attaches the Keycloak access token to /api requests when Keycloak is enabled - a no-op
 * (request passed through unchanged) when it's disabled, so this has zero effect on today's
 * default deployment. /version is included too, same predicate base-url.interceptor.ts uses -
 * despite CLAUDE.md's "unversioned and unauthenticated" note (still true for the endpoint's own
 * design), the deployed code-ciir-api now answers GET /version with 401 + `WWW-Authenticate:
 * Bearer` when Keycloak is enabled, same as every /api route, so ApiVersionService's request
 * needs the token or it silently degrades to '' via its own catchError.
 *
 * A 401 on one of those requests means the token is no longer accepted by the API. The token is
 * force-refreshed once and the request retried transparently; only if the refresh fails or the
 * retry still answers 401 is the user sent back through the Keycloak login (see
 * KeycloakAuthService.login) - that's a full-page redirect, so in-progress input is lost, which is
 * why it's the last resort. The error still propagates to the caller; errorToastInterceptor skips
 * its toast for it since the page is about to navigate away.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const keycloakAuth = inject(KeycloakAuthService);
  if ((!req.url.startsWith('/api') && req.url !== '/version') || !keycloakAuth.enabled()) {
    return next(req);
  }

  const withToken = (token: string | undefined) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  const failToLogin = (error: unknown) => {
    keycloakAuth.login();
    return throwError(() => error);
  };

  return next(withToken(keycloakAuth.token())).pipe(
    catchError((error: unknown) => {
      if (!isUnauthorized(error)) {
        return throwError(() => error);
      }
      return from(keycloakAuth.refreshToken()).pipe(
        switchMap((token) =>
          token
            ? next(withToken(token)).pipe(
                catchError((retryError: unknown) =>
                  isUnauthorized(retryError)
                    ? failToLogin(retryError)
                    : throwError(() => retryError),
                ),
              )
            : failToLogin(error),
        ),
      );
    }),
  );
};

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}
