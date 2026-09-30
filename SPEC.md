# CODE-RAG-FRONT

A web UI/UX for Code CIIR: the user picks a project, asks natural-language questions about its code
and gets candidate code snippets back, each with its direct code relationships. The app also manages
projects, uploads CIIR files for indexing, and reports on the feedback given to the answers.

This document describes the **product as it stands today**. Implementation details, decisions and the
history of each feature live in `.specs/`; coding conventions and the API contract live in
`CLAUDE.md`.

## 1. Backend

Two services behind one shared gateway, `https://blogdoft.home.arpa/code-brain`:

- **code-ciir-api** — code queries, feedback, feedback stats/export and `/version`. Contract in
  `openapi.generated.json`.
- **CIIR Indexer API** — project CRUD, CIIR file upload and indexation status. Contract in
  `openapi.indexer.generated.json`.

The live contract wins over the OpenAPI files (the backend is under active development). This
front-end is served from the same gateway, at `https://blogdoft.home.arpa/code-brain/`.

## 2. Non-functional requirements

- Angular, using the latest version of every library; standalone components, lazy-loaded routes,
  local state with signals.
- Good practices: SOLID, Clean Code, DRY, YAGNI. Code must be objective, clear, easy for humans to
  read, with an obvious execution flow.
- Responsibilities separated into one module per feature (`features/`), with reusable components in
  `shared/` (combobox, confirm dialog, toasts, nav sidebar).
- Tailwind for styling. **Light** and **dark** themes; the default follows the browser setting and the
  user can pin either one in Settings.
- Notifications in general — success or failure — use **toasts**. API errors (`ProblemDetails`) become
  a toast automatically.
- Responsive: the nav sidebar is an expandable icon rail on desktop and an overlay on small screens.
- Tests: unit (Vitest) and end-to-end (Cypress, with the backend stubbed).
- Validation messages name fields by their visible on-screen label, never by the JSON field name.

## 3. Security

- **XSS:** every API-sourced string (`embeddingText`, `sourceFile`, `symbolContainer`, `symbolName`,
  `symbolQualifiedName`, `symbolCanonicalName`, etc.) is rendered only through Angular interpolation.
  Never `[innerHTML]` or `bypassSecurityTrustHtml`. The newlines embedded in `embeddingText` are
  preserved with a `<pre>` (`whitespace-pre-wrap`), not by converting `\n` to `<br>`.
- **Login:** conditional and decided at deploy time, not by the user. When Keycloak is enabled
  (`auth-config.json`, generated from environment variables), the whole app redirects to the login and
  API calls carry the token; otherwise no login is required.
- **Certificates:** browsers don't allow skipping certificate validation. Only the development proxy
  (`proxy.conf.json`, `secure: false`) skips it. That's why the API base URL defaults to the app's own
  origin.

## 4. The Escape key

Implemented in one place (not per field/popup):

1. With focus on a field that has a value, Escape **clears the field** and the event stops there. (On
   the Lookup ComboBox, section 7.1, this same press also closes the options list if it's open.)
2. If the field is already empty (or not editable), Escape is redirected to the window/popup the
   component lives in.
3. If there are changes in progress, the app asks whether the user wants to discard them.
4. If there are no changes and we're in a popup, the popup is closed. With stacked popups, the topmost
   one closes.
5. In the main window, nothing happens.

## 5. Navigation

Nav sidebar with: **Rag** (`/rag`), **Projects** (`/projects`), **Upload** (`/uploads`), **Reports**
(`/reports`) and **Settings** (`/settings`). The root (`/`) is a landing page. The sidebar footer shows
the front-end and API versions (the API version silently disappears if the call fails).

## 6. Features

### 6.1 Code search — `/rag`

- The user picks a **project** in a combobox and types a **question**. Both are required to ask; the
  question stays in place after each search.
- **Filters** (a button that opens a side drawer, with _Filter_ and _Clear_): _Kind_ (exact text),
  _Qualified name_ (with an operator: equals, contains, not contains), _Min similarity_ (0–1) and
  _Limit_. Values persist across searches.
- Each search becomes an entry in the page's question-and-answer **history**, along with the filters
  used. Results appear in **the order the API returned them** (already sorted by reranking or
  similarity) — the front-end never re-sorts.
- Each result shows file, kind, container/symbol and similarity (and rerank score, when present); if
  the project has a git URL, there's a link to open the repository in a new tab.
- **Clicking a result opens a popup** with the full content (`embeddingText`, multi-line, newlines
  preserved) and the snippet's **direct relations** (incoming/outgoing).
- **Feedback:** each search has _Useful_ / _Not useful_ buttons. _Not useful_ opens a popup for an
  **optional** reason. After voting, the buttons are replaced by a static label. The user's name is
  asked for once (popup) and remembered; it is never guessed.

### 6.2 Projects — `/projects`

- Lists projects (name, creation date) with client-side **search by name**. Each row in the grid also
  has a button to **copy the project's id** to the clipboard.
- **Add**, **edit** and **delete** (with confirmation). Fields: id (Guid), name (required), git URL and
  git raw URL (optional — blank values are sent as `null`, never `""`). The id field is **not shown**
  when creating a new project (the backend assigns it); it **is shown**, read-only, when editing an
  existing project, and it **never receives focus**.
- Pressing Escape while editing with pending changes asks for confirmation before discarding.
- The same screen can be opened **in a popup** by other screens (see 6.3), without duplicating the
  implementation.

### 6.3 CIIR file upload — `/uploads`

- The user picks the project (combobox) and a `.jsonl` file (by clicking or dragging). Files that
  aren't `.jsonl`, or are empty, are rejected.
- Next to the combobox there's a **Manage projects** button that opens the projects screen (6.2) in a
  popup. **When the popup closes, the combobox is reloaded** with the current projects. If the selected
  project was deleted in the meantime, the selection is cleared; the chosen file is never affected.
- While sending there's a **progress bar** (bytes sent) and a **Cancel** button. At 100% the server is
  still storing the file, and the screen explains that wait.
- Once accepted (`202`), the screen tracks indexing by polling (every 2 s), showing the upload and
  indexation status and the document and relation counters, until a final state (completed or failed).
  Leaving the page mid-upload asks for confirmation; once the server has accepted the file, leaving is
  safe — indexing continues in the background.
- Upload errors (unknown project, file too large, server busy, lost connection) show clear messages,
  including when the API returns no body.

### 6.4 Reports — `/reports`

- Feedback dashboard by **week × project**: total, useful, not useful and percentages, as a chart.
- Filters: project (or all), start date and end date (default: the last 4 weeks; 366-day maximum
  window, with validation and a toast). Dates are interpreted in the configured timezone.
- **Export CSV** of the raw rows, honoring the same filters and the configured timezone.

### 6.5 Settings — `/settings`

Everything is stored in `localStorage`:

- **API base URL** — defaults to the same origin (derived from `<base href>`); accepts an absolute URL
  when the API lives on a different, browser-trusted origin.
- **Your name** — used as the author of feedback.
- **Export timezone** (default `America/Sao_Paulo`) — also used for the Reports date filters.
- **Appearance** — follow the system, light or dark; applies immediately, no save button.

The other fields have validation and a _Save_ button.

### 6.6 Combos and fields

- Every lookup combo is a **Lookup ComboBox** (section 7.1): autocomplete, debounced server-side search
  and its own Escape behavior (close the open options list and clear the value in the same keypress).
- Text fields follow the Escape rule (section 4).

## 7. Visual components module

Reusable UI components live in their own module (`shared/components/`) rather than being
reimplemented per feature: **Lookup ComboBox**, confirm dialog, toasts, nav sidebar, popup coordinator.

### 7.1 Lookup ComboBox

- **Autocomplete**: the user types part of the name; only a value that exists in the list can be
  committed. Leaving the field with a value that doesn't match an existing option reverts it.
- **Debounced search**: typing doesn't filter an already-loaded list — it's **debounced**, and once the
  user pauses, an HTTP request is made with the filter typed so far, so the options are fetched
  gradually as the user narrows the search.
- **Escape**: with focus on the combobox, a single Escape press **closes the options list** (if it's
  open) **and clears the field's value** — both happen together as one action, not across two separate
  presses. This is the combobox's own refinement of the general Escape rule (section 4).

Used by the project combobox in Code search (6.1) and CIIR upload (6.3).
