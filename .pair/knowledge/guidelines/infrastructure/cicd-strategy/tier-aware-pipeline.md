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
          # Extract the measured % from whatever the adopted tool emitted. istanbul example:
          COV="$(jq '.total.lines.pct' coverage/coverage-summary.json 2>/dev/null)"
          # TYPE is the touched code's type (backend|frontend|shared|…): a constant for a
          # single-type repo, or run one coverage_gate call per package report in a monorepo.
          # The tier is passed only to choose the fail-safe when no report was measured.
          coverage_gate "${{ needs.resolve-tier.outputs.tier }}" "${TYPE:-default}" "$COV" "$CFG" || exit 1

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

The coverage guardrail is **opt-in, off by default** — the twin of tiering itself. `/pair-capability-setup-gates` generates the `coverage` job **only** when the project sets `Coverage guardrail: enabled` in [way-of-working.md](../../../../adoption/tech/way-of-working.md); absent the flag (the default), no coverage job is emitted, in either the full-suite or the tier-aware pipeline. When enabled, coverage is guarded by a **regression gate that runs as a job inside this same pipeline** — not a second, parallel CI mechanism (AC3). It consumes the coverage report the test run already produced and the `resolve-tier` output, exactly like the other jobs; it introduces no independent orchestration and, like `tier-resolve.sh`, reads config + a number only — it carries **no classification criteria** (D18).

The `coverage` job (above) sources the shipped, provider-agnostic [`coverage-gate.sh`](../../../assets/coverage-gate.sh) helper and calls `coverage_gate <tier> <type> <measured-%> <config-file>`. Its policy:

- **Blocks a regression, not an absolute wall.** A PR whose coverage drops **below the committed baseline** fails the gate, at every tier (R7.3, epic AC3). A PR that **maintains or improves** coverage passes — the guardrail never demands a fixed X% be hit on every PR. Below the gradual *target* but still at/above the baseline only **warns**.
- **Baseline + per-type targets live in adoption**, in `tech/coverage-baseline.md` (created when the guardrail is enabled; configurable, with KB-sensible defaults) — see [coverage-config-example.md](../../../assets/coverage-config-example.md). The gate reads whatever coverage number the adopted test tooling produced; **no specific coverage tool is mandated** (istanbul `coverage-summary.json`, LCOV, Cobertura, … — the pipeline extracts the % and passes it in). Per-type targets (`backend`/`frontend`/`shared`/…) let the gate apply the threshold matching the touched code's type (AC5).
- **Baseline is human-committed; bootstrapping is advisory** (AC4). The guardrail is live only once a human commits a `baseline.<type>=NN` line to the config. With no committed baseline for a type — or a missing/corrupt one — the gate runs in **bootstrap-only mode**: it prints the current coverage as a suggested `baseline.<type>=NN` to **stderr** and **passes** without blocking. It does **not** persist the baseline itself: a CI checkout is ephemeral, so a written baseline would be discarded and coverage could drift down run after run with the guard never firing. A human copies the suggested line into the committed config to make the guardrail live. Automated commit-back of a bootstrapped baseline is provider-specific and tracked separately — see story #372.
- **Fail-safe on no report**: if no coverage was measured (tooling emitted nothing, or the suite did not run), the gate **blocks at 🔴 red** and **warns at lower tiers** — never a silent pass, matching this pipeline's fail-safe stance.
- **Genuinely untestable surface** (generated files, config) is recorded via the `exclude` key in the config, but that key is **applied by the adopter to their own coverage tool's config** — the gate does **not** read it and this pipeline snippet does **not** pass it. It is documentation of the exclusion intent, not a gate-enforced override.

When enabled, the `coverage` job is scheduled from 🟡 (where the unit suite that produces the report runs), and 🟢 PRs skip it along with the unit suite; in a full-suite (tiering-off) pipeline with the guardrail enabled, the same job runs on every PR. With the flag absent (the default) there is no coverage job in either pipeline.

## Required-check wiring (what makes red block merge)

Scheduling the jobs is not enough; the code host must **require** them:

- Mark `base` and `secret-scan` as required status checks on the protected branch (`main`).
- Mark `unit`, `integration`, `e2e` as required **when scheduled**. On green/yellow PRs the higher-tier jobs are not scheduled, so a "required-when-present" convention (or a single aggregating gate job that `needs:` the scheduled set and reports one status) keeps branch protection satisfiable across tiers.
  - **GitHub note:** a job skipped via a job-level `if:` (as `unit`/`integration`/`e2e` are on lower tiers) reports its required check as **passing**, not pending — GitHub has treated skipped-via-`if:` required checks as successful since ~2021. So on GitHub you can mark all three required directly and lower-tier PRs stay mergeable without an aggregating job; the aggregating-gate pattern above is only needed on hosts that leave an unscheduled required check pending. (This template omits the aggregating job for that reason — add one only if your host needs it.)
- A failing required job (including a missing-suite failure or a secret finding) blocks merge until the gate is green — this is the gate acting before review (R5.4): review starts only at a green gate.
- **A label change must force gate re-evaluation before merge.** Because the tier is read from the `risk:*` label, the `pull_request` trigger includes `labeled`/`unlabeled` (above) so a tier raised mid-review re-runs the gate at the wider matrix. The latest run — not a stale earlier one — is what branch protection evaluates, so a PR can never merge on a gate that ran at a lower tier than its current label.

## Post-merge staging pipeline: build + deploy only

On merge to `main` the staging pipeline **does not re-run the gate** — the gate already passed pre-merge. It performs **build + deploy only** (AC6):

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
