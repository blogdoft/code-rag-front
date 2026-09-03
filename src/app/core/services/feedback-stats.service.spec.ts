import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FeedbackStatsService } from './feedback-stats.service';

describe('FeedbackStatsService', () => {
  let service: FeedbackStatsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FeedbackStatsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('requests the stats endpoint with no params when the query is empty', () => {
    service.getStats().subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/code-queries/feedback/stats');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ start_date: '2026-08-01T00:00:00Z', end_date: '2026-08-31T00:00:00Z', weeks: [] });
  });

  it('sends all three query params when given', () => {
    service.getStats({ startDate: '2026-08-01T00:00:00Z', endDate: '2026-08-31T00:00:00Z', projectId: 7 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/code-queries/feedback/stats');
    expect(req.request.params.get('start_date')).toBe('2026-08-01T00:00:00Z');
    expect(req.request.params.get('end_date')).toBe('2026-08-31T00:00:00Z');
    expect(req.request.params.get('project_id')).toBe('7');
    req.flush({ start_date: '2026-08-01T00:00:00Z', end_date: '2026-08-31T00:00:00Z', weeks: [] });
  });

  it('omits project_id when not given', () => {
    service.getStats({ startDate: '2026-08-01T00:00:00Z' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/v1/code-queries/feedback/stats');
    expect(req.request.params.has('project_id')).toBe(false);
    req.flush({ start_date: '2026-08-01T00:00:00Z', end_date: '2026-08-31T00:00:00Z', weeks: [] });
  });

  it('maps snake_case DTOs to camelCase models', () => {
    let result: unknown;
    service.getStats().subscribe((stats) => (result = stats));

    httpMock.expectOne((r) => r.url === '/api/v1/code-queries/feedback/stats').flush({
      start_date: '2026-08-01T00:00:00Z',
      end_date: '2026-08-31T00:00:00Z',
      weeks: [
        {
          week_start: '2026-07-27',
          week_end: '2026-08-02',
          projects: [
            {
              project_id: 1,
              project_name: 'example',
              total_count: 12,
              useful_count: 9,
              not_useful_count: 3,
              useful_percentage: 75,
              not_useful_percentage: 25,
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      startDate: '2026-08-01T00:00:00Z',
      endDate: '2026-08-31T00:00:00Z',
      weeks: [
        {
          weekStart: '2026-07-27',
          weekEnd: '2026-08-02',
          projects: [
            {
              projectId: 1,
              projectName: 'example',
              totalCount: 12,
              usefulCount: 9,
              notUsefulCount: 3,
              usefulPercentage: 75,
              notUsefulPercentage: 25,
            },
          ],
        },
      ],
    });
  });

  it('maps a null weeks array to an empty array', () => {
    let result: unknown;
    service.getStats().subscribe((stats) => (result = stats));

    httpMock
      .expectOne((r) => r.url === '/api/v1/code-queries/feedback/stats')
      .flush({ start_date: '2026-08-01T00:00:00Z', end_date: '2026-08-31T00:00:00Z', weeks: null });

    expect(result).toEqual({ startDate: '2026-08-01T00:00:00Z', endDate: '2026-08-31T00:00:00Z', weeks: [] });
  });

  it('maps a null projects array within a week to an empty array', () => {
    let result: unknown;
    service.getStats().subscribe((stats) => (result = stats));

    httpMock.expectOne((r) => r.url === '/api/v1/code-queries/feedback/stats').flush({
      start_date: '2026-08-01T00:00:00Z',
      end_date: '2026-08-31T00:00:00Z',
      weeks: [{ week_start: '2026-07-27', week_end: '2026-08-02', projects: null }],
    });

    expect(result).toEqual({
      startDate: '2026-08-01T00:00:00Z',
      endDate: '2026-08-31T00:00:00Z',
      weeks: [{ weekStart: '2026-07-27', weekEnd: '2026-08-02', projects: [] }],
    });
  });
});
