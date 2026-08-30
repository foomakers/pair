# Tier-Aware Pre-Merge Pipeline

## Opt-in optimization — the default is full checks on every PR

Tier-aware pre-merge checking is an **opt-in optimization, not the default**. By default `/pair-capability-setup-gates` generates a pipeline that runs the **full check suite on every PR** — base (install + lint + type + build), unit, integration/E2E, and coverage — plus the unconditional secret-scan. That full-suite pipeline is the safe, pre-tiering behavior: every PR earns the same, complete verification.

Tiering exists only to **reduce** the checks run on lower-risk PRs (a 🟢 PR skips the heavier suites), trading some verification for speed. Because it *narrows* coverage, it must be **enabled explicitly**: a project opts in by setting `Pre-merge tiering: enabled` in its [way-of-working.md](../../../../adoption/tech/way-of-working.md). Absent that flag (or set to `disabled`, the default), `/pair-capability-setup-gates` does **not** generate this pipeline — it generates the full-suite pipeline where every PR runs every suite. Everything below applies **only once tiering is enabled**.

When enabled, the pre-merge gate is **modulated by the risk tier**, and the tier is read from the PR's classification tags — nothing more. This document defines how `/pair-capability-setup-gates` generates that pipeline and the invariants it must preserve. It is the delivery-side companion to [quality-model.md](../../quality-assurance/quality-model.md), which owns the matrix; this file owns the wiring.

## The one rule: the pipeline reads tags, it does not classify

The pipeline is the **Automation** layer of the quality model's three-layer principle ([quality-model.md](../../quality-assurance/quality-model.md) §1): it consumes the `risk:*` tag deterministically and applies the tier→checks matrix. It contains **no classification criteria of its own** (D18) — it never inspects the diff, the code, file paths, or change size to decide a tier. Criteria live in exactly one place: the quality model (§3 dimensions, §3.2 tier = max). The tag is produced upstream by `/pair-capability-classify` (from that model) and propagated onto the PR by `/pair-capability-publish-pr`.

This is **grep-verifiable**: the generated pipeline and its [`tier-resolve.sh`](../../../assets/tier-resolve.sh) helper contain no diff/schema/path heuristics — only reads of the `risk:*` label. A reviewer (or a CI audit) can grep the generated config for classification tokens and find none.

## Tier → checks matrix (single source: quality model §4)

| Tier | Gate checks | Suites the pipeline schedules |
| --- | --- | --- |
| 🟢 green | lint + type + build | base |
| 🟡 yellow | + unit | base + unit |
| 🔴 red | + integration/E2E | base + unit + integration + e2e |

- **base = install + lint + type + build**, run at **every** tier (install is implicit in all three model rows; it is spelled out here because the pipeline must always run it).
- **Secret scanning** is required and **unconditional at every tier** — it is *not* in this matrix because it is not tier-scoped (see [Secret scanning](#secret-scanning-always-on-every-tier) below).
- The matrix above is a projection of [quality-model.md](../../quality-assurance/quality-model.md) §4; do not add or edit tier thresholds here — change them in the model.

## Fail-safe: untagged / unknown / malformed ⇒ 🔴

- A PR with **no** `risk:*` tag is treated as **red** — the widest matrix — never silently skipped (quality-model §3.2).
- An **unknown or malformed** `risk:*` value is treated as **red** and annotated with a warning on the PR.
- Tags are re-read at the **start of every run**. Because the tier can only be raised by re-classification (review never lowers, D17), a later run can only **widen** the matrix versus a previous run on the same PR — it never narrows.

## Tag → TIER resolution (provider-agnostic)

`/pair-capability-setup-gates` emits a first step that resolves the tag into a `TIER` value using the shipped, provider-agnostic helper [`tier-resolve.sh`](../../../assets/tier-resolve.sh). The helper reads the label list and echoes `green|yellow|red`, defaulting to `red`:

```bash
# labels come from the code host's PR API — TAGS ONLY, no diff inspection
PR_LABELS="$(gh pr view "$PR_NUMBER" --json labels -q '.labels[].name')"
source tier-resolve.sh
TIER="$(resolve_tier "$PR_LABELS")"   # green | yellow | red  (red = fail-safe default)
```

The same helper exposes `required_suites_for_tier <tier>` (the executable copy of the matrix) and `require_suite <name> <present:0|1>` (below).

### Missing required suite ⇒ explicit failure

If a tier requires a suite the repo does not provide (e.g. a 🔴 PR with no E2E suite), the gate **fails with an explicit "suite missing" error** — it must never silently pass. The generated pipeline calls `require_suite` for each required suite:

```bash
require_suite e2e "$(grep -q '"test:e2e"' package.json && echo 1 || echo 0)" || exit 1
```

## Pre-merge pipeline template (GitHub Actions)

`/pair-capability-setup-gates` writes a workflow equivalent to this. Adapt the job bodies to the adopted stack's commands; the **structure** (a tag-only `resolve-tier` job, tier-conditioned `if:` on unit/integration/e2e, an unconditional `secret-scan`) is the invariant.

Each suite job proves its suite exists via `require_suite`. All presence checks use one **layout-independent** idiom — `grep -q '"test:<suite>"' package.json` — rather than probing a fixed directory or config-file location, because unit tests are commonly co-located (`src/**/*.test.ts`) rather than under a top-level `test/` dir, and a layout probe would raise a spurious "suite missing" failure. Adapt the script names if the adopted stack names its suites differently.

```yaml
name: Pre-Merge Gate
on:
  pull_request:
    # `labeled`/`unlabeled` are REQUIRED (not defaults): a tier raised mid-review
    # (risk:yellow → risk:red) or any risk:* label added after the PR is opened
    # must re-run the gate so the matrix widens. Without them the gate keeps the
    # stale lower tier and a red PR could merge on a yellow-level run.
    types: [opened, synchronize, reopened, labeled, unlabeled]
    branches: [main]

jobs:
  resolve-tier:
    runs-on: ubuntu-latest
    outputs:
      tier: ${{ steps.tier.outputs.tier }}
    steps:
      - uses: actions/checkout@v4
      - id: tier
        env:
          PR_LABELS: ${{ join(github.event.pull_request.labels.*.name, ' ') }}
        run: |
          set -euo pipefail
          source .pair/knowledge/assets/tier-resolve.sh   # tags only, no criteria
          echo "tier=$(resolve_tier "$PR_LABELS")" >> "$GITHUB_OUTPUT"

  base: # install + lint + type + build — every tier
    # No `needs: resolve-tier` — base runs on every tier regardless of the
    # resolved value, so it must not serialize behind (or wait for) tier
    # resolution. Keeping it independent lets it start in parallel.
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      # Separate steps (not `&&`): each runs even if a prior one fails, so one
      # push surfaces lint + type + build feedback together instead of stopping
      # at the first failure.
      - run: pnpm lint
        if: ${{ !cancelled() }}
      - run: pnpm ts:check
        if: ${{ !cancelled() }}
      - run: pnpm build
        if: ${{ !cancelled() }}

  unit: # from 🟡
    needs: resolve-tier
    if: ${{ needs.resolve-tier.outputs.tier == 'yellow' || needs.resolve-tier.outputs.tier == 'red' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: |
          source .pair/knowledge/assets/tier-resolve.sh
          require_suite unit "$(grep -q '"test:unit"' package.json && echo 1 || echo 0)" || exit 1
          pnpm test:unit

  integration: # from 🔴
    needs: resolve-tier
    if: ${{ needs.resolve-tier.outputs.tier == 'red' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: |
          source .pair/knowledge/assets/tier-resolve.sh
          require_suite integration "$(grep -q '"test:integration"' package.json && echo 1 || echo 0)" || exit 1
          pnpm test:integration

  e2e: # from 🔴
    needs: resolve-tier
    if: ${{ needs.resolve-tier.outputs.tier == 'red' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: |
          source .pair/knowledge/assets/tier-resolve.sh
          require_suite e2e "$(grep -q '"test:e2e"' package.json && echo 1 || echo 0)" || exit 1
          pnpm test:e2e

  # coverage: OPT-IN — this job is emitted ONLY when the project sets
  # `Coverage guardrail: enabled` in way-of-working.md (default: absent — no job).
  # It is a further opt-in on top of tiering, exactly like tiering is an opt-in on
  # top of the full suite: absent the flag, `/setup-gates` does not generate it.
  coverage: # regression guardrail — runs from 🟡 (where the unit suite produces a report)
    needs: [resolve-tier, unit]
    if: ${{ needs.resolve-tier.outputs.tier == 'yellow' || needs.resolve-tier.outputs.tier == 'red' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:coverage # adopted tool emits a coverage report, e.g. coverage/coverage-summary.json
      - run: |
          source .pair/knowledge/assets/coverage-gate.sh   # reads adoption config + a number, no criteria
          CFG=.pair/adoption/tech/coverage-baseline.md      # committed by the adopter when the guardrail is enabled
          # Extract the measured % from whatever the adopted tool emitted. istanbul example.
          # `|| true` is REQUIRED, not defensive: Actions runs `run:` blocks under
          # `bash -e`, so with no report this assignment would inherit jq's non-zero
          # status and ABORT the step BEFORE `coverage_gate` is reached — making the
          # documented fail-safe below (block at red, warn at lower tiers on an
          # unmeasured report) unreachable, and blocking a yellow PR the corpus
          # promises only to warn on.
          COV="$(jq '.total.lines.pct' coverage/coverage-summary.json 2>/dev/null || true)"
          # TYPE is the touched code's type (backend|frontend|shared|…): a constant for a
          # single-type repo, or run one coverage_gate call per package report in a monorepo.
          # The tier is passed only to choose the fail-safe when no report was measured.
          coverage_gate "${{ needs.resolve-tier.outputs.tier }}" "${TYPE:-default}" "$COV" "$CFG" || exit 1
          # No write of any kind here, in any configuration: THIS pipeline is
          # `pull_request`-triggered, and the commit-back only ever writes on a
          # push to the base branch. It is a separate workflow — see
          # "Coverage baseline commit-back" below.

  # Deterministic secret scanning — REQUIRED, unconditional at EVERY tier.
  # No `if:` — a secret is a secret regardless of the change's risk tier.
  # See ../../quality-assurance/security/secret-scanning.md (R6.5, D24).
  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}
```

## Secret scanning: always on, every tier

The `secret-scan` job is required and unconditional — it carries no tier `if:`. It is the deterministic security layer provisioned by `/pair-capability-setup-gates`; the full job template, fail-closed requirement, and allowlist mechanism live in [secret-scanning.md](../../quality-assurance/security/secret-scanning.md) (R6.5, D24). This story does not re-implement it — it only guarantees the tier-aware pipeline keeps it unconditional.

## Coverage guardrail (opt-in regression gate consumed by this pipeline)

The coverage guardrail is **opt-in, off by default** — the twin of tiering itself. `/pair-capability-setup-gates` generates the `coverage` job **only** when the project sets `Coverage guardrail: enabled` in [way-of-working.md](../../../../adoption/tech/way-of-working.md); absent the flag (the default), no coverage job is emitted, in either the full-suite or the tier-aware pipeline. When enabled, coverage is guarded by a **regression gate that runs as a job inside this same pipeline** — not a second, parallel CI mechanism. It consumes the coverage report the test run already produced and the `resolve-tier` output, exactly like the other jobs; it introduces no independent orchestration and, like `tier-resolve.sh`, reads config + a number only — it carries **no classification criteria** (D18).

The `coverage` job (above) sources the shipped, provider-agnostic [`coverage-gate.sh`](../../../assets/coverage-gate.sh) helper and calls `coverage_gate <tier> <type> <measured-%> <config-file>`. Its policy:

- **Blocks a regression, not an absolute wall.** A PR whose coverage drops **below the committed baseline** fails the gate, at every tier (R7.3). A PR that **maintains or improves** coverage passes — the guardrail never demands a fixed X% be hit on every PR. Below the gradual *target* but still at/above the baseline only **warns**.
- **Baseline + per-type targets live in adoption**, in `tech/coverage-baseline.md` (created when the guardrail is enabled; configurable, with KB-sensible defaults) — see [coverage-config-example.md](../../../assets/coverage-config-example.md). The gate reads whatever coverage number the adopted test tooling produced; **no specific coverage tool is mandated** (istanbul `coverage-summary.json`, LCOV, Cobertura, … — the pipeline extracts the % and passes it in). Per-type targets (`backend`/`frontend`/`shared`/…) let the gate apply the threshold matching the touched code's type.
- **Baseline is human-committed; bootstrapping is advisory**. The guardrail is live only once a human commits a `baseline.<type>=NN` line to the config. With no committed baseline for a type — or a missing/corrupt one — the gate runs in **bootstrap-only mode**: it prints the current coverage as a suggested `baseline.<type>=NN` to **stderr** and **passes** without blocking. It does **not** persist the baseline itself: a CI checkout is ephemeral, so a written baseline would be discarded and coverage could drift down run after run with the guard never firing. A human copies the suggested line into the committed config to make the guardrail live. **Automated commit-back is a separate, nested opt-in** (`Coverage baseline commit-back: enabled` in the same way-of-working file; default `disabled`, so the gate stays advisory-only unless a project asks for it). When it is enabled, the raise is proposed **only by a push to the base branch** — never by a pull-request run, which is uniform for fork and same-repo PRs and never mutates a PR's head commit — and it lands as a **bot pull request** from a dedicated `chore/coverage-baseline-ratchet` branch rather than a push to the base branch, so it satisfies the branch protection a review-gated base branch requires instead of needing an exemption from it. It requires a **repo-scoped write credential** (`COVERAGE_RATCHET_TOKEN`: `contents: write` + `pull requests: write`, no protection bypass; the default CI token is unusable because a pull request it opens triggers no workflow run and so can never satisfy required checks). The ratchet is **monotonic** (a `baseline.<type>` value is only ever raised, edited in place) and **terminating** (a run whose head commit carries the `[coverage-baseline-ratchet]` marker is skipped, and the value written is `floor(measured) - 1pp`, so an unchanged coverage proposes what is already committed). A refused write — missing credential, protected branch, insufficient scope — degrades to a **warning naming the reason** and leaves the gate's verdict untouched: persistence and verdict are independent. **How it runs in your pipeline**: not as a step of the gate above — as its **own push-triggered workflow**, because only a base-branch push may write (see [Coverage baseline commit-back](#coverage-baseline-commit-back-nested-opt-in-its-own-post-merge-workflow-never-a-gate-job) below). It invokes the **shipped KB asset** `node .pair/knowledge/assets/coverage-ratchet.cjs` — the file `pair-cli install` put next to the gate script, generated from pair's own tested module (ADR-023); `/pair-capability-setup-gates` asks about this nested flag only once the guardrail is on, and emits the workflow only when you answer yes. **What is GitHub-Actions-specific**, stated rather than implied: the step reads `GITHUB_EVENT_NAME`/`GITHUB_REF_NAME` and opens the pull request with `gh`. The flags, the monotonic rule and the credential model carry over to another host; that pull-request call does not.
- **Fail-safe on no report**: if no coverage was measured (tooling emitted nothing, or the suite did not run), the gate **blocks at 🔴 red** and **warns at lower tiers** — never a silent pass, matching this pipeline's fail-safe stance.
- **Genuinely untestable surface** (generated files, config) is recorded via the `exclude` key in the config, but that key is **applied by the adopter to their own coverage tool's config** — the gate does **not** read it and this pipeline snippet does **not** pass it. It is documentation of the exclusion intent, not a gate-enforced override.

When enabled, the `coverage` job is scheduled from 🟡 (where the unit suite that produces the report runs), and 🟢 PRs skip it along with the unit suite; in a full-suite (tiering-off) pipeline with the guardrail enabled, the same job runs on every PR. With the flag absent (the default) there is no coverage job in either pipeline.

## Coverage baseline commit-back (nested opt-in): its own post-merge workflow, never a gate job

`/pair-capability-setup-gates` emits this workflow **only** when the project sets `Coverage baseline commit-back: enabled` **on top of** `Coverage guardrail: enabled` (both default `disabled` ⇒ no workflow at all).

**Why a separate workflow, and not a step in the `coverage` job.** The commit-back writes only on a **push to the base branch** — never from a pull-request run, which would mutate the head commit the required checks are pinned to. The pre-merge gate above is triggered by `pull_request` and nothing else, so a commit-back step placed inside it could never write: it would print `SKIPPED (not-base-push)` on every run and the token expression would evaluate empty — an opt-in that is on and does nothing, which is worse than one that is off. Adding `push:` to the gate instead is not an option either: that pipeline resolves its tier from the PR's `risk:*` label, and a push carries no PR, so every merge would fail-safe to 🔴 and re-run the full suite — while this guideline's post-merge rule is explicitly "no gate re-run". So the raise gets the only shape that both runs and gates nothing:

```yaml
name: Coverage Baseline Ratchet
on:
  push:
    branches: [<base-branch>]

# This workflow gates NOTHING: the merge already happened. It exists to PROPOSE a
# raised baseline as a bot pull request, and it is allowed to fail alone — never a
# required check, never referenced by branch protection.
jobs:
  ratchet:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      # It measures its OWN coverage: the gate's run happened on the pull request,
      # against a different tree, and its numbers are not available here.
      - run: pnpm test:coverage
      - id: measure
        run: |
          # ONE `<type>=<pct>` entry per TYPE the coverage config declares a
          # `baseline.<type>` for — the same per-type dimension the `coverage` gate
          # job passes to `coverage_gate`. A single-type repo has one entry and the
          # loop runs once; a monorepo with `baseline.backend` + `baseline.frontend`
          # needs BOTH, because a hardcoded `default=` would make the ratchet report
          # "no valid committed baseline.default" on every push and no per-type
          # baseline would ever rise.
          MEASURED=""
          for cov_type in backend frontend; do # the types YOUR config declares
            # Adapt the extraction and the report path to the adopted tool; this is
            # the istanbul example, one summary per package.
            #
            # `|| true` is REQUIRED, not defensive: Actions runs `run:` blocks under
            # `bash -e`, so with no report the assignment would inherit jq's non-zero
            # status and ABORT the step — making the warning below unreachable in the
            # most common state (a report path not adapted yet) and turning a workflow
            # that gates nothing red on every push.
            COV="$(jq '.total.lines.pct' "packages/$cov_type/coverage/coverage-summary.json" 2>/dev/null || true)"
            case "$COV" in
              '' | *[!0-9.]*)
                # Dropped, not guessed: the ratchet proposes nothing for a type it
                # has no usable number for, which is the conservative outcome.
                echo "::warning::no usable coverage for '$cov_type' — not proposed"
                ;;
              *) MEASURED="${MEASURED:+$MEASURED,}$cov_type=$COV" ;;
            esac
          done
          # GUARDED: anything reaching $GITHUB_ENV is an environment-injection sink,
          # and every value here has already passed the numeric case above.
          echo "PAIR_MEASURED=$MEASURED" >>"$GITHUB_ENV"
      - name: Coverage baseline commit-back (opt-in)
        # Nothing measured ⇒ nothing to propose. Skipped rather than invoked with an
        # empty list, which is a malformed invocation and exits non-zero by design —
        # a workflow that gates nothing must not go red on the base branch for a
        # non-event.
        if: env.PAIR_MEASURED != ''
        env:
          # Attacker-controlled text: read via env, never interpolated into the run script.
          PAIR_RATCHET_HEAD_COMMIT_MESSAGE: ${{ github.event.head_commit.message }}
          PAIR_RATCHET_BASE_BRANCH: <base-branch>
          # Least privilege in the EVENT dimension is STRUCTURAL here: this workflow
          # runs on a base-branch push and on nothing else, so a pull-request run
          # cannot reach the credential at all. The module's own `not-base-push`
          # skip stays as the braces to this belt.
          COVERAGE_RATCHET_TOKEN: ${{ secrets.COVERAGE_RATCHET_TOKEN }}
        # PIN the CLI version (never `@latest` in a pipeline): a release you have
        # not read must not change what your CI runs.
        run: |
          node .pair/knowledge/assets/coverage-ratchet.cjs \
            --config .pair/adoption/tech/coverage-baseline.md \
            --base-branch <base-branch> \
            --measured "$PAIR_MEASURED"
```

Three substitutions before this workflow is yours: `<base-branch>` (the same value `way-of-working.md` → `## Git Workflow` declares), the asset ships with your installed KB, so no version pin is needed — it is the file `pair-cli install` put at `.pair/knowledge/assets/`, and the **type list in the loop** — one entry per `baseline.<type>` in your coverage config, with the report path each of them is measured from. Leave a type out and its baseline simply never rises; invent one the config does not declare and the ratchet reports it and writes nothing. The step always exits 0 — a refused write is a warning naming the reason, and there is no verdict here for it to affect.

## Required-check wiring (what makes red block merge)

Scheduling the jobs is not enough; the code host must **require** them:

- Mark `base` and `secret-scan` as required status checks on the protected branch (`main`).
- Mark `unit`, `integration`, `e2e` as required **when scheduled**. On green/yellow PRs the higher-tier jobs are not scheduled, so a "required-when-present" convention (or a single aggregating gate job that `needs:` the scheduled set and reports one status) keeps branch protection satisfiable across tiers.
  - **GitHub note:** a job skipped via a job-level `if:` (as `unit`/`integration`/`e2e` are on lower tiers) reports its required check as **passing**, not pending — GitHub has treated skipped-via-`if:` required checks as successful since ~2021. So on GitHub you can mark all three required directly and lower-tier PRs stay mergeable without an aggregating job; the aggregating-gate pattern above is only needed on hosts that leave an unscheduled required check pending. (This template omits the aggregating job for that reason — add one only if your host needs it.)
- A failing required job (including a missing-suite failure or a secret finding) blocks merge until the gate is green — this is the gate acting before review (R5.4): review starts only at a green gate. (Refinement: a review may run earlier to report findings, but it can produce **no merge-enabling verdict** at a red gate — see [pr-states.md](../../collaboration/project-management-tool/pr-states.md).)
- **A label change must force gate re-evaluation before merge.** Because the tier is read from the `risk:*` label, the `pull_request` trigger includes `labeled`/`unlabeled` (above) so a tier raised mid-review re-runs the gate at the wider matrix. The latest run — not a stale earlier one — is what branch protection evaluates, so a PR can never merge on a gate that ran at a lower tier than its current label.

## Post-merge staging pipeline: build + deploy only

On merge to `main` the staging pipeline **does not re-run the gate** — the gate already passed pre-merge. It performs **build + deploy only**:

(The one other thing a merge may trigger is the coverage commit-back workflow above, when that nested opt-in is on. It is not a gate re-run and gates nothing: it measures coverage on the new base-branch tree and proposes a raised baseline as a bot pull request.)

```yaml
name: Staging
on:
  push:
    branches: [main]

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm deploy:staging
```

## Cross-references

- [quality-model.md](../../quality-assurance/quality-model.md) — §3.2 fail-safe, §4 tier→checks matrix (the single source of criteria).
- [secret-scanning.md](../../quality-assurance/security/secret-scanning.md) — the unconditional secret-scan job this pipeline embeds.
- [github-actions-implementation.md](github-actions-implementation.md) — general GitHub Actions patterns (build, deploy, caching) the templates above draw on.
- `/pair-capability-setup-gates` — generates this pipeline for the adopted stack and wires the required checks.
- [`tier-resolve.sh`](../../../assets/tier-resolve.sh) — the provider-agnostic, tags-only resolver.
- [`coverage-gate.sh`](../../../assets/coverage-gate.sh) + [coverage-config-example.md](../../../assets/coverage-config-example.md) — the provider-agnostic coverage baseline + regression guardrail and its adoption config format.
