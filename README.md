# code-rag-front

A UI/UX layer for the CodeRAG API. The user selects a project and asks natural-language questions
about its code; the API returns candidate code snippets, and clicking one opens a popup with its
full content. Product requirements are in `SPEC.md` (Portuguese); the backend contract is
documented in `v1.json` / `openapi.generated.json` (see the API contract note in `CLAUDE.md` for
where the live API actually diverges from those docs).

Built with Angular 22 (standalone components, signals, no NgModules), Tailwind CSS, and Vitest.

## Development server

```bash
npm start
```

Starts the Angular CLI dev server on `http://localhost:4200/` with the API proxy
(`proxy.conf.json`) enabled, so same-origin `/api/...` calls are forwarded to the real CodeRAG API.
Copy `proxy.conf.local.example.json` over `proxy.conf.json` to point at a local API instance
instead.

## Building

```bash
npm run build
```

Production build, output in `dist/code-rag-front`.

## Running unit tests

```bash
npm test
```

Runs the Vitest suite once (via `@angular/build:unit-test`). Use `npm run test:coverage` for a
coverage report.

## Browser verification

Playwright (with Chromium already downloaded) is a devDependency for driving the app in a real
browser — useful for verifying behavior that's easy to get wrong just from reading the code (see
the TLS/base-URL note in `CLAUDE.md`). It isn't wired into `npm test`; run ad hoc scripts with:

```bash
NODE_PATH="$(pwd)/node_modules" node your-script.js
```

Requires a running dev server (`npm start`).

## Architecture

Standalone components throughout (no `NgModule`), with lazy-loaded route-level feature
components. No state-management library — local/component state uses signals.

```
src/app/
  core/
    models/         Project, CodeQueryResult, ProblemDetails — camelCase app-facing shapes
    services/        ConfigService (localStorage base URL), ThemeService (OS dark/light),
                      ToastService, ProjectsService, CodeQueriesService, PopupCoordinatorService
    interceptors/    baseUrlInterceptor, errorToastInterceptor
  shared/
    directives/      EscClearableDirective — field-level half of the Escape rule
    components/      Combobox (autocomplete), ToastContainer, ConfirmDialog
    services/        PopupService — opens popups via @angular/cdk/dialog and registers them
                      with PopupCoordinatorService
  features/
    code-search/     "/" route — project combobox, question input, Q&A history,
                      ResultDetailDialog
    settings/        "/settings" route — API base URL form
```

Key behaviors (see `CLAUDE.md` for the full write-up):

- **Escape-key state machine**: an `[appEscClearable]` directive clears a focused field on Escape;
  if the field is already empty, the event bubbles to a single app-level listener that closes the
  topmost open popup (confirming first if it has unsaved changes), or does nothing on the main
  window.
- **XSS**: every API-sourced string is rendered through Angular interpolation only, never
  `[innerHTML]`. `embeddingText`'s embedded newlines are preserved with a `whitespace-pre-wrap`
  `<pre>`.
- **Combobox**: client-side substring filtering over a full options list fetched once, not
  server-side type-ahead.
- **Configurable API base URL**: stored in `localStorage`, defaults to empty (same-origin) so
  requests go through whichever proxy is in front of the app; overridable from the Settings page
  for a genuinely different, browser-trusted origin.
- **App version display**: the running app fetches `/version.json` at runtime (baked into the
  Docker image at container start from the `APP_VERSION` build arg) and shows it in the UI.

## Docker

```bash
docker compose -f .eng/docker/docker-compose.yml up
```

Builds the image from `.eng/docker/Dockerfile` (multi-stage: `npm run build`, then served by
nginx) and serves it on `http://localhost:8080`. nginx reverse-proxies `/api/...` to
`API_UPSTREAM` (defaults to `https://code-rag-api.home.arpa`; override via `.env` or
`API_UPSTREAM=... docker compose up`, e.g. `http://host.docker.internal:5002` for a local API).

## CI/CD

- `.forgejo/workflows/docker-publish.yml` — on a `vX.Y.Z` tag push: runs `npm test`, builds and
  pushes the Docker image to this repo's Forgejo Container Registry, then stamps the new image
  tag into `.eng/k8s/` and pushes it to the `argo-local-apps` GitOps repo
  (`manifests/code-rag-front/`) for ArgoCD to pick up.
- `.forgejo/workflows/mirror-to-github.yml` — mirrors every branch and tag to
  `github.com/blogdoft/code-rag-front` on every push.
- `.github/workflows/docker-publish.yml` — on the mirrored repo, on a `vX.Y.Z` tag push: runs
  `npm test` and publishes the image to `ghcr.io/blogdoft/code-rag-front` (build-only, no deploy
  step).

Versioning is manual: the app's version is whatever tag you create and push
(`git tag v1.2.3 && git push origin v1.2.3`).

## Additional resources

- [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli)
- [Vitest](https://vitest.dev/)
