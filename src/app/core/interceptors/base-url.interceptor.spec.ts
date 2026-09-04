import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService } from '../services/config.service';
import { baseUrlInterceptor } from './base-url.interceptor';

describe('baseUrlInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;

  function setup(apiBaseUrl: string): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([baseUrlInterceptor])),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: { apiBaseUrl: () => apiBaseUrl } },
      ],
    });
    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('prefixes /api requests with the configured base URL', () => {
    setup('https://example.com');

    httpClient.get('/api/v1/projects').subscribe();

    httpMock.expectOne('https://example.com/api/v1/projects').flush([]);
  });

  it('leaves /api requests untouched when the base URL is empty', () => {
    setup('');

    httpClient.get('/api/v1/projects').subscribe();

    httpMock.expectOne('/api/v1/projects').flush([]);
  });

  it('leaves non-/api requests untouched regardless of the base URL', () => {
    setup('https://example.com');

    httpClient.get('/assets/foo.json').subscribe();

    httpMock.expectOne('/assets/foo.json').flush({});
  });

  it('prefixes /version requests with the configured base URL, despite not being /api-prefixed', () => {
    setup('https://example.com');

    httpClient.get('/version').subscribe();

    httpMock.expectOne('https://example.com/version').flush({});
  });

  it('leaves /version requests untouched when the base URL is empty', () => {
    setup('');

    httpClient.get('/version').subscribe();

    httpMock.expectOne('/version').flush({});
  });
});
