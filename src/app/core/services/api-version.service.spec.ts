import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SUPPRESS_ERROR_TOAST } from '../interceptors/error-toast.interceptor';
import { ApiVersionService } from './api-version.service';

describe('ApiVersionService', () => {
  let service: ApiVersionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiVersionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('resolves the version string from /version', () => {
    let result: unknown;
    service.get().subscribe((version) => (result = version));

    const req = httpMock.expectOne('/version');
    expect(req.request.method).toBe('GET');
    req.flush({ version: '0.1.3-1' });

    expect(result).toBe('0.1.3-1');
  });

  it('resolves an empty string when the API returns a null version', () => {
    let result: unknown;
    service.get().subscribe((version) => (result = version));

    httpMock.expectOne('/version').flush({ version: null });

    expect(result).toBe('');
  });

  it('resolves an empty string instead of erroring when the request fails', () => {
    let result: unknown;
    service.get().subscribe((version) => (result = version));

    httpMock.expectOne('/version').flush('not found', { status: 404, statusText: 'Not Found' });

    expect(result).toBe('');
  });

  it('suppresses the global error toast for this request', () => {
    service.get().subscribe();

    const req = httpMock.expectOne('/version');
    expect(req.request.context.get(SUPPRESS_ERROR_TOAST)).toBe(true);
    req.flush({ version: '0.1.3-1' });
  });
});
