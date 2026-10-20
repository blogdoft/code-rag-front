import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type { DocumentInput, DocumentPatch, VersionedDocument } from '../../core/models/document';
import { DocumentsService } from '../../core/services/documents.service';
import { ToastService } from '../../core/services/toast.service';
import { DocumentLanguageCombobox } from '../../shared/components/document-language-combobox/document-language-combobox';
import { DocumentTypeCombobox } from '../../shared/components/document-type-combobox/document-type-combobox';
import { MetadataEditor } from '../../shared/components/metadata-editor/metadata-editor';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';
import { metadataPatch } from './metadata-patch';

export interface DocumentFormDialogData {
  /** Absent means "register a new document"; present means "edit this one" (needs its ETag). */
  existing?: VersionedDocument;
}

const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 80;
const MAX_METADATA_BYTES = 64 * 1024;

type ParsedForm = { input: DocumentInput; error: null } | { input: null; error: string };

@Component({
  selector: 'app-document-form-dialog',
  imports: [EscClearableDirective, DocumentTypeCombobox, DocumentLanguageCombobox, MetadataEditor],
  templateUrl: './document-form-dialog.html',
})
export class DocumentFormDialog {
  private readonly data = inject<DocumentFormDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<VersionedDocument | undefined>);
  private readonly documentsService = inject(DocumentsService);
  private readonly toast = inject(ToastService);

  private readonly original = this.data.existing?.document;
  /** One key per dialog: re-submitting after a lost response replays the registration instead of duplicating it. */
  private readonly idempotencyKey = crypto.randomUUID();

  protected readonly isEditMode = !!this.original;
  protected readonly title = signal(this.original?.title ?? '');
  protected readonly description = signal(this.original?.description ?? '');
  protected readonly typeId = signal<string | null>(this.original?.typeId ?? null);
  protected readonly languageId = signal<string | null>(this.original?.languageId ?? null);
  protected readonly tags = signal(this.original?.tags.join(', ') ?? '');
  protected readonly metadata = signal<Record<string, unknown>>(this.original?.metadata ?? {});
  /** Set by the metadata editor while its fields don't form a valid object. */
  protected readonly metadataError = signal<string | null>(null);
  protected readonly isSaving = signal(false);

  private readonly parsed = computed(() => this.parse());
  protected readonly validationError = computed(() => this.parsed().error);
  protected readonly canSave = computed(() => !this.parsed().error && !this.isSaving());

  /** Exposed for PopupService's `isDirty` option, so Escape confirms before discarding edits. */
  isDirty(): boolean {
    const o = this.original;
    return (
      this.title() !== (o?.title ?? '') ||
      this.description() !== (o?.description ?? '') ||
      this.typeId() !== (o?.typeId ?? null) ||
      this.languageId() !== (o?.languageId ?? null) ||
      this.tags() !== (o?.tags.join(', ') ?? '') ||
      metadataPatch(o?.metadata ?? {}, this.metadata()) !== null
    );
  }

  protected cancel(): void {
    this.dialogRef.close(undefined);
  }

  protected save(): void {
    const { input } = this.parsed();
    if (!input || this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    const existing = this.data.existing;
    let request$;
    if (existing) {
      const patch = this.buildPatch(existing, input);
      if (!patch) {
        this.dialogRef.close(undefined);
        return;
      }
      if (!existing.etag) {
        this.isSaving.set(false);
        this.toast.error('Reload the document before editing it - its revision is unknown.');
        return;
      }
      request$ = this.documentsService.update(existing.document.id, patch, existing.etag);
    } else {
      request$ = this.documentsService.create(input, this.idempotencyKey);
    }

    request$.subscribe({
      next: (saved) => {
        this.toast.success(existing ? 'Document updated.' : 'Document registered.');
        this.dialogRef.close(saved);
      },
      error: () => this.isSaving.set(false),
    });
  }

  /** Only the members that changed: the PATCH is a merge patch, so omitted ones stay as they are. */
  private buildPatch(existing: VersionedDocument, input: DocumentInput): DocumentPatch | null {
    const before = existing.document;
    const patch: DocumentPatch = {};
    if (input.title !== before.title) {
      patch.title = input.title;
    }
    if (input.description !== before.description) {
      patch.description = input.description;
    }
    if (input.typeId !== before.typeId) {
      patch.typeId = input.typeId;
    }
    if (input.languageId !== before.languageId) {
      patch.languageId = input.languageId;
    }
    if (input.tags.join('\n') !== before.tags.join('\n')) {
      patch.tags = input.tags;
    }
    const metadata = metadataPatch(before.metadata, input.metadata);
    if (metadata) {
      patch.metadata = metadata;
    }
    return Object.keys(patch).length > 0 ? patch : null;
  }

  /** Field names in messages are the visible labels, never the wire names. */
  private parse(): ParsedForm {
    const title = this.title().trim();
    const typeId = this.typeId();
    const languageId = this.languageId();
    if (!title) {
      return { input: null, error: 'Title is required.' };
    }
    if (title.length > 300) {
      return { input: null, error: 'Title must have at most 300 characters.' };
    }
    if (this.description().length > 4000) {
      return { input: null, error: 'Description must have at most 4000 characters.' };
    }
    if (!typeId) {
      return { input: null, error: 'Type is required.' };
    }
    if (!languageId) {
      return { input: null, error: 'Language is required.' };
    }

    const tags = [
      ...new Set(
        this.tags()
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ];
    if (tags.length > MAX_TAGS) {
      return { input: null, error: `Tags accept at most ${MAX_TAGS} entries.` };
    }
    if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
      return { input: null, error: `Each tag must have at most ${MAX_TAG_LENGTH} characters.` };
    }

    if (this.metadataError()) {
      return { input: null, error: this.metadataError()! };
    }
    const metadata = this.metadata();
    if (new Blob([JSON.stringify(metadata)]).size > MAX_METADATA_BYTES) {
      return { input: null, error: 'Metadata must be at most 64 KiB.' };
    }

    return {
      input: {
        title,
        description: this.description().trim() || null,
        typeId,
        languageId,
        tags,
        metadata,
      },
      error: null,
    };
  }
}
