import type { DialogRef } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import {
  LANGUAGE_CODE_MAX_LENGTH,
  LANGUAGE_CODE_PATTERN,
  TYPE_NAME_MAX_LENGTH,
} from '../../core/models/document-master-data';
import { DocumentLanguagesService } from '../../core/services/document-languages.service';
import { DocumentTypesService } from '../../core/services/document-types.service';
import { ToastService } from '../../core/services/toast.service';
import {
  ConfirmDialog,
  type ConfirmDialogData,
} from '../../shared/components/confirm-dialog/confirm-dialog';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';
import { PopupService } from '../../shared/services/popup.service';
import type { MasterDataConfig, MasterDataItem } from './master-data-config';
import { MasterDataFormDialog, type MasterDataFormDialogData } from './master-data-form-dialog';

export type MasterDataKind = 'type' | 'language';

/**
 * Manages one Doc RAG master-data catalog. Both `/document-types` and `/document-languages` route
 * here; the route's `data: { kind }` (bound through `withComponentInputBinding`) picks the catalog.
 */
@Component({
  selector: 'app-master-data-page',
  imports: [DatePipe, RouterLink, EscClearableDirective],
  templateUrl: './master-data-page.html',
})
export class MasterDataPage {
  private readonly types = inject(DocumentTypesService);
  private readonly languages = inject(DocumentLanguagesService);
  private readonly popupService = inject(PopupService);
  private readonly toast = inject(ToastService);

  readonly kind = input.required<MasterDataKind>();

  protected readonly config = computed<MasterDataConfig>(() =>
    this.kind() === 'type' ? this.typeConfig() : this.languageConfig(),
  );
  protected readonly items = signal<MasterDataItem[]>([]);
  protected readonly search = signal('');
  protected readonly isLoading = signal(false);

  protected readonly filteredItems = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.items()
      .filter((item) => item.value.toLowerCase().includes(query))
      .sort((a, b) => a.value.localeCompare(b.value));
  });

  constructor() {
    effect(() => {
      this.config();
      this.search.set('');
      this.load();
    });
  }

  protected add(): void {
    this.openForm();
  }

  protected edit(item: MasterDataItem): void {
    this.openForm(item);
  }

  protected copyId(item: MasterDataItem): void {
    navigator.clipboard.writeText(item.id).then(
      () => this.toast.success('ID copied.'),
      () => this.toast.error('Could not copy the ID.'),
    );
  }

  protected remove(item: MasterDataItem): void {
    const config = this.config();
    const confirmRef = this.popupService.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      role: 'alertdialog',
      data: {
        message: `Delete ${config.singular} "${item.value}"? This cannot be undone.`,
        confirmLabel: 'Delete',
      },
    });
    confirmRef.closed.subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      config.remove(item.id).subscribe({
        next: () => {
          this.toast.success('Deleted.');
          this.items.update((list) => list.filter((i) => i.id !== item.id));
        },
        error: () => {
          // Failure is already surfaced by the global error-toast interceptor.
        },
      });
    });
  }

  private openForm(item?: MasterDataItem): void {
    let formRef!: DialogRef<MasterDataItem | undefined, MasterDataFormDialog>;
    formRef = this.popupService.open<
      MasterDataItem | undefined,
      MasterDataFormDialogData,
      MasterDataFormDialog
    >(MasterDataFormDialog, {
      data: { config: this.config(), item },
      isDirty: () => formRef.componentInstance?.isDirty() ?? false,
    });
    formRef.closed.subscribe((saved) => {
      if (saved) {
        this.items.update((list) => [...list.filter((i) => i.id !== saved.id), saved]);
      }
    });
  }

  private load(): void {
    this.isLoading.set(true);
    // fresh: the catalog may have changed since a combobox cached it.
    this.config()
      .list(true)
      .subscribe({
        next: (items) => this.items.set(items),
        complete: () => this.isLoading.set(false),
        error: () => this.isLoading.set(false),
      });
  }

  private readonly typeConfig = computed<MasterDataConfig>(() => ({
    title: 'Document types',
    singular: 'document type',
    fieldLabel: 'Name',
    placeholder: 'fiscal-manual',
    list: (fresh) => this.types.list(fresh).pipe(map((types) => types.map(typeItem))),
    create: (name) => this.types.create(name).pipe(map(typeItem)),
    update: (id, name) => this.types.update(id, name).pipe(map(typeItem)),
    remove: (id) => this.types.remove(id),
    validate: (name) => {
      if (!name) {
        return 'Name is required.';
      }
      return name.length > TYPE_NAME_MAX_LENGTH
        ? `Name must have at most ${TYPE_NAME_MAX_LENGTH} characters.`
        : null;
    },
  }));

  private readonly languageConfig = computed<MasterDataConfig>(() => ({
    title: 'Document languages',
    singular: 'document language',
    fieldLabel: 'Code',
    placeholder: 'pt-BR',
    list: (fresh) => this.languages.list(fresh).pipe(map((all) => all.map(languageItem))),
    create: (code) => this.languages.create(code).pipe(map(languageItem)),
    update: (id, code) => this.languages.update(id, code).pipe(map(languageItem)),
    remove: (id) => this.languages.remove(id),
    validate: (code) => {
      if (!code) {
        return 'Code is required.';
      }
      if (code.length > LANGUAGE_CODE_MAX_LENGTH) {
        return `Code must have at most ${LANGUAGE_CODE_MAX_LENGTH} characters.`;
      }
      return LANGUAGE_CODE_PATTERN.test(code)
        ? null
        : 'Code must be a BCP 47 tag, e.g. pt-BR or en.';
    },
  }));
}

function typeItem(type: { id: string; name: string; createdAt: string; updatedAt: string }) {
  return { id: type.id, value: type.name, createdAt: type.createdAt, updatedAt: type.updatedAt };
}

function languageItem(language: {
  id: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: language.id,
    value: language.code,
    createdAt: language.createdAt,
    updatedAt: language.updatedAt,
  };
}
