import { HttpContextToken, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import type { ProblemDetails } from '../models/problem-details';
import { ToastService } from '../services/toast.service';

const GENERIC_ERROR_MESSAGE = 'Something went wrong talking to the API. Please try again.';

/**
 * Opt out of the toast for a request whose failure isn't worth interrupting the user
 * over - e.g. VersionService's best-effort fetch of /version.json.
 */
export const SUPPRESS_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/** Surfaces every failed API call as a toast, per SPEC.md's "toast for success or failure". */
export const errorToastInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!req.context.get(SUPPRESS_ERROR_TOAST)) {
        toast.error(extractMessage(error));
      }
      return throwError(() => error);
    }),
  );
};

function extractMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return GENERIC_ERROR_MESSAGE;
  }

  const problem = error.error as ProblemDetails | null;
  return problem?.detail || problem?.title || GENERIC_ERROR_MESSAGE;
}
