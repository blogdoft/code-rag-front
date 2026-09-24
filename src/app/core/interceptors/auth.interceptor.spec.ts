import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { KeycloakAuthService } from '../services/keycloak-auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;

  let login: ReturnType<typeof vi.fn>;
  let refreshToken: ReturnType<typeof vi.fn>;

  function setup(enabled: boolean, token: string | undefined, refreshedToken?: string): void {
    login = vi.fn();
    refreshToken = vi.fn().mockResolvedValue(refreshedToken);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: KeycloakAuthService,
          useValue: { enabled: () => enabled, token: () => token, login, refreshToken },
        },
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

  it('refreshes the token and retries once when an /api request answers 401', async () => {
    setup(true, 'old-token', 'new-token');
    const onNext = vi.fn();

    httpClient.get('/api/code-queries/feedback/stats').subscribe(onNext);

    httpMock
      .expectOne('/api/code-queries/feedback/stats')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await vi.waitFor(() => expect(refreshToken).toHaveBeenCalledTimes(1));
    const retry = httpMock.expectOne('/api/code-queries/feedback/stats');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-token');
    retry.flush({ ok: true });

    expect(onNext).toHaveBeenCalledWith({ ok: true });
    expect(login).not.toHaveBeenCalled();
  });

  it('goes to the Keycloak login when the refresh fails', async () => {
    setup(true, 'old-token', undefined);
    const onError = vi.fn();

    httpClient.get('/api/code-queries/feedback/stats').subscribe({ error: onError });

    httpMock
      .expectOne('/api/code-queries/feedback/stats')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await vi.waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalled();
  });

  it('goes to the Keycloak login when the retry answers 401 again, without retrying twice', async () => {
    setup(true, 'old-token', 'new-token');
    const onError = vi.fn();

    httpClient.get('/api/code-queries/feedback/stats').subscribe({ error: onError });

    httpMock
      .expectOne('/api/code-queries/feedback/stats')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await vi.waitFor(() => expect(refreshToken).toHaveBeenCalled());
    httpMock
      .expectOne('/api/code-queries/feedback/stats')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(login).toHaveBeenCalledTimes(1);
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalled();
  });

  it('does not trigger login for non-401 errors', () => {
    setup(true, 'the-access-token');

    httpClient.get('/api/code-queries/feedback/stats').subscribe({ error: () => {} });

    httpMock
      .expectOne('/api/code-queries/feedback/stats')
      .flush(null, { status: 500, statusText: 'Server Error' });
    expect(login).not.toHaveBeenCalled();
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('does not trigger login on a 401 when Keycloak is disabled', () => {
    setup(false, undefined);

    httpClient.get('/api/code-queries/feedback/stats').subscribe({ error: () => {} });

    httpMock
      .expectOne('/api/code-queries/feedback/stats')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(login).not.toHaveBeenCalled();
  });
});
