# Spec: Code Query Feedback (Useful / Not Useful)

Status: Implemented

## 1. Background

The CodeRAG API now exposes `POST /api/v1/projects/{projectId}/code-queries/feedback`, letting a
caller record whether the results of a prior question were useful. The backend already has an
aggregate read side for this data — `GET /api/v1/code-queries/feedback/stats`, consumed by the
existing `/reports` page (`feedback-stats-page.ts`) — but nothing in this frontend currently
*submits* feedback. This spec adds that: "Useful"/"Not useful" controls next to each search's
results card on the Rag page; voting "Not useful" asks for an optional reason via a popup; after
voting, the controls are replaced by a static colored label.

## 2. API contract

Confirmed via `https://code-rag-api.home.arpa/swagger/v1/swagger.json` and cross-checked against
the `submit_code_query_feedback` MCP tool schema (already available in this environment, backed
by the same endpoint).

`POST /api/v1/projects/{projectId}/code-queries/feedback`

Request body (`CodeQueryFeedbackRequest`) — every field name is already a single lowercase word,
so unlike other DTOs in this app there's no camelCase↔snake_case translation to do here:

```json
{
  "question": "string, required, must not be empty/blank",
  "useful": "boolean, required",
  "similarities": "number[], required (may be [] when the query returned zero results)",
  "reason": "string, optional — never required, even when useful is false",
  "user": "string, required — identity of the caller; must never be blank or guessed"
}
```

Response `201 Created` (`CodeQueryFeedbackResponse`, snake_case): `id`, `project_id`, `question`,
`useful`, `similarities`, `reason`, `user`, `created_at`. **There is no GET to read a feedback
record back** — the UI has no way to know, on load, whether a past query already got feedback;
the "already voted" state only exists for as long as the page stays open (see §4.4).

Errors: `400` (missing/invalid required fields), `404` (project doesn't exist), `500`. **No
`409`** — the API accepts multiple feedback submissions for the same question without conflict.

**Live wire-casing not verified for this specific endpoint** (only `GET .../feedback/stats` was
probed live, and it matched the snake_case docs) — but since every field in this request body is
already a single word with no casing ambiguity, the risk of a doc-vs-wire mismatch here is low.
Confirm on the first manual test regardless, per this project's standing rule of trusting the live
response over the OpenAPI docs.

## 3. Decisions

1. **Feedback scope is per question/search, not per result row.** The API models feedback as
   `question` + the `similarities` array of **all** results returned for it — there's no result id
   to correlate feedback to one specific row. This lines up with how results already render: one
   `<table>` per question inside a single `<article>` (`code-search-page.html`) — "the card
   containing the search result" is that whole `<article>`, and the Useful/Not-useful controls
   appear **once per question asked**, not once per table row.
2. **The `user` field**: since this app has no login, a new "Your name" field is added to the
   Settings page, persisted in `localStorage` the same way the API base URL already is
   (`ConfigService` / `code-rag.apiBaseUrl`). If that field is empty when the user tries to give
   feedback, a popup asks for their name right then (see §4.6) instead of just erroring out — on
   confirm, the name is saved to `ConfigService` (so Settings immediately reflects it) and the
   feedback that triggered the prompt proceeds; on cancel, **the whole feedback action is aborted**,
   including a reason already typed into the "Not useful" popup that led here.
3. **"Not useful" popup title**: an earlier approval landed on "Why wasn't this result helpful?"
   before the per-question (not per-result) scope was confirmed. Adjusted to **"Why weren't these
   results helpful?"** (plural) to match the actual scope — called out explicitly here since it
   diverges from the literal text approved earlier.
4. All new UI copy is in English, matching the rest of the app (`Filters`, `Cancel`, `Discard
   changes`, etc.) — the version badge's Portuguese text is a pre-existing, isolated outlier, not
   a convention to extend.

## 4. Design

### 4.1 `ConfigService` (`src/app/core/services/config.service.ts`)

Same pattern as `apiBaseUrl` — its own `localStorage` key, a readonly signal, a setter:

```ts
const USER_NAME_KEY = 'code-rag.userName';

readonly userName = this.userNameSignal.asReadonly();
setUserName(value: string): void {
  const trimmed = value.trim();
  localStorage.setItem(USER_NAME_KEY, trimmed);
  this.userNameSignal.set(trimmed);
}
```

### 4.2 Settings page — new "Feedback" section

A new `<section>` (same `rounded-lg border ... p-5 shadow-sm` card style as the existing "API
settings" section) below the current one, with a single "Your name" text field (same
`appEscClearable` + Save pattern as the API base URL field) and its own independent Save button —
no shared validation with the URL field. No format validation beyond trimming; an empty value is
a valid "not configured yet" state.

### 4.3 `CodeQueriesService` — new `submitFeedback()` method

```ts
interface CodeQueryFeedbackRequestDto {
  question: string;
  useful: boolean;
  similarities: number[];
  reason?: string;
  user: string;
}

submitFeedback(
  projectId: number,
  params: { question: string; useful: boolean; similarities: number[]; user: string; reason?: string },
): Observable<void> {
  return this.http
    .post(`/api/v1/projects/${projectId}/code-queries/feedback`, { ...params, reason: params.reason || undefined })
    .pipe(map(() => undefined));
}
```

No response DTO/model is needed — the `201` body isn't used by the UI (nothing to store; there's
no way to read it back later anyway).

### 4.4 `CodeSearchPage` — state and actions

`QueryHistoryEntry` gains two fields:

```ts
interface QueryHistoryEntry {
  id: number;
  projectId: number;        // NEW — missing today; needed to POST feedback
  projectName: string;
  projectGitUrl: string | null;
  question: string;
  filters: CodeQueryFilters;
  results: CodeQueryResult[];
  feedback: FeedbackState;  // NEW
}

type FeedbackState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'submitted'; useful: boolean };
```

`submit()` includes `projectId` and `feedback: { status: 'idle' }` when building a new entry.

New methods:

```ts
protected markUseful(entry: QueryHistoryEntry): void {
  this.submitFeedback(entry, true, undefined);
}

protected openNotUsefulDialog(entry: QueryHistoryEntry): void {
  const reason = signal('');
  const ref = this.popupService.open<boolean, NotUsefulReasonDialogData>(NotUsefulReasonDialog, {
    data: { reason },
    isDirty: () => reason().trim().length > 0,
  });
  ref.closed.subscribe((confirmed) => {
    if (confirmed) {
      this.submitFeedback(entry, false, reason().trim() || undefined);
    }
  });
}

private submitFeedback(entry: QueryHistoryEntry, useful: boolean, reason: string | undefined): void {
  const existingUser = this.configService.userName().trim();
  if (existingUser.length === 0) {
    this.askForUserName((user) => this.postFeedback(entry, useful, reason, user));
    return;
  }
  this.postFeedback(entry, useful, reason, existingUser);
}

/** Prompts for a name when none is configured yet. Cancelling aborts the whole feedback action
 *  that triggered the prompt — the caller's `onConfirmed` never runs. */
private askForUserName(onConfirmed: (user: string) => void): void {
  const name = signal('');
  const ref = this.popupService.open<boolean, UserNameDialogData>(UserNameDialog, {
    data: { name },
    isDirty: () => name().trim().length > 0,
  });
  ref.closed.subscribe((confirmed) => {
    if (!confirmed) {
      return;
    }
    const user = name().trim();
    this.configService.setUserName(user);
    onConfirmed(user);
  });
}

private postFeedback(entry: QueryHistoryEntry, useful: boolean, reason: string | undefined, user: string): void {
  this.setFeedback(entry.id, { status: 'submitting' });
  this.codeQueriesService
    .submitFeedback(entry.projectId, {
      question: entry.question,
      useful,
      similarities: entry.results.map((r) => r.similarity),
      user,
      reason,
    })
    .subscribe({
      next: () => this.setFeedback(entry.id, { status: 'submitted', useful }),
      error: () => this.setFeedback(entry.id, { status: 'idle' }),
    });
}

private setFeedback(entryId: number, feedback: FeedbackState): void {
  this.history.update((entries) => entries.map((e) => (e.id === entryId ? { ...e, feedback } : e)));
}
```

`entry.feedback` stays `'idle'` throughout the whole "ask for a name" detour — it only flips to
`'submitting'` once `postFeedback()` actually fires the HTTP call — so the Useful/Not-useful
buttons stay in their normal (non-disabled) state while the name popup is open, correctly
reflecting that nothing has been sent yet.

This follows the same immutable-array-update pattern `removeHistoryEntry()` already uses. Passing
`data: { reason }` / `data: { name }` — a `WritableSignal` **owned by the caller**, handed to the
dialog via `DIALOG_DATA` — mirrors exactly how `QueryFiltersDrawer` already receives its filter
signals. It avoids needing the dialogs' internal state to be `public` (rather than `protected`)
just so the caller could read it back after close.

`ConfigService` and `ToastService` need to be injected into `CodeSearchPage` (check whether
`ToastService` is already injected there; add it if not — it may end up unused by this feature if
every error path is covered by the generic interceptor and the new name popup, in which case skip
importing it rather than leaving a dead injection).

### 4.5 New popup — `NotUsefulReasonDialog` (`src/app/features/code-search/`)

Lives alongside `query-filters-drawer.ts`/`result-detail-dialog.ts` — specific to the Rag page,
not generic enough for `shared/components/` the way `ConfirmDialog` is.

```ts
export interface NotUsefulReasonDialogData {
  reason: WritableSignal<string>;
}

@Component({
  selector: 'app-not-useful-reason-dialog',
  imports: [EscClearableDirective],
  templateUrl: './not-useful-reason-dialog.html',
})
export class NotUsefulReasonDialog {
  protected readonly data = inject<NotUsefulReasonDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<boolean>());

  protected onReasonInput(value: string): void { this.data.reason.set(value); }
  protected clearReason(): void { this.data.reason.set(''); }
  protected confirm(): void { this.dialogRef.close(true); }
  protected cancel(): void { this.dialogRef.close(false); }
}
```

Template: title **"Why weren't these results helpful?"**, a `<textarea>` (using
`[appEscClearable]` the same way every text `<input>` in this app does — the directive doesn't
care about tag type, just reads/writes a value), Cancel (plain neutral-text button) / Confirm
(`bg-sky-600`, the same color used for other non-destructive primary actions like "OK"/"Filter")
buttons.

Auto-focus on the textarea relies on CDK `Dialog`'s default `autoFocus: 'first-tabbable'` behavior
— the textarea is the first focusable element in the popup, so no custom focus code is planned
initially. **Verify manually during implementation**; add an `ElementRef` + `ngAfterViewInit()`
focus call as a fallback if it doesn't focus on its own.

`isDirty` (supplied by the caller, §4.4) makes this **the first popup in the app to actually
exercise the confirm-discard-on-Escape flow** — today it's implemented generically but never
exercised end-to-end (`ResultDetailDialog` is read-only, per `CLAUDE.md`).

Clicking Cancel and closing via Escape-with-confirmed-discard produce the same outcome: a bare
`dialogRef.close()` (no argument) and an explicit `dialogRef.close(false)` both resolve to
"not confirmed" — the caller handles both with a plain `if (confirmed)`.

### 4.6 New popup — `UserNameDialog` (`src/app/features/code-search/`)

Also lives alongside `not-useful-reason-dialog.ts` — triggered only from the feedback flow today.

```ts
export interface UserNameDialogData {
  name: WritableSignal<string>;
}

@Component({
  selector: 'app-user-name-dialog',
  imports: [EscClearableDirective],
  templateUrl: './user-name-dialog.html',
})
export class UserNameDialog {
  protected readonly data = inject<UserNameDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<boolean>());

  protected get canConfirm(): boolean {
    return this.data.name().trim().length > 0;
  }

  protected onNameInput(value: string): void { this.data.name.set(value); }
  protected clearName(): void { this.data.name.set(''); }
  protected confirm(): void { this.dialogRef.close(true); }
  protected cancel(): void { this.dialogRef.close(false); }
}
```

Template: title **"What's your name?"**, a single-line `<input type="text">` (same
`appEscClearable` pattern, focused via CDK's default `autoFocus: 'first-tabbable'` like
`NotUsefulReasonDialog`), Cancel / Confirm buttons in the same style as the other new dialog.
Confirm is disabled while the trimmed name is empty (`[disabled]="!canConfirm"`), since the whole
point of this popup is to collect a non-blank value the API will accept.

Same `DialogRef<boolean>` / shared-signal-via-`DIALOG_DATA` shape as `NotUsefulReasonDialog`, and
the same Cancel-vs-Escape-discard equivalence (§4.5) applies here too. `isDirty: () =>
name().trim().length > 0` is passed by the caller so Escape with a partially-typed name also asks
to confirm discarding it first, rather than silently dropping it.

**Sequencing, not merging**: when "Not useful" needs both a reason *and* a name, the two popups
open one after another (reason first, then name) rather than being combined into one bigger
dialog. This keeps `NotUsefulReasonDialog` and `UserNameDialog` independent and each reusable on
its own — `UserNameDialog` alone is what "Useful" triggers when no name is set, with no reason
step involved at all.

### 4.7 Template — feedback controls on the card (`code-search-page.html`)

A new row inside each `<article>`, after the results table (or the "No results." message) — shown
even when there are no results, since the API accepts `similarities: []`:

```html
<div class="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
  <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Was this helpful?</span>
  @switch (entry.feedback.status) {
    @case ('submitted') {
      @if (entry.feedback.useful) {
        <span class="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">Useful</span>
      } @else {
        <span class="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">Not useful</span>
      }
    }
    @default {
      <button type="button" [disabled]="entry.feedback.status === 'submitting'" (click)="markUseful(entry)"
        class="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/30">
        Useful
      </button>
      <button type="button" [disabled]="entry.feedback.status === 'submitting'" (click)="openNotUsefulDialog(entry)"
        class="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/30">
        Not useful
      </button>
    }
  }
</div>
```

Palette: `emerald` for "Useful" (used today only in success toasts — this is the first use as
text/border outside a toast) and `rose` for "Not useful" (already used for destructive actions
like "Delete" in `projects-page.html`), mirroring the exact `text-{color}-700 hover:bg-{color}-50
dark:text-{color}-400 dark:hover:bg-{color}-900/30` pairing already used for Edit/Delete. The
final static pill mirrors the shape of the existing similarity badge in the table, swapping `sky`
for `emerald`/`rose`.

Failed submission: the generic `errorToastInterceptor` already surfaces a toast — the `error:`
callback just needs to reset the status back to `'idle'` so the buttons reappear for a retry.

## 5. Implementation order

1. `ConfigService` (`userName`/`setUserName`) — isolated.
2. `settings-page.ts`/`.html` — new field, isolated.
3. `CodeQueriesService.submitFeedback()` — isolated.
4. `NotUsefulReasonDialog` (`.ts`/`.html`/`.spec.ts`) — isolated.
5. `UserNameDialog` (`.ts`/`.html`/`.spec.ts`) — isolated.
6. `CodeSearchPage` (`.ts`/`.html`) — wires everything together: `QueryHistoryEntry.projectId`/
   `.feedback`, `markUseful`/`openNotUsefulDialog`/`submitFeedback`/`askForUserName`/
   `postFeedback`/`setFeedback`, template.
7. Update `CLAUDE.md`'s "API contract" section with the new endpoint, following its existing
   documentation convention for the other endpoints.
8. Tests (§6) and manual verification (dev server + Playwright).

## 6. Testing

- `config.service.spec.ts`: `userName`/`setUserName` (mirrors the existing `apiBaseUrl` tests).
- `settings-page.spec.ts`: the new "Your name" field renders; Save persists it via `ConfigService`.
- `code-queries.service.spec.ts`: `submitFeedback()` builds the right URL and body; omits `reason`
  when not provided.
- `not-useful-reason-dialog.spec.ts`: correct title; typing updates the `WritableSignal` received
  via `DIALOG_DATA`; Confirm closes with `true`; Cancel closes with `false`.
- `user-name-dialog.spec.ts`: correct title; Confirm is disabled while the name is blank/whitespace;
  typing updates the `WritableSignal` received via `DIALOG_DATA`; Confirm closes with `true`;
  Cancel closes with `false`.
- `code-search-page.spec.ts`, with "Your name" already configured (`ConfigService` mocked/seeded):
  clicking "Useful" calls the service directly with `useful: true`, no popup opens; clicking "Not
  useful" opens `NotUsefulReasonDialog` (mock `PopupService`); confirming it with a reason submits
  `useful: false` + that `reason`; on success, the buttons disappear and the correct static label
  (green/red) appears; on failure, the buttons reappear (status back to `'idle'`).
  With "Your name" **empty**: clicking "Useful" opens `UserNameDialog` instead of calling the
  service; confirming the name dialog saves it via `ConfigService.setUserName` and *then* submits
  the original `useful: true` feedback; cancelling the name dialog calls the service **zero
  times** and leaves `ConfigService`'s name untouched. Same two assertions (name-then-submit on
  confirm, nothing on cancel) for the "Not useful" path, chained after its own reason dialog
  resolves — i.e. cancelling the name prompt after already typing a reason still results in zero
  calls to `CodeQueriesService.submitFeedback`.

## 7. Risks / open questions

- **The `similarities` order sent is the already-sorted (descending) order the app displays**, not
  necessarily "the order received from the API" (the MCP tool description explicitly asks for
  received order). Since the API documents no correlation/validation against a previously stored
  copy of the query (there's no read endpoint), this shouldn't break submission — but it's the
  only order the UI actually has, so it's what will be sent.
- **Auto-focus on the popup's textarea depends on CDK Dialog's default behavior** — no custom
  focus code planned up front; verify manually and add a fallback if needed.
- **Request body casing not verified live** (only the stats endpoint was probed) — low risk since
  every field is already a single word with no casing ambiguity.
- **Popup title adjusted from singular to plural** ("this result" → "these results") to match the
  per-question scope — flagged here for explicit approval since it diverges from an earlier
  literal approval.
- No persistence of "already voted" state across reloads — reloading the page clears the question
  history (already true today, unrelated to this feature), and re-asking the same question could
  submit feedback again. The API accepts repeat submissions without erroring (no `409`), so this
  doesn't break anything — it could just produce duplicate rows in the aggregate stats.
- **Two sequential popups for "Not useful" without a configured name** (reason, then name) is a
  deliberate choice (§4.6) over combining both fields into one dialog — simpler, reusable
  components, at the cost of an extra click the very first time someone gives "not useful"
  feedback before ever visiting Settings. Worth revisiting if that friction turns out to bother
  users in practice.

## 8. Out of scope

- No changes to `/reports` (`feedback-stats-page`) — it already reads the existing aggregate
  endpoint, which is unchanged.
- No attempt to read back feedback already submitted (the API doesn't support it).
- No UI to edit/correct feedback after submission.
- No real authentication — "Your name" is a free-text value saved locally, not a login system.
