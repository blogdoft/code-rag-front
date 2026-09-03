import { Component, computed, inject, model, signal } from '@angular/core';
import type { FeedbackStats } from '../../core/models/feedback-stats';
import type { Project } from '../../core/models/project';
import { FeedbackStatsService } from '../../core/services/feedback-stats.service';
import { ProjectsService } from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import { Combobox, type ComboboxOption } from '../../shared/components/combobox/combobox';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';
import { FeedbackTrendChart } from './feedback-trend-chart';

/** Sentinel for the "All projects" option; real project ids are positive per the API contract. */
const ALL_PROJECTS_ID = -1;

/** One (week, project) slot flattened out of the API's dense week x project grid. */
interface FlatEntry {
  weekLabel: string;
  projectName: string;
  totalCount: number;
  usefulCount: number;
  notUsefulCount: number;
  usefulPercentage: number;
  notUsefulPercentage: number;
}

@Component({
  selector: 'app-feedback-stats-page',
  imports: [Combobox, EscClearableDirective, FeedbackTrendChart],
  templateUrl: './feedback-stats-page.html',
})
export class FeedbackStatsPage {
  private readonly projectsService = inject(ProjectsService);
  private readonly feedbackStatsService = inject(FeedbackStatsService);
  private readonly toast = inject(ToastService);

  protected readonly projectOptions = signal<ComboboxOption[]>([{ id: ALL_PROJECTS_ID, label: 'All projects' }]);
  protected readonly selectedProjectId = model<number | null>(ALL_PROJECTS_ID);
  protected readonly startDate = signal(toDateInput(weeksAgo(4)));
  protected readonly endDate = signal(toDateInput(new Date()));
  protected readonly isLoading = signal(false);
  protected readonly stats = signal<FeedbackStats | null>(null);

  protected readonly flatEntries = computed<FlatEntry[]>(() => {
    const stats = this.stats();
    if (!stats) {
      return [];
    }
    const entries: FlatEntry[] = [];
    for (const week of stats.weeks) {
      const weekLabel = formatWeekLabel(week.weekStart);
      for (const project of week.projects) {
        entries.push({
          weekLabel,
          projectName: project.projectName ?? `#${project.projectId}`,
          totalCount: project.totalCount,
          usefulCount: project.usefulCount,
          notUsefulCount: project.notUsefulCount,
          usefulPercentage: project.usefulPercentage,
          notUsefulPercentage: project.notUsefulPercentage,
        });
      }
    }
    return entries;
  });

  protected readonly chartLabels = computed(() =>
    this.flatEntries().map((entry) => [entry.weekLabel, entry.projectName]),
  );
  protected readonly totalCounts = computed(() => this.flatEntries().map((entry) => entry.totalCount));
  protected readonly usefulCounts = computed(() => this.flatEntries().map((entry) => entry.usefulCount));
  protected readonly notUsefulCounts = computed(() => this.flatEntries().map((entry) => entry.notUsefulCount));
  protected readonly usefulPercentages = computed(() => this.flatEntries().map((entry) => entry.usefulPercentage));
  protected readonly notUsefulPercentages = computed(() =>
    this.flatEntries().map((entry) => entry.notUsefulPercentage),
  );

  constructor() {
    this.projectsService.list().subscribe({
      next: (projects: Project[]) => {
        this.projectOptions.set([
          { id: ALL_PROJECTS_ID, label: 'All projects' },
          ...projects.map((project) => ({ id: project.id, label: project.name })),
        ]);
      },
    });

    this.fetchStats();
  }

  protected clearStartDate(): void {
    this.startDate.set('');
  }

  protected clearEndDate(): void {
    this.endDate.set('');
  }

  protected fetchStats(): void {
    const startDate = this.startDate();
    const endDate = this.endDate();
    // ISO date strings (YYYY-MM-DD) compare correctly with a plain string comparison.
    if (startDate && endDate && startDate > endDate) {
      this.toast.error('Start date must be on or before End date.');
      return;
    }

    const projectId = this.selectedProjectId();

    this.isLoading.set(true);
    this.feedbackStatsService
      .getStats({
        startDate: toIsoStart(this.startDate()),
        endDate: toIsoEnd(this.endDate()),
        projectId: projectId === null || projectId === ALL_PROJECTS_ID ? undefined : projectId,
      })
      .subscribe({
        next: (stats) => this.stats.set(stats),
        complete: () => this.isLoading.set(false),
        error: () => this.isLoading.set(false),
      });
  }
}

function toIsoStart(date: string): string | undefined {
  return date ? `${date}T00:00:00Z` : undefined;
}

function toIsoEnd(date: string): string | undefined {
  return date ? `${date}T23:59:59Z` : undefined;
}

function formatWeekLabel(weekStart: string): string {
  return new Date(weekStart).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
}

function weeksAgo(count: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - count * 7);
  return date;
}

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
