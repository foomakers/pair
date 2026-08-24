---
name: pair-capability-setup-gates
description: "Configures CI/CD quality gates — pipeline config, shared lint/format packages, husky hooks, the required deterministic secret-scanning job (gitleaks by default, R6.5/D24), and the required pair-review + pair-explicit-approval branch-protection checks that make the review unskippable — for the adopted tech stack. Invoke directly to set up or reconfigure gates; idempotent — confirms existing configuration rather than re-configuring."
version: 0.7.0
author: Foomakers
---

# /pair-capability-setup-gates — Quality Gate Configuration

Configure CI/CD quality gates for the project. Reads quality assurance guidelines and the adopted tech stack to produce appropriate pipeline configuration. Writes gate configuration to [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) and CI/CD pipeline files.

**Which side these operations are on** (routing table: *PR labels/tags and required checks* ⇒ `code-host`): the pipeline files, shared configs and hooks are **repo** files and the required-check registration that gates a merge is a **code-host** operation — never the PM tool, even when the two are the same product. This skill never writes to the PM tool. Resolution and routing live in one place: [way-of-working / PM-tool + code-host resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md).

## Arguments

| Argument | Required | Description                                                                                 |
| -------- | -------- | ------------------------------------------------------------------------------------------- |
| `$scope` | No       | Limit to specific gate type: `pre-commit`, `ci`, `pre-production`, `all` (default: `all`)   |

## Composed Skills

| Skill              | Type       | Required                                                |
| ------------------ | ---------- | ------------------------------------------------------- |
| `/pair-capability-record-decision` | Capability | Yes — records gate configuration decision               |

## Algorithm

### Step 1: Check Existing Configuration

1. **Check**: Read [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) → look for Quality Gates section and Custom Gate Registry.
2. **Check**: Scan for existing CI/CD pipeline files (`.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, etc.).
3. **Check**: Scan for existing shared lint/format config packages (e.g. `tools/*-config`, `packages/*-config`) and hook manager setup (`.husky/`, `lefthook.yml`, `.git/hooks/` via `simple-git-hooks`, etc.).
4. **Branch**:
   - **Gates fully configured** (Quality Gates section + Custom Gate Registry + pipeline files + shared config/hooks exist) → present current config:

     > Quality gates already configured:
     > - Quality gate command: `[command]`
     > - Custom gates: [N gates listed]
     > - CI/CD pipeline: [file(s)]
     > - Shared config packages: [package list | none found]
     > - Hook manager: [husky | override | none found]
     >
     > Update configuration? (Only if developer explicitly requests.)

     If developer confirms → exit. If update requested → proceed to Step 2.

   - **Partially configured** → identify gaps and proceed to Step 2.
   - **Not configured** → proceed to Step 2.

### Step 2: Read Guidelines and Tech Stack

1. **Act**: Read quality assurance guidelines:
   - [quality-assurance.md](../../../.pair/knowledge/guidelines/technical-standards/git-workflow/quality-assurance.md) — gate types and checklists
   - [quality-gates.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-standards/quality-gates.md) — gate framework and registry format
   - [tier-aware-pipeline.md](../../../.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md) — the **opt-in** optimization that reduces checks per risk tier (tags only, fail-safe red); default is the full suite on every PR, tier-aware only when the project opts in. Also defines the **opt-in coverage guardrail** job (off by default) and its [config format](../../../.pair/knowledge/assets/coverage-config-example.md)
   - [quality-model.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) §4 — the single source of the tier→checks matrix the pipeline projects (never re-declared in generated config)
   - [shared-config-packages.md](../../../.pair/knowledge/guidelines/code-design/quality-standards/shared-config-packages.md) — shared-config-package pattern, per-type overrides, `tools/*` reference implementation
   - [secret-scanning.md](../../../.pair/knowledge/guidelines/quality-assurance/security/secret-scanning.md) — the deterministic, required-at-every-tier CI job this skill provisions (R6.5, D24) — never a skill, never an LLM judgment call
2. **Act**: Read adopted tech stack:
   - [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) — languages, test framework, linter, formatter
   - [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) — existing process
3. **Verify**: Every file listed in 1-2 above has been read — the adopted language, linter, and test framework are known before Step 3 proposes gate commands.

### Step 3: Propose Gate Configuration

1. **Act**: Based on the adopted tech stack and guidelines, propose gates per scope:

   **Pre-commit gates** (local developer machine):
   - Lint check (e.g., `eslint`, `biome`)
   - Type check (e.g., `tsc --noEmit`)
   - Formatting (e.g., `prettier --check`)

   **CI gates** (pipeline on push/PR) — **full check suite by default**:
   - **Full pipeline (default)** — every PR runs the **complete** suite: base (install + lint + type + build), unit, integration/E2E, and coverage. This is the safe default — no PR merges on partial verification, matching the pre-tiering behavior.
   - **Secret scanning** — required, unconditional on every PR (never tier-scoped): gitleaks by default, per [secret-scanning.md](../../../.pair/knowledge/guidelines/quality-assurance/security/secret-scanning.md) (R6.5, D24); a project overrides the scanner via `way-of-working.md`'s Custom Gate Registry, never by skipping the job
   - Custom gates from registry
   - **Optional — risk-tier-scoped checks (opt-in, off by default)**: a project may opt into *reducing* checks on lower-risk PRs (a 🟢 PR skips the heavier suites) per [tier-aware-pipeline.md](../../../.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md). This narrows coverage, so it is **not** generated unless the project explicitly opts in (see Step 3.3). When enabled, the pipeline reads the PR's `risk:*` tag only (no criteria — D18), schedules the [quality-model.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) §4 matrix (base every tier, unit from 🟡, integration/E2E from 🔴), treats **untagged / unknown / malformed ⇒ 🔴** (fail-safe), and fails explicitly on a required-but-missing suite. Secret-scan stays unconditional in either mode.

   **Pre-production gates** (before deployment):
   - All CI gates
   - Performance benchmarks (if applicable)

2. **Act**: Present the proposal:

   > **Quality Gate Proposal:**
   >
   > | Stage | Gate | Command | Required |
   > |-------|------|---------|----------|
   > | Pre-commit | Lint | `[command]` | Yes |
   > | ... | ... | ... | ... |
   >
   > Accept this configuration?

3. **Act — tiering opt-in** (per the [guided/quick setup convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/guided-quick-setup.md), default **No**): the CI pipeline mode is one input resolved like any other — full-suite (default) vs risk-tier-scoped (opt-in).
   - **Guided mode** (interactive/TTY) — ask **one** question, pre-filled with the default:

     > Enable risk-tier-scoped pre-merge checks? This runs *lighter* checks on lower-risk PRs (a 🟢 PR skips integration/E2E) instead of the full suite on every PR — faster, but with less verification on low-risk changes. **[default: No — run the full suite on every PR]**

     Default (Enter) ⇒ **No** (full pipeline). Only an explicit "Yes" opts in.
   - **Quick mode / non-interactive / CI** — take the default: **No** (full pipeline). Never prompt.
   - Record the resolved choice for Step 4: `TIERING = enabled | disabled` (default `disabled`).

4. **Act — coverage guardrail opt-in** (same [guided/quick convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/guided-quick-setup.md), default **No** — the twin of the tiering opt-in above): the coverage regression guardrail is off by default; a project opts in like any other input.
   - **Guided mode** (interactive/TTY) — ask **one** question, pre-filled with the default:

     > Enable the coverage guardrail? This adds a job that blocks a PR whose test coverage drops **below a committed baseline** (maintaining/improving passes — it is not an absolute wall). Off by default; the baseline is human-committed and bootstraps advisory-only on first run. **[default: No]**

     Default (Enter) ⇒ **No** (no coverage job). Only an explicit "Yes" opts in.
   - **Quick mode / non-interactive / CI** — take the default: **No**. Never prompt.
   - Record the resolved choice for Step 4: `COVERAGE_GUARDRAIL = enabled | disabled` (default `disabled`).

5. **Act — coverage commit-back opt-in, NESTED under the guardrail** (same [guided/quick convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/guided-quick-setup.md), default **No**): ask this **only when `COVERAGE_GUARDRAIL = enabled`**. The nesting is a rule, not a formality — ratcheting a baseline for a gate that does not run would raise a floor nothing checks — so for a guardrail that is off, do **not** ask: set `COMMIT_BACK = disabled` silently and move on.
   - **Guided mode** (interactive/TTY, and only with the guardrail on) — ask **one** question, pre-filled with the default:

     > Automate the baseline raise? On a push to your base branch, coverage above the committed baseline is proposed as a **bot pull request** (never a push to the base branch, never from a pull-request run). It only ever *raises* a baseline, and the **first** one stays your own commit. It needs a write credential you provision yourself — `COVERAGE_RATCHET_TOKEN`, a repo-scoped `contents: write` + `pull requests: write` with no protection bypass — and without it the step warns and your coverage verdict is unchanged. **[default: No]**

     Default (Enter) ⇒ **No** (no commit-back step). Only an explicit "Yes" opts in.
   - **Quick mode / non-interactive / CI** — take the default: **No**. Never prompt.
   - Record the resolved choice for Step 4: `COMMIT_BACK = enabled | disabled` (default `disabled`).

6. **Verify**: Developer approves gate configuration; the tiering choice (`disabled` unless opted in), the coverage-guardrail choice (`disabled` unless opted in) and — only if the guardrail is on — the commit-back choice (`disabled` unless opted in) are resolved. With the guardrail off, confirm the commit-back question was **never asked**.

### Step 4: Write Configuration

1. **Act**: Update [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md):
   - Set quality gate command (e.g., `pnpm quality-gate`)
   - Write or update Custom Gate Registry table
   - **Pre-merge tiering flag**: if `TIERING = enabled` (Step 3.3 opt-in), record `Pre-merge tiering: enabled` in the Quality Gates section. If `disabled` (the default), either omit the line or record `Pre-merge tiering: disabled` — both mean full-suite. Never write `enabled` without the explicit opt-in.
   - **Coverage guardrail flag**: if `COVERAGE_GUARDRAIL = enabled` (Step 3.4 opt-in), record `Coverage guardrail: enabled` in the Quality Gates section; if `disabled` (the default), either omit the line or record `Coverage guardrail: disabled`. Never write `enabled` without the explicit opt-in. **When enabled**, also create `tech/coverage-baseline.md` from the KB template ([coverage-config-example.md](../../../.pair/knowledge/assets/coverage-config-example.md)) with the per-type targets for the adopted stack and the baselines left unset (bootstrap-only until a human commits them — see that example's Persistence note). **Idempotent**: if the flag is already `enabled` and `tech/coverage-baseline.md` already exists, confirm rather than overwrite.
   - **Coverage baseline commit-back flag** (nested under the one above): if `COMMIT_BACK = enabled` (Step 3.5 opt-in), record `Coverage baseline commit-back: enabled` as a bullet **nested under** the `Coverage guardrail` bullet; if `disabled` (the default), either omit the line or record `Coverage baseline commit-back: disabled`. Never write `enabled` without the explicit opt-in, and never while `Coverage guardrail` is not `enabled`. The flag is read as a **declaring bullet**, so a line that merely quotes it in prose does not switch it on — record it as a bullet or not at all. When it is `enabled`, state to the developer, in the same breath, the credential they must provision (`COVERAGE_RATCHET_TOKEN`: `contents: write` + `pull requests: write`, no protection bypass) and what happens without it (the step warns naming the missing credential; the coverage gate's verdict is unchanged).
2. **Act**: Generate the **pre-merge pipeline** appropriate for the adopted stack and hosting. **Which pipeline depends on `TIERING`:**
   - GitHub Actions → `.github/workflows/quality.yml`
   - GitLab → `.gitlab-ci.yml` quality stage
   - Other → document commands for manual pipeline setup
   - **`TIERING = disabled` (default) → full-suite pipeline**: every PR runs base (install + lint + type + build) **and** unit **and** integration/E2E **and** coverage — all jobs unconditional, no tag resolution, no `risk:*` reads. This is the safe default; do **not** generate the tier-aware jobs.
   - **`TIERING = enabled` (opt-in) → tier-aware pipeline** following [tier-aware-pipeline.md](../../../.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md): the pipeline **reads the PR's `risk:*` tag only** (via [`tier-resolve.sh`](../../../.pair/knowledge/assets/tier-resolve.sh) — tags only, no classification criteria of its own, D18) and schedules the [quality-model.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) §4 matrix: base every tier, unit from 🟡, integration/E2E from 🔴; **untagged/unknown/malformed ⇒ 🔴** (fail-safe); a required suite missing at a tier ⇒ **explicit failure** (`require_suite`), never a silent pass. Do not copy any tier threshold into the generated config — it is a projection of the model, not a second source.
   - **Coverage job (opt-in)**: emit the `coverage` job from [tier-aware-pipeline.md](../../../.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md#coverage-guardrail-opt-in-regression-gate-consumed-by-this-pipeline) **only when `COVERAGE_GUARDRAIL = enabled`** (Step 3.4). It sources [`coverage-gate.sh`](../../../.pair/knowledge/assets/coverage-gate.sh) (config + a number only, no criteria — D18), reads `tech/coverage-baseline.md`, and blocks a regression below the committed baseline (maintain/improve passes; bootstrap-only when unset). With the flag absent (default) do **not** emit a coverage job in either pipeline mode.
   - **Coverage commit-back step (nested opt-in)**: emit the commit-back step from [tier-aware-pipeline.md](../../../.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md#coverage-guardrail-opt-in-regression-gate-consumed-by-this-pipeline) **only when `COMMIT_BACK = enabled`** (Step 3.5) — which, being nested, can only happen where a coverage job is emitted too. Take the step as that guideline writes it: it runs **after** the guardrail step in the same job, invokes the shipped `coverage-ratchet` CLI command **pinned to a CLI version** (never `@latest` in a pipeline — a release you have not read must not change what your CI runs), passes the coverage the job already measured, and binds `COVERAGE_RATCHET_TOKEN` to a base-branch push only, so a pull-request run never has the credential in its environment. It always exits 0: persistence is a side effect that may fail alone, never the gate's verdict. With `COMMIT_BACK` `disabled` or never asked (the default), emit **nothing** — the generated pipeline is byte-identical to one generated before this question existed.
   - **Wire required checks**: mark `base` and `secret-scan` as required status checks on the protected branch. In full-suite mode all suite jobs are required; in tier-aware mode the tier-scoped jobs are required-when-scheduled (or via one aggregating gate job). A red gate blocks merge either way. The coverage job (when enabled) is required-when-scheduled like the other tier-scoped jobs. The two **pair review** checks are wired in Step 4.5 — they are required in both pipeline modes and are not tier-scoped away.
   - **Post-merge staging** (on merge to the main branch): **build + deploy only, no gate re-run** — the gate already passed pre-merge (identical in both modes).
3. **Act**: Write the secret-scanning job — required, not an optional proposal line, in **both** pipeline modes: resolve the scanner (Argument > Adoption's Custom Gate Registry override > KB default gitleaks), then write the [CI Job Template](../../../.pair/knowledge/guidelines/quality-assurance/security/secret-scanning.md#ci-job-template-github-actions) into the same pipeline file as a `required` job, and provision a starting `.gitleaks.toml` at the project root (see the [allowlist mechanism](../../../.pair/knowledge/guidelines/quality-assurance/security/secret-scanning.md#allowlist-mechanism-adoption-controlled)) if one doesn't already exist. Never write the job with `continue-on-error` — fail-closed is not optional (R6.5).
4. **Verify**: Configuration files written, including the pre-merge pipeline (full-suite by default; tag-only tier-aware resolution + tier-scoped jobs only when `TIERING = enabled`) + required-check wiring, the post-merge staging (build+deploy only) config, the secret-scanning job, and `.gitleaks.toml`. If tiering is enabled, grep the generated pipeline for classification tokens (schema/diff/path heuristics) — there must be none (D18). If disabled, confirm no `risk:*` resolution was generated and every suite job runs unconditionally. If `COMMIT_BACK` is anything but `enabled`, grep the generated pipeline for `coverage-ratchet` and `COVERAGE_RATCHET_TOKEN` — there must be no match, and no credential in any step's environment.

### Step 4.5: Wire the Pair Review Required Checks + Branch Protection

The gate is only half the merge block. The judgment review must be **unskippable**, which means it is a required check like any mechanical one — see [pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md) for the state model and the two check contracts. This step is **host-agnostic**: the concrete API calls live in the code host's implementation guide (R2.12), e.g. [github-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md) § "PR state flow — required checks & branch protection".

1. **Check**: Does the protected branch already require `pair-review` and `pair-explicit-approval`? Read the current branch-protection configuration from the code host.
2. **Skip**: If both contexts are already required (and stale-review dismissal is on) → confirm and move to Step 5. Idempotent: never re-apply an identical protection payload.
3. **Act — prerequisites first (ordering is load-bearing)**: before writing any protection, (a) **provision the `pr-state:*` labels** from the host guide (they never auto-create; absence is non-blocking but the view is lost), (b) **write the `pair-explicit-approval` job** into the repository's workflows on the **target branch** — neither needs admin scope — and (c) **observe both contexts reporting on a real PR, twice**: at PR open, and again after a review submission (the approval-time re-evaluation), each time **on the PR's head commit** — that is the only commit the host's protection reads. Requiring a context that has never reported leaves **every** PR permanently unmergeable, and a context that reports only at PR open leaves a 🔴 PR blocked *after* the human approves; so protection is applied last, with the host's admin-bypass setting (`enforce_admins` on GitHub) enabled only after one PR has merged through the new rule.
4. **Act — required checks**: add both contexts to the protected branch's required status checks, alongside the gate jobs from Step 4:
   - **`pair-review`** — published by `/pair-process-review` on the head commit (pending at PR creation via `/pair-capability-publish-pr`). Required in **both** pipeline modes and at **every** tier: it is never tier-scoped away, exactly like `secret-scan`. A `pending`/absent check blocks the merge, so a review that never ran or crashed cannot yield a mergeable PR (R5.7).
   - **`pair-explicit-approval`** — verifies a **non-author human** approval on the current head when the tier requires it (🔴, and untagged ⇒ 🔴 fail-safe); auto-passes at 🟢/🟡 (D10). Generate its job from the host guide's template **unmodified in three respects**, because all three are authorization properties rather than style: it must run from a **trusted ref** (the target branch's version of the job and of any projection it sources — never the pull request's own tree, or the change under review could rewrite the check that authorizes it); its verdict must be **pinned to the PR head commit** on every re-evaluation (including the approval-triggered one), since that is the commit protection evaluates; and it must publish a **pending result as its first step**, so a cancelled or aborted re-evaluation leaves a merge-blocking context instead of a stale `success` from a lower tier. When registering it, **pin the context's producer** where the host allows it (on GitHub: the `checks[].app_id` form, not the legacy `contexts` array) — an unpinned status context can be satisfied by any principal with push access, including the reviewing agent, which would void the 🔴 gate. `pair-review` stays unpinned by construction (no app publishes it): it is an anti-accident control, not an authorization one — see the host guide's "What each context proves". It reads the `risk:*` label only — no classification criteria (D18). **Single-maintainer repositories**: the host rejects a self-approval, so 🔴 PRs cannot satisfy this context without a second human account — say so explicitly and offer to leave the context out of the required list (🔴 rule advisory, recorded) rather than making every 🔴 PR unmergeable.
   - Also state the **approval count** explicitly in the protection payload when the host has one (GitHub: `required_approving_review_count: 0`) — the tier-scoped job is the approval authority; an unstated default of ≥1 would demand a human approval on **every** PR, contradicting the 🟢 self-merge row of quality-model §4.
5. **Act — stale-approval invalidation**: enable the host's dismiss-stale-reviews equivalent so a force-push invalidates a previous human approval (pr-states.md edge case).
6. **Act — degraded mode**: if the host has **no required-check / branch-protection API**, or the token lacks permission, do **not** silently continue: report `Required checks: DEGRADED — enforcement advisory` and emit the host guide's **manual** setup steps (which contexts to require, where). Record the gap in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)'s Quality Gates section so it is visible until applied.
7. **Verify**: Both contexts are required on the protected branch (or the degradation is reported with manual instructions), the labels exist (or their absence is reported as non-blocking), the `pair-explicit-approval` job is committed to the repository, and stale approvals are dismissed on force-push. Grep the generated `pair-explicit-approval` job for classification tokens — there must be none (D18).

### Step 5: Provision Shared Lint/Format Config + Hooks

1. **Check**: For each config already detected in Step 1 that is not conflicting, skip provisioning it and note it as already present.
2. **Act**: Following [shared-config-packages.md](../../../.pair/knowledge/guidelines/code-design/quality-standards/shared-config-packages.md), provision one shared config package per lint/format concern the adopted tech stack uses (lint, format, types, and any project-specific linters). Split each into base + per-type presets (backend/frontend/shared-lib) only where the tool's rules actually diverge by runtime — pair's own `tools/*` is the reference implementation.
3. **Act**: Install the hook manager and wire the hooks:
   - **Check Step 1.3 first**: a hook manager already detected on disk is the de facto override — use it, record it in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) if not already recorded, and skip installing husky.
   - **Otherwise, husky is the KB default** (decision D21/Q11), unless [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) records a hook-manager override — then use that tool.
   - `.husky/pre-commit` (or equivalent) — fast local checks (lint and/or type-check).
   - `.husky/pre-push` (or equivalent) — pre-push lint (at minimum the adopted lint command; may be the full quality-gate command).
   - Wire the install step (e.g. `"prepare": "husky install"`) into the root `package.json`.
4. **Verify**: Run the adopted lint command — it passes out of the box. Confirm the hook files are executable and fire on a trial commit/push.

**Edge Cases:**

- **Existing conflicting config** (a workspace already has its own lint/format config file that would be replaced): always ask before overwriting — "Found existing `[file]`. Replace with the shared config, keep it, or merge?"
- **Non-JS project**: the shared-config-package mechanism (`extends`/`require`/package-manager fields) is JS/TS-specific. Degrade to documenting the pattern generically (see shared-config-packages.md § Non-JS / Polyglot Projects) and pointing to the ecosystem's equivalent config package; skip file generation.

### Step 6: Record Decision

1. **Act**: Compose `/pair-capability-record-decision`:
   - `$type: non-architectural`
   - `$topic: quality-gate-configuration`
   - `$summary: "Quality gates configured: [gate list]. Command: [command]. CI: [pipeline type]. Shared config packages: [list]. Hook manager: [husky | override]."`
2. **Verify**: Decision recorded.

## Output Format

```text
GATE CONFIGURATION COMPLETE:
├── Quality Command: [command]
├── Pre-commit:      [N gates configured]
├── CI:              [N gates configured]
├── Pre-production:  [N gates configured | N/A]
├── Pipeline:        [file path | manual — full-suite pre-merge (default: every PR runs all suites) OR tier-aware pre-merge (opt-in: tags only, fail-safe 🔴) + post-merge staging build+deploy]
├── Pre-merge tiering: [disabled (default — full suite every PR) | enabled (risk-tier-scoped, opt-in)]
├── Coverage guardrail: [disabled (default — no coverage job) | enabled (opt-in — coverage job + tech/coverage-baseline.md created)]
├── Coverage commit-back: [disabled (default — no step emitted) | not asked (guardrail off) | enabled (opt-in — step emitted; COVERAGE_RATCHET_TOKEN to provision)]
├── Required checks: [base + secret-scan required; full-suite: all suite jobs required | tier-aware: tier-scoped jobs required-when-scheduled]
├── Pair review:     [pair-review + pair-explicit-approval required on <branch> (stale approvals dismissed) | DEGRADED — enforcement advisory, manual setup steps emitted | already configured]
├── Secret Scan:     [gitleaks (KB default) | <override> — job + .gitleaks.toml written | already configured]
├── Shared configs:  [package list | N/A — non-JS, documented pointer only]
├── Hooks:           [husky pre-commit + pre-push | override: <tool> | N/A]
├── Adoption:        [way-of-working.md — updated]
├── Record:          [ADL path — created]
└── Status:          [Complete | Confirmed existing | Updated]
```

## Composition Interface

When composed by `/pair-process-bootstrap`:

- **Input**: `/pair-process-bootstrap` invokes `/pair-capability-setup-gates` during project setup to establish initial quality gates.
- **Output**: Returns gate configuration summary. `/pair-process-bootstrap` includes changes in the bootstrap commit.

When invoked **independently**:

- Full interactive flow. Developer reviews and approves gate configuration.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (guideline missing → propose minimal gates from what's detectable: detected package.json scripts — test, lint, build) and [record-decision contract](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/record-decision-contract.md) (`/pair-capability-record-decision` not installed → warn and skip decision recording) for the standard scenarios. Additional cases:

- If tech-stack.md is not found, ask developer for tooling choices to generate appropriate gate commands.
- If no CI/CD platform is detectable, document gate commands for manual execution and skip pipeline file generation.
- If the project is not JS/TS, document the shared-config-package pattern generically (see [shared-config-packages.md](../../../.pair/knowledge/guidelines/code-design/quality-standards/shared-config-packages.md) § Non-JS / Polyglot Projects) and skip config-file generation — point to the ecosystem's equivalent shared config package.

## Notes

- This skill **modifies files** — it writes to way-of-working.md, creates/updates CI/CD pipeline configuration (the pre-merge pipeline — full-suite by default, tier-aware only on opt-in — + post-merge staging + the required secret-scanning job and `.gitleaks.toml`), and provisions shared lint/format config packages + hook manager files (`.husky/` by default).
- **Full checks are the default; risk-tier reduction is opt-in** (ADL 2026-07-20): unless the project sets `Pre-merge tiering: enabled` in way-of-working.md (Step 3.3 opt-in), the generated pipeline runs the **full suite on every PR** — the safe, pre-tiering behavior. Tiering only *reduces* checks on lower-risk PRs, so it must be enabled explicitly.
- **Coverage guardrail is opt-in, off by default**: the `coverage` regression job and `tech/coverage-baseline.md` are generated **only** when the project sets `Coverage guardrail: enabled` (Step 3.4 opt-in) — the twin of the tiering opt-in. Absent the flag, no coverage job and no baseline file. The baseline is human-committed and the gate itself never persists it (a CI checkout is ephemeral): it suggests a value on stderr and passes. See [coverage-config-example.md](../../../.pair/knowledge/assets/coverage-config-example.md).
- **Automating the raise is a nested opt-in, and it is the one flag that must not be offered on its own** (Step 3.5): `Coverage baseline commit-back` is asked only where `Coverage guardrail` is `enabled`, recorded as a nested bullet, and emitted as a step only when it is on — a baseline ratcheted for a gate that never runs would raise a floor nothing checks. The emitted step invokes the shipped `coverage-ratchet` CLI command pinned to a version, so what a project's pipeline runs is the same implementation this corpus documents rather than a copy of it. It needs a credential **the adopter provisions** (`COVERAGE_RATCHET_TOKEN`: `contents: write` + `pull requests: write`, no protection bypass); without it the step warns and the coverage verdict is unchanged. Default stays `disabled` — this question makes enabling it work, it turns it on for nobody.
- **When tiering is enabled, the generated pipeline reads classification tags only, never classifies** (D18): tier criteria live in [quality-model.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) §3/§4; the pipeline is the deterministic Automation layer that projects the matrix from the PR's `risk:*` tag. Untagged ⇒ 🔴 (fail-safe). See [tier-aware-pipeline.md](../../../.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md).
- **The pair review is a required check, not a convention** (story #234): Step 4.5 wires `pair-review` + `pair-explicit-approval` on the protected branch so the judgment review is mechanically unskippable (R5.7) and 🔴 PRs need an explicit human approval (D10). The state model, the check contracts, and the degraded mode live in [pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md); host API specifics live in the host's implementation guide (R2.12). This skill wires the checks — it never renders a verdict and never computes a PR state.
- **Secret scanning is CI config, not a judgment call** (D24, anti-complexity): this skill provisions the job mechanically; it never evaluates whether a diff contains a secret itself — that is gitleaks' (or the adopted scanner's) job at runtime, with no LLM in the loop. `/pair-capability-assess-security` never re-implements this — see that skill's own Notes.
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). This skill's check: an already-configured project (incl. provisioned shared configs and hooks) is confirmed; update only on explicit developer request. Conflicting local config is always resolved by asking first (see Edge Cases above).
- Gate commands must be executable in the project's development environment. Verify commands exist before writing.
- Custom Gate Registry format follows the table schema from [quality-gates.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-standards/quality-gates.md): Order, Gate, Command, Scope Key, Required, Description.
- **Hook manager default**: husky (decision D21/Q11). An override recorded in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) wins — this skill reads it before provisioning.
