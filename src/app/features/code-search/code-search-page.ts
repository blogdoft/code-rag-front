import { PercentPipe } from '@angular/common';
import { Component, ElementRef, afterNextRender, computed, inject, model, signal, viewChild } from '@angular/core';
import { CodeQueriesService } from '../../core/services/code-queries.service';
import { ConfigService } from '../../core/services/config.service';
import {
  DEFAULT_QUALIFIED_NAME_FILTER,
  type CodeQueryFilters,
  type QualifiedNameFilter,
  type QualifiedNameFilterOperator,
} from '../../core/models/code-query-filters';
import type { CodeQueryResult } from '../../core/models/code-query-result';
import type { Project } from '../../core/models/project';
import { ProjectsService } from '../../core/services/projects.service';
import { Combobox, type ComboboxOption } from '../../shared/components/combobox/combobox';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';
import { PopupService } from '../../shared/services/popup.service';
import { NotUsefulReasonDialog, type NotUsefulReasonDialogData } from './not-useful-reason-dialog';
import { QueryFiltersDrawer, type QueryFiltersDrawerData } from './query-filters-drawer';
import { ResultDetailDialog } from './result-detail-dialog';
import { UserNameDialog, type UserNameDialogData } from './user-name-dialog';

type FeedbackState = { status: 'idle' } | { status: 'submitting' } | { status: 'submitted'; useful: boolean };

interface QueryHistoryEntry {
  id: number;
  projectId: number | null;
  projectName: string;
  projectGitUrl: string | null;
  question: string;
  filters: CodeQueryFilters;
  results: CodeQueryResult[];
  feedback: FeedbackState;
}

interface FilterSummaryEntry {
  text: string;
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
  private readonly configService = inject(ConfigService);

  protected readonly projectOptions = signal<ComboboxOption[]>([]);
  private readonly projects = signal<Project[]>([]);
  protected readonly selectedProjectId = model<number | null>(null);
  protected readonly question = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly history = signal<QueryHistoryEntry[]>([]);

  protected readonly kindFilter = signal('');
  protected readonly qualifiedNameFilter = signal<QualifiedNameFilter>({ ...DEFAULT_QUALIFIED_NAME_FILTER });
  protected readonly minSimilarity = signal<number | null>(null);
  protected readonly limit = signal<number | null>(null);

  protected readonly qualifiedNameOperators: readonly QualifiedNameFilterOperator[] = [
    'equals',
    'contains',
    'not_contains',
  ];

  protected readonly activeFilterCount = computed(() => {
    let count = 0;
    if (this.kindFilter().trim().length > 0) count++;
    if (this.qualifiedNameFilter().value.trim().length > 0) count++;
    return count;
  });

  private readonly projectCombobox = viewChild.required(Combobox);
  private readonly questionInput = viewChild.required<ElementRef<HTMLTextAreaElement>>('questionInput');

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
    return this.question().trim().length > 0 && !this.isSubmitting();
  }

  protected onQuestionInput(text: string): void {
    this.question.set(text);
  }

  protected submitWithShortcut(event: Event): void {
    if (!this.canSubmit) {
      return;
    }

    event.preventDefault();
    this.submit();
  }

  protected clearQuestion(): void {
    this.question.set('');
  }

  protected openFiltersDrawer(): void {
    this.popupService.open(QueryFiltersDrawer, {
      panelClass: 'filter-drawer-panel',
      data: {
        kind: this.kindFilter,
        qualifiedName: this.qualifiedNameFilter,
        qualifiedNameOperators: this.qualifiedNameOperators,
        minSimilarity: this.minSimilarity,
        limit: this.limit,
      } satisfies QueryFiltersDrawerData,
    });
  }

  protected filterEntries(filters: CodeQueryFilters): FilterSummaryEntry[] {
    const entries: FilterSummaryEntry[] = [];
    if (filters.kind) {
      entries.push({ text: `kind "${filters.kind}"` });
    }
    if (filters.qualifiedName) {
      entries.push({
        text: `qualified name ${filters.qualifiedName.operator.replace('_', ' ')} "${filters.qualifiedName.value}"`,
      });
    }
    return entries;
  }

  protected submit(): void {
    const projectId = this.selectedProjectId();
    const question = this.question().trim();
    if (question.length === 0) {
      return;
    }

    const selectedProject = this.projects().find((project) => project.id === projectId);
    const projectName = selectedProject?.name ?? 'All projects';
    const projectGitUrl = selectedProject?.gitUrl ?? null;
    const filters = this.buildFilters();

    this.isSubmitting.set(true);
    this.codeQueriesService.ask(projectId, question, filters).subscribe({
      next: (results) => {
        this.history.update((entries) => [
          {
            id: this.nextHistoryId++,
            projectId,
            projectName,
            projectGitUrl,
            question,
            filters,
            results,
            feedback: { status: 'idle' },
          },
          ...entries,
        ]);
      },
      complete: () => this.isSubmitting.set(false),
      error: () => this.isSubmitting.set(false),
    });
  }

  private buildFilters(): CodeQueryFilters {
    const filters: CodeQueryFilters = {};

    const kind = this.kindFilter().trim();
    if (kind) {
      filters.kind = kind;
    }

    const qualifiedNameValue = this.qualifiedNameFilter().value.trim();
    if (qualifiedNameValue) {
      filters.qualifiedName = { operator: this.qualifiedNameFilter().operator, value: qualifiedNameValue };
    }

    const minSimilarity = this.minSimilarity();
    if (minSimilarity != null) {
      filters.minSimilarity = minSimilarity;
    }

    const limit = this.limit();
    if (limit != null) {
      filters.limit = limit;
    }

    return filters;
  }

  protected openResult(result: CodeQueryResult): void {
    this.popupService.open(ResultDetailDialog, { data: result });
  }

  protected markUseful(entry: QueryHistoryEntry): void {
    this.submitFeedback(entry, true, undefined);
  }

  protected openNotUsefulDialog(entry: QueryHistoryEntry): void {
    const reason = signal('');
    const ref = this.popupService.open<boolean, NotUsefulReasonDialogData>(NotUsefulReasonDialog, {
      data: { reason },
      isDirty: () => reason().trim().length > 0,
    });
    ref.closed.subscribe((confirmed) => {
      if (confirmed) {
        this.submitFeedback(entry, false, reason().trim() || undefined);
      }
    });
  }

  private submitFeedback(entry: QueryHistoryEntry, useful: boolean, reason: string | undefined): void {
    const projectId = entry.projectId;
    if (projectId === null) {
      return;
    }

    const existingUser = this.configService.userName().trim();
    if (existingUser.length === 0) {
      this.askForUserName((user) => this.postFeedback(entry, useful, reason, user));
      return;
    }
    this.postFeedback(entry, useful, reason, existingUser);
  }

  /** Prompts for a name when none is configured yet. Cancelling aborts the whole feedback action
   *  that triggered the prompt — `onConfirmed` never runs. */
  private askForUserName(onConfirmed: (user: string) => void): void {
    const name = signal('');
    const ref = this.popupService.open<boolean, UserNameDialogData>(UserNameDialog, {
      data: { name },
      isDirty: () => name().trim().length > 0,
    });
    ref.closed.subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      const user = name().trim();
      this.configService.setUserName(user);
      onConfirmed(user);
    });
  }

  private postFeedback(entry: QueryHistoryEntry, useful: boolean, reason: string | undefined, user: string): void {
    const projectId = entry.projectId;
    if (projectId === null) {
      return;
    }

    this.setFeedback(entry.id, { status: 'submitting' });
    this.codeQueriesService
      .submitFeedback(projectId, {
        question: entry.question,
        useful,
        similarities: entry.results.map((result) => result.similarity),
        user,
        reason,
      })
      .subscribe({
        next: () => this.setFeedback(entry.id, { status: 'submitted', useful }),
        error: () => this.setFeedback(entry.id, { status: 'idle' }),
      });
  }

  private setFeedback(entryId: number, feedback: FeedbackState): void {
    this.history.update((entries) => entries.map((entry) => (entry.id === entryId ? { ...entry, feedback } : entry)));
  }

  protected removeHistoryEntry(id: number): void {
    this.history.update((entries) => entries.filter((entry) => entry.id !== id));
  }

  protected focusQuestion(): void {
    this.questionInput().nativeElement.focus();
  }
}
