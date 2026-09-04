# Spec: Settings Page

Status: Implemented

## Note on this document

The Settings screen (`features/settings/settings-page.ts`) grew field-by-field across several
unrelated pieces of work — API base URL and the feedback user name shipped with the original app
skeleton, before the `.specs/` convention existed; export timezone was added as a side effect of
`.specs/2026-09-03-feedback-csv-export.md`'s first amendment; theme/appearance is the newest
addition. This document consolidates the whole page as it exists today into one place, so future
changes to any one field have a single spec to update instead of hunting across the others.

## 1. Overview

Single route `/settings` (`SettingsPage`), reachable from the nav sidebar (`NavSidebar` — sun/gear
icon, see `.specs/2026-09-03-app-shell-redesign.md` §3.2). The template
(`features/settings/settings-page.html`) renders three `<section>` cards inside a
`mx-auto max-w-xl` column: **API settings**, **Feedback**, **Appearance**. Every setting persists
to `localStorage` through `core/services/config.service.ts` — per `SPEC.md`, "Todas as
configurações são armazenadas no local storage."

Two save behaviors coexist on this one page:

- **API base URL**, **Your name**, **Export timezone** — the user types into an `<input>`, edits
  are staged in a local `signal` (not yet persisted), and only a **Save** button click (or Enter
  in the field) validates and commits the value via the matching `ConfigService.setXxx()` call,
  with a success/error toast.
- **Theme** (§5) — there is no draft state and no Save button. Clicking one of the three options
  saves and applies it in the same call. This is a deliberate difference, not an oversight: a
  theme choice is binary/exhaustive (pick one of three swatches) with nothing to type or get
  wrong, unlike a URL or an IANA timezone name that benefits from a distinct "commit" step and
  validation.

## 2. Persistence — `core/services/config.service.ts`

One `localStorage` key and one `signal` per field, all following the same shape: a private
writable `signal` seeded by a `readXxx()` method on construction, exposed read-only via
`.asReadonly()`, and mutated only through a `setXxx()` method that writes `localStorage` first and
then updates the signal.

| Field            | `localStorage` key       | Default              | Setter                |
|-------------------|--------------------------|-----------------------|------------------------|
| API base URL       | `code-rag.apiBaseUrl`    | `''` (same-origin)   | `setApiBaseUrl`       |
| User name          | `code-rag.userName`      | `''`                 | `setUserName`         |
| Export timezone    | `code-rag.exportTimezone`| `America/Sao_Paulo`  | `setExportTimezone`   |
| Theme              | `code-rag.theme`         | `system`              | `setTheme`            |

`readTheme()` additionally guards against a corrupted/foreign stored value: it only accepts
`'light' | 'dark' | 'system'` (checked against a `VALID_THEMES` array) and falls back to
`'system'` for anything else, rather than trusting `localStorage` content type unchecked the way
the string fields do (a stray/manually-edited value there can only ever be redisplayed as-is, not
misinterpreted).

## 3. API settings — API base URL

Unchanged by this consolidation; documented here for completeness. Empty is a valid, and the
default, value — it means "call `/api` on this same origin" so a reverse proxy in front of the app
handles routing (see `CLAUDE.md`'s API base URL section for why an absolute default would be
unsafe). `save()` accepts empty unconditionally; a non-empty value must parse as an `http:`/
`https:` URL (`isValidHttpUrl`, via the `URL` constructor) or a toast error blocks the save.

## 4. Feedback — user name and export timezone

- **Your name** — free text, saved as-is (trimmed). Used to identify the caller on the
  useful/not-useful feedback flow (`CodeQueriesService.submitFeedback`'s `user` field, see
  `CLAUDE.md`). No format validation — any non-empty or empty string is accepted.
- **Export timezone** — an IANA timezone name used to render `created_at` in the feedback CSV
  export and to anchor the Reports date-range filter (`.specs/2026-09-03-feedback-csv-export.md`'s
  amendments). Empty is valid (falls back to UTC). A non-empty value is checked against
  `isLikelyIanaTimezone` — accepts the literal `UTC` or a `Region/City[/Subregion]`-shaped string —
  a best-effort client-side sanity check only; the API is the real authority and still rejects an
  unrecognized zone with a 400 when an export is actually requested.

Both fields share the same Save-button pattern as API base URL (§3).

## 5. Appearance — Theme

### 5.1 `ThemePreference` and `ThemeService` — `core/services/theme.service.ts`

```ts
export type ThemePreference = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

  apply(preference: ThemePreference): void {
    if (this.mediaListener) {
      this.media?.removeEventListener('change', this.mediaListener);
      this.mediaListener = null;
    }
    if (preference === 'system') {
      this.applyDark(this.media?.matches ?? false);
      this.mediaListener = (event) => this.applyDark(event.matches);
      this.media?.addEventListener('change', this.mediaListener);
      return;
    }
    this.applyDark(preference === 'dark');
  }

  private applyDark(isDark: boolean): void {
    this.document.documentElement.classList.toggle('dark', isDark);
  }
}
```

`apply()` replaced an earlier, OS-only `init()` that always followed `prefers-color-scheme` with
no override. It's idempotent and safe to call repeatedly at runtime (not just once at bootstrap):
every call first tears down any previously registered `matchMedia` "change" listener before
deciding what to do next, so switching **away** from `'system'` stops reacting to OS changes, and
switching **into** `'system'` (from a fixed choice) starts reacting again from a clean slate — this
matters because a single injected instance lives for the app's whole lifetime and `apply()` may be
called many times as the user changes their mind in Settings (§5.3).

- `'light'` / `'dark'` — force `.dark` on `<html>` on or off, ignoring the OS setting entirely.
- `'system'` — mirrors `SPEC.md`'s original requirement ("tema light e dark, orientados conforme a
  configuração do navegador"): applies the current `prefers-color-scheme: dark` match immediately,
  then keeps listening for OS-level changes (e.g. the OS switching from light to dark at sunset)
  for as long as `'system'` stays selected.

### 5.2 Bootstrap — `app.ts`

```ts
ngOnInit(): void {
  this.theme.apply(this.configService.theme());
  ...
}
```

Reads the persisted preference (default `'system'` per §2) once at startup and applies it — this
is what satisfies "quando não houver nada definido, o padrão deve bater com o definido pelo
dispositivo" (when nothing is set, the default follows the OS setting): an empty/missing
`localStorage` value resolves to `'system'` in `ConfigService.readTheme()`, which `ThemeService`
then resolves against `prefers-color-scheme` exactly as before this feature existed.

### 5.3 Settings page — selection saves and applies immediately

```ts
protected readonly themePreference = signal(this.configService.theme());
protected readonly themeOptions: ThemeOption[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match device' },
];

protected selectTheme(preference: ThemePreference): void {
  this.themePreference.set(preference);
  this.configService.setTheme(preference);
  this.themeService.apply(preference);
  this.toast.success('Theme updated.');
}
```

Template: a three-button `role="radiogroup"` (`aria-label="Theme"`), one `role="radio"` button per
`themeOptions` entry via `@for`, `[attr.aria-checked]` bound to whether that option matches
`themePreference()`. The selected button gets solid `bg-sky-600`/`text-white` styling; the other
two stay neutral with a hover state. `(click)="selectTheme(option.value)"` is the **only** trigger
— no Save button, no `keydown.enter` handler, no `EscClearableDirective` (there's nothing to type
or clear; §1 explains why this section intentionally departs from the rest of the page).

## 6. Escape-key behavior (API base URL, Your name, Export timezone only)

All three text `<input>`s use `[appEscClearable]` (`shared/directives/esc-clearable.directive.ts`,
`CLAUDE.md`'s "Escape-key state machine" section): Escape clears the field and stops propagation
if it currently holds a value, or does nothing (letting Escape bubble to the document-level
handler) if already empty. The Appearance section has no text fields and therefore no
`EscClearableDirective` usage — the three theme buttons are plain buttons, not clearable inputs.

## 7. Testing

- `core/services/config.service.spec.ts` — default/read/persist cases for all four fields,
  including `readTheme()`'s fallback to `'system'` for a corrupted stored value.
- `core/services/theme.service.spec.ts` — `apply('dark')`/`apply('light')` force the class
  regardless of the stubbed OS match; `apply('system')` follows it and reacts to a subsequent
  `matchMedia` "change" event; switching from `'system'` to a fixed preference removes the old
  listener (asserted via the stub's `removeEventListener` spy, then confirming a fired change
  event no longer has any effect); calling `apply()` when `matchMedia` is unavailable (jsdom's
  default) doesn't throw.
- `features/settings/settings-page.spec.ts` — existing per-field save/validate/clear cases for API
  base URL, user name, export timezone (indices into `buttons()`/`inputs()` unchanged — the
  Appearance section was appended after Export timezone specifically so those existing
  index-based helpers didn't need to shift); new cases query theme buttons by
  `[role="radio"]`, asserting: the button matching `configService.theme()` is rendered
  `aria-checked="true"` on load, and clicking a different one calls `configService.setTheme`,
  `themeService.apply`, and shows the `'Theme updated.'` toast, with `aria-checked` moving to the
  clicked button.

## 8. Out of scope

- No "reset to defaults" action for the whole page — each field already has its own effectively-a-
  reset path (clear + save empty for the three text fields; clicking "Match device" for theme).
- No cross-tab sync (a `storage` event listener to react to another tab changing a setting) — out
  of scope for all four fields alike, not just theme; this app has no existing precedent for it.
- No additional theme choices beyond light/dark/system (e.g. a custom accent color) — `SPEC.md`
  only calls for light/dark oriented by the browser setting; `system` plus an explicit override
  either way already covers that plus the one natural extension (a user preference that
  overrides the OS).
