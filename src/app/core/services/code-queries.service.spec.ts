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

  it('posts the question and project_id to the project-agnostic endpoint and maps the DTOs (snake_case)', () => {
    let result: unknown;
    service.ask(7, 'where is retry logic?').subscribe((results) => (result = results));

    const req = httpMock.expectOne('/api/v1/code-queries');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ question: 'where is retry logic?', project_id: 7 });

    req.flush({
      matches: [
        {
          id: 1,
          kind: 'method',
          symbol_container: 'Billing.Services',
          symbol_name: 'RetryPayment',
          symbol_qualified_name: 'Billing.Services.PaymentService.RetryPayment',
          symbol_canonical_name: 'RetryPayment(int, bool)',
          source_file: 'src/foo.ts',
          git_url: 'https://forgejo.example/demo',
          git_raw_url: 'https://forgejo.example/demo/raw/main/src/foo.ts',
          embedding_text: 'function bar() {}',
          similarity: 0.87,
          rerank_score: 0.91,
          relations: [
            { from_id: 1, to_id: 42, relation_type: 'calls', target_symbol: 'Charge', resolution_origin: 'static' },
          ],
        },
      ],
      graph: { nodes: [], edges: [], truncated: false },
    });

    expect(result).toEqual([
      {
        id: 1,
        kind: 'method',
        symbolContainer: 'Billing.Services',
        symbolName: 'RetryPayment',
        symbolQualifiedName: 'Billing.Services.PaymentService.RetryPayment',
        symbolCanonicalName: 'RetryPayment(int, bool)',
        sourceFile: 'src/foo.ts',
        gitUrl: 'https://forgejo.example/demo',
        gitRawUrl: 'https://forgejo.example/demo/raw/main/src/foo.ts',
        embeddingText: 'function bar() {}',
        similarity: 0.87,
        rerankScore: 0.91,
        relations: [
          { fromId: 1, toId: 42, relationType: 'calls', targetSymbol: 'Charge', resolutionOrigin: 'static' },
        ],
      },
    ]);
  });

  it('omits project_id when searching across all projects', () => {
    service.ask(null, 'where is retry logic?').subscribe();

    const req = httpMock.expectOne('/api/v1/code-queries');
    expect(req.request.body).toEqual({ question: 'where is retry logic?' });
    req.flush({ matches: [], graph: { nodes: [], edges: [], truncated: false } });
  });

  it('maps null fields and a null/absent relations array through unchanged', () => {
    let result: unknown;
    service.ask(1, 'q').subscribe((results) => (result = results));

    httpMock.expectOne('/api/v1/code-queries').flush({
      matches: [
        {
          id: 2,
          kind: null,
          symbol_container: null,
          symbol_name: null,
          symbol_qualified_name: null,
          symbol_canonical_name: null,
          source_file: null,
          git_url: null,
          git_raw_url: null,
          embedding_text: null,
          similarity: 0.5,
          rerank_score: null,
          relations: null,
        },
      ],
      graph: { nodes: [], edges: [], truncated: false },
    });

    expect(result).toEqual([
      {
        id: 2,
        kind: null,
        symbolContainer: null,
        symbolName: null,
        symbolQualifiedName: null,
        symbolCanonicalName: null,
        sourceFile: null,
        gitUrl: null,
        gitRawUrl: null,
        embeddingText: null,
        similarity: 0.5,
        rerankScore: null,
        relations: [],
      },
    ]);
  });

  it('returns an empty array when matches is null', () => {
    let result: unknown;
    service.ask(1, 'q').subscribe((results) => (result = results));

    httpMock.expectOne('/api/v1/code-queries').flush({ matches: null, graph: { nodes: [], edges: [], truncated: false } });

    expect(result).toEqual([]);
  });

  it('sends active filters using their new snake_case keys and trimmed values', () => {
    service
      .ask(3, 'q', {
        kind: ' method ',
        qualifiedName: { operator: 'not_contains', value: ' Legacy ' },
        minSimilarity: 0.4,
        limit: 5,
      })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/code-queries');
    expect(req.request.body).toEqual({
      question: 'q',
      project_id: 3,
      kind: 'method',
      qualified_name: { operator: 'not_contains', value: 'Legacy' },
      min_similarity: 0.4,
      limit: 5,
    });
    req.flush({ matches: [], graph: { nodes: [], edges: [], truncated: false } });
  });

  it('omits a filter whose value is blank', () => {
    service.ask(3, 'q', { kind: '   ', qualifiedName: { operator: 'contains', value: '   ' } }).subscribe();

    const req = httpMock.expectOne('/api/v1/code-queries');
    expect(req.request.body).toEqual({ question: 'q', project_id: 3 });
    req.flush({ matches: [], graph: { nodes: [], edges: [], truncated: false } });
  });

  it('omits all optional keys when an empty filters object is passed', () => {
    service.ask(3, 'q', {}).subscribe();

    const req = httpMock.expectOne('/api/v1/code-queries');
    expect(req.request.body).toEqual({ question: 'q', project_id: 3 });
    req.flush({ matches: [], graph: { nodes: [], edges: [], truncated: false } });
  });

  it('orders results by descending rerank score, placing results without a rerank score last', () => {
    let result: { id: number; similarity: number }[] | undefined;
    service.ask(1, 'q').subscribe((results) => (result = results));

    httpMock.expectOne('/api/v1/code-queries').flush({
      matches: [dto(1, 0.4, 0.2), dto(2, 0.9, null), dto(3, 0.6, 0.95), dto(4, 0.8, 0.5)],
      graph: { nodes: [], edges: [], truncated: false },
    });

    expect(result?.map((r) => r.id)).toEqual([3, 4, 1, 2]);
  });

  it('submits useful feedback without a reason', () => {
    service
      .submitFeedback(7, { question: 'where is retry logic?', useful: true, similarities: [0.9, 0.5], user: 'Ada' })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/projects/7/code-queries/feedback');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      question: 'where is retry logic?',
      useful: true,
      similarities: [0.9, 0.5],
      user: 'Ada',
    });
    req.flush({});
  });

  it('includes the reason when submitting not-useful feedback', () => {
    service
      .submitFeedback(7, {
        question: 'q',
        useful: false,
        similarities: [],
        user: 'Ada',
        reason: 'Wrong file',
      })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/projects/7/code-queries/feedback');
    expect(req.request.body).toEqual({
      question: 'q',
      useful: false,
      similarities: [],
      user: 'Ada',
      reason: 'Wrong file',
    });
    req.flush({});
  });

  it('omits an empty reason', () => {
    service
      .submitFeedback(7, { question: 'q', useful: false, similarities: [], user: 'Ada', reason: '' })
      .subscribe();

    const req = httpMock.expectOne('/api/v1/projects/7/code-queries/feedback');
    expect(req.request.body).toEqual({ question: 'q', useful: false, similarities: [], user: 'Ada' });
    req.flush({});
  });
});

function dto(id: number, similarity: number, rerankScore: number | null) {
  return {
    id,
    kind: 'method',
    symbol_container: null,
    symbol_name: null,
    symbol_qualified_name: null,
    symbol_canonical_name: null,
    source_file: 'src/foo.ts',
    git_url: null,
    git_raw_url: null,
    embedding_text: 'text',
    similarity,
    rerank_score: rerankScore,
    relations: [],
  };
}
