import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { DocumentLanguage, DocumentType } from '../models/document-master-data';
import { DocumentLanguagesService } from './document-languages.service';
import { DocumentTypesService } from './document-types.service';

const TYPES_URL = '/api/doc-rag/api/v1/document-types';
const LANGUAGES_URL = '/api/doc-rag/api/v1/document-languages';

function typeDto(id: string, name: string) {
  return { id, name, createdAt: '2026-10-15T03:08:00Z', updatedAt: '2026-10-15T03:08:00Z' };
}

describe('document master-data services', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('DocumentTypesService', () => {
    let service: DocumentTypesService;

    beforeEach(() => (service = TestBed.inject(DocumentTypesService)));

    it('follows the cursor until the last page and flattens the catalog', () => {
      let result: DocumentType[] = [];
      service.list().subscribe((items) => (result = items));

      const first = httpMock.expectOne((r) => r.url === TYPES_URL && !r.params.has('cursor'));
      first.flush({ data: [typeDto('1', 'manual')], nextCursor: 'c2' });
      const second = httpMock.expectOne(
        (r) => r.url === TYPES_URL && r.params.get('cursor') === 'c2',
      );
      second.flush({ data: [typeDto('2', 'norma')], nextCursor: null });

      expect(result.map((t) => t.name)).toEqual(['manual', 'norma']);
    });

    it('serves repeated reads from cache, so many comboboxes cost one request', () => {
      service.list().subscribe();
      httpMock
        .expectOne((r) => r.url === TYPES_URL)
        .flush({ data: [typeDto('1', 'manual')], nextCursor: null });

      service.list().subscribe();
      service.search('man').subscribe();

      httpMock.expectNone(TYPES_URL);
    });

    it('searches the cached catalog case-insensitively, in alphabetical order', () => {
      let names: string[] = [];
      service.search('MA').subscribe((items) => (names = items.map((t) => t.name)));
      httpMock
        .expectOne((r) => r.url === TYPES_URL)
        .flush({
          data: [typeDto('1', 'norma'), typeDto('2', 'Manual'), typeDto('3', 'laudo')],
          nextCursor: null,
        });

      expect(names).toEqual(['Manual', 'norma']);
    });

    it('drops the cache after a write so the next read refetches', () => {
      service.list().subscribe();
      httpMock
        .expectOne((r) => r.url === TYPES_URL)
        .flush({ data: [typeDto('1', 'manual')], nextCursor: null });

      let created: DocumentType | undefined;
      service.create('norma').subscribe((type) => (created = type));
      const post = httpMock.expectOne(TYPES_URL);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({ name: 'norma' });
      post.flush(typeDto('2', 'norma'), { status: 201, statusText: 'Created' });
      expect(created?.name).toBe('norma');

      service.list().subscribe();
      httpMock.expectOne((r) => r.url === TYPES_URL).flush({ data: [], nextCursor: null });
    });

    it('renames with PUT and deletes with DELETE', () => {
      service.update('1', 'manual v2').subscribe();
      const put = httpMock.expectOne(`${TYPES_URL}/1`);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ name: 'manual v2' });
      put.flush(typeDto('1', 'manual v2'));

      service.remove('1').subscribe();
      const del = httpMock.expectOne(`${TYPES_URL}/1`);
      expect(del.request.method).toBe('DELETE');
      del.flush(null, { status: 204, statusText: 'No Content' });
    });
  });

  describe('DocumentLanguagesService', () => {
    it('sends and reads the BCP 47 `code`', () => {
      const service = TestBed.inject(DocumentLanguagesService);

      let created: DocumentLanguage | undefined;
      service.create('pt-BR').subscribe((language) => (created = language));
      const post = httpMock.expectOne(LANGUAGES_URL);
      expect(post.request.body).toEqual({ code: 'pt-BR' });
      post.flush(
        { id: '1', code: 'pt-BR', createdAt: 'x', updatedAt: 'x' },
        { status: 201, statusText: 'Created' },
      );

      expect(created?.code).toBe('pt-BR');
    });
  });
});
