import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, type WritableSignal } from '@angular/core';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';

export interface UserNameDialogData {
  name: WritableSignal<string>;
}

@Component({
  selector: 'app-user-name-dialog',
  imports: [EscClearableDirective],
  templateUrl: './user-name-dialog.html',
})
export class UserNameDialog {
  protected readonly data = inject<UserNameDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<boolean>);

  protected get canConfirm(): boolean {
    return this.data.name().trim().length > 0;
  }

  protected onNameInput(value: string): void {
    this.data.name.set(value);
  }

  protected clearName(): void {
    this.data.name.set('');
  }

  protected confirm(): void {
    if (!this.canConfirm) {
      return;
    }
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
