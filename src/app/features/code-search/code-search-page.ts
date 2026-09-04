import { PercentPipe } from '@angular/common';
import { Component, ElementRef, afterNextRender, computed, inject, model, signal, viewChild } from '@angular/core';
import { CodeQueriesService } from '../../core/services/code-queries.service';
import { ConfigService } from '../../core/services/config.service';
import {
  DEFAULT_FIELD_FILTER,
  type CodeQueryFieldFilter,
  type CodeQueryFilters,
  type FilterOperator,
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
  projectId: number;
  projectName: string;
  projectGitUrl: string | null;
  question: string;
  filters: CodeQueryFilters;
  results: CodeQueryResult[];
  feedback: FeedbackState;
}

interface FilterSummaryEntry {
  field: string;
  filter: CodeQueryFieldFilter;
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

  protected readonly namespaceFilter = signal<CodeQueryFieldFilter>({ ...DEFAULT_FIELD_FILTER });
  protected readonly kindFilter = signal<CodeQueryFieldFilter>({ ...DEFAULT_FIELD_FILTER });
  protected readonly typeNameFilter = signal<CodeQueryFieldFilter>({ ...DEFAULT_FIELD_FILTER });

  protected readonly namespaceOperators: readonly FilterOperator[] = [
    'contains',
    'not_contains',
    'equals',
    'not_equals',
  ];
  protected readonly kindOperators: readonly FilterOperator[] = ['contains', 'equals', 'not_equals'];
  protected readonly typeNameOperators: readonly FilterOperator[] = ['contains', 'not_contains', 'equals'];

  protected readonly activeFilterCount = computed(() => {
    let count = 0;
    if (this.namespaceFilter().value.trim().length > 0) count++;
    if (this.kindFilter().value.trim().length > 0) count++;
    if (this.typeNameFilter().value.trim().length > 0) count++;
    return count;
  });

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

  protected openFiltersDrawer(): void {
    this.popupService.open(QueryFiltersDrawer, {
      panelClass: 'filter-drawer-panel',
      data: {
        namespaceFilter: this.namespaceFilter,
        kindFilter: this.kindFilter,
        typeNameFilter: this.typeNameFilter,
        namespaceOperators: this.namespaceOperators,
        kindOperators: this.kindOperators,
        typeNameOperators: this.typeNameOperators,
      } satisfies QueryFiltersDrawerData,
    });
  }

  protected filterEntries(filters: CodeQueryFilters): FilterSummaryEntry[] {
    const entries: FilterSummaryEntry[] = [];
    if (filters.namespace) {
      entries.push({ field: 'namespace', filter: filters.namespace });
    }
    if (filters.kind) {
      entries.push({ field: 'kind', filter: filters.kind });
    }
    if (filters.typeName) {
      entries.push({ field: 'type', filter: filters.typeName });
    }
    return entries;
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

    const namespace = activeFilter(this.namespaceFilter());
    if (namespace) {
      filters.namespace = namespace;
    }

    const kind = activeFilter(this.kindFilter());
    if (kind) {
      filters.kind = kind;
    }

    const typeName = activeFilter(this.typeNameFilter());
    if (typeName) {
      filters.typeName = typeName;
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
    this.setFeedback(entry.id, { status: 'submitting' });
    this.codeQueriesService
      .submitFeedback(entry.projectId, {
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

function activeFilter(filter: CodeQueryFieldFilter): CodeQueryFieldFilter | undefined {
  const value = filter.value.trim();
  return value.length > 0 ? { operator: filter.operator, value } : undefined;
}
