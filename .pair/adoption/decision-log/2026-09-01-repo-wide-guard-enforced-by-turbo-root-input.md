# Decision: a repo-wide guard is enforced by a `$TURBO_ROOT$` cache input, not necessarily by a thin CLI + root gate step

## Date

2026-09-01

## Status

Active

## Category

Tooling Preference

## Context

Story #413 adds `format-workflow-composition` to `@pair/dev-tools`: a guard that reads
`.github/workflows/format.yml` and fails if that workflow ever declares `paths-ignore`, switches to
`pull_request_target`, drops the `push: main` trigger or the concurrency group, gains a secret, or
runs a write-mode formatter. Its input therefore lives **outside** the package that owns it.

`way-of-working.md` § Quality Gates states the rule this fits:

> **A guard whose only caller is a turbo task is not enforced.** `turbo ts:check test lint` are
> cacheable with package-scoped inputs, so a change OUTSIDE the guard's package replays a cached
> PASS and the guard never executes. A guard over repo-wide state therefore gets a thin CLI and a
> **root gate step** (`hygiene:check`, `smoke-modes:check`, `docs:staleness`, `skills:conformance`).

Read literally, #413 owes the repo a `format-workflow:check` CLI, a root script, an entry in
`quality-gate` and a step in `ci.yml` — four wiring points for one twenty-line workflow.

But the rule's **premise** ("cacheable with package-scoped inputs") stopped being universally true
in this repo. `turbo.json` already carries two entries — `@pair/knowledge-hub#test` and
`@pair/dev-tools#test` — that name repo-root paths as task `inputs` via `$TURBO_ROOT$` (turbo >=
2.1), precisely so a repo-wide artifact busts the cache of the package-local test that guards it.
`@pair/dev-tools#test` already lists `$TURBO_ROOT$/scripts/format-lib/**` for exactly this reason,
and `@pair/knowledge-hub#test` already lists `$TURBO_ROOT$/.github/workflows/**`.

The two adoption statements disagree about the mechanism, not the goal. The goal is: **the guard
must actually execute when the thing it guards changes.**

## Decision

**Enforcement mechanism is chosen per guard by what invalidates it, not by a blanket "repo-wide ⇒
CLI + root gate step" rule.** A guard over an artifact outside its package satisfies the rule when
its owning task declares that artifact as a `$TURBO_ROOT$` input — the cache can no longer serve a
stale PASS, which is the entire failure mode the CLI + root-step pattern was invented to avoid.

For #413 this means: no new root script, no new `quality-gate` segment and no new `ci.yml`
step. The guard is a vitest file, and `@pair/dev-tools#test` / `#test:coverage` gain **two**
inputs: `$TURBO_ROOT$/.github/workflows/format.yml` and `$TURBO_ROOT$/package.json`. (The
first version of this decision also said "no `format-workflow:check` CLI"; see the Amendment
below — a thin CLI now runs under the EXISTING `gate:composition` segment, without changing
the reasoning above.)

The second is not bookkeeping. Both guards in that folder resolve **script delegation** against the
root scripts — `checkThisRepoGate` parses `package.json` outright, and `checkFormatWorkflow` defaults
`rootScripts` to `readRootScripts()`, which is the only reason `pnpm format` in a workflow step
resolves to `prettier:fix` at all. MEASURED without it: `turbo run test --filter=@pair/dev-tools
--dry=json` hashed `7271baf2a672a276`, and rewriting the root `format:check` script to `pnpm
prettier:fix` — i.e. CI now WRITES — left the hash at `7271baf2a672a276`, a cached PASS with neither
guard running. With the entry the same mutation moves the hash and both guards fire.

Two facts make this sufficient rather than merely lighter:

1. **CI is cold on every run** — no remote cache, no `.turbo` restore in `ci.yml` — so `pnpm test`
   already executes the guard on every PR. The turbo input closes the **local** false green (which
   is also what the pre-push hook's `turbo test` sees), not a merge-gate hole. This is the same
   analysis already recorded in `turbo.json`'s `@pair/knowledge-hub#test` note.
2. **The guarded file cannot change without the input firing** — `format.yml` is named exactly, so
   there is no glob under- or over-reach to drift.

The CLI + root-gate-step pattern stays mandatory for the case that produced it: a guard whose input
set cannot be expressed as task inputs, or whose failure must be diagnosable as its own CI status
context rather than inside `pnpm test`.

## Amendment — 2026-09-02 (PR #477 review round 12)

Story #413's AC6 reads: check-only holds in CI "guarded by `pnpm gate:composition`". As decided
above, the new guard was enforced through `pnpm test` only and `gate:composition` ran the
pre-push guard alone, so the AC's named mechanism was not literally true. Resolved by wiring the
thin CLI this ADL had declined: `@pair/dev-tools format-workflow:check` (a `main()` behind a
`require.main` guard in the same module — the ADR-014 shape `pre-push-gate-composition` uses),
run by the existing root `gate:composition` script beside `pre-push-gate:check`. Cost: one line
in `packages/dev-tools/package.json`, one `&&` in the root `gate:composition` — no new root
script, no new `quality-gate` segment, no new `ci.yml` step, so the "four wiring points"
objection above does not apply. What the decision keeps: the `$TURBO_ROOT$` input is still
what makes `pnpm test` (and the pre-push hook's `turbo test`) honest locally — the CLI is a
second enforcement point, not a replacement, and the per-guard rule ("choose by what
invalidates it") stands; a guard may use both. Smoke-tested: `pnpm gate:composition` exits 0
on the shipped workflow and prints both guards' lines; with `with: ref: main` injected into
`format.yml`, `format-workflow:check` exits 1 naming the input.

## Alternatives Considered

- **Thin CLI + root script + `quality-gate` segment + dedicated `ci.yml` step** (the literal
  reading of the way-of-working rule): four wiring points, a fifth root script and a second CI step
  for a check already executed by `pnpm test` on a cold runner. It buys one real thing — a distinct
  status context — which #413 does not need: the workflow it guards already has its own `format`
  context, and a composition failure is a code failure, correctly reported by the test job.
- **Nothing at all — rely on `pnpm test` alone**: rejected. It is green in CI but stale locally, so
  the developer who reintroduces `paths-ignore` gets a cached PASS on the pre-push hook and only
  learns of it after pushing. That is the exact "guard that does not run" defect the way-of-working
  rule names.
- **Add `$TURBO_ROOT$/.github/workflows/**` (the whole directory)** instead of the one file:
  rejected as over-invalidation — every unrelated workflow edit would rerun the dev-tools suite,
  and `@pair/knowledge-hub#test` already covers the directory for the conformance suite that
  genuinely reads all of it.

## Consequences

- #413 ships two files plus two `turbo.json` input entries, plus (Amendment) one package script
  and one `&&` in the existing `gate:composition`, instead of four wiring points; the root
  `quality-gate` string and `ci.yml` are untouched by this story.
- A future guard in this repo must answer "what invalidates it?" before "does it need a CLI?" —
  the way-of-working bullet now names both mechanisms, so the choice is explicit rather than
  inferred from the older of two precedents.
- **Residual risk, accepted**: if CI ever gains a remote cache or a `.turbo` restore, the "CI is
  cold" leg of this reasoning disappears, and every guard relying on task inputs starts depending
  on those inputs being *correct* rather than merely helpful. The `$TURBO_ROOT$` entries are what
  would keep it honest — which is why the exact-file spelling matters.
- The two `@pair/dev-tools` entries (`#test` and `#test:coverage`) must keep identical input lists,
  the same hand-maintained duplication `turbo.json` already documents for the knowledge-hub pair.

## Adoption Impact

- `adoption/tech/way-of-working.md` § Quality Gates — the "A guard whose only caller is a turbo
  task is not enforced" bullet gains the `$TURBO_ROOT$`-input mechanism as the second way to
  satisfy it, and states when the CLI + root-gate-step form is still required.
- `turbo.json` — `@pair/dev-tools#test` and `@pair/dev-tools#test:coverage` declare
  `$TURBO_ROOT$/.github/workflows/format.yml` and `$TURBO_ROOT$/package.json` (the change itself,
  recorded here as the rationale). Trimming the `package.json` entry as "undocumented" reopens the
  measured stale-cache false green above, for BOTH guards in that folder.
