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
        reportError(error, toast);
      }
      return throwError(() => error);
    }),
  );
};

function reportError(error: unknown, toast: ToastService): void {
  if (!(error instanceof HttpErrorResponse)) {
    toast.error(GENERIC_ERROR_MESSAGE);
    return;
  }

  if (error.error instanceof Blob) {
    // responseType: 'blob' requests (e.g. the feedback CSV export) also deliver error bodies as a
    // Blob, even when the server sent application/problem+json for this response - read + parse it.
    error.error
      .text()
      .then((text) => toast.error(pickMessage(parseProblemSafely(text))))
      .catch(() => toast.error(GENERIC_ERROR_MESSAGE));
    return;
  }

  toast.error(pickMessage(error.error as ProblemDetails | null));
}

function pickMessage(problem: ProblemDetails | null): string {
  return problem?.detail || problem?.title || GENERIC_ERROR_MESSAGE;
}

function parseProblemSafely(text: string): ProblemDetails | null {
  try {
    return JSON.parse(text) as ProblemDetails;
  } catch {
    return null;
  }
}
