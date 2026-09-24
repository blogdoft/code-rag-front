# Spec: camelCase everywhere + UUID project/upload ids

Status: Implemented
Sources (both fetched live 2026-09-24 and saved verbatim as `openapi.generated.json` /
`openapi.indexer.generated.json`):
- `https://blogdoft.home.arpa/code-brain/api/code-queries/swagger/v1/swagger.json` — code-ciir-api
- `https://blogdoft.home.arpa/code-brain/api/indexer/openapi/v1.json` — CIIR Indexer API

Per `CLAUDE.md`, the live response is authoritative over this spec.

## 1. What changed

1. **code-ciir-api is camelCase now** — request bodies, response bodies *and* query-string
   parameters. It was snake_case (`project_id`, `symbol_qualified_name`, `start_date`, ...). The two
   services no longer differ in body casing; only the CIIR Indexer's `GET /api/indexer/projects`
   keeps snake_case query params (`page`, `page_size`).
2. **Project ids are UUID strings** (`format: uuid`) everywhere: `ProjectResponse.id`,
   `CodeQueryRequest.projectId`, `CodeQueryFeedbackRequest/Response.projectId`,
   `ProjectFeedbackStatsResponse.projectId`, `CiirUploadStatusResponse.projectId`, the `projectId`
   query param on `feedback/stats` / `feedback/export`, and the `{projectId}` path segment on
   `/api/indexer/projects/{projectId}`. Previously int64 (number).
3. **`qualifiedName.operator` is `notContains`** (was `not_contains`). `equals`/`contains` unchanged.
4. `GET /version` is now declared in code-ciir-api's swagger, and the gateway routes it (401 without
   a token, no longer 404).

Unchanged: document/relation ids in code-query results (`id`, `fromId`, `toId`) stay int64; upload
and indexation ids were already UUIDs; `CodeQueryFeedbackResponse.id` stays int64; the Indexer's
counters are still int64-or-string and go through `Number(...)`; `embeddingDimensions` likewise.

## 2. Frontend changes

- `Project.id`, `CiirUploadStatus.projectId`, `ProjectFeedbackStats.projectId`, `ComboboxOption.id`
  and every `selectedProjectId`/history `projectId` are `string`. The reports page's "All projects"
  sentinel is `'all'` (was `-1`; UUIDs can't collide with it).
- `code-queries.service.ts`, `feedback-stats.service.ts`: DTOs are camelCase; the mappers are now
  nearly 1:1 but stay as the fix point if the wire format changes again. `feedback-stats` sends
  `startDate`/`endDate`/`projectId`/`timezone` query params.
- `projects.service.ts`: `id` is passed through as-is (no `Number(...)`); `update`/`remove` take a
  string id.
- `ciir-uploads.service.ts`: `upload(projectId: string, ...)`, appended to the multipart body as-is.
- `QualifiedNameFilterOperator` is `'equals' | 'contains' | 'notContains'`;
  `qualifiedNameOperatorLabel()` (in `core/models/code-query-filters.ts`) renders it as
  "not contains" in the filters drawer and in the history badges.

## 3. Found while testing against the real APIs (2026-09-24)

- **Blank git URLs must be sent as `null`, never `""`.** The Indexer stores `""` verbatim, and
  code-ciir-api then throws `UriFormatException: Invalid URI: The URI is empty` in
  `ProjectTable.ToDomain()` (`ProjectsRepository.GetByPublicIdAsync`) — a **500 with no body** on
  every call that resolves that project: `POST /api/code-queries` with `projectId`, feedback POST,
  `feedback/stats|export` with `projectId`. Unknown project ids still 404 and calls without
  `projectId` still work, which is why it looked like a flaky backend. `ProjectFormDialog.save()`
  now sends `null` for blank/whitespace-only `gitUrl`/`gitRawUrl` (spec'd). Projects already saved
  with `""` are repaired by a `PUT` with `gitUrl: null, gitRawUrl: null`.
- The Indexer ignores the requested `embeddingModel`/`embeddingDimensions` on create (a project
  created with `text-embedding-3-small`/1536 came back `bge-m3`/1024); the UI just shows what the
  server returns.
- `DELETE /api/indexer/projects/{id}` answers **500** (`DatabaseUnavailableException`, no detail in
  the pod logs) for projects that have dependents (uploads/indexations, feedback); a project with
  none deletes fine (204). Presumably foreign keys — the server should answer 409, not 500. Not
  fixable from the frontend; the generic error toast is what the user sees.
- The exported feedback CSV header is still snake_case (`project_id`, `created_at`); the app only
  downloads the file, so it isn't affected.

## 4. Not changed on purpose

- `graph` in `POST /api/code-queries` responses is still unused.
- No UI/route changes; nothing in the router keyed on numeric project ids.
