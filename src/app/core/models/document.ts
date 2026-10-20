/** A logical document of the Doc RAG platform (`DocumentResponse`); named to avoid the DOM `Document`. */
export interface RagDocument {
  id: string;
  title: string;
  description: string | null;
  typeId: string;
  /** Name of the document type (master data), denormalized by the API for display. */
  type: string;
  languageId: string;
  /** BCP 47 tag of the document language (master data), denormalized by the API for display. */
  language: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted when registering a document (`POST /doc-rag/api/v1/documents`). */
export interface DocumentInput {
  title: string;
  description: string | null;
  typeId: string;
  languageId: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

/**
 * A document plus the `ETag` it was served with, which `PATCH` requires back as `If-Match` (quotes
 * included) to prevent lost updates.
 */
export interface VersionedDocument {
  document: RagDocument;
  etag: string | null;
}

/** JSON Merge Patch (RFC 7396) body: omitted members stay, `null` removes optional ones. */
export type DocumentPatch = Partial<{
  title: string;
  description: string | null;
  typeId: string;
  languageId: string;
  tags: string[] | null;
  metadata: Record<string, unknown>;
}>;

/** Empty string means "no filter"; `typeId`/`languageId` are master-data ids. */
export interface DocumentFilters {
  title: string;
  typeId: string;
  languageId: string;
  tag: string;
}

export interface CursorPage<T> {
  items: T[];
  /** Opaque; null on the last page. */
  nextCursor: string | null;
}

export interface DocumentFile {
  id: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number;
  sha256: string | null;
  uploadedAt: string;
}

/**
 * `status` is a plain string on purpose (like the CIIR statuses): the server documents the current
 * set, but an unknown future value should degrade to a raw label instead of breaking the type.
 */
export interface DocumentVersion {
  id: string;
  documentId: string;
  label: string;
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  /** `awaiting_upload` | `uploading` | `uploaded` | `upload_failed`; says nothing about downstream processing. */
  status: string;
  file: DocumentFile | null;
  createdAt: string;
  updatedAt: string;
}

export interface VersionInput {
  label: string;
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

/** Emitted while the bytes are being sent, then once with the stored file's metadata. */
export type DocumentUploadEvent =
  | { kind: 'progress'; loaded: number; total: number | null }
  | { kind: 'stored'; file: DocumentFile };

/** Media types the upload endpoint accepts, keyed by lowercase file extension. */
export const DOCUMENT_CONTENT_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** The Content-Type to declare for `fileName`, or null when its extension isn't an enabled type. */
export function contentTypeFor(fileName: string): string | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return DOCUMENT_CONTENT_TYPES[extension] ?? null;
}

export const VERSION_STATUS_LABELS: Readonly<Record<string, string>> = {
  awaiting_upload: 'Awaiting upload',
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  upload_failed: 'Upload failed',
};

/** A file can be (re)sent unless one was already stored or one is being received right now. */
export function canUploadFile(version: DocumentVersion): boolean {
  return version.status === 'awaiting_upload' || version.status === 'upload_failed';
}
