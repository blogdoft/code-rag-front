import { HttpClient, HttpContext, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  exhaustMap,
  filter,
  map,
  of,
  retry,
  switchMap,
  takeWhile,
  throwError,
  timer,
  type Observable,
} from 'rxjs';
import {
  isUploadTerminal,
  type CiirUploadEvent,
  type CiirUploadProgress,
  type CiirUploadStatus,
  type IndexationStatus,
} from '../models/ciir-upload';
import { SUPPRESS_ERROR_TOAST } from '../interceptors/error-toast.interceptor';

/**
 * Wire shapes of the CIIR upload endpoints on the CIIR Indexer API (see
 * openapi.indexer.generated.json). Like the Projects endpoints served by the same service, bodies
 * are camelCase; `projectId`/ids are UUID strings, and the int64 counters are typed by the server as
 * number-or-string, so they're normalized through `Number(...)` below.
 */
interface SubmitCiirUploadResponseDto {
  uploadId: string;
  status: string;
}

interface CiirUploadStatusDto {
  id: string;
  projectId: string;
  status: string;
  createdAt: string;
  processingStartedAt: string | null;
  processedAt: string | null;
  indexationId: string | null;
  error: string | null;
}

interface IndexationStatusDto {
  id: string;
  status: string;
  documents: {
    processed: number | string;
    inserted: number | string;
    updated: number | string;
    embeddingsGenerated: number | string;
    embeddingsReused: number | string;
  };
  relations: {
    processed: number | string;
    resolved: number | string;
    unresolved: number | string;
  };
  error: string | null;
}

const POLL_INTERVAL_MS = 2000;
/** Consecutive failed polls tolerated before giving up on tracking an upload that was accepted. */
const POLL_RETRIES = 3;

@Injectable({ providedIn: 'root' })
export class CiirUploadsService {
  private readonly http = inject(HttpClient);

  /**
   * Streams `file` to the API and reports upload progress until the server accepts it (`202`).
   * Unsubscribing aborts the in-flight request. The caller owns error reporting: the global
   * error toast is suppressed because the useful messages here (404 with no body, 413, 429) aren't
   * ProblemDetails the generic interceptor could read.
   */
  upload(projectId: string, file: File): Observable<CiirUploadEvent> {
    const body = new FormData();
    // The API validates `projectId` before storing any byte of the file, so it must be the first
    // part of the multipart stream - FormData preserves append order.
    body.append('projectId', projectId);
    body.append('ciirFile', file, file.name);

    return this.http
      .post<SubmitCiirUploadResponseDto>('/api/indexer/ciir-uploads', body, {
        reportProgress: true,
        observe: 'events',
        context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
      })
      .pipe(
        map((event): CiirUploadEvent | null => {
          switch (event.type) {
            case HttpEventType.UploadProgress:
              return { kind: 'progress', loaded: event.loaded, total: event.total ?? null };
            case HttpEventType.Response:
              return { kind: 'accepted', uploadId: event.body?.uploadId ?? '' };
            default:
              return null;
          }
        }),
        filter((event): event is CiirUploadEvent => event !== null),
      );
  }

  /**
   * Polls an accepted upload (and, once the worker has started, its indexation counters) until the
   * upload reaches a terminal status - the last emission is that terminal snapshot, then it
   * completes. A few consecutive transient failures are retried, since indexing a large file can
   * outlast a gateway blip; a 404 or exhausting the retries errors the stream.
   */
  watch(uploadId: string): Observable<CiirUploadProgress> {
    return timer(0, POLL_INTERVAL_MS).pipe(
      // exhaustMap, not switchMap: a slow poll should finish rather than be cancelled by the next tick.
      exhaustMap(() =>
        this.fetchProgress(uploadId).pipe(
          retry({
            count: POLL_RETRIES,
            delay: (error: unknown) =>
              error instanceof HttpErrorResponse && error.status === 404
                ? throwError(() => error)
                : timer(POLL_INTERVAL_MS),
          }),
        ),
      ),
      takeWhile((progress) => !isUploadTerminal(progress.upload.status), true),
    );
  }

  private fetchProgress(uploadId: string): Observable<CiirUploadProgress> {
    return this.getUpload(uploadId).pipe(
      switchMap((upload) =>
        upload.indexationId
          ? this.getIndexation(upload.indexationId).pipe(
              map((indexation) => ({ upload, indexation })),
            )
          : of({ upload, indexation: null }),
      ),
    );
  }

  private getUpload(uploadId: string): Observable<CiirUploadStatus> {
    return this.http
      .get<CiirUploadStatusDto>(`/api/indexer/ciir-uploads/${uploadId}`, {
        context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
      })
      .pipe(map(toUploadStatus));
  }

  private getIndexation(indexationId: string): Observable<IndexationStatus> {
    return this.http
      .get<IndexationStatusDto>(`/api/indexer/indexations/${indexationId}`, {
        context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
      })
      .pipe(map(toIndexationStatus));
  }
}

function toUploadStatus(dto: CiirUploadStatusDto): CiirUploadStatus {
  return {
    id: dto.id,
    projectId: dto.projectId,
    status: dto.status,
    createdAt: dto.createdAt,
    processingStartedAt: dto.processingStartedAt,
    processedAt: dto.processedAt,
    indexationId: dto.indexationId,
    error: dto.error,
  };
}

function toIndexationStatus(dto: IndexationStatusDto): IndexationStatus {
  return {
    id: dto.id,
    status: dto.status,
    documents: {
      processed: Number(dto.documents.processed),
      inserted: Number(dto.documents.inserted),
      updated: Number(dto.documents.updated),
      embeddingsGenerated: Number(dto.documents.embeddingsGenerated),
      embeddingsReused: Number(dto.documents.embeddingsReused),
    },
    relations: {
      processed: Number(dto.relations.processed),
      resolved: Number(dto.relations.resolved),
      unresolved: Number(dto.relations.unresolved),
    },
    error: dto.error,
  };
}
