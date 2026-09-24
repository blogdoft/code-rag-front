/**
 * Statuses are typed as plain strings on purpose: the server documents the current set (see the
 * helpers below) but this backend is under active development, so an unknown future value should
 * degrade to "not terminal, keep polling" rather than break the type.
 */
export interface CiirUploadStatus {
  id: string;
  projectId: string;
  /** `pending` | `processing` | `processed` | `failed`. */
  status: string;
  createdAt: string;
  processingStartedAt: string | null;
  processedAt: string | null;
  /** Null while still `pending`; once set, `GET /api/indexer/indexations/{id}` reports counters. */
  indexationId: string | null;
  error: string | null;
}

export interface IndexationStatus {
  id: string;
  /** `pending` | `running` | `resolving_relations` | `completed` | `failed` | `cancelled`. */
  status: string;
  documents: {
    processed: number;
    inserted: number;
    updated: number;
    embeddingsGenerated: number;
    embeddingsReused: number;
  };
  relations: {
    processed: number;
    resolved: number;
    unresolved: number;
  };
  error: string | null;
}

/** One poll's worth of server-side progress for an accepted upload. */
export interface CiirUploadProgress {
  upload: CiirUploadStatus;
  /** Null until the worker has started processing the upload (`upload.indexationId` is null). */
  indexation: IndexationStatus | null;
}

/** Emitted while the file itself is still being sent, then once when the server accepts it. */
export type CiirUploadEvent =
  | {
      kind: 'progress';
      loaded: number;
      /** Null when the browser can't tell the total size. */ total: number | null;
    }
  | { kind: 'accepted'; uploadId: string };

export function isUploadTerminal(status: string): boolean {
  return status === 'processed' || status === 'failed';
}
