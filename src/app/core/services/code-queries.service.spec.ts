import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CodeQueriesService } from './code-queries.service';

describe('CodeQueriesService', () => {
  let service: CodeQueriesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CodeQueriesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts the question to the project-scoped endpoint and maps the DTOs (snake_case, except the camelCase gitRawUrl)', () => {
    let result: unknown;
    service.ask(7, 'where is retry logic?').subscribe((results) => (result = results));

    const req = httpMock.expectOne('/api/v1/projects/7/code-queries');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ question: 'where is retry logic?' });

    req.flush([
      {
        id: 1,
        source_file: 'src/foo.ts',
        gitRawUrl: 'https://forgejo.home.arpa/sauron/repo/raw/branch/main/src/foo.ts',
        kind: 'method',
        type_name: 'Foo',
        member: 'bar',
        embedding_text: 'function bar() {}',
        similarity: 0.87,
      },
    ]);

    expect(result).toEqual([
      {
        id: 1,
        sourceFile: 'src/foo.ts',
        gitRawUrl: 'https://forgejo.home.arpa/sauron/repo/raw/branch/main/src/foo.ts',
        kind: 'method',
        typeName: 'Foo',
        member: 'bar',
        embeddingText: 'function bar() {}',
        similarity: 0.87,
      },
    ]);
  });

  it('maps null sourceFile, gitRawUrl, typeName, and member through unchanged', () => {
    let result: unknown;
    service.ask(1, 'q').subscribe((results) => (result = results));

    httpMock.expectOne('/api/v1/projects/1/code-queries').flush([
      {
        id: 2,
        source_file: null,
        gitRawUrl: null,
        kind: 'file',
        type_name: null,
        member: null,
        embedding_text: 'text',
        similarity: 0.5,
      },
    ]);

    expect(result).toEqual([
      {
        id: 2,
        sourceFile: null,
        gitRawUrl: null,
        kind: 'file',
        typeName: null,
        member: null,
        embeddingText: 'text',
        similarity: 0.5,
      },
    ]);
  });

  it('sends active filters using snake_case keys and trimmed values', () => {
    service
      .ask(3, 'q', {
        kind: { operator: 'contains', value: ' method ' },
        namespace: { operator: 'not_contains', value: 'Legacy' },
        typeName: { operator: 'equals', value: 'Foo' },
      })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/projects/3/code-queries');
    expect(req.request.body).toEqual({
      question: 'q',
      kind: { operator: 'contains', value: 'method' },
      namespace: { operator: 'not_contains', value: 'Legacy' },
      type_name: { operator: 'equals', value: 'Foo' },
    });
    req.flush([]);
  });

  it('omits a filter whose value is blank', () => {
    service.ask(3, 'q', { kind: { operator: 'contains', value: '   ' } }).subscribe();

    const req = httpMock.expectOne('/api/v1/projects/3/code-queries');
    expect(req.request.body).toEqual({ question: 'q' });
    req.flush([]);
  });

  it('omits all filter keys when an empty filters object is passed', () => {
    service.ask(3, 'q', {}).subscribe();

    const req = httpMock.expectOne('/api/v1/projects/3/code-queries');
    expect(req.request.body).toEqual({ question: 'q' });
    req.flush([]);
  });

  it('sorts results by similarity, highest first, regardless of API order', () => {
    let result: { id: number; similarity: number }[] | undefined;
    service.ask(1, 'q').subscribe((results) => (result = results));

    httpMock.expectOne('/api/v1/projects/1/code-queries').flush([
      dto(1, 0.4),
      dto(2, 0.9),
      dto(3, 0.6),
    ]);

    expect(result?.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('keeps original relative order for results with equal similarity (stable sort)', () => {
    let result: { id: number; similarity: number }[] | undefined;
    service.ask(1, 'q').subscribe((results) => (result = results));

    httpMock.expectOne('/api/v1/projects/1/code-queries').flush([
      dto(1, 0.5),
      dto(2, 0.9),
      dto(3, 0.5),
    ]);

    expect(result?.map((r) => r.id)).toEqual([2, 1, 3]);
  });
});

function dto(id: number, similarity: number) {
  return {
    id,
    source_file: 'src/foo.ts',
    gitRawUrl: null,
    kind: 'method',
    type_name: null,
    member: null,
    embedding_text: 'text',
    similarity,
  };
}
