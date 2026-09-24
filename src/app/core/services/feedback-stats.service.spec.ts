import { HttpResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';
import { FeedbackStatsService } from './feedback-stats.service';

const PROJECT_1 = '00000000-0000-4000-8000-000000000001';
const PROJECT_7 = '00000000-0000-4000-8000-000000000007';

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

    const req = httpMock.expectOne((r) => r.url === '/api/code-queries/feedback/stats');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ startDate: '2026-08-01T00:00:00Z', endDate: '2026-08-31T00:00:00Z', weeks: [] });
  });

  it('sends all three query params when given', () => {
    service
      .getStats({
        startDate: '2026-08-01T00:00:00Z',
        endDate: '2026-08-31T00:00:00Z',
        projectId: PROJECT_7,
      })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/code-queries/feedback/stats');
    expect(req.request.params.get('startDate')).toBe('2026-08-01T00:00:00Z');
    expect(req.request.params.get('endDate')).toBe('2026-08-31T00:00:00Z');
    expect(req.request.params.get('projectId')).toBe(PROJECT_7);
    req.flush({ startDate: '2026-08-01T00:00:00Z', endDate: '2026-08-31T00:00:00Z', weeks: [] });
  });

  it('omits projectId when not given', () => {
    service.getStats({ startDate: '2026-08-01T00:00:00Z' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/code-queries/feedback/stats');
    expect(req.request.params.has('projectId')).toBe(false);
    req.flush({ startDate: '2026-08-01T00:00:00Z', endDate: '2026-08-31T00:00:00Z', weeks: [] });
  });

  it('maps the DTO to the app model', () => {
    let result: unknown;
    service.getStats().subscribe((stats) => (result = stats));

    httpMock
      .expectOne((r) => r.url === '/api/code-queries/feedback/stats')
      .flush({
        startDate: '2026-08-01T00:00:00Z',
        endDate: '2026-08-31T00:00:00Z',
        weeks: [
          {
            weekStart: '2026-07-27',
            weekEnd: '2026-08-02',
            projects: [
              {
                projectId: PROJECT_1,
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

    expect(result).toEqual({
      startDate: '2026-08-01T00:00:00Z',
      endDate: '2026-08-31T00:00:00Z',
      weeks: [
        {
          weekStart: '2026-07-27',
          weekEnd: '2026-08-02',
          projects: [
            {
              projectId: PROJECT_1,
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
      .expectOne((r) => r.url === '/api/code-queries/feedback/stats')
      .flush({ startDate: '2026-08-01T00:00:00Z', endDate: '2026-08-31T00:00:00Z', weeks: null });

    expect(result).toEqual({
      startDate: '2026-08-01T00:00:00Z',
      endDate: '2026-08-31T00:00:00Z',
      weeks: [],
    });
  });

  it('maps a null projects array within a week to an empty array', () => {
    let result: unknown;
    service.getStats().subscribe((stats) => (result = stats));

    httpMock
      .expectOne((r) => r.url === '/api/code-queries/feedback/stats')
      .flush({
        startDate: '2026-08-01T00:00:00Z',
        endDate: '2026-08-31T00:00:00Z',
        weeks: [{ weekStart: '2026-07-27', weekEnd: '2026-08-02', projects: null }],
      });

    expect(result).toEqual({
      startDate: '2026-08-01T00:00:00Z',
      endDate: '2026-08-31T00:00:00Z',
      weeks: [{ weekStart: '2026-07-27', weekEnd: '2026-08-02', projects: [] }],
    });
  });

  describe('exportCsv', () => {
    beforeEach(() => localStorage.removeItem('code-rag.exportTimezone'));
    afterEach(() => localStorage.removeItem('code-rag.exportTimezone'));

    it('requests the export endpoint as a blob, with the default export timezone', () => {
      service.exportCsv().subscribe();

      const req = httpMock.expectOne((r) => r.url === '/api/code-queries/feedback/export');
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      expect(req.request.params.get('timezone')).toBe('America/Sao_Paulo');
      req.flush(new Blob(['csv,data']));
    });

    it('sends all query params plus the configured export timezone', () => {
      TestBed.inject(ConfigService).setExportTimezone('America/Manaus');
      service
        .exportCsv({
          startDate: '2026-08-01T00:00:00Z',
          endDate: '2026-08-31T00:00:00Z',
          projectId: PROJECT_7,
        })
        .subscribe();

      const req = httpMock.expectOne((r) => r.url === '/api/code-queries/feedback/export');
      expect(req.request.params.get('startDate')).toBe('2026-08-01T00:00:00Z');
      expect(req.request.params.get('endDate')).toBe('2026-08-31T00:00:00Z');
      expect(req.request.params.get('projectId')).toBe(PROJECT_7);
      expect(req.request.params.get('timezone')).toBe('America/Manaus');
      req.flush(new Blob(['csv,data']));
    });

    it('omits the timezone param when the configured export timezone is empty', () => {
      TestBed.inject(ConfigService).setExportTimezone('');
      service.exportCsv().subscribe();

      const req = httpMock.expectOne((r) => r.url === '/api/code-queries/feedback/export');
      expect(req.request.params.has('timezone')).toBe(false);
      req.flush(new Blob(['csv,data']));
    });

    it('emits the raw HttpResponse (body + headers), unmapped', () => {
      let result: unknown;
      service.exportCsv().subscribe((response) => (result = response));

      const req = httpMock.expectOne((r) => r.url === '/api/code-queries/feedback/export');
      const blob = new Blob(['csv,data']);
      req.flush(blob, { headers: { 'content-disposition': 'attachment; filename=test.csv' } });

      expect(result).toBeInstanceOf(HttpResponse);
      const response = result as HttpResponse<Blob>;
      expect(response.body).toBe(blob);
      expect(response.headers.get('content-disposition')).toBe('attachment; filename=test.csv');
    });
  });
});
