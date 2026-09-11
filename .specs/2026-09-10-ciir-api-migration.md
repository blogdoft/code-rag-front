# Spec: Migrate to the Code CIIR API (replaces CodeRAG API)

Status: Draft
Source: `http://localhost:5080/swagger/v1/swagger.json` (confirmed live, 2026-09-10). **The backend
is under active local development** — fetching this same URL twice in one sitting produced two
different contracts (the second fetch, ~15 minutes after the first, added full Projects CRUD that
the first fetch didn't have). Before implementing, re-fetch and diff against this spec; do not
assume the snapshot below is still accurate. Per `CLAUDE.md`'s established rule, the live response
is always authoritative over any committed doc (this spec included).

## 1. Background

The backend is being replaced: **CodeRAG API** (`code-rag-api`, host `code-rag-api.home.arpa`,
title `CodeRag.Api`) is being swapped for a new, differently-shaped service, **Code CIIR API**
(`code-ciir-api`, title `Code CIIR API`), built on a different data model (`code3rag`,
"code intelligence and indexing relations" — projects, code documents, and a *relationship graph*
between them, not just flat snippets). This is not a field-rename pass; the request/response shapes,
the URL structure, and the Projects write model are all different. `SPEC.md`, `CLAUDE.md`'s "API
contract" section, `openapi.generated.json`, `proxy.conf.json`, and the `.eng/` deploy configs all
currently describe the old API and need updating (see §7).

**The `features/reports` module (`feedback-stats-page`, `feedback-trend-chart`, `trend.ts`) and its
backing `FeedbackStatsService`/`FeedbackStats` model are explicitly out of scope for this migration
and must not be deleted.** The new API does not expose `/api/v1/code-queries/feedback/stats` or
`/api/v1/code-queries/feedback/export` yet (confirmed absent from both swagger.json fetches above),
but is expected to grow them later. Leave that module's code untouched; it will simply error via the
existing `error-toast.interceptor.ts` path if visited against the new API until the backend catches
up. See §6 for the one thing worth deciding about that (documented as open, not decided here).

## 2. API contract (confirmed live, 2026-09-10 — see the re-fetch warning above)

### 2.1 Code queries — `POST /api/v1/code-queries` (was `POST /api/v1/projects/{projectId}/code-queries`)

**The project is no longer part of the URL.** It's an optional field in the request body; omitting
it searches across every project. This app's UX still requires selecting a project first (`SPEC.md`),
so it always sends `project_id` — but the endpoint itself is now project-agnostic.

Request (`CodeQueryRequest`):

```jsonc
{
  "question": "string",         // required, non-blank
  "project_id": 123,             // optional int64; app always sends the selected project's id
  "min_similarity": 0.0,         // optional double 0.0-1.0
  "kind": "string",              // optional, EXACT match only — no operator, unlike before
  "qualified_name": {            // optional, matches against symbol_qualified_name
    "operator": "equals" | "contains" | "not_contains",
    "value": "string"            // required if qualified_name present; non-blank
  },
  "limit": 10                    // optional int32, default 10, capped at 50
}
```

Notes:
- `kind` collapsed from the old `{operator, value}` object to a plain string — exact match only, and
  its description does **not** claim case-insensitivity (unlike `qualified_name`'s `equals`, which is
  explicitly case-insensitive). Don't fold case on `kind` client-side.
- The old `namespace` and `type_name` filters are gone. There is one replacement, `qualified_name`,
  which filters on `symbol_qualified_name` (dotted name, container + member, no parameter types) —
  same operator set as the old `type_name` filter (`equals`/`contains`/`not_contains`, no
  `not_equals`), with the same `*` wildcard rule for `contains`/`not_contains`.
- `qualified_name` is an object with `operator` **and** `value` both required together — never send
  one without the other, same all-or-nothing rule as the old per-field filter objects.
- `min_similarity` and `limit` are new request-level knobs, not filters on a document field. See §4.1
  for whether/how to expose them.
- 400 on missing/blank `question`, or invalid `project_id`/`min_similarity`/`kind`/`qualified_name`.
  404 only when `project_id` is given and doesn't match an existing project.

Response (`CodeQueryResponse`) — **shape change: was a bare array, now an envelope**:

```jsonc
{
  "matches": [
    {
      "id": 1,
      "kind": "method",                          // nullable now (was required)
      "symbol_container": "Billing.Services",     // NEW — replaces type_name conceptually
      "symbol_name": "RetryPayment",               // NEW — replaces member conceptually
      "symbol_qualified_name": "Billing.Services.PaymentService.RetryPayment", // NEW
      "symbol_canonical_name": "RetryPayment(int, bool)",                     // NEW — disambiguates overloads
      "source_file": "src/Billing/PaymentService.cs",
      "embedding_text": "...",
      "similarity": 0.87,
      "rerank_score": 0.91,        // NEW, nullable — null unless reranking is configured server-side
      "relations": [                // NEW — this match's direct (1-hop) relations, both directions
        { "from_id": 1, "to_id": 42, "relation_type": "calls", "target_symbol": "...", "resolution_origin": "..." }
      ]
    }
  ],
  "graph": { "nodes": [...], "edges": [...], "truncated": false }  // NEW — see §5, out of scope here
}
```

- `source_file`, `embedding_text`, `similarity`, `id` are unchanged. `gitRawUrl` (the one camelCase
  field the old API had per-result) **no longer exists at all** — the new backend has no git linkage
  concept (see §2.2, same removal on Projects).
- `type_name`/`member` are gone; there is no 1:1 mapping to the four new `symbol_*` fields, they're a
  genuinely richer shape (container, short name, qualified name, and a canonical/signature form for
  overload disambiguation).
- **Ordering must be preserved as returned.** The response is already sorted "by descending
  `rerank_score` when reranking is configured, otherwise by descending cosine `similarity`" — server
  side. `code-queries.service.ts`'s current `.sort((a, b) => b.similarity - a.similarity)` after
  mapping **must be deleted**, not adapted: re-sorting by raw `similarity` client-side would silently
  discard the server's rerank ordering whenever a match's `rerank_score` disagrees with its
  `similarity` rank. This is the one correctness trap in this migration that isn't just a renamed
  field.
- `relations` is always `[]` and `graph` is always empty when `project_id` was omitted from the
  request — moot for this app since it always sends `project_id`.

### 2.2 Feedback — `POST /api/v1/projects/{projectId}/code-queries/feedback` — **unchanged**

Same path, same request (`question`, `useful`, `similarities`, `reason?`, `user`), same response
shape (`id`, `project_id`, `question`, `useful`, `similarities`, `reason`, `user`, `created_at`).
`CodeQueriesService.submitFeedback()` needs no wire-format changes — verify only.

### 2.3 Projects — full CRUD, but a different shape and now paginated

- `GET /api/v1/projects` — **now paginated**, not a bare array. Query params seen: `page` (0-based,
  default 0), `page_size` (default 20, capped at 100). The endpoint's own description still says it
  supports a `name` partial-match filter, but **no `name` parameter is declared** in this swagger
  snapshot's `parameters` array — likely a doc/implementation gap on a service that's mid-build (see
  the re-fetch warning up top). Not blocking: the app already doesn't use server-side `name`
  filtering today (`CLAUDE.md`'s Combobox section notes this explicitly) and this migration doesn't
  change that. Verify against a live response before relying on it if that ever changes.

  ```jsonc
  { "items": [ /* ProjectResponse[] */ ], "page": 0, "page_size": 100, "total_count": 137, "total_pages": 2 }
  ```

- `GET /api/v1/projects/{projectId}` — new; not currently needed by this app (nothing looks up a
  single project by id today), so no new service method for it — YAGNI.
- `POST /api/v1/projects` — create. Body (`ProjectCreateRequest`): `name`, `embedding_model`,
  `embedding_dimensions` (positive int). 201 → `ProjectResponse`. 409 if `name` already exists.
- `PUT /api/v1/projects/{projectId}` — full replace (`ProjectUpdateRequest`, same three fields, all
  required). 200 → `ProjectResponse`. 404, or 409 on name collision with another project.
- `DELETE /api/v1/projects/{projectId}` — 204, no body. 404 if missing. (Deleting a project does not
  cascade to its indexed code documents — indexer's responsibility, not this app's concern.)

`ProjectResponse`:

```jsonc
{ "id": 1, "name": "code-rag-front", "embedding_model": "text-embedding-3-small", "embedding_dimensions": 1536, "created_at": "...", "updated_at": "..." }
```

- **`git_url`/`git_raw_url` are gone** — `code3rag`'s `projects` table has no such columns. This
  removes the "open repository" links currently shown in the Projects table and in the code-search
  history header (§4.2).
- `embedding_model` (string) and `embedding_dimensions` (int) are new, and are the create/update
  payload's only substantive fields alongside `name`.
- 409 on duplicate name is new (the old API had no such constraint documented) — no special handling
  needed, `error-toast.interceptor.ts` already surfaces any failed request's `detail`/`title`, same
  as every other error path in this app.

### 2.4 Version — `GET /version` — unchanged

`{ "version": "string | null" }`. `ApiVersionService` needs no change — verify only.

## 3. Model changes (`core/models/`)

### 3.1 `project.ts`

```ts
export interface Project {
  id: number;
  name: string;
  embeddingModel: string | null;
  embeddingDimensions: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  embeddingModel: string;
  embeddingDimensions: number;
}
```

Drop `gitUrl`/`gitRawUrl` entirely.

### 3.2 `code-query-result.ts`

```ts
export interface CodeQueryRelation {
  fromId: number | null;
  toId: number | null;
  relationType: string | null;
  targetSymbol: string | null;
  resolutionOrigin: string | null;
}

export interface CodeQueryResult {
  id: number;
  kind: string | null;
  symbolContainer: string | null;
  symbolName: string | null;
  symbolQualifiedName: string | null;
  symbolCanonicalName: string | null;
  sourceFile: string | null;
  embeddingText: string | null;
  similarity: number;
  rerankScore: number | null;
  relations: CodeQueryRelation[];
}
```

Drop `gitRawUrl`, `typeName`, `member`.

### 3.3 `code-query-filters.ts` — replaced by a query-options model

The three-field, four-operator filter model doesn't map to the new contract (§2.1). Replace with:

```ts
export type QualifiedNameFilterOperator = 'equals' | 'contains' | 'not_contains';

export interface QualifiedNameFilter {
  operator: QualifiedNameFilterOperator;
  value: string;
}

export interface CodeQueryFilters {
  kind?: string;
  qualifiedName?: QualifiedNameFilter;
  minSimilarity?: number;
  limit?: number;
}

export const DEFAULT_QUALIFIED_NAME_FILTER: QualifiedNameFilter = { operator: 'contains', value: '' };
```

Drop `FilterOperator` (the old shared 4-op union), `CodeQueryFieldFilter`, `DEFAULT_FIELD_FILTER`.

## 4. Service changes (`core/services/`)

### 4.1 `code-queries.service.ts`

- `ask(projectId: number, question: string, filters?: CodeQueryFilters): Observable<CodeQueryResult[]>`
  — same public signature, new internals:
  - POST to `/api/v1/code-queries` (not `/api/v1/projects/${projectId}/code-queries`).
  - Body always includes `project_id: projectId` and `question`; includes `kind` only when
    non-blank (trimmed); includes `qualified_name` only when its `value` is non-blank (trimmed,
    same all-or-nothing rule as §2.1); includes `min_similarity`/`limit` only when set.
  - Maps `response.matches ?? []` to `CodeQueryResult[]`. **Do not re-sort** (§2.1) — map in the
    order the API returned.
  - `response.graph` is received but intentionally not mapped or stored — see §5.
- `submitFeedback(...)` — unchanged, verify only (§2.2).

### 4.2 `projects.service.ts`

- `list(): Observable<Project[]>` — same public signature, but the wire endpoint is now paginated
  (§2.3). Loop: request `page_size=100` (the server's max) starting at `page=0`, and keep requesting
  the next page (via `expand`/recursive `concatMap`, RxJS) while `page + 1 < total_pages`; flatten
  `items` across all pages into one array before mapping to `Project[]`. This preserves the existing
  "fetch the full list once, filter client-side" design the Combobox already documents in `CLAUDE.md`
  (§ Combobox) — every caller (the code-search project combobox, the Projects page's own client-side
  search) keeps working unmodified, and it stays correct even past 100 projects instead of silently
  truncating at the server's page cap.
- `create(input: ProjectInput): Observable<Project>` — `POST /api/v1/projects`, body
  `{ name, embedding_model, embedding_dimensions }` → map `ProjectResponse`.
- `update(id: number, input: ProjectInput): Observable<Project>` — `PUT /api/v1/projects/${id}`, same
  body shape (full replace) → map `ProjectResponse`.
- `remove(id: number): Observable<void>` — `DELETE /api/v1/projects/${id}` → unchanged pattern.

### 4.3 `feedback-stats.service.ts`, `api-version.service.ts` — no changes (§1, §2.4)

## 5. UI changes

### 5.1 `features/code-search/query-filters-drawer.ts`/`.html`

Replace the three fields (Namespace / Kind / Type, each with an operator dropdown) with:

- **Kind** — plain text input, no operator dropdown (exact match only, per §2.1).
- **Qualified name** — operator `<select>` (`equals`/`contains`/`not_contains`) + value `<input>`,
  same interaction pattern as the old Type field, replacing Namespace+Type together.
- **Min similarity** — optional number input, `0`-`1`, step `0.01`.
- **Limit** — optional number input, `1`-`50` (mirrors the API's own cap; leave blank for the
  server's default of 10).

`activeFilterCount()`'s badge on the `Filters` button counts **Kind** and **Qualified name** only
(they narrow *which* documents match, same as before); Min similarity/Limit are result-shaping
options, not filters, so they don't inflate that badge — show them in a visually separate "Options"
group within the same drawer instead of a second popup, since splitting them into their own drawer
would be overkill for two number inputs.

`QueryFiltersDrawerData` carries the new fields' signals in place of the old three. `clearAll()`
resets Kind/Qualified-name to blank and Min similarity/Limit to `undefined`.

### 5.2 `features/code-search/code-search-page.ts`/`.html`

- `QueryHistoryEntry`: drop `projectGitUrl` (Projects no longer have a git URL, §2.3); `filters` is
  now `CodeQueryFilters` per §3.3.
- `filterEntries()`/history-badge rendering: emit **Kind**, **Qualified name** (skip
  min_similarity/limit — they're not filters, and cluttering every history card with them adds noise
  without helping the user tell *why* one entry's results differ from another's, which is what these
  badges are for).
- Results table: drop the **GitRaw** column entirely (no backing field anymore). Replace **Type** /
  **Member** columns with a single **Qualified name** column (`result.symbolQualifiedName ?? '—'`) —
  showing all four new `symbol_*` fields in the compact history table would be cluttered; the other
  three (`symbolContainer`, `symbolName`, `symbolCanonicalName`) move to the detail popup (§5.3)
  where there's room, mirroring how the old Kind/Type/Member summary already deferred full detail to
  the popup.
- History header: drop the "Open repository" link (`entry.projectGitUrl`) — render `entry.projectName`
  as plain text unconditionally, same as the existing `@else` branch.
- `submit()`: drop reading `selectedProject?.gitUrl`.

### 5.3 `features/code-search/result-detail-dialog.ts`/`.html`

- Header: `result.symbolContainer` / `result.symbolName` in place of `result.typeName` /
  `result.member`; add `result.symbolCanonicalName` when it differs from `symbolName` (overload
  disambiguation is the whole point of that field); show `result.rerankScore` alongside `similarity`
  when non-null (e.g. `similarity 0.87 · rerank 0.91`).
- Below the existing `embeddingText` `<pre>` block, add a compact **Relations** section listing
  `result.relations` (empty state: nothing rendered, same as today's implicit empty states) — each
  relation as one line, e.g. `→ calls PaymentGateway.Charge` (outgoing, `from_id === result.id`) or
  `← calls RetryPayment` (incoming, `to_id === result.id`), using `target_symbol` as the label since
  `to_id`/`from_id` are opaque ids with no name lookup available in this response. This surfaces the
  new per-match relationship data without building graph visualization (§5.4/§6).

### 5.4 `features/projects/projects-page.ts`/`.html`, `project-form-dialog.ts`/`.html`

CRUD stays (the new API has full CRUD, §2.3) — only the fields change:

- Table: replace the **Git URL** column with **Embedding model** (`project.embeddingModel ?? '—'`,
  with `embeddingDimensions` alongside, e.g. `text-embedding-3-small (1536)`), in the same one column
  the old Git URL occupied — no new column added for `updatedAt`; `createdAt` already covers "when
  was this project set up" and a second timestamp column isn't needed for this migration to be
  complete (can be a follow-up if there's a concrete need for it later).
- `project-form-dialog`: replace the `gitUrl`/`gitRawUrl` signals and fields with `embeddingModel`
  (text, required non-blank) and `embeddingDimensions` (number, required positive integer).
  `isDirty()` compares against the original the same way, just on the new fields.
- `canSave`: `name`, `embeddingModel` non-blank, `embeddingDimensions` a positive integer.

### 5.5 `features/reports/*` — no changes (§1)

## 6. Open questions (need a decision before/while implementing, not covered by this spec)

- **Dev proxy target** (`proxy.conf.json`'s `/api` and `/version` entries) and the matching
  production defaults (`.eng/docker/docker-compose.yml`'s `API_UPSTREAM`,
  `.eng/k8s/deployment.yaml`'s upstream env value) all currently point at
  `https://code-rag-api.home.arpa`. Deferred — needs a real hostname for the new API before this
  ships. Get this right rather than guessing: `CLAUDE.md` already documents a real incident
  (`ERR_CERT_AUTHORITY_INVALID`) caused by a wrong default host bypassing the dev proxy, and the same
  failure mode applies to whichever of these three places is updated with the wrong value.
- **Reports nav visibility.** `features/reports` stays in the codebase and routes unmodified (§1), but
  visiting it against the new API will produce error toasts for endpoints that don't exist yet
  (§2.3's absence note). This spec makes no change to `nav-sidebar` — the "Reports" link stays visible
  — since nothing was asked about hiding it; flagging here in case that UX is worse than intended once
  this ships, so it can be revisited as its own small follow-up rather than folded into this migration.

## 7. Documentation/config updates (do alongside the code changes, not after)

- `CLAUDE.md`: rewrite the entire "API contract" section for the new endpoints/DTOs (§2); note that
  the casing caveat itself still applies in spirit (the new API's `swagger.json` looks accurate right
  now, but re-verify live before trusting any specific field). While in there: the Architecture
  section's directory tree already doesn't list `features/projects` or `features/reports` at all —
  unrelated to this migration, but worth fixing in the same pass since the section is being rewritten
  anyway.
- `openapi.generated.json`: replace its contents with a fresh fetch of the new `swagger.json` at
  implementation time (not the snapshot embedded in this spec, per the re-fetch warning up top).
- `v1.json`: `CLAUDE.md` already references this file as documenting the backend contract, but it
  doesn't exist in the repo (confirmed absent, 2026-09-10) — pre-existing gap, unrelated to this
  migration; either add it back or drop the reference while touching that paragraph anyway.
- `SPEC.md` (line 3, `https://code-rag-api.home.arpa`): update once §6's hostname decision lands.

## 8. Testing

- `code-queries.service.spec.ts`: `ask()` posts to `/api/v1/code-queries` (not the old
  project-scoped path) with `project_id` in the body; `kind`/`qualified_name`/`min_similarity`/`limit`
  each included only when set/non-blank; maps `response.matches`; **asserts the mapped order matches
  response order verbatim** (regression test for the dropped client-side sort, §2.1) — e.g. a fixture
  where `similarity` order and `rerank_score` order disagree, verifying the service doesn't reorder.
  `submitFeedback()` assertions unchanged.
- `projects.service.spec.ts`: `list()` follows pagination across multiple pages and flattens `items`
  (fixture: `total_pages: 2`, verify a second request is made and both pages' items appear, in
  order); `create()`/`update()` post the new `{name, embedding_model, embedding_dimensions}` shape;
  `remove()` unchanged.
- `query-filters-drawer.spec.ts`: Kind field has no operator control; Qualified-name field's operator
  `<select>` only offers `equals`/`contains`/`not_contains`; Min similarity/Limit edit their own
  signals; `Clear` resets all four.
- `code-search-page.spec.ts`: `activeFilterCount()` counts only Kind/Qualified-name, not Min
  similarity/Limit; history entries no longer carry/display `projectGitUrl`; results table has no
  GitRaw column.
- `result-detail-dialog.spec.ts`: renders `symbolContainer`/`symbolName`/`symbolCanonicalName`/
  `rerankScore`; renders a relation line per entry in `relations`, correctly picking incoming vs.
  outgoing arrow based on `from_id`/`to_id` against `result.id`.
- `project-form-dialog.spec.ts`: `canSave`/`isDirty` cover `embeddingModel`/`embeddingDimensions`
  instead of the old URL fields; `embeddingDimensions` rejects non-positive/non-integer input.

## 9. Out of scope

- **Relationship graph visualization** (`CodeQueryResponse.graph`: nodes/edges/truncated). Per
  explicit direction: this data exists primarily for the MCP-facing consumer of this API, not this
  frontend. `graph` is received and discarded (§4.1) — not stored, not rendered. A per-match
  `relations` list is surfaced in the detail popup (§5.3) as the one piece of the new relationship
  data this pass does expose, since it's already scoped to a single match and needs no graph
  rendering to show usefully. Full graph UI is its own future spec if this app ever needs it.
- No change to `features/reports`/`FeedbackStatsService` beyond leaving them in place (§1, §5.5).
- No new `ProjectsService.get(id)` method — nothing in this app needs single-project lookup yet
  (§2.3).
- No UI for `GET /api/v1/projects`'s page/page_size mechanics directly — `ProjectsService.list()`
  absorbs pagination internally (§4.2) so no feature code needs to know it exists.
