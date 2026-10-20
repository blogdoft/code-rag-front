import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';
import type { MasterDataConfig, MasterDataItem } from './master-data-config';

export interface MasterDataFormDialogData {
  config: MasterDataConfig;
  /** Absent means "add a new entry"; present means "rename this one". */
  item?: MasterDataItem;
}

@Component({
  selector: 'app-master-data-form-dialog',
  imports: [EscClearableDirective],
  templateUrl: './master-data-form-dialog.html',
})
export class MasterDataFormDialog {
  private readonly data = inject<MasterDataFormDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<MasterDataItem | undefined>);
  private readonly toast = inject(ToastService);

  protected readonly config = this.data.config;
  protected readonly isEditMode = !!this.data.item;
  protected readonly value = signal(this.data.item?.value ?? '');
  protected readonly isSaving = signal(false);

  protected readonly validationError = computed(() => this.config.validate(this.value().trim()));
  protected readonly canSave = computed(() => !this.validationError() && !this.isSaving());

  /** Exposed for PopupService's `isDirty` option, so Escape confirms before discarding edits. */
  isDirty(): boolean {
    return this.value().trim() !== (this.data.item?.value ?? '');
  }

  protected cancel(): void {
    this.dialogRef.close(undefined);
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    const value = this.value().trim();
    const item = this.data.item;
    this.isSaving.set(true);
    const request$ = item ? this.config.update(item.id, value) : this.config.create(value);
    request$.subscribe({
      next: (saved) => {
        const subject =
          this.config.singular.charAt(0).toUpperCase() + this.config.singular.slice(1);
        this.toast.success(item ? `${subject} updated.` : `${subject} registered.`);
        this.dialogRef.close(saved);
      },
      // The global error toast already explained the 400 (e.g. a name that already exists).
      error: () => this.isSaving.set(false),
    });
  }
}
