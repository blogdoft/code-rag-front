import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import type { Project } from '../../core/models/project';
import { ProjectsService } from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';

export interface ProjectFormDialogData {
  /** Absent means "create a new project"; present means "edit this one". */
  project?: Project;
}

@Component({
  selector: 'app-project-form-dialog',
  imports: [EscClearableDirective],
  templateUrl: './project-form-dialog.html',
})
export class ProjectFormDialog {
  private readonly data = inject<ProjectFormDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<Project | undefined>);
  private readonly projectsService = inject(ProjectsService);
  private readonly toast = inject(ToastService);

  protected readonly isEditMode = !!this.data.project;
  protected readonly name = signal(this.data.project?.name ?? '');
  protected readonly gitUrl = signal(this.data.project?.gitUrl ?? '');
  protected readonly gitRawUrl = signal(this.data.project?.gitRawUrl ?? '');
  protected readonly isSaving = signal(false);

  protected get canSave(): boolean {
    return (
      this.name().trim().length > 0 &&
      this.gitUrl().trim().length > 0 &&
      this.gitRawUrl().trim().length > 0 &&
      !this.isSaving()
    );
  }

  /** Exposed for PopupService's `isDirty` option, so Escape confirms before discarding edits. */
  isDirty(): boolean {
    const original = this.data.project;
    return (
      this.name().trim() !== (original?.name ?? '') ||
      this.gitUrl().trim() !== (original?.gitUrl ?? '') ||
      this.gitRawUrl().trim() !== (original?.gitRawUrl ?? '')
    );
  }

  protected clearName(): void {
    this.name.set('');
  }

  protected clearGitUrl(): void {
    this.gitUrl.set('');
  }

  protected clearGitRawUrl(): void {
    this.gitRawUrl.set('');
  }

  protected cancel(): void {
    this.dialogRef.close(undefined);
  }

  protected save(): void {
    if (!this.canSave) {
      return;
    }

    const input = { name: this.name().trim(), gitUrl: this.gitUrl().trim(), gitRawUrl: this.gitRawUrl().trim() };
    const original = this.data.project;

    this.isSaving.set(true);
    const request$ = original ? this.projectsService.update(original.id, input) : this.projectsService.create(input);
    request$.subscribe({
      next: (project) => {
        this.toast.success(original ? 'Project updated.' : 'Project created.');
        this.dialogRef.close(project);
      },
      error: () => this.isSaving.set(false),
    });
  }
}
