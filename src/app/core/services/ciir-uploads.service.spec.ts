import { HttpErrorResponse, HttpEventType, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SUPPRESS_ERROR_TOAST } from '../interceptors/error-toast.interceptor';
import type { CiirUploadEvent, CiirUploadProgress } from '../models/ciir-upload';
import { CiirUploadsService } from './ciir-uploads.service';

const PROJECT_ID = '00000000-0000-4000-8000-000000000007';
const UPLOAD_ID = '11111111-1111-1111-1111-111111111111';
const INDEXATION_ID = '22222222-2222-2222-2222-222222222222';

function uploadDto(overrides: Record<string, unknown> = {}) {
  return {
    id: UPLOAD_ID,
    projectId: PROJECT_ID,
    status: 'pending',
    createdAt: '2026-09-20T10:00:00Z',
    processingStartedAt: null,
    processedAt: null,
    indexationId: null,
    error: null,
    ...overrides,
  };
}

function indexationDto(overrides: Record<string, unknown> = {}) {
  return {
    id: INDEXATION_ID,
    status: 'running',
    documents: {
      processed: '120',
      inserted: 100,
      updated: 20,
      embeddingsGenerated: '90',
      embeddingsReused: 30,
    },
    relations: { processed: 300, resolved: '280', unresolved: 20 },
    error: null,
    ...overrides,
  };
}

describe('CiirUploadsService', () => {
  let service: CiirUploadsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CiirUploadsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  describe('upload()', () => {
    it('posts multipart with projectId before ciirFile, since the API validates it before storing the file', () => {
      const file = new File(['{"a":1}\n'], 'ciir.jsonl', { type: 'application/x-ndjson' });
      service.upload(PROJECT_ID, file).subscribe();

      const req = httpMock.expectOne('/api/indexer/ciir-uploads');
      expect(req.request.method).toBe('POST');
      const body = req.request.body as FormData;
      expect(Array.from(body.keys())).toEqual(['projectId', 'ciirFile']);
      expect(body.get('projectId')).toBe(PROJECT_ID);
      expect((body.get('ciirFile') as File).name).toBe('ciir.jsonl');
      expect(req.request.reportProgress).toBe(true);
      req.flush(
        { uploadId: UPLOAD_ID, status: 'pending' },
        { status: 202, statusText: 'Accepted' },
      );
    });

    it('suppresses the global error toast so the caller can explain the failure', () => {
      service
        .upload(PROJECT_ID, new File(['x'], 'ciir.jsonl'))
        .subscribe({ error: () => undefined });

      const req = httpMock.expectOne('/api/indexer/ciir-uploads');
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      req.flush(null, { status: 404, statusText: 'Not Found' });
    });

    it('emits progress events, then the accepted upload id', () => {
      const events: CiirUploadEvent[] = [];
      service
        .upload(PROJECT_ID, new File(['x'], 'ciir.jsonl'))
        .subscribe((event) => events.push(event));

      const req = httpMock.expectOne('/api/indexer/ciir-uploads');
      req.event({ type: HttpEventType.Sent });
      req.event({ type: HttpEventType.UploadProgress, loaded: 25, total: 100 });
      req.event({ type: HttpEventType.UploadProgress, loaded: 100, total: 100 });
      req.flush(
        { uploadId: UPLOAD_ID, status: 'pending' },
        { status: 202, statusText: 'Accepted' },
      );

      expect(events).toEqual([
        { kind: 'progress', loaded: 25, total: 100 },
        { kind: 'progress', loaded: 100, total: 100 },
        { kind: 'accepted', uploadId: UPLOAD_ID },
      ]);
    });

    it('reports an unknown total as null', () => {
      const events: CiirUploadEvent[] = [];
      service
        .upload(PROJECT_ID, new File(['x'], 'ciir.jsonl'))
        .subscribe((event) => events.push(event));

      httpMock
        .expectOne('/api/indexer/ciir-uploads')
        .event({ type: HttpEventType.UploadProgress, loaded: 10 });

      expect(events).toEqual([{ kind: 'progress', loaded: 10, total: null }]);
    });

    it('aborts the request when unsubscribed', () => {
      const subscription = service.upload(PROJECT_ID, new File(['x'], 'ciir.jsonl')).subscribe();
      const req = httpMock.expectOne('/api/indexer/ciir-uploads');

      subscription.unsubscribe();

      expect(req.cancelled).toBe(true);
    });
  });

  describe('watch()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    /** Answers the next upload-status poll; returns its request in case the test wants to inspect it. */
    function answerUploadPoll(dto: object): TestRequest {
      const req = httpMock.expectOne(`/api/indexer/ciir-uploads/${UPLOAD_ID}`);
      req.flush(dto);
      return req;
    }

    it('polls the upload status without fetching an indexation while there is no indexationId yet', () => {
      const seen: CiirUploadProgress[] = [];
      service.watch(UPLOAD_ID).subscribe((progress) => seen.push(progress));

      vi.advanceTimersByTime(0);
      const req = answerUploadPoll(uploadDto());

      expect(req.request.method).toBe('GET');
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      expect(seen).toHaveLength(1);
      expect(seen[0].upload).toMatchObject({
        id: UPLOAD_ID,
        projectId: PROJECT_ID,
        status: 'pending',
        indexationId: null,
      });
      expect(seen[0].indexation).toBeNull();
      httpMock.expectNone(`/api/indexer/indexations/${INDEXATION_ID}`);
    });

    it('adds indexation counters (normalizing int64 strings) once the worker has started', () => {
      const seen: CiirUploadProgress[] = [];
      service.watch(UPLOAD_ID).subscribe((progress) => seen.push(progress));

      vi.advanceTimersByTime(0);
      answerUploadPoll(uploadDto({ status: 'processing', indexationId: INDEXATION_ID }));
      httpMock.expectOne(`/api/indexer/indexations/${INDEXATION_ID}`).flush(indexationDto());

      expect(seen[0].indexation).toEqual({
        id: INDEXATION_ID,
        status: 'running',
        documents: {
          processed: 120,
          inserted: 100,
          updated: 20,
          embeddingsGenerated: 90,
          embeddingsReused: 30,
        },
        relations: { processed: 300, resolved: 280, unresolved: 20 },
        error: null,
      });
    });

    it('keeps polling every 2s until a terminal status, then completes after emitting it', () => {
      const seen: string[] = [];
      let completed = false;
      service.watch(UPLOAD_ID).subscribe({
        next: (progress) => seen.push(progress.upload.status),
        complete: () => (completed = true),
      });

      vi.advanceTimersByTime(0);
      answerUploadPoll(uploadDto());
      httpMock.expectNone(`/api/indexer/ciir-uploads/${UPLOAD_ID}`);

      vi.advanceTimersByTime(2000);
      answerUploadPoll(uploadDto({ status: 'processing', indexationId: INDEXATION_ID }));
      httpMock.expectOne(`/api/indexer/indexations/${INDEXATION_ID}`).flush(indexationDto());
      expect(completed).toBe(false);

      vi.advanceTimersByTime(2000);
      answerUploadPoll(uploadDto({ status: 'processed', indexationId: INDEXATION_ID }));
      httpMock
        .expectOne(`/api/indexer/indexations/${INDEXATION_ID}`)
        .flush(indexationDto({ status: 'completed' }));

      expect(seen).toEqual(['pending', 'processing', 'processed']);
      expect(completed).toBe(true);

      vi.advanceTimersByTime(10_000);
      httpMock.expectNone(`/api/indexer/ciir-uploads/${UPLOAD_ID}`);
    });

    it('treats a failed upload as terminal too, exposing the server error', () => {
      const seen: CiirUploadProgress[] = [];
      let completed = false;
      service
        .watch(UPLOAD_ID)
        .subscribe({ next: (p) => seen.push(p), complete: () => (completed = true) });

      vi.advanceTimersByTime(0);
      answerUploadPoll(uploadDto({ status: 'failed', error: 'Malformed CIIR document on line 3' }));

      expect(seen[0].upload.error).toBe('Malformed CIIR document on line 3');
      expect(completed).toBe(true);
    });

    it('retries a transient failure instead of dropping the upload being tracked', () => {
      const seen: string[] = [];
      let failed = false;
      service.watch(UPLOAD_ID).subscribe({
        next: (progress) => seen.push(progress.upload.status),
        error: () => (failed = true),
      });

      vi.advanceTimersByTime(0);
      httpMock
        .expectOne(`/api/indexer/ciir-uploads/${UPLOAD_ID}`)
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      vi.advanceTimersByTime(2000);
      answerUploadPoll(uploadDto({ status: 'processed' }));

      expect(failed).toBe(false);
      expect(seen).toEqual(['processed']);
    });

    it('gives up after repeated failures', () => {
      let error: unknown;
      service.watch(UPLOAD_ID).subscribe({ error: (e) => (error = e) });

      vi.advanceTimersByTime(0);
      for (let attempt = 0; attempt < 4; attempt++) {
        httpMock
          .expectOne(`/api/indexer/ciir-uploads/${UPLOAD_ID}`)
          .flush(null, { status: 502, statusText: 'Bad Gateway' });
        vi.advanceTimersByTime(2000);
      }

      expect(error).toBeInstanceOf(HttpErrorResponse);
    });

    it('does not retry a 404, since an unknown upload will not appear on its own', () => {
      let error: unknown;
      service.watch(UPLOAD_ID).subscribe({ error: (e) => (error = e) });

      vi.advanceTimersByTime(0);
      httpMock
        .expectOne(`/api/indexer/ciir-uploads/${UPLOAD_ID}`)
        .flush(null, { status: 404, statusText: 'Not Found' });

      expect((error as HttpErrorResponse).status).toBe(404);
      vi.advanceTimersByTime(2000);
      httpMock.expectNone(`/api/indexer/ciir-uploads/${UPLOAD_ID}`);
    });
  });
});
