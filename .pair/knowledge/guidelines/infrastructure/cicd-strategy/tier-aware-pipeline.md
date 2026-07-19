# Tier-Aware Pre-Merge Pipeline

The pre-merge quality gate is **modulated by the risk tier**, and the tier is read from the PR's classification tags — nothing more. This document defines how `/pair-capability-setup-gates` generates that pipeline and the invariants it must preserve. It is the delivery-side companion to [quality-model.md](../../quality-assurance/quality-model.md), which owns the matrix; this file owns the wiring.

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
