import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, type Observable } from 'rxjs';
import { SUPPRESS_ERROR_TOAST } from '../interceptors/error-toast.interceptor';

interface ApiVersionDto {
  version: string | null;
}

/**
 * Fetches the running CodeRAG API's own build version from GET /version - deliberately
 * unversioned (no /api/v1 prefix) by the API's own design, see
 * .specs/2026-09-04-version-display.md for why base-url.interceptor.ts and the dev/prod proxies
 * special-case this one path. Despite being unversioned, it's not unauthenticated: when Keycloak
 * is enabled the API 401s this endpoint the same as /api routes, so auth.interceptor.ts attaches
 * the token here too - without it this silently degrades to '' below and the nav sidebar just
 * omits the API version.
 */
@Injectable({ providedIn: 'root' })
export class ApiVersionService {
  private readonly http = inject(HttpClient);

  get(): Observable<string> {
    return this.http
      .get<ApiVersionDto>('/version', {
        context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
      })
      .pipe(
        map((dto) => dto.version ?? ''),
        catchError(() => of('')),
      );
  }
}
