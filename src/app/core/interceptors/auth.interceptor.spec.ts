import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { KeycloakAuthService } from '../services/keycloak-auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;

  function setup(enabled: boolean, token: string | undefined): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: KeycloakAuthService, useValue: { enabled: () => enabled, token: () => token } },
      ],
    });
    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('attaches a Bearer token to /api requests when Keycloak is enabled', () => {
    setup(true, 'the-access-token');

    httpClient.get('/api/code-queries/feedback/stats').subscribe();

    const req = httpMock.expectOne('/api/code-queries/feedback/stats');
    expect(req.request.headers.get('Authorization')).toBe('Bearer the-access-token');
    req.flush({});
  });

  it('leaves /api requests untouched when Keycloak is disabled', () => {
    setup(false, undefined);

    httpClient.get('/api/code-queries/feedback/stats').subscribe();

    const req = httpMock.expectOne('/api/code-queries/feedback/stats');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('attaches a Bearer token to /version too, since the API requires auth on it as well', () => {
    setup(true, 'the-access-token');

    httpClient.get('/version').subscribe();

    const req = httpMock.expectOne('/version');
    expect(req.request.headers.get('Authorization')).toBe('Bearer the-access-token');
    req.flush({});
  });

  it('leaves other non-/api requests untouched even when enabled', () => {
    setup(true, 'the-access-token');

    httpClient.get('/other').subscribe();

    const req = httpMock.expectOne('/other');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('does not attach a header when enabled but no token is available yet', () => {
    setup(true, undefined);

    httpClient.get('/api/code-queries/feedback/stats').subscribe();

    const req = httpMock.expectOne('/api/code-queries/feedback/stats');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });
});
