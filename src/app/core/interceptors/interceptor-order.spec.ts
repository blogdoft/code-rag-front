import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService } from '../services/config.service';
import { KeycloakAuthService } from '../services/keycloak-auth.service';
import { authInterceptor } from './auth.interceptor';
import { baseUrlInterceptor } from './base-url.interceptor';

/**
 * authInterceptor matches on the request's original '/api'-relative url; baseUrlInterceptor
 * rewrites that url to be prefixed with the configured API base URL (e.g. '/code-brain' in
 * production, since that's this app's own <base href> there - see ConfigService). If auth ran
 * after base-url, its '/api' prefix check would never match once the base URL is non-empty and
 * the Authorization header would silently never be attached - see app.config.ts's provider order.
 *
 * Exercised here against every endpoint the app's services actually call (not just one sample
 * URL), since a future change to any one service is what this regression-guards against.
 */
describe('authInterceptor + baseUrlInterceptor ordering', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;

  function setup(apiBaseUrl: string): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, baseUrlInterceptor])),
        provideHttpClientTesting(),
        {
          provide: KeycloakAuthService,
          useValue: { enabled: () => true, token: () => 'the-access-token' },
        },
        { provide: ConfigService, useValue: { apiBaseUrl: () => apiBaseUrl } },
      ],
    });
    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    httpMock.verify();
  });

  const apiEndpoints: Array<{
    label: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
  }> = [
    // CodeQueriesService
    { label: 'code-queries ask', method: 'POST', url: '/api/code-queries' },
    { label: 'code-queries feedback', method: 'POST', url: '/api/code-queries/feedback' },
    // FeedbackStatsService
    { label: 'feedback stats', method: 'GET', url: '/api/code-queries/feedback/stats' },
    { label: 'feedback export', method: 'GET', url: '/api/code-queries/feedback/export' },
    // ProjectsService
    { label: 'projects list', method: 'GET', url: '/api/indexer/projects' },
    { label: 'projects create', method: 'POST', url: '/api/indexer/projects' },
    { label: 'projects update', method: 'PUT', url: '/api/indexer/projects/123' },
    { label: 'projects delete', method: 'DELETE', url: '/api/indexer/projects/123' },
    // CiirUploadsService
    { label: 'ciir-uploads submit', method: 'POST', url: '/api/indexer/ciir-uploads' },
    { label: 'ciir-uploads status', method: 'GET', url: '/api/indexer/ciir-uploads/upload-1' },
    { label: 'indexation status', method: 'GET', url: '/api/indexer/indexations/indexation-1' },
  ];

  it.each(apiEndpoints)(
    'attaches the Authorization header to $label ($method $url), base URL prefix and all',
    ({ method, url }) => {
      setup('/code-brain');

      httpClient.request(method, url).subscribe();

      const req = httpMock.expectOne(`/code-brain${url}`);
      expect(req.request.headers.get('Authorization')).toBe('Bearer the-access-token');
      req.flush({});
    },
  );

  const nonApiEndpoints: Array<{ label: string; url: string; expectedUrl: string }> = [
    // ApiVersionService - unauthenticated diagnostic endpoint, deliberately excluded.
    { label: '/version', url: '/version', expectedUrl: '/code-brain/version' },
    // VersionService / AuthConfigService - static assets resolved relative to <base href>, never
    // '/api'-prefixed, so neither interceptor should touch them.
    { label: 'version.json', url: 'version.json', expectedUrl: 'version.json' },
    { label: 'auth-config.json', url: 'auth-config.json', expectedUrl: 'auth-config.json' },
  ];

  it.each(nonApiEndpoints)(
    'does not attach the Authorization header to $label',
    ({ url, expectedUrl }) => {
      setup('/code-brain');

      httpClient.get(url).subscribe();

      const req = httpMock.expectOne(expectedUrl);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    },
  );
});
