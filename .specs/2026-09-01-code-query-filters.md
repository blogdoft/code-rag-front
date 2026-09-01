# Spec: Code Query Filters (kind / namespace / typeName)

Status: Draft (revised four times — accordion panel replaced with a side drawer; the drawer's
confirm button was briefly turned into a direct "Ask" action and then reverted back to `Filter`;
the question field was made to persist across searches; the filter field order was changed to
Namespace, Kind, Type; see §4)
Source: `https://code-rag-api.home.arpa/swagger/v1/swagger.json` (confirmed live, 2026-09-01)

## Revision note (2026-09-01, fourth pass)

Filter field order in the drawer (and everywhere else it's echoed — history badges, the component's
own field declarations) is now **Namespace, Kind, Type**, not the original Kind/Namespace/Type build
order. See the field-order callout in §4.1 and the reordered §4.3.

## Revision note (2026-09-01, third pass — revert)

The second pass (below) renamed the drawer's `Filter` button to `Ask` and made it run the query
directly, disabled whenever `canSubmit` was false. In practice that's a trap: a user opens the
drawer to set filters *before* having typed a question yet, and finds the only action button
disabled with no obvious reason why (the disabling condition — blank question — lives on a
different field, outside the drawer entirely). That coupling was the actual problem, not just the
label, so this reverts all of it: the button is `Filter` again, always enabled, and just closes the
drawer (`dialogRef.close()`) without running a query — same as before the second pass. The
`ask`/`canAsk` additions to `QueryFiltersDrawerData` are removed entirely (see the reverted §4.1
and §4.2 below). The question-persistence change from the second pass (§4.2a) is unaffected and
stays as-is — it was not part of this complaint.

## Revision note (2026-09-01, second pass)

Two follow-up changes on top of the drawer (§4) — **the first of these was reverted in the third
pass above; only the second stands.**
1. ~~The drawer's `Filter` button is renamed **`Ask`** and now actually runs the query (calls the
   same `submit()` the main page's `Ask` button calls) instead of just closing the drawer.~~
   Reverted — see the third-pass note above.
2. The `question` field now persists across searches the same way the filter fields already did —
   `submit()` no longer clears it. See §4.2a.

## Revision note (2026-09-01)

The first implementation put the three filters inline as a collapsible accordion panel between
the question field and the Ask button. In practice this read as visually cluttered — the filters
blurred together with the question form instead of reading as a distinct, deliberate action. §4
below replaces that panel with a "Filters" button that opens a side drawer (min. 50% of viewport
width) containing the three filter fields plus explicit `Filter`/`Clear` actions. Filter values
persist across searches — they already did, since nothing in `submit()` ever reset them — this
revision only changes where/how they're presented, not the API contract in §2, which is
unchanged.

## 1. Background

`POST /api/v1/projects/{projectId}/code-queries` now accepts three optional filters alongside
`question`, each narrowing results to code documents matching a condition on that field. Today
`code-search-page.ts`/`.html` only sends `{ question }` (`code-queries.service.ts:28`) and has no UI
for filters. This spec covers adding filter UI, wiring the request payload, and updating the DTO/model
layer to carry the new request shape. The response shape (`CodeQueryResultResponse`) is unchanged
except for fields already handled in this app (`gitRawUrl`, `gitUrl` — see `feat: add gitRawUrl...`
commit); **`namespace` is not present in the response**, so filtering by namespace narrows results but
nothing new is displayed per-result.

## 2. API contract (confirmed via live swagger.json)

`CodeQueryRequest` body:

```jsonc
{
  "question": "string",          // required, existing
  "kind": {                      // optional
    "operator": "contains" | "equals" | "not_equals",
    "value": "string"            // required if kind present; non-blank
  },
  "namespace": {                 // optional
    "operator": "contains" | "not_contains" | "equals" | "not_equals",
    "value": "string"
  },
  "type_name": {                 // optional — note snake_case key, unlike camelCase `typeName` elsewhere in docs
    "operator": "contains" | "not_contains" | "equals",
    "value": "string"
  }
}
```

Notes:
- Each filter is an independent optional object; omit the key entirely to not filter on that field
  (do not send `null` — `additionalProperties: false` and the DTOs are plain objects, so send nothing
  when a filter is inactive).
- `value` must not be empty/blank when a filter object is sent — a blank filter value is a 400, same
  family of error as a blank `question` today (`error-toast.interceptor.ts` already surfaces
  `ProblemDetails.detail`/`title` for this, no new handling needed).
- `*` is a wildcard **only** for `contains`/`not_contains` operators (matches any sequence of
  characters, e.g. `fun*`, `*Controller`, `*Billing*`). For `equals`/`not_equals` it is matched
  literally (no wildcard expansion) — the value is compared case-insensitively as a whole.
- Operator sets differ per field — **do not reuse one shared operator enum**:
  - `kind`: `contains`, `equals`, `not_equals` (no `not_contains`)
  - `namespace`: `contains`, `not_contains`, `equals`, `not_equals` (full set)
  - `type_name`: `contains`, `not_contains`, `equals` (no `not_equals`)
- Per the app's established convention (`CLAUDE.md` "API contract"), trust this live-fetched swagger
  over any committed OpenAPI docs in the repo for wire casing.

## 3. Model changes

### 3.1 `core/models/code-query-result.ts` — no change to the result shape itself, but add a
sibling request-filter model, e.g. `core/models/code-query-filters.ts`:

```ts
export type FilterOperator = 'contains' | 'not_contains' | 'equals' | 'not_equals';

export interface CodeQueryFieldFilter {
  operator: FilterOperator;
  value: string;
}

export interface CodeQueryFilters {
  kind?: CodeQueryFieldFilter;
  namespace?: CodeQueryFieldFilter;
  typeName?: CodeQueryFieldFilter;
}
```

Keep `FilterOperator` as the full union for simplicity in the shared model/UI layer; the service
mapper is responsible for rejecting/ignoring operators invalid for a given field before serializing
(see 4.2) so the wire body never carries an operator a field doesn't support. UI components should
only offer the valid subset per field (see 5.2) so this rejection path is a safety net, not something
a user can normally trigger.

### 3.2 `core/services/code-queries.service.ts`

- Extend `ask()` to accept an optional `filters: CodeQueryFilters` param:
  `ask(projectId: number, question: string, filters?: CodeQueryFilters): Observable<CodeQueryResult[]>`.
- Add DTO types mirroring the wire shape (`CodeQueryFieldFilterDto { operator; value }`) and a
  `toRequestBody()` mapper that:
  - always includes `question`;
  - includes `kind`/`namespace`/`type_name` keys **only when** the corresponding filter is present
    (object exists) — never emit an empty/`null` filter object, and never emit a filter with a
    blank/whitespace-only value (trim before checking, same rule as `question`);
  - maps `filters.typeName` → wire key `type_name` (mirroring `type_name`/`typeName` elsewhere in this
    service).

## 4. UI changes — `features/code-search`

### 4.1 Filters button + side drawer (replaces the accordion panel)

Instead of an inline collapsible section, the question form gets a single `Filters` button (placed
where the accordion toggle used to sit — between the question input and the Ask button). Clicking it
opens a **side drawer**: a popup docked to the right edge of the viewport, full height, at least 50%
of the viewport width (`50vw` on `sm:` (640px) and up, full-bleed `100vw` below that — see the CSS
below). This keeps the primary question-first flow uncluttered (§ rationale
in the Revision note above) while still surfacing how many filters are active via a small count badge
on the `Filters` button itself (e.g. `Filters (2)`) so the user isn't left guessing whether filters
are silently applied.

Build the drawer as a new component in `features/code-search`, e.g. `query-filters-drawer.ts`/`.html`,
following the existing `ResultDetailDialog`/`ConfirmDialog` pattern (§ Architecture in `CLAUDE.md`):
opened via `PopupService.open(QueryFiltersDrawer, { panelClass: 'filter-drawer-panel', data })`.

**Docking the drawer to the side** is a presentation concern, not something `PopupService`/`PopupOptions`
needs new API for — `@angular/cdk/dialog`'s `DialogConfig` already exposes `panelClass`, which
`PopupOptions` passes through unchanged. Add a small global rule in `src/styles.css` scoped to that one
class:

```css
.filter-drawer-panel {
  position: fixed !important;
  inset: 0 0 0 auto;
  width: 50vw;
  min-width: 50vw;
  height: 100dvh;
  max-height: 100dvh;
  margin: 0 !important;
}

@media (max-width: 639px) {
  .filter-drawer-panel {
    width: 100vw;
    min-width: 100vw;
  }
}
```

`position: fixed` pulls the pane out of the CDK overlay's centering flex-wrapper entirely, so it docks
to the viewport's right edge regardless of the wrapper's own centering styles — no custom
`positionStrategy` needed. **Width must be set here, on the panel class, not on the drawer component's
own root element**: with only `top`/`right`/`bottom` set on a `position: fixed` box (`left` is `auto`),
the box has no intrinsic width to give a percentage-width child to resolve against, so a `w-full` (or
`sm:w-1/2`) on the component's root div alone collapses to content width instead of stretching — this
was caught by driving the built app with Playwright, not by reading the CSS. The drawer component's own
root element supplies only height/flex/shadow classes (`flex h-full w-full flex-col ...`), mirroring how
`ResultDetailDialog`'s root div owns its own sizing (`result-detail-dialog.html:1-3`) for a *centered*
dialog, where the overlay wrapper's flex-centering does give the pane a content-based width to work
from — the fixed-position drawer case needs the width nailed down explicitly instead.

**State model — filters live on `CodeSearchPage`, the drawer edits them by reference.** `CodeSearchPage`
keeps owning the three per-field signals (`kindFilter`, `namespaceFilter`, `typeNameFilter` — unchanged
from the original plan) as the single source of truth, since that's also where "persist across
searches" naturally lives (nothing resets them in `submit()`, so they already persist — see Revision
note). Pass the `WritableSignal` instances themselves into the drawer via `DIALOG_DATA`:

```ts
protected openFiltersDrawer(): void {
  this.popupService.open(QueryFiltersDrawer, {
    panelClass: 'filter-drawer-panel',
    data: {
      kindFilter: this.kindFilter,
      namespaceFilter: this.namespaceFilter,
      typeNameFilter: this.typeNameFilter,
      kindOperators: this.kindOperators,
      namespaceOperators: this.namespaceOperators,
      typeNameOperators: this.typeNameOperators,
    } satisfies QueryFiltersDrawerData,
  });
}
```

`QueryFiltersDrawerData` carries only the filter signals and their operator lists — no `ask`/`canAsk`
(removed in the third-pass revert above). The drawer has no way to trigger or gate a query; it only
edits the shared filter signals and closes.

The drawer edits are applied live (each keystroke/select-change calls `.update()` on the injected
signal directly), matching how the accordion version worked — there is no separate "draft" state to
reconcile, and therefore no need for `PopupService`'s `isDirty`/confirm-discard path here (unlike
`ResultDetailDialog`, this popup's state changes are never "unsaved" — they're committed the instant
they're typed, same as the main `question` field is).

Inside the drawer, each of the three filters gets an operator `<select>` scoped to that field's valid
operator set (§2) defaulting to `contains`, and a value `<input>` cleared via `[appEscClearable]` —
identical field-level behavior to the original accordion plan, just relocated into the drawer's
template. **Field order is `Namespace`, `Kind`, `Type`** (fourth-pass revision, 2026-09-01) — not the
`Kind`/`Namespace`/`Type` order the fields were originally built in; the history-badge order
(§4.3) and the component's internal signal/operator-array declaration order were updated to match, so
the field order reads the same way everywhere it appears (drawer, history badges, source).

The drawer's footer holds two actions:
- **`Filter`** — closes the drawer (`dialogRef.close()`). Since edits are already live on the shared
  signals, this is a confirmation/dismiss action, not a separate "commit" step. **Always enabled** —
  unlike the reverted "Ask" variant (second pass), this button has nothing to do with whether a
  question has been typed; the drawer is filters-only, so tying its action button to `canSubmit`
  (a condition determined entirely outside the drawer) meant a user setting up filters *before*
  typing a question hit a disabled button for no reason visible from inside the drawer. `Filter`
  only touches filter state, so it's never disabled.
- **`Clear`** — resets all three filter signals back to `{ operator: 'contains', value: '' }` and
  closes the drawer, mirroring `Filter`'s close-on-action behavior so the two buttons read as
  symmetric, mutually exclusive ways to leave the drawer (keep current values vs. reset then leave).

The header's `×` close button (`close()`) also just dismisses the drawer without submitting or
resetting anything, for when the user opened it only to check what's currently applied.

Escape still closes the drawer via the existing document-level handler (`PopupCoordinatorService`) —
no special-casing needed since there's no dirty-state confirmation involved here.

### 4.2 State (`code-search-page.ts`)

- Keep the three per-field signals (`kindFilter`, `namespaceFilter`, `typeNameFilter`), each
  `signal<CodeQueryFieldFilter>({ operator: 'contains', value: '' })`, and the per-field valid-operator
  arrays (`kindOperators`, `namespaceOperators`, `typeNameOperators`) — these move from driving an
  inline panel to being handed to the drawer via `DIALOG_DATA` (§4.1), but their shape and lifetime on
  `CodeSearchPage` are unchanged from the original plan.
- Drop the accordion's `filtersExpanded` signal and inline `updateFilter()` template wiring; replace
  with `openFiltersDrawer()` (§4.1) and a small `activeFilterCount()` (or similar) used for the button's
  count badge.
- `canSubmit` is unaffected — filters are optional, question is still the only required input.
- `submit()` builds a `CodeQueryFilters` object from the active (non-blank) filter fields (via the
  same `buildFilters()`/`activeFilter()` trimming logic as before) and passes it to
  `codeQueriesService.ask(projectId, question, filters)`.
- Record the active filters on `QueryHistoryEntry` (extend the interface with a `filters:
  CodeQueryFilters` field) so each history card can show what filters produced its results —
  otherwise a user scrolling past history has no way to tell why one entry's results differ from
  another's.

### 4.2a Question field persists across searches

`submit()`'s success handler currently does `this.question.set('')` after recording the history
entry — drop that line. The question field should behave like the filter fields: it stays populated
after a search so the user can tweak it slightly (or just re-read what they asked) and ask again,
rather than being wiped and forcing them to retype or scroll back through history to see what they
asked. `question` is still cleared the normal way a text field is — the user clears it themselves
(the existing `[appEscClearable]`/Escape behavior on the field, or manual editing) — `submit()` just
stops doing it automatically. Nothing else about `submit()` changes: `canSubmit`, the trimming logic,
and history recording are unaffected.

### 4.3 History card display

In `code-search-page.html`'s history entry header (around line 39-61), render a compact filter
summary next to the question when `entry.filters` has any active filter, e.g. small pill badges like
`namespace contains "*Billing*"`. Keep it terse — this is metadata about the query, not the main
content. `filterEntries()` (`code-search-page.ts`) emits them in **Namespace, Kind, Type** order,
matching the drawer's field order (§4.1) — not per-filter alphabetical or the original build order.

### 4.4 No change to `ResultDetailDialog` or the results table

The response shape is unchanged, so `result-detail-dialog.ts`/`.html` and the results `<table>` in
`code-search-page.html` (lines 78-122) need no changes. `namespace` is a filter-only field with no
response counterpart — do not add a "Namespace" column to the results table since the API never
returns it.

## 5. Validation / error handling

- Client-side: trim filter values before treating them as "active"; an all-whitespace value is
  treated the same as empty (filter omitted from the request), rather than sent and rejected by the
  API with a 400 — this mirrors how the existing `question` field is trimmed in `submit()`
  (`code-search-page.ts:67`).
- Server-side 400s from an invalid/blank filter value (should be unreachable given the above) fall
  through to the existing `error-toast.interceptor.ts` path — no new error handling required.

## 6. Testing

- `code-queries.service.spec.ts`: cover `toRequestBody()` mapping — no filters → body is
  `{ question }` only; each of the three filters individually → correct wire key
  (`kind`/`namespace`/`type_name`) and shape; blank filter value → filter omitted.
- `query-filters-drawer.spec.ts` (new, following `result-detail-dialog.spec.ts`'s pattern of providing
  `DIALOG_DATA`/`DialogRef` directly): editing a field's operator/value updates the injected signal
  immediately; `Clear` resets all three injected signals to `{ operator: 'contains', value: '' }` and
  closes; `Filter` closes without altering the signals and is always enabled (no `canAsk`/disabled
  concept — reverted in the third pass); each field's `<select>` only offers that field's valid
  operator set.
- `code-search-page.spec.ts`: clicking `Filters` opens `QueryFiltersDrawer` via `popupService.open`
  with the three filter signals (and their operator lists) as `data` (no `ask`/`canAsk`); the button
  shows an active-filter count badge that updates as filters change; submitting calls `ask()` (the
  service method) with the expected `CodeQueryFilters` built from whatever the signals currently hold;
  a filter set in one search is still present (persists) on the next `submit()` call without reopening
  the drawer; **the question field is no longer cleared after a successful submit** (persists the same
  way); history entry retains and displays the filters used per search.

## 7. Out of scope

- No change to `GET /api/v1/projects` or its `name` query param (unrelated endpoint, already noted
  as unused in `CLAUDE.md`'s Combobox section).
- No persistence of filter values across page reloads/localStorage — filters are query-scoped, like
  the question itself.
- No changes to `SPEC.md` as part of this spec — if the product spec should document this feature,
  that's a follow-up once the UI is built and reviewed, since `SPEC.md` is in Portuguese and describes
  product requirements rather than implementation.
