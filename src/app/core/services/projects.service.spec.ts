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
    req.flush([
      { id: 1, name: 'demo', git_url: 'https://example.com/demo.git', git_raw_url: null, created_at: '2026-01-01T00:00:00Z' },
    ]);

    expect(result).toEqual([
      { id: 1, name: 'demo', gitUrl: 'https://example.com/demo.git', gitRawUrl: null, createdAt: '2026-01-01T00:00:00Z' },
    ]);
  });

  it('returns an empty array when there are no projects', () => {
    let result: unknown;
    service.list().subscribe((projects) => (result = projects));

    httpMock.expectOne('/api/v1/projects').flush([]);

    expect(result).toEqual([]);
  });

  it('creates a project, sending a snake_case body and mapping the response', () => {
    let result: unknown;
    service
      .create({ name: 'demo', gitUrl: 'https://example.com/demo.git', gitRawUrl: 'https://raw.example.com/demo' })
      .subscribe((project) => (result = project));

    const req = httpMock.expectOne('/api/v1/projects');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'demo',
      git_url: 'https://example.com/demo.git',
      git_raw_url: 'https://raw.example.com/demo',
    });
    req.flush({
      id: 1,
      name: 'demo',
      git_url: 'https://example.com/demo.git',
      git_raw_url: 'https://raw.example.com/demo',
      created_at: '2026-01-01T00:00:00Z',
    });

    expect(result).toEqual({
      id: 1,
      name: 'demo',
      gitUrl: 'https://example.com/demo.git',
      gitRawUrl: 'https://raw.example.com/demo',
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('updates a project by id, sending a snake_case body and mapping the response', () => {
    let result: unknown;
    service
      .update(1, { name: 'renamed', gitUrl: 'https://example.com/a.git', gitRawUrl: 'https://raw.example.com/a' })
      .subscribe((project) => (result = project));

    const req = httpMock.expectOne('/api/v1/projects/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      name: 'renamed',
      git_url: 'https://example.com/a.git',
      git_raw_url: 'https://raw.example.com/a',
    });
    req.flush({
      id: 1,
      name: 'renamed',
      git_url: 'https://example.com/a.git',
      git_raw_url: 'https://raw.example.com/a',
      created_at: '2026-01-01T00:00:00Z',
    });

    expect(result).toEqual({
      id: 1,
      name: 'renamed',
      gitUrl: 'https://example.com/a.git',
      gitRawUrl: 'https://raw.example.com/a',
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('deletes a project by id', () => {
    let completed = false;
    service.remove(1).subscribe(() => (completed = true));

    const req = httpMock.expectOne('/api/v1/projects/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(completed).toBe(true);
  });
});
