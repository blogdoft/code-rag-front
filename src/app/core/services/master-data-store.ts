import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, EMPTY, expand, map, reduce, shareReplay } from 'rxjs';

interface PageDto<D> {
  data: D[] | null;
  nextCursor: string | null;
}

const PAGE_SIZE = 100;

/**
 * Shared plumbing of the Doc RAG master-data endpoints (document types and languages): they list
 * newest-first with an opaque cursor and have no name filter, so the whole (small) catalog is
 * fetched once, cached, and searched in memory. Any write drops the cache.
 */
export abstract class MasterDataStore<D, T> {
  private cache$: Observable<T[]> | null = null;

  protected constructor(
    protected readonly http: HttpClient,
    private readonly url: string,
    private readonly toModel: (dto: D) => T,
    private readonly textOf: (item: T) => string,
  ) {}

  /** The full catalog; served from cache unless `fresh` is set. */
  list(fresh = false): Observable<T[]> {
    if (fresh || !this.cache$) {
      this.cache$ = this.fetchAll().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.cache$;
  }

  /** Case-insensitive "contains" over the cached catalog, in alphabetical order. */
  search(query: string): Observable<T[]> {
    const needle = query.trim().toLowerCase();
    return this.list().pipe(
      map((items) =>
        items
          .filter((item) => this.textOf(item).toLowerCase().includes(needle))
          .sort((a, b) => this.textOf(a).localeCompare(this.textOf(b))),
      ),
    );
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`).pipe(map(() => this.invalidate()));
  }

  protected post(body: unknown): Observable<T> {
    return this.http.post<D>(this.url, body).pipe(map((dto) => this.written(dto)));
  }

  protected put(id: string, body: unknown): Observable<T> {
    return this.http.put<D>(`${this.url}/${id}`, body).pipe(map((dto) => this.written(dto)));
  }

  private written(dto: D): T {
    this.invalidate();
    return this.toModel(dto);
  }

  private invalidate(): void {
    this.cache$ = null;
  }

  private fetchAll(): Observable<T[]> {
    return this.fetchPage(null).pipe(
      expand((page) => (page.nextCursor ? this.fetchPage(page.nextCursor) : EMPTY)),
      reduce<PageDto<D>, D[]>((all, page) => [...all, ...(page.data ?? [])], []),
      map((dtos) => dtos.map(this.toModel)),
    );
  }

  private fetchPage(cursor: string | null): Observable<PageDto<D>> {
    let params = new HttpParams().set('pageSize', PAGE_SIZE);
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    return this.http.get<PageDto<D>>(this.url, { params });
  }
}
