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
- `.eng/k8s/deployment.yaml`: same four env vars.

## 5. Update — enabled for the `k8s` realm

**Correction to §4.7's original plan:** it assumed an environment could turn Keycloak on via a
patch layered in the `argo-local-apps` GitOps repo, leaving this repo's own manifest on the safe
default. Checking `docker-publish.yml` (`.forgejo/workflows/docker-publish.yml`, "Sync manifests to
argo-local-apps" step) shows that's not how this repo's deploy actually works: every tag push does
`rm -rf manifests/code-rag-front && cp -r .eng/k8s/. manifests/code-rag-front/` — a wholesale
replace, not a preserved overlay/patch. Whatever is in *this* repo's `.eng/k8s/deployment.yaml` is
exactly what ends up deployed; there is no separate place to override it. (Other services in this
cluster may have a different sync mechanism — not verified, not relevant here.)

Given that, `.eng/k8s/deployment.yaml`'s four env vars are now set directly to real values instead
of staying disabled-by-default:

```yaml
KEYCLOAK_ENABLED: "true"
KEYCLOAK_URL: "https://keycloak.home.arpa"
KEYCLOAK_REALM: "k8s"
KEYCLOAK_CLIENT_ID: "code-brain"
```

Same Keycloak host and realm `code-ciir-api` already authenticates against (see that repo's
`.eng/k8s/configmap.yaml`, `Keycloak__Authority`) — one shared realm across every code-brain
service. `code-brain` is a separate, pre-existing public client (PKCE, no client secret)
registered in that realm specifically for this frontend, distinct from `code-ciir-api`'s own
client id (which that service shares with its Swagger UI) — confirmed with the user rather than
assumed, since a wrong client id here would 401/misconfigure login for every user.

`public/auth-config.json` (the `ng serve` dev default, §2) was updated to the same four real
values, so local dev now also goes through a real Keycloak login rather than staying disabled by
default. Flip `enabled` back to `false` there locally if that's disruptive to iterate against.

## 6. Keycloak-side client fixes (not this repo, but the actual cause of two live failures)

Turning `KEYCLOAK_ENABLED` on (§5) surfaced two `code-brain` client misconfigurations in Keycloak
itself — nothing in this repo's code was wrong, but the login round-trip was broken end-to-end
until both were fixed in the Keycloak admin console (realm `k8s` → Clients → `code-brain`).
Recorded here since they're the kind of thing that silently breaks again if the client is ever
recreated or reset, and neither error message points directly at the fix:

- **`401` on `POST /realms/k8s/protocol/openid-connect/token`** (`keycloak-js`'s `init()` rejects
  with "Server responded with an invalid status"). Cause: **Client authentication** was `On`
  (confidential) — but `keycloak-js` is a public SPA client and never sends a `client_secret`, so
  Keycloak's token endpoint rejected the code exchange with `invalid_client_credentials`. Fix:
  Settings → Capability config → **Client authentication: Off**.
- **`403 invalid origin`** on CORS-checked Keycloak requests, immediately after the `401` above was
  fixed. Cause: **Web origins** was set to `https://blogdoft.home.arpa/code-brain/` — a path, but
  the browser's `Origin` header is always just scheme+host+port and never includes a path, so it
  could never match. Fix: Settings → Access settings → **Web origins: `https://blogdoft.home.arpa`**
  (no path, no trailing slash).

Diagnosed by reproducing the login with a connected browser (`read_network_requests`/
`read_console_messages` on the failing requests) and cross-checking against `kubectl logs` for the
`keycloak-0`/`keycloak-1` pods (`keycloak` namespace) — the Keycloak event log's `CODE_TO_TOKEN_ERROR
... error="invalid_client_credentials"` entries confirmed the first cause directly; the second was
found by inspecting the client's own Access settings after the first fix didn't fully resolve
login.

## 7. Behavior summary

| `auth-config.json` | App behavior |
|---|---|
| `enabled: false` (default; also the fetch-failure fallback) | Identical to today: no redirect, no login UI, no `Authorization` header, every route reachable immediately. |
| `enabled: true` | On load, `keycloak.init({ onLoad: 'login-required' })` redirects to Keycloak if there's no active session; the app only renders after a successful login. All `/api/...` calls carry `Authorization: Bearer <token>`. A "Sair" button is visible; using it logs out of Keycloak and immediately re-prompts for login. |

## 8. Testing

- `auth-config.service.spec.ts`, `keycloak-auth.service.spec.ts`, `auth.interceptor.spec.ts`: new,
  covering the enabled/disabled branches and the fetch-failure fallback, following this repo's
  existing `HttpTestingController`-based patterns (see `version.service.spec.ts`,
  `base-url.interceptor.spec.ts`).
- `app.spec.ts` (if present) / manual check: logout button absent when disabled.
- `npm test` and `npm run build` both run clean, per existing repo convention.
- The real login round trip against `https://keycloak.home.arpa` (realm `k8s`) was verified live
  with a connected browser after §6's fixes — confirmed working end-to-end, not just unit-tested.

## 9. Out of scope

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
