# How to Create and Prioritize Initiatives - AI-Assisted Guide

## Overview

Transform Product Requirements Documents (PRDs) into strategic initiatives through collaborative analysis and prioritization. Strategic initiatives bridge product vision with executable development work.

**Role**: Product Owner/Manager (Collaborative Planning)
**Process**: AI proposes & analyzes, Developer validates & decides
**Skill**: When `/pair-process-plan-initiatives` is available, invoke it — it automates the operational steps of this workflow (PRD analysis, prioritization, initiative creation, dependency mapping). This how-to describes the workflow and its HALT conditions.

## Skill Composition

This how-to orchestrates the `/pair-process-plan-initiatives` skill.

| Skill               | Purpose                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/pair-process-plan-initiatives`  | Executes the full process: PRD analysis, P0/P1/P2 prioritization, initiative creation, dependency mapping.     |
| `/pair-capability-write-issue`       | Composed by `/pair-process-plan-initiatives` — creates or updates initiative issues in the PM tool.                         |

> **If skills are not installed**, follow the manual workflow below.

## Orchestration Flow

1. **Verify prerequisites**: bootstrap complete, PRD exists at [PRD.md](../../adoption/product/PRD.md), PM tool configured per [way-of-working.md](../../adoption/tech/way-of-working.md).
2. **Invoke `/pair-process-plan-initiatives`**. The skill handles:
   - Existing initiative detection (idempotent — skips already-created)
   - PRD analysis (business objectives, user value, constraints)
   - Prioritization (P0 Must-Have → P1 Should-Have → P2 Could-Have)
   - Initiative creation via `/pair-capability-write-issue` with `$type: initiative`
   - Dependency mapping and roadmap planning
3. **Developer validates** each initiative when prompted by the skill.
4. **Repeat** for additional initiatives or re-invoke to create missing ones.

## Manual Workflow (without skills)

### Phase 1: Foundation Setup

- Verify bootstrap: PRD exists, PM tool configured, technical standards established
- Load [Initiative Template](../guidelines/collaboration/templates/initiative-template.md)
- Follow [PM Tool Guidelines](../guidelines/collaboration/project-management-tool/README.md)

### Phase 2: Analysis & Prioritization

- Extract business objectives from PRD
- Identify initiative candidates grouped by business value streams
- Apply priority framework:
  - **P0 (Must-Have)**: Core value proposition enablers — launch-critical
  - **P1 (Should-Have)**: Competitive advantages — growth and adoption drivers
  - **P2 (Could-Have)**: Experience enhancements — retention and satisfaction
- Validate dependencies flow correctly (higher priority must not depend on lower)

### Phase 3: Initiative Creation

- Work through initiatives by priority (P0 → P1 → P2)
- Draft each using [Initiative Template](../guidelines/collaboration/templates/initiative-template.md)
- Present for developer validation; iterate on feedback
- Create in PM tool with proper labeling and organization

### Phase 4: Documentation & Planning

- Map dependencies between initiatives
- Establish roadmap with timeline and capacity considerations
- Prepare handoff for epic breakdown phase

## HALT Conditions

- **Bootstrap incomplete** — PRD and PM tool required before initiative creation
- **PRD not analyzed** — business context drives all initiative decisions
- **PM tool not configured** — complete [bootstrap](02-how-to-complete-bootstrap-checklist.md) first
- **Developer rejects prioritization** — must resolve before creation

## Key Principles

- **PRD-driven** — every initiative traces to PRD business objectives
- **P0/P1/P2 framework** — prioritize by business impact vs. implementation complexity
- **Collaborative validation** — developer approves each initiative
- **Idempotent** — re-invocation detects existing initiatives and creates only missing ones
- **Dependencies flow down** — higher priority never depends on lower priority

## References

- Template: [Initiative Template](../guidelines/collaboration/templates/initiative-template.md)
- PRD: [`.pair/adoption/product/PRD.md`](../../adoption/product/PRD.md)
- PM Tool: [PM Tool Guidelines](../guidelines/collaboration/project-management-tool/README.md)
- Bootstrap: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)
- Next: [Define Subdomains](04-how-to-define-subdomains.md) or [Breakdown Epics](06-how-to-breakdown-epics.md)
