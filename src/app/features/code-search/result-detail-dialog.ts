import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import type { CodeQueryResult } from '../../core/models/code-query-result';

@Component({
  selector: 'app-result-detail-dialog',
  imports: [DecimalPipe],
  templateUrl: './result-detail-dialog.html',
})
export class ResultDetailDialog {
  protected readonly result = inject<CodeQueryResult>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<void>);

  protected close(): void {
    this.dialogRef.close();
  }
}
