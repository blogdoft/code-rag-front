import { DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { ProjectsPage } from './projects-page';

/**
 * Hosts the existing `ProjectsPage` inside a popup, so other screens can offer project management
 * without navigating away. Nested popups (the add/edit form, delete confirmation) open on top and
 * are handled by the usual Escape rule.
 */
@Component({
  selector: 'app-projects-dialog',
  imports: [ProjectsPage],
  templateUrl: './projects-dialog.html',
})
export class ProjectsDialog {
  private readonly dialogRef = inject(DialogRef<void>);

  protected close(): void {
    this.dialogRef.close();
  }
}
