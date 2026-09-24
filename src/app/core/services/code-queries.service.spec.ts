import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CodeQueriesService } from './code-queries.service';

const PROJECT_1 = '00000000-0000-4000-8000-000000000001';
const PROJECT_3 = '00000000-0000-4000-8000-000000000003';
const PROJECT_7 = '00000000-0000-4000-8000-000000000007';

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

  it('posts the question and projectId to the project-agnostic endpoint and maps the DTOs (camelCase)', () => {
    let result: unknown;
    service.ask(PROJECT_7, 'where is retry logic?').subscribe((results) => (result = results));

    const req = httpMock.expectOne('/api/code-queries');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ question: 'where is retry logic?', projectId: PROJECT_7 });

    req.flush({
      matches: [
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
            {
              fromId: 1,
              toId: 42,
              relationType: 'calls',
              targetSymbol: 'Charge',
              resolutionOrigin: 'static',
            },
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
          {
            fromId: 1,
            toId: 42,
            relationType: 'calls',
            targetSymbol: 'Charge',
            resolutionOrigin: 'static',
          },
        ],
      },
    ]);
  });

  it('omits projectId when searching across all projects', () => {
    service.ask(null, 'where is retry logic?').subscribe();

    const req = httpMock.expectOne('/api/code-queries');
    expect(req.request.body).toEqual({ question: 'where is retry logic?' });
    req.flush({ matches: [], graph: { nodes: [], edges: [], truncated: false } });
  });

  it('maps null fields and a null/absent relations array through unchanged', () => {
    let result: unknown;
    service.ask(PROJECT_1, 'q').subscribe((results) => (result = results));

    httpMock.expectOne('/api/code-queries').flush({
      matches: [
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
    service.ask(PROJECT_1, 'q').subscribe((results) => (result = results));

    httpMock
      .expectOne('/api/code-queries')
      .flush({ matches: null, graph: { nodes: [], edges: [], truncated: false } });

    expect(result).toEqual([]);
  });

  it('sends active filters using camelCase keys and trimmed values', () => {
    service
      .ask(PROJECT_3, 'q', {
        kind: ' method ',
        qualifiedName: { operator: 'notContains', value: ' Legacy ' },
        minSimilarity: 0.4,
        limit: 5,
      })
      .subscribe();

    const req = httpMock.expectOne('/api/code-queries');
    expect(req.request.body).toEqual({
      question: 'q',
      projectId: PROJECT_3,
      kind: 'method',
      qualifiedName: { operator: 'notContains', value: 'Legacy' },
      minSimilarity: 0.4,
      limit: 5,
    });
    req.flush({ matches: [], graph: { nodes: [], edges: [], truncated: false } });
  });

  it('omits a filter whose value is blank', () => {
    service
      .ask(PROJECT_3, 'q', { kind: '   ', qualifiedName: { operator: 'contains', value: '   ' } })
      .subscribe();

    const req = httpMock.expectOne('/api/code-queries');
    expect(req.request.body).toEqual({ question: 'q', projectId: PROJECT_3 });
    req.flush({ matches: [], graph: { nodes: [], edges: [], truncated: false } });
  });

  it('omits all optional keys when an empty filters object is passed', () => {
    service.ask(PROJECT_3, 'q', {}).subscribe();

    const req = httpMock.expectOne('/api/code-queries');
    expect(req.request.body).toEqual({ question: 'q', projectId: PROJECT_3 });
    req.flush({ matches: [], graph: { nodes: [], edges: [], truncated: false } });
  });

  it('orders results by descending rerank score, placing results without a rerank score last', () => {
    let result: { id: number; similarity: number }[] | undefined;
    service.ask(PROJECT_1, 'q').subscribe((results) => (result = results));

    httpMock.expectOne('/api/code-queries').flush({
      matches: [dto(1, 0.4, 0.2), dto(2, 0.9, null), dto(3, 0.6, 0.95), dto(4, 0.8, 0.5)],
      graph: { nodes: [], edges: [], truncated: false },
    });

    expect(result?.map((r) => r.id)).toEqual([3, 4, 1, 2]);
  });

  it('submits useful feedback without a reason', () => {
    service
      .submitFeedback(PROJECT_7, {
        question: 'where is retry logic?',
        useful: true,
        similarities: [0.9, 0.5],
        user: 'Ada',
      })
      .subscribe();

    const req = httpMock.expectOne('/api/code-queries/feedback');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      projectId: PROJECT_7,
      question: 'where is retry logic?',
      useful: true,
      similarities: [0.9, 0.5],
      user: 'Ada',
    });
    req.flush({});
  });

  it('includes the reason when submitting not-useful feedback', () => {
    service
      .submitFeedback(PROJECT_7, {
        question: 'q',
        useful: false,
        similarities: [],
        user: 'Ada',
        reason: 'Wrong file',
      })
      .subscribe();

    const req = httpMock.expectOne('/api/code-queries/feedback');
    expect(req.request.body).toEqual({
      projectId: PROJECT_7,
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
      .submitFeedback(PROJECT_7, {
        question: 'q',
        useful: false,
        similarities: [],
        user: 'Ada',
        reason: '',
      })
      .subscribe();

    const req = httpMock.expectOne('/api/code-queries/feedback');
    expect(req.request.body).toEqual({
      projectId: PROJECT_7,
      question: 'q',
      useful: false,
      similarities: [],
      user: 'Ada',
    });
    req.flush({});
  });
});

function dto(id: number, similarity: number, rerankScore: number | null) {
  return {
    id,
    kind: 'method',
    symbolContainer: null,
    symbolName: null,
    symbolQualifiedName: null,
    symbolCanonicalName: null,
    sourceFile: 'src/foo.ts',
    gitUrl: null,
    gitRawUrl: null,
    embeddingText: 'text',
    similarity,
    rerankScore: rerankScore,
    relations: [],
  };
}
