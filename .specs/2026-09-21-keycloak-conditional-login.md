# Spec: Conditional Keycloak login

Status: Implemented

## 1. Requirement

> Caso exista configuração que habilite o Keycloak, o sistema deve redirecionar o usuário para
> login no Keycloak. Do contrário, nenhum login é requerido.

Translated: whether this app requires a login at all is controlled by a single deploy-time switch.
When that switch is on, every user must authenticate against Keycloak before using the app (a
full-page redirect to Keycloak's login page, standard OIDC behavior). When it's off — including
today's default, since nothing currently sets it — the app behaves exactly as it does now: no
login, no auth-related UI, no `Authorization` header on API calls.

This is deliberately all-or-nothing (whole app, not per-route) and binary (no "optional login").
Nothing in the request asks for per-route gating or a guest/anonymous mode alongside Keycloak, so
neither is built.

## 2. Where "configuração" lives

Not `ConfigService`/Settings/localStorage — those are per-*user*, browser-local preferences (API
base URL, display name, theme). Whether Keycloak is required is a per-*deployment* decision an
operator makes, the same category as `API_UPSTREAM` (nginx) — so it follows that exact precedent:
a runtime-generated static JSON asset, fetched once at bootstrap, the same mechanism this app
already uses for `version.json` (`.eng/docker/version.json.template` +
`40-generate-version.sh`, see `CLAUDE.md`'s `GET /version` bullet and `VersionService`).

New asset: **`auth-config.json`**, generated at container start by a new
`.eng/docker/41-generate-auth-config.sh` from four environment variables (`KEYCLOAK_ENABLED`,
`KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`) — plain runtime env vars (docker-compose
`environment:` / k8s `env:`), *not* baked in at `docker build` like `APP_VERSION` is, since unlike
the build's own version tag, whether Keycloak is on and which realm/client to use are properties of
where the image is deployed, not of the image itself. The generator script defaults
`KEYCLOAK_ENABLED` to the literal string `false` (via shell `${VAR:-false}`, exported before
`envsubst` runs) precisely so an operator who sets none of these four vars still gets valid JSON
and a disabled-by-default app — mirroring "no configuration ⇒ no login required" directly, not just
by convention.

```
# .eng/docker/auth-config.json.template
{"enabled": ${KEYCLOAK_ENABLED}, "url": "${KEYCLOAK_URL}", "realm": "${KEYCLOAK_REALM}", "clientId": "${KEYCLOAK_CLIENT_ID}"}
```

`public/auth-config.json` (committed, used by `ng serve` the same way `public/version.json` already
is) ships as `{"enabled": false, "url": "", "realm": "", "clientId": ""}` — local dev never requires
a login unless a developer deliberately edits that file to point at a real Keycloak instance.

Settings page is explicitly **not** touched — same reasoning as `version.json`: this isn't a
per-user, changeable-without-a-redeploy value.

## 3. Client library and login flow

`keycloak-js` (official Keycloak JS adapter, `^26`) — the direct, standard choice for integrating
specifically with Keycloak (as opposed to a generic OIDC client), and it's what the requirement
names. Flow: Authorization Code + PKCE (`pkceMethod: 'S256'`), `onLoad: 'login-required'` —
`keycloak.init()` itself performs the "redirect user to login" behavior the requirement describes;
no hand-rolled redirect/callback-parsing code is needed.

`checkLoginIframe` is left `false`: the iframe-based silent-SSO check needs a same-origin static
`silent-check-sso.html` responder and adds real complexity (this app is served from a sub-path
behind a stripping Traefik middleware — see `CLAUDE.md`'s hosting section — which the iframe
response page would also need to account for). Trade-off accepted and written down here rather than
hidden: without it, every full page reload does a real (if fast, cookie-backed) redirect round trip
to Keycloak and back rather than a silent check. Acceptable for what was asked; revisit only if the
reload flicker turns out to bother users in practice (§7).

## 4. What changes

### 4.1 `core/services/auth-config.service.ts` (new)

Fetches `auth-config.json` (relative, base-href-resolved path — same reasoning as `VersionService`
§2.3 of `.specs/2026-09-18-front-on-code-brain-gateway.md`), with `SUPPRESS_ERROR_TOAST` and a
`catchError` that degrades to `{ enabled: false, url: '', realm: '', clientId: '' }` plus a
`console.error` (loud, unlike `VersionService`'s silent degrade — a real deployment that *meant* to
require Keycloak but has a broken/missing `auth-config.json` should be diagnosable, not silently
left open).

### 4.2 `core/services/keycloak-auth.service.ts` (new)

Wraps a `Keycloak` instance from `keycloak-js`. Public surface:
- `init(): Promise<void>` — reads `AuthConfigService`; if disabled, resolves immediately and leaves
  every signal below at its default ("no login required"). If enabled, constructs `new
  Keycloak({ url, realm, clientId })` and calls `keycloak.init({ onLoad: 'login-required',
  pkceMethod: 'S256', checkLoginIframe: false })` — this is the actual redirect-to-login step.
  Registers `keycloak.onTokenExpired = () => keycloak.updateToken(30)` afterward so a long-lived tab
  keeps refreshing silently.
- `enabled: Signal<boolean>`, `username: Signal<string | undefined>` (from
  `keycloak.tokenParsed?.preferred_username`).
- `token(): string | undefined` — current access token, read by the new interceptor (§4.4).
- `logout(): void` — `keycloak.logout()` (defaults `redirectUri` to the current URL; landing back on
  a `login-required` app with no session immediately re-triggers the login redirect, which is
  correct here — there is no logged-out-but-still-using-the-app state to return to).

### 4.3 Bootstrap gating (`app.config.ts`, `main.ts`)

`provideAppInitializer(() => inject(KeycloakAuthService).init())` added to `appConfig`'s providers.
Angular blocks `bootstrapApplication` until all app initializers resolve, so when Keycloak is
enabled the whole app (every route, not just some) waits behind a successful login — matching
"nenhuma parte do sistema é usada sem login" for the enabled case, and adds zero delay for the
disabled case since `init()` resolves synchronously-ish then. `main.ts` itself is unchanged.

### 4.4 `core/interceptors/auth.interceptor.ts` (new)

For requests where `req.url.startsWith('/api')` (same predicate `base-url.interceptor.ts` uses,
deliberately excluding the unauthenticated `/version` endpoint) and
`KeycloakAuthService.enabled()` is true, clones the request with an `Authorization: Bearer
<token>` header. A no-op (passes the request through unchanged) when Keycloak is disabled, so every
existing service/spec that talks to `/api/...` today is unaffected when the feature is off. Added
to `appConfig`'s `withInterceptors([...])` list alongside the existing two.

### 4.5 Logout UI (`app.ts` / `app.html`)

A small "Sair" button plus the authenticated username, added to the top nav bar next to the
`code-brain` wordmark, visible only when `KeycloakAuthService.enabled()` is true (never rendered at
all in the disabled/default case — no dead UI). Calls `KeycloakAuthService.logout()`.

### 4.6 `package.json`

Adds `keycloak-js` (`^26.2.4` at time of writing) as a runtime dependency.

### 4.7 Docker / k8s

- `.eng/docker/Dockerfile`: copy `auth-config.json.template` next to `version.json.template`, copy
  and `chmod +x` the new `41-generate-auth-config.sh`.
- `.eng/docker/docker-compose.yml`: add `KEYCLOAK_ENABLED`/`KEYCLOAK_URL`/`KEYCLOAK_REALM`/
  `KEYCLOAK_CLIENT_ID`, each `${VAR:-...}`-defaulted the same way `API_UPSTREAM` already is, so
  `docker compose up` with no `.env` stays disabled.
- `.eng/k8s/deployment.yaml`: same four env vars, defaulted to disabled, with a comment noting that
  enabling this in a real environment means overriding them via a patch in the `argo-local-apps`
  GitOps repo (this repo's manifest only supplies the safe default, same pattern already used
  there for anything environment-specific).

## 5. Behavior summary

| `auth-config.json` | App behavior |
|---|---|
| `enabled: false` (default; also the fetch-failure fallback) | Identical to today: no redirect, no login UI, no `Authorization` header, every route reachable immediately. |
| `enabled: true` | On load, `keycloak.init({ onLoad: 'login-required' })` redirects to Keycloak if there's no active session; the app only renders after a successful login. All `/api/...` calls carry `Authorization: Bearer <token>`. A "Sair" button is visible; using it logs out of Keycloak and immediately re-prompts for login. |

## 6. Testing

- `auth-config.service.spec.ts`, `keycloak-auth.service.spec.ts`, `auth.interceptor.spec.ts`: new,
  covering the enabled/disabled branches and the fetch-failure fallback, following this repo's
  existing `HttpTestingController`-based patterns (see `version.service.spec.ts`,
  `base-url.interceptor.spec.ts`).
- `app.spec.ts` (if present) / manual check: logout button absent when disabled.
- `npm test` and `npm run build` both run clean, per existing repo convention.
- No Playwright/live-browser verification of an actual Keycloak login round trip — there is no
  Keycloak instance reachable from this environment to redirect to; the disabled path (today's
  default) is what's actually exercised end-to-end.

## 7. Out of scope

- 401-triggered re-authentication/retry logic beyond `keycloak-js`'s own silent `updateToken`
  refresh — not asked for, and adds real complexity (interceptor retry, request queuing during
  refresh) for a case (a still-valid session's token expiring mid-request) that's rare in practice.
- `silent-check-sso.html` / iframe-based SSO checks (§3) — reload does a visible redirect round trip
  instead of a silent one.
- Per-route or per-role authorization (e.g., only `/projects` requiring login, or role-gated
  features). The requirement is a single whole-app switch.
- Any change to the backend services (code-ciir-api / CIIR Indexer API) to actually validate the
  bearer token server-side. Out of this repo's control; this spec only makes the frontend send it.
- A Settings-page toggle or any user-facing way to change this — it's operator/deploy configuration
  by design (§2).
