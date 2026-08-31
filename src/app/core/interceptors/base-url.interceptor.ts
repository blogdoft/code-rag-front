import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ConfigService } from '../services/config.service';

/** Prefixes relative /api requests with the user-configured API base URL. */
export const baseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api')) {
    return next(req);
  }

  const apiBaseUrl = inject(ConfigService).apiBaseUrl();
  return next(req.clone({ url: `${apiBaseUrl}${req.url}` }));
};
