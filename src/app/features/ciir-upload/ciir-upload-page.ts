import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  model,
  signal,
} from '@angular/core';
import { map, type Observable, type Subscription } from 'rxjs';
import { isUploadTerminal, type CiirUploadProgress } from '../../core/models/ciir-upload';
import type { ProblemDetails } from '../../core/models/problem-details';
import { CiirUploadsService } from '../../core/services/ciir-uploads.service';
import { ProjectsService } from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import { Combobox, type ComboboxOption } from '../../shared/components/combobox/combobox';
import {
  ConfirmDialog,
  type ConfirmDialogData,
} from '../../shared/components/confirm-dialog/confirm-dialog';
import { PopupService } from '../../shared/services/popup.service';

/**
 * - `uploading`: the file is still being sent (cancellable, aborts the request).
 * - `processing`: the server accepted it (`202`); a background worker is indexing it.
 * - `succeeded` / `failed`: terminal - `failed` covers both a rejected/interrupted upload request
 *   and an indexation the server reported as failed (see `errorMessage`).
 */
type Phase = 'idle' | 'uploading' | 'processing' | 'succeeded' | 'failed';

const UPLOAD_STATUS_LABELS: Record<string, string> = {
  pending: 'Queued - waiting for a worker',
  processing: 'Processing',
  processed: 'Completed',
  failed: 'Failed',
};

const INDEXATION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  running: 'Importing documents',
  resolving_relations: 'Resolving relations',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

@Component({
  selector: 'app-ciir-upload-page',
  imports: [Combobox, DecimalPipe],
  templateUrl: './ciir-upload-page.html',
})
export class CiirUploadPage {
  private readonly projectsService = inject(ProjectsService);
  private readonly uploadsService = inject(CiirUploadsService);
  private readonly popupService = inject(PopupService);
  private readonly toast = inject(ToastService);

  private uploadSubscription: Subscription | null = null;
  private watchSubscription: Subscription | null = null;

  protected readonly projectOptions = signal<ComboboxOption[]>([]);
  protected readonly selectedProjectId = model<string | null>(null);
  protected readonly file = signal<File | null>(null);
  protected readonly isDragging = signal(false);

  protected readonly phase = signal<Phase>('idle');
  protected readonly loadedBytes = signal(0);
  protected readonly totalBytes = signal<number | null>(null);
  protected readonly progress = signal<CiirUploadProgress | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly isBusy = computed(
    () => this.phase() === 'uploading' || this.phase() === 'processing',
  );
  protected readonly canSubmit = computed(
    () => !this.isBusy() && this.selectedProjectId() !== null && this.file() !== null,
  );

  /** Whole-number percentage of the file sent so far, or null when the browser can't tell the total. */
  protected readonly percent = computed(() => {
    const total = this.totalBytes();
    if (!total) {
      return null;
    }
    return Math.min(100, Math.floor((this.loadedBytes() / total) * 100));
  });

  /**
   * Every byte has left the browser but the server hasn't answered yet - it streams the file into
   * object storage and only responds once that's done, which for a big file is a noticeable wait at
   * "100%" that would otherwise look like a hang.
   */
  protected readonly isStoring = computed(
    () => this.phase() === 'uploading' && this.percent() === 100,
  );

  protected readonly dropzoneClasses = computed(() => {
    const base =
      'flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm focus-within:ring-2 focus-within:ring-sky-500';
    if (this.isBusy()) {
      return `${base} cursor-not-allowed border-slate-300 opacity-60 dark:border-slate-600`;
    }
    return this.isDragging()
      ? `${base} cursor-pointer border-sky-500 bg-sky-50 dark:bg-sky-900/20`
      : `${base} cursor-pointer border-slate-300 dark:border-slate-600`;
  });

  protected readonly uploadStatusLabel = computed(() => {
    const status = this.progress()?.upload.status;
    return status ? (UPLOAD_STATUS_LABELS[status] ?? status) : UPLOAD_STATUS_LABELS['pending'];
  });

  protected readonly indexationStatusLabel = computed(() => {
    const status = this.progress()?.indexation?.status;
    return status ? (INDEXATION_STATUS_LABELS[status] ?? status) : null;
  });

  protected readonly documentCounters = computed(() => {
    const documents = this.progress()?.indexation?.documents;
    if (!documents) {
      return [];
    }
    return [
      { label: 'Read', value: documents.processed },
      { label: 'Inserted', value: documents.inserted },
      { label: 'Updated', value: documents.updated },
      { label: 'Embeddings generated', value: documents.embeddingsGenerated },
      { label: 'Embeddings reused', value: documents.embeddingsReused },
    ];
  });

  protected readonly relationCounters = computed(() => {
    const relations = this.progress()?.indexation?.relations;
    if (!relations) {
      return [];
    }
    return [
      { label: 'Read', value: relations.processed },
      { label: 'Resolved', value: relations.resolved },
      { label: 'Unresolved', value: relations.unresolved },
    ];
  });

  protected readonly formatBytes = formatBytes;

  constructor() {
    this.projectsService.list().subscribe({
      next: (projects) =>
        this.projectOptions.set(
          projects.map((project) => ({ id: project.id, label: project.name })),
        ),
    });

    // Leaving the page (once confirmed via canLeave()) abandons whatever is in flight: aborts an
    // unfinished upload request, and stops polling an accepted one - which keeps processing
    // server-side regardless.
    inject(DestroyRef).onDestroy(() => {
      this.uploadSubscription?.unsubscribe();
      this.watchSubscription?.unsubscribe();
    });
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectFile(input.files?.[0] ?? null);
    // Reset so choosing the same file again (e.g. after a failed attempt) still fires `change`.
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    // Always cancel the default, or the browser navigates to the dropped file instead of firing `drop`.
    event.preventDefault();
    this.isDragging.set(!this.isBusy());
  }

  protected onDragLeave(): void {
    this.isDragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    if (!this.isBusy()) {
      this.selectFile(event.dataTransfer?.files?.[0] ?? null);
    }
  }

  protected submit(): void {
    const projectId = this.selectedProjectId();
    const file = this.file();
    if (!this.canSubmit() || projectId === null || !file) {
      return;
    }

    this.progress.set(null);
    this.errorMessage.set(null);
    this.loadedBytes.set(0);
    this.totalBytes.set(file.size);
    this.phase.set('uploading');

    this.uploadSubscription = this.uploadsService.upload(projectId, file).subscribe({
      next: (event) => {
        if (event.kind === 'progress') {
          this.loadedBytes.set(event.loaded);
          this.totalBytes.set(event.total ?? file.size);
        } else {
          this.track(event.uploadId);
        }
      },
      error: (error: unknown) => this.fail(describeUploadError(error)),
    });
  }

  protected cancel(): void {
    if (this.phase() !== 'uploading') {
      return;
    }
    this.uploadSubscription?.unsubscribe();
    this.phase.set('idle');
    this.toast.success('Upload cancelled.');
  }

  /**
   * Route `canDeactivate` hook: an in-flight upload would be aborted by leaving, and a big file
   * can take a long time to send, so make the user confirm. Once the server has accepted the file
   * (`processing`), leaving is harmless - indexing continues without this page.
   */
  canLeave(): boolean | Observable<boolean> {
    if (this.phase() !== 'uploading') {
      return true;
    }
    const confirmRef = this.popupService.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      role: 'alertdialog',
      data: {
        message: 'A file is still being uploaded. Leaving this page will cancel the upload.',
        confirmLabel: 'Leave and cancel upload',
      },
    });
    return confirmRef.closed.pipe(map(Boolean));
  }

  /** Same protection as canLeave(), for closing/reloading the tab rather than navigating in-app. */
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.phase() === 'uploading') {
      event.preventDefault();
    }
  }

  private track(uploadId: string): void {
    this.phase.set('processing');
    this.watchSubscription = this.uploadsService.watch(uploadId).subscribe({
      next: (progress) => {
        this.progress.set(progress);
        if (!isUploadTerminal(progress.upload.status)) {
          return;
        }
        if (progress.upload.status === 'processed') {
          this.phase.set('succeeded');
          this.toast.success('CIIR file indexed.');
        } else {
          this.fail(
            progress.upload.error ??
              progress.indexation?.error ??
              'The server failed to index this file.',
          );
        }
      },
      error: () =>
        this.fail(
          'Lost track of the upload status. The file may still be processing on the server.',
        ),
    });
  }

  private fail(message: string): void {
    this.errorMessage.set(message);
    this.phase.set('failed');
    this.toast.error(message);
  }

  private selectFile(file: File | null): void {
    if (!file) {
      return;
    }
    if (!/\.jsonl$/i.test(file.name)) {
      this.toast.error('CIIR file must be a .jsonl file.');
      return;
    }
    if (file.size === 0) {
      this.toast.error('CIIR file is empty.');
      return;
    }
    this.file.set(file);
  }
}

/**
 * The upload request's toast is suppressed at the service (see CiirUploadsService.upload), so this
 * is where a failure gets its message: ProblemDetails from the API when there is one, otherwise a
 * plain-language read of the status code - several of this endpoint's errors (404, 429) have no body.
 */
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
    case 404:
      return 'The selected project was not found.';
    case 413:
      return 'The file is too large for the server to accept.';
    case 429:
      return 'The server is busy with other uploads. Please try again in a moment.';
    default:
      return 'The upload failed. Please try again.';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}
