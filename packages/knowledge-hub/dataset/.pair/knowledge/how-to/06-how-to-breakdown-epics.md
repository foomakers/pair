# How to Breakdown Epics - AI-Assisted Guide

## Overview

Transform strategic initiatives into comprehensive epic breakdowns. Epics bridge initiatives and executable user stories, ensuring incremental value delivery in 2-4 sprint increments.

**Role**: Product Owner/Manager (Strategic Decomposition)
**Process**: AI proposes & structures, Developer validates & approves
**Skill**: When `/plan-epics` is available, invoke it — it automates the operational steps of this workflow (initiative selection, epic analysis, creation via PM tool). This how-to describes the workflow and its HALT conditions.

## Skill Composition

This how-to orchestrates the `/plan-epics` skill.

| Skill          | Purpose                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `/plan-epics`  | Executes the full process: initiative selection, epic analysis, epic creation, completion.       |
| `/write-issue` | Composed by `/plan-epics` — creates or updates epic issues in the PM tool.                      |
| `/map-subdomains` | Composed by `/plan-epics` — scoped domain placement for the approved epic breakdown's capability area(s). |

> **If skills are not installed**, follow the manual workflow below.

## Orchestration Flow

1. **Verify prerequisites**: bootstrap complete per [way-of-working.md](../../adoption/tech/way-of-working.md), initiatives exist in PM tool, bounded contexts recommended.
2. **Invoke `/plan-epics`** with optional `$initiative` argument. The skill handles:
   - Existing epic triage — each candidate is matched against the registry and classified `ALREADY EXISTS` (skip), `EXTEND` an existing epic, `CREATE` new, or flagged as an ambiguous match for the developer to decide (never silently picked)
   - Initiative selection (highest-priority Todo, or specified `$initiative`)
   - Epic analysis (business objectives, user value, technical requirements, BC alignment)
   - Epic 0 assessment for new projects (bootstrap/foundation epic)
   - Domain placement via `/map-subdomains`, scoped to the approved breakdown's capability area(s) — not full-catalog (see [Callers Matrix](../skills-guide.md#callers-matrix-scoped-capabilities))
   - Epic creation via `/write-issue` with `$type: epic`
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
- Check each candidate against existing epics in the same initiative: classify `ALREADY EXISTS` (exact match, skip), `EXTEND` an existing epic (substantial overlap), `CREATE` new (no overlap), or present an ambiguous match as a question with a recommendation — never silently pick one side
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
- **Ambiguous EXTEND-vs-CREATE match** — present as a question with a recommendation, wait for developer's call before writing

## Key Principles

- **Epic 0 first** — assess bootstrap needs before functional epics
- **2-4 sprint sizing** — manageable increments with measurable outcomes
- **End-to-end value** — each epic delivers complete user functionality
- **Priority-driven selection** — P0 > P1 > P2
- **Extend-or-create, not just idempotent** — re-invocation triages every candidate against the registry (already-exists / extend / create / ambiguous question) instead of only skipping exact duplicates

## References

- Template: [Epic Template](../guidelines/collaboration/templates/epic-template.md)
- Input: [Initiative Creation](03-how-to-create-and-prioritize-initiatives.md)
- PM Tool: [PM Tool Guidelines](../guidelines/collaboration/project-management-tool/README.md)
- Bootstrap: [Bootstrap Checklist](02-how-to-complete-bootstrap-checklist.md)
- Next: [Breakdown User Stories](07-how-to-breakdown-user-stories.md)
