import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type { Project } from '../../core/models/project';
import { ProjectsService } from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';

export interface ProjectFormDialogData {
  /** Absent means "create a new project"; present means "edit this one". */
  project?: Project;
  /**
   * Called as soon as a *new* project is created. After creating, the dialog stays open to show the
   * generated id, so Escape/backdrop would otherwise close it with no result and the caller would
   * never learn about the project.
   */
  onCreated?: (project: Project) => void;
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
  /** Set once a new project was created; the dialog then shows its generated id instead of closing. */
  protected readonly createdProject = signal<Project | null>(null);
  /** The id is API-generated, so a project being created only has one after the POST succeeds. */
  protected readonly projectId = computed(
    () => this.data.project?.id ?? this.createdProject()?.id ?? null,
  );

  protected get canSave(): boolean {
    return this.name().trim().length > 0 && !this.isSaving() && !this.createdProject();
  }

  /** Exposed for PopupService's `isDirty` option, so Escape confirms before discarding edits. */
  isDirty(): boolean {
    if (this.createdProject()) {
      return false;
    }
    const original = this.data.project;
    return this.name().trim() !== (original?.name ?? '');
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

  protected close(): void {
    this.dialogRef.close(this.createdProject() ?? undefined);
  }

  protected copyProjectId(): void {
    const id = this.projectId();
    if (!id) {
      return;
    }
    navigator.clipboard.writeText(id).then(
      () => this.toast.success('Project ID copied.'),
      () => this.toast.error('Could not copy the project ID.'),
    );
  }

  protected save(): void {
    if (!this.canSave) {
      return;
    }

    const input = {
      name: this.name().trim(),
      // Blank means "no repository": send null, never "". The API stores "" as-is, and code-ciir-api
      // then fails (500) building a Uri from it on every query/feedback/stats call for this project.
      gitUrl: this.gitUrl().trim() || null,
      gitRawUrl: this.gitRawUrl().trim() || null,
    };
    const original = this.data.project;

    this.isSaving.set(true);
    const request$ = original
      ? this.projectsService.update(original.id, input)
      : this.projectsService.create(input);
    request$.subscribe({
      next: (project) => {
        this.toast.success(original ? 'Project updated.' : 'Project created.');
        if (original) {
          this.dialogRef.close(project);
          return;
        }
        // Keep the dialog open so the generated id can be read and copied.
        this.isSaving.set(false);
        this.createdProject.set(project);
        this.data.onCreated?.(project);
      },
      error: () => this.isSaving.set(false),
    });
  }
}
