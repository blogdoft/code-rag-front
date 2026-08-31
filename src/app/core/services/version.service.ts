import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, type Observable } from 'rxjs';
import { SUPPRESS_ERROR_TOAST } from '../interceptors/error-toast.interceptor';

interface VersionDto {
  version: string;
}

/**
 * /version.json is a static asset, not a CodeRAG API endpoint - it's generated at
 * container start from the APP_VERSION baked into the Docker image (see
 * .eng/docker/Dockerfile), so the same compiled bundle reports whatever tag it was
 * actually built from instead of a value hardcoded into the JS at build time.
 */
@Injectable({ providedIn: 'root' })
export class VersionService {
  private readonly http = inject(HttpClient);

  get(): Observable<string> {
    return this.http
      .get<VersionDto>('/version.json', { context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true) })
      .pipe(
        map((dto) => dto.version),
        catchError(() => of('')),
      );
  }
}
