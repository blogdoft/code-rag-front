# Spec: Front + API Version Display in the Nav Sidebar

Status: Implemented

## 1. Overview

The app already shows its own front-end build version as a small badge, fixed to the top-right
corner of the viewport (`app.html`, the `@if (version()) { ... }` block; sourced from
`VersionService` → `/version.json`, a static asset baked in at Docker container start — see
`core/services/version.service.ts`'s doc comment). The backend has now added `GET /version`,
returning the running API's own build version.

This spec covers showing **both** versions together, repositioned into the footer of the nav
sidebar drawer (`NavSidebar`, `shared/components/nav-sidebar/`) — the app's only
collapsible/expandable drawer:

- **Collapsed** (desktop icon rail, `md:w-16`): the two versions stacked vertically.
- **Expanded** (`md:w-56` desktop / full-width mobile overlay): the two versions side by side,
  right-aligned.

This amends `.specs/2026-09-03-app-shell-redesign.md`, whose §"Version badge" explicitly decided
the badge "stays exactly as it was — fixed, top-right corner, unchanged markup/classes" when the
sidebar was introduced. That decision is superseded here: the badge is removed and its content
relocated into the sidebar footer, now showing two versions instead of one.

## 2. New backend contract — `GET /version`

Confirmed against the live API (not just the OpenAPI docs, per `CLAUDE.md`'s casing-trust
convention — though this endpoint has no camelCase/snake_case ambiguity, since its one field is
already a single lowercase word):

```
$ curl https://code-rag-api.home.arpa/version
{"version":"0.1.3-1"}
```

Live swagger schema (`VersionResponse`):

```json
{
  "type": "object",
  "properties": {
    "version": {
      "type": "string",
      "nullable": true,
      "description": "Semantic version computed by GitVersion from the nearest git tag at publish time (e.g. \"1.4.2\" on a tagged release, \"1.4.3-5\" five commits past the last tag on main, or \"0.0.0-dev\" for a local build that wasn't given an explicit version)."
    }
  },
  "additionalProperties": false
}
```

No path/query parameters, no auth. Per the live swagger doc's own `description`, this endpoint is
**deliberately unversioned — no `/api/v1` prefix** ("health-check-style, for use by deploy tooling
and diagnostics rather than API consumers"). §3 covers why that matters for this app specifically.

Not yet reflected in `openapi.generated.json` (that file has no `version` path at all — confirmed
by reading it) or in `CLAUDE.md`'s endpoint list; updating either is out of scope here (§8).

## 3. Routing fix (prerequisite) — `/version` isn't `/api`-prefixed

Because the endpoint intentionally omits the `/api` prefix, none of the app's three existing
request-routing layers handle it as-is — each only recognizes `/api`:

- **`core/interceptors/base-url.interceptor.ts`** only prefixes the configured API base URL onto
  requests whose URL `startsWith('/api')`. A raw `this.http.get('/version')` today would be sent
  to the *front-end's own* origin, not the configured API.
- **Dev proxy** `proxy.conf.json` (`{ "/api": { "target": "https://code-rag-api.home.arpa", ... } }`)
  and `proxy.conf.local.example.json` (same shape, `http://localhost:5002`) only proxy `/api`. A
  request to `/version` would be served — or 404'd — by the Angular CLI dev server itself.
- **Production** `.eng/docker/nginx.conf.template` only reverse-proxies `location /api/`; every
  other path, `/version` included, falls through to `location / { try_files $uri $uri/ /index.html; }`
  — i.e. a raw `/version` fetch in production today would silently receive the Angular app's own
  `index.html` (not JSON), which `ApiVersionService` (§4) would fail to parse as `{version: ...}`
  and treat as a fetch error.

All three need a `/version` counterpart alongside the existing `/api` one:

```diff
--- base-url.interceptor.ts ---
 export const baseUrlInterceptor: HttpInterceptorFn = (req, next) => {
-  if (!req.url.startsWith('/api')) {
+  if (!req.url.startsWith('/api') && req.url !== '/version') {
     return next(req);
   }
```

```diff
--- proxy.conf.json (and proxy.conf.local.example.json, same shape) ---
 {
   "/api": { "target": "https://code-rag-api.home.arpa", "secure": false, "changeOrigin": true },
+  "/version": { "target": "https://code-rag-api.home.arpa", "secure": false, "changeOrigin": true }
 }
```

```diff
--- .eng/docker/nginx.conf.template ---
     location /api/ {
         proxy_pass ${API_UPSTREAM};
         proxy_ssl_verify off;
         proxy_set_header Host $proxy_host;
         proxy_set_header X-Real-IP $remote_addr;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
         proxy_set_header X-Forwarded-Proto $scheme;
     }
+
+    location = /version {
+        proxy_pass ${API_UPSTREAM};
+        proxy_ssl_verify off;
+        proxy_set_header Host $proxy_host;
+        proxy_set_header X-Real-IP $remote_addr;
+        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
+        proxy_set_header X-Forwarded-Proto $scheme;
+    }
```

(`location = /version` — exact match, not a prefix — since the backend only exposes this one
literal path, unlike `/api/` which fans out to many sub-routes.)

## 4. New service — `core/services/api-version.service.ts`

Named `ApiVersionService` (not `VersionService` — that name is already taken by the front-end's
own version fetch, `core/services/version.service.ts`). Mirrors that sibling service's shape,
including suppressing the global error toast on failure: a version display is decorative, and a
transient/misconfigured API version fetch shouldn't interrupt the user with a toast on every page
load — same reasoning already applied to the front-version fetch.

```ts
import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, type Observable } from 'rxjs';
import { SUPPRESS_ERROR_TOAST } from '../interceptors/error-toast.interceptor';

interface ApiVersionDto {
  version: string | null;
}

/** Fetches the running CodeRAG API's own build version from GET /version (see CLAUDE.md / §2-3 of this spec for why that path has no /api prefix). */
@Injectable({ providedIn: 'root' })
export class ApiVersionService {
  private readonly http = inject(HttpClient);

  get(): Observable<string> {
    return this.http
      .get<ApiVersionDto>('/version', { context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true) })
      .pipe(
        map((dto) => dto.version ?? ''),
        catchError(() => of('')),
      );
  }
}
```

## 5. `App` (`app.ts` / `app.html`) changes

- Inject `ApiVersionService`; add `protected readonly apiVersion = signal('')`, populated in
  `ngOnInit()` alongside the existing front-version fetch:
  ```ts
  this.versionService.get().subscribe((version) => this.version.set(version));
  this.apiVersionService.get().subscribe((version) => this.apiVersion.set(version));
  ```
- Remove the floating badge block from `app.html` (the `@if (version()) { <span class="pointer-events-none fixed right-0 top-0 ...">Versão: {{ version() }}</span> }` lines) — its content moves into `NavSidebar`'s footer (§6).
- Remove the now-unneeded `[class.max-lg:pr-20]="version()"` on the header's inner `<div>`
  (`app.html` line 3) — that padding existed solely to keep the header's hamburger/logo from being
  covered by the top-right badge on narrow viewports; with the badge gone, it has nothing left to
  guard against.
- Pass both signals into `<app-nav-sidebar>` as new inputs:
  ```html
  <app-nav-sidebar
    #sidebarContainer
    [expanded]="sidebarExpanded()"
    [frontVersion]="version()"
    [apiVersion]="apiVersion()"
    (linkClicked)="onSidebarLinkClicked()"
  />
  ```

## 6. `NavSidebar` changes

New inputs, alongside the existing `expanded`:

```ts
readonly frontVersion = input<string>('');
readonly apiVersion = input<string>('');
```

New footer block inside `<aside>`, after the existing `<nav>`. Pinned to the bottom via `mt-auto`
on a flex child — the `<aside>` is already `flex flex-col` and full-height in every state (desktop
sticky panel: `md:h-[calc(100vh-3.5rem)]`; mobile expanded overlay: `fixed inset-x-0 top-14
bottom-0`), so `mt-auto` alone anchors the footer to the bottom without new positioning rules.
Rendered only when at least one version string is non-empty (mirrors the old badge's
`@if (version())` guard, extended to either version):

```html
@if (frontVersion() || apiVersion()) {
  <div [class]="versionFooterClasses()">
    @if (frontVersion()) {
      <span title="Front-end version">{{ frontVersion() }}</span>
    }
    @if (showVersionSeparator()) {
      <span aria-hidden="true" class="text-slate-300 dark:text-slate-600">|</span>
    }
    @if (apiVersion()) {
      <span title="API version">{{ apiVersion() }}</span>
    }
  </div>
}
```

`showVersionSeparator` is `expanded() && !!frontVersion() && !!apiVersion()` — a `|` divider only
appears when expanded (side by side, the two numbers otherwise run together with no visual break)
and only when both versions are actually present (no dangling separator next to a single value).
Collapsed (stacked, one per line) never shows it — the line break already separates them.
`aria-hidden="true"` keeps it out of the accessibility tree, since the two `title`-bearing spans
already carry the meaningful distinction for assistive tech.

`versionFooterClasses` is a `computed()` on the component, mirroring the existing `asideClasses`
pattern, rather than an inline template ternary:

```ts
protected readonly versionFooterClasses = computed(() =>
  this.expanded()
    ? 'mt-auto flex flex-row justify-end gap-2 border-t border-slate-200 px-3 py-3 font-mono text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500'
    : 'mt-auto flex flex-col items-center gap-0.5 border-t border-slate-200 px-2 py-3 font-mono text-[10px] text-slate-400 dark:border-slate-700 dark:text-slate-500',
);
```

- **Collapsed** (`expanded() === false`, `md:w-16` rail): `flex-col items-center`, `text-[10px]` —
  the two versions stacked vertically, centered in the narrow rail.
- **Expanded** (`md:w-56` / mobile full-width overlay): `flex-row justify-end`, `text-xs` — side by
  side, right-aligned against the drawer's own right edge.
- Both layouts keep the `title` tooltip ("Front-end version" / "API version", in English — this
  app's UI strings are English throughout, e.g. the nav link labels "Rag"/"Projects"/"Settings")
  on each `<span>` for differentiation — no visible text label in either state, per product
  decision; matches the existing precedent of `[attr.title]` tooltips on collapsed nav links
  (`nav-sidebar.html` line 9: `[attr.title]="expanded() ? null : link.label"`).
- **Fix applied during implementation**: `NavSidebar`'s shared `BASE_CLASSES` originally included
  `md:block`, which overrode the `<aside>`'s own `flex flex-col` display at the desktop breakpoint
  (its only purpose was to un-hide the collapsed rail, which starts `hidden` on mobile). That
  override was invisible before this feature (the `<aside>` had only one child), but it silently
  broke `mt-auto`'s bottom-anchoring once the footer was added, since auto margins only push
  within a flex/grid container. Fixed by changing both `md:block` occurrences (in `BASE_CLASSES`
  and in the collapsed variant's own explicit override) to `md:flex`, keeping the `<aside>` a flex
  container at every breakpoint.
- Order is the same in both layouts: front-end version first, API version second — matches the
  front version being the pre-existing, "primary" one before this change.
- Each `<span>` is independently guarded (`@if (frontVersion())` / `@if (apiVersion())`) so a
  failed fetch for just one of the two (§4's silent-failure behavior) still shows the other alone,
  rather than hiding the whole footer.

## 7. Testing

- **`core/services/api-version.service.spec.ts`** (new) — mirrors
  `core/services/version.service.spec.ts`'s cases: successful fetch maps `{version: "1.2.3"}` →
  `'1.2.3'`; `{version: null}` → `''`; an HTTP error → `''` (via `catchError`); asserts the request
  carries `SUPPRESS_ERROR_TOAST` in its context.
- **`core/interceptors/base-url.interceptor.spec.ts`** — new case asserting a request to
  `/version` also gets the configured API base URL prefixed, alongside the existing `/api`-prefix
  cases.
- **`app.spec.ts`** — `apiVersion` signal is populated from the (mocked) `ApiVersionService` in
  `ngOnInit`, same as the existing `version` assertion; the old top-right badge markup is no
  longer present; `NavSidebar` receives both `frontVersion`/`apiVersion` as inputs with the
  signals' current values.
- **`nav-sidebar.spec.ts`** — footer renders with stacked classes when `expanded` is `false` and
  side-by-side/right-aligned classes when `true`, given non-empty `frontVersion`/`apiVersion`
  inputs; renders nothing when both inputs are empty; renders only the one `<span>` present when
  only one of the two inputs is non-empty; a `|` separator appears between the two values when
  expanded with both set, and is absent both when collapsed (even with both set) and when expanded
  with only one set.

## 8. Out of scope

- No visible text labels next to either version (e.g. "UI: " / "API: ") — tooltip-only
  differentiation, per product decision.
- No retry/polling if the API version fetch fails — one attempt on `ngOnInit`, same as the
  existing front-version fetch.
- No change to how the front-end's own version is sourced or built (`/version.json` generation via
  `.eng/docker/40-generate-version.sh` / `APP_VERSION` Docker build-arg pipeline stays exactly as
  it is).
- No update to `CLAUDE.md`'s documented endpoint list or to `openapi.generated.json` for the new
  `/version` endpoint in this pass — both are already known-stale relative to the live API per
  `CLAUDE.md`'s own disclaimer; folding this one endpoint in could be a fast-follow but wasn't
  asked for here.
- No caching/sharing of the fetched versions beyond the `App`-level signals already in place (e.g.
  no re-fetch on demand, no display elsewhere in the app like the Settings page).
