import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { VersionService } from './version.service';

describe('VersionService', () => {
  let service: VersionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VersionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('resolves the version string from /version.json', () => {
    let result: unknown;
    service.get().subscribe((version) => (result = version));

    const req = httpMock.expectOne('/version.json');
    expect(req.request.method).toBe('GET');
    req.flush({ version: 'v1.2.3' });

    expect(result).toBe('v1.2.3');
  });

  it('resolves an empty string instead of erroring when the request fails', () => {
    let result: unknown;
    service.get().subscribe((version) => (result = version));

    httpMock.expectOne('/version.json').flush('not found', { status: 404, statusText: 'Not Found' });

    expect(result).toBe('');
  });
});
