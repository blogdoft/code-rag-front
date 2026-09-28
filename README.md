# code-rag-front

The web UI of **code-brain**. The user picks a project and asks natural-language questions about
its code; the API returns candidate code snippets, each with its direct code relationships, and
clicking one opens a popup with its full content. The app also manages projects, uploads CIIR
files for indexing, and reports on the feedback given to the answers. Product requirements are in
`SPEC.md`; the backend contracts are `openapi.generated.json` (code-ciir-api) and
`openapi.indexer.generated.json` (CIIR Indexer API) — see the API contract section in
`CLAUDE.md` for where the live APIs may diverge from those files.

Built with Angular 22 (standalone components, signals, no NgModules), Tailwind CSS, Vitest and
Cypress.

## Development server

```bash
npm start
```

Starts the Angular CLI dev server on `http://localhost:4200/` with the API proxy
(`proxy.conf.json`) enabled, so same-origin `/api/...` and `/version` calls are forwarded to the
shared gateway `https://blogdoft.home.arpa/code-brain` (code-ciir-api and the CIIR Indexer API).
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

## End-to-end tests

```bash
npm run e2e
```

Runs the Cypress suite headless against a running `npm start`, with the backend stubbed
(`cy.stubBackend()`). `npm run e2e:open` opens the interactive runner.

## Architecture

Standalone components throughout (no `NgModule`), with lazy-loaded route-level feature
components. No state-management library — local/component state uses signals.

```
src/app/
  core/
    models/         Project, CodeQueryResult, FeedbackStats, ProblemDetails — camelCase shapes
    services/       ConfigService, ThemeService, ToastService, ProjectsService,
                    CodeQueriesService, CiirUploadsService, FeedbackStatsService,
                    KeycloakAuthService, PopupCoordinatorService, version services
    interceptors/   baseUrlInterceptor, authInterceptor, errorToastInterceptor
  shared/
    directives/     EscClearableDirective — field-level half of the Escape rule
    components/     Combobox (autocomplete), ToastContainer, ConfirmDialog, NavSidebar
    services/       PopupService — opens popups via @angular/cdk/dialog and registers them
                    with PopupCoordinatorService
  features/
    home/           "/" — landing page
    code-search/    "/rag" — project combobox, question, filters, Q&A history,
                    ResultDetailDialog, feedback
    projects/       "/projects" — project CRUD (also hosted in a popup by other screens)
    ciir-upload/    "/uploads" — CIIR file upload with progress and indexing status
    reports/        "/reports" — feedback dashboard and CSV export
    settings/       "/settings" — API base URL, user name, timezone, appearance
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
- **Configurable API base URL**: stored in `localStorage`, defaults to the app's own `<base href>`
  (same origin, `/code-brain` in production) so requests go through whichever gateway/proxy is in
  front of the app; overridable from the Settings page for a different, browser-trusted origin.
- **Conditional login**: when Keycloak is enabled at deploy time (`auth-config.json`), the whole
  app requires login and API calls carry the token.
- **App version display**: the running app fetches `version.json` at runtime (baked into the
  Docker image at container start from the `APP_VERSION` build arg) and shows it in the UI.

## Docker

```bash
docker compose -f .eng/docker/docker-compose.yml up
```

Builds the image from `.eng/docker/Dockerfile` (multi-stage: `npm run build`, then served by
nginx) and serves it on `http://localhost:8080`. nginx reverse-proxies `/api/...` and `/version`
to `API_UPSTREAM` (defaults to `https://blogdoft.home.arpa/code-brain`; override via `.env` or
`API_UPSTREAM=... docker compose up`, e.g. `http://host.docker.internal:5002` for a local API).

## CI/CD

- `.forgejo/workflows/docker-publish.yml` — on a `vX.Y.Z` tag push: runs `npm test`, builds and
  pushes the Docker image to this repo's Forgejo Container Registry, then stamps the new image
  tag into `.eng/k8s/` and pushes it to the `argo-local-apps` GitOps repo
  (`manifests/code-brain/code-rag-front/`) for ArgoCD to pick up.
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
