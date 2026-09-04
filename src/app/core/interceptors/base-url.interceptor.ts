import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ConfigService } from '../services/config.service';

/**
 * Prefixes relative /api requests with the user-configured API base URL. /version is included
 * even though it isn't /api-prefixed - the API deliberately serves it unversioned (see
 * .specs/2026-09-04-version-display.md), but it's still a CodeRAG API endpoint that needs the
 * same base-URL treatment as everything under /api.
 */
export const baseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api') && req.url !== '/version') {
    return next(req);
  }

  const apiBaseUrl = inject(ConfigService).apiBaseUrl();
  return next(req.clone({ url: `${apiBaseUrl}${req.url}` }));
};
