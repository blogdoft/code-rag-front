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
- **Artifact:** `ciir-output/` (the JSONL, manifest, analysis report) is uploaded via
  `actions/upload-artifact@v4` with `if: always()` / `if-no-files-found: ignore`, so a failed or
  skipped-send run still leaves something to inspect.

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
