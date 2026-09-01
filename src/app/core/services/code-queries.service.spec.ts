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
});
