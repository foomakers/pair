# Agent Skills Guide

## Overview

Agent Skills are structured, composable instructions that AI coding agents follow to perform development tasks. They follow the [Agent Skills](https://agentskills.io) open standard, supported by Claude Code, Cursor, VS Code Copilot, and OpenAI Codex.

Skills provide idempotency, composability, and graceful degradation.

## Quick Start

Run `/next` at the start of every session. It reads project adoption files and PM tool state, then recommends the most relevant skill to invoke.

## Skill Types

| Type | Count | Purpose |
|------|-------|---------|
| **Process** | 10 | Lifecycle phases — orchestrate capability skills |
| **Capability** | 30 | Atomic units — perform a single focused operation |

Process skills compose capability skills. Capability skills are independently invocable. Total: 41 (10 process + 30 capability + 1 navigator).

## Full Catalog

### Process Skills (10)

| Skill | How-To | Phase | Description |
|-------|--------|-------|-------------|
| `/brainstorm` | — | Discovery | Structured discovery (interview → domain → tree) into a Draft backlog tree |
| `/specify-prd` | 01 | Induction | Create/update PRD |
| `/bootstrap` | 02 | Induction | Full project setup |
| `/plan-initiatives` | 03 | Strategic | Create and prioritize initiatives |
| `/plan-epics` | 06 | Strategic | Break initiatives into epics |
| `/plan-stories` | 07 | Iteration | Break epics into user stories |
| `/refine-story` | 08 | Iteration | Refine stories with AC + technical analysis |
| `/plan-tasks` | 09 | Iteration | Break stories into tasks |
| `/implement` | 10 | Execution | Implement tasks with TDD |
| `/review` | 11 | Review | Code review with merge flow |

> `/brainstorm` carries no numbered how-to guide (`—` above): it is a discovery entry point that runs *before* guide 01, and its `SKILL.md` is the canonical reference for its three phases.
>
> How-to guides 04 and 05 (subdomain/bounded-context definition) were removed — domain modeling is referenced inline by each real caller's own how-to (02, 03, 06, 09; 08 planned — #242). See [Domain Modeling Skills](#domain-modeling-skills-2) below and [Migration Notes](#migration-notes).

### Capability Skills (30)

#### Domain Modeling Skills (2)

| Skill | Scope |
|-------|-------|
| `/map-subdomains` | DDD subdomain placement (core/supporting/generic + Volatility), scoped to caller's touched items |
| `/map-contexts` | DDD bounded-context placement + per-relationship strength/distance/volatility assessment, scoped to caller's touched items |

Reclassified from process to capability (D24) — see [Callers Matrix](#callers-matrix-scoped-capabilities) and [Migration Notes](#migration-notes).

#### Assessment Skills (11)

| Skill | Scope |
|-------|-------|
| `/assess-stack` | Tech stack evaluation + dependency validation |
| `/assess-architecture` | Architecture pattern selection |
| `/assess-methodology` | Development methodology selection |
| `/assess-pm` | PM tool selection |
| `/assess-testing` | Testing strategy evaluation |
| `/assess-infrastructure` | Infrastructure strategy evaluation |
| `/assess-observability` | Observability strategy evaluation |
| `/assess-ai` | AI development tools evaluation |
| `/assess-security` | Security posture — review verdict (`$mode: review`, composed by `/review`) + one-shot OWASP Top 10 audit (`$mode: audit`). Unlike the 8 above, not purely output-only — writes its own audit report (D14 exception); never scans for secrets, that's the deterministic CI layer `/setup-gates` provisions (D24) |
| `/assess-cost` | Cost exposure — chromatic class (`cost:green\|yellow\|orange\|red`) from the diff/story against the [cost-signal catalog](guidelines/quality-assurance/cost-assessment.md) (general + AWS-first, other providers via adoption links). `$mode: classify` is output-only: feeds `/classify`'s cost dimension, writes nothing, blocks nothing. `$mode: report` monitors a period's merged PRs (refinement-time predicted class vs. real signals, drift flagged, deploy-match when telemetry exists) and writes one period-keyed panel under `.pair/working/reports/cost/` per the [report-panel convention](guidelines/collaboration/working-area.md) |
| `/assess-coupling` | Coupling balance — three-dimensional model (integration strength × socio-technical distance × volatility + balance rule) from the [coupling-balance guideline](guidelines/architecture/design-patterns/coupling-balance.md). `$scope: diff` feeds the review Architecture verdict (never blocks); `$scope: full` audits the codebase, flags only unbalanced+volatile integrations, writes a report and hands findings to `/write-issue` for tech-debt. Reads real integration points, never structure alone |

#### Classification Skills (1)

Applies the [quality model](guidelines/quality-assurance/quality-model.md) (owns no criteria) to produce the objective classification matrix consumed downstream.

| Skill | Scope |
|-------|-------|
| `/classify` | Risk/cost matrix from the quality model (KB default + `tech/risk-matrix.md` delta) — story context in refinement, diff in review (confirm-or-raise, never lower); adoption-gated chromatic tag projection. Composed by `/refine-story` and `/review` |

#### Analysis Skills (2)

Analyze + **report only** — never block, propose no adoption decision (verb: `analyze-*`, distinct from `assess-*`).

| Skill | Scope |
|-------|-------|
| `/analyze-debt` | Technical debt detection + prioritization (report-only) |
| `/analyze-code-quality` | Code quality metrics — complexity, size, coverage, maintainability (report-only) |

#### Verification Skills (3)

| Skill | Scope |
|-------|-------|
| `/verify-quality` | Quality gate checking |
| `/verify-done` | Definition of Done checking |
| `/verify-adoption` | Adoption compliance checking |

#### Operational Skills (6)

| Skill | Scope |
|-------|-------|
| `/record-decision` | ADR/ADL creation + adoption update |
| `/write-issue` | PM tool issue creation/update |
| `/estimate` | Story estimation |
| `/setup-gates` | CI/CD quality gate configuration |
| `/setup-pm` | PM tool configuration |
| `/manage-flags` | Feature flag lifecycle management |

#### Testing Skills (2)

| Skill | Scope |
|-------|-------|
| `/design-manual-tests` | Manual test suite generation from project analysis |
| `/execute-manual-tests` | Manual test suite execution + report generation |

#### State and Handoff Skills (1)

| Skill | Scope |
|-------|-------|
| `/checkpoint` | Write/resume story progress checkpoint (work survives context resets) |

#### Delivery Skills (1)

| Skill | Scope |
|-------|-------|
| `/publish-pr` | Publish a story branch as a PR: gate, PR from template (conditional sections), tag copy, ready-for-review, board state |

#### Discovery Skills (1)

| Skill | Scope |
|-------|-------|
| `/grill` | Reusable interview engine (interview / sync modes), write-free |

## Directory Structure

```text
.skills/
├── process/              # Lifecycle phase skills
│   ├── brainstorm/       # 3-phase structured discovery
│   ├── specify-prd/
│   ├── bootstrap/
│   ├── plan-initiatives/
│   ├── plan-epics/
│   ├── plan-stories/
│   ├── refine-story/
│   ├── plan-tasks/
│   ├── implement/
│   └── review/
├── capability/           # Atomic operation skills
│   ├── map-subdomains/   # scoped DDD subdomain placement
│   ├── map-contexts/     # scoped DDD bounded-context placement
│   ├── classify/         # quality-model classification matrix + tag projection
│   ├── assess-*/         # 8 assessment skills
│   ├── verify-*/         # 3 verification skills
│   ├── design-manual-tests/
│   ├── execute-manual-tests/
│   ├── record-decision/
│   ├── write-issue/
│   ├── estimate/
│   ├── setup-gates/
│   ├── setup-pm/
│   ├── analyze-debt/          # report-only
│   ├── analyze-code-quality/  # report-only
│   ├── checkpoint/
│   ├── publish-pr/
│   ├── manage-flags/
│   └── grill/
└── next/                 # Navigator skill
    └── SKILL.md
```

Each skill directory contains a `SKILL.md` file with YAML frontmatter (`name` + `description`) and a structured algorithm using the **check → skip → act → verify** pattern.

## Composition Pattern

Process skills compose capability skills with optional graceful degradation:

```text
/pair-process-implement
├── /pair-capability-verify-quality       (required)
├── /pair-capability-record-decision      (required)
├── /pair-capability-assess-stack          (optional — warns if missing)
└── /pair-capability-verify-adoption       (optional — warns if missing)
```

Optional skills degrade gracefully: if not installed, the process skill warns and continues without blocking.

## Authoring Standard

Every skill is held to an effectiveness standard, not just structural conformance. The goal is repeatable execution — the executor follows the same steps each time, whatever the run produces. Nine principles, each with its check (full standard, with illustrative examples, and review checklist: website contributing guide "Writing Skills"; recorded as ADR-010):

1. **Description = trigger** — the description names the skill's purpose and enumerates its distinct trigger branches; two clauses covering the same branch in different words still collapse into one branch, so merge them; mostly-composed capabilities carry a lean reach clause (e.g. "Composed by `/refine-story`; invoke directly when …") instead of a trigger list; algorithm detail stays in the body. *Check: every clause maps to a distinct branch; nothing that only matters after loading.*
2. **Information hierarchy** — steps first, in-file reference second, branch-specific reference pushed to a sibling file pulled in through a context pointer (its phrasing, not its target, is what makes it fire reliably); keep inline what every run passes through, move out what only a subset of runs reach. *Check: "does every run need this before acting?" decides the rung.*
3. **Completion criteria** — every Verify beat leaves no room for a judgment call (from observable state alone, the step either happened or it didn't) and is exhaustive where thoroughness matters; a criterion loose enough to pass by default invites premature completion. *Check: two executors couldn't disagree on whether it's satisfied.*
4. **Pruning** — one home per meaning (shared conventions live once; skills keep deltas); every line passes a relevance test; every sentence passes a no-op check (strip it out — would the model act differently without it? cut failing sentences outright); prune on every edit before sediment settles. *Check: the meaning you're adding doesn't already live elsewhere.*
5. **Leading words** — compact pretrained concepts repeated as tokens (*idempotent*, *scope*, *gate*, *halt*) anchor behavior in the body and invocation in the description at minimal token cost. *Check: prose restating one idea across sentences collapses into one strong word.*
6. **Positive phrasing** — state what the executor should do; spelling out the banned behavior instead just pulls it into view. A prohibition belongs only where no positive phrasing closes the same gap, and even then the positive instruction sits right beside it. *Check: rewrite each "never" as a positive instruction; keep the negation only where that rewrite fails, with the positive alternative stated next to it.*
7. **Co-location** — a concept's definition, its rules, and its exceptions grouped under the one heading that governs the step, not scattered wherever they were written. *Check: no load-bearing rule stranded in a distant Notes section.*
8. **Constraints** — the spec caps `name` at 64 and `description` at 1024 characters separately; Pair adopts a stricter combined ≤1024 bound for both together. Dataset skills carry only agentskills.io-spec top-level frontmatter (`name` + `description` required; optional `license`, `compatibility`, `metadata`, `allowed-tools`) plus `version`/`author` as a tolerated Pair extension at top level (the spec only shows those under `metadata:`) for provenance tracking — no assistant-specific fields. Dataset and installed mirror change in the same commit. *Check: char count against the combined bound, frontmatter field diff against spec + tolerated extension, commit touches both copies.*
9. **Evaluation** — should-trigger / should-not-trigger prompt sets per skill family, run in fresh sessions; description rewrites record before/after results, and a regression reverts the rewrite. *Check: evidence recorded per rewritten description.*

## Callers Matrix (Scoped Capabilities)

`/map-subdomains` and `/map-contexts` are capabilities, not process steps: every caller invokes them with `$scope` set to the items it just touched. `/bootstrap` is the only caller allowed a full-catalog `$scope: all` run.

| Capability | Caller | Phase | `$scope` set to |
|------------|--------|-------|-----------------|
| `/map-subdomains` | `/refine-story` (planned — #242) | Functional/domain analysis | The story's capability area |
| `/map-subdomains` | `/plan-initiatives` | Initiative creation | The initiative's capability area |
| `/map-subdomains` | `/plan-epics` | Epic breakdown | The epic's capability area |
| `/map-subdomains` | `/brainstorm` | Broad/functional discovery (phase 2) | The capability areas discovered |
| `/map-subdomains` | `/bootstrap` | Project setup | `all` (full catalog — bootstrap only) |
| `/map-contexts` | `/refine-story` (planned — #242) | Technical analysis | The story's touched contexts/services |
| `/map-contexts` | `/plan-tasks` | Task breakdown | The task's touched contexts/services |
| `/map-contexts` | `/brainstorm` | Punctual/technical discovery (phase 2) | The contexts discovered |
| `/map-contexts` | `/bootstrap` | Project setup | `all` (full catalog — bootstrap only) |

Every row above except the two `(planned — #242)` entries is a real composition, verified against each caller's `SKILL.md` — not an aspirational claim. No caller performs a full re-mapping outside `/bootstrap`. When no `subdomain/`/`boundedcontext/` artifacts exist yet, both capabilities fall back to "system areas" (services/modules) instead of requiring the DDD prerequisites — no HALT, no error.

`/classify` is likewise a capability invoked by callers, keyed by `$context` (not `$scope`):

| Capability | Caller | Phase | `$context` |
|------------|--------|-------|------------|
| `/classify` | `/refine-story` | Shift-left classification (Step 3b) | `refinement` (story context) |
| `/classify` | `/review` | PR validation (Step 1.5) | `review` (diff; confirm-or-raise, never lower) |

Both rows are real compositions verified against each caller's `SKILL.md`. `/classify` owns no criteria — it applies the [quality model](guidelines/quality-assurance/quality-model.md); the review pass is a floor over the refinement tier (D17).

## Migration Notes

**map-subdomains, map-contexts: process → capability (D24, #246)**

- Old path: `.skills/process/map-subdomains/`, `.skills/process/map-contexts/` — new path: `.skills/capability/map-subdomains/`, `.skills/capability/map-contexts/`.
- Installed command names change accordingly: `/pair-process-map-subdomains` → `/pair-capability-map-subdomains`; `/pair-process-map-contexts` → `/pair-capability-map-contexts`. Unprefixed dataset command names (`map-subdomains`, `map-contexts`) are unchanged.
- Invocation contract changed: `$scope` is now **required** and means "items/areas the caller touched" (not `all`/`single`). Full-catalog `$scope: all` is now bootstrap-only.
- New behavior: graceful "system areas" fallback when no DDD artifacts exist; `Volatility` field on subdomains; per-relationship strength/distance/volatility assessment with an approval gate on unbalanced+volatile relationships (see `subdomain-template.md`, `bounded-context-template.md`).
- No standalone process step or how-to remains for domain mapping — how-to guides 04 (define-subdomains) and 05 (define-bounded-contexts) were removed; each caller's own how-to (02, 03, 06, 08, 09) now references the capability inline at the point it's invoked, scoped per the [Callers Matrix](#callers-matrix-scoped-capabilities) above. The capability's own `SKILL.md` ([map-subdomains](../../.skills/capability/map-subdomains/SKILL.md), [map-contexts](../../.skills/capability/map-contexts/SKILL.md)) is the canonical reference for its algorithm, fallback behavior, and templates.

**assess-debt, assess-code-quality: assess → analyze (skill naming taxonomy, #313/T8)**

- Rationale: `assess-*` conflated two operations. The corpus now uses three distinct verbs — **`verify-*`** (conformance pass/fail), **`assess-*`** (evaluate options + PROPOSE an adoption choice — the 8 decision skills), **`analyze-*`** (analyze + REPORT only, never blocks, proposes no adoption decision). The two report skills were misfiled under `assess-*` and are renamed to the `analyze-*` verb. Recorded as ADL `2026-07-13-skill-naming-verb-taxonomy.md` in the project decision log.
- Old path: `.skills/capability/assess-debt/`, `.skills/capability/assess-code-quality/` — new path: `.skills/capability/analyze-debt/`, `.skills/capability/analyze-code-quality/`.
- Installed command names change accordingly: `/pair-capability-assess-debt` → `/pair-capability-analyze-debt`; `/pair-capability-assess-code-quality` → `/pair-capability-analyze-code-quality`. Unprefixed dataset command names change too: `assess-debt` → `analyze-debt`, `assess-code-quality` → `analyze-code-quality`.
- No behavior change: both remain output-only report producers (per ADR-009); only the verb/name changed. Skill count stays 35.

## How Skills Relate to How-To Guides

- **How-to guides** = workflow orchestrators (the "what" and "when")
- **Skills** = operational detail (the "how")
- No duplication: skills contain the algorithm, how-to guides describe the workflow context

When skills are installed, invoke them directly. When not installed, follow the how-to guide manually.

## Adoption Files

Skills read from and write to adoption files in `.pair/adoption/`:

| Area | Adoption File | Skills That Read | Skills That Write |
|------|--------------|------------------|-------------------|
| Tech stack | `tech/tech-stack.md` | `/verify-adoption`, `/review` | `/assess-stack`, `/bootstrap` |
| Architecture | `tech/architecture.md` | `/verify-adoption`, `/review` | `/assess-architecture` |
| Way of working | `tech/way-of-working.md` | `/implement`, `/review`, `/estimate` | `/assess-methodology`, `/setup-pm` |
| Decisions (ADR) | `tech/adr/*.md` | `/verify-adoption`, `/review` | `/record-decision` |
| Decisions (ADL) | `decision-log/*.md` | `/verify-adoption` | `/record-decision` |
| Domain (context map / subdomain contexts) | `product/context-map.md`, `product/subdomain/*.context.md` | `/brainstorm`, `/refine-story`, `/plan-initiatives`, `/plan-epics`, `/plan-stories`, `/plan-tasks` | `/record-decision` (decision-backed sections), `/brainstorm`, `/refine-story` (inline glossary/entity/rule maintenance) |
| Classification delta | `tech/risk-matrix.md` | `/classify`, `/review` | `/classify` (`## Tag Projection`), `/bootstrap` (`## Criticality Table`, `## Overrides`) — **section ownership is the invariant**: writers of this file share it section by section, never whole-file |

## Navigation

- **Start here**: Run `/next` to determine what to do
- **Process flow**: (`/brainstorm` — optional discovery) → `/specify-prd` → `/bootstrap` → `/plan-initiatives` → ... → `/implement` → `/review`
- **Independent capability**: Any capability skill can be invoked directly (e.g., `/estimate`, `/analyze-debt`)
