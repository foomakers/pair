# Agent Skills Guide

## Overview

Agent Skills are structured, composable instructions that AI coding agents follow to perform development tasks. They follow the [Agent Skills](https://agentskills.io) open standard, supported by Claude Code, Cursor, VS Code Copilot, and OpenAI Codex.

Skills provide idempotency, composability, and graceful degradation.

## Quick Start

Run `/pair-next` at the start of every session. It reads project adoption files and PM tool state, then recommends the most relevant skill to invoke.

## Skill Types

| Type | Count | Purpose |
|------|-------|---------|
| **Process** | 9 | Lifecycle phases — orchestrate capability skills |
| **Capability** | 24 | Atomic units — perform a single focused operation |

Process skills compose capability skills. Capability skills are independently invocable. Total: 34 (9 process + 24 capability + 1 navigator).

## Full Catalog

### Process Skills (9)

| Skill | How-To | Phase | Description |
|-------|--------|-------|-------------|
| `/pair-process-specify-prd` | 01 | Induction | Create/update PRD |
| `/pair-process-bootstrap` | 02 | Induction | Full project setup |
| `/pair-process-plan-initiatives` | 03 | Strategic | Create and prioritize initiatives |
| `/pair-process-plan-epics` | 06 | Strategic | Break initiatives into epics |
| `/pair-process-plan-stories` | 07 | Iteration | Break epics into user stories |
| `/pair-process-refine-story` | 08 | Iteration | Refine stories with AC + technical analysis |
| `/pair-process-plan-tasks` | 09 | Iteration | Break stories into tasks |
| `/pair-process-implement` | 10 | Execution | Implement tasks with TDD |
| `/pair-process-review` | 11 | Review | Code review with merge flow |

> How-to guides 04 and 05 (subdomain/bounded-context definition) no longer map to a process skill — see [Domain Modeling Skills](#domain-modeling-skills-2) below and [Migration Notes](#migration-notes).

### Capability Skills (24)

#### Domain Modeling Skills (2)

| Skill | Scope |
|-------|-------|
| `/pair-capability-map-subdomains` | DDD subdomain placement (core/supporting/generic + Volatility), scoped to caller's touched items |
| `/pair-capability-map-contexts` | DDD bounded-context placement + per-relationship strength/distance/volatility assessment, scoped to caller's touched items |

Reclassified from process to capability (D24) — see [Callers Matrix](#callers-matrix-scoped-capabilities) and [Migration Notes](#migration-notes).

#### Assessment Skills (8)

| Skill | Scope |
|-------|-------|
| `/pair-capability-assess-stack` | Tech stack evaluation + dependency validation |
| `/pair-capability-assess-architecture` | Architecture pattern selection |
| `/pair-capability-assess-methodology` | Development methodology selection |
| `/pair-capability-assess-pm` | PM tool selection |
| `/pair-capability-assess-testing` | Testing strategy evaluation |
| `/pair-capability-assess-infrastructure` | Infrastructure strategy evaluation |
| `/pair-capability-assess-observability` | Observability strategy evaluation |
| `/pair-capability-assess-ai` | AI development tools evaluation |

#### Verification Skills (4)

| Skill | Scope |
|-------|-------|
| `/pair-capability-verify-quality` | Quality gate checking |
| `/pair-capability-verify-done` | Definition of Done checking |
| `/pair-capability-verify-adoption` | Adoption compliance checking |
| `/pair-capability-assess-debt` | Technical debt detection + prioritization |

#### Operational Skills (5)

| Skill | Scope |
|-------|-------|
| `/pair-capability-record-decision` | ADR/ADL creation + adoption update |
| `/pair-capability-write-issue` | PM tool issue creation/update |
| `/pair-capability-estimate` | Story estimation |
| `/pair-capability-setup-gates` | CI/CD quality gate configuration |
| `/pair-capability-setup-pm` | PM tool configuration |

#### Testing Skills (2)

| Skill | Scope |
|-------|-------|
| `/pair-capability-design-manual-tests` | Manual test suite generation from project analysis |
| `/pair-capability-execute-manual-tests` | Manual test suite execution + report generation |

#### Code Quality Skills (2)

| Skill | Scope |
|-------|-------|
| `/pair-capability-assess-code-quality` | Code quality metrics assessment |
| `/pair-capability-manage-flags` | Feature flag lifecycle management |

#### Discovery Skills (1)

| Skill | Scope |
|-------|-------|
| `/pair-capability-grill` | Reusable interview engine (interview / sync modes), write-free |

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
/pair-process-implement
├── /pair-capability-verify-quality       (required)
├── /pair-capability-record-decision      (required)
├── /pair-capability-assess-stack          (optional — warns if missing)
└── /pair-capability-verify-adoption       (optional — warns if missing)
```

Optional skills degrade gracefully: if not installed, the process skill warns and continues without blocking.

## Callers Matrix (Scoped Capabilities)

`/pair-capability-map-subdomains` and `/pair-capability-map-contexts` are capabilities, not process steps: every caller invokes them with `$scope` set to the items it just touched. `/pair-process-bootstrap` is the only caller allowed a full-catalog `$scope: all` run.

| Capability | Caller | Phase | `$scope` set to |
|------------|--------|-------|-----------------|
| `/pair-capability-map-subdomains` | `/pair-process-refine-story` | Functional/domain analysis | The story's capability area |
| `/pair-capability-map-subdomains` | `/pair-process-plan-initiatives` | Initiative creation | The initiative's capability area |
| `/pair-capability-map-subdomains` | `/pair-process-plan-epics` | Epic breakdown | The epic's capability area |
| `/pair-capability-map-subdomains` | `/brainstorm` (planned — #230) | Broad brainstorm | All capabilities discussed |
| `/pair-capability-map-subdomains` | `/pair-process-bootstrap` | Project setup | `all` (full catalog — bootstrap only) |
| `/pair-capability-map-contexts` | `/pair-process-refine-story` | Technical analysis | The story's touched contexts/services |
| `/pair-capability-map-contexts` | `/pair-process-plan-tasks` | Task breakdown | The task's touched contexts/services |
| `/pair-capability-map-contexts` | `/brainstorm` (planned — #230) | Punctual/technical brainstorm | The contexts discussed |
| `/pair-capability-map-contexts` | `/pair-process-bootstrap` | Project setup | `all` (full catalog — bootstrap only) |

No caller performs a full re-mapping outside `/pair-process-bootstrap`. When no `subdomain/`/`boundedcontext/` artifacts exist yet, both capabilities fall back to "system areas" (services/modules) instead of requiring the DDD prerequisites — no HALT, no error.

## Migration Notes

**map-subdomains, map-contexts: process → capability (D24, #246)**

- Old path: `.skills/process/map-subdomains/`, `.skills/process/map-contexts/` — new path: `.skills/capability/map-subdomains/`, `.skills/capability/map-contexts/`.
- Installed command names change accordingly: `/pair-process-map-subdomains` → `/pair-capability-map-subdomains`; `/pair-process-map-contexts` → `/pair-capability-map-contexts`. Unprefixed dataset command names (`/map-subdomains`, `/map-contexts`) are unchanged.
- Invocation contract changed: `$scope` is now **required** and means "items/areas the caller touched" (not `all`/`single`). Full-catalog `$scope: all` is now bootstrap-only.
- New behavior: graceful "system areas" fallback when no DDD artifacts exist; `Volatility` field on subdomains; per-relationship strength/distance/volatility assessment with an approval gate on unbalanced+volatile relationships (see `subdomain-template.md`, `bounded-context-template.md`).
- No standalone process step remains for domain mapping — how-to guides 04/05 still describe the workflow, but the underlying skill is invoked scoped by the callers in the [Callers Matrix](#callers-matrix-scoped-capabilities) above.

## How Skills Relate to How-To Guides

- **How-to guides** = workflow orchestrators (the "what" and "when")
- **Skills** = operational detail (the "how")
- No duplication: skills contain the algorithm, how-to guides describe the workflow context

When skills are installed, invoke them directly. When not installed, follow the how-to guide manually.

## Adoption Files

Skills read from and write to adoption files in `.pair/adoption/`:

| Area | Adoption File | Skills That Read | Skills That Write |
|------|--------------|------------------|-------------------|
| Tech stack | `tech/tech-stack.md` | `/pair-capability-verify-adoption`, `/pair-process-review` | `/pair-capability-assess-stack`, `/pair-process-bootstrap` |
| Architecture | `tech/architecture.md` | `/pair-capability-verify-adoption`, `/pair-process-review` | `/pair-capability-assess-architecture` |
| Way of working | `tech/way-of-working.md` | `/pair-process-implement`, `/pair-process-review`, `/pair-capability-estimate` | `/pair-capability-assess-methodology`, `/pair-capability-setup-pm` |
| Decisions (ADR) | `tech/adr/*.md` | `/pair-capability-verify-adoption`, `/pair-process-review` | `/pair-capability-record-decision` |
| Decisions (ADL) | `decision-log/*.md` | `/pair-capability-verify-adoption` | `/pair-capability-record-decision` |

## Navigation

- **Start here**: Run `/pair-next` to determine what to do
- **Process flow**: `/pair-process-specify-prd` → `/pair-process-bootstrap` → `/pair-process-plan-initiatives` → ... → `/pair-process-implement` → `/pair-process-review`
- **Independent capability**: Any capability skill can be invoked directly (e.g., `/pair-capability-estimate`, `/pair-capability-assess-debt`)
