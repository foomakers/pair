---
name: pair-capability-setup-gates
description: "Configures CI/CD quality gates — pipeline config, shared lint/format packages, husky hooks, the required deterministic secret-scanning job (gitleaks by default, R6.5/D24) — for the adopted tech stack. Invoke directly to set up or reconfigure gates; idempotent — confirms existing configuration rather than re-configuring."
version: 0.5.0
author: Foomakers
---

# /pair-capability-setup-gates — Quality Gate Configuration

Configure CI/CD quality gates for the project. Reads quality assurance guidelines and the adopted tech stack to produce appropriate pipeline configuration. Writes gate configuration to [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) and CI/CD pipeline files.

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
   - [tier-aware-pipeline.md](../../../.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md) — the **opt-in** optimization that reduces checks per risk tier (tags only, fail-safe red); default is the full suite on every PR, tier-aware only when the project opts in
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

4. **Verify**: Developer approves gate configuration and the tiering choice is resolved (`disabled` unless explicitly opted in).

### Step 4: Write Configuration

1. **Act**: Update [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md):
   - Set quality gate command (e.g., `pnpm quality-gate`)
   - Write or update Custom Gate Registry table
   - **Pre-merge tiering flag**: if `TIERING = enabled` (Step 3.3 opt-in), record `Pre-merge tiering: enabled` in the Quality Gates section. If `disabled` (the default), either omit the line or record `Pre-merge tiering: disabled` — both mean full-suite. Never write `enabled` without the explicit opt-in.
2. **Act**: Generate the **pre-merge pipeline** appropriate for the adopted stack and hosting. **Which pipeline depends on `TIERING`:**
   - GitHub Actions → `.github/workflows/quality.yml`
   - GitLab → `.gitlab-ci.yml` quality stage
   - Other → document commands for manual pipeline setup
   - **`TIERING = disabled` (default) → full-suite pipeline**: every PR runs base (install + lint + type + build) **and** unit **and** integration/E2E **and** coverage — all jobs unconditional, no tag resolution, no `risk:*` reads. This is the safe default; do **not** generate the tier-aware jobs.
   - **`TIERING = enabled` (opt-in) → tier-aware pipeline** following [tier-aware-pipeline.md](../../../.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md): the pipeline **reads the PR's `risk:*` tag only** (via [`tier-resolve.sh`](../../../.pair/knowledge/assets/tier-resolve.sh) — tags only, no classification criteria of its own, D18) and schedules the [quality-model.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) §4 matrix: base every tier, unit from 🟡, integration/E2E from 🔴; **untagged/unknown/malformed ⇒ 🔴** (fail-safe); a required suite missing at a tier ⇒ **explicit failure** (`require_suite`), never a silent pass. Do not copy any tier threshold into the generated config — it is a projection of the model, not a second source.
   - **Wire required checks**: mark `base` and `secret-scan` as required status checks on the protected branch. In full-suite mode all suite jobs are required; in tier-aware mode the tier-scoped jobs are required-when-scheduled (or via one aggregating gate job). A red gate blocks merge either way.
   - **Post-merge staging** (on merge to the main branch): **build + deploy only, no gate re-run** — the gate already passed pre-merge (identical in both modes).
3. **Act**: Write the secret-scanning job — required, not an optional proposal line, in **both** pipeline modes: resolve the scanner (Argument > Adoption's Custom Gate Registry override > KB default gitleaks), then write the [CI Job Template](../../../.pair/knowledge/guidelines/quality-assurance/security/secret-scanning.md#ci-job-template-github-actions) into the same pipeline file as a `required` job, and provision a starting `.gitleaks.toml` at the project root (see the [allowlist mechanism](../../../.pair/knowledge/guidelines/quality-assurance/security/secret-scanning.md#allowlist-mechanism-adoption-controlled)) if one doesn't already exist. Never write the job with `continue-on-error` — fail-closed is not optional (R6.5).
4. **Verify**: Configuration files written, including the pre-merge pipeline (full-suite by default; tag-only tier-aware resolution + tier-scoped jobs only when `TIERING = enabled`) + required-check wiring, the post-merge staging (build+deploy only) config, the secret-scanning job, and `.gitleaks.toml`. If tiering is enabled, grep the generated pipeline for classification tokens (schema/diff/path heuristics) — there must be none (D18). If disabled, confirm no `risk:*` resolution was generated and every suite job runs unconditionally.

### Step 5: Provision Shared Lint/Format Config + Hooks

1. **Check**: For each config already detected in Step 1 that is not conflicting, skip provisioning it and note it as already present.
2. **Act**: Following [shared-config-packages.md](../../../.pair/knowledge/guidelines/code-design/quality-standards/shared-config-packages.md), provision one shared config package per lint/format concern the adopted tech stack uses (lint, format, types, and any project-specific linters). Split each into base + per-type presets (backend/frontend/shared-lib) only where the tool's rules actually diverge by runtime — pair's own `tools/*` is the reference implementation.
3. **Act**: Install the hook manager and wire the hooks:
   - **Check Step 1.3 first**: a hook manager already detected on disk is the de facto override — use it, record it in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) if not already recorded, and skip installing husky.
   - **Otherwise, husky is the KB default** (decision D21/Q11), unless [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) records a hook-manager override — then use that tool.
   - `.husky/pre-commit` (or equivalent) — fast local checks (lint and/or type-check).
   - `.husky/pre-push` (or equivalent) — pre-push lint (at minimum the adopted lint command; may be the full quality-gate command).
   - Wire the install step (e.g. `"prepare": "husky install"`) into the root `package.json`.
4. **Verify**: Run the adopted lint command — it passes out of the box (AC3). Confirm the hook files are executable and fire on a trial commit/push.

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
├── Required checks: [base + secret-scan required; full-suite: all suite jobs required | tier-aware: tier-scoped jobs required-when-scheduled]
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
- **When tiering is enabled, the generated pipeline reads classification tags only, never classifies** (D18): tier criteria live in [quality-model.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) §3/§4; the pipeline is the deterministic Automation layer that projects the matrix from the PR's `risk:*` tag. Untagged ⇒ 🔴 (fail-safe). See [tier-aware-pipeline.md](../../../.pair/knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md).
- **Secret scanning is CI config, not a judgment call** (D24, anti-complexity): this skill provisions the job mechanically; it never evaluates whether a diff contains a secret itself — that is gitleaks' (or the adopted scanner's) job at runtime, with no LLM in the loop. `/pair-capability-assess-security` never re-implements this — see that skill's own Notes.
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). This skill's check: an already-configured project (incl. provisioned shared configs and hooks) is confirmed; update only on explicit developer request. Conflicting local config is always resolved by asking first (see Edge Cases above).
- Gate commands must be executable in the project's development environment. Verify commands exist before writing.
- Custom Gate Registry format follows the table schema from [quality-gates.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-standards/quality-gates.md): Order, Gate, Command, Scope Key, Required, Description.
- **Hook manager default**: husky (decision D21/Q11). An override recorded in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) wins — this skill reads it before provisioning.
