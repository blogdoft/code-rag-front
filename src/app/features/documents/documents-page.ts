import type { DialogRef } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import type { DocumentFilters, RagDocument, VersionedDocument } from '../../core/models/document';
import { DocumentsService } from '../../core/services/documents.service';
import { DocumentLanguageCombobox } from '../../shared/components/document-language-combobox/document-language-combobox';
import { DocumentTypeCombobox } from '../../shared/components/document-type-combobox/document-type-combobox';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';
import { PopupService } from '../../shared/services/popup.service';
import { DocumentFormDialog, type DocumentFormDialogData } from './document-form-dialog';

const EMPTY_FILTERS: DocumentFilters = { title: '', typeId: '', languageId: '', tag: '' };

@Component({
  selector: 'app-documents-page',
  imports: [
    DatePipe,
    RouterLink,
    EscClearableDirective,
    DocumentTypeCombobox,
    DocumentLanguageCombobox,
  ],
  templateUrl: './documents-page.html',
})
export class DocumentsPage {
  private readonly documentsService = inject(DocumentsService);
  private readonly popupService = inject(PopupService);
  private readonly router = inject(Router);

  private nextCursor: string | null = null;
  private request: Subscription | null = null;
  /** What the last search used: "Load more" must page through that, not through unsent edits. */
  private applied: DocumentFilters = EMPTY_FILTERS;

  /** The form's current state; it only reaches the API when the user searches. */
  protected readonly filters = signal<DocumentFilters>(EMPTY_FILTERS);
  protected readonly documents = signal<RagDocument[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly textFilterFields: readonly { key: 'title' | 'tag'; label: string }[] = [
    { key: 'title', label: 'Title' },
    { key: 'tag', label: 'Tag' },
  ];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
    this.search();
  }

  protected setFilter(key: keyof DocumentFilters, value: string): void {
    this.filters.update((current) => ({ ...current, [key]: value }));
  }

  protected search(): void {
    this.applied = this.filters();
    this.load(null);
  }

  protected clearFilters(): void {
    this.filters.set(EMPTY_FILTERS);
    this.search();
  }

  protected loadMore(): void {
    if (this.nextCursor && !this.isLoading()) {
      this.load(this.nextCursor);
    }
  }

  protected addDocument(): void {
    let ref!: DialogRef<VersionedDocument | undefined, DocumentFormDialog>;
    ref = this.popupService.open<
      VersionedDocument | undefined,
      DocumentFormDialogData,
      DocumentFormDialog
    >(DocumentFormDialog, {
      data: {},
      // The component instance is only known once the dialog is open, hence the lookup below.
      isDirty: () => ref.componentInstance?.isDirty() ?? false,
    });
    ref.closed.subscribe((created) => {
      if (created) {
        void this.router.navigate(['/documents', created.document.id]);
      }
    });
  }

  private load(cursor: string | null): void {
    this.isLoading.set(true);
    // A newer search supersedes one still in flight instead of racing it.
    this.request?.unsubscribe();
    this.request = this.documentsService.list(this.applied, cursor).subscribe({
      next: (page) => this.applyPage(page.items, page.nextCursor, cursor !== null),
      error: () => this.isLoading.set(false),
    });
  }

  private applyPage(items: RagDocument[], nextCursor: string | null, append: boolean): void {
    this.documents.update((current) => (append ? [...current, ...items] : items));
    this.nextCursor = nextCursor;
    this.hasMore.set(nextCursor !== null);
    this.isLoading.set(false);
  }
}
