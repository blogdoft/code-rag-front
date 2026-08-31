# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A UI/UX layer for the CodeRAG API. The user selects a project and asks natural-language questions about
its code; the API returns candidate code snippets, and clicking one opens a popup with its full content.
Product requirements are in `SPEC.md` (Portuguese); the backend contract is documented in `v1.json` and
`openapi.generated.json`.

## Commands

- `npm start` — dev server on `:4200` with the API proxy (`proxy.conf.json`) enabled.
- `npm run build` — production build (`dist/code-rag-front`).
- `npm test` — unit tests (Vitest, via `@angular/build:unit-test`). Runs once; there's no separate
  `--watch=false` needed, but pass it explicitly in CI-like contexts to be safe.
- No lint script is configured (Angular CLI v22 doesn't scaffold ESLint by default).
- Playwright (with Chromium already downloaded) is a devDependency for real browser verification — there
  was no Chrome extension available in this environment, so it's the way to actually drive the app rather
  than guess from reading the code. It's not wired into `npm test`; run ad hoc scripts with
  `NODE_PATH="$(pwd)/node_modules" node your-script.js` (a bare `node script.js` outside the project dir
  won't resolve the `playwright` module). Requires a running dev server (`npm start`).

## API contract — trust the live response over the OpenAPI docs

Both `v1.json` and `openapi.generated.json` document **camelCase** response fields (`sourceFile`,
`embeddingText`, `createdAt`), but the live API actually serializes **snake_case**
(`source_file`, `embedding_text`, `created_at`) — confirmed by curling the real API directly. The OpenAPI
docs in this repo are stale/wrong on casing; don't trust them for wire format, only for the general shape
(endpoints, required fields). If the API's serialization ever changes, the fix point is the DTO
interfaces + mapper functions in `core/services/projects.service.ts` and
`core/services/code-queries.service.ts` — everything else in the app deals only in the camelCase
`Project`/`CodeQueryResult` models (`core/models/`).

- `GET /api/v1/projects` → `ProjectDto[]` (`id`, `name`, `created_at`).
- `POST /api/v1/projects/{projectId}/code-queries` body `{ question }` → `CodeQueryResultDto[]`
  (`id`, `source_file`, `kind`, `type_name`, `member`, `embedding_text`, `similarity`). Can 404 (bad
  project id) or 400 (blank question).
- Errors are RFC7807 `ProblemDetails` (`type`, `title`, `status`, `detail`, `instance` — plain lowercase,
  unaffected by the snake_case naming policy). `core/interceptors/error-toast.interceptor.ts` reads
  `detail`/`title` and reports every failed request as a toast.
- The API base URL is user-configurable (Settings page), stored in `localStorage` via `ConfigService`,
  and applied by `core/interceptors/base-url.interceptor.ts` to any request starting with `/api`. It
  **defaults to empty** (same-origin, relative `/api/...` calls) on purpose: prefixing with an absolute
  URL by default would make the *browser itself* call that host directly, hitting its certificate
  outside any proxy's control (see the TLS note below — this was an actual bug found by driving the app
  with Playwright, not just reading the code: the default used to be `https://code-rag-api.home.arpa`,
  which made every request bypass the dev proxy and fail with `ERR_CERT_AUTHORITY_INVALID`). Settings
  still accepts an absolute URL when the API truly lives on a different, browser-trusted origin.
  `proxy.conf.json` points the dev server's own proxy at `https://code-rag-api.home.arpa` so same-origin
  `/api/...` calls get forwarded there in dev; `proxy.conf.local.example.json` is the alternate
  `http://localhost:5002` target seen in `openapi.generated.json` for local API instances — copy it over
  `proxy.conf.json` to use it.
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
                     ToastService, ProjectsService, CodeQueriesService, PopupCoordinatorService
    interceptors/   baseUrlInterceptor, errorToastInterceptor
  shared/
    directives/     EscClearableDirective — field-level half of the Escape rule (see below)
    components/     Combobox (autocomplete), ToastContainer, ConfirmDialog
    services/       PopupService — opens popups via @angular/cdk/dialog and registers them
                     with PopupCoordinatorService
  features/
    code-search/    "/" route — project combobox, question input, Q&A history, ResultDetailDialog
    settings/       "/settings" route — API base URL form
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

Today the only popup (`ResultDetailDialog`) is read-only, so its `isDirty` is effectively always false —
the confirm-discard branch is implemented generically and correctly, but only exercised once a popup with
editable state is added.

### XSS

Every API-sourced string (`embeddingText`, `sourceFile`, `typeName`, `member`) is rendered only through
Angular interpolation (`{{ }}`), never `[innerHTML]` or `bypassSecurityTrustHtml`. `embeddingText`'s
embedded newlines are preserved with a `whitespace-pre-wrap` `<pre>` — not by converting `\n` to `<br>`
via HTML.

### Combobox

`shared/components/combobox` fetches nothing itself — it filters a full `options: {id, label}[]` list
client-side by substring match on `label`, and only lets the user commit a value that matches an existing
option (reverts on blur otherwise). This is deliberately simpler than server-side type-ahead search: with
the current project counts, fetching the full list once is enough, and the API's `name` filter query
param on `GET /api/v1/projects` isn't used.
