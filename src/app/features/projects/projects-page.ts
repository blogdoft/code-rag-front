import type { DialogRef } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import type { Project } from '../../core/models/project';
import { ProjectsService } from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import {
  ConfirmDialog,
  type ConfirmDialogData,
} from '../../shared/components/confirm-dialog/confirm-dialog';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';
import { PopupService } from '../../shared/services/popup.service';
import { ProjectFormDialog, type ProjectFormDialogData } from './project-form-dialog';

@Component({
  selector: 'app-projects-page',
  imports: [DatePipe, EscClearableDirective],
  templateUrl: './projects-page.html',
})
export class ProjectsPage {
  private readonly projectsService = inject(ProjectsService);
  private readonly popupService = inject(PopupService);
  private readonly toast = inject(ToastService);

  protected readonly projects = signal<Project[]>([]);
  protected readonly search = signal('');
  protected readonly isLoading = signal(false);

  protected readonly filteredProjects = computed(() => {
    const query = this.search().trim().toLowerCase();
    if (!query) {
      return this.projects();
    }
    return this.projects().filter((project) => project.name.toLowerCase().includes(query));
  });

  constructor() {
    this.loadProjects();
  }

  protected onSearchInput(value: string): void {
    this.search.set(value);
  }

  protected clearSearch(): void {
    this.search.set('');
  }

  protected addProject(): void {
    this.openForm();
  }

  protected editProject(project: Project): void {
    this.openForm(project);
  }

  protected copyProjectId(project: Project): void {
    navigator.clipboard.writeText(project.id).then(
      () => this.toast.success('Project ID copied.'),
      () => this.toast.error('Could not copy the project ID.'),
    );
  }

  protected deleteProject(project: Project): void {
    const confirmRef = this.popupService.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      role: 'alertdialog',
      data: {
        message: `Delete project "${project.name}"? This cannot be undone.`,
        confirmLabel: 'Delete',
      },
    });

    confirmRef.closed.subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.projectsService.remove(project.id).subscribe({
        next: () => {
          this.toast.success('Project deleted.');
          this.projects.update((list) => list.filter((p) => p.id !== project.id));
        },
        error: () => {
          // Failure is already surfaced by the global error-toast interceptor.
        },
      });
    });
  }

  private openForm(project?: Project): void {
    let formRef!: DialogRef<Project | undefined, ProjectFormDialog>;
    formRef = this.popupService.open<Project | undefined, ProjectFormDialogData, ProjectFormDialog>(
      ProjectFormDialog,
      {
        data: { project, onCreated: (created) => this.upsertProject(created) },
        isDirty: () => formRef.componentInstance?.isDirty() ?? false,
      },
    );

    formRef.closed.subscribe((result) => {
      if (!result) {
        return;
      }
      this.upsertProject(result);
    });
  }

  /** Idempotent: a created project is reported on creation and again when the dialog closes. */
  private upsertProject(project: Project): void {
    this.projects.update((list) => {
      const index = list.findIndex((p) => p.id === project.id);
      if (index === -1) {
        return [...list, project];
      }
      const next = [...list];
      next[index] = project;
      return next;
    });
  }

  private loadProjects(): void {
    this.isLoading.set(true);
    this.projectsService.list().subscribe({
      next: (projects) => this.projects.set(projects),
      complete: () => this.isLoading.set(false),
      error: () => this.isLoading.set(false),
    });
  }
}
