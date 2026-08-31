import { HttpClient, HttpContext, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ToastService } from '../services/toast.service';
import { SUPPRESS_ERROR_TOAST, errorToastInterceptor } from './error-toast.interceptor';

describe('errorToastInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let toast: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    toast = { error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorToastInterceptor])),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
      ],
    });
    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('toasts the problem detail message when present', () => {
    httpClient.get('/api/v1/projects/999').subscribe({ error: () => {} });

    httpMock
      .expectOne('/api/v1/projects/999')
      .flush({ detail: 'Project not found', title: 'Not Found' }, { status: 404, statusText: 'Not Found' });

    expect(toast.error).toHaveBeenCalledWith('Project not found');
  });

  it('falls back to the title when detail is missing', () => {
    httpClient.get('/api/v1/projects/999').subscribe({ error: () => {} });

    httpMock.expectOne('/api/v1/projects/999').flush({ title: 'Not Found' }, { status: 404, statusText: 'Not Found' });

    expect(toast.error).toHaveBeenCalledWith('Not Found');
  });

  it('falls back to a generic message when neither detail nor title are present', () => {
    httpClient.get('/api/v1/projects/999').subscribe({ error: () => {} });

    httpMock.expectOne('/api/v1/projects/999').flush({}, { status: 500, statusText: 'Server Error' });

    expect(toast.error).toHaveBeenCalledWith('Something went wrong talking to the API. Please try again.');
  });

  it('falls back to a generic message for a non-HttpErrorResponse failure', () => {
    httpClient.get('/api/v1/projects/999').subscribe({ error: () => {} });

    httpMock.expectOne('/api/v1/projects/999').error(new ProgressEvent('error'));

    expect(toast.error).toHaveBeenCalledWith('Something went wrong talking to the API. Please try again.');
  });

  it('does not toast when the request opts out via SUPPRESS_ERROR_TOAST', () => {
    httpClient
      .get('/version.json', { context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true) })
      .subscribe({ error: () => {} });

    httpMock.expectOne('/version.json').flush('not found', { status: 404, statusText: 'Not Found' });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('re-throws the error after toasting it', () => {
    let captured: unknown;
    httpClient.get('/api/v1/projects/999').subscribe({ error: (err: unknown) => (captured = err) });

    httpMock.expectOne('/api/v1/projects/999').flush({ detail: 'boom' }, { status: 400, statusText: 'Bad Request' });

    expect(captured).toBeInstanceOf(HttpErrorResponse);
  });
});
