import type { DialogRef } from '@angular/cdk/dialog';
import { DatePipe, JsonPipe } from '@angular/common';
import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  VERSION_STATUS_LABELS,
  canUploadFile,
  type DocumentVersion,
  type VersionedDocument,
} from '../../core/models/document';
import { DocumentsService } from '../../core/services/documents.service';
import { ToastService } from '../../core/services/toast.service';
import { PopupService } from '../../shared/services/popup.service';
import { DocumentFormDialog, type DocumentFormDialogData } from './document-form-dialog';
import { formatBytes } from './format';
import { VersionUploadDialog, type VersionUploadDialogData } from './version-upload-dialog';

@Component({
  selector: 'app-document-detail-page',
  imports: [DatePipe, JsonPipe, RouterLink],
  templateUrl: './document-detail-page.html',
})
export class DocumentDetailPage {
  private readonly documentsService = inject(DocumentsService);
  private readonly popupService = inject(PopupService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param `:id`, bound by the router's `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly current = signal<VersionedDocument | null>(null);
  protected readonly versions = signal<DocumentVersion[]>([]);
  protected readonly hasMoreVersions = signal(false);
  protected readonly isLoadingDocument = signal(true);
  protected readonly isLoadingVersions = signal(false);
  protected readonly notFound = signal(false);

  protected readonly formatBytes = formatBytes;
  protected readonly canUploadFile = canUploadFile;

  private nextCursor: string | null = null;
  private alive = true;

  constructor() {
    this.destroyRef.onDestroy(() => (this.alive = false));
    effect(() => {
      const id = this.id();
      this.loadDocument(id);
      this.loadVersions(id, false);
    });
  }

  protected statusLabel(status: string): string {
    return VERSION_STATUS_LABELS[status] ?? status;
  }

  protected statusClasses(status: string): string {
    const base = 'rounded-full px-2 py-0.5 text-xs font-medium';
    switch (status) {
      case 'uploaded':
        return `${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300`;
      case 'upload_failed':
        return `${base} bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300`;
      case 'uploading':
        return `${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`;
      default:
        return `${base} bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200`;
    }
  }

  protected hasMetadata(document: VersionedDocument): boolean {
    return Object.keys(document.document.metadata).length > 0;
  }

  protected refresh(): void {
    this.loadVersions(this.id(), false);
  }

  protected loadMoreVersions(): void {
    this.loadVersions(this.id(), true);
  }

  protected edit(): void {
    const existing = this.current();
    if (!existing) {
      return;
    }
    let ref!: DialogRef<VersionedDocument | undefined, DocumentFormDialog>;
    ref = this.popupService.open<
      VersionedDocument | undefined,
      DocumentFormDialogData,
      DocumentFormDialog
    >(DocumentFormDialog, {
      data: { existing },
      isDirty: () => ref.componentInstance?.isDirty() ?? false,
    });
    ref.closed.subscribe((saved) => {
      if (saved) {
        this.current.set(saved);
      }
    });
  }

  protected addVersion(): void {
    this.openUpload(undefined);
  }

  protected uploadFile(version: DocumentVersion): void {
    this.openUpload(version);
  }

  protected copyId(): void {
    navigator.clipboard.writeText(this.id()).then(
      () => this.toast.success('Document ID copied.'),
      () => this.toast.error('Could not copy the document ID.'),
    );
  }

  private openUpload(version: DocumentVersion | undefined): void {
    let ref!: DialogRef<boolean | undefined, VersionUploadDialog>;
    ref = this.popupService.open<boolean | undefined, VersionUploadDialogData, VersionUploadDialog>(
      VersionUploadDialog,
      {
        data: {
          documentId: this.id(),
          version,
          onChanged: () => this.refresh(),
        },
        isDirty: () => ref.componentInstance?.isDirty() ?? false,
      },
    );
  }

  private loadDocument(id: string): void {
    this.isLoadingDocument.set(true);
    this.notFound.set(false);
    this.documentsService.get(id).subscribe({
      next: (document) => {
        if (this.alive && id === this.id()) {
          this.current.set(document);
          this.isLoadingDocument.set(false);
        }
      },
      error: (error: { status?: number }) => {
        this.isLoadingDocument.set(false);
        this.notFound.set(error.status === 404);
      },
    });
  }

  private loadVersions(id: string, append: boolean): void {
    const cursor = append ? this.nextCursor : null;
    if (append && !cursor) {
      return;
    }
    this.isLoadingVersions.set(true);
    this.documentsService.listVersions(id, cursor).subscribe({
      next: (page) => {
        if (!this.alive || id !== this.id()) {
          return;
        }
        this.versions.update((current) => (append ? [...current, ...page.items] : page.items));
        this.nextCursor = page.nextCursor;
        this.hasMoreVersions.set(page.nextCursor !== null);
        this.isLoadingVersions.set(false);
      },
      error: () => this.isLoadingVersions.set(false),
    });
  }
}
