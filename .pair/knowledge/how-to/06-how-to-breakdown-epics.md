# How to Breakdown Epics - AI-Assisted Guide

## Overview

Transform strategic initiatives into comprehensive epic breakdowns. Epics bridge initiatives and executable user stories, ensuring incremental value delivery in 2-4 sprint increments.

**Role**: Product Owner/Manager (Strategic Decomposition)
**Process**: AI proposes & structures, Developer validates & approves
**Skill**: When `/pair-process-plan-epics` is available, invoke it — it automates the operational steps of this workflow (initiative selection, epic analysis, creation via PM tool). This how-to describes the workflow and its HALT conditions.

## Skill Composition

This how-to orchestrates the `/pair-process-plan-epics` skill.

| Skill          | Purpose                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `/pair-process-plan-epics`  | Executes the full process: initiative selection, epic analysis, epic creation, completion.       |
| `/pair-capability-write-issue` | Composed by `/pair-process-plan-epics` — creates or updates epic issues in the PM tool.                      |

> **If skills are not installed**, follow the manual workflow below.

## Orchestration Flow

1. **Verify prerequisites**: bootstrap complete per [way-of-working.md](../../adoption/tech/way-of-working.md), initiatives exist in PM tool, bounded contexts recommended.
2. **Invoke `/pair-process-plan-epics`** with optional `$initiative` argument. The skill handles:
   - Existing epic detection (idempotent — skips already-created)
   - Initiative selection (highest-priority Todo, or specified `$initiative`)
   - Epic analysis (business objectives, user value, technical requirements, BC alignment)
   - Epic 0 assessment for new projects (bootstrap/foundation epic)
   - Epic creation via `/pair-capability-write-issue` with `$type: epic`
   - Coverage validation
3. **Developer validates** the epic breakdown when prompted.
4. **Re-invoke** to create missing epics for the same or different initiative.

## Manual Workflow (without skills)

### Phase 1: Foundation & Initiative Selection

- Verify bootstrap complete, PM tool configured
- Select initiative: P0 > P1 > P2 in Todo state
- **Epic 0 rule**: for new projects, always assess if bootstrap epic needed before functional epics

### Phase 2: Epic Analysis & Creation

- Analyze initiative components: objectives, user value, technical requirements
- Propose epic structure with 2-4 sprint sizing per epic
- Document each using [Epic Template](../guidelines/collaboration/templates/epic-template.md)
- Create in PM tool with proper initiative → epic hierarchy

### Phase 3: Completion

- Validate initiative objectives fully covered by epics
- Verify epic sequence and dependencies

## HALT Conditions

- **Bootstrap incomplete** — PM tool and tech context required
- **No Todo initiatives** — nothing to break down
- **Initiative not found** — invalid identifier
- **Developer rejects breakdown** — must resolve before creation

## Key Principles

- **Epic 0 first** — assess bootstrap needs before functional epics
- **2-4 sprint sizing** — manageable increments with measurable outcomes
- **End-to-end value** — each epic delivers complete user functionality
- **Priority-driven selection** — P0 > P1 > P2
- **Idempotent** — re-invocation detects existing epics, creates only missing ones

## References

- Template: [Epic Template](../guidelines/collaboration/templates/epic-template.md)
- Input: [Initiative Creation](03-how-to-create-and-prioritize-initiatives.md)
- PM Tool: [PM Tool Guidelines](../guidelines/collaboration/project-management-tool/README.md)
- Bootstrap: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)
- Next: [Breakdown User Stories](07-how-to-breakdown-user-stories.md)
