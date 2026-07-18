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
| **Capability** | 26 | Atomic units — perform a single focused operation |

Process skills compose capability skills. Capability skills are independently invocable. Total: 36 (9 process + 26 capability + 1 navigator).

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

> How-to guides 04 and 05 (subdomain/bounded-context definition) were removed — domain modeling is referenced inline by each real caller's own how-to (02, 03, 06, 09; 08 planned — #242). See [Domain Modeling Skills](#domain-modeling-skills-2) below and [Migration Notes](#migration-notes).

### Capability Skills (26)

#### Domain Modeling Skills (2)

| Skill | Scope |
|-------|-------|
| `/pair-capability-map-subdomains` | DDD subdomain placement (core/supporting/generic + Volatility), scoped to caller's touched items |
| `/pair-capability-map-contexts` | DDD bounded-context placement + per-relationship strength/distance/volatility assessment, scoped to caller's touched items |

Reclassified from process to capability (D24) — see [Callers Matrix](#callers-matrix-scoped-capabilities) and [Migration Notes](#migration-notes).

#### Assessment Skills (9)

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
| `/pair-capability-assess-security` | Security posture — review verdict (`$mode: review`, composed by `/pair-process-review`) + one-shot OWASP Top 10 audit (`$mode: audit`). Unlike the 8 above, not purely output-only — writes its own audit report (D14 exception); never scans for secrets, that's the deterministic CI layer `/pair-capability-setup-gates` provisions (D24) |

#### Analysis Skills (2)

Analyze + **report only** — never block, propose no adoption decision (verb: `analyze-*`, distinct from `assess-*`).

| Skill | Scope |
|-------|-------|
| `/pair-capability-analyze-debt` | Technical debt detection + prioritization (report-only) |
| `/pair-capability-analyze-code-quality` | Code quality metrics — complexity, size, coverage, maintainability (report-only) |

#### Verification Skills (3)

| Skill | Scope |
|-------|-------|
| `/pair-capability-verify-quality` | Quality gate checking |
| `/pair-capability-verify-done` | Definition of Done checking |
| `/pair-capability-verify-adoption` | Adoption compliance checking |

#### Operational Skills (6)

| Skill | Scope |
|-------|-------|
| `/pair-capability-record-decision` | ADR/ADL creation + adoption update |
| `/pair-capability-write-issue` | PM tool issue creation/update |
| `/pair-capability-estimate` | Story estimation |
| `/pair-capability-setup-gates` | CI/CD quality gate configuration |
| `/pair-capability-setup-pm` | PM tool configuration |
| `/pair-capability-manage-flags` | Feature flag lifecycle management |

#### Testing Skills (2)

| Skill | Scope |
|-------|-------|
| `/pair-capability-design-manual-tests` | Manual test suite generation from project analysis |
| `/pair-capability-execute-manual-tests` | Manual test suite execution + report generation |

#### State and Handoff Skills (1)

| Skill | Scope |
|-------|-------|
| `/pair-capability-checkpoint` | Write/resume story progress checkpoint (work survives context resets) |

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
│   ├── analyze-debt/          # report-only
│   ├── analyze-code-quality/  # report-only
│   ├── checkpoint/
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

1. **Description = trigger** — the description names the skill's purpose and enumerates its distinct trigger branches; two clauses covering the same branch in different words still collapse into one branch, so merge them; mostly-composed capabilities carry a lean reach clause (e.g. "Composed by `/pair-process-refine-story`; invoke directly when …") instead of a trigger list; algorithm detail stays in the body. *Check: every clause maps to a distinct branch; nothing that only matters after loading.*
2. **Information hierarchy** — steps first, in-file reference second, branch-specific reference pushed to a sibling file pulled in through a context pointer (its phrasing, not its target, is what makes it fire reliably); keep inline what every run passes through, move out what only a subset of runs reach. *Check: "does every run need this before acting?" decides the rung.*
3. **Completion criteria** — every Verify beat leaves no room for a judgment call (from observable state alone, the step either happened or it didn't) and is exhaustive where thoroughness matters; a criterion loose enough to pass by default invites premature completion. *Check: two executors couldn't disagree on whether it's satisfied.*
4. **Pruning** — one home per meaning (shared conventions live once; skills keep deltas); every line passes a relevance test; every sentence passes a no-op check (strip it out — would the model act differently without it? cut failing sentences outright); prune on every edit before sediment settles. *Check: the meaning you're adding doesn't already live elsewhere.*
5. **Leading words** — compact pretrained concepts repeated as tokens (*idempotent*, *scope*, *gate*, *halt*) anchor behavior in the body and invocation in the description at minimal token cost. *Check: prose restating one idea across sentences collapses into one strong word.*
6. **Positive phrasing** — state what the executor should do; spelling out the banned behavior instead just pulls it into view. A prohibition belongs only where no positive phrasing closes the same gap, and even then the positive instruction sits right beside it. *Check: rewrite each "never" as a positive instruction; keep the negation only where that rewrite fails, with the positive alternative stated next to it.*
7. **Co-location** — a concept's definition, its rules, and its exceptions grouped under the one heading that governs the step, not scattered wherever they were written. *Check: no load-bearing rule stranded in a distant Notes section.*
8. **Constraints** — the spec caps `name` at 64 and `description` at 1024 characters separately; Pair adopts a stricter combined ≤1024 bound for both together. Dataset skills carry only agentskills.io-spec top-level frontmatter (`name` + `description` required; optional `license`, `compatibility`, `metadata`, `allowed-tools`) plus `version`/`author` as a tolerated Pair extension at top level (the spec only shows those under `metadata:`) for provenance tracking — no assistant-specific fields. Dataset and installed mirror change in the same commit. *Check: char count against the combined bound, frontmatter field diff against spec + tolerated extension, commit touches both copies.*
9. **Evaluation** — should-trigger / should-not-trigger prompt sets per skill family, run in fresh sessions; description rewrites record before/after results, and a regression reverts the rewrite. *Check: evidence recorded per rewritten description.*

## Callers Matrix (Scoped Capabilities)

`/pair-capability-map-subdomains` and `/pair-capability-map-contexts` are capabilities, not process steps: every caller invokes them with `$scope` set to the items it just touched. `/pair-process-bootstrap` is the only caller allowed a full-catalog `$scope: all` run.

| Capability | Caller | Phase | `$scope` set to |
|------------|--------|-------|-----------------|
| `/pair-capability-map-subdomains` | `/pair-process-refine-story` (planned — #242) | Functional/domain analysis | The story's capability area |
| `/pair-capability-map-subdomains` | `/pair-process-plan-initiatives` | Initiative creation | The initiative's capability area |
| `/pair-capability-map-subdomains` | `/pair-process-plan-epics` | Epic breakdown | The epic's capability area |
| `/pair-capability-map-subdomains` | `/brainstorm` (planned — #230) | Broad brainstorm | All capabilities discussed |
| `/pair-capability-map-subdomains` | `/pair-process-bootstrap` | Project setup | `all` (full catalog — bootstrap only) |
| `/pair-capability-map-contexts` | `/pair-process-refine-story` (planned — #242) | Technical analysis | The story's touched contexts/services |
| `/pair-capability-map-contexts` | `/pair-process-plan-tasks` | Task breakdown | The task's touched contexts/services |
| `/pair-capability-map-contexts` | `/brainstorm` (planned — #230) | Punctual/technical brainstorm | The contexts discussed |
| `/pair-capability-map-contexts` | `/pair-process-bootstrap` | Project setup | `all` (full catalog — bootstrap only) |

Every row above except the two `(planned — #242)`/`(planned — #230)` entries is a real composition, verified against each caller's `SKILL.md` — not an aspirational claim. No caller performs a full re-mapping outside `/pair-process-bootstrap`. When no `subdomain/`/`boundedcontext/` artifacts exist yet, both capabilities fall back to "system areas" (services/modules) instead of requiring the DDD prerequisites — no HALT, no error.

## Migration Notes

**map-subdomains, map-contexts: process → capability (D24, #246)**

- Old path: `.skills/process/map-subdomains/`, `.skills/process/map-contexts/` — new path: `.skills/capability/map-subdomains/`, `.skills/capability/map-contexts/`.
- Installed command names change accordingly: `/pair-process-map-subdomains` → `/pair-capability-map-subdomains`; `/pair-process-map-contexts` → `/pair-capability-map-contexts`. Unprefixed dataset command names (`map-subdomains`, `map-contexts`) are unchanged.
- Invocation contract changed: `$scope` is now **required** and means "items/areas the caller touched" (not `all`/`single`). Full-catalog `$scope: all` is now bootstrap-only.
- New behavior: graceful "system areas" fallback when no DDD artifacts exist; `Volatility` field on subdomains; per-relationship strength/distance/volatility assessment with an approval gate on unbalanced+volatile relationships (see `subdomain-template.md`, `bounded-context-template.md`).
- No standalone process step or how-to remains for domain mapping — how-to guides 04 (define-subdomains) and 05 (define-bounded-contexts) were removed; each caller's own how-to (02, 03, 06, 08, 09) now references the capability inline at the point it's invoked, scoped per the [Callers Matrix](#callers-matrix-scoped-capabilities) above. The capability's own `SKILL.md` ([map-subdomains](../../.claude/skills/pair-capability-map-subdomains/SKILL.md), [map-contexts](../../.claude/skills/pair-capability-map-contexts/SKILL.md)) is the canonical reference for its algorithm, fallback behavior, and templates.

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
| Tech stack | `tech/tech-stack.md` | `/pair-capability-verify-adoption`, `/pair-process-review` | `/pair-capability-assess-stack`, `/pair-process-bootstrap` |
| Architecture | `tech/architecture.md` | `/pair-capability-verify-adoption`, `/pair-process-review` | `/pair-capability-assess-architecture` |
| Way of working | `tech/way-of-working.md` | `/pair-process-implement`, `/pair-process-review`, `/pair-capability-estimate` | `/pair-capability-assess-methodology`, `/pair-capability-setup-pm` |
| Decisions (ADR) | `tech/adr/*.md` | `/pair-capability-verify-adoption`, `/pair-process-review` | `/pair-capability-record-decision` |
| Decisions (ADL) | `decision-log/*.md` | `/pair-capability-verify-adoption` | `/pair-capability-record-decision` |

## Navigation

- **Start here**: Run `/pair-next` to determine what to do
- **Process flow**: `/pair-process-specify-prd` → `/pair-process-bootstrap` → `/pair-process-plan-initiatives` → ... → `/pair-process-implement` → `/pair-process-review`
- **Independent capability**: Any capability skill can be invoked directly (e.g., `/pair-capability-estimate`, `/pair-capability-analyze-debt`)
