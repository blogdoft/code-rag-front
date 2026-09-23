# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A UI/UX layer for the Code CIIR API (`code-ciir-api`). The user selects a project and asks
natural-language questions about its code; the API returns candidate code snippets — each with its
direct code-relationship data — and clicking one opens a popup with its full content. Product
requirements are in `SPEC.md` (Portuguese, not yet updated for this backend — see
`.specs/2026-09-10-ciir-api-migration.md`).

As of 2026-09-18 (`.specs/2026-09-18-gateway-and-projects-migration.md`) the backend is split across
**two services behind one shared gateway**, `https://blogdoft.home.arpa/code-brain`:
- **code-ciir-api** — code-queries, feedback, feedback stats/export, `/version`. Contract in
  `openapi.generated.json` (fetched live from
  `.../code-brain/api/code-queries/swagger/v1/swagger.json`).
- **CIIR Indexer API** — Projects CRUD (`/api/indexer/projects`), CIIR file upload + indexation
  status (`/api/indexer/ciir-uploads`, `/api/indexer/indexations`; used by `features/ciir-upload`),
  and a `POST .../ciir-uploads/register` (bring-your-own-upload via MinIO) this frontend doesn't
  use. Contract in `openapi.indexer.generated.json` (fetched live from
  `.../code-brain/api/indexer/openapi/v1.json`).

Both are reachable under the *same* gateway host, just different `/api/...` prefixes — see the API
contract section below for exactly which prefix goes with which endpoint, and the base-URL note for
what this means for `proxy.conf.json`/`nginx.conf.template`.

This app previously targeted a different backend, **CodeRAG API** (`code-rag-api`) — smaller, flatter
DTOs, no relationship graph, git-URL fields on results/projects. That migration is documented in
`.specs/2026-09-10-ciir-api-migration.md`; this section and the one below describe the *current*
contract only.

## Commands

- `npm start` — dev server on `:4200` with the API proxy (`proxy.conf.json`) enabled.
- `npm run build` — production build (`dist/code-rag-front`).
- `npm test` — unit tests (Vitest, via `@angular/build:unit-test`). Runs once; there's no separate
  `--watch=false` needed, but pass it explicitly in CI-like contexts to be safe.
- `npm run format` — Prettier (`.prettierrc`: 100 columns, single quotes) over `src/`, in place.
  `npm run format:check` is the read-only version. Prettier is occasionally not idempotent in one
  pass (e.g. some chained calls in specs) — if `format:check` still fails right after `format`, run
  `format` again.
- **Local pre-push gate:** `.githooks/pre-push` runs `format:check` and aborts the push if `src/` isn't
  formatted. `npm install`/`npm ci` activates it (the `prepare` script sets `core.hooksPath`; it's a
  no-op where there's no git, like the Dockerfile's build stage). It checks the working tree, not the
  pushed commits, and `git push --no-verify` bypasses it — it's a local guard rail, not CI.
- No ESLint is configured (Angular CLI v22 doesn't scaffold it by default), so "lint" here means
  Prettier only.
- Playwright (with Chromium already downloaded) is a devDependency for real browser verification — there
  was no Chrome extension available in this environment, so it's the way to actually drive the app rather
  than guess from reading the code. It's not wired into `npm test`; run ad hoc scripts with
  `NODE_PATH="$(pwd)/node_modules" node your-script.js` (a bare `node script.js` outside the project dir
  won't resolve the `playwright` module). Requires a running dev server (`npm start`).

## Commit messages

Always follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, etc., with a `!` or
`BREAKING CHANGE:` footer for breaking changes).

## API contract — trust the live response over the OpenAPI docs

`openapi.generated.json` (code-ciir-api) and `openapi.indexer.generated.json` (CIIR Indexer API)
document this fairly accurately as of the 2026-09-18 gateway move, but this backend is under active
development — re-fetch both `swagger.json`/`openapi/v1.json` from the live API and diff before
trusting any specific field on a non-trivial change; see `.specs/2026-09-10-ciir-api-migration.md`'s
note on the contract changing twice within one session, and
`.specs/2026-09-18-gateway-and-projects-migration.md` for the latest confirmed snapshot. Every
response body is **snake_case** for code-ciir-api endpoints (`source_file`, `embedding_text`,
`created_at`, ...) but **camelCase** for CIIR Indexer API (Projects) endpoints
(`embeddingModel`, `gitUrl`, `createdAt`, ...) — the two services made independent, opposite
serialization choices; don't assume one implies the other. Query-string parameter *names* stay
snake_case on both services regardless of body casing (`page_size`, `start_date`, `project_id`, ...).
If the API's serialization ever changes, the fix point is the DTO interfaces + mapper functions in
`core/services/projects.service.ts`, `core/services/code-queries.service.ts`, and
`core/services/feedback-stats.service.ts` — everything else in the app deals only in the camelCase
`Project`/`CodeQueryResult`/`FeedbackStats` models (`core/models/`).

- `POST /api/code-queries` (code-ciir-api; dropped its `/v1` segment in the 2026-09-18 gateway move —
  was `/api/v1/code-queries`) body `{ question, project_id, min_similarity?, kind?, qualified_name?,
  limit? }` → `{ matches: CodeQueryResultResponse[], graph }`. The project is a body field, not part of
  the URL — this app always sends `project_id` for the selected project, but the endpoint itself can
  search across every project when it's omitted. `kind` is a plain string (exact match only); the old
  per-field `{operator, value}` filter shape survives only on `qualified_name` (matches
  `symbol_qualified_name`; `equals`/`contains`/`not_contains`). Results carry `symbol_container`,
  `symbol_name`, `symbol_qualified_name`, `symbol_canonical_name`, `git_url`/`git_raw_url` (per-symbol,
  derived from the owning project's git fields), plus `rerank_score` (nullable) and each match's direct
  `relations[]`. **Results arrive pre-sorted by the API** (by `rerank_score` when reranking is
  configured, else `similarity`) — `CodeQueriesService.ask()` must not re-sort them; doing so would
  silently discard reranking. `graph` (up to 2 hops of the relationship graph) is received but
  intentionally unused by this frontend — it's for the MCP-facing side of this API. Can 404
  (`project_id` given but unknown) or 400 (blank question, invalid filter).
- `POST /api/code-queries/feedback` body `{ project_id, question, useful, similarities, reason?, user
  }` → `201` with the created feedback record (unused by the app — there's no GET to read it back
  later). **As of the 2026-09-18 gateway move this is a flat path** — was
  `/api/v1/projects/{projectId}/code-queries/feedback`, with `project_id` in the URL instead of the
  body. Every field name here is already a single lowercase word, so unlike the other DTOs there's no
  camelCase/snake_case translation to do in `CodeQueriesService.submitFeedback()`. `user` identifies
  the caller and is never guessed — the app prompts for it (see `UserNameDialog` in
  `features/code-search/`) and remembers it via `ConfigService`/`localStorage`, the same way the API
  base URL is remembered. Can 404 (bad project id) or 400 (missing/blank required fields); no 409 —
  repeat submissions for the same question are accepted.
- `GET /api/code-queries/feedback/stats` and `GET /api/code-queries/feedback/export` (backing
  `features/reports`) **are now live** as of the 2026-09-18 gateway move (also dropped their `/v1`
  segment) — `FeedbackStatsService` was written ahead of the backend and needed only its URLs updated,
  not its DTOs. `stats` returns a dense week × project grid (`{ start_date, end_date, weeks: [{
  week_start, week_end, projects: [{ project_id, project_name, total_count, useful_count,
  not_useful_count, useful_percentage, not_useful_percentage }] }] }`); `export` streams a `text/csv`
  file of raw, unaggregated rows. Both take optional `start_date`/`end_date`/`project_id` query params
  (max 366-day window); `export` also takes `timezone` (IANA name) to render `created_at` in local wall
  time instead of UTC.
- `GET /api/indexer/projects` (CIIR Indexer API — moved off code-ciir-api's `/api/v1/projects` in the
  2026-09-18 gateway move) → **paginated** (`{ items, page, pageSize, totalCount, totalPages }` — note
  the camelCase, unlike this same endpoint's snake_case response before the move). `page`/`page_size`
  query params stay snake_case-named regardless. `ProjectsService.list()` loops every page internally
  and returns the flattened `Project[]` — every caller (the code-search project combobox, the Projects
  page's own client-side search) is unaware pagination exists. `POST /api/indexer/projects` (create),
  `PUT`/`DELETE /api/indexer/projects/{projectId}` (replace/delete) round out full CRUD;
  `ProjectResponse` is `{ id, name, embeddingModel, embeddingDimensions, gitUrl, gitRawUrl, createdAt,
  updatedAt }`. `id`/`embeddingDimensions` are typed by the server as int64/int32-or-string (JS-number-
  precision safety for int64) — `ProjectsService`'s mapper normalizes both through `Number(...)`.
- `POST /api/indexer/ciir-uploads` (CIIR Indexer API; backing `features/ciir-upload`) takes
  `multipart/form-data` with a `projectId` text field and a `ciirFile` file field, **in that
  order** — the server validates the project before storing any byte of the file, so
  `CiirUploadsService.upload()` appends `projectId` first (FormData preserves append order; a spec
  asserts it). Returns `202 { uploadId, status: "pending" }` as soon as the file is stored in
  object storage — indexing happens later in a background worker. Errors: 400/413 carry
  `ProblemDetails`, but **404 (unknown project) and 429 have no body**, so the upload request opts
  out of the global error toast (`SUPPRESS_ERROR_TOAST`) and `CiirUploadPage` maps status codes to
  messages itself. Upload progress comes from `HttpClient`'s `reportProgress`/`UploadProgress`
  events (bytes *sent* — the server answers only after storing the file, so there's a wait at 100%
  the page explains). Unsubscribing aborts the XHR; that's how Cancel works, and why leaving the
  page mid-upload is guarded (`canDeactivate` + `beforeunload`). After `202`,
  `CiirUploadsService.watch()` polls `GET /api/indexer/ciir-uploads/{id}` every 2s until `status`
  is `processed` or `failed` (terminal), and — once `indexationId` is set — also
  `GET /api/indexer/indexations/{indexationId}` for the document/relation counters (its own
  statuses: `pending`/`running`/`resolving_relations`/`completed`/`failed`/`cancelled`). A few
  transient poll failures are retried; a 404 is not. Bodies are camelCase; int64 fields
  (`projectId`, counters) are normalized through `Number(...)` like the Projects DTOs.
- `GET /version` → `{ version }`, unversioned and unauthenticated, for deploy tooling/diagnostics.
  Served by code-ciir-api, but **not exposed through the public gateway** — confirmed by probing
  `blogdoft.home.arpa/code-brain/version` directly (404; only `/code-brain/api/code-queries` is
  routed there, see code-ciir-api's own `.eng/k8s/ingress.yaml`). In the k8s deployment this still
  works in practice because `ApiVersionService`'s `/version` request goes through
  `baseUrlInterceptor` → `blogdoft.home.arpa/code-brain/version` → falls through to this app's own
  Traefik catch-all (`.eng/k8s/ingress.yaml`) → this app's own nginx, whose `location = /version`
  block proxies it onward to `API_UPSTREAM` — a **direct in-cluster Service DNS name**
  (`code-ciir-api.code-brain.svc.cluster.local`, see `.eng/k8s/deployment.yaml`), not the public
  gateway host, so it reaches the real endpoint without looping back through Traefik. `ng serve`/
  `docker-compose` deployments rely on the same nginx passthrough. `ApiVersionService` already
  degrades to an empty string on any failure (network or otherwise), so this isn't user-visible
  even where it doesn't resolve.
- Errors are RFC7807 `ProblemDetails` (`type`, `title`, `status`, `detail`, `instance` — plain lowercase,
  unaffected by either service's body-casing policy). `core/interceptors/error-toast.interceptor.ts`
  reads `detail`/`title` and reports every failed request as a toast.
- The API base URL is user-configurable (Settings page), stored in `localStorage` via `ConfigService`,
  and applied by `core/interceptors/base-url.interceptor.ts` to any request starting with `/api`
  (`/version` too, but not `version.json` — see below). **Defaults to same-origin** (relative
  `/api/...` calls, no absolute host) on purpose: prefixing with an absolute URL by default would
  make the *browser itself* call that host directly, hitting its certificate outside any proxy's
  control (see the TLS note below — this was an actual bug found by driving the app with
  Playwright, not just reading the code: the default once was an absolute `.home.arpa` URL, which
  made every request bypass the dev proxy and fail with `ERR_CERT_AUTHORITY_INVALID`). As of
  2026-09-18 this default is no longer a hardcoded `''` — `ConfigService` reads it from the page's
  own `<base href>` at module load (`document.querySelector('base')`), stripped of its trailing
  slash, so it resolves to `/code-brain` in production and `''` in `ng serve` automatically, without
  the two needing to be kept in sync by hand (see the base-href bullet below for why `<base href>`
  itself differs between the two). Settings still accepts an absolute URL when the API truly lives
  on a different, browser-trusted origin. Both backend services (code-ciir-api and the CIIR Indexer
  API) sit behind the **same** gateway host, `https://blogdoft.home.arpa/code-brain`, just under
  different `/api/...` prefixes — so one configured base URL still covers both; there's no need for
  two separately-configurable base URLs. `proxy.conf.json` and
  `.eng/docker/nginx.conf.template`/`docker-compose.yml` (`API_UPSTREAM`) point at that gateway by
  default. `proxy.conf.local.example.json` remains the `http://localhost:5002`-style pattern for
  pointing at a local API instance instead — copy it over `proxy.conf.json` and adjust the port/host
  to use it. The nginx template has a dedicated exact-match `location` for
  `/api/indexer/ciir-uploads` with `client_max_body_size 0` and `proxy_request_buffering off`:
  CIIR files can be many GB, and nginx's defaults would 413 anything over 1 MB and spool the body
  to disk before forwarding (breaking the progress bar's meaning). In the k8s deployment the
  browser reaches the indexer through the gateway directly, so that block only matters for the
  docker-compose path.
- **This app itself is served from `https://blogdoft.home.arpa/code-brain/`** as of 2026-09-18 (see
  `.specs/2026-09-18-front-on-code-brain-gateway.md`) — not its own subdomain anymore. Production
  builds get `<base href="/code-brain/">` injected via `angular.json`'s `baseHref` build option
  (`ng serve`'s unmodified `src/index.html` keeps `<base href="/">`, so local dev is unaffected).
  `.eng/k8s/ingress.yaml` routes `blogdoft.home.arpa` path `/code-brain` (Prefix) to this app,
  alongside code-ciir-api's and code-ciir-indexer's own more-specific rules on the same host
  (`/code-brain/api/code-queries`, `/code-brain/api/indexer`) — Traefik resolves the overlap by
  path length, so those two keep taking priority with no explicit priority annotation needed.
  `.eng/k8s/middleware.yaml` strips `/code-brain` before forwarding to this app's own pod, mirroring
  the sibling services' middlewares, so `nginx.conf.template` needs no changes — it keeps serving
  everything as if mounted at `/`. `version.json` (this app's own build-version asset, unrelated to
  the API) is requested as a base-href-relative path (no leading slash) rather than through
  `ConfigService`, since it's always same-deployment and never user-configurable, unlike the API URL.
- Browser JS cannot bypass TLS certificate validation (that's a browser/OS trust decision, not something
  a page's script controls) — `secure: false` in `proxy.conf.json` is the one place in this project where
  that's actually configurable, and only for local dev traffic through the CLI proxy.

## Architecture

Standalone components throughout (no `NgModule`) — current Angular best practice, and how "modules by
responsibility" from SPEC.md is realized here: lazy-loaded route-level components instead of NgModules.
No state-management library; local/component state uses signals (app is small enough that a store would
be premature).

```
src/app/
  core/
    models/        Project, CodeQueryResult, ProblemDetails — camelCase app-facing shapes
    services/       ConfigService (localStorage base URL), ThemeService (OS dark/light),
                     ToastService, ProjectsService, CodeQueriesService, CiirUploadsService,
                     PopupCoordinatorService
    interceptors/   baseUrlInterceptor, errorToastInterceptor
  shared/
    directives/     EscClearableDirective — field-level half of the Escape rule (see below)
    components/     Combobox (autocomplete), ToastContainer, ConfirmDialog
    services/       PopupService — opens popups via @angular/cdk/dialog and registers them
                     with PopupCoordinatorService
  features/
    code-search/    "/rag" route — project combobox, question input, Q&A history, ResultDetailDialog
    projects/       "/projects" route — project CRUD (list/search, add/edit/delete via ProjectFormDialog)
    ciir-upload/    "/uploads" route — upload a CIIR `.jsonl` file into a project, with upload progress
                     and server-side indexing status (see the API contract section above)
    reports/        "/reports" route — feedback-stats dashboard; backend endpoints went live in the
                     2026-09-18 gateway move (see the API contract section above)
    settings/       "/settings" route — API base URL form
    home/           "/" route — landing page
```

### The Escape-key state machine (SPEC.md's most detailed requirement)

Split across two cooperating pieces so the 5-branch rule lives in one place instead of being
reimplemented per field/popup:

1. `EscClearableDirective` (`[appEscClearable]`) sits on individual form fields. If the field currently
   shows a value, Escape clears it and calls `event.stopPropagation()`. If the field is already empty (or
   disabled), it does nothing — letting the event bubble up.
2. `App` (`app.ts`) has a single `document:keydown.escape` host listener that only fires when no field
   consumed the event. It delegates to `PopupCoordinatorService.handleEscape()`, which closes the topmost
   registered popup (no-op if none are open — "main window" case).
3. Popups are opened via `PopupService.open(component, { isDirty? })`, which wraps
   `@angular/cdk/dialog`'s `Dialog` (with `disableClose: true`, since we own Escape handling ourselves)
   and registers a `close()` callback with the coordinator. If `isDirty()` is provided and returns true,
   closing routes through `ConfirmDialog` first; otherwise it closes immediately.

`ResultDetailDialog` and `QueryFiltersDrawer` are read-only/always-valid (`isDirty` effectively always
false). `NotUsefulReasonDialog` and `UserNameDialog` (both in `features/code-search/`, opened only from
the feedback flow) are the first popups with real editable state and a real `isDirty`, exercising the
confirm-discard-via-`ConfirmDialog` branch end-to-end for the first time.

### XSS

Every API-sourced string (`embeddingText`, `sourceFile`, `symbolContainer`, `symbolName`,
`symbolQualifiedName`, `symbolCanonicalName`) is rendered only through Angular interpolation (`{{ }}`),
never `[innerHTML]` or `bypassSecurityTrustHtml`. `embeddingText`'s embedded newlines are preserved
with a `whitespace-pre-wrap` `<pre>` — not by converting `\n` to `<br>` via HTML.

### Combobox

`shared/components/combobox` fetches nothing itself — it filters a full `options: {id, label}[]` list
client-side by substring match on `label`, and only lets the user commit a value that matches an existing
option (reverts on blur otherwise). This is deliberately simpler than server-side type-ahead search:
`ProjectsService.list()` fetches every project up front (looping `GET /api/indexer/projects`'s
pagination internally, see the API contract section above) rather than wiring the combobox to
server-side search — with the current project counts, fetching the full list once is enough. The
API's own `name` partial-match filter on `GET /api/indexer/projects` isn't used by this app (and,
same as on code-ciir-api before it, isn't even a declared query parameter in the live openapi doc
despite being mentioned in the endpoint's description — see `.specs/2026-09-10-ciir-api-migration.md`
§2.3, still true after the 2026-09-18 move to the indexer service).
