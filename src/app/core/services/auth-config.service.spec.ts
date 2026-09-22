import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { AuthConfig } from './auth-config.service';
import { AuthConfigService } from './auth-config.service';

describe('AuthConfigService', () => {
  let service: AuthConfigService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('resolves the parsed config when Keycloak is enabled', () => {
    let result: AuthConfig | undefined;
    service.get().subscribe((config) => (result = config));

    const req = httpMock.expectOne('auth-config.json');
    expect(req.request.method).toBe('GET');
    req.flush({
      enabled: true,
      url: 'https://sso.example.com',
      realm: 'code-brain',
      clientId: 'front',
    });

    expect(result).toEqual({
      enabled: true,
      url: 'https://sso.example.com',
      realm: 'code-brain',
      clientId: 'front',
    });
  });

  it('resolves disabled when the response says so', () => {
    let result: AuthConfig | undefined;
    service.get().subscribe((config) => (result = config));

    httpMock
      .expectOne('auth-config.json')
      .flush({ enabled: false, url: '', realm: '', clientId: '' });

    expect(result?.enabled).toBe(false);
  });

  it('degrades to disabled instead of erroring when the request fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let result: AuthConfig | undefined;
    service.get().subscribe((config) => (result = config));

    httpMock
      .expectOne('auth-config.json')
      .flush('not found', { status: 404, statusText: 'Not Found' });

    expect(result).toEqual({ enabled: false, url: '', realm: '', clientId: '' });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
