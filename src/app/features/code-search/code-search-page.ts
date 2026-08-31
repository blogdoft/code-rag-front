import { DecimalPipe } from '@angular/common';
import { Component, inject, model, signal } from '@angular/core';
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
  question: string;
  results: CodeQueryResult[];
}

@Component({
  selector: 'app-code-search-page',
  imports: [Combobox, EscClearableDirective, DecimalPipe],
  templateUrl: './code-search-page.html',
})
export class CodeSearchPage {
  private readonly projectsService = inject(ProjectsService);
  private readonly codeQueriesService = inject(CodeQueriesService);
  private readonly popupService = inject(PopupService);

  protected readonly projectOptions = signal<ComboboxOption[]>([]);
  protected readonly selectedProjectId = model<number | null>(null);
  protected readonly question = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly history = signal<QueryHistoryEntry[]>([]);

  private nextHistoryId = 0;

  constructor() {
    this.projectsService.list().subscribe({
      next: (projects: Project[]) => {
        this.projectOptions.set(projects.map((project) => ({ id: project.id, label: project.name })));
      },
    });
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

    const projectName = this.projectOptions().find((option) => option.id === projectId)?.label ?? '';

    this.isSubmitting.set(true);
    this.codeQueriesService.ask(projectId, question).subscribe({
      next: (results) => {
        this.history.update((entries) => [
          { id: this.nextHistoryId++, projectName, question, results },
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
}
