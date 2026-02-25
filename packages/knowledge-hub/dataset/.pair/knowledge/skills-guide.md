# Agent Skills Guide

## Overview

Agent Skills are structured, composable instructions that AI coding agents follow to perform development tasks. They follow the [Agent Skills](https://agentskills.io) open standard, supported by Claude Code, Cursor, VS Code Copilot, and OpenAI Codex.

Skills provide idempotency, composability, and graceful degradation.

## Quick Start

Run `/next` at the start of every session. It reads project adoption files and PM tool state, then recommends the most relevant skill to invoke.

## Skill Types

| Type | Count | Purpose |
|------|-------|---------|
| **Process** | 11 | Lifecycle phases — orchestrate capability skills |
| **Capability** | 20 | Atomic units — perform a single focused operation |

Process skills compose capability skills. Capability skills are independently invocable. Total: 32 (11 process + 20 capability + 1 navigator).

## Full Catalog

### Process Skills (11)

| Skill | How-To | Phase | Description |
|-------|--------|-------|-------------|
| `/specify-prd` | 01 | Induction | Create/update PRD |
| `/bootstrap` | 02 | Induction | Full project setup |
| `/plan-initiatives` | 03 | Strategic | Create and prioritize initiatives |
| `/map-subdomains` | 04 | Strategic | Define DDD subdomains |
| `/map-contexts` | 05 | Strategic | Define bounded contexts |
| `/plan-epics` | 06 | Strategic | Break initiatives into epics |
| `/plan-stories` | 07 | Iteration | Break epics into user stories |
| `/refine-story` | 08 | Iteration | Refine stories with AC + technical analysis |
| `/plan-tasks` | 09 | Iteration | Break stories into tasks |
| `/implement` | 10 | Execution | Implement tasks with TDD |
| `/review` | 11 | Review | Code review with merge flow |

### Capability Skills (19)

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
│   ├── design-manual-tests/
│   ├── execute-manual-tests/
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
/implement
├── /verify-quality       (required)
├── /record-decision      (required)
├── /assess-stack          (optional — warns if missing)
└── /verify-adoption       (optional — warns if missing)
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
| Tech stack | `tech/tech-stack.md` | `/verify-adoption`, `/review` | `/assess-stack`, `/bootstrap` |
| Architecture | `tech/architecture.md` | `/verify-adoption`, `/review` | `/assess-architecture` |
| Way of working | `tech/way-of-working.md` | `/implement`, `/review`, `/estimate` | `/assess-methodology`, `/setup-pm` |
| Decisions (ADR) | `tech/adr/*.md` | `/verify-adoption`, `/review` | `/record-decision` |
| Decisions (ADL) | `decision-log/*.md` | `/verify-adoption` | `/record-decision` |

## Navigation

- **Start here**: Run `/next` to determine what to do
- **Process flow**: `/specify-prd` → `/bootstrap` → `/plan-initiatives` → ... → `/implement` → `/review`
- **Independent capability**: Any capability skill can be invoked directly (e.g., `/estimate`, `/assess-debt`)
