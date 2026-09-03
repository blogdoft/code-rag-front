# Spec: App Shell Redesign — Responsive Nav Sidebar + Home Page

Status: Implemented

## Revision history

This spec was written before implementation started and described a CDK-`Dialog`-based sliding
drawer opened on demand (§2.3 in the original draft: `NavDrawer`, `PopupService.open(...)`,
`.nav-drawer-panel` CSS). During implementation and follow-up review the design changed twice
more, in response to direct feedback:

1. **v1 (as originally planned)**: hamburger opens a left-docked `NavDrawer` popup (CDK `Dialog`,
   closes on Escape/link-click, `.nav-drawer-panel` CSS positioning, a CSS `@keyframes` slide-in).
2. **v2**: replaced the popup entirely with `NavSidebar`, a **persistent, always-rendered**
   sidebar that toggles between expanded (icons + labels) and collapsed (icons-only) — no more
   `Dialog`/`PopupService` involvement, no "Menu" header title, closes-to-collapsed on
   outside-click via a `document:click` listener in `App`.
3. **v3 (current)**: made the sidebar responsive — hidden entirely on mobile viewports by
   default, appearing as a full-screen overlay (below the header) when opened, while desktop
   keeps v2's always-visible expand/collapse behavior unchanged.

This document now describes **v3, the implemented state**, not the original plan. Section 1
(Background) is kept close to the original for context on *why* this started; everything from
§2 onward describes what actually shipped.

## 1. Background

The header (`src/app/app.html`) used to be a fixed bar with three inline links (Projects,
Settings, Reports) plus a "CodeRAG" brand link to `/`, which was the code-search (Rag) page
itself — there was no landing/welcome page. The goal was a proper "main module": a home page
greets the visitor, the brand (name + favicon) is grouped in the header, and navigation moves out
of the inline link row into a hamburger-triggered menu.

Decisions made with the user before/during implementation:

1. **Version badge** stays exactly as it was — fixed, top-right corner, unchanged markup/classes
   (the `@if (version()) { <span class="pointer-events-none fixed right-0 top-0 z-40 ...">
   Versão: {{ version() }}</span> }` block in `app.html`). The brand was placed elsewhere instead
   of moving this.
2. **Brand (CodeRAG name + favicon)** sits on the **left** of the header, next to the hamburger
   button — and both are flush against the actual left edge of the viewport (the header's inner
   container has no `mx-auto max-w-3xl` centering; that was tried first and corrected after
   review — a centered container puts the brand/hamburger in the middle of the screen on wide
   viewports, not at the edge).
3. **"Projects" page** (`/projects`, pre-existing, not mentioned in the original request) is a
   menu item alongside Rag/Reports/Settings, not dropped from the nav.
4. **Home page took over the root route `/`.** The code-search (Rag) page, which lived at `/`,
   moved to `/rag`.
5. **The nav is a persistent sidebar, not a modal drawer** (v2 above) — it never fully disappears
   on desktop, just narrows to icons-only. Clicking anywhere outside it (or its toggle button)
   collapses it to icons-only; clicking a link inside it does *not* auto-collapse on desktop.
6. **Responsive** (v3): on narrow viewports the desktop assumption ("always occupies space")
   stops making sense, so below the `md` breakpoint (767px) the sidebar starts fully hidden and,
   when opened via the hamburger, becomes a full-screen overlay instead of a slim rail — see §3.5.

## 2. Routes — `src/app/app.routes.ts`

```ts
export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage) },
  { path: 'rag', loadComponent: () => import('./features/code-search/code-search-page').then((m) => m.CodeSearchPage) },
  { path: 'projects', loadComponent: () => import('./features/projects/projects-page').then((m) => m.ProjectsPage) },
  { path: 'settings', loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage) },
  { path: 'reports', loadComponent: () => import('./features/reports/feedback-stats-page').then((m) => m.FeedbackStatsPage) },
  { path: '**', redirectTo: '' },
];
```

Unchanged since the original plan. No other file in `src/app` hardcodes `routerLink="/"` or
otherwise assumes `/` is the code-search page.

## 3. Design (as implemented)

### 3.1 Home page — `src/app/features/home/`

`home-page.ts`, `home-page.html`, `home-page.spec.ts`. Standalone component, no service
dependencies. Renders a logo (`public/logo-200.png`, unsized — a later, unrelated tweak replaced
the original `favicon-32x32.png` used at hero size), a welcome heading, a short blurb, and a
4-card grid (`grid-cols-1 sm:grid-cols-2`) linking to Rag/Projects/Reports/Settings via
`quickLinks: readonly QuickLink[]`. Visual conventions: `mx-auto max-w-3xl` container,
`slate`/`sky` Tailwind palette, `dark:` variant on every color utility.

### 3.2 Nav sidebar — `src/app/shared/components/nav-sidebar/`

`nav-sidebar.ts`, `nav-sidebar.html`, `nav-sidebar.spec.ts`. Lives under `shared/components/`
(not `features/`) — it's part of the global app shell, like `ConfirmDialog`/`ToastContainer`.

**Not a popup.** Unlike every other overlay in this app, `NavSidebar` is not opened via
`PopupService`/CDK `Dialog` — it's rendered directly and unconditionally in `App`'s template
(`<app-nav-sidebar [expanded]="sidebarExpanded()" (linkClicked)="onSidebarLinkClicked()" />`),
and its visibility/width is driven entirely by the `expanded` input and CSS. There is therefore
no interaction with `PopupCoordinatorService` or the Escape-key state machine for this component
— Escape continues to close only real popups (`ConfirmDialog`, `ResultDetailDialog`,
`QueryFiltersDrawer`, `ProjectFormDialog`), unaffected by this feature.

```ts
interface NavLink { id: 'rag' | 'projects' | 'reports' | 'settings'; label: string; path: string; }

@Component({ selector: 'app-nav-sidebar', imports: [RouterLink, RouterLinkActive], templateUrl: './nav-sidebar.html' })
export class NavSidebar {
  readonly expanded = input.required<boolean>();
  readonly linkClicked = output<void>();
  protected readonly links: readonly NavLink[] = [ /* Rag, Projects, Reports, Settings, in order */ ];
  protected readonly asideClasses = computed(() => /* see §3.5 */);
}
```

- Exactly 4 links, always in the same order: **Rag** (`/rag`), **Projects** (`/projects`),
  **Reports** (`/reports`), **Settings** (`/settings`).
- Each link is rendered with a small hand-written inline SVG icon (`@switch (link.id)` in the
  template — a chat-bubble for Rag, a folder for Projects, a bar-chart for Reports, a sun/gear
  for Settings) plus, only `@if (expanded())`, a text `<span>`. When collapsed, each `<a>` gets
  `[attr.title]="link.label"` so the icon still has an accessible/hover-visible label.
  `routerLinkActive` highlights the current section (`bg-sky-50 text-sky-700 ...`).
- Clicking any link emits `linkClicked` — `App` decides whether that should also collapse the
  sidebar (see §3.5; on desktop it doesn't, on mobile it does).
- No close button, no "Menu" header title — both were removed in v2 once the sidebar stopped
  being a dismissable popup (the only way to "close" it now is the hamburger, an outside click,
  or — on mobile — navigating).

### 3.3 `app.ts` / `app.html`

`App` owns the `sidebarExpanded` signal (default `true`, i.e. expanded, except see §3.5 for the
mobile-at-load override) and all the interaction logic. No `PopupService` involvement for this
feature.

```ts
export class App implements OnInit {
  @ViewChild('sidebarContainer', { read: ElementRef }) private sidebarContainer?: ElementRef<HTMLElement>;
  @ViewChild('menuToggle', { read: ElementRef }) private menuToggle?: ElementRef<HTMLElement>;
  private static readonly MOBILE_QUERY = '(max-width: 767px)';

  protected readonly sidebarExpanded = signal(true);

  ngOnInit(): void {
    this.theme.init();
    this.versionService.get().subscribe((version) => this.version.set(version));
    if (this.isMobileViewport()) this.sidebarExpanded.set(false);
  }

  protected toggleSidebar(): void {
    this.sidebarExpanded.update((expanded) => !expanded);
  }

  protected onSidebarLinkClicked(): void {
    if (this.isMobileViewport()) this.sidebarExpanded.set(false);
  }

  private isMobileViewport(): boolean {
    // jsdom has no matchMedia by default; treat that as "not mobile" rather than throwing.
    return window.matchMedia?.(App.MOBILE_QUERY)?.matches ?? false;
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.sidebarExpanded()) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (this.sidebarContainer?.nativeElement.contains(target) || this.menuToggle?.nativeElement.contains(target)) return;
    this.sidebarExpanded.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void { this.popupCoordinator.handleEscape(); }
}
```

`app.html`'s header/shell structure:

```html
<div class="flex min-h-full flex-col">
  <nav class="sticky top-0 z-30 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
    <div class="flex h-14 items-center gap-3 px-4" [class.max-lg:pr-20]="version()">
      <button #menuToggle type="button" (click)="toggleSidebar()" aria-label="Toggle navigation menu" class="...">
        <svg ...hamburger icon.../>
      </button>
      <a routerLink="/" class="flex items-center gap-2 text-sm font-semibold ...">
        <img src="favicon-32x32.png" alt="" class="h-5 w-5" /> CodeRAG
      </a>
    </div>
  </nav>

  <div class="flex flex-1">
    <app-nav-sidebar #sidebarContainer [expanded]="sidebarExpanded()" (linkClicked)="onSidebarLinkClicked()" />
    <main class="min-w-0 flex-1"><router-outlet /></main>
  </div>
</div>

@if (version()) { <span class="pointer-events-none fixed right-0 top-0 z-40 ...">Versão: {{ version() }}</span> }
<app-toast-container />
```

Key points vs. the original plan:
- The header's inner `<div>` has **no** `mx-auto max-w-3xl` — it's `flex h-14 items-center gap-3
  px-4` only, so the hamburger/brand sit at the true left edge of the viewport at any width.
- The header is `sticky top-0 z-30` with a fixed `h-14` (3.5rem) height — the sidebar's own
  positioning (both the desktop `md:top-14` sticky offset and the mobile `top-14` full-screen
  overlay offset) is anchored to this exact value, so the sidebar never overlaps the header.
- `aria-label` is `"Toggle navigation menu"` (not `"Open ..."` — it does double duty as
  open/close), matching the app's English-only UI copy (the Portuguese "Versão:" badge is a
  pre-existing, isolated outlier, not a convention to extend).

### 3.4 `src/styles.css`

No nav-related CSS remains here. The `.nav-drawer-panel` rule from the original CDK-dialog-based
plan was added then fully removed once the sidebar stopped being a `Dialog` popup — all of the
sidebar's positioning is done with Tailwind utility classes computed in `nav-sidebar.ts` (see
§3.5), not custom CSS. Only the pre-existing `.filter-drawer-panel` rule (for the unrelated
`QueryFiltersDrawer` on the code-search page) remains.

### 3.5 Responsive behavior

`NavSidebar.asideClasses` (a `computed()`) is the single place that decides the sidebar's
CSS class list, mobile-first:

```ts
const BASE_CLASSES =
  'flex flex-col border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-700 dark:bg-slate-800 ' +
  'md:sticky md:top-14 md:block md:h-[calc(100vh-3.5rem)] md:shrink-0 md:overflow-y-auto';

asideClasses = computed(() =>
  expanded()
    ? `${BASE_CLASSES} fixed inset-x-0 top-14 bottom-0 z-40 w-full md:static md:inset-auto md:top-auto md:w-56`
    : `${BASE_CLASSES} hidden md:block md:w-16`,
);
```

- **Below `md` (767px and under, i.e. phones/small tablets)**: collapsed (`expanded() === false`)
  → `hidden` (not in the layout at all, zero footprint). Expanded → `fixed inset-x-0 top-14
  bottom-0 z-40 w-full` — a full-screen overlay starting right below the sticky header (`top-14`
  matches the header's own `h-14`) down to the bottom of the viewport, full width. This is what
  "takes the whole screen" means in practice: the header stays visible/usable above it (so the
  hamburger remains reachable to close the menu), everything below is the opaque sidebar.
- **At `md` and above**: the `md:` overrides win — `md:static` (back in normal flow, part of the
  `flex` row with `<main>`), `md:top-14`/`md:sticky` (stays pinned while the page scrolls),
  `md:w-56` (224px, expanded) or `md:w-16` (64px, collapsed) — the v2 desktop behavior, untouched.
- **Initial state**: `App.ngOnInit()` checks `isMobileViewport()` (via `window.matchMedia(
  '(max-width: 767px)')`, guarded with `?.` since jsdom doesn't implement `matchMedia` — see
  `theme.service.ts` for the same pattern) and sets `sidebarExpanded` to `false` if so; otherwise
  it stays at its default `true`. This is a **one-time check at load**, not a live resize
  listener — resizing an already-open desktop browser window down past 767px does not retroactively
  hide/show the sidebar. Documented as a known simplification, not a bug.
- **Link clicks**: `NavSidebar` emits `linkClicked` on every `<a>` click; `App.onSidebarLinkClicked()`
  collapses the sidebar only `if (this.isMobileViewport())`. On desktop, clicking a nav link keeps
  the sidebar exactly as it was (matches v2's "outside click collapses, link click doesn't").
  On mobile, since the open sidebar covers the whole screen, leaving it open after navigating
  would strand the user looking at the menu instead of the page they just chose — so it always
  collapses back to hidden there.

### 3.6 Tests

- `home-page.spec.ts`: welcome heading renders; all four `quickLinks` labels present, in order.
- `nav-sidebar.spec.ts`: renders the four links in order; expanded state shows labels and
  `w-56` in the class list; collapsed state hides labels (empty `textContent` per link), sets a
  `title` attribute per link, and includes `w-16`.
- `app.spec.ts`:
  - brand text + `button[aria-label="Toggle navigation menu"]` present.
  - sidebar defaults to expanded (`w-56`, contains "Rag") on desktop (jsdom's lack of
    `matchMedia` is treated as desktop).
  - clicking the toggle button collapses it (`w-16`, empty text).
  - clicking anywhere outside the sidebar (`document.body`) collapses it.
  - clicking a link *inside* the sidebar does **not** collapse it (desktop behavior).
  - version badge and Escape-delegation tests preserved unchanged from before this feature.
  - a nested `describe('on a mobile viewport', ...)` stubs `window.matchMedia` to return
    `{ matches: true, addEventListener: vi.fn() }` (the `addEventListener` stub is required
    because `ThemeService.init()`, called from the same `ngOnInit()`, also calls
    `window.matchMedia(...).addEventListener(...)` — omitting it throws) and asserts: sidebar
    starts `hidden`; the toggle button reveals it as a `fixed inset-x-0 ... w-full` overlay;
    clicking a link afterwards re-hides it.
- No changes needed to `code-search-page.spec.ts`, `projects-page.spec.ts`,
  `settings-page.spec.ts`, or `feedback-stats-page.spec.ts` — none assert against their own route
  path.

## 4. Risks / open questions

- **No live resize listener** — the mobile/desktop split is decided once at `ngOnInit()`. A user
  who resizes their browser window across the 767px line without a reload keeps whatever sidebar
  behavior was decided at load. Acceptable simplification; revisit if it becomes a real complaint.
- **`md:w-56`/`md:w-16` values** (224px/64px) are a judgment call, not derived from any existing
  precedent in the app (there was no persistent sidebar before this feature).
- **Mobile full-screen overlay has no separate backdrop element** — the opaque sidebar background
  itself covers the content, so there's nothing to "tap through"; the only ways to close it are
  the hamburger, tapping the header (outside the sidebar/toggle), or navigating a link.
- **`home-page.html`'s logo** was changed to `public/logo-200.png` (unsized `<img>`) after this
  feature's initial implementation, in an unrelated edit outside this conversation — noted here
  only because it touches the same file, not because it's part of this feature's scope.

## 5. Out of scope

- No manual dark/light theme toggle (`ThemeService` remains OS-driven only).
- No changes to `ProjectsPage`, `SettingsPage`, `FeedbackStatsPage`, or `CodeSearchPage` internals
  — only `CodeSearchPage`'s route changed (`/` → `/rag`).
- No icon library addition — all icons (hamburger + the four nav icons) are hand-written inline
  SVGs, consistent with the rest of the app avoiding icon-font/library dependencies.
- No persistence of the expanded/collapsed preference (e.g. `localStorage`) across page loads —
  every load re-decides purely from `isMobileViewport()`.
