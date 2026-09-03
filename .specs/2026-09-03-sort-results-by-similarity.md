# Spec: Sort Code Query Results by Similarity (Descending)

Status: Draft

## 1. Background

`POST /api/v1/projects/{projectId}/code-queries` returns an array of `CodeQueryResultDto`, each
carrying a `similarity` score (`code-queries.service.ts:20`). Today the app renders whatever order
the API returns verbatim: `CodeQueriesService.ask()` maps the DTOs 1:1 into `CodeQueryResult[]`
with no reordering (`code-queries.service.ts:39-43`), and `CodeSearchPage.submit()` stores that
array as-is on the history entry (`code-search-page.ts:140-149`), which `code-search-page.html`'s
results `<table>` then iterates in received order (around lines 78-122).

There is no documented guarantee that the API already returns results ordered by similarity — and
even if it happens to today, relying on that silently is fragile. The requirement is that **the
UI must always show results ordered from highest similarity to lowest**, regardless of what order
the API sends them in.

## 2. Fix point

Sort once, in `core/services/code-queries.service.ts`, inside `ask()`'s existing `map` pipeline —
not in the component. This is the single place all code-query results flow through
(`CLAUDE.md`'s "fix point" convention for this service), so sorting here guarantees the invariant
for the results table, history entries, and any future consumer of `CodeQueriesService.ask()`
without needing to remember to re-sort at each call site.

```ts
ask(projectId: number, question: string, filters?: CodeQueryFilters): Observable<CodeQueryResult[]> {
  return this.http
    .post<CodeQueryResultDto[]>(`/api/v1/projects/${projectId}/code-queries`, toRequestBody(question, filters))
    .pipe(
      map((dtos) => dtos.map(toCodeQueryResult)),
      map((results) => [...results].sort((a, b) => b.similarity - a.similarity)),
    );
}
```

(The two `map` calls can also be collapsed into one `map((dtos) => dtos.map(toCodeQueryResult).sort(...))`
— either is fine; keep whichever reads more clearly in review. The `[...results]`/fresh-array
sort matters only if the mapped array is ever reused elsewhere before sorting; since `dtos.map(...)`
already returns a fresh array each call, sorting it in place is also safe — no shared/cached array
is being mutated.)

No change to `CodeSearchPage` or the results template is needed: both already just render whatever
array `ask()` emits, so once `ask()` guarantees descending-similarity order, the table and history
cards inherit it for free.

## 3. Edge cases

- **Ties**: `Array.prototype.sort` is stable (guaranteed by spec since ES2019, which the project's
  TS/Node targets satisfy), so results with equal `similarity` keep their relative API order rather
  than being shuffled.
- **Empty results**: sorting `[]` is a no-op; no special-casing needed.
- **`similarity` is a plain `number`** (`core/models/code-query-result.ts:9`), so a numeric
  comparator (`b.similarity - a.similarity`) is correct and needs no `localeCompare`/type coercion.

## 4. Testing

- `code-queries.service.spec.ts`: add a case asserting that when the mocked HTTP response returns
  DTOs out of similarity order (e.g. `0.4`, `0.9`, `0.6`), `ask()` emits results sorted descending
  (`0.9`, `0.6`, `0.4`). Also cover a tie case (two equal `similarity` values) to confirm their
  original relative order is preserved.
- No new `code-search-page.spec.ts` coverage is required — the component has no sorting logic of
  its own to test; it only needs to keep passing its existing tests, which already assert it
  renders whatever `ask()` returns.

## 5. Out of scope

- No API change requested — this is a client-side guarantee layered on top of whatever order the
  API happens to return, per the requirement that the UI enforce it regardless.
- No user-facing sort control (e.g. a column-header click to re-sort by another field). The
  requirement is a fixed, always-on descending-similarity order, not configurable sorting.
- No change to `ResultDetailDialog` or any other popup — sorting only affects the order results are
  listed in, not any single result's own content.
