import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SUPPRESS_ERROR_TOAST } from '../interceptors/error-toast.interceptor';
import type { DocumentUploadEvent } from '../models/document';
import { DocumentsService } from './documents.service';

const DOC_ID = '0199a8bb-7bc4-7000-8000-4d981eb52c93';
const TYPE_ID = '0199a8bb-7bc4-7000-8000-0000000000a1';
const LANGUAGE_ID = '0199a8bb-7bc4-7000-8000-0000000000a2';
const VERSION_ID = '0199a8bb-7bc4-7000-8000-000000000002';

const documentDto = {
  id: DOC_ID,
  title: 'Manual',
  description: null,
  typeId: TYPE_ID,
  type: 'fiscal-manual',
  languageId: LANGUAGE_ID,
  language: 'pt-BR',
  tags: null,
  metadata: null,
  createdAt: '2026-10-15T03:08:00Z',
  updatedAt: '2026-10-15T03:08:00Z',
};

const fileDto = {
  id: '0199a8bb-7bc4-7000-8000-000000000003',
  fileName: 'manual.pdf',
  contentType: 'application/pdf',
  sizeBytes: '1048576',
  sha256: 'ab',
  status: 'uploaded',
  uploadedAt: '2026-10-15T03:09:00Z',
};

describe('DocumentsService', () => {
  let service: DocumentsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DocumentsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists documents with only the filled filters, reading the page from `data`', () => {
    let result;
    service
      .list({ title: ' manual ', typeId: TYPE_ID, languageId: '', tag: 'cte' }, 'abc')
      .subscribe((page) => (result = page));

    const req = httpMock.expectOne((r) => r.url === '/api/doc-rag/api/v1/documents');
    expect(req.request.params.get('title')).toBe('manual');
    expect(req.request.params.get('tag')).toBe('cte');
    expect(req.request.params.get('typeId')).toBe(TYPE_ID);
    expect(req.request.params.has('languageId')).toBe(false);
    expect(req.request.params.get('cursor')).toBe('abc');
    req.flush({ data: [documentDto], nextCursor: 'next' });

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: DOC_ID,
          typeId: TYPE_ID,
          languageId: LANGUAGE_ID,
          tags: [],
          metadata: {},
        }),
      ],
      nextCursor: 'next',
    });
  });

  it('exposes the ETag next to the document', () => {
    let etag: string | null = null;
    service.get(DOC_ID).subscribe((result) => (etag = result.etag));

    httpMock
      .expectOne(`/api/doc-rag/api/v1/documents/${DOC_ID}`)
      .flush(documentDto, { headers: { ETag: '"3"' } });

    expect(etag).toBe('"3"');
  });

  it('patches as a merge patch guarded by If-Match', () => {
    service.update(DOC_ID, { description: null }, '"3"').subscribe();

    const req = httpMock.expectOne(`/api/doc-rag/api/v1/documents/${DOC_ID}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.get('If-Match')).toBe('"3"');
    expect(req.request.headers.get('Content-Type')).toBe('application/merge-patch+json');
    expect(req.request.body).toEqual({ description: null });
    req.flush(documentDto);
  });

  it('sends the idempotency key when registering a document', () => {
    service
      .create(
        {
          title: 'Manual',
          description: null,
          typeId: TYPE_ID,
          languageId: LANGUAGE_ID,
          tags: [],
          metadata: {},
        },
        'key-1',
      )
      .subscribe();

    const req = httpMock.expectOne('/api/doc-rag/api/v1/documents');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
    req.flush(documentDto);
  });

  it('reads versions from `items`', () => {
    let count = 0;
    service.listVersions(DOC_ID, null).subscribe((page) => (count = page.items.length));

    httpMock
      .expectOne((r) => r.url === `/api/doc-rag/api/v1/documents/${DOC_ID}/versions`)
      .flush({
        items: [
          {
            id: VERSION_ID,
            documentId: DOC_ID,
            label: '4.00',
            publishedAt: null,
            effectiveFrom: null,
            effectiveTo: null,
            status: 'awaiting_upload',
            file: null,
            createdAt: '2026-10-15T03:08:00Z',
            updatedAt: '2026-10-15T03:08:00Z',
          },
        ],
        nextCursor: null,
      });

    expect(count).toBe(1);
  });

  describe('uploadFile()', () => {
    const url = `/api/doc-rag/api/v1/documents/${DOC_ID}/versions/${VERSION_ID}/files`;

    it('streams the raw file with the declared type and the original name', () => {
      const file = new File(['%PDF-'], 'manual.pdf');
      service.uploadFile(DOC_ID, VERSION_ID, file, 'key-2').subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.body).toBe(file);
      expect(req.request.headers.get('Content-Type')).toBe('application/pdf');
      expect(req.request.headers.get('Content-Disposition')).toBe(
        'attachment; filename="manual.pdf"',
      );
      expect(req.request.headers.get('Idempotency-Key')).toBe('key-2');
      expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
      req.flush(fileDto, { status: 201, statusText: 'Created' });
    });

    it('adds an RFC 5987 filename* for names that are not plain ASCII', () => {
      service.uploadFile(DOC_ID, VERSION_ID, new File(['x'], 'orientação.md'), 'k').subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.headers.get('Content-Disposition')).toBe(
        `attachment; filename="orienta__o.md"; filename*=UTF-8''orienta%C3%A7%C3%A3o.md`,
      );
      req.flush(fileDto, { status: 201, statusText: 'Created' });
    });

    it('emits progress, then the stored file with a numeric size', () => {
      const events: DocumentUploadEvent[] = [];
      service
        .uploadFile(DOC_ID, VERSION_ID, new File(['x'], 'a.txt'), 'k')
        .subscribe((event) => events.push(event));

      const req = httpMock.expectOne(url);
      req.event({ type: HttpEventType.UploadProgress, loaded: 5, total: 10 });
      req.flush(fileDto, { status: 201, statusText: 'Created' });

      expect(events[0]).toEqual({ kind: 'progress', loaded: 5, total: 10 });
      expect(events[1]).toEqual({
        kind: 'stored',
        file: expect.objectContaining({ sizeBytes: 1048576 }),
      });
    });
  });
});
