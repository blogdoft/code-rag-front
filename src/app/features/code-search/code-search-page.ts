import { PercentPipe } from '@angular/common';
import { Component, ElementRef, afterNextRender, computed, inject, model, signal, viewChild } from '@angular/core';
import { CodeQueriesService } from '../../core/services/code-queries.service';
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
import { QueryFiltersDrawer, type QueryFiltersDrawerData } from './query-filters-drawer';
import { ResultDetailDialog } from './result-detail-dialog';

interface QueryHistoryEntry {
  id: number;
  projectName: string;
  projectGitUrl: string | null;
  question: string;
  filters: CodeQueryFilters;
  results: CodeQueryResult[];
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
          { id: this.nextHistoryId++, projectName, projectGitUrl, question, filters, results },
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
