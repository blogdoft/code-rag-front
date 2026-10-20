import type { Observable } from 'rxjs';

/** One row of a master-data catalog, whatever its kind: `value` is the type name or language code. */
export interface MasterDataItem {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Everything the generic master-data page and form dialog need to manage one catalog, so document
 * types and languages share a single implementation.
 */
export interface MasterDataConfig {
  /** Page heading, e.g. "Document types". */
  title: string;
  /** Used in messages and dialog headings, e.g. "document type". */
  singular: string;
  /** Visible label of the single editable field (validation messages use it, never the wire name). */
  fieldLabel: string;
  placeholder: string;
  list(fresh: boolean): Observable<MasterDataItem[]>;
  create(value: string): Observable<MasterDataItem>;
  update(id: string, value: string): Observable<MasterDataItem>;
  remove(id: string): Observable<void>;
  /** Error message for a trimmed value, or null when it is acceptable. */
  validate(value: string): string | null;
}
