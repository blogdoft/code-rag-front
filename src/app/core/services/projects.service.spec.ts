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

  it('maps camelCase DTOs to camelCase Project models, requesting the max page size', () => {
    let result: unknown;
    service.list().subscribe((projects) => (result = projects));

    const req = httpMock.expectOne((r) => r.url === '/api/indexer/projects');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('page_size')).toBe('100');
    req.flush({
      items: [
        {
          id: 1,
          name: 'demo',
          embeddingModel: 'text-embedding-3-small',
          embeddingDimensions: 1536,
          gitUrl: 'https://forgejo.example/demo',
          gitRawUrl: 'https://forgejo.example/demo/raw/main/',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
      page: 0,
      pageSize: 100,
      totalCount: 1,
      totalPages: 1,
    });

    expect(result).toEqual([
      {
        id: 1,
        name: 'demo',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
        gitUrl: 'https://forgejo.example/demo',
        gitRawUrl: 'https://forgejo.example/demo/raw/main/',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);
  });

  it('follows pagination across multiple pages and flattens the items, in order', () => {
    let result: { id: number }[] | undefined;
    service.list().subscribe((projects) => (result = projects));

    const firstReq = httpMock.expectOne(
      (r) => r.url === '/api/indexer/projects' && r.params.get('page') === '0',
    );
    firstReq.flush({
      items: [projectDto(1), projectDto(2)],
      page: 0,
      pageSize: 100,
      totalCount: 3,
      totalPages: 2,
    });

    const secondReq = httpMock.expectOne(
      (r) => r.url === '/api/indexer/projects' && r.params.get('page') === '1',
    );
    secondReq.flush({
      items: [projectDto(3)],
      page: 1,
      pageSize: 100,
      totalCount: 3,
      totalPages: 2,
    });

    expect(result?.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('returns an empty array when there are no projects', () => {
    let result: unknown;
    service.list().subscribe((projects) => (result = projects));

    httpMock
      .expectOne((r) => r.url === '/api/indexer/projects')
      .flush({ items: [], page: 0, pageSize: 100, totalCount: 0, totalPages: 0 });

    expect(result).toEqual([]);
  });

  it('creates a project, sending a camelCase body and mapping the response', () => {
    let result: unknown;
    service
      .create({
        name: 'demo',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
        gitUrl: 'https://forgejo.example/demo',
        gitRawUrl: 'https://forgejo.example/demo/raw/main/',
      })
      .subscribe((project) => (result = project));

    const req = httpMock.expectOne('/api/indexer/projects');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'demo',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      gitUrl: 'https://forgejo.example/demo',
      gitRawUrl: 'https://forgejo.example/demo/raw/main/',
    });
    req.flush({
      id: 1,
      name: 'demo',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      gitUrl: 'https://forgejo.example/demo',
      gitRawUrl: 'https://forgejo.example/demo/raw/main/',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    expect(result).toEqual({
      id: 1,
      name: 'demo',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      gitUrl: 'https://forgejo.example/demo',
      gitRawUrl: 'https://forgejo.example/demo/raw/main/',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
  });

  it('updates a project by id, sending a camelCase body and mapping the response', () => {
    let result: unknown;
    service
      .update(1, {
        name: 'renamed',
        embeddingModel: 'text-embedding-3-large',
        embeddingDimensions: 3072,
        gitUrl: null,
        gitRawUrl: null,
      })
      .subscribe((project) => (result = project));

    const req = httpMock.expectOne('/api/indexer/projects/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      name: 'renamed',
      embeddingModel: 'text-embedding-3-large',
      embeddingDimensions: 3072,
      gitUrl: null,
      gitRawUrl: null,
    });
    req.flush({
      id: 1,
      name: 'renamed',
      embeddingModel: 'text-embedding-3-large',
      embeddingDimensions: 3072,
      gitUrl: null,
      gitRawUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });

    expect(result).toEqual({
      id: 1,
      name: 'renamed',
      embeddingModel: 'text-embedding-3-large',
      embeddingDimensions: 3072,
      gitUrl: null,
      gitRawUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });
  });

  it('deletes a project by id', () => {
    let completed = false;
    service.remove(1).subscribe(() => (completed = true));

    const req = httpMock.expectOne('/api/indexer/projects/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(completed).toBe(true);
  });
});

function projectDto(id: number) {
  return {
    id,
    name: `project-${id}`,
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
    gitUrl: null,
    gitRawUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}
