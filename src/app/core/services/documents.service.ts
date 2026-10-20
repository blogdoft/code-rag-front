import {
  HttpClient,
  HttpContext,
  HttpEventType,
  HttpHeaders,
  HttpParams,
  type HttpResponse,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { filter, map, type Observable } from 'rxjs';
import { SUPPRESS_ERROR_TOAST } from '../interceptors/error-toast.interceptor';
import {
  contentTypeFor,
  type CursorPage,
  type DocumentFile,
  type DocumentFilters,
  type DocumentInput,
  type DocumentPatch,
  type DocumentUploadEvent,
  type DocumentVersion,
  type RagDocument,
  type VersionedDocument,
  type VersionInput,
} from '../models/document';

/**
 * Wire shapes of the Doc RAG Ingestion API (contract: `/code-brain/api/doc-rag/swagger/v1/swagger.json`,
 * served behind the same gateway as the other services). Bodies are camelCase; nullable string
 * members are normalized below so the app deals only in the `core/models/document` shapes.
 */
interface DocumentDto {
  id: string;
  title: string | null;
  description: string | null;
  typeId: string;
  type: string | null;
  languageId: string;
  language: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface FileDto {
  id: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | string;
  sha256: string | null;
  uploadedAt: string;
}

interface VersionDto {
  id: string;
  documentId: string;
  label: string | null;
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: string | null;
  file: FileDto | null;
  createdAt: string;
  updatedAt: string;
}

/** Documents come back under `data`, versions under `items` - the API is inconsistent. */
interface DocumentPageDto {
  data: DocumentDto[] | null;
  nextCursor: string | null;
}

interface VersionPageDto {
  items: VersionDto[] | null;
  nextCursor: string | null;
}

const BASE = '/api/doc-rag/api/v1/documents';
export const DOCUMENTS_PAGE_SIZE = 20;

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly http = inject(HttpClient);

  list(filters: DocumentFilters, cursor: string | null): Observable<CursorPage<RagDocument>> {
    let params = new HttpParams().set('pageSize', DOCUMENTS_PAGE_SIZE);
    for (const [name, value] of Object.entries(filters)) {
      if (value.trim()) {
        params = params.set(name, value.trim());
      }
    }
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    return this.http.get<DocumentPageDto>(BASE, { params }).pipe(
      map((page) => ({
        items: (page.data ?? []).map(toDocument),
        nextCursor: page.nextCursor,
      })),
    );
  }

  get(documentId: string): Observable<VersionedDocument> {
    return this.http
      .get<DocumentDto>(`${BASE}/${documentId}`, { observe: 'response' })
      .pipe(map(toVersionedDocument));
  }

  /** `idempotencyKey` makes a retried registration return the original document instead of a duplicate. */
  create(input: DocumentInput, idempotencyKey: string): Observable<VersionedDocument> {
    return this.http
      .post<DocumentDto>(BASE, input, {
        headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
        observe: 'response',
      })
      .pipe(map(toVersionedDocument));
  }

  /** `etag` is the document's current `ETag`, quotes included; a stale or missing one is a `400`. */
  update(documentId: string, patch: DocumentPatch, etag: string): Observable<VersionedDocument> {
    return this.http
      .patch<DocumentDto>(`${BASE}/${documentId}`, patch, {
        headers: new HttpHeaders({
          'If-Match': etag,
          'Content-Type': 'application/merge-patch+json',
        }),
        observe: 'response',
      })
      .pipe(map(toVersionedDocument));
  }

  listVersions(documentId: string, cursor: string | null): Observable<CursorPage<DocumentVersion>> {
    let params = new HttpParams().set('pageSize', DOCUMENTS_PAGE_SIZE);
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    return this.http.get<VersionPageDto>(`${BASE}/${documentId}/versions`, { params }).pipe(
      map((page) => ({
        items: (page.items ?? []).map(toVersion),
        nextCursor: page.nextCursor,
      })),
    );
  }

  getVersion(documentId: string, versionId: string): Observable<DocumentVersion> {
    return this.http
      .get<VersionDto>(`${BASE}/${documentId}/versions/${versionId}`)
      .pipe(map(toVersion));
  }

  /** Registers an edition in `awaiting_upload`; the (document, label) pair must be unique. */
  createVersion(
    documentId: string,
    input: VersionInput,
    idempotencyKey: string,
  ): Observable<DocumentVersion> {
    return this.http
      .post<VersionDto>(`${BASE}/${documentId}/versions`, input, {
        headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
      })
      .pipe(map(toVersion));
  }

  /**
   * Streams the raw bytes (no multipart) with the declared media type, which the server checks
   * against the file's real signature. `201` means stored and queued, not indexed. Unsubscribing
   * aborts the request. The caller owns error reporting: 404 and 503 have no body, so the global
   * toast is suppressed.
   */
  uploadFile(
    documentId: string,
    versionId: string,
    file: File,
    idempotencyKey: string,
  ): Observable<DocumentUploadEvent> {
    const contentType = contentTypeFor(file.name) ?? file.type;
    return this.http
      .post<FileDto>(`${BASE}/${documentId}/versions/${versionId}/files`, file, {
        headers: new HttpHeaders({
          'Content-Type': contentType,
          'Content-Disposition': contentDisposition(file.name),
          'Idempotency-Key': idempotencyKey,
        }),
        reportProgress: true,
        observe: 'events',
        context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
      })
      .pipe(
        map((event): DocumentUploadEvent | null => {
          switch (event.type) {
            case HttpEventType.UploadProgress:
              return { kind: 'progress', loaded: event.loaded, total: event.total ?? null };
            case HttpEventType.Response:
              return { kind: 'stored', file: toFile(event.body!) };
            default:
              return null;
          }
        }),
        filter((event): event is DocumentUploadEvent => event !== null),
      );
  }
}

/**
 * Header values must be Latin-1, so a name with other characters also gets the RFC 5987
 * `filename*` form next to an ASCII fallback.
 */
function contentDisposition(fileName: string): string {
  const quoted = (value: string) => value.replace(/["\\]/g, '_');
  if (/^[\x20-\x7e]*$/.test(fileName)) {
    return `attachment; filename="${quoted(fileName)}"`;
  }
  const fallback = quoted(fileName.replace(/[^\x20-\x7e]/g, '_'));
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function toVersionedDocument(response: HttpResponse<DocumentDto>): VersionedDocument {
  return { document: toDocument(response.body!), etag: response.headers.get('ETag') };
}

function toDocument(dto: DocumentDto): RagDocument {
  return {
    id: dto.id,
    title: dto.title ?? '',
    description: dto.description,
    typeId: dto.typeId,
    type: dto.type ?? '',
    languageId: dto.languageId,
    language: dto.language ?? '',
    tags: dto.tags ?? [],
    metadata: dto.metadata ?? {},
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function toFile(dto: FileDto): DocumentFile {
  return {
    id: dto.id,
    fileName: dto.fileName,
    contentType: dto.contentType,
    sizeBytes: Number(dto.sizeBytes),
    sha256: dto.sha256,
    uploadedAt: dto.uploadedAt,
  };
}

function toVersion(dto: VersionDto): DocumentVersion {
  return {
    id: dto.id,
    documentId: dto.documentId,
    label: dto.label ?? '',
    publishedAt: dto.publishedAt,
    effectiveFrom: dto.effectiveFrom,
    effectiveTo: dto.effectiveTo,
    status: dto.status ?? '',
    file: dto.file ? toFile(dto.file) : null,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}
