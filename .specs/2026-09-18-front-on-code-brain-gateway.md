# Spec: Serve the frontend from blogdoft.home.arpa/code-brain instead of its own subdomain

Status: Implemented
Follows `.specs/2026-09-18-gateway-and-projects-migration.md` (the API-contract move to the shared
gateway). This spec covers moving the frontend's own hosting onto that same gateway, prompted by
the question "now that the API's two services already share one host/path, does the frontend still
need its own reverse proxy?" — the answer was: yes, for TLS and cross-origin reasons, unless the
frontend *also* moves onto that host, which is what this spec does.

## 1. Background

Confirmed by inspecting the two backend services' own `.eng/k8s/` directories (local clones at
`/home/ftathiago/src/forgejo/code-ciir-api` and `/home/ftathiago/src/forgejo/code-ciir-indexer`):
both already route through Traefik on host `blogdoft.home.arpa`, at
`/code-brain/api/code-queries` and `/code-brain/api/indexer` respectively (`pathType: Prefix`),
each with its own `stripPrefix` Middleware removing `/code-brain` before forwarding, since neither
backend's own controllers know about that segment. The frontend, until now, was on its own
subdomain (`code-rag.home.arpa`, root path).

Moving the frontend onto `blogdoft.home.arpa/code-brain/` too:
- Makes the app served same-origin with the API gateway, so its own reverse proxy stops being
  needed for CORS/origin reasons (TLS trust is a separate, orthogonal reason it's still needed
  locally — see §4).
- Lets Traefik itself split `/code-brain/api/code-queries*` and `/code-brain/api/indexer*` directly
  to the two backend services **before the request ever reaches the frontend's own pod**, since
  Traefik resolves overlapping Ingress path rules by specificity (longest prefix wins) — this is
  already the exact mechanism the two backend services use to coexist with each other, so adding a
  third, broader `/code-brain` rule for the frontend doesn't conflict with either.
- Retires `code-rag.home.arpa` as this app's address entirely — not an additive change. `<base
  href>` is a single, build-time value; the same build can't correctly serve both a root-mounted
  domain and a sub-path-mounted one at once (routing and every root-relative asset/API reference
  would only resolve correctly for whichever one matches the compiled base href).

## 2. What changed

### 2.1 Base href (`angular.json`, not `src/index.html`)

Added `"baseHref": "/code-brain/"` to the `production` build configuration. `src/index.html`
itself is left with `<base href="/">` — Angular's build system rewrites this in the *emitted*
`dist/.../index.html` per configuration, so `ng serve` (which always uses the `development`
configuration, unaffected by this) keeps serving the app at root locally. Verified by running
`npm run build` and inspecting the output: `<base href="/code-brain/">` in the built
`index.html`, unchanged `<base href="/">` in the source file.

This matters because relative (no-leading-slash) resource references — `<img src="logo-200.png">`,
`<link href="favicon-32x32.png">`, Angular Router's own generated links — resolve against `<base
href>`. Absolute (leading-slash) references do **not**: they resolve against the origin root
regardless of `<base href>`, which is why `/api/...` and `/version` needed a different fix (§2.2)
and why `version.json` needed one too (§2.3).

### 2.2 `ConfigService`'s default API base URL

Was a hardcoded `''`. Now derived at module load from the page's own `<base href>`
(`document.querySelector('base')?.getAttribute('href')`, trailing slash stripped) — `/code-brain`
in production, `''` in `ng serve`, without hardcoding either value or needing to keep two constants
in sync. `core/interceptors/base-url.interceptor.ts` is unchanged: it still just prefixes
`/api`-leading and exact-`/version` request URLs with whatever `ConfigService.apiBaseUrl()`
resolves to, at request time. `config.service.spec.ts`'s existing "defaults to an empty base URL"
test still passes unmodified: jsdom's test document has no `<base>` element, so the fallback (`'/'`,
stripped to `''`) applies, matching today's behavior exactly.

Settings can still override this to an arbitrary absolute URL — that mechanism is unrelated to and
unaffected by this change; it's the piece of this design that actually needs to survive per-user
configuration, which is exactly what `<base href>` (a single, static, build-time value) can't do
this app already had a separate mechanism for.

### 2.3 `VersionService` (this app's own build-version asset, not the API)

Was `this.http.get('/version.json', ...)` (absolute, leading slash). Now
`this.http.get('version.json', ...)` (relative, no leading slash) — resolves against `<base href>`
directly, same mechanism as the `<img>`/`<link>` tags in §2.1, with no dependency on
`ConfigService`/`baseUrlInterceptor` at all. This is deliberately a *different* fix than §2.2's:
`version.json` is always same-deployment and never user-configurable (unlike the API, which can
point at a different origin via Settings), so it should just behave like any other same-origin
static asset rather than route through the API-base-URL machinery.

### 2.4 `.eng/k8s/ingress.yaml` + new `.eng/k8s/middleware.yaml`

Replaced the `code-rag.home.arpa` / `/` rule with `blogdoft.home.arpa` / `/code-brain`
(`pathType: Prefix`), and added a `code-rag-front-strip-code-brain` Middleware (referenced via the
same `traefik.ingress.kubernetes.io/router.middlewares` annotation pattern the two backend services
use) so `/code-brain` is stripped before reaching this app's own pod — `nginx.conf.template` needed
**no changes**, since it keeps receiving requests as if mounted at `/`, exactly as before. Added
`middleware.yaml` to `kustomization.yaml`'s `resources:` list.

## 3. Ingress conflict check (the question that prompted this spec)

No conflict. Verified by reading both sibling services' actual `ingress.yaml` files rather than
guessing: `code-ciir-api` claims `/code-brain/api/code-queries` and `code-ciir-indexer` claims
`/code-brain/api/indexer`, both `pathType: Prefix` on host `blogdoft.home.arpa`. Adding this app's
own broader `/code-brain` rule on the same host is exactly the pattern those two already use to
coexist with each other — Traefik's Kubernetes Ingress provider assigns router priority by rule
specificity (longer/more specific path wins) across *all* Ingress objects targeting a host, not
just within one Ingress's own rules, so no explicit `priority` annotation was needed here either.

## 4. Why the reverse proxy (nginx/proxy.conf.json) is still needed anyway

This was the actual original question. Answer: same-origin hosting removes the *CORS* reason for a
proxy, but not the *TLS* one. `blogdoft.home.arpa` presents a certificate the browser won't trust
directly (confirmed: fetching its swagger docs required `curl -k`) — only a server-side hop
(nginx's `proxy_ssl_verify off`, or the CLI dev-server proxy's `secure: false`) can skip that
verification; a browser has no equivalent escape hatch. Locally, `ng serve` still has no Traefik in
front of it at all, so `proxy.conf.json` remains the only thing making `/api/...` calls work
there regardless of any of the above.

## 5. A loop risk considered and ruled out

Worth recording since it was closely related and easy to get wrong: once this app's own Ingress
claims a `/code-brain` catch-all, any request under that prefix *without* a more specific rule
elsewhere (only `/version` and `/version.json` qualify today) falls through to this app's own pod.
If this app's own `nginx.conf.template` `location = /version` block's `proxy_pass` target
(`API_UPSTREAM`) were ever set to the *same* public gateway host this app is now mounted under, that
request would round-trip back out through Traefik, hit this app's own catch-all again, and loop.

This does **not** happen with the current configuration: `.eng/k8s/deployment.yaml`'s
`API_UPSTREAM` is a direct in-cluster Service DNS name
(`code-ciir-api.code-rag.svc.cluster.local`), not the public gateway host, so `/version` resolves
directly and safely there (see the updated comment in that file and in `CLAUDE.md`'s `GET /version`
bullet). `.eng/docker/docker-compose.yml`'s standalone/local default *does* point at the public
gateway host (`https://blogdoft.home.arpa/code-brain`) — but that's fine too, since the request it
proxies lands on the *cluster's* deployment (the one with the safe, direct upstream), not on itself;
the loop would only materialize if `deployment.yaml`'s value were ever changed to match. Flagged
with a comment in both files rather than restructured, since restructuring further didn't seem to
buy anything concrete beyond what the comments already make an intentional, load-bearing
invariant.

## 6. Testing

- `config.service.spec.ts`: unmodified, still passes — jsdom's default test document has no
  `<base>` element, so the new derivation falls back to the same `''` default the old hardcoded
  constant produced.
- `version.service.spec.ts`: URL assertions updated from `/version.json` to `version.json`
  (`HttpTestingController` matches the exact string passed to `HttpClient`, which is not resolved
  to an absolute URL in the testing harness — the two need to match verbatim).
- Full suite (`npm test`) and a real `npm run build` (inspecting the emitted `index.html`'s `<base
  href>`) both verified after these changes.

## 7. Out of scope

- Adding a dedicated `/code-brain/version` Ingress rule in code-ciir-api's own repo, which would
  make `/version` reachable through the gateway on its own merits instead of relying on this app's
  nginx passthrough. Not this repo's to change unprompted; `CLAUDE.md`'s `GET /version` bullet
  documents the current, working-but-indirect path instead.
- `SPEC.md` (line 3) still references `https://code-ciir-api.home.arpa` as this app's target API,
  predating even `.specs/2026-09-10-ciir-api-migration.md` — pre-existing staleness, not touched
  here, same as prior migrations.
