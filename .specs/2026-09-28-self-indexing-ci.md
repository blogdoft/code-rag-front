# Spec: index this repository's own source on every merge to main

Status: Implemented (workflow change). Indexer-side project registration and the Forgejo
variables/secret it depends on are a **manual, outside-this-change** prerequisite — see §4.

## 1. Motivation

`code-brain-angular` (the CIIR generator for TypeScript/Angular, published as the `code-brain-angular`
npm package) already dogfoods itself: its own `.forgejo/workflows/ci.yml` has a `ciir` job that
analyzes that repository with the freshly-built tool and, on a version tag, uploads the resulting
`ciir.jsonl` to the code-ciir-indexer.

This app (`code-rag-front`) is itself an Angular codebase, so the same tool can analyze it. Doing so
keeps this app's own source searchable through itself, without a separate manual step.

## 2. Behaviour / design

A new `ciir` job added to the existing `.forgejo/workflows/docker-publish.yml` (not a separate
workflow file — see §5 for why this superseded the first draft of this spec):

- **Trigger:** whatever already triggers `docker-publish.yml` — `push: tags: ["v*.*.*"]`. This job
  does not add a new trigger to the workflow; it rides the existing one. In practice this means the
  self-index refreshes on every version tag (release), not on every plain merge commit — see §5 for
  why that's the accepted trade-off here.
- **Ordering:** `needs: test` — the same gate `publish` already has, so the analysis only starts once
  formatting/build/tests have passed. It does **not** depend on `publish` (image build/push) or
  `update-gitops` (GitOps deploy): `ciir` and `publish` run in parallel once `test` succeeds, and
  `update-gitops` still only waits on `publish`. A CIIR analysis failure therefore can't block or
  delay the image publish/deploy path, and vice versa.
- **What it runs:** unlike `code-brain-angular`'s own `ciir` job, this repo doesn't build the analyzer
  from source (it isn't that repository) — it consumes the published package via
  `npx code-brain-angular@latest`, same as any other consumer.
- **Steps:** checkout → `actions/setup-node@v4` (node 22, matching the `test` job) → `npm ci` (this
  repo's own deps — without `node_modules`, the analyzer resolves npm-package imports as
  `unresolved` relations per its README) → run the analyzer against `.` with `--output ciir-output
  --fail-on-error --no-progress`.
- **Upload gating:** keyed on whether `CIIR_BASE_URL` is configured (mirrors the guard
  `code-brain-angular`'s own `ciir` job uses — there it also checks `GITHUB_REF_TYPE == tag`, which
  is redundant here since this whole workflow only ever runs on tag pushes already). When set, the
  same run adds `--send "$CIIR_BASE_URL" --projectId "$CIIR_PROJECT_ID" --clientId "$CIIR_CLIENT_ID"
  --clientSecret "$CIIR_CLIENT_SECRET" --insecure`. `--insecure` is carried over unconditionally from
  the established pattern — the indexer sits behind a private-CA host (`blogdoft.home.arpa`, see
  `CLAUDE.md`'s TLS note) and Node doesn't consult the OS trust store by default, so this avoids
  depending on whichever self-hosted runner happens to pick up the job. Without `CIIR_BASE_URL` the
  job still runs and still fails the pipeline on an analysis error — it just skips the upload — so
  this job can land and go green before the indexer-side project exists.
- **No artifact upload.** An initial version of this job also uploaded `ciir-output/` via
  `actions/upload-artifact@v4` for debugging. Dropped after v1.12.1's actual run: the self-hosted
  runner's `actions/setup-node` tool cache can go missing by the time a later step needs node again
  — the `test` job's own `Post actions/setup-node@v4`/`Post actions/checkout@v4` cleanup hit the
  identical `fork/exec .../node: no such file or directory` error and survived it (a post-step
  failure doesn't fail a job), but the artifact-upload step is a *main* step needing node, so it
  failed the job outright even though the CLI run immediately before it had already succeeded (838
  records analyzed, uploaded to the indexer, `uploadId` returned). See §6.

Out of scope, deliberately: running this on pull requests or on plain pushes to `main` (see §5), and
adding a general "run tests on every push to main" workflow (this repo currently only tests on tag
pushes; unrelated to this change).

## 3. Execution plan

1. Delete the standalone `.forgejo/workflows/ciir.yml` from the first draft of this change.
2. Add a `ciir` job to `.forgejo/workflows/docker-publish.yml`, `needs: test`, sibling to `publish`
   (not chained after it), per §2.
3. Update this spec's header comment on `docker-publish.yml` to mention the new job and its
   prerequisites, matching the existing documentation style in that file's header.
4. No other app code or workflow changes needed.

## 4. Manual prerequisites (outside this change, not performed by this session)

For the upload half to actually activate (the job stays green without it, per the gating above):

- A project representing `code-rag-front` itself must exist in the CIIR indexer (e.g. created via
  this app's own `/projects` page) to obtain its UUID.
- Forgejo repo (or org, if `code-brain-angular`'s own setup already scoped them there — worth
  checking before duplicating) variables `CIIR_BASE_URL`, `CIIR_PROJECT_ID` (the UUID above),
  `CIIR_CLIENT_ID`, and repo secret `CIIR_CLIENT_SECRET` (a confidential Keycloak client with
  Service accounts enabled) must be configured under Settings > Actions, the same way
  `code-brain-angular`'s own `ci.yml` documents.

This session did not create the indexer project or touch Forgejo/Keycloak settings — no credentials
or access for either were available, and both are shared-infrastructure changes outside a code
change's blast radius.

## 5. Alternatives considered

- **A separate workflow triggered on every push to `main`.** This was the first draft of this spec.
  Superseded on explicit direction: the CIIR step must live inside `docker-publish.yml`, running in
  parallel once tests pass, rather than as its own workflow on its own trigger. The accepted
  consequence is that the self-index now refreshes per release tag rather than per merge — this
  repo's own release cadence (manual `git tag`) becomes the index's refresh cadence too.
- **Chaining `ciir` after `publish` (or `update-gitops`).** Rejected: nothing about the CIIR analysis
  depends on the Docker image existing or the GitOps deploy having happened, so serializing it behind
  either would only add latency without a correctness reason. `needs: test` is the actual
  dependency — everything downstream of tests passing.
- **Folding this into the existing `test` job.** Rejected: `test` is also the gate `publish` needs;
  keeping `ciir` separate means a CIIR-specific failure (e.g. the indexer being briefly unreachable)
  shows up as its own red job rather than obscuring the actual test/build result, and the two run
  concurrently instead of serially.

## 6. Incident: v1.12.1's first live run

Tag `v1.12.1` was the first real exercise of this job. Three attempts on Forgejo run #168, job
`ciir` (fetched via `GET /api/v1/repos/sauron/code-rag-front/actions/tasks` and each attempt's
`.../actions/runs/168/jobs/2/attempt/<n>/logs`):

1. **Attempt 1:** failed fast with `error: --send requires --projectId <guid> (the id of a project
   already registered in the indexer)` — `CIIR_PROJECT_ID` wasn't configured yet at that point (the
   manual prerequisite from §4 hadn't landed). Confirms the `CIIR_BASE_URL`-only gate in §2 works as
   designed: `CIIR_BASE_URL` was already set (inherited or configured ahead of `CIIR_PROJECT_ID`),
   so the job took the `--send` branch and only then hit the CLI's own required-argument check.
2. **Attempts 2 and 3:** the CLI itself succeeded both times (`CIIR written to .../ciir-output (838
   records)`, `Sent to the indexer: uploadId=... status=pending`) — the manual prerequisites were in
   place by then. Both attempts were still reported as job failures, traced to the
   `actions/upload-artifact@v4` step that followed (see §2's "No artifact upload" note and the
   `docker-publish.yml` comment above the `ciir` job) — a self-hosted-runner tool-cache issue, not a
   bug in the analysis/send logic itself. Removed as the fix; not re-verified live as of this
   writing (would need a new tag).

No changes were made to Forgejo/Keycloak settings or the indexer to investigate this — read-only
log inspection via the Forgejo Actions API only.
