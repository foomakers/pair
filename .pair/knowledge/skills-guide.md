# Agent Skills Guide

## Overview

Agent Skills are structured, composable instructions that AI coding agents follow to perform development tasks. They follow the [Agent Skills](https://agentskills.io) open standard, supported by Claude Code, Cursor, VS Code Copilot, and OpenAI Codex.

Skills provide idempotency, composability, and graceful degradation.

## Quick Start

Run `/pair-next` at the start of every session. It reads project adoption files and PM tool state, then recommends the most relevant skill to invoke.

## Skill Types

| Type | Count | Purpose |
|------|-------|---------|
| **Process** | 11 | Lifecycle phases — orchestrate capability skills |
| **Capability** | 19 | Atomic units — perform a single focused operation |

Process skills compose capability skills. Capability skills are independently invocable.

## Full Catalog

### Process Skills (11)

| Skill | How-To | Phase | Description |
|-------|--------|-------|-------------|
| `/pair-process-specify-prd` | 01 | Induction | Create/update PRD |
| `/pair-process-bootstrap` | 02 | Induction | Full project setup |
| `/pair-process-plan-initiatives` | 03 | Strategic | Create and prioritize initiatives |
| `/pair-process-map-subdomains` | 04 | Strategic | Define DDD subdomains |
| `/pair-process-map-contexts` | 05 | Strategic | Define bounded contexts |
| `/pair-process-plan-epics` | 06 | Strategic | Break initiatives into epics |
| `/pair-process-plan-stories` | 07 | Iteration | Break epics into user stories |
| `/pair-process-refine-story` | 08 | Iteration | Refine stories with AC + technical analysis |
| `/pair-process-plan-tasks` | 09 | Iteration | Break stories into tasks |
| `/pair-process-implement` | 10 | Execution | Implement tasks with TDD |
| `/pair-process-review` | 11 | Review | Code review with merge flow |

### Capability Skills (19)

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

#### Code Quality Skills (2)

| Skill | Scope |
|-------|-------|
| `/pair-capability-assess-code-quality` | Code quality metrics assessment |
| `/pair-capability-manage-flags` | Feature flag lifecycle management |

## Directory Structure

```text
.skills/
├── process/              # Lifecycle phase skills
│   ├── specify-prd/
│   ├── bootstrap/
│   ├── plan-initiatives/
│   ├── map-subdomains/
│   ├── map-contexts/
│   ├── plan-epics/
│   ├── plan-stories/
│   ├── refine-story/
│   ├── plan-tasks/
│   ├── implement/
│   └── review/
├── capability/           # Atomic operation skills
│   ├── assess-*/         # 8 assessment skills
│   ├── verify-*/         # 3 verification skills
│   ├── record-decision/
│   ├── write-issue/
│   ├── estimate/
│   ├── setup-gates/
│   ├── setup-pm/
│   ├── assess-code-quality/
│   └── manage-flags/
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
