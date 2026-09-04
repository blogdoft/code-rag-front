# Spec: Feedback CSV Export

Status: Implemented
Source: `https://code-rag-api.home.arpa/swagger/v1/swagger.json` (confirmed live, 2026-09-03), plus a
direct `curl` of `GET /api/v1/code-queries/feedback/export` to confirm the response headers the
swagger doc doesn't document (see §2) — per `CLAUDE.md`'s "trust the live response over the OpenAPI
docs" rule.

**Amendment (2026-09-04):** implemented together with a new `timezone` query param on the same
endpoint (code-rag-api's `.specs/code-query-feedback-timezone.md`) — `created_at` in the CSV is
rendered in a configurable IANA timezone (Settings page, default `America/Sao_Paulo`) instead of raw
UTC, since a human is expected to read this file directly. `FeedbackStatsService.exportCsv()` now
reads `ConfigService.exportTimezone()` and appends it as the `timezone` param on every call (omitted
only when the configured value is empty, which falls back to the endpoint's default UTC rendering) —
this wasn't part of the original §3 design below, which only covered `start_date`/`end_date`/
`project_id`. See `core/services/config.service.ts` (`exportTimezone`/`setExportTimezone`) and
`features/settings/settings-page.ts` for the new setting.

## 1. Background

The Reports page (`features/reports/feedback-stats-page.ts`, added by
`.specs/2026-09-03-feedback-stats-chart.md`) shows aggregated weekly feedback stats with a Project /
Start date / End date filter row and a Refresh button. The API also exposes a sibling endpoint that
returns the *raw, unaggregated* feedback rows for the same kind of window as a downloadable CSV. This
spec adds an "Export CSV" button next to Refresh that calls it using the page's current filter values,
plus icons on both buttons (a download glyph on Export CSV, a refresh glyph on Refresh — neither button
currently has an icon).

## 2. API contract (confirmed via live swagger.json + a live curl)

`GET /api/v1/code-queries/feedback/export`

Query params (all optional, same names as `.../feedback/stats`, **but independent defaults** — read
the descriptions carefully, they differ from `/stats`):
- `start_date` (date-time, UTC ISO 8601) — inclusive lower bound. Missing → first day of the current
  UTC month (00:00 UTC). *Not* a rolling N-days-back default like `/stats`.
- `end_date` (date-time, UTC ISO 8601) — inclusive upper bound. Missing → now (UTC).
- `project_id` (int64) — restrict to a single project; 404 (empty body) if it doesn't match any
  project.

The effective window (`end_date - start_date`, after defaults are applied) must not exceed 366 days;
exceeding it, or an effective `start_date` after `end_date`, is a 400 with an `application/problem+json`
body. 500 also returns `application/problem+json`. These are documented in the swagger; the following
was **not** documented there and was confirmed by curling the live endpoint directly:

```
HTTP/2 200
content-disposition: attachment; filename=feedback_export_20260801_20260903.csv; filename*=UTF-8''feedback_export_20260801_20260903.csv
content-type: text/csv
```

Body (first line + one data row, for shape only — the app never parses this, it's a passthrough
download):
```csv
id,project_id,project_name,question,useful,similarities,reason,username,created_at
1,3,code-rag-api,where is the feedback endpoint for code queries implemented?,False,"[0.52,...]",Top results were unrelated.,claude code,2026-09-03T15:15:30Z
```

**CORS note, checked live and relevant to §4 below:** the API's `OPTIONS` preflight response has
`access-control-allow-origin` but **no** `access-control-expose-headers`. Per the Fetch/CORS spec,
that means `Content-Disposition` is invisible to JS on a genuinely cross-origin request (i.e. when
Settings' API base URL is configured to an absolute, different-origin URL — see `CLAUDE.md`'s base-URL
section). It **is** visible when the request is same-origin, which is this app's default (relative
`/api/...`, proxied in dev). §4's filename resolution must tolerate the header being absent for this
reason, not just as defensive coding.

## 3. Service changes — `core/services/feedback-stats.service.ts`

Add `exportCsv`, reusing the existing `FeedbackStatsQuery` interface unchanged (same three optional
fields, same meaning of "unset" as `getStats`) — no new DTO, since the response is an opaque binary
blob, not JSON to map:

```ts
exportCsv(query: FeedbackStatsQuery = {}): Observable<HttpResponse<Blob>> {
  return this.http.get('/api/v1/code-queries/feedback/export', {
    params: buildParams(query),
    responseType: 'blob',
    observe: 'response',
  });
}
```

`observe: 'response'` (not the default `'body'`) is required to reach the `Content-Disposition` header
in §4 — a plain `Observable<Blob>` would only expose the body.

Extract the query-param-building duplicated between `getStats` and `exportCsv` into one private
function (both currently build the same three `start_date`/`end_date`/`project_id` params):

```ts
function buildParams(query: FeedbackStatsQuery): HttpParams {
  let params = new HttpParams();
  if (query.startDate) {
    params = params.set('start_date', query.startDate);
  }
  if (query.endDate) {
    params = params.set('end_date', query.endDate);
  }
  if (query.projectId != null) {
    params = params.set('project_id', query.projectId);
  }
  return params;
}
```

`getStats` is updated to call `buildParams(query)` instead of its current inline block; its
behavior/tests are unaffected (same params, same order).

## 4. Filename resolution and triggering the download

New file-local (not shared — single consumer, see §9) helpers in `feedback-stats-page.ts`:

```ts
function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // malformed percent-encoding - fall through to the plain filename= form below
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Deferred, not immediate: revoking synchronously right after click() is a common source of
  // flaky downloads in some browsers because the click-triggered navigation hasn't started
  // reading the blob URL yet.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

The server-provided filename (§2) is preferred when the header is readable; a client-built fallback
covers both the cross-origin case (§2's CORS note) and any future response that omits the header:

```ts
function fallbackCsvFilename(startDate: string, endDate: string, projectLabel: string): string {
  const start = startDate || 'all';
  const end = endDate || 'all';
  const project = projectLabel && projectLabel !== 'All projects' ? `-${slugify(projectLabel)}` : '';
  return `feedback-export-${start}-${end}${project}.csv`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
```

## 5. Error interceptor fix — Blob-bodied error responses

`core/interceptors/error-toast.interceptor.ts` currently assumes `HttpErrorResponse.error` is an
already-parsed `ProblemDetails` object. That's only true for JSON requests. Angular delivers the error
body in whatever `responseType` the *request* declared — so a failing `exportCsv` call (e.g. the 400
for an out-of-range window, or a 400/500 with an `application/problem+json` body) hands back
`error.error` as a **`Blob`**, not a parsed object, and the interceptor would silently show the generic
fallback message instead of the real `detail`. This needs a fix, since date-range validation errors
from Export CSV should read the same as they do everywhere else in the app.

Fix (keeps every existing synchronous test in `error-toast.interceptor.spec.ts` passing unchanged —
the non-Blob path stays fully synchronous; only the new Blob path is async):

```ts
export const errorToastInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!req.context.get(SUPPRESS_ERROR_TOAST)) {
        reportError(error, toast);
      }
      return throwError(() => error);
    }),
  );
};

function reportError(error: unknown, toast: ToastService): void {
  if (!(error instanceof HttpErrorResponse)) {
    toast.error(GENERIC_ERROR_MESSAGE);
    return;
  }

  if (error.error instanceof Blob) {
    // responseType: 'blob' requests (e.g. the CSV export) also deliver error bodies as a Blob,
    // even when the server sent application/problem+json for this response - read + parse it.
    error.error
      .text()
      .then((text) => toast.error(pickMessage(parseProblemSafely(text))))
      .catch(() => toast.error(GENERIC_ERROR_MESSAGE));
    return;
  }

  toast.error(pickMessage(error.error as ProblemDetails | null));
}

function pickMessage(problem: ProblemDetails | null): string {
  return problem?.detail || problem?.title || GENERIC_ERROR_MESSAGE;
}

function parseProblemSafely(text: string): ProblemDetails | null {
  try {
    return JSON.parse(text) as ProblemDetails;
  } catch {
    return null;
  }
}
```

`extractMessage` is removed; `reportError`/`pickMessage`/`parseProblemSafely` replace it.

## 6. Page changes — `features/reports/feedback-stats-page.ts`

New state:
```ts
protected readonly isExporting = signal(false);
```
(kept separate from `isLoading` — Refresh and Export CSV are distinct in-flight operations with
distinct button labels, but see §7: both buttons are disabled while *either* is in flight, so the two
network calls never overlap.)

Shared helpers extracted out of the current `fetchStats()` body so `exportCsv()` doesn't duplicate
them:

```ts
private isDateRangeValid(): boolean {
  const startDate = this.startDate();
  const endDate = this.endDate();
  if (startDate && endDate && startDate > endDate) {
    this.toast.error('Start date must be on or before End date.');
    return false;
  }
  return true;
}

private buildQuery(): FeedbackStatsQuery {
  const projectId = this.selectedProjectId();
  return {
    startDate: toIsoStart(this.startDate()),
    endDate: toIsoEnd(this.endDate()),
    projectId: projectId === null || projectId === ALL_PROJECTS_ID ? undefined : projectId,
  };
}
```

`fetchStats()` is rewritten in terms of these (behavior unchanged — same guard, same query shape):
```ts
protected fetchStats(): void {
  if (!this.isDateRangeValid()) {
    return;
  }
  this.isLoading.set(true);
  this.feedbackStatsService.getStats(this.buildQuery()).subscribe({
    next: (stats) => this.stats.set(stats),
    complete: () => this.isLoading.set(false),
    error: () => this.isLoading.set(false),
  });
}
```

New method:
```ts
protected exportCsv(): void {
  if (!this.isDateRangeValid()) {
    return;
  }
  this.isExporting.set(true);
  this.feedbackStatsService.exportCsv(this.buildQuery()).subscribe({
    next: (response) => {
      const blob = response.body;
      if (!blob) {
        return;
      }
      const filename =
        filenameFromContentDisposition(response.headers.get('content-disposition')) ??
        fallbackCsvFilename(this.startDate(), this.endDate(), this.selectedProjectLabel());
      triggerBlobDownload(blob, filename);
      this.toast.success('CSV export downloaded.');
    },
    complete: () => this.isExporting.set(false),
    error: () => this.isExporting.set(false),
  });
}
```

`selectedProjectLabel` (new `computed`, mirroring the pattern from the chart's earlier
`projectLabel`-title revision — see `.specs/2026-09-03-feedback-stats-chart.md`'s third-pass note,
though that title was itself later removed):
```ts
protected readonly selectedProjectLabel = computed(
  () => this.projectOptions().find((option) => option.id === this.selectedProjectId())?.label ?? 'All projects',
);
```
Used only for the fallback filename (§4) — not rendered anywhere in the template.

`toast.success('CSV export downloaded.')` on completion matches `SPEC.md`'s "toast for success or
failure" rule — there's no existing precedent for a download-specific success toast in this app, but
every other completed action (`code-search-page.ts`'s feedback submission, `settings-page.ts`'s save)
does toast on success, so this follows that convention rather than downloading silently.

## 7. Template changes — `features/reports/feedback-stats-page.html`

Both buttons get an inline SVG icon before their label, `flex items-center gap-2`, following this
app's existing icon convention (`shared/components/nav-sidebar/nav-sidebar.html`: `viewBox="0 0 24
24" fill="none" stroke="currentColor" stroke-width="2"`) sized `h-4 w-4` (buttons are smaller than nav
links, which use `h-5 w-5`).

Refresh gets an `arrow-path` (circular-refresh) icon, spinning while loading (`animate-spin` bound to
`isLoading()`) — a lightweight, free "in progress" indicator that replaces nothing (the `Loading...`
label text is kept as-is):

```html
<button
  type="button"
  [disabled]="isLoading() || isExporting()"
  (click)="fetchStats()"
  class="flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 shrink-0" [class.animate-spin]="isLoading()">
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
    />
  </svg>
  {{ isLoading() ? 'Loading...' : 'Refresh' }}
</button>
```

Export CSV is a new button right after Refresh, download-tray icon, secondary styling (Refresh stays
the visually primary action — same `bg-sky-600`; Export CSV uses a bordered/neutral style so the two
don't compete):

```html
<button
  type="button"
  [disabled]="isLoading() || isExporting()"
  (click)="exportCsv()"
  class="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 shrink-0">
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 12m0 0 4.5-4.5M12 12V3"
    />
  </svg>
  {{ isExporting() ? 'Exporting...' : 'Export CSV' }}
</button>
```

Both SVG paths are the standard Heroicons 2.0 outline `arrow-path` / `arrow-down-tray` glyphs, kept
inline per this app's existing convention (no icon library dependency — see `nav-sidebar.html`, which
already inlines four icons the same way).

## 8. Testing

- `feedback-stats.service.spec.ts`: add `exportCsv` cases mirroring the existing `getStats`
  ones — request URL/params for (a) no query args, (b) all three set, (c) `project_id` omitted when
  unset; additionally assert `req.request.responseType === 'blob'` and that the emitted value is the
  raw `HttpResponse` (`.body`, `.headers`) unchanged, since there's no DTO mapping for a binary body.
  `getStats`'s existing assertions are unaffected by the `buildParams` extraction (same params
  produced).
- `error-toast.interceptor.spec.ts`: two new cases, both `async` (the Blob path resolves via a
  microtask, unlike the five existing synchronous cases which are untouched):
  - a `Blob` error body containing valid `application/problem+json` text is parsed and toasted with
    its `detail`, asserted via `await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(...))`.
  - a `Blob` error body that isn't valid JSON (covers the export endpoint's empty-body 404) falls back
    to the generic message, same `vi.waitFor` pattern.
- `feedback-stats-page.spec.ts`: mock `FeedbackStatsService.exportCsv` (alongside the existing
  `getStats` mock) returning `of(new HttpResponse({ body: new Blob(['csv,data']), headers: new
  HttpHeaders({ 'content-disposition': "attachment; filename=test.csv" }) }))`. Stub
  `URL.createObjectURL`/`URL.revokeObjectURL` (unimplemented in jsdom) with `vi.fn()`. Cover:
  - clicking Export CSV calls `exportCsv` with the currently selected filters (same query shape
    `fetchStats` would send for the same filter state).
  - the same `startDate > endDate` guard blocks the call and toasts, exactly like the existing
    `fetchStats` validation test — and does **not** call `feedbackStatsService.exportCsv`.
  - a `content-disposition` header drives the downloaded filename (spy on the created `<a>`'s
    `.download`/`.click()` — easiest via `vi.spyOn(document, 'createElement')` returning a real
    anchor so `.click()` can be spied on without triggering a real navigation in jsdom).
  - when the header is absent, the fallback filename is built from the current date/project filters.
  - `isExporting` toggles around the request the same way `isLoading` already does (reuse the
    controllable-`Subject` pattern from the existing loading-flag test).

## 9. Out of scope

- No shared/reusable "download a blob" utility in `shared/` — `exportCsv` is this app's only binary
  download today; extracting one now would be speculative (YAGNI). Revisit if a second consumer shows
  up.
- No client-side CSV parsing/preview — the file is a pure passthrough download, exactly as the API
  returns it.
- No retry/resume for large exports — the 366-day server-side cap (§2) keeps worst-case payloads
  bounded, and this app has no precedent for retry logic on any other request.
- No change to `SPEC.md` (Portuguese product spec), same rationale as prior specs in this repo: a
  follow-up once the feature is built and reviewed.
