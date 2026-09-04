import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, type WritableSignal } from '@angular/core';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';

export interface NotUsefulReasonDialogData {
  reason: WritableSignal<string>;
}

@Component({
  selector: 'app-not-useful-reason-dialog',
  imports: [EscClearableDirective],
  templateUrl: './not-useful-reason-dialog.html',
})
export class NotUsefulReasonDialog {
  protected readonly data = inject<NotUsefulReasonDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<boolean>);

  protected onReasonInput(value: string): void {
    this.data.reason.set(value);
  }

  protected clearReason(): void {
    this.data.reason.set('');
  }

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
