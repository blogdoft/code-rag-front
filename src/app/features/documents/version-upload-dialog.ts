import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { Subscription } from 'rxjs';
import {
  contentTypeFor,
  type DocumentFile,
  type DocumentVersion,
} from '../../core/models/document';
import type { ProblemDetails } from '../../core/models/problem-details';
import { DocumentsService } from '../../core/services/documents.service';
import { ToastService } from '../../core/services/toast.service';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';
import { formatBytes } from './format';

export interface VersionUploadDialogData {
  documentId: string;
  /** Present when only the file is missing (`awaiting_upload` / `upload_failed`); absent registers a new version too. */
  version?: DocumentVersion;
  /**
   * Called as soon as the version exists and again once the file is stored. Escape/backdrop would
   * otherwise close the dialog with no result, and the caller's version list would stay stale.
   */
  onChanged?: () => void;
}

/**
 * - `creating`: registering the version (new versions only).
 * - `uploading`: streaming the bytes (cancellable by closing the dialog, which aborts the request).
 * - `done` / `failed`: terminal; a `failed` upload keeps the registered version so retrying skips
 *   straight to the file.
 */
type Phase = 'idle' | 'creating' | 'uploading' | 'done' | 'failed';

const ACCEPT = '.pdf,.md,.markdown,.txt,.html,.htm,.docx';

@Component({
  selector: 'app-version-upload-dialog',
  imports: [DecimalPipe, EscClearableDirective],
  templateUrl: './version-upload-dialog.html',
})
export class VersionUploadDialog {
  private readonly data = inject<VersionUploadDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<boolean | undefined>);
  private readonly documentsService = inject(DocumentsService);
  private readonly toast = inject(ToastService);

  private subscription: Subscription | null = null;
  /** One key per step, kept across retries so a repeated request replays instead of duplicating. */
  private readonly versionKey = crypto.randomUUID();
  private readonly fileKey = crypto.randomUUID();

  protected readonly accept = ACCEPT;
  protected readonly existingVersion = this.data.version ?? null;
  /** The version the file belongs to: the given one, or the one registered by this dialog. */
  private readonly version = signal<DocumentVersion | null>(this.existingVersion);

  protected readonly label = signal('');
  protected readonly publishedAt = signal('');
  protected readonly effectiveFrom = signal('');
  protected readonly effectiveTo = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly isDragging = signal(false);

  protected readonly phase = signal<Phase>('idle');
  protected readonly loadedBytes = signal(0);
  protected readonly totalBytes = signal<number | null>(null);
  protected readonly storedFile = signal<DocumentFile | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly isBusy = computed(
    () => this.phase() === 'creating' || this.phase() === 'uploading',
  );

  protected readonly percent = computed(() => {
    const total = this.totalBytes();
    return total ? Math.min(100, Math.floor((this.loadedBytes() / total) * 100)) : null;
  });

  /** All bytes left the browser but the server only answers after storing the file. */
  protected readonly isStoring = computed(
    () => this.phase() === 'uploading' && this.percent() === 100,
  );

  /** Registered versions cannot change label/dates here, so those fields only matter for a new one. */
  protected readonly validationError = computed((): string | null => {
    if (this.existingVersion) {
      return null;
    }
    if (!this.label().trim()) {
      return 'Label is required.';
    }
    if (this.label().trim().length > 100) {
      return 'Label must have at most 100 characters.';
    }
    if (this.effectiveFrom() && this.effectiveTo() && this.effectiveTo() < this.effectiveFrom()) {
      return 'Effective to must not be before Effective from.';
    }
    return null;
  });

  protected readonly canSubmit = computed(
    () =>
      !this.isBusy() &&
      this.phase() !== 'done' &&
      this.file() !== null &&
      this.validationError() === null,
  );

  protected readonly dropzoneClasses = computed(() => {
    const base =
      'flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm focus-within:ring-2 focus-within:ring-sky-500';
    if (this.isBusy() || this.phase() === 'done') {
      return `${base} cursor-not-allowed border-slate-300 opacity-60 dark:border-slate-600`;
    }
    return this.isDragging()
      ? `${base} cursor-pointer border-sky-500 bg-sky-50 dark:bg-sky-900/20`
      : `${base} cursor-pointer border-slate-300 dark:border-slate-600`;
  });

  protected readonly fileSizeLabel = computed(() => {
    const file = this.file();
    return file ? formatBytes(file.size) : '';
  });
  protected readonly loadedLabel = computed(() => formatBytes(this.loadedBytes()));
  protected readonly totalLabel = computed(() => {
    const total = this.totalBytes();
    return total === null ? '' : formatBytes(total);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  /** Exposed for PopupService's `isDirty` option: closing mid-upload or with input pending asks first. */
  isDirty(): boolean {
    if (this.phase() === 'done') {
      return false;
    }
    return (
      this.isBusy() || this.file() !== null || (!this.existingVersion && !!this.label().trim())
    );
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectFile(input.files?.[0] ?? null);
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.isBusy() && this.phase() !== 'done') {
      this.isDragging.set(true);
    }
  }

  protected onDragLeave(): void {
    this.isDragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    if (!this.isBusy() && this.phase() !== 'done') {
      this.selectFile(event.dataTransfer?.files[0] ?? null);
    }
  }

  protected close(): void {
    this.dialogRef.close(this.phase() === 'done');
  }

  protected submit(): void {
    const file = this.file();
    if (!file || !this.canSubmit()) {
      return;
    }
    this.errorMessage.set(null);

    const version = this.version();
    if (version) {
      this.upload(version, file);
      return;
    }

    this.phase.set('creating');
    this.subscription = this.documentsService
      .createVersion(
        this.data.documentId,
        {
          label: this.label().trim(),
          publishedAt: toIsoDate(this.publishedAt()),
          effectiveFrom: toIsoDate(this.effectiveFrom()),
          effectiveTo: toIsoDate(this.effectiveTo()),
        },
        this.versionKey,
      )
      .subscribe({
        next: (created) => {
          this.version.set(created);
          this.data.onChanged?.();
          this.upload(created, file);
        },
        // The global error toast already explained a ProblemDetails 400 (duplicate label, ...).
        error: () => this.phase.set('idle'),
      });
  }

  private upload(version: DocumentVersion, file: File): void {
    this.phase.set('uploading');
    this.loadedBytes.set(0);
    this.totalBytes.set(file.size);
    this.subscription = this.documentsService
      .uploadFile(this.data.documentId, version.id, file, this.fileKey)
      .subscribe({
        next: (event) => {
          if (event.kind === 'progress') {
            this.loadedBytes.set(event.loaded);
            this.totalBytes.set(event.total ?? file.size);
          } else {
            this.storedFile.set(event.file);
            this.phase.set('done');
            this.toast.success('File stored and queued for processing.');
            this.data.onChanged?.();
          }
        },
        error: (error: unknown) => {
          const message = describeUploadError(error);
          this.errorMessage.set(message);
          this.phase.set('failed');
          this.toast.error(message);
          this.data.onChanged?.();
        },
      });
  }

  private selectFile(file: File | null): void {
    if (!file) {
      return;
    }
    if (!contentTypeFor(file.name)) {
      this.toast.error('File must be a PDF, Markdown, plain text, HTML or DOCX document.');
      return;
    }
    if (file.size === 0) {
      this.toast.error('File is empty.');
      return;
    }
    this.file.set(file);
  }
}

/** A `<input type="date">` value (`yyyy-mm-dd`) as the UTC instant the API stores verbatim. */
function toIsoDate(value: string): string | null {
  return value ? `${value}T00:00:00Z` : null;
}

/** ProblemDetails from the API when there is one; otherwise a read of the status - 404/503 carry no body. */
function describeUploadError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'The upload failed. Please try again.';
  }
  const problem = error.error as ProblemDetails | null;
  const fromApi =
    typeof problem === 'object' && problem !== null ? problem.detail || problem.title : null;
  if (fromApi) {
    return fromApi;
  }
  switch (error.status) {
    case 0:
      return 'The connection was lost while uploading. Check your network and try again.';
    case 403:
      return 'You do not have permission to upload documents.';
    case 404:
      return 'The document or version was not found.';
    case 503:
      return 'Object storage is unavailable right now. Please try again in a moment.';
    default:
      return 'The upload failed. Please try again.';
  }
}
