# Agent Skills Guide

## Overview

Agent Skills are structured, composable instructions that AI coding agents follow to perform development tasks. They follow the [Agent Skills](https://agentskills.io) open standard, supported by Claude Code, Cursor, VS Code Copilot, and OpenAI Codex.

Skills provide idempotency, composability, and graceful degradation.

## Quick Start

Run `/next` at the start of every session. It reads project adoption files and PM tool state, then recommends the most relevant skill to invoke.

## Skill Types

| Type | Count | Purpose |
|------|-------|---------|
| **Process** | 9 | Lifecycle phases — orchestrate capability skills |
| **Capability** | 25 | Atomic units — perform a single focused operation |

Process skills compose capability skills. Capability skills are independently invocable. Total: 35 (9 process + 25 capability + 1 navigator).

## Full Catalog

### Process Skills (9)

| Skill | How-To | Phase | Description |
|-------|--------|-------|-------------|
| `/specify-prd` | 01 | Induction | Create/update PRD |
| `/bootstrap` | 02 | Induction | Full project setup |
| `/plan-initiatives` | 03 | Strategic | Create and prioritize initiatives |
| `/plan-epics` | 06 | Strategic | Break initiatives into epics |
| `/plan-stories` | 07 | Iteration | Break epics into user stories |
| `/refine-story` | 08 | Iteration | Refine stories with AC + technical analysis |
| `/plan-tasks` | 09 | Iteration | Break stories into tasks |
| `/implement` | 10 | Execution | Implement tasks with TDD |
| `/review` | 11 | Review | Code review with merge flow |

> How-to guides 04 and 05 (subdomain/bounded-context definition) were removed — domain modeling is referenced inline by each real caller's own how-to (02, 03, 06, 09; 08 planned — #242). See [Domain Modeling Skills](#domain-modeling-skills-2) below and [Migration Notes](#migration-notes).

### Capability Skills (24)

#### Domain Modeling Skills (2)

| Skill | Scope |
|-------|-------|
| `/map-subdomains` | DDD subdomain placement (core/supporting/generic + Volatility), scoped to caller's touched items |
| `/map-contexts` | DDD bounded-context placement + per-relationship strength/distance/volatility assessment, scoped to caller's touched items |

Reclassified from process to capability (D24) — see [Callers Matrix](#callers-matrix-scoped-capabilities) and [Migration Notes](#migration-notes).

#### Assessment Skills (8)

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

#### Verification Skills (4)

| Skill | Scope |
|-------|-------|
| `/verify-quality` | Quality gate checking |
| `/verify-done` | Definition of Done checking |
| `/verify-adoption` | Adoption compliance checking |
| `/assess-debt` | Technical debt detection + prioritization |

#### Operational Skills (5)

| Skill | Scope |
|-------|-------|
| `/record-decision` | ADR/ADL creation + adoption update |
| `/write-issue` | PM tool issue creation/update |
| `/estimate` | Story estimation |
| `/setup-gates` | CI/CD quality gate configuration |
| `/setup-pm` | PM tool configuration |

#### Testing Skills (2)

| Skill | Scope |
|-------|-------|
| `/design-manual-tests` | Manual test suite generation from project analysis |
| `/execute-manual-tests` | Manual test suite execution + report generation |

#### Code Quality Skills (2)

| Skill | Scope |
|-------|-------|
| `/assess-code-quality` | Code quality metrics assessment |
| `/manage-flags` | Feature flag lifecycle management |

#### Discovery Skills (1)

| Skill | Scope |
|-------|-------|
| `/grill` | Reusable interview engine (interview / sync modes), write-free |

## Directory Structure

```text
.skills/
├── process/              # Lifecycle phase skills
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
│   ├── assess-*/         # 8 assessment skills
│   ├── verify-*/         # 3 verification skills
│   ├── design-manual-tests/
│   ├── execute-manual-tests/
│   ├── record-decision/
│   ├── write-issue/
│   ├── estimate/
│   ├── setup-gates/
│   ├── setup-pm/
│   ├── assess-code-quality/
│   ├── manage-flags/
│   └── grill/
└── next/                 # Navigator skill
    └── SKILL.md
```

Each skill directory contains a `SKILL.md` file with YAML frontmatter (`name` + `description`) and a structured algorithm using the **check → skip → act → verify** pattern.

## Composition Pattern

Process skills compose capability skills with optional graceful degradation:

```text
/implement
├── /verify-quality       (required)
├── /record-decision      (required)
├── /assess-stack          (optional — warns if missing)
└── /verify-adoption       (optional — warns if missing)
```

Optional skills degrade gracefully: if not installed, the process skill warns and continues without blocking.

## Authoring Standard

Every skill is held to an effectiveness standard, not just structural conformance. The goal is predictability — the executor takes the same *process* every run. Nine principles, each with its check (full standard with worked examples and review checklist: website contributing guide "Writing Skills"; recorded as ADR-010):

1. **Description = trigger** — the description states what the skill is plus its distinct trigger branches, one trigger per branch (synonyms restating a branch are duplication); mostly-composed capabilities carry a lean reach clause (e.g. "Composed by `/refine-story`; invoke directly when …") instead of a trigger list; algorithm detail stays in the body. *Check: every clause maps to a distinct branch; nothing that only matters after loading.*
2. **Information hierarchy** — steps first, in-file reference second, branch-specific reference disclosed to a sibling file behind a context pointer whose wording (not its target) decides when it's loaded; inline what every run needs, disclose what only some branches reach. *Check: "does every run need this before acting?" decides the rung.*
3. **Completion criteria** — every Verify beat is checkable (done vs not-done decidable from observable state) and exhaustive where thoroughness matters; vague criteria invite premature completion. *Check: two executors couldn't disagree on whether it's satisfied.*
4. **Pruning** — single source of truth per meaning (shared conventions live once; skills keep deltas); every line passes a relevance test; every sentence passes a no-op test (does it change behavior vs the model default? delete whole failing sentences); prune on every edit before sediment settles. *Check: the meaning you're adding doesn't already live elsewhere.*
5. **Leading words** — compact pretrained concepts repeated as tokens (*idempotent*, *scope*, *gate*, *halt*) anchor behavior in the body and invocation in the description at minimal token cost. *Check: prose restating one idea across sentences collapses into one strong word.*
6. **Positive phrasing** — state the target behavior; a prohibition names the banned behavior into context; keep one only as a hard guardrail, paired with the positive target. *Check: each "never" survives an attempted positive rewrite.*
7. **Co-location** — a concept's definition, rules, and caveats under one heading, adjacent to the step they govern. *Check: no load-bearing rule stranded in a distant Notes section.*
8. **Constraints** — `name` + `description` ≤ 1024 characters (agentskills.io limit); dataset skills carry only agentskills.io-spec frontmatter (`name` + `description` required, spec-defined optionals like `version` allowed — no assistant-specific fields); dataset and installed mirror change in the same commit. *Check: char count, frontmatter field diff, commit touches both copies.*
9. **Evaluation** — should-trigger / should-not-trigger prompt sets per skill family, run in fresh sessions; description rewrites record before/after results, and a regression reverts the rewrite. *Check: evidence recorded per rewritten description.*

## Callers Matrix (Scoped Capabilities)

`/map-subdomains` and `/map-contexts` are capabilities, not process steps: every caller invokes them with `$scope` set to the items it just touched. `/bootstrap` is the only caller allowed a full-catalog `$scope: all` run.

| Capability | Caller | Phase | `$scope` set to |
|------------|--------|-------|-----------------|
| `/map-subdomains` | `/refine-story` (planned — #242) | Functional/domain analysis | The story's capability area |
| `/map-subdomains` | `/plan-initiatives` | Initiative creation | The initiative's capability area |
| `/map-subdomains` | `/plan-epics` | Epic breakdown | The epic's capability area |
| `/map-subdomains` | `/brainstorm` (planned — #230) | Broad brainstorm | All capabilities discussed |
| `/map-subdomains` | `/bootstrap` | Project setup | `all` (full catalog — bootstrap only) |
| `/map-contexts` | `/refine-story` (planned — #242) | Technical analysis | The story's touched contexts/services |
| `/map-contexts` | `/plan-tasks` | Task breakdown | The task's touched contexts/services |
| `/map-contexts` | `/brainstorm` (planned — #230) | Punctual/technical brainstorm | The contexts discussed |
| `/map-contexts` | `/bootstrap` | Project setup | `all` (full catalog — bootstrap only) |

Every row above except the two `(planned — #242)`/`(planned — #230)` entries is a real composition, verified against each caller's `SKILL.md` — not an aspirational claim. No caller performs a full re-mapping outside `/bootstrap`. When no `subdomain/`/`boundedcontext/` artifacts exist yet, both capabilities fall back to "system areas" (services/modules) instead of requiring the DDD prerequisites — no HALT, no error.

## Migration Notes

**map-subdomains, map-contexts: process → capability (D24, #246)**

- Old path: `.skills/process/map-subdomains/`, `.skills/process/map-contexts/` — new path: `.skills/capability/map-subdomains/`, `.skills/capability/map-contexts/`.
- Installed command names change accordingly: `/pair-process-map-subdomains` → `/pair-capability-map-subdomains`; `/pair-process-map-contexts` → `/pair-capability-map-contexts`. Unprefixed dataset command names (`/map-subdomains`, `/map-contexts`) are unchanged.
- Invocation contract changed: `$scope` is now **required** and means "items/areas the caller touched" (not `all`/`single`). Full-catalog `$scope: all` is now bootstrap-only.
- New behavior: graceful "system areas" fallback when no DDD artifacts exist; `Volatility` field on subdomains; per-relationship strength/distance/volatility assessment with an approval gate on unbalanced+volatile relationships (see `subdomain-template.md`, `bounded-context-template.md`).
- No standalone process step or how-to remains for domain mapping — how-to guides 04 (define-subdomains) and 05 (define-bounded-contexts) were removed; each caller's own how-to (02, 03, 06, 08, 09) now references the capability inline at the point it's invoked, scoped per the [Callers Matrix](#callers-matrix-scoped-capabilities) above. The capability's own `SKILL.md` ([map-subdomains](../../.skills/capability/map-subdomains/SKILL.md), [map-contexts](../../.skills/capability/map-contexts/SKILL.md)) is the canonical reference for its algorithm, fallback behavior, and templates.

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

## Navigation

- **Start here**: Run `/next` to determine what to do
- **Process flow**: `/specify-prd` → `/bootstrap` → `/plan-initiatives` → ... → `/implement` → `/review`
- **Independent capability**: Any capability skill can be invoked directly (e.g., `/estimate`, `/assess-debt`)
