import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('maps snake_case DTOs to camelCase Project models', () => {
    let result: unknown;
    service.list().subscribe((projects) => (result = projects));

    const req = httpMock.expectOne('/api/v1/projects');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, name: 'demo', created_at: '2026-01-01T00:00:00Z' }]);

    expect(result).toEqual([{ id: 1, name: 'demo', createdAt: '2026-01-01T00:00:00Z' }]);
  });

  it('returns an empty array when there are no projects', () => {
    let result: unknown;
    service.list().subscribe((projects) => (result = projects));

    httpMock.expectOne('/api/v1/projects').flush([]);

    expect(result).toEqual([]);
  });
});
