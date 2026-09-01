import { PercentPipe } from '@angular/common';
import { Component, ElementRef, afterNextRender, inject, model, signal, viewChild } from '@angular/core';
import { CodeQueriesService } from '../../core/services/code-queries.service';
import type { CodeQueryResult } from '../../core/models/code-query-result';
import type { Project } from '../../core/models/project';
import { ProjectsService } from '../../core/services/projects.service';
import { Combobox, type ComboboxOption } from '../../shared/components/combobox/combobox';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';
import { PopupService } from '../../shared/services/popup.service';
import { ResultDetailDialog } from './result-detail-dialog';

interface QueryHistoryEntry {
  id: number;
  projectName: string;
  projectGitUrl: string | null;
  question: string;
  results: CodeQueryResult[];
}

@Component({
  selector: 'app-code-search-page',
  imports: [Combobox, EscClearableDirective, PercentPipe],
  templateUrl: './code-search-page.html',
})
export class CodeSearchPage {
  private readonly projectsService = inject(ProjectsService);
  private readonly codeQueriesService = inject(CodeQueriesService);
  private readonly popupService = inject(PopupService);

  protected readonly projectOptions = signal<ComboboxOption[]>([]);
  private readonly projects = signal<Project[]>([]);
  protected readonly selectedProjectId = model<number | null>(null);
  protected readonly question = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly history = signal<QueryHistoryEntry[]>([]);

  private readonly projectCombobox = viewChild.required(Combobox);
  private readonly questionInput = viewChild.required<ElementRef<HTMLInputElement>>('questionInput');

  private nextHistoryId = 0;

  constructor() {
    this.projectsService.list().subscribe({
      next: (projects: Project[]) => {
        this.projects.set(projects);
        this.projectOptions.set(projects.map((project) => ({ id: project.id, label: project.name })));
      },
    });

    afterNextRender(() => this.projectCombobox().focus());
  }

  protected get canSubmit(): boolean {
    return this.selectedProjectId() !== null && this.question().trim().length > 0 && !this.isSubmitting();
  }

  protected onQuestionInput(text: string): void {
    this.question.set(text);
  }

  protected clearQuestion(): void {
    this.question.set('');
  }

  protected submit(): void {
    const projectId = this.selectedProjectId();
    const question = this.question().trim();
    if (projectId === null || question.length === 0) {
      return;
    }

    const selectedProject = this.projects().find((project) => project.id === projectId);
    const projectName = selectedProject?.name ?? '';
    const projectGitUrl = selectedProject?.gitUrl ?? null;

    this.isSubmitting.set(true);
    this.codeQueriesService.ask(projectId, question).subscribe({
      next: (results) => {
        this.history.update((entries) => [
          { id: this.nextHistoryId++, projectName, projectGitUrl, question, results },
          ...entries,
        ]);
        this.question.set('');
      },
      complete: () => this.isSubmitting.set(false),
      error: () => this.isSubmitting.set(false),
    });
  }

  protected openResult(result: CodeQueryResult): void {
    this.popupService.open(ResultDetailDialog, { data: result });
  }

  protected removeHistoryEntry(id: number): void {
    this.history.update((entries) => entries.filter((entry) => entry.id !== id));
  }

  protected focusQuestion(): void {
    this.questionInput().nativeElement.focus();
  }
}
