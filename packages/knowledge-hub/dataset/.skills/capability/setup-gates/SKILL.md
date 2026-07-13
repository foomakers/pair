---
name: setup-gates
description: "Configures CI/CD quality gates — pipeline config, shared lint/format packages, husky hooks — for the adopted tech stack. Invoke directly to set up or reconfigure gates; idempotent — confirms existing configuration rather than re-configuring."
version: 0.4.1
author: Foomakers
---

# /setup-gates — Quality Gate Configuration

Configure CI/CD quality gates for the project. Reads quality assurance guidelines and the adopted tech stack to produce appropriate pipeline configuration. Writes gate configuration to [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) and CI/CD pipeline files.

## Arguments

| Argument | Required | Description                                                                                 |
| -------- | -------- | ------------------------------------------------------------------------------------------- |
| `$scope` | No       | Limit to specific gate type: `pre-commit`, `ci`, `pre-production`, `all` (default: `all`)   |

## Composed Skills

| Skill              | Type       | Required                                                |
| ------------------ | ---------- | ------------------------------------------------------- |
| `/record-decision` | Capability | Yes — records gate configuration decision               |

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
   - [shared-config-packages.md](../../../.pair/knowledge/guidelines/code-design/quality-standards/shared-config-packages.md) — shared-config-package pattern, per-type overrides, `tools/*` reference implementation
2. **Act**: Read adopted tech stack:
   - [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) — languages, test framework, linter, formatter
   - [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) — existing process
3. **Verify**: Guidelines and stack loaded.

### Step 3: Propose Gate Configuration

1. **Act**: Based on the adopted tech stack and guidelines, propose gates per scope:

   **Pre-commit gates** (local developer machine):
   - Lint check (e.g., `eslint`, `biome`)
   - Type check (e.g., `tsc --noEmit`)
   - Formatting (e.g., `prettier --check`)

   **CI gates** (pipeline on push/PR):
   - All pre-commit gates
   - Test suite with coverage
   - Build verification
   - Custom gates from registry

   **Pre-production gates** (before deployment):
   - All CI gates
   - Security scan (if adopted)
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

3. **Verify**: Developer approves. If changes needed → adjust.

### Step 4: Write Configuration

1. **Act**: Update [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md):
   - Set quality gate command (e.g., `pnpm quality-gate`)
   - Write or update Custom Gate Registry table
2. **Act**: Generate CI/CD pipeline configuration appropriate for the adopted stack and hosting:
   - GitHub Actions → `.github/workflows/quality.yml`
   - GitLab → `.gitlab-ci.yml` quality stage
   - Other → document commands for manual pipeline setup
3. **Verify**: Configuration files written.

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

- **Existing conflicting config** (a workspace already has its own lint/format config file that would be replaced): ask before overwriting — "Found existing `[file]`. Replace with the shared config, keep it, or merge?" Never overwrite silently.
- **Non-JS project**: the shared-config-package mechanism (`extends`/`require`/package-manager fields) is JS/TS-specific. Degrade to documenting the pattern generically (see shared-config-packages.md § Non-JS / Polyglot Projects) and pointing to the ecosystem's equivalent config package; skip file generation.

### Step 6: Record Decision

1. **Act**: Compose `/record-decision`:
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
├── Pipeline:        [file path | manual]
├── Shared configs:  [package list | N/A — non-JS, documented pointer only]
├── Hooks:           [husky pre-commit + pre-push | override: <tool> | N/A]
├── Adoption:        [way-of-working.md — updated]
├── Record:          [ADL path — created]
└── Status:          [Complete | Confirmed existing | Updated]
```

## Composition Interface

When composed by `/bootstrap`:

- **Input**: `/bootstrap` invokes `/setup-gates` during project setup to establish initial quality gates.
- **Output**: Returns gate configuration summary. `/bootstrap` includes changes in the bootstrap commit.

When invoked **independently**:

- Full interactive flow. Developer reviews and approves gate configuration.

## Graceful Degradation

- If quality-assurance guidelines are not found, propose minimal gates based on detected package.json scripts (test, lint, build).
- If tech-stack.md is not found, ask developer for tooling choices to generate appropriate gate commands.
- If `/record-decision` is not installed, warn and skip decision recording.
- If no CI/CD platform is detectable, document gate commands for manual execution and skip pipeline file generation.
- If the project is not JS/TS, document the shared-config-package pattern generically (see [shared-config-packages.md](../../../.pair/knowledge/guidelines/code-design/quality-standards/shared-config-packages.md) § Non-JS / Polyglot Projects) and skip config-file generation — point to the ecosystem's equivalent shared config package.

## Notes

- This skill **modifies files** — it writes to way-of-working.md, creates/updates CI/CD pipeline configuration, and provisions shared lint/format config packages + hook manager files (`.husky/` by default).
- **Idempotent**: re-invocation on an already-configured project confirms the existing configuration, including provisioned shared configs and hooks; update only on explicit developer request. Conflicting local config → ask before overwriting, never silently.
- Gate commands must be executable in the project's development environment. Verify commands exist before writing.
- Custom Gate Registry format follows the table schema from [quality-gates.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-standards/quality-gates.md): Order, Gate, Command, Scope Key, Required, Description.
- **Hook manager default**: husky (decision D21/Q11). An override recorded in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) wins — this skill reads it before provisioning.
