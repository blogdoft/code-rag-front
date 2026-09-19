# Spec: Gateway consolidation + Projects move to the CIIR Indexer API

Status: Implemented
Sources (both confirmed live, 2026-09-18):
- `https://blogdoft.home.arpa/code-brain/api/indexer/openapi/v1.json` — **CIIR Indexer API**, now
  owns Projects CRUD.
- `https://blogdoft.home.arpa/code-brain/api/code-queries/swagger/v1/swagger.json` — **code-ciir-api**
  v0.5.0, revised since `.specs/2026-09-10-ciir-api-migration.md`'s snapshot.

Per `CLAUDE.md`'s established rule, the live response is authoritative over any committed doc,
including this spec. Both fetches above are saved verbatim as `openapi.indexer.generated.json` and
`openapi.generated.json` respectively.

## 1. Background

Two independent changes landed together, both discovered by fetching the two URLs above at the
user's direction:

1. **A shared gateway.** Both backend services now sit behind one host,
   `https://blogdoft.home.arpa/code-brain`, at different `/api/...` prefixes. Confirmed by probing:
   the indexer host does *not* serve `/version` or any code-queries path (404), and the code-queries
   swagger's own `servers` entry is the same `blogdoft.home.arpa/code-brain` host — so this is one
   gateway routing to two backends by path, not two hosts the frontend needs to juggle separately.
2. **Projects moved off code-ciir-api onto the CIIR Indexer API**, a separate service whose job is
   importing CIIR JSONL files and owning the `projects`/`ciir_documents` tables directly — it also
   exposes CIIR-upload/indexation endpoints this frontend has no UI for and doesn't need to call.
   code-ciir-api's own `/api/v1/projects*` paths are gone from its swagger entirely (confirmed by the
   fresh code-queries fetch, which no longer declares them).

Independently of both, code-ciir-api itself picked up two more changes since the 2026-09-10 spec:
dropping the `/v1` path segment everywhere (`/api/v1/code-queries` → `/api/code-queries`, etc.), and
reshaping the feedback endpoint from project-scoped
(`/api/v1/projects/{projectId}/code-queries/feedback`) to flat
(`/api/code-queries/feedback`, `project_id` moved into the body). The feedback-stats/export
endpoints that `.specs/2026-09-10-ciir-api-migration.md` §1 flagged as "not live yet" are now live —
`FeedbackStatsService` was written ahead of the backend against the right DTOs already, so this only
needed its URLs updated (dropping `/v1`), not its request/response shapes.

## 2. API contract changes

### 2.1 `POST /api/code-queries` (was `/api/v1/code-queries`)

Request/response DTOs unchanged (see `.specs/2026-09-10-ciir-api-migration.md` §2.1 for the full
shape) — `CodeQueryResultResponse` still carries `git_url`/`git_raw_url` per match, still snake_case.
Only the path changed.

### 2.2 `POST /api/code-queries/feedback` (was `/api/v1/projects/{projectId}/code-queries/feedback`)

Flat path now; `CodeQueryFeedbackRequest` gained a required `project_id` field to compensate (it was
previously implied by the URL segment). Every other field (`question`, `useful`, `similarities`,
`reason?`, `user`) unchanged.

### 2.3 `GET /api/code-queries/feedback/stats`, `GET /api/code-queries/feedback/export` (both were
`/api/v1/...`, now live)

DTOs match what `FeedbackStatsService`/`core/models/feedback-stats.ts` already implemented in
anticipation — dense week × project grid for `stats`, raw CSV rows for `export`, both windowed by
`start_date`/`end_date`(≤366 days)/`project_id`, `export` additionally taking `timezone`. No DTO
changes needed, only the URL.

### 2.4 `GET/POST /api/indexer/projects`, `GET/PUT/DELETE /api/indexer/projects/{projectId}` (moved
from code-ciir-api's `/api/v1/projects*`)

**Body casing flipped to camelCase** — this is the one genuinely new wrinkle, not just a path move.
`ProjectResponse`: `{ id, name, embeddingModel, embeddingDimensions, gitUrl, gitRawUrl, createdAt,
updatedAt }`. `ProjectListResponse`: `{ items, page, pageSize, totalCount, totalPages }`.
`ProjectCreateRequest`/`ProjectUpdateRequest`: `{ name, embeddingModel, embeddingDimensions, gitUrl,
gitRawUrl }`. Query params for pagination stay snake_case-*named* (`page`, `page_size`) despite the
body casing flip — the indexer API didn't carry the snake_case convention into query strings either
way (code-ciir-api's query params were always snake_case too), so no functional change there, just
worth noting the inconsistency is real and not a mistake in the frontend.

`id` and `embeddingDimensions` are typed in the schema as int64/int32-**or-string**
(`type: ["integer", "string"]`) — a JS-number-precision safety net for int64 the old code-ciir-api
schema didn't have. `ProjectsService`'s DTO-to-model mapper normalizes both through `Number(...)`
rather than assuming a bare JSON number.

`git_url`/`git_raw_url` are present on `ProjectResponse` here — this was already true of
code-ciir-api's actual live responses despite `.specs/2026-09-10-ciir-api-migration.md` and
`CLAUDE.md` both (incorrectly) documenting their absence; `projects.service.ts` already mapped them
before this change, so no behavior change here, just a doc correction.

No server-declared page-size cap is documented for the indexer API (code-ciir-api's was 100,
confirmed in its swagger); `MAX_PAGE_SIZE = 100` is kept as a reasonable default regardless, since
`list()` still follows `totalPages` rather than assuming a fixed page count.

## 3. Deployment/proxy implications

Since both services live behind one gateway, `ConfigService`'s single configurable API base URL
still works — no need for two separately-configurable base URLs in Settings. What *did* need
attention: `API_UPSTREAM`/`proxy.conf.json`'s `target` now needs to include a path component
(`.../code-brain`), not just a bare host — the previous configs assumed a bare-host upstream.

- `proxy.conf.json`: `target` updated to `https://blogdoft.home.arpa/code-brain` for both `/api` and
  `/version`, with `changeOrigin: true` added (the gateway is presumably Host-header-routed, like the
  `.eng/k8s/ingress.yaml` pattern already used for this app's own ingress; `changeOrigin: false` would
  send the dev server's own Host header instead).
- `.eng/docker/nginx.conf.template`: **could not just flip `API_UPSTREAM`'s default and leave the
  `proxy_pass` directives as bare `${API_UPSTREAM};`.** nginx's `proxy_pass`-with-URI-in-the-target
  rules replace the *matched location prefix* with that URI when concatenating — fine when the target
  has no path (the old bare-host case, which is why the old comment said "no path is appended... so
  nginx forwards the request URI unchanged"), but with a path component present, a bare
  `location /api/ { proxy_pass ${API_UPSTREAM}; }` would concatenate the target's path directly onto
  the request's remainder-after-`/api/` **without inserting a `/`** (producing something like
  `/code-braincode-queries`), and the exact-match `location = /version` block would replace the
  *entire* matched URI with the target's path, dropping `/version` outright. Fixed by making both
  `proxy_pass` directives explicit about the suffix they want
  (`proxy_pass ${API_UPSTREAM}/api/;` / `proxy_pass ${API_UPSTREAM}/version;`), which reconstructs the
  full original path against the new upstream base regardless of whether that base has its own path
  component — verified against nginx's proxy_pass URI-splicing semantics, not just assumed.
- `.eng/docker/docker-compose.yml`: `API_UPSTREAM` default updated to
  `https://blogdoft.home.arpa/code-brain`.
- `.eng/k8s/deployment.yaml` sets `API_UPSTREAM` to an **in-cluster Service DNS name**
  (`http://code-ciir-api.code-rag.svc.cluster.local`), not the public gateway host — deliberately
  routing pod-to-pod inside the cluster rather than back out through the public ingress (see the
  recent "fix(k8s): route frontend API proxy through cluster service" commit). Flagged here at the
  time as needing a decision, since it only covers code-ciir-api and Projects now lives on a
  separate service (code-ciir-indexer) this upstream doesn't reach.

  **Resolved, as a side effect, by `.specs/2026-09-18-front-on-code-brain-gateway.md`**: once this
  app's own `<base href>`/`ConfigService` default point browser-issued API calls at
  `/code-brain/api/...`, and this app is itself served from behind that same gateway
  (`.eng/k8s/ingress.yaml`), Traefik's own `code-ciir-api`/`code-ciir-indexer` Ingress rules
  intercept `/code-brain/api/code-queries*` and `/code-brain/api/indexer*` directly — the browser
  talks to the right backend without the request ever reaching this app's pod, so
  `deployment.yaml`'s `API_UPSTREAM` never gets asked to route Projects traffic at all.
  `API_UPSTREAM` still exists and still matters for one thing: `/version`, which has no dedicated
  gateway route of its own (see `CLAUDE.md`'s `GET /version` bullet) and so still falls through to
  this app's nginx passthrough — that one case is unaffected by which specific backend
  service Projects happens to live on, so no further change was needed here.

## 4. Testing

- `projects.service.spec.ts`: rewritten for camelCase request/response bodies and the
  `/api/indexer/projects` path; pagination/CRUD test shapes otherwise unchanged.
- `code-queries.service.spec.ts`: URL assertions updated to `/api/code-queries` and
  `/api/code-queries/feedback`; feedback body assertions gained `project_id`.
- `feedback-stats.service.spec.ts`: URL assertions updated to drop `/v1`; DTOs/query-param
  assertions unchanged (no contract change here beyond the path).

## 5. Out of scope

- CIIR-upload/indexation endpoints (`POST /api/indexer/ciir-uploads`,
  `POST /api/indexer/ciir-uploads/register`, `GET /api/indexer/ciir-uploads/{id}`,
  `GET /api/indexer/indexations/{id}`) — this frontend has no UI for indexing and none was requested;
  noted here only so a future reader of `openapi.indexer.generated.json` doesn't wonder why they're
  undocumented in `CLAUDE.md`'s API contract section.
- No new `ProjectsService.get(id)` method — still true per
  `.specs/2026-09-10-ciir-api-migration.md` §9.
- `.eng/k8s/*` changes beyond confirming `deployment.yaml` doesn't hardcode an upstream — see §3.
