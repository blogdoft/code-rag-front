# Spec: Migrate to the Code CIIR API (replaces CodeRAG API)

Status: Implemented, but **superseded in every technical detail** by
`.specs/2026-09-18-gateway-and-projects-migration.md` and `.specs/2026-09-24-camelcase-and-uuid-contract.md`
(and, before those, by `CLAUDE.md`'s API contract section, which is always the authoritative
description of the live contract). Kept only for the migration's rationale and one decision that is
still load-bearing today (§2). Do not use anything below as a description of the current wire
format — endpoint paths, field casing, and even which fields exist have all changed since this was
written.

## 1. Background

The backend was replaced: **CodeRAG API** (flat snippets, no relationship graph) was swapped for
**Code CIIR API**, built on a richer data model — projects, code documents, and a *relationship
graph* between them. This was not a field-rename pass: request/response shapes, the URL structure,
and the Projects write model all changed. The move also introduced the per-match `relations[]` and
the request-level `graph` this app still receives and intentionally ignores (see `CLAUDE.md`).

`features/reports` (feedback stats) was explicitly out of scope for this migration and untouched by
it — those endpoints didn't exist yet on the new API at the time and went live later (see
`.specs/2026-09-18-gateway-and-projects-migration.md` §1).

The backend was under active development throughout: fetching its `swagger.json` twice in one
sitting (~15 minutes apart) produced two different contracts, the second adding full Projects CRUD
the first didn't have. This is the concrete incident behind `CLAUDE.md`'s "re-fetch and diff before
trusting any specific field" rule — the instability wasn't a one-off, as the two migrations that
followed this one (§3) confirm.

## 2. The one decision that still matters: never re-sort results client-side

Before this migration, the app sorted `CodeQueryResult[]` by `similarity` descending after mapping
the response (`.specs/2026-09-03-sort-results-by-similarity.md`, since removed as a spec — its
premise was exactly this). The new API returns results **pre-sorted server-side** — by descending
`rerankScore` when reranking is configured, otherwise by descending `similarity` — and that ordering
can disagree with a raw-similarity sort whenever reranking is active. Re-sorting client-side would
silently discard the server's reranking. `CodeQueriesService.ask()` must map results in the order
the API returns them, full stop. This is still current behavior and is documented as a hard rule in
`CLAUDE.md`'s API contract section.

## 3. Things this migration got wrong in hindsight

- It claimed `git_url`/`git_raw_url` had been dropped from Projects entirely. They hadn't — the live
  API kept returning them the whole time; `.specs/2026-09-18-gateway-and-projects-migration.md` §2.4
  corrected the record once this was noticed. Both fields are present today (`CLAUDE.md`).
- It introduced `embeddingModel`/`embeddingDimensions` as required project fields (replacing the git
  URL fields in the write form). Those two fields were themselves dropped entirely later
  (`refactor(projects)!: drop embedding model/dimensions fields`) — there's no dedicated spec for
  that removal; `CLAUDE.md`'s current `ProjectResponse` shape (`{ id, name, gitUrl, gitRawUrl,
  createdAt, updatedAt }`) is authoritative.
- Every endpoint path documented here (`/api/v1/code-queries`, `/api/v1/projects*`) has since moved
  again, twice — see the two superseding specs listed at the top of this document.

## 4. Current contract

See `CLAUDE.md`'s "API contract — trust the live response over the OpenAPI docs" section.
