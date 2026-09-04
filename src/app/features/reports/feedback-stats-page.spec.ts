import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import type { FeedbackStats } from '../../core/models/feedback-stats';
import type { Project } from '../../core/models/project';
import {
  FeedbackStatsService,
  type FeedbackStatsQuery,
} from '../../core/services/feedback-stats.service';
import { ProjectsService } from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import { FeedbackStatsPage } from './feedback-stats-page';

vi.mock('chart.js', () => ({
  Chart: Object.assign(
    vi.fn().mockImplementation(function (this: unknown) {
      return { destroy: vi.fn() };
    }),
    { register: vi.fn() },
  ),
  BarController: {},
  BarElement: {},
  CategoryScale: {},
  Legend: {},
  LinearScale: {},
  LineController: {},
  LineElement: {},
  PointElement: {},
  Tooltip: {},
}));

vi.mock('chartjs-plugin-datalabels', () => ({ default: {} }));

describe('FeedbackStatsPage', () => {
  let fixture: ComponentFixture<FeedbackStatsPage>;
  let projectsService: { list: ReturnType<typeof vi.fn> };
  let feedbackStatsService: {
    getStats: ReturnType<typeof vi.fn>;
    exportCsv: ReturnType<typeof vi.fn>;
  };
  let toastService: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const projects: Project[] = [
    { id: 1, name: 'alpha', gitUrl: null, gitRawUrl: null, createdAt: '2026-01-01T00:00:00Z' },
    { id: 2, name: 'beta', gitUrl: null, gitRawUrl: null, createdAt: '2026-01-02T00:00:00Z' },
  ];

  const stats: FeedbackStats = {
    startDate: '2026-07-27T00:00:00Z',
    endDate: '2026-08-02T00:00:00Z',
    weeks: [
      {
        weekStart: '2026-07-27',
        weekEnd: '2026-08-02',
        projects: [
          {
            projectId: 1,
            projectName: 'alpha',
            totalCount: 10,
            usefulCount: 6,
            notUsefulCount: 4,
            usefulPercentage: 60,
            notUsefulPercentage: 40,
          },
          {
            projectId: 2,
            projectName: 'beta',
            totalCount: 5,
            usefulCount: 5,
            notUsefulCount: 0,
            usefulPercentage: 100,
            notUsefulPercentage: 0,
          },
        ],
      },
    ],
  };

  function setup(
    getStats: (query: FeedbackStatsQuery) => Observable<FeedbackStats> = () => of(stats),
    exportCsv: (query: FeedbackStatsQuery) => Observable<HttpResponse<Blob>> = () =>
      of(new HttpResponse({ body: new Blob(['csv,data']), headers: new HttpHeaders() })),
  ): void {
    projectsService = { list: vi.fn(() => of(projects)) };
    feedbackStatsService = { getStats: vi.fn(getStats), exportCsv: vi.fn(exportCsv) };
    toastService = { success: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectsService, useValue: projectsService },
        { provide: FeedbackStatsService, useValue: feedbackStatsService },
        { provide: ToastService, useValue: toastService },
      ],
    });

    fixture = TestBed.createComponent(FeedbackStatsPage);
    fixture.detectChanges();
  }

  function combobox(): {
    options: () => { id: number; label: string }[];
    value: { set: (v: number | null) => void };
  } {
    return fixture.debugElement.query((debugEl) => debugEl.name === 'app-combobox')
      .componentInstance;
  }

  function chart(): {
    labels: () => (string | string[])[];
    totalCounts: () => number[];
    usefulCounts: () => number[];
    notUsefulCounts: () => number[];
    usefulPercentages: () => number[];
    notUsefulPercentages: () => number[];
  } | null {
    const debugEl = fixture.debugElement.query((el) => el.name === 'app-feedback-trend-chart');
    return debugEl ? debugEl.componentInstance : null;
  }

  function projectNamesInLabels(): unknown[] {
    return chart()!
      .labels()
      .map((label) => (Array.isArray(label) ? label[1] : label));
  }

  function dateInputs(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('input[type="date"]'));
  }

  function setDate(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function refreshButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelectorAll('button')[0];
  }

  function exportButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelectorAll('button')[1];
  }

  function toDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  it('loads projects into the combobox with an "All projects" option first', () => {
    setup();
    expect(combobox().options()).toEqual([
      { id: -1, label: 'All projects' },
      { id: 1, label: 'alpha' },
      { id: 2, label: 'beta' },
    ]);
  });

  it('pre-fills the date fields with the last 4 weeks (today and 4 weeks ago) and fetches with them', () => {
    const now = new Date('2026-08-30T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const fourWeeksAgo = new Date(now);
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      setup();

      const [start, end] = dateInputs();
      expect(start.value).toBe(toDateInput(fourWeeksAgo));
      expect(end.value).toBe(toDateInput(now));
      expect(feedbackStatsService.getStats).toHaveBeenCalledWith({
        startDate: `${toDateInput(fourWeeksAgo)}T00:00:00Z`,
        endDate: `${toDateInput(now)}T23:59:59Z`,
        projectId: undefined,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("flattens each week's per-project breakdown into its own chart entry, labeled by project", () => {
    setup();

    expect(chart()!.totalCounts()).toEqual([10, 5]);
    expect(chart()!.usefulCounts()).toEqual([6, 5]);
    expect(chart()!.notUsefulCounts()).toEqual([4, 0]);
    expect(chart()!.usefulPercentages()).toEqual([60, 100]);
    expect(chart()!.notUsefulPercentages()).toEqual([40, 0]);
    expect(projectNamesInLabels()).toEqual(['alpha', 'beta']);
  });

  it("keeps every week's projects broken out separately across multiple weeks", () => {
    const twoWeeks: FeedbackStats = {
      startDate: stats.startDate,
      endDate: stats.endDate,
      weeks: [
        stats.weeks[0],
        {
          weekStart: '2026-08-03',
          weekEnd: '2026-08-09',
          projects: [
            { ...stats.weeks[0].projects[0], totalCount: 3, usefulCount: 2, notUsefulCount: 1 },
            { ...stats.weeks[0].projects[1], totalCount: 1, usefulCount: 1, notUsefulCount: 0 },
          ],
        },
      ],
    };
    setup(() => of(twoWeeks));

    expect(chart()!.totalCounts()).toEqual([10, 5, 3, 1]);
    expect(projectNamesInLabels()).toEqual(['alpha', 'beta', 'alpha', 'beta']);
  });

  it('narrows to just the selected project once the service returns filtered data for it', () => {
    const alphaOnly: FeedbackStats = {
      startDate: stats.startDate,
      endDate: stats.endDate,
      weeks: [
        { weekStart: '2026-07-27', weekEnd: '2026-08-02', projects: [stats.weeks[0].projects[0]] },
      ],
    };
    setup((query) => of(query.projectId === 1 ? alphaOnly : stats));

    combobox().value.set(1);
    fixture.detectChanges();
    refreshButton().click();
    fixture.detectChanges();

    expect(chart()!.totalCounts()).toEqual([10]);
    expect(chart()!.usefulCounts()).toEqual([6]);
    expect(projectNamesInLabels()).toEqual(['alpha']);
  });

  it('refresh re-fetches with the currently selected project and date range', () => {
    setup();
    combobox().value.set(2);
    const [start, end] = dateInputs();
    setDate(start, '2026-08-01');
    setDate(end, '2026-08-31');
    feedbackStatsService.getStats.mockClear();

    refreshButton().click();

    expect(feedbackStatsService.getStats).toHaveBeenCalledWith({
      startDate: '2026-08-01T00:00:00Z',
      endDate: '2026-08-31T23:59:59Z',
      projectId: 2,
    });
  });

  it('shows a toast naming the visible field labels, not the API field names, when start date is after end date', () => {
    setup();
    const [start, end] = dateInputs();
    setDate(start, '2026-08-31');
    setDate(end, '2026-08-01');
    feedbackStatsService.getStats.mockClear();

    refreshButton().click();

    expect(toastService.error).toHaveBeenCalledWith('Start date must be on or before End date.');
    const [message] = toastService.error.mock.calls[0];
    expect(message).not.toContain('start_date');
    expect(message).not.toContain('end_date');
    expect(feedbackStatsService.getStats).not.toHaveBeenCalled();
  });

  it('re-fetches normally once the dates are corrected', () => {
    setup();
    const [start, end] = dateInputs();
    setDate(start, '2026-08-31');
    setDate(end, '2026-08-01');
    setDate(end, '2026-09-01');
    feedbackStatsService.getStats.mockClear();

    refreshButton().click();

    expect(toastService.error).not.toHaveBeenCalled();
    expect(feedbackStatsService.getStats).toHaveBeenCalledWith({
      startDate: '2026-08-31T00:00:00Z',
      endDate: '2026-09-01T23:59:59Z',
      projectId: undefined,
    });
  });

  it('toggles the loading flag around the request', () => {
    const subject = new Subject<FeedbackStats>();
    setup(() => subject.asObservable());

    expect(refreshButton().textContent.trim()).toBe('Loading...');
    expect(refreshButton().disabled).toBe(true);

    subject.next(stats);
    subject.complete();
    fixture.detectChanges();

    expect(refreshButton().textContent.trim()).toBe('Refresh');
    expect(refreshButton().disabled).toBe(false);
  });

  it('shows an empty-state message when there are no weeks in range', () => {
    setup(() =>
      of({ startDate: '2026-08-01T00:00:00Z', endDate: '2026-08-02T00:00:00Z', weeks: [] }),
    );

    expect(fixture.nativeElement.textContent).toContain('No data for this range.');
  });

  describe('Export CSV', () => {
    let createObjectUrl: ReturnType<typeof vi.fn>;
    let revokeObjectUrl: ReturnType<typeof vi.fn>;
    let clickSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // jsdom doesn't implement these at all - stub them directly on the real global URL
      // constructor (not a stubbed-in replacement object) so `new URL(...)` elsewhere keeps working.
      createObjectUrl = vi.fn(() => 'blob:mock-url');
      revokeObjectUrl = vi.fn();
      URL.createObjectURL = createObjectUrl as unknown as typeof URL.createObjectURL;
      URL.revokeObjectURL = revokeObjectUrl as unknown as typeof URL.revokeObjectURL;

      clickSpy = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'a') {
          el.click = clickSpy as unknown as () => void;
        }
        return el;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('exports with the currently selected filters', () => {
      setup();
      combobox().value.set(2);
      const [start, end] = dateInputs();
      setDate(start, '2026-08-01');
      setDate(end, '2026-08-31');
      feedbackStatsService.exportCsv.mockClear();

      exportButton().click();

      expect(feedbackStatsService.exportCsv).toHaveBeenCalledWith({
        startDate: '2026-08-01T00:00:00Z',
        endDate: '2026-08-31T23:59:59Z',
        projectId: 2,
      });
    });

    it('is blocked by the same date-range validation as Refresh, and does not call the service', () => {
      setup();
      const [start, end] = dateInputs();
      setDate(start, '2026-08-31');
      setDate(end, '2026-08-01');
      feedbackStatsService.exportCsv.mockClear();

      exportButton().click();

      expect(toastService.error).toHaveBeenCalledWith('Start date must be on or before End date.');
      expect(feedbackStatsService.exportCsv).not.toHaveBeenCalled();
    });

    it('downloads using the filename from Content-Disposition when present', () => {
      setup(undefined, () =>
        of(
          new HttpResponse({
            body: new Blob(['csv,data']),
            headers: new HttpHeaders({
              'content-disposition': 'attachment; filename=feedback_export_20260801_20260831.csv',
            }),
          }),
        ),
      );

      exportButton().click();

      expect(clickSpy).toHaveBeenCalled();
      expect(toastService.success).toHaveBeenCalledWith('CSV export downloaded.');
    });

    it('falls back to a client-built filename when Content-Disposition is absent', () => {
      setup(undefined, () =>
        of(new HttpResponse({ body: new Blob(['csv,data']), headers: new HttpHeaders() })),
      );
      const [start, end] = dateInputs();
      setDate(start, '2026-08-01');
      setDate(end, '2026-08-31');

      exportButton().click();

      expect(clickSpy).toHaveBeenCalled();
      expect(toastService.success).toHaveBeenCalledWith('CSV export downloaded.');
    });

    it('toggles the exporting flag around the request', () => {
      const subject = new Subject<HttpResponse<Blob>>();
      setup(undefined, () => subject.asObservable());

      exportButton().click();
      fixture.detectChanges();
      expect(exportButton().textContent.trim()).toBe('Exporting...');
      expect(exportButton().disabled).toBe(true);
      expect(refreshButton().disabled).toBe(true);

      subject.next(new HttpResponse({ body: new Blob(['csv,data']), headers: new HttpHeaders() }));
      subject.complete();
      fixture.detectChanges();

      expect(exportButton().textContent.trim()).toBe('Export CSV');
      expect(exportButton().disabled).toBe(false);
    });
  });
});
